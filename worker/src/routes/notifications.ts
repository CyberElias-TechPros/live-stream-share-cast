/**
 * Notification inbox + delivery preferences + web-push subscriptions.
 *
 *   GET    /api/notifications                 list (paginated, filterable)
 *   GET    /api/notifications/unread-count    badge count (polled by the bell)
 *   POST   /api/notifications/:id/read        mark one read
 *   POST   /api/notifications/read-all        mark everything read
 *   DELETE /api/notifications/:id             dismiss
 *   GET    /api/notifications/preferences     per-category toggles
 *   PUT    /api/notifications/preferences     update toggles
 *   POST   /api/notifications/push/subscribe  register a Web Push subscription
 *   DELETE /api/notifications/push/subscribe  remove it
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { badRequest, int, notFound, readJson } from '../lib/http';
import { parseJson, defaultPreferences } from '../lib/serialize';
import { nowIso } from '../lib/time';
import { uuid } from '../lib/ids';

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  actor_id: string | null;
  stream_id: string | null;
  data: string | null;
  read_at: string | null;
  created_at: string;
  actor_username?: string | null;
  actor_avatar?: string | null;
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    actorId: row.actor_id,
    actorUsername: row.actor_username ?? null,
    actorAvatar: row.actor_avatar ?? null,
    streamId: row.stream_id,
    data: parseJson<unknown>(row.data, null),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/* ----------------------------------- inbox ----------------------------------- */

notificationRoutes.get('/', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const limit = int(c.req.query('limit'), 30, 1, 100);
  const offset = int(c.req.query('offset'), 0, 0, 10_000);
  const unreadOnly = c.req.query('unread') === 'true';
  const type = c.req.query('type');

  const where: string[] = ['n.user_id = ?'];
  const binds: unknown[] = [auth.id];
  if (unreadOnly) where.push('n.read_at IS NULL');
  if (type) {
    where.push('n.type = ?');
    binds.push(type);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT n.*, u.username AS actor_username, u.avatar_url AS actor_avatar
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE ${where.join(' AND ')}
      ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<NotificationRow>();

  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL`)
    .bind(auth.id)
    .first<{ count: number }>();

  return c.json({
    notifications: (results ?? []).map(mapNotification),
    unreadCount: unread?.count ?? 0,
    limit,
    offset,
  });
});

notificationRoutes.get('/unread-count', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL`)
    .bind(auth.id)
    .first<{ count: number }>();
  return c.json({ unreadCount: row?.count ?? 0 });
});

notificationRoutes.post('/:id/read', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`)
    .bind(nowIso(), c.req.param('id'), auth.id)
    .run();
  if (!result.meta?.changes) throw notFound('Notification not found');
  return c.json({ success: true });
});

notificationRoutes.post('/read-all', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`)
    .bind(nowIso(), auth.id)
    .run();
  return c.json({ success: true, updated: result.meta?.changes ?? 0 });
});

notificationRoutes.delete('/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).bind(c.req.param('id'), auth.id).run();
  if (!result.meta?.changes) throw notFound('Notification not found');
  return c.json({ success: true });
});

/* -------------------------------- preferences -------------------------------- */

notificationRoutes.get('/preferences', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT preferences FROM users WHERE id = ?`).bind(auth.id).first<{ preferences: string | null }>();
  const stored = (parseJson<Record<string, unknown> | null>(row?.preferences ?? null, null) ?? {}) as Record<string, unknown>;
  const defaults = defaultPreferences();
  return c.json({ preferences: { ...defaults.notifications, ...(stored.notifications as object | undefined) } });
});

notificationRoutes.put('/preferences', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const incoming = (body.preferences ?? body) as Record<string, unknown>;

  const row = await c.env.DB.prepare(`SELECT preferences FROM users WHERE id = ?`).bind(auth.id).first<{ preferences: string | null }>();
  const stored = (parseJson<Record<string, unknown> | null>(row?.preferences ?? null, null) ?? {}) as Record<string, unknown>;

  const next = {
    ...stored,
    notifications: {
      ...defaultPreferences().notifications,
      ...((stored.notifications as object | undefined) ?? {}),
      // Only accept known keys so a client cannot bloat the JSON blob.
      ...Object.fromEntries(
        Object.entries(incoming)
          .filter(([key, value]) => ['email', 'push', 'streamStart', 'comments', 'followers'].includes(key) && typeof value === 'boolean')
          .slice(0, 5),
      ),
    },
  };

  await c.env.DB.prepare(`UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(next), nowIso(), auth.id)
    .run();

  return c.json({ success: true, preferences: next.notifications });
});

/* --------------------------------- web push ---------------------------------- */

notificationRoutes.post('/push/subscribe', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim().slice(0, 800) : '';
  if (!endpoint) throw badRequest('A push endpoint is required');

  const keys = (body.keys ?? {}) as Record<string, unknown>;

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
  )
    .bind(
      uuid(),
      auth.id,
      endpoint,
      typeof keys.p256dh === 'string' ? keys.p256dh.slice(0, 300) : null,
      typeof keys.auth === 'string' ? keys.auth.slice(0, 300) : null,
      c.req.header('User-Agent')?.slice(0, 300) ?? null,
      nowIso(),
    )
    .run();

  return c.json({ success: true });
});

notificationRoutes.delete('/push/subscribe', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) throw badRequest('An endpoint is required to unsubscribe');

  await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).bind(auth.id, endpoint).run();
  return c.json({ success: true });
});
