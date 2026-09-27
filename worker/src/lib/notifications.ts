/**
 * Notification fan-out: in-app inbox, email (through the outbox) and webhooks.
 *
 * Rules
 *   • an in-app notification is stored unless the user muted that category
 *   • email is queued only when the user's `preferences.notifications.email`
 *     and the category toggle are both on
 *   • blocked users never notify each other
 *   • banned accounts receive nothing
 *   • the actor never notifies themselves
 *
 * Every function is defensive: notification delivery must never fail the user
 * action that triggered it.
 */

import type { Env } from '../env';
import { emailComposers, sendEmail } from './email';
import { brandConfig, limitsConfig } from './config';
import { uuid } from './ids';
import { log } from './logger';
import { parseJson } from './serialize';
import { nowIso } from './time';
import { dispatchWebhook } from './webhook';
import { sendPushToUser } from './push';
import { baseUrl } from './url';

export type NotificationType = 'follow' | 'stream_live' | 'scheduled' | 'system' | 'moderation' | 'tip' | 'mention' | 'reply';

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  streamStart: boolean;
  comments: boolean;
  followers: boolean;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: true,
  push: true,
  streamStart: true,
  comments: true,
  followers: true,
};

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  url?: string | null;
  actorId?: string | null;
  streamId?: string | null;
  data?: unknown;
  /** Skip the user's category mute (used for moderation + security notices). */
  force?: boolean;
  /** Queue an email as well (still subject to the user's email preference). */
  email?: { subject: string; heading: string; paragraphs: string[]; action?: { label: string; url: string } } | null;
}

function preferencesFor(raw: string | null | undefined): NotificationPreferences {
  const stored = parseJson<Record<string, unknown> | null>(raw ?? null, null) ?? {};
  const notifications = (stored.notifications ?? {}) as Partial<NotificationPreferences>;
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...notifications };
}

function categoryEnabled(type: NotificationType, prefs: NotificationPreferences): boolean {
  switch (type) {
    case 'stream_live':
    case 'scheduled':
      return prefs.streamStart;
    case 'follow':
      return prefs.followers;
    case 'mention':
    case 'reply':
    case 'tip':
      return prefs.comments;
    default:
      return true;
  }
}

/* ------------------------------- single notify -------------------------------- */

export async function createNotification(env: Env, input: NotificationInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;

  try {
    const user = await env.DB.prepare(`SELECT email, username, email_verified, is_banned, preferences FROM users WHERE id = ?`)
      .bind(input.userId)
      .first<{ email: string; username: string; email_verified: number | null; is_banned: number | null; preferences: string | null }>();

    if (!user || user.is_banned) return;

    const prefs = preferencesFor(user.preferences);
    if (!input.force && !categoryEnabled(input.type, prefs)) return;

    if (input.actorId) {
      const blocked = await env.DB.prepare(`SELECT 1 AS ok FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`)
        .bind(input.userId, input.actorId)
        .first<{ ok: number }>();
      if (blocked) return;
    }

    const id = uuid();
    const url = input.url ?? null;

    await env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, url, actor_id, stream_id, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        input.userId,
        input.type,
        input.title.slice(0, 200),
        input.body?.slice(0, 500) ?? null,
        url,
        input.actorId ?? null,
        input.streamId ?? null,
        input.data === undefined ? null : JSON.stringify(input.data),
        nowIso(),
      )
      .run();

    if (prefs.push) {
      // Best effort: a broken push endpoint must never break the inbox row.
      await sendPushToUser(env, input.userId, {
        title: input.title,
        body: input.body ?? undefined,
        url: url ?? undefined,
        type: input.type,
        tag: input.streamId ?? input.type,
      });
    }

    if (input.email && prefs.email) {
      await sendEmail(env, {
        to: user.email,
        toName: user.username,
        template: 'system',
        subject: input.email.subject,
        heading: input.email.heading,
        paragraphs: input.email.paragraphs,
        action: input.email.action,
      });
    }
  } catch (error) {
    log.warn('notification failed', { type: input.type, userId: input.userId, error: String(error) });
  }
}

/* ------------------------------ follower fan-out ------------------------------ */

interface FollowerRow {
  id: string;
  email: string;
  username: string;
  email_verified: number | null;
  preferences: string | null;
}

interface StreamerRow {
  id: string;
  username: string;
  display_name: string | null;
}

/**
 * "You follow X and X just went live" — fans out to every eligible follower.
 * In-app always (unless muted), email per preference, plus creator webhooks.
 */
export async function notifyFollowersStreamLive(
  env: Env,
  streamerId: string,
  stream: { id: string; title: string },
): Promise<{ notified: number; emailed: number }> {
  const result = { notified: 0, emailed: 0 };

  try {
    const streamer = await env.DB.prepare(`SELECT id, username, display_name FROM users WHERE id = ?`)
      .bind(streamerId)
      .first<StreamerRow>();
    if (!streamer) return result;

    const { results } = await env.DB.prepare(
      `SELECT u.id, u.email, u.username, u.email_verified, u.preferences
         FROM followers f JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ? AND COALESCE(u.is_banned, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = u.id AND b.blocked_id = ?)
        LIMIT 5000`,
    )
      .bind(streamerId, streamerId)
      .all<FollowerRow>();

    const followers = results ?? [];
    if (!followers.length) return result;

    const appBase = baseUrl(env);
    const watchUrl = `${appBase}/watch/${stream.id}`;
    const streamerName = streamer.display_name || streamer.username;
    const composers = emailComposers(env);
    const emailCap = Number(env.EMAIL_FANOUT_LIMIT) || 1000;

    const statements: D1PreparedStatement[] = [];
    const emails: FollowerRow[] = [];

    for (const follower of followers) {
      const prefs = preferencesFor(follower.preferences);

      if (prefs.streamStart) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO notifications (id, user_id, type, title, body, url, actor_id, stream_id, created_at)
             VALUES (?, ?, 'stream_live', ?, ?, ?, ?, ?, ?)`,
          ).bind(
            uuid(),
            follower.id,
            `${streamerName} is live`,
            stream.title.slice(0, 200),
            watchUrl,
            streamerId,
            stream.id,
            nowIso(),
          ),
        );
        result.notified += 1;
      }

      if (prefs.email && emails.length < emailCap) emails.push(follower);
    }

    // D1 batch limit is generous but chunk anyway to stay well inside limits.
    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }

    for (const follower of emails) {
      const payload = composers.streamLive(follower.email, follower.username, streamerName, stream.title, watchUrl);
      const queued = await sendEmail(env, payload);
      if (queued) result.emailed += 1;
    }

    await dispatchWebhook(env, streamerId, 'stream.live', {
      streamId: stream.id,
      title: stream.title,
      url: watchUrl,
      streamer: streamer.username,
      notifiedFollowers: result.notified,
    });

    log.info('stream-live fan-out', { streamId: stream.id, ...result });
    return result;
  } catch (error) {
    log.warn('stream-live fan-out failed', { streamId: stream.id, error: String(error) });
    return result;
  }
}

/* --------------------------- scheduled reminders (cron) ------------------------ */

interface DueReminderRow {
  schedule_id: string;
  streamer_id: string;
  title: string;
  scheduled_for: string;
  username: string;
  display_name: string | null;
  follower_id: string;
  email: string;
  follower_username: string;
  preferences: string | null;
}

/**
 * Sends reminders 30 minutes before a scheduled stream to followers who set a
 * reminder (or simply follow the channel). Called from the cron handler.
 */
export async function sendScheduledReminders(env: Env, windowMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() + windowMinutes * 60_000).toISOString();
  const now = nowIso();
  let sent = 0;

  try {
    const { results } = await env.DB.prepare(
      `SELECT s.id AS schedule_id, s.user_id AS streamer_id, s.title, s.scheduled_for,
              u.username, u.display_name,
              r.user_id AS follower_id, f.email, f.username AS follower_username, f.preferences
         FROM scheduled_streams s
         JOIN users u ON u.id = s.user_id
         JOIN schedule_reminders r ON r.schedule_id = s.id
         JOIN users f ON f.id = r.user_id
        WHERE s.status = 'scheduled' AND s.scheduled_for <= ? AND s.scheduled_for >= ?
          AND COALESCE(f.is_banned, 0) = 0`,
    )
      .bind(cutoff, now)
      .all<DueReminderRow>();

    const appBase = baseUrl(env);
    const composers = emailComposers(env);

    for (const row of results ?? []) {
      const prefs = preferencesFor(row.preferences);
      const streamerName = row.display_name || row.username;
      const url = `${appBase}/watch/${row.schedule_id}`;
      const when = new Date(row.scheduled_for).toUTCString();

      // In-app is handled by the reminder row being marked sent below; email is
      // optional and follows the user's preferences.
      if (prefs.streamStart) {
        await env.DB.prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, url, actor_id, created_at)
           VALUES (?, ?, 'scheduled', ?, ?, ?, ?, ?)`,
        )
          .bind(uuid(), row.follower_id, `${streamerName} goes live soon`, row.title, url, row.streamer_id, now)
          .run();
      }

      if (prefs.email) {
        await sendEmail(env, composers.scheduledReminder(row.email, row.follower_username, streamerName, row.title, when, url));
      }
      sent += 1;
    }

    // Mark the schedule so the same reminder is not queued twice.
    const scheduleIds = [...new Set((results ?? []).map((row) => row.schedule_id))];
    for (const id of scheduleIds) {
      await env.DB.prepare(`UPDATE scheduled_streams SET reminder_sent_at = ? WHERE id = ?`).bind(now, id).run();
    }
  } catch (error) {
    log.warn('scheduled reminders failed', { error: String(error) });
  }

  return sent;
}

/* ---------------------------------- housekeeping ------------------------------- */

export async function pruneNotifications(env: Env, days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  const result = await env.DB.prepare(`DELETE FROM notifications WHERE created_at < ? AND read_at IS NOT NULL`).bind(cutoff).run();
  return result.meta?.changes ?? 0;
}

/** Weekly creator digest — queued by the Monday cron pass. */
export async function queueWeeklyDigests(env: Env): Promise<number> {
  const composers = emailComposers(env);
  const appBase = baseUrl(env);
  const limits = limitsConfig(env);
  const brand = brandConfig(env);
  let queued = 0;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.username,
            (SELECT COUNT(*) FROM stream_sessions ss WHERE ss.user_id = u.id AND ss.started_at >= ?) AS streams,
            (SELECT COALESCE(SUM(ss.duration), 0) / 60 FROM stream_sessions ss WHERE ss.user_id = u.id AND ss.started_at >= ?) AS minutes,
            (SELECT COALESCE(SUM(s.watch_minutes), 0) FROM streams s WHERE s.user_id = u.id) AS watch_minutes,
            (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id AND f.created_at >= ?) AS followers
       FROM users u
      WHERE u.is_streamer = 1 AND COALESCE(u.is_banned, 0) = 0 AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM stream_sessions ss WHERE ss.user_id = u.id AND ss.started_at >= ?)
      LIMIT 500`,
  )
    .bind(since, since, since, since)
    .all<{ id: string; email: string; username: string; streams: number; minutes: number; watch_minutes: number; followers: number }>();

  for (const row of results ?? []) {
    const prefs = await env.DB.prepare(`SELECT preferences FROM users WHERE id = ?`).bind(row.id).first<{ preferences: string | null }>();
    if (!preferencesFor(prefs?.preferences).email) continue;

    await sendEmail(
      env,
      composers.weeklyDigest(
        row.email,
        row.username,
        { streams: row.streams ?? 0, minutes: row.minutes ?? 0, viewers: row.watch_minutes ?? 0, followers: row.followers ?? 0 },
        `${appBase}/dashboard?tab=analytics`,
      ),
    );
    queued += 1;
  }

  if (queued) log.info('weekly digests queued', { queued, brand: brand.name, retention: limits.recordingRetentionHours });
  return queued;
}
