/**
 * Community safety: reports, blocking, and channel-level chat rules.
 *
 *   POST   /api/moderation/reports                    report a user/stream/message/recording
 *   GET    /api/moderation/reports/mine               my submitted reports + status
 *   GET    /api/moderation/blocks                     users I blocked
 *   POST   /api/moderation/blocks/:userId             block
 *   DELETE /api/moderation/blocks/:userId             unblock
 *   GET    /api/moderation/chat/:streamId/settings    chat rules (owner/mods)
 *   PUT    /api/moderation/chat/:streamId/settings    update chat rules (owner)
 *   GET    /api/moderation/chat/:streamId/restrictions list timeouts/bans (owner/mods)
 *   POST   /api/moderation/chat/:streamId/restrictions timeout/ban a chatter
 *   DELETE /api/moderation/chat/:streamId/restrictions/:userId lift a restriction
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { badRequest, forbidden, int, notFound, readJson, trimOrNull, conflict } from '../lib/http';
import { chatSettingsFor, issueBan, revokeBan, saveChatSettings, type ChatSettings } from '../lib/moderation';
import { recordAudit } from '../lib/audit';
import { uuid } from '../lib/ids';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';
import { dispatchWebhook } from '../lib/webhook';
import { createNotification } from '../lib/notifications';

export const moderationRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

const REPORT_REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self-harm', 'impersonation', 'copyright', 'other'] as const;

/* ---------------------------------- reports ---------------------------------- */

moderationRoutes.post('/reports', authGuard, rateLimit({ limit: 10, windowMs: 10 * 60_000, name: 'reports', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);

  const targetType = String(body.targetType ?? '');
  const targetId = String(body.targetId ?? '');
  const reason = String(body.reason ?? '');
  const details = trimOrNull(body.details, 2000);

  if (!['user', 'stream', 'chat_message', 'recording'].includes(targetType)) throw badRequest('Invalid targetType');
  if (!targetId) throw badRequest('targetId is required');
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) throw badRequest('Invalid reason');
  if (targetType === 'user' && targetId === auth.id) throw badRequest('You cannot report yourself');

  // Validate the target exists so moderators never see dangling reports.
  const table =
    targetType === 'user' ? 'users' : targetType === 'stream' ? 'streams' : targetType === 'chat_message' ? 'chat_messages' : 'recordings';
  const target = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(targetId).first<{ id: string }>();
  if (!target) throw notFound('The reported content no longer exists');

  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status IN ('open', 'reviewing')`,
  )
    .bind(auth.id, targetType, targetId)
    .first<{ id: string }>();
  if (duplicate) throw conflict('You already reported this', 'duplicate_report');

  const streamId = typeof body.streamId === 'string' ? body.streamId : targetType === 'stream' ? targetId : null;
  const id = uuid();

  await c.env.DB.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, stream_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  )
    .bind(id, auth.id, targetType, targetId, streamId, reason, details, nowIso())
    .run();

  await recordAudit(c.env, {
    actorId: auth.id,
    action: 'report.created',
    targetType,
    targetId,
    metadata: { reason },
    ip: c.req.header('CF-Connecting-IP'),
  });

  // Give the reported channel owner (for chat/stream reports) a heads-up when a
  // webhook is configured — moderators handle everything else.
  if (streamId) {
    const owner = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
    if (owner) await dispatchWebhook(c.env, owner.user_id, 'moderation.report', { reportId: id, targetType, targetId, reason });
  }

  return c.json({ success: true, reportId: id }, 201);
});

moderationRoutes.get('/reports/mine', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, target_type, target_id, reason, status, resolution_note, created_at, handled_at
       FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  return c.json({
    reports: (results ?? []).map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      status: row.status,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      handledAt: row.handled_at,
    })),
  });
});

/* ----------------------------------- blocks ---------------------------------- */

moderationRoutes.get('/blocks', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, b.created_at
       FROM user_blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ? ORDER BY b.created_at DESC LIMIT 200`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  return c.json({
    blocked: (results ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar_url,
      blockedAt: row.created_at,
    })),
  });
});

moderationRoutes.post('/blocks/:userId', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const targetId = c.req.param('userId');
  if (targetId === auth.id) throw badRequest('You cannot block yourself');

  const target = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(targetId).first<{ id: string }>();
  if (!target) throw notFound('User not found');

  await c.env.DB.prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`)
    .bind(auth.id, targetId, nowIso())
    .run();

  // Blocking also removes any follow relationship in both directions.
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM followers WHERE follower_id = ? AND following_id = ?`).bind(auth.id, targetId),
    c.env.DB.prepare(`DELETE FROM followers WHERE follower_id = ? AND following_id = ?`).bind(targetId, auth.id),
  ]);

  return c.json({ success: true, blocked: true });
});

moderationRoutes.delete('/blocks/:userId', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  await c.env.DB.prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`).bind(auth.id, c.req.param('userId')).run();
  return c.json({ success: true, blocked: false });
});

/* -------------------------------- chat settings ------------------------------- */

async function assertCanModerate(env: Env, streamId: string, userId: string, isAdmin = false): Promise<{ ownerId: string; settings: ChatSettings }> {
  const stream = await env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
  if (!stream) throw notFound('Stream not found');

  const settings = await chatSettingsFor(env, streamId);
  const allowed = stream.user_id === userId || isAdmin || settings.moderators.includes(userId);
  if (!allowed) throw forbidden('Only the broadcaster and moderators can manage chat');

  return { ownerId: stream.user_id, settings };
}

moderationRoutes.get('/chat/:streamId/settings', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  await assertCanModerate(c.env, c.req.param('streamId'), auth.id, auth.isAdmin);
  const settings = await chatSettingsFor(c.env, c.req.param('streamId'));
  return c.json({ settings });
});

moderationRoutes.put('/chat/:streamId/settings', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('streamId');
  const stream = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
  if (!stream) throw notFound('Stream not found');
  if (stream.user_id !== auth.id && !auth.isAdmin) throw forbidden('Only the broadcaster can change chat rules');

  const body = await readJson(c);
  const patch: Partial<ChatSettings> = {};

  if (body.slowModeSeconds !== undefined) patch.slowModeSeconds = int(body.slowModeSeconds, 0, 0, 600);
  if (body.followersOnly !== undefined) patch.followersOnly = body.followersOnly === true;
  if (body.subscribersOnly !== undefined) patch.subscribersOnly = body.subscribersOnly === true;
  if (body.emotesOnly !== undefined) patch.emotesOnly = body.emotesOnly === true;
  if (body.linksAllowed !== undefined) patch.linksAllowed = body.linksAllowed !== false;
  if (body.minAccountAgeMinutes !== undefined) patch.minAccountAgeMinutes = int(body.minAccountAgeMinutes, 0, 0, 60 * 24 * 30);
  if (body.blockedWords !== undefined) {
    const words = Array.isArray(body.blockedWords)
      ? body.blockedWords.filter((word: unknown) => typeof word === 'string' && word.trim().length >= 2).map((word: string) => word.trim().slice(0, 60))
      : String(body.blockedWords)
          .split(',')
          .map((word) => word.trim())
          .filter((word) => word.length >= 2);
    patch.blockedWords = [...new Set(words)].slice(0, 200);
  }
  if (body.moderators !== undefined) {
    const ids = Array.isArray(body.moderators) ? body.moderators.filter((id: unknown) => typeof id === 'string').slice(0, 50) : [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const { results } = await c.env.DB.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
      patch.moderators = (results ?? []).map((row) => row.id);
    } else {
      patch.moderators = [];
    }
  }

  const settings = await saveChatSettings(c.env, streamId, patch);
  await c.env.DB.prepare(`UPDATE streams SET chat_mode = ?, updated_at = ? WHERE id = ?`)
    .bind(settings.followersOnly ? 'followers' : settings.subscribersOnly ? 'subscribers' : 'open', nowIso(), streamId)
    .run();

  await recordAudit(c.env, {
    actorId: auth.id,
    action: 'chat.rules_updated',
    targetType: 'stream',
    targetId: streamId,
    metadata: patch,
    ip: c.req.header('CF-Connecting-IP'),
  });

  return c.json({ settings });
});

/* ------------------------------ chat restrictions ----------------------------- */

moderationRoutes.get('/chat/:streamId/restrictions', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('streamId');
  await assertCanModerate(c.env, streamId, auth.id, auth.isAdmin);

  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.kind, b.reason, b.expires_at, b.created_at, u.id AS user_id, u.username, u.avatar_url
       FROM bans b JOIN users u ON u.id = b.user_id
      WHERE b.stream_id = ? AND b.scope = 'chat' AND b.revoked_at IS NULL
        AND (b.expires_at IS NULL OR b.expires_at > ?)
      ORDER BY b.created_at DESC LIMIT 200`,
  )
    .bind(streamId, nowIso())
    .all<Record<string, unknown>>();

  return c.json({
    restrictions: (results ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      reason: row.reason,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      userId: row.user_id,
      username: row.username,
      avatar: row.avatar_url,
    })),
  });
});

moderationRoutes.post('/chat/:streamId/restrictions', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('streamId');
  const { ownerId, settings } = await assertCanModerate(c.env, streamId, auth.id, auth.isAdmin);

  const body = await readJson(c);
  const userId = String(body.userId ?? '');
  if (!userId) throw badRequest('userId is required');
  if (userId === ownerId) throw badRequest('You cannot restrict the broadcaster');
  if (settings.moderators.includes(userId)) throw badRequest('Moderators cannot be restricted');

  const kind = body.kind === 'ban' ? 'ban' : 'timeout';
  const durationMinutes = kind === 'timeout' ? int(body.durationMinutes, 10, 1, 60 * 24 * 14) : null;

  const target = await c.env.DB.prepare(`SELECT id, username, email FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string; username: string; email: string }>();
  if (!target) throw notFound('User not found');

  const banId = await issueBan(c.env, {
    userId,
    scope: 'chat',
    streamId,
    kind,
    reason: trimOrNull(body.reason, 500),
    issuedBy: auth.id,
    durationMinutes,
  });

  await createNotification(c.env, {
    userId,
    type: 'moderation',
    title: kind === 'timeout' ? `You were timed out in a chat` : 'You were banned from a chat',
    body: trimOrNull(body.reason, 500) ?? `A moderator from the stream you were watching restricted your chat access.`,
    force: true,
    email: {
      subject: kind === 'timeout' ? 'Chat timeout' : 'Chat ban',
      heading: kind === 'timeout' ? 'You were timed out' : 'You were banned from a chat',
      paragraphs: [
        trimOrNull(body.reason, 500) ?? 'A channel moderator restricted your ability to chat.',
        durationMinutes ? `This restriction lifts in ${durationMinutes} minutes.` : 'Appeal by contacting support.',
      ],
    },
  });

  await recordAudit(c.env, {
    actorId: auth.id,
    actorRole: 'moderator',
    action: 'chat.restricted',
    targetType: 'user',
    targetId: userId,
    metadata: { streamId, kind, durationMinutes },
    ip: c.req.header('CF-Connecting-IP'),
  });

  return c.json({ success: true, banId }, 201);
});

moderationRoutes.delete('/chat/:streamId/restrictions/:userId', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const streamId = c.req.param('streamId');
  await assertCanModerate(c.env, streamId, auth.id, auth.isAdmin);

  const { results } = await c.env.DB.prepare(
    `SELECT id FROM bans WHERE stream_id = ? AND user_id = ? AND scope = 'chat' AND revoked_at IS NULL`,
  )
    .bind(streamId, c.req.param('userId'))
    .all<{ id: string }>();

  for (const row of results ?? []) await revokeBan(c.env, row.id, auth.id);

  await recordAudit(c.env, {
    actorId: auth.id,
    actorRole: 'moderator',
    action: 'chat.unrestricted',
    targetType: 'user',
    targetId: c.req.param('userId'),
    metadata: { streamId },
  });

  return c.json({ success: true, lifted: results?.length ?? 0 });
});

/** Convenience: the effective rules for a stream (used by the viewer UI). */
moderationRoutes.get('/chat/:streamId/rules', async (c) => {
  const settings = await chatSettingsFor(c.env, c.req.param('streamId'));
  return c.json({
    rules: {
      slowModeSeconds: settings.slowModeSeconds,
      followersOnly: settings.followersOnly,
      subscribersOnly: settings.subscribersOnly,
      emotesOnly: settings.emotesOnly,
      linksAllowed: settings.linksAllowed,
      minAccountAgeMinutes: settings.minAccountAgeMinutes,
      blockedWordCount: settings.blockedWords.length,
    },
  });
});
