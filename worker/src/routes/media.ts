import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { trimOrNull } from '../lib/http';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { background, badRequest, forbidden, int, notFound, readJson } from '../lib/http';
import { uuid } from '../lib/ids';
import { isoHoursFromNow, nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';
import { limitsConfig } from '../lib/config';
import { dispatchWebhook } from '../lib/webhook';

/** Shared with the VOD library so uploads show up in `recordings` immediately. */

export const mediaRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

function retentionHours(env: Env): number {
  return limitsConfig(env).recordingRetentionHours;
}

/* --------------------------------- uploads ----------------------------------- */

/**
 * Upload a stream recording to R2 and (optionally) attach it to a stream.
 * `Content-Type: multipart/form-data` with a `file` field.
 */
mediaRoutes.post('/recordings', authGuard, rateLimit({ limit: 20, windowMs: 60_000, name: 'uploads', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const limits = limitsConfig(c.env);
  const maxBytes = limits.maxUploadBytes;

  const form = await c.req.parseBody();
  const file = form.file ?? form.recording;
  if (!file || typeof file === 'string') throw badRequest('No file provided');
  if (file.size > maxBytes) throw badRequest(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);

  const streamId = typeof form.streamId === 'string' && form.streamId ? form.streamId : null;
  if (streamId) {
    const owner = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
    if (!owner) throw notFound('Stream not found');
    if (owner.user_id !== auth.id) throw forbidden('You do not own this stream');
  }

  const hours = int(form.retentionHours ?? c.env.RECORDING_RETENTION_HOURS, retentionHours(c.env), 1, 24 * 30);
  const key = `recordings/${auth.id}/${streamId ?? 'adhoc'}/${uuid()}.${extensionFor(file.type, file.name)}`;

  await c.env.RECORDINGS.put(key, file, {
    httpMetadata: { contentType: file.type || 'video/webm' },
    customMetadata: { userId: auth.id, streamId: streamId ?? '', uploadedAt: nowIso() },
  });

  const url = `/api/media/recordings/${key}`;
  const expiresAt = isoHoursFromNow(hours);

  // VOD library record — the stream columns stay in sync for backwards
  // compatibility, but `recordings` is the source of truth for the library UI.
  const recordingId = uuid();
  const streamTitle = streamId
    ? (await c.env.DB.prepare(`SELECT title, category, tags FROM streams WHERE id = ?`).bind(streamId).first<{ title: string; category: string | null; tags: string | null }>())
    : null;

  await c.env.DB.prepare(
    `INSERT INTO recordings (id, user_id, stream_id, title, description, r2_key, url, thumbnail_url, size_bytes,
                             mime_type, visibility, status, source, category, tags, is_mature,
                             retention_expires_at, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 'ready', ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(
      recordingId,
      auth.id,
      streamId,
      trimOrNull(form.title, limits.maxTitleLength) ?? (streamTitle?.title ? `${streamTitle.title} — replay` : 'Untitled recording'),
      trimOrNull(form.description, 2000),
      key,
      url,
      trimOrNull(form.thumbnailUrl, 2000),
      file.size,
      file.type || 'video/webm',
      String(form.source ?? 'browser').slice(0, 20),
      streamTitle?.category ?? null,
      streamTitle?.tags ?? null,
      expiresAt,
      nowIso(),
      nowIso(),
    )
    .run();

  if (streamId) {
    await c.env.DB.prepare(
      `UPDATE streams
          SET recording_url = ?, recording_key = ?, recording_expiry = ?, is_recording = 1,
              recording_id = ?, updated_at = ?
        WHERE id = ?`,
    )
      .bind(url, key, expiresAt, recordingId, nowIso(), streamId)
      .run();

    await c.env.DB.prepare(
      `UPDATE stream_sessions SET recording_url = ?, recording_key = ?, recording_expiry = ?
        WHERE stream_id = ? AND ended_at IS NULL`,
    )
      .bind(url, key, expiresAt, streamId)
      .run();
  }

  background(
    c,
    dispatchWebhook(c.env, auth.id, 'recording.ready', {
      recordingId,
      streamId,
      title: streamTitle?.title ?? null,
      url,
      expiresAt,
    }),
  );

  return c.json({ success: true, id: recordingId, url, key, expiresAt, size: file.size, type: file.type }, 201);
});

/** Delete a recording (owner only — ownership is resolved through the streams table). */
mediaRoutes.delete('/recordings/*', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const key = decodeURIComponent(c.req.path.replace('/api/media/recordings/', ''));

  const stream = await c.env.DB.prepare(`SELECT id FROM streams WHERE recording_key = ?`).bind(key).first<{ id: string }>();
  if (stream) {
    const owner = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(stream.id).first<{ user_id: string }>();
    if (!owner || owner.user_id !== auth.id) throw forbidden('You do not own this recording');
    await c.env.DB.prepare(
      `UPDATE streams SET recording_url = NULL, recording_key = NULL, recording_expiry = NULL, is_recording = 0 WHERE id = ?`,
    )
      .bind(stream.id)
      .run();
  } else if (!key.startsWith(`recordings/${auth.id}/`)) {
    throw forbidden('You do not own this recording');
  }

  await c.env.RECORDINGS.delete(key);
  return c.json({ success: true });
});

/**
 * Thumbnail upload (stream card / VOD poster). Images land in the AVATARS
 * bucket under a `thumbnails/<userId>/…` prefix so no extra R2 binding is
 * needed, and are served with immutable cache headers.
 */
mediaRoutes.post('/thumbnails', authGuard, rateLimit({ limit: 30, windowMs: 60_000, name: 'thumbnails', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const limits = limitsConfig(c.env);

  const form = await c.req.parseBody();
  const file = form.file ?? form.thumbnail;
  if (!file || typeof file === 'string') throw badRequest('No file provided');
  if (!file.type?.startsWith('image/')) throw badRequest('Thumbnails must be an image');
  if (file.size > limits.maxAvatarBytes) throw badRequest('Thumbnail must be smaller than 5 MB');

  const streamId = typeof form.streamId === 'string' && form.streamId ? form.streamId : null;
  if (streamId) {
    const owner = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
    if (!owner) throw notFound('Stream not found');
    if (owner.user_id !== auth.id) throw forbidden('You do not own this stream');
  }

  const key = `thumbnails/${auth.id}/${uuid()}.${extensionFor(file.type, file.name)}`;
  await c.env.AVATARS.put(key, file, {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { userId: auth.id, streamId: streamId ?? '' },
  });

  const url = `/api/media/avatars/${key}`;

  if (streamId) {
    await c.env.DB.prepare(`UPDATE streams SET thumbnail_url = ?, updated_at = ? WHERE id = ?`).bind(url, nowIso(), streamId).run();
  }

  return c.json({ success: true, url, key }, 201);
});

/* --------------------------------- downloads --------------------------------- */

mediaRoutes.get('/recordings/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/media/recordings/', ''));
  return serveFromBucket(c, c.env.RECORDINGS, key);
});

mediaRoutes.get('/avatars/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/media/avatars/', ''));
  return serveFromBucket(c, c.env.AVATARS, key, true);
});

/* --------------------------------- helpers ------------------------------------ */

/** Streams an R2 object back to the client, honouring single-range requests. */
async function serveFromBucket(
  c: { req: { header: (name: string) => string | undefined }; env: Env; json: (body: unknown, status?: number) => Response },
  bucket: R2Bucket,
  key: string,
  cache = false,
): Promise<Response> {
  const rangeHeader = c.req.header('Range');
  const range = parseRange(rangeHeader);

  const object = range
    ? await bucket.get(key, { range: { offset: range.start, length: range.end ? range.end - range.start + 1 : undefined } })
    : await bucket.get(key);

  if (!object) throw notFound('Media not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (cache) headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (range && 'range' in object && object.range) {
    const { offset, length } = object.range as { offset: number; length: number };
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}

function parseRange(header: string | undefined): { start: number; end?: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;
  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : undefined;
  return { start, end };
}

function extensionFor(mime: string, filename?: string): string {
  const fromName = filename?.split('.').pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  return (mime.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '');
}
