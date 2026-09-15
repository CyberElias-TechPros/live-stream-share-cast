import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { optionalAuth, requireAuth } from '../lib/auth';
import {
  badRequest,
  conflict,
  forbidden,
  int,
  jsonField,
  notFound,
  readJson,
  trimOrNull,
} from '../lib/http';
import { streamKey, uuid } from '../lib/ids';
import {
  chatMessage,
  parseJson,
  STREAM_FROM,
  STREAM_SELECT,
  stream,
  streamSession,
  streamStat,
  type ChatMessageRow,
  type StreamRow,
  type StreamSessionRow,
  type StreamStatRow,
} from '../lib/serialize';
import { isoHoursFromNow, nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';
import { broadcastToStream, streamPresence } from '../lib/do';

export const streamRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

const DEFAULT_RETENTION_HOURS = 6;

function retentionHours(env: Env): number {
  const configured = Number(env.RECORDING_RETENTION_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_HOURS;
}

/* --------------------------------- listing ----------------------------------- */

streamRoutes.get('/', optionalAuth, async (c) => {
  const query = c.req.query();
  const limit = int(query.limit, 30, 1, 100);
  const offset = int(query.offset, 0, 0, 10_000);
  const viewerId = c.get('authUser')?.id ?? null;

  const where: string[] = [];
  const binds: unknown[] = [];

  if (query.live !== undefined && query.live !== 'false') {
    where.push('s.is_live = 1');
  } else if (query.live === 'false') {
    where.push('s.is_live = 0');
  }
  if (query.userId) {
    where.push('s.user_id = ?');
    binds.push(query.userId);
  }
  if (query.category) {
    where.push('lower(s.category) = lower(?)');
    binds.push(query.category);
  }
  if (query.search || query.q) {
    const term = `%${String(query.search ?? query.q).toLowerCase()}%`;
    where.push('(lower(s.title) LIKE ? OR lower(COALESCE(s.description, \'\')) LIKE ? OR lower(u.username) LIKE ?)');
    binds.push(term, term, term);
  }
  if (query.streamType) {
    where.push('s.stream_type = ?');
    binds.push(query.streamType);
  }

  const order =
    query.sort === 'recent'
      ? 's.created_at DESC'
      : query.sort === 'started'
        ? 's.started_at DESC'
        : 's.is_live DESC, s.viewer_count DESC, s.created_at DESC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { results } = await c.env.DB.prepare(
    `SELECT ${STREAM_SELECT} ${STREAM_FROM} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<StreamRow>();

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS count ${STREAM_FROM} ${whereSql}`)
    .bind(...binds)
    .first<{ count: number }>();

  return c.json({
    streams: (results ?? []).map((row) => stream(row, row.user_id === viewerId)),
    count: results?.length ?? 0,
    total: total?.count ?? 0,
    limit,
    offset,
  });
});

/* ------------------------- stream-key generation (owner) --------------------- */

streamRoutes.get('/keys/generate', authGuard, rateLimit({ limit: 30, windowMs: 60_000, name: 'keys', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  if (!auth.isStreamer) throw forbidden('Only streamers can generate stream keys');
  return c.json({ streamKey: streamKey(auth.id) });
});

/* --------------------------------- creation ---------------------------------- */

streamRoutes.post('/', authGuard, rateLimit({ limit: 20, windowMs: 60_000, name: 'create-stream', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);

  const title = trimOrNull(body.title, 200);
  if (!title) throw badRequest('A stream title is required');

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 12)
    : typeof body.tags === 'string'
      ? body.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

  const streamType = body.streamType === 'local' || body.stream_type === 'local' ? 'local' : 'internet';
  const isRecording = body.isRecording === true || body.is_recording === true;
  const id = uuid();

  await c.env.DB.prepare(
    `INSERT INTO streams (id, user_id, title, description, stream_key, category, tags, stream_type, is_recording, recording_expiry)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      auth.id,
      title,
      trimOrNull(body.description, 2000),
      streamKey(auth.id),
      trimOrNull(body.category, 80),
      JSON.stringify(tags),
      streamType,
      isRecording ? 1 : 0,
      isRecording && streamType === 'internet' ? isoHoursFromNow(retentionHours(c.env)) : null,
    )
    .run();

  const row = await c.env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`).bind(id).first<StreamRow>();
  return c.json({ stream: row ? stream(row, true) : null }, 201);
});

/* ------------------------------- single stream -------------------------------- */

streamRoutes.get('/:id', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const row = await c.env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`)
    .bind(c.req.param('id'))
    .first<StreamRow>();
  if (!row) throw notFound('Stream not found');
  return c.json({ stream: stream(row, row.user_id === viewerId) });
});

async function ownedStream(env: Env, id: string, userId: string): Promise<StreamRow> {
  const row = await env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`).bind(id).first<StreamRow>();
  if (!row) throw notFound('Stream not found');
  if (row.user_id !== userId) throw forbidden('You do not own this stream');
  return row;
}

streamRoutes.patch('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const id = c.req.param('id');
  await ownedStream(c.env, id, auth.id);

  const body = await readJson(c);
  const updates: Record<string, unknown> = {};
  const binds: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    updates[column] = value;
  };

  if (body.title !== undefined) {
    const title = trimOrNull(body.title, 200);
    if (!title) throw badRequest('Title cannot be empty');
    assign('title', title);
  }
  if (body.description !== undefined) assign('description', trimOrNull(body.description, 2000));
  if (body.category !== undefined) assign('category', trimOrNull(body.category, 80));
  if (body.thumbnail !== undefined) assign('thumbnail_url', trimOrNull(body.thumbnail, 2000));
  if (body.thumbnailUrl !== undefined) assign('thumbnail_url', trimOrNull(body.thumbnailUrl, 2000));
  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 12)
      : typeof body.tags === 'string'
        ? body.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
        : [];
    assign('tags', JSON.stringify(tags));
  }
  if (body.streamType !== undefined) assign('stream_type', body.streamType === 'local' ? 'local' : 'internet');
  if (body.isRecording !== undefined) assign('is_recording', body.isRecording ? 1 : 0);
  if (body.recordingUrl !== undefined) assign('recording_url', trimOrNull(body.recordingUrl, 2000));
  if (body.isLive !== undefined) assign('is_live', body.isLive ? 1 : 0);

  if (Object.keys(updates).length === 0) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates)
    .map((column) => `${column} = ?`)
    .join(', ');
  for (const value of Object.values(updates)) binds.push(value);

  await c.env.DB.prepare(`UPDATE streams SET ${assignments}, updated_at = ? WHERE id = ?`).bind(...binds, nowIso(), id).run();

  const row = await c.env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`).bind(id).first<StreamRow>();
  return c.json({ stream: row ? stream(row, true) : null });
});

streamRoutes.delete('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await ownedStream(c.env, c.req.param('id'), auth.id);

  if (row.recording_key) {
    await c.env.RECORDINGS.delete(row.recording_key).catch(() => undefined);
  }
  await c.env.DB.prepare(`DELETE FROM streams WHERE id = ?`).bind(row.id).run();
  return c.json({ success: true });
});

/* ------------------------------- live lifecycle ------------------------------ */

streamRoutes.post('/:id/start', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const id = c.req.param('id');
  const body = await readJson(c);
  const isRecording = body.isRecording === true || body.recordStream === true;

  const row = await ownedStream(c.env, id, auth.id);
  const now = nowIso();

  await c.env.DB.prepare(
    `UPDATE streams
        SET is_live = 1,
            started_at = ?,
            ended_at = NULL,
            is_recording = ?,
            recording_expiry = CASE WHEN ? THEN ? ELSE recording_expiry END,
            last_heartbeat = ?,
            updated_at = ?
      WHERE id = ?`,
  )
    .bind(now, isRecording ? 1 : 0, isRecording ? 1 : 0, isoHoursFromNow(retentionHours(c.env)), now, now, id)
    .run();

  // Open a session row for analytics.
  await c.env.DB.prepare(
    `INSERT INTO stream_sessions (id, stream_id, user_id, stream_type, started_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), id, auth.id, row.stream_type ?? 'internet', now)
    .run();

  const updated = await c.env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`).bind(id).first<StreamRow>();
  return c.json({ success: true, stream: updated ? stream(updated, true) : null });
});

streamRoutes.post('/:id/stop', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const id = c.req.param('id');
  await ownedStream(c.env, id, auth.id);

  const now = nowIso();
  await c.env.DB.prepare(
    `UPDATE streams SET is_live = 0, host_connected = 0, ended_at = ?, viewer_count = 0, updated_at = ? WHERE id = ?`,
  )
    .bind(now, now, id)
    .run();

  await c.env.DB.prepare(
    `UPDATE stream_sessions
        SET ended_at = ?, duration = CAST((strftime('%s', ?) - strftime('%s', started_at)) AS INTEGER)
      WHERE stream_id = ? AND ended_at IS NULL`,
  )
    .bind(now, now, id)
    .run();

  // Tell everyone in the room that the broadcast ended.
  await broadcastToStream(c.env, id, { type: 'stream', status: 'offline', streamId: id });

  const updated = await c.env.DB.prepare(`SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.id = ?`).bind(id).first<StreamRow>();
  return c.json({ success: true, stream: updated ? stream(updated, true) : null });
});

/** Host heartbeat — keeps a stream marked live even if the socket reloads. */
streamRoutes.post('/:id/heartbeat', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const id = c.req.param('id');
  await ownedStream(c.env, id, auth.id);

  const body = await readJson(c);
  const viewerCount = int(body.viewerCount, 0, 0, 1_000_000);

  await c.env.DB.prepare(
    `UPDATE streams
        SET last_heartbeat = ?, host_connected = 1, is_live = 1,
            viewer_count = MAX(COALESCE(viewer_count, 0), ?),
            peak_viewers = MAX(COALESCE(peak_viewers, 0), ?)
      WHERE id = ?`,
  )
    .bind(nowIso(), viewerCount, viewerCount, id)
    .run();

  return c.json({ success: true });
});

/** Viewer-count bookkeeping for clients that are not on the WebSocket. */
streamRoutes.post('/:id/viewers', rateLimit({ limit: 120, windowMs: 60_000, name: 'viewers' }), async (c) => {
  const id = c.req.param('id');
  const body = await readJson(c);
  const count = int(body.count ?? body.viewerCount, 0, 0, 1_000_000);

  const exists = await c.env.DB.prepare(`SELECT 1 AS ok FROM streams WHERE id = ?`).bind(id).first<{ ok: number }>();
  if (!exists) throw notFound('Stream not found');

  await c.env.DB.prepare(
    `UPDATE streams
        SET viewer_count = ?, peak_viewers = MAX(COALESCE(peak_viewers, 0), ?), updated_at = ?
      WHERE id = ?`,
  )
    .bind(count, count, nowIso(), id)
    .run();

  await c.env.DB.prepare(`INSERT INTO stream_stats (id, stream_id, viewer_count) VALUES (?, ?, ?)`)
    .bind(uuid(), id, count)
    .run();

  return c.json({ success: true });
});

/* ---------------------------------- stats ------------------------------------ */

streamRoutes.post('/:id/stats', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const id = c.req.param('id');
  await ownedStream(c.env, id, auth.id);

  const body = await readJson(c);
  const statId = uuid();
  const viewerCount = int(body.viewerCount, 0, 0, 1_000_000);
  const bandwidth = int(body.bandwidth, 0, 0, Number.MAX_SAFE_INTEGER);

  await c.env.DB.prepare(
    `INSERT INTO stream_stats (id, stream_id, viewer_count, bandwidth, cpu_usage, memory_usage, errors)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      statId,
      id,
      viewerCount,
      bandwidth,
      typeof body.cpuUsage === 'number' ? body.cpuUsage : null,
      typeof body.memoryUsage === 'number' ? body.memoryUsage : null,
      jsonField(body.errors),
    )
    .run();

  await c.env.DB.prepare(
    `UPDATE streams SET viewer_count = ?, peak_viewers = MAX(COALESCE(peak_viewers, 0), ?) WHERE id = ?`,
  )
    .bind(viewerCount, viewerCount, id)
    .run();

  return c.json({ success: true, id: statId });
});

streamRoutes.get('/:id/stats', async (c) => {
  const id = c.req.param('id');
  const limit = int(c.req.query('limit'), 200, 1, 1000);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM stream_stats WHERE stream_id = ? ORDER BY timestamp DESC LIMIT ?`,
  )
    .bind(id, limit)
    .all<StreamStatRow>();
  return c.json({ stats: (results ?? []).map(streamStat).reverse() });
});

streamRoutes.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT ss.*, s.title, s.thumbnail_url, s.category, s.tags
       FROM stream_sessions ss JOIN streams s ON s.id = ss.stream_id
      WHERE ss.stream_id = ? ORDER BY ss.created_at DESC LIMIT 100`,
  )
    .bind(id)
    .all<StreamSessionRow>();
  return c.json({ sessions: (results ?? []).map(streamSession) });
});

/* ---------------------------- presence + signalling --------------------------- */

streamRoutes.get('/:id/presence', async (c) => {
  const id = c.req.param('id');
  return c.json({ streamId: id, ...(await streamPresence(c.env, id)) });
});

/* ----------------------------------- chat ------------------------------------- */

streamRoutes.get('/:id/chat', async (c) => {
  const id = c.req.param('id');
  const limit = int(c.req.query('limit'), 100, 1, 200);
  const before = c.req.query('before');

  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.stream_id, m.user_id, m.message, m.type, m.metadata, m.is_moderated, m.created_at,
            u.username, u.avatar_url
       FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.stream_id = ? ${before ? 'AND m.created_at < ?' : ''}
      ORDER BY m.created_at DESC LIMIT ?`,
  )
    .bind(...(before ? [id, before, limit] : [id, limit]))
    .all<ChatMessageRow>();

  return c.json({ messages: (results ?? []).map(chatMessage).reverse() });
});

streamRoutes.post('/:id/chat', authGuard, rateLimit({ limit: 30, windowMs: 30_000, name: 'chat', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('id');
  const body = await readJson(c);

  const message = String(body.message ?? '').trim();
  if (!message) throw badRequest('Message cannot be empty');
  if (message.length > 2000) throw badRequest('Message is too long');

  const exists = await c.env.DB.prepare(`SELECT 1 AS ok FROM streams WHERE id = ?`).bind(streamId).first<{ ok: number }>();
  if (!exists) throw notFound('Stream not found');

  const type = ['text', 'emote', 'donation', 'system'].includes(String(body.type)) ? String(body.type) : 'text';
  const id = uuid();
  const createdAt = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO chat_messages (id, stream_id, user_id, message, type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, streamId, auth.id, message, type, jsonField(body.metadata), createdAt)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT m.*, u.username, u.avatar_url FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
  )
    .bind(id)
    .first<ChatMessageRow>();

  const payload = row ? chatMessage(row) : null;

  // Fan out to every socket connected to this stream's Durable Object.
  await broadcastToStream(c.env, streamId, { type: 'chat', message: payload });

  return c.json({ message: payload }, 201);
});

streamRoutes.patch('/:id/chat/:messageId', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { id: streamId, messageId } = c.req.param();
  await ownedStream(c.env, streamId, auth.id);

  const body = await readJson(c);
  const isModerated = body.isModerated === true;

  await c.env.DB.prepare(`UPDATE chat_messages SET is_moderated = ? WHERE id = ? AND stream_id = ?`)
    .bind(isModerated ? 1 : 0, messageId, streamId)
    .run();

  await broadcastToStream(c.env, streamId, { type: 'moderation', messageId, isModerated });

  return c.json({ success: true, isModerated });
});

/**
 * Standalone chat moderation (mounted at `/api/chat`) — the client only knows
 * the message id, so the stream id is resolved from the message itself.
 */
export const chatRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

chatRoutes.patch('/:messageId', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const messageId = c.req.param('messageId');
  const body = await readJson(c);
  const isModerated = body.isModerated === true;

  const message = await c.env.DB.prepare(
    `SELECT m.id, m.stream_id, s.user_id
       FROM chat_messages m JOIN streams s ON s.id = m.stream_id
      WHERE m.id = ?`,
  )
    .bind(messageId)
    .first<{ id: string; stream_id: string; user_id: string }>();

  if (!message) throw notFound('Message not found');
  if (message.user_id !== auth.id && !auth.isAdmin) throw forbidden('Only the broadcaster can moderate this chat');

  await c.env.DB.prepare(`UPDATE chat_messages SET is_moderated = ? WHERE id = ?`)
    .bind(isModerated ? 1 : 0, messageId)
    .run();

  await broadcastToStream(c.env, message.stream_id, { type: 'moderation', messageId, isModerated });

  return c.json({ success: true, isModerated, streamId: message.stream_id });
});

/** Escape hatch used by `parseJson` consumers; keeps the import list honest. */
export const _unused = { parseJson, conflict };
