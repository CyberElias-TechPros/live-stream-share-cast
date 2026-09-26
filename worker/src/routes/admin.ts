/**
 * Admin console API (`/api/admin`).
 *
 * Guarded by `requireAdmin` — either a signed-in user with `is_admin = 1` or the
 * `X-Cleanup-Token` header (for CI / cron jobs that must not depend on a user
 * account).
 *
 *   GET    /api/admin/overview              platform metrics + integration readiness
 *   GET    /api/admin/users                 search / list accounts
 *   POST   /api/admin/users/:id/ban         site ban (permanent or timed)
 *   POST   /api/admin/users/:id/unban       lift every active site ban
 *   POST   /api/admin/users/:id/role        grant/revoke admin or streamer
 *   POST   /api/admin/users/:id/verify      mark email verified
 *   DELETE /api/admin/users/:id             soft-delete (GDPR erase)
 *   GET    /api/admin/streams               moderation view of all streams
 *   POST   /api/admin/streams/:id/end       force a broadcast offline
 *   DELETE /api/admin/streams/:id           delete a stream + recording
 *   GET    /api/admin/reports               moderation queue
 *   PATCH  /api/admin/reports/:id           resolve / dismiss / reopen
 *   GET    /api/admin/bans                  active bans
 *   DELETE /api/admin/bans/:id              revoke a ban
 *   GET    /api/admin/audit                 audit trail
 *   GET    /api/admin/email                 outbox contents + delivery stats
 *   POST   /api/admin/email/flush           deliver queued mail now
 *   POST   /api/admin/email/test            send a test email
 *   GET    /api/admin/errors                client error feed
 *   GET    /api/admin/flags                 feature flags
 *   PUT    /api/admin/flags/:key            toggle a flag
 *   GET    /api/admin/categories            full taxonomy (incl. inactive)
 *   POST   /api/admin/categories            create
 *   PATCH  /api/admin/categories/:slug      update
 *   GET    /api/admin/payments              tips ledger + totals
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAdmin } from '../lib/auth';
import { badRequest, conflict, forbidden, int, notFound, readJson, trimOrNull } from '../lib/http';
import { auditEntry, recordAudit } from '../lib/audit';
import { drainOutbox, emailComposers, sendEmail } from '../lib/email';
import { emailConfig, integrationStatus } from '../lib/config';
import { issueBan, revokeBan } from '../lib/moderation';
import { platformAnalytics } from '../lib/analytics';
import { broadcastToStream } from '../lib/do';
import { createNotification } from '../lib/notifications';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * The cleanup token is accepted in place of a user session so scheduled jobs and
 * CI can call admin endpoints. A normal user must be an administrator.
 */
const adminGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const provided = c.req.header('X-Cleanup-Token') ?? '';
  const expected = c.env.CLEANUP_TOKEN;
  if (expected && provided && provided === expected) {
    c.set('authUser', { id: 'system', email: 'system@local', username: 'system', isAdmin: true, scopes: ['admin'] });
    await next();
    return;
  }
  return requireAdmin(c, next);
};

/* --------------------------------- overview ---------------------------------- */

adminRoutes.get('/overview', adminGuard, async (c) => {
  const analytics = await platformAnalytics(c.env);
  const integrations = integrationStatus(c.env);

  const storage = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM streams WHERE recording_key IS NOT NULL) AS recordings,
            (SELECT COUNT(*) FROM recordings WHERE status = 'ready') AS vods,
            (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports`,
  ).first<{ recordings: number; vods: number; open_reports: number }>();

  return c.json({
    analytics,
    storage: {
      recordings: storage?.recordings ?? 0,
      vods: storage?.vods ?? 0,
      openReports: storage?.open_reports ?? 0,
    },
    integrations,
    email: { provider: emailConfig(c.env).provider, configured: emailConfig(c.env).configured },
    version: c.env.APP_VERSION ?? 'dev',
    environment: c.env.ENVIRONMENT ?? 'development',
  });
});

/* ----------------------------------- users ----------------------------------- */

adminRoutes.get('/users', adminGuard, async (c) => {
  const limit = int(c.req.query('limit'), 25, 1, 100);
  const offset = int(c.req.query('offset'), 0, 0, 100_000);
  const search = (c.req.query('search') ?? '').trim().toLowerCase();

  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (search) {
    where.push(`(lower(email) LIKE ? OR lower(username) LIKE ? OR lower(COALESCE(display_name, '')) LIKE ?)`);
    const term = `%${search}%`;
    binds.push(term, term, term);
  }
  if (c.req.query('streamers') === 'true') where.push('is_streamer = 1');
  if (c.req.query('banned') === 'true') where.push('is_banned = 1');
  if (c.req.query('admins') === 'true') where.push('is_admin = 1');

  const { results } = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, avatar_url, is_streamer, is_admin, is_banned, ban_reason,
            suspended_until, email_verified, followers_count, created_at, last_seen
       FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<Record<string, unknown>>();

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE ${where.join(' AND ')}`)
    .bind(...binds)
    .first<{ count: number }>();

  return c.json({
    users: (results ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar_url,
      isStreamer: !!row.is_streamer,
      isAdmin: !!row.is_admin,
      isBanned: !!row.is_banned,
      banReason: row.ban_reason,
      suspendedUntil: row.suspended_until,
      emailVerified: !!row.email_verified,
      followers: row.followers_count ?? 0,
      createdAt: row.created_at,
      lastSeen: row.last_seen,
    })),
    total: total?.count ?? 0,
    limit,
    offset,
  });
});

adminRoutes.post('/users/:id/ban', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const userId = c.req.param('id');

  const target = await c.env.DB.prepare(`SELECT id, is_admin FROM users WHERE id = ?`).bind(userId).first<{ id: string; is_admin: number | null }>();
  if (!target) throw notFound('User not found');
  if (target.is_admin && actor.id !== 'system') throw forbidden('Administrators cannot be banned from the console');

  const durationMinutes = body.durationMinutes === undefined || body.durationMinutes === null ? null : int(body.durationMinutes, 60, 1, 60 * 24 * 365);
  const reason = trimOrNull(body.reason, 500) ?? 'Violation of the community guidelines';

  const banId = await issueBan(c.env, {
    userId,
    scope: 'site',
    kind: durationMinutes ? 'timeout' : 'ban',
    reason,
    issuedBy: actor.id === 'system' ? null : actor.id,
    durationMinutes,
  });

  await createNotification(c.env, {
    userId,
    type: 'moderation',
    title: durationMinutes ? 'Your account is suspended' : 'Your account is banned',
    body: reason,
    force: true,
    email: {
      subject: durationMinutes ? 'Account suspended' : 'Account banned',
      heading: durationMinutes ? 'Your account has been suspended' : 'Your account has been banned',
      paragraphs: [
        `Reason: ${reason}`,
        durationMinutes ? `Your account will be restored in ${durationMinutes} minutes.` : 'This action is permanent.',
        'If you believe this was a mistake, reply to this email to appeal.',
      ],
    },
  });

  await recordAudit(c.env, {
    actorId: actor.id,
    actorRole: 'admin',
    action: 'user.banned',
    targetType: 'user',
    targetId: userId,
    metadata: { reason, durationMinutes, banId },
    ip: c.req.header('CF-Connecting-IP'),
  });

  return c.json({ success: true, banId });
});

adminRoutes.post('/users/:id/unban', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const userId = c.req.param('id');

  const { results } = await c.env.DB.prepare(`SELECT id FROM bans WHERE user_id = ? AND scope = 'site' AND revoked_at IS NULL`)
    .bind(userId)
    .all<{ id: string }>();

  for (const row of results ?? []) await revokeBan(c.env, row.id, actor.id === 'system' ? null : actor.id);

  await c.env.DB.prepare(`UPDATE users SET is_banned = 0, ban_reason = NULL, suspended_until = NULL, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), userId)
    .run();

  await createNotification(c.env, {
    userId,
    type: 'moderation',
    title: 'Your account has been restored',
    body: 'The restriction on your account has been lifted.',
    force: true,
  });

  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'user.unbanned', targetType: 'user', targetId: userId });

  return c.json({ success: true, lifted: results?.length ?? 0 });
});

adminRoutes.post('/users/:id/role', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const userId = c.req.param('id');

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (body.isAdmin !== undefined) {
    if (userId === actor.id && body.isAdmin === false) throw badRequest('You cannot remove your own admin access');
    updates.push('is_admin = ?');
    binds.push(body.isAdmin ? 1 : 0);
  }
  if (body.isStreamer !== undefined) {
    updates.push('is_streamer = ?');
    binds.push(body.isStreamer ? 1 : 0);
  }
  if (body.emailVerified !== undefined) {
    updates.push('email_verified = ?');
    binds.push(body.emailVerified ? 1 : 0);
  }
  if (!updates.length) throw badRequest('Nothing to update');

  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...binds, nowIso(), userId)
    .run();

  await recordAudit(c.env, {
    actorId: actor.id,
    actorRole: 'admin',
    action: 'user.role_changed',
    targetType: 'user',
    targetId: userId,
    metadata: body,
  });

  return c.json({ success: true });
});

adminRoutes.post('/users/:id/verify', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  await c.env.DB.prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`).bind(nowIso(), c.req.param('id')).run();
  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'user.role_changed', targetType: 'user', targetId: c.req.param('id'), metadata: { emailVerified: true } });
  return c.json({ success: true });
});

/* ---------------------------------- streams ---------------------------------- */

adminRoutes.get('/streams', adminGuard, async (c) => {
  const limit = int(c.req.query('limit'), 25, 1, 100);
  const live = c.req.query('live');

  const where: string[] = ['1 = 1'];
  if (live === 'true') where.push('s.is_live = 1');
  if (live === 'false') where.push('s.is_live = 0');

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.is_live, s.viewer_count, s.category, s.created_at, s.started_at,
            u.id AS user_id, u.username, u.is_banned
       FROM streams s JOIN users u ON u.id = s.user_id
      WHERE ${where.join(' AND ')} ORDER BY s.is_live DESC, s.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<Record<string, unknown>>();

  return c.json({
    streams: (results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      isLive: !!row.is_live,
      viewerCount: row.viewer_count ?? 0,
      category: row.category,
      createdAt: row.created_at,
      startedAt: row.started_at,
      userId: row.user_id,
      username: row.username,
      userBanned: !!row.is_banned,
    })),
  });
});

adminRoutes.post('/streams/:id/end', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const id = c.req.param('id');
  const body = await readJson(c);

  const stream = await c.env.DB.prepare(`SELECT id, user_id FROM streams WHERE id = ?`).bind(id).first<{ id: string; user_id: string }>();
  if (!stream) throw notFound('Stream not found');

  const now = nowIso();
  await c.env.DB.prepare(`UPDATE streams SET is_live = 0, host_connected = 0, viewer_count = 0, ended_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, id)
    .run();
  await c.env.DB.prepare(
    `UPDATE stream_sessions SET ended_at = ?, duration = CAST((strftime('%s', ?) - strftime('%s', started_at)) AS INTEGER) WHERE stream_id = ? AND ended_at IS NULL`,
  )
    .bind(now, now, id)
    .run();

  await broadcastToStream(c.env, id, { type: 'stream', status: 'offline', streamId: id, moderatorAction: true });

  await createNotification(c.env, {
    userId: stream.user_id,
    type: 'moderation',
    title: 'Your broadcast was ended by a moderator',
    body: trimOrNull(body.reason, 500),
    force: true,
  });

  await recordAudit(c.env, {
    actorId: actor.id,
    actorRole: 'admin',
    action: 'stream.force_ended',
    targetType: 'stream',
    targetId: id,
    metadata: { reason: body.reason ?? null },
  });

  return c.json({ success: true });
});

adminRoutes.delete('/streams/:id', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const id = c.req.param('id');

  const stream = await c.env.DB.prepare(`SELECT id, recording_key FROM streams WHERE id = ?`)
    .bind(id)
    .first<{ id: string; recording_key: string | null }>();
  if (!stream) throw notFound('Stream not found');

  if (stream.recording_key) await c.env.RECORDINGS.delete(stream.recording_key).catch(() => undefined);
  await c.env.DB.prepare(`DELETE FROM streams WHERE id = ?`).bind(id).run();

  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'stream.deleted', targetType: 'stream', targetId: id });

  return c.json({ success: true });
});

/* ---------------------------------- reports ---------------------------------- */

adminRoutes.get('/reports', adminGuard, async (c) => {
  const status = c.req.query('status') ?? 'open';
  const limit = int(c.req.query('limit'), 25, 1, 100);

  const { results } = await c.env.DB.prepare(
    `SELECT r.*, u.username AS reporter_username, h.username AS handler_username,
            t.title AS stream_title,
            (SELECT title FROM streams WHERE id = r.stream_id) AS context_title
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       LEFT JOIN users h ON h.id = r.handled_by
       LEFT JOIN streams t ON t.id = r.stream_id
      WHERE (? = 'all' OR r.status = ?)
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC
      LIMIT ?`,
  )
    .bind(status, status, limit)
    .all<Record<string, unknown>>();

  return c.json({
    reports: (results ?? []).map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      streamId: row.stream_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      reporterId: row.reporter_id,
      reporterUsername: row.reporter_username,
      handlerUsername: row.handler_username,
      resolutionNote: row.resolution_note,
      handledAt: row.handled_at,
      createdAt: row.created_at,
      context: row.context_title ?? row.stream_title ?? null,
    })),
  });
});

adminRoutes.patch('/reports/:id', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const status = String(body.status ?? '');
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) throw badRequest('Invalid status');

  const result = await c.env.DB.prepare(
    `UPDATE reports SET status = ?, resolution_note = ?, handled_by = ?, handled_at = ? WHERE id = ?`,
  )
    .bind(status, trimOrNull(body.resolutionNote, 1000), actor.id === 'system' ? null : actor.id, status === 'open' ? null : nowIso(), c.req.param('id'))
    .run();

  if (!result.meta?.changes) throw notFound('Report not found');

  await recordAudit(c.env, {
    actorId: actor.id,
    actorRole: 'admin',
    action: 'report.updated',
    targetType: 'report',
    targetId: c.req.param('id'),
    metadata: { status },
  });

  return c.json({ success: true });
});

/* ----------------------------------- bans ------------------------------------ */

adminRoutes.get('/bans', adminGuard, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.user_id, b.scope, b.kind, b.reason, b.expires_at, b.created_at, u.username, u.email
       FROM bans b JOIN users u ON u.id = b.user_id
      WHERE b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > ?)
      ORDER BY b.created_at DESC LIMIT 200`,
  )
    .bind(nowIso())
    .all<Record<string, unknown>>();

  return c.json({
    bans: (results ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      email: row.email,
      scope: row.scope,
      kind: row.kind,
      reason: row.reason,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  });
});

adminRoutes.delete('/bans/:id', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const lifted = await revokeBan(c.env, c.req.param('id'), actor.id === 'system' ? null : actor.id);
  if (!lifted) throw notFound('Ban not found');
  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'user.unbanned', targetType: 'ban', targetId: c.req.param('id') });
  return c.json({ success: true });
});

/* ----------------------------------- audit ----------------------------------- */

adminRoutes.get('/audit', adminGuard, async (c) => {
  const limit = int(c.req.query('limit'), 50, 1, 200);
  const action = c.req.query('action');

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_log ${action ? 'WHERE action = ?' : ''} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...(action ? [action, limit] : [limit]))
    .all<Parameters<typeof auditEntry>[0]>();

  return c.json({ entries: (results ?? []).map(auditEntry) });
});

/* ----------------------------------- email ----------------------------------- */

adminRoutes.get('/email', adminGuard, async (c) => {
  const status = c.req.query('status') ?? 'all';
  const limit = int(c.req.query('limit'), 50, 1, 200);

  const { results } = await c.env.DB.prepare(
    `SELECT id, to_email, template, subject, status, attempts, last_error, provider, provider_message_id, scheduled_at, sent_at, created_at
       FROM email_outbox WHERE (? = 'all' OR status = ?) ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(status, status, limit)
    .all<Record<string, unknown>>();

  const counts = await c.env.DB.prepare(`SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status`).all<{ status: string; count: number }>();

  return c.json({
    emails: (results ?? []).map((row) => ({
      id: row.id,
      to: row.to_email,
      template: row.template,
      subject: row.subject,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    })),
    counts: Object.fromEntries((counts.results ?? []).map((row) => [row.status, row.count])),
    provider: emailConfig(c.env).provider,
  });
});

adminRoutes.post('/email/flush', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const report = await drainOutbox(c.env, int(body.limit, 50, 1, 200));
  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'admin.email_flush', metadata: report });
  return c.json({ success: true, report });
});

adminRoutes.post('/email/test', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const to = typeof body.to === 'string' && body.to.includes('@') ? body.to : actor.email;

  const config = emailConfig(c.env);
  if (!config.configured) {
    throw conflict('No email provider is configured (set RESEND_API_KEY or EMAIL_WEBHOOK_URL)', 'email_not_configured');
  }

  const queued = await sendEmail(c.env, emailComposers(c.env).test(to));
  const report = queued ? await drainOutbox(c.env, 1, queued.id) : null;

  return c.json({ success: !!report?.sent, provider: config.provider, report });
});

/* ------------------------------- client errors ------------------------------- */

adminRoutes.get('/errors', adminGuard, async (c) => {
  const limit = int(c.req.query('limit'), 50, 1, 200);
  const { results } = await c.env.DB.prepare(`SELECT * FROM client_errors ORDER BY updated_at DESC, created_at DESC LIMIT ?`)
    .bind(limit)
    .all<Record<string, unknown>>();

  return c.json({
    errors: (results ?? []).map((row) => ({
      id: row.id,
      message: row.message,
      stack: row.stack,
      url: row.url,
      userAgent: row.user_agent,
      appVersion: row.app_version,
      occurrences: row.occurrences,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

adminRoutes.delete('/errors/:id', adminGuard, async (c) => {
  await c.env.DB.prepare(`DELETE FROM client_errors WHERE id = ?`).bind(c.req.param('id')).run();
  return c.json({ success: true });
});

/* ------------------------------- feature flags ------------------------------- */

adminRoutes.get('/flags', adminGuard, async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM feature_flags ORDER BY key ASC`).all<Record<string, unknown>>();
  return c.json({
    flags: (results ?? []).map((row) => ({
      key: row.key,
      enabled: !!row.enabled,
      value: row.value,
      description: row.description,
      updatedAt: row.updated_at,
    })),
  });
});

adminRoutes.put('/flags/:key', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const key = c.req.param('key');

  await c.env.DB.prepare(
    `INSERT INTO feature_flags (key, enabled, value, description, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, body.enabled ? 1 : 0, body.value === undefined ? null : JSON.stringify(body.value), trimOrNull(body.description, 300), nowIso())
    .run();

  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'flag.updated', targetType: 'flag', targetId: key, metadata: body });

  return c.json({ success: true });
});

/* --------------------------------- categories -------------------------------- */

adminRoutes.get('/categories', adminGuard, async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM categories ORDER BY sort_order ASC, name ASC`).all<Record<string, unknown>>();
  return c.json({ categories: results ?? [] });
});

adminRoutes.post('/categories', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const slug = trimOrNull(body.slug, 40)?.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = trimOrNull(body.name, 60);
  if (!slug || !name) throw badRequest('slug and name are required');

  const existing = await c.env.DB.prepare(`SELECT slug FROM categories WHERE slug = ?`).bind(slug).first<{ slug: string }>();
  if (existing) throw conflict('That category already exists');

  await c.env.DB.prepare(`INSERT INTO categories (slug, name, description, emoji, color, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(slug, name, trimOrNull(body.description, 200), trimOrNull(body.emoji, 8), trimOrNull(body.color, 20), int(body.sortOrder, 500, 0, 10_000), body.isActive === false ? 0 : 1)
    .run();

  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'category.updated', targetType: 'category', targetId: slug, metadata: { created: true } });

  return c.json({ success: true, slug }, 201);
});

adminRoutes.patch('/categories/:slug', adminGuard, async (c) => {
  const actor = c.get('authUser')!;
  const body = await readJson(c);
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = trimOrNull(body.name, 60);
  if (body.description !== undefined) updates.description = trimOrNull(body.description, 200);
  if (body.emoji !== undefined) updates.emoji = trimOrNull(body.emoji, 8);
  if (body.color !== undefined) updates.color = trimOrNull(body.color, 20);
  if (body.sortOrder !== undefined) updates.sort_order = int(body.sortOrder, 500, 0, 10_000);
  if (body.isActive !== undefined) updates.is_active = body.isActive ? 1 : 0;
  if (!Object.keys(updates).length) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
  const result = await c.env.DB.prepare(`UPDATE categories SET ${assignments} WHERE slug = ?`)
    .bind(...Object.values(updates), c.req.param('slug'))
    .run();
  if (!result.meta?.changes) throw notFound('Category not found');

  await recordAudit(c.env, { actorId: actor.id, actorRole: 'admin', action: 'category.updated', targetType: 'category', targetId: c.req.param('slug'), metadata: updates });

  return c.json({ success: true });
});

/* ---------------------------------- payments --------------------------------- */

adminRoutes.get('/payments', adminGuard, async (c) => {
  const limit = int(c.req.query('limit'), 50, 1, 200);

  const { results } = await c.env.DB.prepare(
    `SELECT t.*, s.username AS streamer_username, u.username AS tipper_username
       FROM tips t
       LEFT JOIN users s ON s.id = t.streamer_id
       LEFT JOIN users u ON u.id = t.tipper_id
      ORDER BY t.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<Record<string, unknown>>();

  const totals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0) AS paid_cents,
            COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count
       FROM tips`,
  ).first<{ paid_cents: number; paid_count: number; pending_count: number }>();

  return c.json({
    tips: (results ?? []).map((row) => ({
      id: row.id,
      streamerUsername: row.streamer_username,
      tipperUsername: row.tipper_username,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: row.message,
      status: row.status,
      provider: row.provider,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    })),
    totals: {
      paidCents: totals?.paid_cents ?? 0,
      paidCount: totals?.paid_count ?? 0,
      pendingCount: totals?.pending_count ?? 0,
    },
  });
});

/** Admin-initiated rate limit probe (kept small; real limits live per-route). */
adminRoutes.get('/ping', rateLimit({ limit: 60, windowMs: 60_000, name: 'admin-ping' }), (c) =>
  c.json({ ok: true, requestId: c.get('requestId') ?? null, at: nowIso() }),
);
