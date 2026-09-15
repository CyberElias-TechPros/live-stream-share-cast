import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, jsonField, notFound, readJson, trimOrNull, validateUsername } from '../lib/http';
import { uuid } from '../lib/ids';
import {
  defaultPreferences,
  privateUser,
  publicUser,
  stream,
  streamSession,
  STREAM_FROM,
  STREAM_SELECT,
  type StreamRow,
  type StreamSessionRow,
  type UserRow,
} from '../lib/serialize';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';
import { systemMessage } from '../lib/do';

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

const USER_COLUMNS = `id, email, username, display_name, avatar_url, bio, is_streamer, is_admin,
                      email_verified, followers_count, following_count, preferences, social_links,
                      last_seen, created_at, updated_at`;

/**
 * Same list, alias-qualified. Required for the followers/following joins,
 * where `followers.created_at` would otherwise make `created_at` ambiguous.
 */
const USER_COLUMNS_U = `u.id, u.email, u.username, u.display_name, u.avatar_url, u.bio,
                        u.is_streamer, u.is_admin, u.email_verified, u.followers_count,
                        u.following_count, u.preferences, u.social_links, u.last_seen,
                        u.created_at, u.updated_at`;

/* ------------------------------ the current user ----------------------------- */
/* NOTE: every `/me/*` route must be registered before the `/:id/*` catch-alls   */
/*       below, otherwise `/:id/streams` matches `/me/streams` first.            */


/** Signed-in user's own record (mirrors `GET /api/auth/me`). */
userRoutes.get('/me', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(auth.id).first<UserRow>();
  if (!row) throw notFound('User not found');
  return c.json({ user: privateUser(row), isAdmin: !!row.is_admin });
});

userRoutes.patch('/me', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);

  const updates: Record<string, unknown> = {};
  const binds: unknown[] = [];

  if (body.username !== undefined) {
    const username = validateUsername(body.username);
    const taken = await c.env.DB.prepare(`SELECT id FROM users WHERE lower(username) = ? AND id != ?`)
      .bind(username.toLowerCase(), auth.id)
      .first<{ id: string }>();
    if (taken) throw conflict('That username is already taken', 'username_taken');
    updates.username = username;
  }
  if (body.displayName !== undefined) updates.display_name = trimOrNull(body.displayName, 80);
  if (body.bio !== undefined) updates.bio = trimOrNull(body.bio, 500);
  if (body.avatar !== undefined) updates.avatar_url = trimOrNull(body.avatar, 2000);
  if (body.avatarUrl !== undefined) updates.avatar_url = trimOrNull(body.avatarUrl, 2000);
  if (body.socialLinks !== undefined) updates.social_links = jsonField(body.socialLinks) ?? '[]';
  if (body.preferences !== undefined) updates.preferences = jsonField(body.preferences) ?? JSON.stringify(defaultPreferences());

  if (Object.keys(updates).length === 0) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates)
    .map((column) => `${column} = ?`)
    .join(', ');
  for (const value of Object.values(updates)) binds.push(value);

  await c.env.DB.prepare(`UPDATE users SET ${assignments}, updated_at = ? WHERE id = ?`)
    .bind(...binds, nowIso(), auth.id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(auth.id).first<UserRow>();
  return c.json({ user: row ? privateUser(row) : null });
});

userRoutes.patch('/me/preferences', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const incoming = (body.preferences ?? body) as Record<string, unknown>;

  const current = await c.env.DB.prepare(`SELECT preferences FROM users WHERE id = ?`).bind(auth.id).first<{ preferences: string | null }>();
  const merged = { ...defaultPreferences(), ...(safeParse(current?.preferences) ?? {}), ...(incoming ?? {}) };

  await c.env.DB.prepare(`UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(merged), nowIso(), auth.id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(auth.id).first<UserRow>();
  return c.json({ user: row ? privateUser(row) : null, preferences: merged });
});

userRoutes.post('/me/streamer', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const isStreamer = body.isStreamer === true || body.is_streamer === true;

  await c.env.DB.prepare(`UPDATE users SET is_streamer = ?, updated_at = ? WHERE id = ?`)
    .bind(isStreamer ? 1 : 0, nowIso(), auth.id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(auth.id).first<UserRow>();
  return c.json({ user: row ? privateUser(row) : null });
});

userRoutes.get('/me/streams', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100`,
  )
    .bind(auth.id)
    .all<StreamRow>();
  // The owner is allowed to see their own stream keys.
  return c.json({ streams: (results ?? []).map((row) => stream(row, true)) });
});

userRoutes.get('/me/sessions', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT ss.*, s.title, s.thumbnail_url, s.category, s.tags
       FROM stream_sessions ss JOIN streams s ON s.id = ss.stream_id
      WHERE ss.user_id = ? ORDER BY ss.created_at DESC LIMIT 100`,
  )
    .bind(auth.id)
    .all<StreamSessionRow>();
  return c.json({ sessions: (results ?? []).map(streamSession) });
});

/* --------------------------------- avatars ----------------------------------- */

userRoutes.post('/me/avatar', authGuard, rateLimit({ limit: 30, windowMs: 60_000, name: 'upload', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const form = await c.req.parseBody();
  const file = form.file ?? form.avatar;

  if (!file || typeof file === 'string') throw badRequest('No file provided');
  if (!file.type?.startsWith('image/')) throw badRequest('Avatar must be an image');
  if (file.size > 5 * 1024 * 1024) throw badRequest('Avatar must be smaller than 5 MB');

  const key = `${auth.id}/${uuid()}.${extensionFor(file.type, file.name)}`;
  await c.env.AVATARS.put(key, file, {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000' },
  });

  const url = `/api/media/avatars/${key}`;
  await c.env.DB.prepare(`UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?`).bind(url, nowIso(), auth.id).run();

  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(auth.id).first<UserRow>();
  return c.json({ url, user: row ? privateUser(row) : null });
});


/* ------------------------------- public reads -------------------------------- */

userRoutes.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(c.req.param('id')).first<UserRow>();
  if (!row) throw notFound('User not found');
  return c.json({ user: publicUser(row) });
});

userRoutes.get('/:id/streams', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100`,
  )
    .bind(c.req.param('id'))
    .all<StreamRow>();
  return c.json({ streams: (results ?? []).map((row) => stream(row)) });
});

/** Broadcast history for any user (dashboard, public profile). */
userRoutes.get('/:id/sessions', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ss.*, s.title, s.thumbnail_url, s.category, s.tags
       FROM stream_sessions ss JOIN streams s ON s.id = ss.stream_id
      WHERE ss.user_id = ? ORDER BY ss.created_at DESC LIMIT 100`,
  )
    .bind(c.req.param('id'))
    .all<StreamSessionRow>();
  return c.json({ sessions: (results ?? []).map(streamSession) });
});

userRoutes.get('/:id/followers', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS_U} FROM users u
       JOIN followers f ON f.follower_id = u.id
      WHERE f.following_id = ? ORDER BY f.created_at DESC LIMIT 200`,
  )
    .bind(c.req.param('id'))
    .all<UserRow>();
  return c.json({ users: (results ?? []).map(publicUser) });
});

userRoutes.get('/:id/following', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS_U} FROM users u
       JOIN followers f ON f.following_id = u.id
      WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200`,
  )
    .bind(c.req.param('id'))
    .all<UserRow>();
  return c.json({ users: (results ?? []).map(publicUser) });
});

userRoutes.get('/:id/follow', authGuard, async (c) => {
  const followerId = c.get('authUser')!.id;
  const row = await c.env.DB.prepare(`SELECT 1 AS ok FROM followers WHERE follower_id = ? AND following_id = ?`)
    .bind(followerId, c.req.param('id'))
    .first<{ ok: number }>();
  return c.json({ isFollowing: !!row });
});

/* --------------------------------- following --------------------------------- */

userRoutes.put('/:id/follow', authGuard, async (c) => {
  const followerId = c.get('authUser')!.id;
  const followingId = c.req.param('id');

  if (followerId === followingId) throw badRequest('You cannot follow yourself');

  const target = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(followingId).first<{ id: string }>();
  if (!target) throw notFound('User not found');

  const existing = await c.env.DB.prepare(`SELECT 1 AS ok FROM followers WHERE follower_id = ? AND following_id = ?`)
    .bind(followerId, followingId)
    .first<{ ok: number }>();

  if (!existing) {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO followers (follower_id, following_id) VALUES (?, ?)`).bind(followerId, followingId),
      c.env.DB.prepare(`UPDATE users SET following_count = following_count + 1 WHERE id = ?`).bind(followerId),
      c.env.DB.prepare(`UPDATE users SET followers_count = followers_count + 1 WHERE id = ?`).bind(followingId),
    ]);
    // Notify the room the follower is watching, if they are live right now.
    await announceFollow(c.env, followerId, followingId);
  }

  return c.json({ success: true, isFollowing: true });
});

userRoutes.delete('/:id/follow', authGuard, async (c) => {
  const followerId = c.get('authUser')!.id;
  const followingId = c.req.param('id');

  const deleted = await c.env.DB.prepare(`DELETE FROM followers WHERE follower_id = ? AND following_id = ?`)
    .bind(followerId, followingId)
    .run();

  if ((deleted.meta?.changes ?? 0) > 0) {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE users SET following_count = MAX(following_count - 1, 0) WHERE id = ?`).bind(followerId),
      c.env.DB.prepare(`UPDATE users SET followers_count = MAX(followers_count - 1, 0) WHERE id = ?`).bind(followingId),
    ]);
  }

  return c.json({ success: true, isFollowing: false });
});

/* --------------------------- public profile by handle ------------------------- */

/**
 * Mounted at `/api/profiles` so `GET /api/profiles/:username` reads naturally
 * and cannot collide with the `/api/users/:id` param route.
 */
export const profileRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

profileRoutes.get('/:username', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE lower(username) = lower(?)`)
    .bind(c.req.param('username'))
    .first<UserRow>();
  if (!row) throw notFound('Profile not found');
  return c.json({ user: publicUser(row) });
});

/* --------------------------------- helpers ----------------------------------- */

async function announceFollow(env: Env, followerId: string, followingId: string) {
  const live = await env.DB.prepare(`SELECT id FROM streams WHERE user_id = ? AND is_live = 1 ORDER BY started_at DESC LIMIT 1`)
    .bind(followingId)
    .first<{ id: string }>();
  if (!live) return;

  const follower = await env.DB.prepare(`SELECT username FROM users WHERE id = ?`).bind(followerId).first<{ username: string }>();

  await systemMessage(env, live.id, `${follower?.username ?? 'Someone'} started following the channel`);
}

function extensionFor(mime: string, filename?: string): string {
  const fromName = filename?.split('.').pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  return (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
}

function safeParse(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
