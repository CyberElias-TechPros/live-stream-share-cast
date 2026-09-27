/**
 * VOD library — recordings, replays and clips.
 *
 * A recording row is created whenever a file lands in R2 (see
 * `routes/media.ts`). This route owns the *library* semantics: who can see it,
 * how it is titled, how long it is kept and how clips are cut from it.
 *
 *   GET    /api/recordings                 browse the public library
 *   GET    /api/recordings/mine            the signed-in creator's library
 *   GET    /api/recordings/:id             one recording (visibility enforced)
 *   PATCH  /api/recordings/:id             title / description / visibility / tags
 *   DELETE /api/recordings/:id             remove from R2 + D1
 *   POST   /api/recordings/:id/clip        create a clip (same source, time range)
 *   POST   /api/recordings/:id/view        register a VOD watch session
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { optionalAuth, requireAuth } from '../lib/auth';
import { badRequest, forbidden, int, notFound, readJson, trimOrNull } from '../lib/http';
import { limitsConfig } from '../lib/config';
import { parseJson } from '../lib/serialize';
import { nowIso } from '../lib/time';
import { uuid } from '../lib/ids';
import { startWatchSession } from '../lib/analytics';

export const recordingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

interface RecordingRow {
  id: string;
  user_id: string;
  stream_id: string | null;
  title: string;
  description: string | null;
  url: string;
  r2_key: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  visibility: string;
  status: string;
  source: string;
  views: number | null;
  watch_minutes: number | null;
  category: string | null;
  tags: string | null;
  is_mature: number | null;
  clip_of: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  retention_expires_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

const RECORDING_SELECT = `
  r.*, u.username, u.display_name, u.avatar_url
`;

const RECORDING_FROM = `FROM recordings r JOIN users u ON u.id = r.user_id`;

export function recordingDto(row: RecordingRow, viewerId?: string | null) {
  const isOwner = !!viewerId && viewerId === row.user_id;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.status === 'ready' ? row.url : null,
    thumbnail: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    visibility: row.visibility,
    status: row.status,
    source: row.source,
    views: row.views ?? 0,
    watchMinutes: row.watch_minutes ?? 0,
    category: row.category,
    tags: parseJson<string[]>(row.tags, []),
    isMature: !!row.is_mature,
    clipOf: row.clip_of,
    clipStart: row.clip_start_seconds,
    clipEnd: row.clip_end_seconds,
    retentionExpiresAt: row.retention_expires_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    streamId: row.stream_id,
    userId: row.user_id,
    username: row.username ?? undefined,
    displayName: row.display_name ?? undefined,
    userAvatar: row.avatar_url ?? undefined,
    isOwner,
    isClip: !!row.clip_of,
  };
}

/* ---------------------------------- browsing ---------------------------------- */

recordingRoutes.get('/', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const limit = int(c.req.query('limit'), 24, 1, 100);
  const offset = int(c.req.query('offset'), 0, 0, 10_000);

  const where: string[] = [`r.status = 'ready'`];
  const binds: unknown[] = [];

  // Public library excludes private/unlisted unless the viewer owns them.
  where.push(`(r.visibility = 'public' OR r.user_id = ?)`);
  binds.push(viewerId ?? '');

  if (c.req.query('userId')) {
    where.push('r.user_id = ?');
    binds.push(c.req.query('userId'));
  }
  if (c.req.query('category')) {
    where.push('lower(r.category) = lower(?)');
    binds.push(c.req.query('category'));
  }
  if (c.req.query('clips') === 'true') where.push('r.clip_of IS NOT NULL');
  if (c.req.query('clips') === 'false') where.push('r.clip_of IS NULL');
  if (c.req.query('search')) {
    const term = `%${c.req.query('search')!.toLowerCase()}%`;
    where.push('(lower(r.title) LIKE ? OR lower(COALESCE(r.description, \'\')) LIKE ? OR lower(u.username) LIKE ?)');
    binds.push(term, term, term);
  }
  if (c.req.query('tag')) {
    where.push('lower(COALESCE(r.tags, \'\')) LIKE ?');
    binds.push(`%${c.req.query('tag')!.toLowerCase()}%`);
  }

  const sort =
    c.req.query('sort') === 'views'
      ? 'r.views DESC, r.created_at DESC'
      : c.req.query('sort') === 'oldest'
        ? 'r.created_at ASC'
        : 'r.published_at DESC, r.created_at DESC';

  const { results } = await c.env.DB.prepare(
    `SELECT ${RECORDING_SELECT} ${RECORDING_FROM} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<RecordingRow>();

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS count ${RECORDING_FROM} WHERE ${where.join(' AND ')}`)
    .bind(...binds)
    .first<{ count: number }>();

  return c.json({
    recordings: (results ?? []).map((row) => recordingDto(row, viewerId)),
    total: total?.count ?? 0,
    limit,
    offset,
  });
});

recordingRoutes.get('/mine', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT ${RECORDING_SELECT} ${RECORDING_FROM} WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(auth.id)
    .all<RecordingRow>();

  return c.json({ recordings: (results ?? []).map((row) => recordingDto(row, auth.id)) });
});

recordingRoutes.get('/:id', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const row = await c.env.DB.prepare(`SELECT ${RECORDING_SELECT} ${RECORDING_FROM} WHERE r.id = ?`).bind(c.req.param('id')).first<RecordingRow>();
  if (!row) throw notFound('Recording not found');

  const isOwner = viewerId === row.user_id;
  if (!isOwner && row.visibility !== 'public' && !c.get('authUser')?.isAdmin) {
    throw forbidden('This recording is not public');
  }

  return c.json({ recording: recordingDto(row, viewerId) });
});

/* --------------------------------- management -------------------------------- */

recordingRoutes.patch('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT user_id FROM recordings WHERE id = ?`).bind(c.req.param('id')).first<{ user_id: string }>();
  if (!row) throw notFound('Recording not found');
  if (row.user_id !== auth.id && !auth.isAdmin) throw forbidden('You do not own this recording');

  const body = await readJson(c);
  const updates: Record<string, unknown> = {};
  const limits = limitsConfig(c.env);

  if (body.title !== undefined) {
    const title = trimOrNull(body.title, limits.maxTitleLength);
    if (!title) throw badRequest('A title is required');
    updates.title = title;
  }
  if (body.description !== undefined) updates.description = trimOrNull(body.description, 2000);
  if (body.category !== undefined) updates.category = trimOrNull(body.category, 80);
  if (body.thumbnailUrl !== undefined) updates.thumbnail_url = trimOrNull(body.thumbnailUrl, 2000);
  if (body.isMature !== undefined) updates.is_mature = body.isMature ? 1 : 0;
  if (body.visibility !== undefined) {
    const visibility = String(body.visibility);
    if (!['public', 'unlisted', 'private'].includes(visibility)) throw badRequest('visibility must be public, unlisted or private');
    updates.visibility = visibility;
  }
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
  if (body.retentionHours !== undefined) {
    const hours = int(body.retentionHours, limits.recordingRetentionHours, 1, 24 * 365);
    updates.retention_expires_at = new Date(Date.now() + hours * 3600_000).toISOString();
  }

  if (!Object.keys(updates).length) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE recordings SET ${assignments}, updated_at = ? WHERE id = ?`)
    .bind(...Object.values(updates), nowIso(), c.req.param('id'))
    .run();

  const updated = await c.env.DB.prepare(`SELECT ${RECORDING_SELECT} ${RECORDING_FROM} WHERE r.id = ?`).bind(c.req.param('id')).first<RecordingRow>();
  return c.json({ recording: updated ? recordingDto(updated, auth.id) : null });
});

recordingRoutes.delete('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT id, user_id, r2_key, clip_of FROM recordings WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; user_id: string; r2_key: string; clip_of: string | null }>();
  if (!row) throw notFound('Recording not found');
  if (row.user_id !== auth.id && !auth.isAdmin) throw forbidden('You do not own this recording');

  // Clips share the parent object — only delete the bytes when nothing else
  // references the same key.
  const shared = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM recordings WHERE r2_key = (SELECT r2_key FROM recordings WHERE id = ?) AND id != ?`,
  )
    .bind(row.id, row.id)
    .first<{ count: number }>();

  if (!shared?.count) {
    await c.env.RECORDINGS.delete(row.r2_key).catch(() => undefined);
  }

  await c.env.DB.prepare(`DELETE FROM recordings WHERE id = ?`).bind(row.id).run();
  await c.env.DB.prepare(`UPDATE streams SET recording_id = NULL WHERE recording_id = ?`).bind(row.id).run();

  return c.json({ success: true });
});

/* ------------------------------------ clips ---------------------------------- */

recordingRoutes.post('/:id/clip', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const parent = await c.env.DB.prepare(`SELECT * FROM recordings WHERE id = ?`).bind(c.req.param('id')).first<RecordingRow>();
  if (!parent) throw notFound('Recording not found');
  if (parent.visibility === 'private' && parent.user_id !== auth.id) throw forbidden('This recording is private');
  if (parent.clip_of) throw badRequest('You cannot clip a clip');
  if (parent.status !== 'ready') throw badRequest('This recording is not ready yet');

  const body = await readJson(c);
  const start = Number(body.startSeconds ?? 0);
  const end = Number(body.endSeconds ?? 0);
  const maxDuration = 60;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw badRequest('Provide a valid start and end time');
  if (end - start > maxDuration) throw badRequest(`Clips may be at most ${maxDuration} seconds long`);

  const duration = parent.duration_seconds ?? null;
  if (duration && end > duration + 5) throw badRequest('The clip ends after the recording does');

  const id = uuid();
  const title = trimOrNull(body.title, limitsConfig(c.env).maxTitleLength) ?? `Clip of ${parent.title}`;

  await c.env.DB.prepare(
    `INSERT INTO recordings (id, user_id, stream_id, session_id, title, description, r2_key, url, thumbnail_url,
                             duration_seconds, size_bytes, mime_type, visibility, status, source, category, tags,
                             clip_of, clip_start_seconds, clip_end_seconds, retention_expires_at, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'public', 'ready', 'clip', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      auth.id,
      parent.stream_id,
      null, // clips inherit the parent object; they are not tied to a live session row
      title,
      parent.description,
      parent.r2_key,
      parent.url,
      parent.thumbnail_url,
      Math.round(end - start),
      parent.mime_type,
      parent.category,
      parent.tags,
      parent.id,
      start,
      end,
      parent.retention_expires_at,
      nowIso(),
      nowIso(),
    )
    .run();

  const created = await c.env.DB.prepare(`SELECT ${RECORDING_SELECT} ${RECORDING_FROM} WHERE r.id = ?`).bind(id).first<RecordingRow>();
  return c.json({ recording: created ? recordingDto(created, auth.id) : null }, 201);
});

/* ----------------------------------- viewing --------------------------------- */

/** Registers a VOD watch session so analytics has a join-point/leave-point. */
recordingRoutes.post('/:id/view', optionalAuth, async (c) => {
  const auth = c.get('authUser');
  const row = await c.env.DB.prepare(`SELECT id, user_id, visibility, status FROM recordings WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; user_id: string; visibility: string; status: string }>();
  if (!row) throw notFound('Recording not found');
  if (row.visibility !== 'public' && row.user_id !== auth?.id) throw forbidden('This recording is not public');
  if (row.status !== 'ready') throw badRequest('This recording is not ready yet');

  const sessionId = await startWatchSession(c.env, {
    recordingId: row.id,
    userId: auth?.id ?? null,
    ip: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
    country: c.req.header('CF-IPCountry'),
    device: c.req.header('X-Device-Class'),
    referrer: c.req.header('Referer'),
  });

  return c.json({ sessionId });
});
