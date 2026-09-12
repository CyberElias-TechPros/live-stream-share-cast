import { z } from 'zod';
import type { Ctx } from '../router';
import {
  apiError,
  corsHeaders,
  json,
  nowISO,
  randomId,
  readJson,
  sha256Hex,
  shortId,
  toPublicStream,
  STREAM_SELECT_HOST,
  type PublicStream,
  type StreamRow,
} from '../util';
import { getSessionUser } from '../auth';
import { CATEGORIES } from './auth';

const createStreamSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(CATEGORIES).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).optional(),
});

const updateStreamSchema = createStreamSchema.partial();

const MAX_RECORDING_BYTES = 100 * 1024 * 1024; // Workers request-body ceiling friendly

function defaultRetentionHours(prefsJson: string | undefined): number {
  try {
    const prefs = JSON.parse(prefsJson ?? '{}');
    const hours = prefs?.streaming?.recordingRetentionHours;
    if (typeof hours === 'number' && hours >= 6 && hours <= 168) return hours;
  } catch { /* default */ }
  return 48;
}

// GET /api/streams?live=1&q=&category=&limit=
export async function handleListStreams(ctx: Ctx): Promise<Response> {
  const { req, env, url } = ctx;
  const liveOnly = url.searchParams.get('live') !== '0';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const category = url.searchParams.get('category')?.trim();
  const limitRaw = Number(url.searchParams.get('limit') ?? '24');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 48) : 24;

  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (liveOnly) conditions.push('streams.is_live = 1');
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    conditions.push('streams.category = ?');
    binds.push(category);
  }
  if (q) {
    conditions.push('(streams.title LIKE ? OR users.username LIKE ? OR users.display_name LIKE ?)');
    const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    binds.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await env.DB.prepare(
    `SELECT ${STREAM_SELECT_HOST} FROM streams JOIN users ON users.id = streams.user_id
     ${where} ORDER BY streams.is_live DESC, streams.viewer_count DESC, streams.created_at DESC LIMIT ?`
  )
    .bind(...binds, limit)
    .all<Parameters<typeof toPublicStream>[0]>();

  return json({ streams: rows.results.map(toPublicStream) }, 200, corsHeaders(env, req));
}

// POST /api/streams
export async function handleCreateStream(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Sign in to create a stream', corsHeaders(env, req));

  const body = await readJson(req);
  const parsed = createStreamSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input', corsHeaders(env, req));
  }
  const { title, description = '', category = 'Other', tags = [] } = parsed.data;

  // Don't let a single account accumulate unbounded offline streams.
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM streams WHERE user_id = ?').bind(auth.user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 50) {
    return apiError(400, 'stream_limit', 'You have reached the maximum number of saved streams. Delete some from your dashboard first.', corsHeaders(env, req));
  }

  const id = shortId();
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO streams (id, user_id, title, description, category, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, auth.user.id, title, description, category, JSON.stringify(tags), now, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT ${STREAM_SELECT_HOST} FROM streams JOIN users ON users.id = streams.user_id WHERE streams.id = ?`
  )
    .bind(id)
    .first<Parameters<typeof toPublicStream>[0]>();
  return json({ stream: row ? toPublicStream(row) : null }, 201, corsHeaders(env, req));
}

// GET /api/streams/mine
export async function handleMyStreams(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));
  const rows = await env.DB.prepare(
    `SELECT ${STREAM_SELECT_HOST},
       (SELECT ss.id FROM stream_sessions ss WHERE ss.stream_id = streams.id ORDER BY ss.started_at DESC LIMIT 1) AS last_session_id,
       (SELECT ss.peak_viewers FROM stream_sessions ss WHERE ss.stream_id = streams.id ORDER BY ss.started_at DESC LIMIT 1) AS last_peak,
       (SELECT ss.duration_seconds FROM stream_sessions ss WHERE ss.stream_id = streams.id ORDER BY ss.started_at DESC LIMIT 1) AS last_duration
     FROM streams JOIN users ON users.id = streams.user_id
     WHERE streams.user_id = ? ORDER BY streams.is_live DESC, streams.updated_at DESC LIMIT 60`
  )
    .bind(auth.user.id)
    .all<Parameters<typeof toPublicStream>[0] & { last_peak: number | null; last_duration: number | null }>();

  return json(
    {
      streams: rows.results.map((row) => ({
        ...toPublicStream(row),
        lastSession: { peakViewers: row.last_peak ?? null, durationSeconds: row.last_duration ?? null },
      })),
    },
    200,
    corsHeaders(env, req)
  );
}

async function getStreamRow(env: Ctx['env'], id: string): Promise<Parameters<typeof toPublicStream>[0] | null> {
  return env.DB.prepare(
    `SELECT ${STREAM_SELECT_HOST} FROM streams JOIN users ON users.id = streams.user_id WHERE streams.id = ?`
  )
    .bind(id)
    .first<Parameters<typeof toPublicStream>[0]>();
}

// GET /api/streams/:id
export async function handleGetStream(ctx: Ctx): Promise<Response> {
  const { req, env, params } = ctx;
  const row = await getStreamRow(env, params.id ?? '');
  if (!row) return apiError(404, 'not_found', 'Stream not found', corsHeaders(env, req));
  return json({ stream: toPublicStream(row) }, 200, corsHeaders(env, req));
}

async function requireOwnedStream(ctx: Ctx): Promise<{ row: StreamRow } | Response> {
  const { req, env, params } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));
  const row = await env.DB.prepare('SELECT * FROM streams WHERE id = ?').bind(params.id ?? '').first<StreamRow>();
  if (!row) return apiError(404, 'not_found', 'Stream not found', corsHeaders(env, req));
  if (row.user_id !== auth.user.id) return apiError(403, 'forbidden', 'You do not own this stream', corsHeaders(env, req));
  return { row };
}

// PATCH /api/streams/:id
export async function handleUpdateStream(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;

  const body = await readJson(req);
  const parsed = updateStreamSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input', corsHeaders(env, req));
  }
  const data = parsed.data;
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.description !== undefined) { sets.push('description = ?'); binds.push(data.description); }
  if (data.category !== undefined) { sets.push('category = ?'); binds.push(data.category); }
  if (data.tags !== undefined) { sets.push('tags = ?'); binds.push(JSON.stringify(data.tags)); }
  sets.push('updated_at = ?');
  binds.push(nowISO());
  binds.push(params.id ?? '');

  await env.DB.prepare(`UPDATE streams SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  const row = await getStreamRow(env, params.id ?? '');
  return json({ stream: row ? toPublicStream(row) : null }, 200, corsHeaders(env, req));
}

// DELETE /api/streams/:id
export async function handleDeleteStream(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  if (owned.row.is_live === 1) {
    return apiError(409, 'stream_live', 'End the broadcast before deleting this stream', corsHeaders(env, req));
  }
  await env.DB.prepare('DELETE FROM streams WHERE id = ?').bind(params.id ?? '').run();
  return json({ ok: true }, 200, corsHeaders(env, req));
}

// POST /api/streams/:id/start
// Marks the stream live and issues a short-lived room ticket the host presents
// on the WebSocket join (session cookies aren't available on WS handshakes in
// split-origin deployments).
export async function handleStartStream(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  const id = params.id ?? '';

  if (owned.row.is_live !== 1) {
    const now = nowISO();
    await env.DB.batch([
      env.DB.prepare('UPDATE streams SET is_live = 1, started_at = ?, ended_at = NULL, viewer_count = 0, peak_viewers = 0, updated_at = ? WHERE id = ?').bind(now, now, id),
      env.DB.prepare('INSERT INTO stream_sessions (id, stream_id, user_id, started_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(randomId(), id, owned.row.user_id, now, now),
    ]);
  }

  const ticket = randomId(32);
  const ticketId = await sha256Hex(ticket);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO room_tickets (id, stream_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(ticketId, id, owned.row.user_id, nowISO(), expiresAt)
    .run();

  const row = await getStreamRow(env, id);
  return json({ stream: row ? toPublicStream(row) : null, ticket, ticketExpiresAt: expiresAt }, 200, corsHeaders(env, req));
}

// POST /api/streams/:id/stop
export async function handleStopStream(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  const id = params.id ?? '';

  // Tell the room (if any) to end immediately; the DO also finalizes the session.
  try {
    const stub = env.ROOM.get(env.ROOM.idFromName(id));
    await stub.fetch('https://room.internal/force-end', { method: 'POST' });
  } catch {
    // No live room — finalize directly.
    const now = nowISO();
    await env.DB.prepare('UPDATE streams SET is_live = 0, ended_at = ?, viewer_count = 0, updated_at = ? WHERE id = ?').bind(now, now, id).run();
    const session = await env.DB.prepare('SELECT id, started_at FROM stream_sessions WHERE stream_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').bind(id).first<{ id: string; started_at: string }>();
    if (session) {
      const duration = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
      await env.DB.prepare('UPDATE stream_sessions SET ended_at = ?, duration_seconds = ?, peak_viewers = COALESCE(peak_viewers, 0) WHERE id = ?').bind(now, duration, session.id).run();
    }
  }
  const row = await getStreamRow(env, id);
  return json({ stream: row ? toPublicStream(row) : null }, 200, corsHeaders(env, req));
}

// GET /api/streams/:id/chat
export async function handleGetChat(ctx: Ctx): Promise<Response> {
  const { req, env, params, url } = ctx;
  const limitRaw = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;
  const rows = await env.DB.prepare(
    'SELECT id, user_id, username, message, created_at FROM chat_messages WHERE stream_id = ? ORDER BY id DESC LIMIT ?'
  )
    .bind(params.id ?? '', limit)
    .all<{ id: number; user_id: string; username: string; message: string; created_at: string }>();
  return json(
    { messages: rows.results.reverse().map((r) => ({ id: r.id, userId: r.user_id, username: r.username, text: r.message, ts: r.created_at })) },
    200,
    corsHeaders(env, req)
  );
}

// POST /api/streams/:id/chat — authenticated chat; fan-out via the room DO.
const chatPostSchema = z.object({ text: z.string().trim().min(1).max(500) });

export async function handlePostChat(ctx: Ctx): Promise<Response> {
  const { req, env, params } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Sign in to chat', corsHeaders(env, req));

  const stream = await env.DB.prepare('SELECT id FROM streams WHERE id = ?').bind(params.id ?? '').first<{ id: string }>();
  if (!stream) return apiError(404, 'not_found', 'Stream not found', corsHeaders(env, req));

  const body = await readJson(req);
  const parsed = chatPostSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', 'Message must be 1-500 characters', corsHeaders(env, req));
  }

  const stub = env.ROOM.get(env.ROOM.idFromName(stream.id));
  const roomRes = await stub
    .fetch('https://room.internal/chat', {
      method: 'POST',
      body: JSON.stringify({
        userId: auth.user.id,
        username: auth.user.displayName || auth.user.username,
        text: parsed.data.text,
      }),
    })
    .catch(() => null);

  if (roomRes && roomRes.status === 429) {
    return apiError(429, 'chat_throttled', "You're sending messages too fast — take a breath.", corsHeaders(env, req));
  }
  if (!roomRes || !roomRes.ok) {
    return apiError(502, 'chat_failed', 'Message could not be delivered. Try again.', corsHeaders(env, req));
  }
  return json({ ok: true }, 201, corsHeaders(env, req));
}

// PUT /api/streams/:id/recording  (multipart form: file)
export async function handleUploadRecording(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  if (!env.RECORDINGS) {
    return apiError(501, 'recordings_not_configured', 'Cloud recordings are not configured on this deployment.', corsHeaders(env, req));
  }
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return apiError(400, 'validation_error', 'Expected a multipart form with a "file" field', corsHeaders(env, req));
  }
  const type = file.type || 'video/webm';
  if (!/^video\/(webm|mp4|x-matroska)$/.test(type)) {
    return apiError(415, 'unsupported_media', 'Only video/webm or video/mp4 recordings are accepted', corsHeaders(env, req));
  }
  if (file.size > MAX_RECORDING_BYTES) {
    return apiError(413, 'too_large', 'Recording exceeds the 100MB upload limit', corsHeaders(env, req));
  }

  const key = `recordings/${params.id}/${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
  await env.RECORDINGS.put(key, file.stream(), {
    httpMetadata: { contentType: type },
    customMetadata: { streamId: params.id ?? '', uploader: auth.user.id },
  });
  const retentionHours = defaultRetentionHours(JSON.stringify(auth.user.preferences));
  const expires = new Date(Date.now() + retentionHours * 3600 * 1000).toISOString();
  await env.DB.prepare('UPDATE streams SET recording_key = ?, recording_expires_at = ?, updated_at = ? WHERE id = ?')
    .bind(key, expires, nowISO(), params.id ?? '')
    .run();

  return json({ recording: { expiresAt: expires, sizeBytes: file.size } }, 201, corsHeaders(env, req));
}

// GET /api/streams/:id/recording (owner download)
export async function handleDownloadRecording(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  const row = owned.row;
  if (!env.RECORDINGS || !row.recording_key) return apiError(404, 'not_found', 'No recording available', corsHeaders(env, req));
  if (row.recording_expires_at && row.recording_expires_at < nowISO()) {
    return apiError(410, 'expired', 'This recording has expired', corsHeaders(env, req));
  }
  const object = await env.RECORDINGS.get(row.recording_key);
  if (!object) return apiError(404, 'not_found', 'Recording object missing', corsHeaders(env, req));
  const headers = new Headers({
    'content-type': object.httpMetadata?.contentType ?? 'video/webm',
    'content-disposition': `attachment; filename="imlive-${params.id}.webm"`,
    ...corsHeaders(env, req),
  });
  return new Response(object.body, { headers });
}

// DELETE /api/streams/:id/recording
export async function handleDeleteRecording(ctx: Ctx): Promise<Response> {
  const owned = await requireOwnedStream(ctx);
  if (owned instanceof Response) return owned;
  const { req, env, params } = ctx;
  if (env.RECORDINGS && owned.row.recording_key) {
    await env.RECORDINGS.delete(owned.row.recording_key);
  }
  await env.DB.prepare('UPDATE streams SET recording_key = NULL, recording_expires_at = NULL, updated_at = ? WHERE id = ?')
    .bind(nowISO(), params.id ?? '')
    .run();
  return json({ ok: true }, 200, corsHeaders(env, req));
}

export type { PublicStream };
