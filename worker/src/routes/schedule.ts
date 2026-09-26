/**
 * Scheduled broadcasts.
 *
 *   GET    /api/schedule                upcoming schedule (public, filter by user)
 *   GET    /api/schedule/mine           the creator's own schedule (all states)
 *   POST   /api/schedule                create a scheduled session
 *   PATCH  /api/schedule/:id            update / reschedule
 *   DELETE /api/schedule/:id            cancel
 *   POST   /api/schedule/:id/remind     toggle "remind me" for the current user
 *   POST   /api/schedule/:id/go-live    turn the scheduled slot into a live stream
 *
 * Followers who asked for a reminder get an in-app notification + email 30
 * minutes before the slot (see `sendScheduledReminders` in lib/notifications).
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { optionalAuth, requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, int, notFound, readJson, trimOrNull } from '../lib/http';
import { limitsConfig } from '../lib/config';
import { uuid } from '../lib/ids';
import { nowIso } from '../lib/time';
import { parseJson } from '../lib/serialize';
import { dispatchWebhook } from '../lib/webhook';
import { baseUrl } from '../lib/url';

export const scheduleRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

interface ScheduleRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string | null;
  thumbnail_url: string | null;
  scheduled_for: string;
  duration_minutes: number | null;
  timezone: string | null;
  status: string;
  stream_id: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  reminder_count?: number | null;
}

const SCHEDULE_SELECT = `s.*, u.username, u.display_name, u.avatar_url,
  (SELECT COUNT(*) FROM schedule_reminders r WHERE r.schedule_id = s.id) AS reminder_count`;

function scheduleDto(row: ScheduleRow, viewerId?: string | null, isReminded = false) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: parseJson<string[]>(row.tags, []),
    thumbnail: row.thumbnail_url,
    scheduledFor: row.scheduled_for,
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    status: row.status,
    streamId: row.stream_id,
    reminderCount: row.reminder_count ?? 0,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    userId: row.user_id,
    username: row.username ?? undefined,
    displayName: row.display_name ?? undefined,
    userAvatar: row.avatar_url ?? undefined,
    isOwner: !!viewerId && viewerId === row.user_id,
    isReminded,
  };
}

/* ---------------------------------- listing ----------------------------------- */

scheduleRoutes.get('/', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const limit = int(c.req.query('limit'), 20, 1, 100);
  const userId = c.req.query('userId');

  const where = [`s.status = 'scheduled'`, `s.scheduled_for > ?`];
  const binds: unknown[] = [new Date(Date.now() - 60 * 60_000).toISOString()];
  if (userId) {
    where.push('s.user_id = ?');
    binds.push(userId);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_SELECT} FROM scheduled_streams s JOIN users u ON u.id = s.user_id
      WHERE ${where.join(' AND ')} ORDER BY s.scheduled_for ASC LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<ScheduleRow>();

  let reminded = new Set<string>();
  if (viewerId) {
    const { results: rows } = await c.env.DB.prepare(`SELECT schedule_id FROM schedule_reminders WHERE user_id = ?`)
      .bind(viewerId)
      .all<{ schedule_id: string }>();
    reminded = new Set((rows ?? []).map((row) => row.schedule_id));
  }

  return c.json({ scheduled: (results ?? []).map((row) => scheduleDto(row, viewerId, reminded.has(row.id))) });
});

scheduleRoutes.get('/mine', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_SELECT} FROM scheduled_streams s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ? ORDER BY s.scheduled_for DESC LIMIT 100`,
  )
    .bind(auth.id)
    .all<ScheduleRow>();

  return c.json({ scheduled: (results ?? []).map((row) => scheduleDto(row, auth.id)) });
});

/* --------------------------------- creation ---------------------------------- */

scheduleRoutes.post('/', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  if (!auth.isStreamer) throw forbidden('Enable streamer mode before scheduling a broadcast');

  const limits = limitsConfig(c.env);
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM scheduled_streams WHERE user_id = ? AND status = 'scheduled'`)
    .bind(auth.id)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= limits.maxScheduledPerUser) {
    throw conflict(`You already have ${limits.maxScheduledPerUser} scheduled broadcasts`, 'schedule_limit');
  }

  const body = await readJson(c);
  const title = trimOrNull(body.title, limits.maxTitleLength);
  if (!title) throw badRequest('A title is required');

  const scheduledFor = typeof body.scheduledFor === 'string' ? new Date(body.scheduledFor) : new Date(NaN);
  if (Number.isNaN(scheduledFor.getTime())) throw badRequest('scheduledFor must be a valid ISO date');
  if (scheduledFor.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future');

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, limits.maxTags)
    : String(body.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, limits.maxTags);

  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO scheduled_streams (id, user_id, title, description, category, tags, thumbnail_url, scheduled_for, duration_minutes, timezone, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
  )
    .bind(
      id,
      auth.id,
      title,
      trimOrNull(body.description, 2000),
      trimOrNull(body.category, 80),
      JSON.stringify(tags),
      trimOrNull(body.thumbnailUrl, 2000),
      scheduledFor.toISOString(),
      body.durationMinutes === undefined ? null : int(body.durationMinutes, 60, 15, 24 * 60),
      trimOrNull(body.timezone, 60),
      nowIso(),
    )
    .run();

  await dispatchWebhook(c.env, auth.id, 'stream.scheduled', {
    scheduleId: id,
    title,
    scheduledFor: scheduledFor.toISOString(),
    url: `${baseUrl(c.env, c.req.url)}/schedule`,
  });

  const row = await c.env.DB.prepare(`SELECT ${SCHEDULE_SELECT} FROM scheduled_streams s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
    .bind(id)
    .first<ScheduleRow>();

  return c.json({ scheduled: row ? scheduleDto(row, auth.id) : null }, 201);
});

/* ---------------------------------- updates ---------------------------------- */

scheduleRoutes.patch('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const existing = await c.env.DB.prepare(`SELECT user_id, status FROM scheduled_streams WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ user_id: string; status: string }>();
  if (!existing) throw notFound('Scheduled broadcast not found');
  if (existing.user_id !== auth.id) throw forbidden('You do not own this schedule');
  if (existing.status !== 'scheduled') throw badRequest('Only upcoming broadcasts can be edited');

  const limits = limitsConfig(c.env);
  const body = await readJson(c);
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = trimOrNull(body.title, limits.maxTitleLength);
    if (!title) throw badRequest('Title cannot be empty');
    updates.title = title;
  }
  if (body.description !== undefined) updates.description = trimOrNull(body.description, 2000);
  if (body.category !== undefined) updates.category = trimOrNull(body.category, 80);
  if (body.thumbnailUrl !== undefined) updates.thumbnail_url = trimOrNull(body.thumbnailUrl, 2000);
  if (body.durationMinutes !== undefined) updates.duration_minutes = int(body.durationMinutes, 60, 15, 24 * 60);
  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, limits.maxTags)
      : String(body.tags)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, limits.maxTags);
    updates.tags = JSON.stringify(tags);
  }
  if (body.scheduledFor !== undefined) {
    const when = new Date(String(body.scheduledFor));
    if (Number.isNaN(when.getTime())) throw badRequest('scheduledFor must be a valid ISO date');
    if (when.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future');
    updates.scheduled_for = when.toISOString();
    updates.reminder_sent_at = null; // reschedule re-arms reminders
  }

  if (!Object.keys(updates).length) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE scheduled_streams SET ${assignments}, updated_at = ? WHERE id = ?`)
    .bind(...Object.values(updates), nowIso(), c.req.param('id'))
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SCHEDULE_SELECT} FROM scheduled_streams s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
    .bind(c.req.param('id'))
    .first<ScheduleRow>();

  return c.json({ scheduled: row ? scheduleDto(row, auth.id) : null });
});

scheduleRoutes.delete('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT user_id FROM scheduled_streams WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ user_id: string }>();
  if (!row) throw notFound('Scheduled broadcast not found');
  if (row.user_id !== auth.id && !auth.isAdmin) throw forbidden('You do not own this schedule');

  await c.env.DB.prepare(`UPDATE scheduled_streams SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), c.req.param('id'))
    .run();

  return c.json({ success: true });
});

/* --------------------------------- reminders --------------------------------- */

scheduleRoutes.post('/:id/remind', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const schedule = await c.env.DB.prepare(`SELECT id, user_id, status FROM scheduled_streams WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; user_id: string; status: string }>();
  if (!schedule) throw notFound('Scheduled broadcast not found');
  if (schedule.status !== 'scheduled') throw badRequest('This broadcast is no longer upcoming');
  if (schedule.user_id === auth.id) throw badRequest('You are the broadcaster of this session');

  const existing = await c.env.DB.prepare(`SELECT 1 AS ok FROM schedule_reminders WHERE schedule_id = ? AND user_id = ?`)
    .bind(schedule.id, auth.id)
    .first<{ ok: number }>();

  if (existing) {
    await c.env.DB.prepare(`DELETE FROM schedule_reminders WHERE schedule_id = ? AND user_id = ?`).bind(schedule.id, auth.id).run();
    return c.json({ success: true, reminded: false });
  }

  await c.env.DB.prepare(`INSERT INTO schedule_reminders (id, schedule_id, user_id) VALUES (?, ?, ?)`)
    .bind(uuid(), schedule.id, auth.id)
    .run();

  return c.json({ success: true, reminded: true });
});

/* ---------------------------------- go live ---------------------------------- */

/**
 * Converts a scheduled slot into a real stream row (the broadcaster lands on the
 * normal pre-air screen) and marks the schedule as live.
 */
scheduleRoutes.post('/:id/go-live', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const schedule = await c.env.DB.prepare(`SELECT * FROM scheduled_streams WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<ScheduleRow>();
  if (!schedule) throw notFound('Scheduled broadcast not found');
  if (schedule.user_id !== auth.id) throw forbidden('You do not own this schedule');
  if (schedule.status === 'cancelled' || schedule.status === 'completed') throw badRequest('This session is closed');

  const streamId = uuid();
  const streamKey = `sk_${auth.id.split('-')[0]}_${Date.now().toString(36)}_${uuid().slice(0, 8)}`;

  await c.env.DB.prepare(
    `INSERT INTO streams (id, user_id, title, description, stream_key, category, tags, stream_type, scheduled_for, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'internet', ?, ?)`,
  )
    .bind(
      streamId,
      auth.id,
      schedule.title,
      schedule.description,
      streamKey,
      schedule.category,
      schedule.tags,
      schedule.scheduled_for,
      nowIso(),
    )
    .run();

  await c.env.DB.prepare(`UPDATE scheduled_streams SET status = 'live', stream_id = ?, updated_at = ? WHERE id = ?`)
    .bind(streamId, nowIso(), schedule.id)
    .run();

  await dispatchWebhook(c.env, auth.id, 'stream.live', {
    streamId,
    title: schedule.title,
    url: `${baseUrl(c.env, c.req.url)}/watch/${streamId}`,
  });

  return c.json({ success: true, streamId }, 201);
});
