/**
 * Product analytics for creators.
 *
 * Raw events (`watch_sessions`) are written as viewers join and leave; the
 * hourly cron folds them into `analytics_daily` so dashboards stay fast no
 * matter how much traffic a stream got. Privacy: anonymous viewers are tracked
 * with a salted, truncated hash that rotates monthly and cannot be reversed.
 */

import type { Env } from '../env';
import { uuid, sha256Hex } from './ids';
import { log } from './logger';
import { nowIso } from './time';

export interface WatchContext {
  streamId?: string | null;
  recordingId?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
  device?: string | null;
  referrer?: string | null;
}

/**
 * Stable-but-anonymous viewer id. Salted with the deployment secret and rotated
 * monthly, so it cannot be linked back to a person or tracked long-term.
 */
export async function viewerHash(env: Env, context: WatchContext): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const material = `${env.JWT_SECRET ?? 'dev'}|${month}|${context.ip ?? 'unknown'}|${context.userAgent ?? 'unknown'}`;
  return (await sha256Hex(material)).slice(0, 24);
}

export async function startWatchSession(env: Env, context: WatchContext): Promise<string> {
  const id = uuid();
  const hash = context.userId ? null : await viewerHash(env, context);

  await env.DB.prepare(
    `INSERT INTO watch_sessions (id, stream_id, recording_id, user_id, viewer_hash, is_authenticated, country, device, referrer, joined_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      context.streamId ?? null,
      context.recordingId ?? null,
      context.userId ?? null,
      hash,
      context.userId ? 1 : 0,
      context.country ?? null,
      context.device ?? 'unknown',
      context.referrer ?? null,
      nowIso(),
      nowIso(),
    )
    .run();

  // Cheap counters on the stream row (also used by the browse cards).
  if (context.streamId) {
    await env.DB.prepare(
      `UPDATE streams
          SET total_views = COALESCE(total_views, 0) + 1,
              unique_viewers = COALESCE(unique_viewers, 0) + 1,
              updated_at = ?
        WHERE id = ?`,
    )
      .bind(nowIso(), context.streamId)
      .run();
  }

  if (context.recordingId) {
    await env.DB.prepare(`UPDATE recordings SET views = COALESCE(views, 0) + 1 WHERE id = ?`).bind(context.recordingId).run();
  }

  return id;
}

/** Periodic heartbeat from the player — accumulates watch time. */
export async function touchWatchSession(env: Env, sessionId: string, seconds: number): Promise<void> {
  const safeSeconds = Math.max(1, Math.min(Math.round(seconds), 300));
  await env.DB.prepare(
    `UPDATE watch_sessions
        SET seconds_watched = COALESCE(seconds_watched, 0) + ?, last_seen_at = ?
      WHERE id = ?`,
  )
    .bind(safeSeconds, nowIso(), sessionId)
    .run();

  await env.DB.prepare(
    `UPDATE streams
        SET watch_minutes = COALESCE(watch_minutes, 0) + MAX(1, ? / 60)
      WHERE id = (SELECT stream_id FROM watch_sessions WHERE id = ?)`,
  )
    .bind(safeSeconds, sessionId)
    .run();
}

export async function endWatchSession(env: Env, sessionId: string, seconds = 0): Promise<void> {
  const safeSeconds = Math.max(0, Math.min(Math.round(seconds), 24 * 3600));
  await env.DB.prepare(
    `UPDATE watch_sessions SET left_at = ?, seconds_watched = COALESCE(seconds_watched, 0) + ?, last_seen_at = ? WHERE id = ? AND left_at IS NULL`,
  )
    .bind(nowIso(), safeSeconds, nowIso(), sessionId)
    .run();
}

/* ---------------------------------- rollups ---------------------------------- */

/**
 * Folds raw rows into `analytics_daily`. Idempotent — safe to re-run for the
 * last few days on every cron tick.
 */
export async function rollupAnalytics(env: Env, days = 3): Promise<number> {
  const from = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
  let written = 0;

  // Streams + watch time per creator per day.
  const { results: rows } = await env.DB.prepare(
    `SELECT s.user_id AS user_id,
            substr(ws.joined_at, 1, 10) AS day,
            COUNT(DISTINCT ws.id) AS viewers,
            COALESCE(SUM(ws.seconds_watched), 0) / 60 AS watch_minutes
       FROM watch_sessions ws
       JOIN streams s ON s.id = ws.stream_id
      WHERE ws.joined_at >= ?
      GROUP BY s.user_id, day`,
  )
    .bind(from)
    .all<{ user_id: string; day: string; viewers: number; watch_minutes: number }>();

  for (const row of rows ?? []) {
    await upsertDaily(env, row.user_id, row.day, {
      unique_viewers: row.viewers ?? 0,
      watch_minutes: Math.round(row.watch_minutes ?? 0),
    });
    written += 1;
  }

  // Broadcasts + peak viewers per creator per day.
  const { results: sessions } = await env.DB.prepare(
    `SELECT user_id, substr(started_at, 1, 10) AS day,
            COUNT(*) AS streams_started,
            COALESCE(SUM(duration), 0) / 60 AS minutes_streamed,
            COALESCE(MAX(peak_viewers), 0) AS peak_viewers
       FROM stream_sessions
      WHERE started_at >= ?
      GROUP BY user_id, day`,
  )
    .bind(from)
    .all<{ user_id: string; day: string; streams_started: number; minutes_streamed: number; peak_viewers: number }>();

  for (const row of sessions ?? []) {
    await upsertDaily(env, row.user_id, row.day, {
      streams_started: row.streams_started ?? 0,
      minutes_streamed: Math.round(row.minutes_streamed ?? 0),
      peak_viewers: row.peak_viewers ?? 0,
    });
    written += 1;
  }

  // New followers per creator per day.
  const { results: followers } = await env.DB.prepare(
    `SELECT following_id AS user_id, substr(created_at, 1, 10) AS day, COUNT(*) AS total
       FROM followers WHERE created_at >= ? GROUP BY following_id, day`,
  )
    .bind(from)
    .all<{ user_id: string; day: string; total: number }>();

  for (const row of followers ?? []) {
    await upsertDaily(env, row.user_id, row.day, { new_followers: row.total ?? 0 });
    written += 1;
  }

  // Chat volume per creator per day.
  const { results: chat } = await env.DB.prepare(
    `SELECT s.user_id AS user_id, substr(m.created_at, 1, 10) AS day, COUNT(*) AS total
       FROM chat_messages m JOIN streams s ON s.id = m.stream_id
      WHERE m.created_at >= ? GROUP BY s.user_id, day`,
  )
    .bind(from)
    .all<{ user_id: string; day: string; total: number }>();

  for (const row of chat ?? []) {
    await upsertDaily(env, row.user_id, row.day, { chat_messages: row.total ?? 0 });
    written += 1;
  }

  if (written) log.info('analytics rollup', { rows: written, from, days });
  return written;
}

async function upsertDaily(env: Env, userId: string, day: string, values: Record<string, number>): Promise<void> {
  const columns = Object.keys(values);
  if (!columns.length) return;

  const inserts = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.map((column) => `${column} = excluded.${column}`).join(', ');

  await env.DB.prepare(
    `INSERT INTO analytics_daily (id, user_id, day, ${inserts}, updated_at)
     VALUES (?, ?, ?, ${placeholders}, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET ${updates}, updated_at = excluded.updated_at`,
  )
    .bind(uuid(), userId, day, ...columns.map((column) => values[column]), nowIso())
    .run();
}

/* --------------------------------- overviews --------------------------------- */

export interface AnalyticsOverview {
  range: { days: number; from: string; to: string };
  totals: {
    streams: number;
    minutesStreamed: number;
    peakViewers: number;
    uniqueViewers: number;
    watchMinutes: number;
    newFollowers: number;
    chatMessages: number;
    tipsCents: number;
  };
  series: Array<{
    day: string;
    streams: number;
    minutesStreamed: number;
    peakViewers: number;
    uniqueViewers: number;
    watchMinutes: number;
    newFollowers: number;
    chatMessages: number;
    tipsCents: number;
  }>;
  topStreams: Array<{ streamId: string; title: string; viewerCount: number; peakViewers: number; watchMinutes: number; startedAt: string | null }>;
  retention: { followers: number; sessions: number };
}

export async function streamerOverview(env: Env, userId: string, days = 30): Promise<AnalyticsOverview> {
  const from = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);

  const totalsRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(streams_started), 0) AS streams,
            COALESCE(SUM(minutes_streamed), 0) AS minutes_streamed,
            COALESCE(MAX(peak_viewers), 0) AS peak_viewers,
            COALESCE(SUM(unique_viewers), 0) AS unique_viewers,
            COALESCE(SUM(watch_minutes), 0) AS watch_minutes,
            COALESCE(SUM(new_followers), 0) AS new_followers,
            COALESCE(SUM(chat_messages), 0) AS chat_messages,
            COALESCE(SUM(tips_cents), 0) AS tips_cents
       FROM analytics_daily WHERE user_id = ? AND day >= ?`,
  )
    .bind(userId, from)
    .first<Record<string, number>>();

  const { results: series } = await env.DB.prepare(
    `SELECT day, streams_started, minutes_streamed, peak_viewers, unique_viewers, watch_minutes, new_followers, chat_messages, tips_cents
       FROM analytics_daily WHERE user_id = ? AND day >= ? ORDER BY day ASC`,
  )
    .bind(userId, from)
    .all<Record<string, number | string>>();

  const { results: top } = await env.DB.prepare(
    `SELECT id, title, viewer_count, peak_viewers, watch_minutes, started_at
       FROM streams WHERE user_id = ? AND started_at IS NOT NULL
      ORDER BY COALESCE(peak_viewers, 0) DESC, COALESCE(watch_minutes, 0) DESC LIMIT 5`,
  )
    .bind(userId)
    .all<{ id: string; title: string; viewer_count: number | null; peak_viewers: number | null; watch_minutes: number | null; started_at: string | null }>();

  const followers = await env.DB.prepare(`SELECT COUNT(*) AS count FROM followers WHERE following_id = ?`).bind(userId).first<{ count: number }>();
  const sessions = await env.DB.prepare(`SELECT COUNT(*) AS count FROM stream_sessions WHERE user_id = ?`).bind(userId).first<{ count: number }>();

  return {
    range: { days, from, to: new Date().toISOString().slice(0, 10) },
    totals: {
      streams: totalsRow?.streams ?? 0,
      minutesStreamed: totalsRow?.minutes_streamed ?? 0,
      peakViewers: totalsRow?.peak_viewers ?? 0,
      uniqueViewers: totalsRow?.unique_viewers ?? 0,
      watchMinutes: totalsRow?.watch_minutes ?? 0,
      newFollowers: totalsRow?.new_followers ?? 0,
      chatMessages: totalsRow?.chat_messages ?? 0,
      tipsCents: totalsRow?.tips_cents ?? 0,
    },
    series: (series ?? []).map((row) => ({
      day: String(row.day),
      streams: Number(row.streams_started ?? 0),
      minutesStreamed: Number(row.minutes_streamed ?? 0),
      peakViewers: Number(row.peak_viewers ?? 0),
      uniqueViewers: Number(row.unique_viewers ?? 0),
      watchMinutes: Number(row.watch_minutes ?? 0),
      newFollowers: Number(row.new_followers ?? 0),
      chatMessages: Number(row.chat_messages ?? 0),
      tipsCents: Number(row.tips_cents ?? 0),
    })),
    topStreams: (top ?? []).map((row) => ({
      streamId: row.id,
      title: row.title,
      viewerCount: row.viewer_count ?? 0,
      peakViewers: row.peak_viewers ?? 0,
      watchMinutes: row.watch_minutes ?? 0,
      startedAt: row.started_at,
    })),
    retention: { followers: followers?.count ?? 0, sessions: sessions?.count ?? 0 },
  };
}

export interface StreamAnalytics {
  streamId: string;
  viewers: number;
  uniqueViewers: number;
  peakViewers: number;
  watchMinutes: number;
  chatMessages: number;
  newFollowers: number;
  avgWatchSeconds: number;
  series: Array<{ at: string; viewers: number; bandwidth: number }>;
}

export async function streamAnalytics(env: Env, streamId: string): Promise<StreamAnalytics> {
  const stream = await env.DB.prepare(
    `SELECT id, viewer_count, peak_viewers, total_views, unique_viewers, watch_minutes FROM streams WHERE id = ?`,
  )
    .bind(streamId)
    .first<{ id: string; viewer_count: number | null; peak_viewers: number | null; total_views: number | null; unique_viewers: number | null; watch_minutes: number | null }>();

  const chat = await env.DB.prepare(`SELECT COUNT(*) AS count FROM chat_messages WHERE stream_id = ?`).bind(streamId).first<{ count: number }>();
  const follow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM stream_sessions WHERE stream_id = ? AND recording_url IS NOT NULL`,
  )
    .bind(streamId)
    .first<{ count: number }>();
  const watch = await env.DB.prepare(
    `SELECT COALESCE(SUM(seconds_watched), 0) AS seconds, COUNT(*) AS sessions FROM watch_sessions WHERE stream_id = ?`,
  )
    .bind(streamId)
    .first<{ seconds: number; sessions: number }>();

  const { results: series } = await env.DB.prepare(
    `SELECT timestamp, viewer_count, bandwidth FROM stream_stats WHERE stream_id = ? ORDER BY timestamp ASC LIMIT 720`,
  )
    .bind(streamId)
    .all<{ timestamp: string; viewer_count: number | null; bandwidth: number | null }>();

  const sessions = watch?.sessions ?? 0;
  const seconds = watch?.seconds ?? 0;

  return {
    streamId,
    viewers: stream?.viewer_count ?? 0,
    uniqueViewers: stream?.unique_viewers ?? 0,
    peakViewers: stream?.peak_viewers ?? 0,
    watchMinutes: stream?.watch_minutes ?? 0,
    chatMessages: chat?.count ?? 0,
    newFollowers: follow?.count ?? 0,
    avgWatchSeconds: sessions > 0 ? Math.round(seconds / sessions) : 0,
    series: (series ?? []).map((row) => ({
      at: row.timestamp,
      viewers: row.viewer_count ?? 0,
      bandwidth: row.bandwidth ?? 0,
    })),
  };
}

/* ------------------------------ platform analytics ---------------------------- */

export interface PlatformAnalytics {
  users: { total: number; newToday: number; streamers: number; banned: number };
  streams: { live: number; total: number; sessionsToday: number };
  engagement: { watchMinutesToday: number; chatMessagesToday: number; followsToday: number };
  moderation: { openReports: number; resolvedReports: number; activeBans: number };
  email: { queued: number; sent24h: number; failed: number };
  createdAt: string;
}

export async function platformAnalytics(env: Env): Promise<PlatformAnalytics> {
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00.000Z`;
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const one = async (sql: string, ...binds: unknown[]): Promise<number> => {
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ count: number }>();
    return row?.count ?? 0;
  };

  return {
    users: {
      total: await one(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`),
      newToday: await one(`SELECT COUNT(*) AS count FROM users WHERE created_at >= ?`, dayStart),
      streamers: await one(`SELECT COUNT(*) AS count FROM users WHERE is_streamer = 1 AND deleted_at IS NULL`),
      banned: await one(`SELECT COUNT(*) AS count FROM users WHERE is_banned = 1`),
    },
    streams: {
      live: await one(`SELECT COUNT(*) AS count FROM streams WHERE is_live = 1`),
      total: await one(`SELECT COUNT(*) AS count FROM streams`),
      sessionsToday: await one(`SELECT COUNT(*) AS count FROM stream_sessions WHERE started_at >= ?`, dayStart),
    },
    engagement: {
      watchMinutesToday: await one(`SELECT COALESCE(SUM(seconds_watched), 0) / 60 AS count FROM watch_sessions WHERE joined_at >= ?`, dayStart),
      chatMessagesToday: await one(`SELECT COUNT(*) AS count FROM chat_messages WHERE created_at >= ?`, dayStart),
      followsToday: await one(`SELECT COUNT(*) AS count FROM followers WHERE created_at >= ?`, dayStart),
    },
    moderation: {
      openReports: await one(`SELECT COUNT(*) AS count FROM reports WHERE status IN ('open', 'reviewing')`),
      resolvedReports: await one(`SELECT COUNT(*) AS count FROM reports WHERE status IN ('resolved', 'dismissed')`),
      activeBans: await one(`SELECT COUNT(*) AS count FROM bans WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`, nowIso()),
    },
    email: {
      queued: await one(`SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'queued'`),
      sent24h: await one(`SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'sent' AND sent_at >= ?`, yesterday),
      failed: await one(`SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'failed'`),
    },
    createdAt: nowIso(),
  };
}
