import { z } from 'zod';
import type { Ctx } from '../router';
import { apiError, corsHeaders, json, nowISO, readJson, toPublicStream, toPublicUser, STREAM_SELECT_HOST, type PublicUser, type UserRow } from '../util';
import { getSessionUser } from '../auth';

const AVATAR_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(32),
  url: z.string().trim().max(200).regex(URL_RE, 'Links must be http(s) URLs'),
});

export const preferencesSchema = z
  .object({
    streaming: z
      .object({
        defaultResolution: z.enum(['1080p', '720p', '480p']).optional(),
        defaultFps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
        autoRecord: z.boolean().optional(),
        recordingRetentionHours: z.number().int().min(6).max(168).optional(),
      })
      .optional(),
  })
  .strict();

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(32),
    bio: z.string().trim().max(500),
    avatarColor: z.string().trim().regex(AVATAR_COLOR_RE, 'Invalid color'),
    socialLinks: z.array(socialLinkSchema).max(6),
    preferences: preferencesSchema,
  })
  .partial();

// PATCH /api/users/me
export async function handleUpdateMe(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));

  const body = await readJson(req);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input', corsHeaders(env, req));
  }
  const data = parsed.data;

  const current = await env.DB.prepare('SELECT preferences, social_links FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<{ preferences: string; social_links: string }>();

  let preferencesJson = '{}';
  if (data.preferences) {
    let existing: Record<string, unknown> = {};
    try {
      const p = JSON.parse(current?.preferences ?? '{}');
      if (p && typeof p === 'object' && !Array.isArray(p)) existing = p;
    } catch { /* reset */ }
    preferencesJson = JSON.stringify({ ...existing, ...data.preferences });
  }

  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (data.displayName !== undefined) { sets.push('display_name = ?'); binds.push(data.displayName); }
  if (data.bio !== undefined) { sets.push('bio = ?'); binds.push(data.bio); }
  if (data.avatarColor !== undefined) { sets.push('avatar_color = ?'); binds.push(data.avatarColor); }
  if (data.socialLinks !== undefined) { sets.push('social_links = ?'); binds.push(JSON.stringify(data.socialLinks)); }
  if (data.preferences) { sets.push('preferences = ?'); binds.push(preferencesJson); }
  sets.push('updated_at = ?');
  binds.push(nowISO());
  binds.push(auth.user.id);

  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first<UserRow>();
  return json({ user: row ? toPublicUser(row) : null }, 200, corsHeaders(env, req));
}

// GET /api/users/:username — public profile
export async function handleGetProfile(ctx: Ctx): Promise<Response> {
  const { req, env, params } = ctx;
  const username = (params.username ?? '').toLowerCase();
  const row = await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first<UserRow>();
  if (!row) return apiError(404, 'not_found', 'Profile not found', corsHeaders(env, req));

  const streams = await env.DB.prepare(
    `SELECT ${STREAM_SELECT_HOST} FROM streams JOIN users ON users.id = streams.user_id
     WHERE streams.user_id = ? ORDER BY streams.is_live DESC, streams.created_at DESC LIMIT 24`
  )
    .bind(row.id)
    .all<Parameters<typeof toPublicStream>[0]>();

  const sessions = await env.DB.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(duration_seconds), 0) AS total FROM stream_sessions WHERE user_id = ? AND ended_at IS NOT NULL'
  )
    .bind(row.id)
    .first<{ n: number; total: number }>();

  const auth = await getSessionUser(env, req);
  let isFollowing = false;
  if (auth && auth.user.id !== row.id) {
    const f = await env.DB.prepare('SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?')
      .bind(auth.user.id, row.id)
      .first();
    isFollowing = !!f;
  }

  return json(
    {
      profile: {
        ...toPublicUser(row),
        isSelf: auth?.user.id === row.id,
        isFollowing,
        broadcastCount: sessions?.n ?? 0,
        totalBroadcastSeconds: sessions?.total ?? 0,
      },
      streams: streams.results.map(toPublicStream),
    },
    200,
    corsHeaders(env, req)
  );
}

async function userIdByUsername(db: Ctx['env']['DB'], username: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(username).first<{ id: string }>();
  return row?.id ?? null;
}

// POST /api/users/:username/follow
export async function handleFollow(ctx: Ctx): Promise<Response> {
  const { req, env, params } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Sign in to follow streamers', corsHeaders(env, req));
  const targetId = await userIdByUsername(env.DB, params.username ?? '');
  if (!targetId) return apiError(404, 'not_found', 'Profile not found', corsHeaders(env, req));
  if (targetId === auth.user.id) return apiError(400, 'self_follow', 'You cannot follow yourself', corsHeaders(env, req));

  const result = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)').bind(auth.user.id, targetId, nowISO()),
    env.DB.prepare('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?').bind(targetId),
    env.DB.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').bind(auth.user.id),
  ]);
  const inserted = (result[0]?.meta?.changes ?? 0) > 0;
  const followers = await env.DB.prepare('SELECT followers_count FROM users WHERE id = ?').bind(targetId).first<{ followers_count: number }>();
  return json({ following: true, changed: inserted, followersCount: followers?.followers_count ?? 0 }, 200, corsHeaders(env, req));
}

// DELETE /api/users/:username/follow
export async function handleUnfollow(ctx: Ctx): Promise<Response> {
  const { req, env, params } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Sign in to manage follows', corsHeaders(env, req));
  const targetId = await userIdByUsername(env.DB, params.username ?? '');
  if (!targetId) return apiError(404, 'not_found', 'Profile not found', corsHeaders(env, req));
  if (targetId === auth.user.id) return apiError(400, 'self_follow', 'You cannot follow yourself', corsHeaders(env, req));

  const result = await env.DB.batch([
    env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(auth.user.id, targetId),
    env.DB.prepare('UPDATE users SET followers_count = MAX(followers_count - 1, 0) WHERE id = ?').bind(targetId),
    env.DB.prepare('UPDATE users SET following_count = MAX(following_count - 1, 0) WHERE id = ?').bind(auth.user.id),
  ]);
  const removed = (result[0]?.meta?.changes ?? 0) > 0;
  const followers = await env.DB.prepare('SELECT followers_count FROM users WHERE id = ?').bind(targetId).first<{ followers_count: number }>();
  return json({ following: false, changed: removed, followersCount: followers?.followers_count ?? 0 }, 200, corsHeaders(env, req));
}

// GET /api/sessions — the current user's broadcast history
export async function handleMySessions(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));
  const rows = await env.DB.prepare(
    `SELECT ss.*, s.title AS stream_title FROM stream_sessions ss
     JOIN streams s ON s.id = ss.stream_id
     WHERE ss.user_id = ? ORDER BY ss.started_at DESC LIMIT 30`
  )
    .bind(auth.user.id)
    .all<{
      id: string; stream_id: string; stream_title: string; started_at: string; ended_at: string | null;
      duration_seconds: number | null; peak_viewers: number;
    }>();
  return json(
    {
      sessions: rows.results.map((r) => ({
        id: r.id,
        streamId: r.stream_id,
        streamTitle: r.stream_title,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        durationSeconds: r.duration_seconds,
        peakViewers: r.peak_viewers,
      })),
    },
    200,
    corsHeaders(env, req)
  );
}

export type { PublicUser };
