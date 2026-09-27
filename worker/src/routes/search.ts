/**
 * Discovery: unified search, trending rail and "who's live now".
 *
 *   GET /api/search?q=...        streams + channels + VODs + categories
 *   GET /api/search/trending     top live streams, hottest categories, rising creators
 *   GET /api/search/live         lightweight "is anyone live" probe for the hero
 *   GET /api/search/suggest?q=   typeahead (stream titles + usernames)
 */

import { Hono } from 'hono';
import type { AppVariables, Env } from '../env';
import { optionalAuth } from '../lib/auth';
import { int } from '../lib/http';
import { publicUser, STREAM_FROM, STREAM_SELECT, stream, type StreamRow, type UserRow } from '../lib/serialize';

export const searchRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const USER_COLUMNS = `id, email, username, display_name, avatar_url, bio, is_streamer, is_admin,
                      email_verified, followers_count, following_count, preferences, social_links,
                      last_seen, created_at, updated_at`;

function like(term: string): string {
  return `%${term.toLowerCase().replace(/[%_]/g, (match) => `\\${match}`)}%`;
}

/* ---------------------------------- search ----------------------------------- */

searchRoutes.get('/', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const query = (c.req.query('q') ?? c.req.query('search') ?? '').trim();
  const limit = int(c.req.query('limit'), 12, 1, 50);

  if (query.length < 2) {
    return c.json({ query, streams: [], channels: [], recordings: [], categories: [], total: 0 });
  }

  const term = like(query);
  const scope = c.req.query('scope') ?? 'all';
  const wants = (part: string) => scope === 'all' || scope === part;

  const streams = wants('streams')
    ? (
        await c.env.DB.prepare(
          `SELECT ${STREAM_SELECT} ${STREAM_FROM}
            WHERE s.is_live = 1
              AND (lower(s.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(s.description, '')) LIKE ? ESCAPE '\\'
                   OR lower(u.username) LIKE ? ESCAPE '\\' OR lower(COALESCE(s.tags, '')) LIKE ? ESCAPE '\\')
            ORDER BY s.is_live DESC, s.viewer_count DESC LIMIT ?`,
        )
          .bind(term, term, term, term, limit)
          .all<StreamRow>()
      ).results ?? []
    : [];

  const channels = wants('channels')
    ? (
        await c.env.DB.prepare(
          `SELECT ${USER_COLUMNS} FROM users
            WHERE deleted_at IS NULL AND COALESCE(is_banned, 0) = 0
              AND (lower(username) LIKE ? ESCAPE '\\' OR lower(COALESCE(display_name, '')) LIKE ? ESCAPE '\\'
                   OR lower(COALESCE(bio, '')) LIKE ? ESCAPE '\\')
            ORDER BY followers_count DESC LIMIT ?`,
        )
          .bind(term, term, term, limit)
          .all<UserRow>()
      ).results ?? []
    : [];

  const recordings = wants('recordings')
    ? (
        await c.env.DB.prepare(
          `SELECT r.id, r.title, r.url, r.thumbnail_url, r.duration_seconds, r.views, r.created_at,
                  u.username, u.display_name, u.avatar_url
             FROM recordings r JOIN users u ON u.id = r.user_id
            WHERE r.visibility = 'public' AND r.status = 'ready'
              AND (lower(r.title) LIKE ? ESCAPE '\\' OR lower(COALESCE(r.description, '')) LIKE ? ESCAPE '\\')
            ORDER BY r.views DESC, r.created_at DESC LIMIT ?`,
        )
          .bind(term, term, limit)
          .all<Record<string, unknown>>()
      ).results ?? []
    : [];

  const categories = wants('categories')
    ? (
        await c.env.DB.prepare(
          `SELECT slug, name, emoji FROM categories
            WHERE is_active = 1 AND (lower(name) LIKE ? ESCAPE '\\' OR lower(slug) LIKE ? ESCAPE '\\') ORDER BY sort_order LIMIT 8`,
        )
          .bind(term, term)
          .all<{ slug: string; name: string; emoji: string | null }>()
      ).results ?? []
    : [];

  return c.json({
    query,
    streams: streams.map((row) => stream(row, row.user_id === viewerId)),
    channels: channels.map(publicUser),
    recordings: recordings.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      thumbnail: row.thumbnail_url,
      durationSeconds: row.duration_seconds,
      views: row.views ?? 0,
      createdAt: row.created_at,
      username: row.username,
      displayName: row.display_name,
      userAvatar: row.avatar_url,
    })),
    categories: categories.map((row) => ({ slug: row.slug, name: row.name, emoji: row.emoji })),
    total: streams.length + channels.length + recordings.length + categories.length,
  });
});

/* --------------------------------- trending ---------------------------------- */

searchRoutes.get('/trending', optionalAuth, async (c) => {
  const viewerId = c.get('authUser')?.id ?? null;
  const limit = int(c.req.query('limit'), 12, 1, 48);

  const { results: streams } = await c.env.DB.prepare(
    `SELECT ${STREAM_SELECT} ${STREAM_FROM} WHERE s.is_live = 1
      ORDER BY s.viewer_count DESC, s.peak_viewers DESC, s.started_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<StreamRow>();

  const { results: categories } = await c.env.DB.prepare(
    `SELECT LOWER(s.category) AS slug, c.name, c.emoji, COUNT(*) AS live, COALESCE(SUM(s.viewer_count), 0) AS viewers
       FROM streams s LEFT JOIN categories c ON c.slug = LOWER(s.category)
      WHERE s.is_live = 1 AND s.category IS NOT NULL
      GROUP BY LOWER(s.category) ORDER BY viewers DESC LIMIT 8`,
  ).all<{ slug: string; name: string | null; emoji: string | null; live: number; viewers: number }>();

  // "Rising": creators with the most new followers in the last 7 days.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { results: rising } = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS.split(',').map((column) => `u.${column.trim()}`).join(', ')}, COUNT(f.follower_id) AS new_followers
       FROM followers f JOIN users u ON u.id = f.following_id
      WHERE f.created_at >= ? AND COALESCE(u.is_banned, 0) = 0 AND u.deleted_at IS NULL
      GROUP BY u.id ORDER BY new_followers DESC LIMIT 6`,
  )
    .bind(weekAgo)
    .all<UserRow & { new_followers: number }>();

  const { results: upcoming } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.scheduled_for, s.category, u.username, u.display_name, u.avatar_url
       FROM scheduled_streams s JOIN users u ON u.id = s.user_id
      WHERE s.status = 'scheduled' AND s.scheduled_for > ?
      ORDER BY s.scheduled_for ASC LIMIT 6`,
  )
    .bind(new Date().toISOString())
    .all<Record<string, unknown>>();

  return c.json({
    streams: (streams ?? []).map((row) => stream(row, row.user_id === viewerId)),
    categories: (categories ?? []).map((row) => ({
      slug: row.slug,
      name: row.name ?? row.slug,
      emoji: row.emoji,
      liveStreams: row.live,
      viewers: row.viewers,
    })),
    rising: (rising ?? []).map((row) => ({ ...publicUser(row), newFollowers: row.new_followers })),
    upcoming: (upcoming ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      scheduledFor: row.scheduled_for,
      category: row.category,
      username: row.username,
      displayName: row.display_name,
      userAvatar: row.avatar_url,
    })),
  });
});

searchRoutes.get('/live', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS live, COALESCE(SUM(viewer_count), 0) AS viewers FROM streams WHERE is_live = 1`,
  ).first<{ live: number; viewers: number }>();

  return c.json({ live: row?.live ?? 0, viewers: row?.viewers ?? 0 });
});

/* --------------------------------- suggest ----------------------------------- */

searchRoutes.get('/suggest', async (c) => {
  const query = (c.req.query('q') ?? '').trim();
  if (query.length < 2) return c.json({ suggestions: [] });
  const term = like(query);

  const { results: streams } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.is_live, u.username FROM streams s JOIN users u ON u.id = s.user_id
      WHERE lower(s.title) LIKE ? ESCAPE '\\' ORDER BY s.is_live DESC, s.viewer_count DESC LIMIT 6`,
  )
    .bind(term)
    .all<{ id: string; title: string; is_live: number; username: string }>();

  const { results: users } = await c.env.DB.prepare(
    `SELECT username, display_name, avatar_url, is_streamer FROM users
      WHERE lower(username) LIKE ? ESCAPE '\\' OR lower(COALESCE(display_name, '')) LIKE ? ESCAPE '\\'
      ORDER BY followers_count DESC LIMIT 6`,
  )
    .bind(term, term)
    .all<{ username: string; display_name: string | null; avatar_url: string | null; is_streamer: number | null }>();

  return c.json({
    suggestions: [
      ...(streams ?? []).map((row) => ({ type: 'stream' as const, id: row.id, label: row.title, sublabel: `@${row.username}`, isLive: !!row.is_live })),
      ...(users ?? []).map((row) => ({
        type: 'channel' as const,
        id: row.username,
        label: row.display_name ?? row.username,
        sublabel: `@${row.username}`,
        avatar: row.avatar_url,
        isStreamer: !!row.is_streamer,
      })),
    ].slice(0, 10),
  });
});
