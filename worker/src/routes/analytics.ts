/**
 * Analytics for creators and watch-time tracking for viewers.
 *
 *   POST /api/analytics/watch/start      begin a watch session (live or VOD)
 *   POST /api/analytics/watch/heartbeat  accumulate watch seconds
 *   POST /api/analytics/watch/end        close the session
 *   GET  /api/analytics/overview         creator dashboard (totals + series)
 *   GET  /api/analytics/streams/:id      per-broadcast detail
 *   GET  /api/analytics/platform         platform-wide (admin only)
 *
 * Raw events land in `watch_sessions`; the hourly cron folds them into
 * `analytics_daily` (see `lib/analytics.ts`).
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { optionalAuth, requireAuth } from '../lib/auth';
import { badRequest, forbidden, int, notFound, readJson } from '../lib/http';
import { endWatchSession, platformAnalytics, streamAnalytics, streamerOverview, touchWatchSession, startWatchSession } from '../lib/analytics';
import { deviceClass } from '../lib/url';

export const analyticsRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

/* ------------------------------- watch sessions ------------------------------- */

analyticsRoutes.post('/watch/start', optionalAuth, async (c) => {
  const auth = c.get('authUser');
  const body = await readJson(c);

  const streamId = typeof body.streamId === 'string' ? body.streamId : null;
  const recordingId = typeof body.recordingId === 'string' ? body.recordingId : null;
  if (!streamId && !recordingId) throw badRequest('streamId or recordingId is required');

  if (streamId) {
    const exists = await c.env.DB.prepare(`SELECT 1 AS ok FROM streams WHERE id = ?`).bind(streamId).first<{ ok: number }>();
    if (!exists) throw notFound('Stream not found');
  }

  const sessionId = await startWatchSession(c.env, {
    streamId,
    recordingId,
    userId: auth?.id ?? null,
    ip: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
    country: c.req.header('CF-IPCountry'),
    device: typeof body.device === 'string' ? body.device.slice(0, 20) : deviceClass(c.req.header('User-Agent')),
    referrer: c.req.header('Referer'),
  });

  return c.json({ sessionId }, 201);
});

analyticsRoutes.post('/watch/heartbeat', async (c) => {
  const body = await readJson(c);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) throw badRequest('sessionId is required');

  const seconds = int(body.seconds, 30, 1, 300);
  await touchWatchSession(c.env, sessionId, seconds);
  return c.json({ success: true });
});

analyticsRoutes.post('/watch/end', async (c) => {
  const body = await readJson(c);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) throw badRequest('sessionId is required');

  await endWatchSession(c.env, sessionId, int(body.seconds, 0, 0, 86_400));
  return c.json({ success: true });
});

/* ---------------------------------- creator ---------------------------------- */

analyticsRoutes.get('/overview', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const days = int(c.req.query('days'), 30, 1, 365);
  const overview = await streamerOverview(c.env, auth.id, days);

  // Upcoming schedule lives next to the numbers on the dashboard.
  const { results: upcoming } = await c.env.DB.prepare(
    `SELECT id, title, scheduled_for, status FROM scheduled_streams
      WHERE user_id = ? AND status = 'scheduled' AND scheduled_for > ?
      ORDER BY scheduled_for ASC LIMIT 5`,
  )
    .bind(auth.id, new Date().toISOString())
    .all<{ id: string; title: string; scheduled_for: string; status: string }>();

  return c.json({
    ...overview,
    upcoming: (upcoming ?? []).map((row) => ({ id: row.id, title: row.title, scheduledFor: row.scheduled_for, status: row.status })),
  });
});

analyticsRoutes.get('/streams/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('id');

  const owner = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
  if (!owner) throw notFound('Stream not found');
  if (owner.user_id !== auth.id && !auth.isAdmin) throw forbidden('You do not own this stream');

  return c.json(await streamAnalytics(c.env, streamId));
});

analyticsRoutes.get('/platform', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  if (!auth.isAdmin) throw forbidden('Administrator access required');
  return c.json(await platformAnalytics(c.env));
});

/* ------------------------------- watch history -------------------------------- */

/** What the signed-in viewer watched recently (used by "Continue watching"). */
analyticsRoutes.get('/history', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const limit = int(c.req.query('limit'), 20, 1, 100);

  const { results } = await c.env.DB.prepare(
    `SELECT ws.id, ws.stream_id, ws.recording_id, ws.joined_at, ws.seconds_watched, ws.left_at,
            s.title AS stream_title, s.thumbnail_url AS stream_thumbnail,
            r.title AS recording_title, r.thumbnail_url AS recording_thumbnail, r.url AS recording_url
       FROM watch_sessions ws
       LEFT JOIN streams s ON s.id = ws.stream_id
       LEFT JOIN recordings r ON r.id = ws.recording_id
      WHERE ws.user_id = ? AND (ws.stream_id IS NOT NULL OR ws.recording_id IS NOT NULL)
      GROUP BY COALESCE(ws.recording_id, ws.stream_id)
      ORDER BY ws.joined_at DESC LIMIT ?`,
  )
    .bind(auth.id, limit)
    .all<Record<string, unknown>>();

  return c.json({
    history: (results ?? []).map((row) => ({
      sessionId: row.id,
      streamId: row.stream_id,
      recordingId: row.recording_id,
      title: row.recording_title ?? row.stream_title ?? 'Untitled',
      thumbnail: row.recording_thumbnail ?? row.stream_thumbnail ?? null,
      url: row.recording_url ?? null,
      watchedSeconds: row.seconds_watched ?? 0,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
    })),
  });
});

/** Aggregate stats for a public profile ("total watch time", "streams"). */
analyticsRoutes.get('/users/:id', async (c) => {
  const userId = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS sessions, COALESCE(MAX(peak_viewers), 0) AS peak, COALESCE(SUM(duration), 0) AS seconds
       FROM stream_sessions WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ sessions: number; peak: number; seconds: number }>();

  const followers = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM followers WHERE following_id = ?`).bind(userId).first<{ count: number }>();

  return c.json({
    stats: {
      sessions: row?.sessions ?? 0,
      peakViewers: row?.peak ?? 0,
      hoursStreamed: Math.round(((row?.seconds ?? 0) / 3600) * 10) / 10,
      followers: followers?.count ?? 0,
    },
  });
});

/** Exposed for the tests + admin export: raw daily rows. */
analyticsRoutes.get('/daily', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const days = int(c.req.query('days'), 30, 1, 365);
  const from = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(`SELECT * FROM analytics_daily WHERE user_id = ? AND day >= ? ORDER BY day DESC`)
    .bind(auth.id, from)
    .all<Record<string, unknown>>();

  return c.json({ days: (results ?? []).map((row) => ({ ...row, tips_cents: row.tips_cents ?? 0 })) });
});
