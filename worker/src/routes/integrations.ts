/**
 * Creator integrations: outbound webhooks.
 *
 *   GET    /api/integrations/events              the event catalogue
 *   GET    /api/integrations/webhooks            my endpoints
 *   POST   /api/integrations/webhooks            create (returns the signing secret once)
 *   PATCH  /api/integrations/webhooks/:id        rename / change events / enable / disable
 *   POST   /api/integrations/webhooks/:id/rotate rotate the signing secret
 *   POST   /api/integrations/webhooks/:id/test   send a test event
 *   DELETE /api/integrations/webhooks/:id        remove
 *
 * Receivers verify authenticity with:
 *   X-LSC-Signature: sha256=<hex HMAC-SHA256(secret, `${X-LSC-Timestamp}.${rawBody}`)>
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { badRequest, notFound, readJson, forbidden, tooManyRequests } from '../lib/http';
import { validateExternalUrl } from '../lib/security';
import { WEBHOOK_EVENTS, dispatchWebhook, webhookSecret, type WebhookEvent } from '../lib/webhook';
import { featureConfig } from '../lib/config';
import { recordAudit } from '../lib/audit';
import { uuid } from '../lib/ids';
import { nowIso } from '../lib/time';
import { limit as rateLimitCheck } from '../lib/ratelimit';

export const integrationRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

const EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  'stream.live': 'A creator went live',
  'stream.ended': 'A broadcast ended',
  'stream.scheduled': 'A broadcast was scheduled',
  'user.followed': 'A user gained a follower',
  'chat.message': 'A chat message was posted',
  'tip.received': 'A tip was paid',
  'recording.ready': 'A recording finished uploading',
  'moderation.report': 'A viewer reported content',
};

integrationRoutes.get('/events', (c) =>
  c.json({
    events: WEBHOOK_EVENTS.map((event) => ({ event, description: EVENT_DESCRIPTIONS[event], signatureHeader: 'X-LSC-Signature' })),
  }),
);

integrationRoutes.get('/webhooks', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, url, events, enabled, last_status, last_delivery_at, failure_count, created_at FROM webhook_endpoints
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  return c.json({
    webhooks: (results ?? []).map((row) => ({
      id: row.id,
      url: row.url,
      events: safeEvents(row.events as string | null),
      enabled: !!row.enabled,
      lastStatus: row.last_status,
      lastDeliveryAt: row.last_delivery_at,
      failureCount: row.failure_count ?? 0,
      createdAt: row.created_at,
    })),
  });
});

integrationRoutes.post('/webhooks', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  if (!featureConfig(c.env).webhooks) throw forbidden('Webhooks are disabled on this deployment');

  const body = await readJson(c);
  const validated = validateExternalUrl(body.url);
  if (!validated.ok || !validated.url) throw badRequest(`Endpoint URL rejected (${validated.error})`);

  const requested = Array.isArray(body.events) ? body.events.filter((event: unknown): event is string => typeof event === 'string') : [];
  const events = requested.filter((event): event is WebhookEvent => (WEBHOOK_EVENTS as string[]).includes(event));

  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM webhook_endpoints WHERE user_id = ?`).bind(auth.id).first<{ count: number }>();
  if ((count?.count ?? 0) >= 10) throw badRequest('You already have the maximum number of webhook endpoints');

  const id = uuid();
  const secret = webhookSecret();

  await c.env.DB.prepare(
    `INSERT INTO webhook_endpoints (id, user_id, url, secret, events, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(id, auth.id, validated.url, secret, JSON.stringify(events), nowIso())
    .run();

  await recordAudit(c.env, { actorId: auth.id, action: 'webhook.created', targetType: 'webhook', targetId: id, metadata: { url: validated.url, events } });

  // The secret is shown exactly once.
  return c.json({ success: true, id, secret, url: validated.url, events }, 201);
});

integrationRoutes.patch('/webhooks/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const updates: Record<string, unknown> = {};

  if (body.url !== undefined) {
    const validated = validateExternalUrl(body.url);
    if (!validated.ok || !validated.url) throw badRequest(`Endpoint URL rejected (${validated.error})`);
    updates.url = validated.url;
  }
  if (body.events !== undefined) {
    const requested = Array.isArray(body.events) ? body.events.filter((event: unknown): event is string => typeof event === 'string') : [];
    updates.events = JSON.stringify(requested.filter((event): event is WebhookEvent => (WEBHOOK_EVENTS as string[]).includes(event)));
  }
  if (body.enabled !== undefined) {
    updates.enabled = body.enabled ? 1 : 0;
    if (body.enabled) updates.failure_count = 0;
  }
  if (!Object.keys(updates).length) throw badRequest('Nothing to update');

  const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(', ');
  const result = await c.env.DB.prepare(`UPDATE webhook_endpoints SET ${assignments} WHERE id = ? AND user_id = ?`)
    .bind(...Object.values(updates), c.req.param('id'), auth.id)
    .run();
  if (!result.meta?.changes) throw notFound('Webhook not found');

  return c.json({ success: true });
});

integrationRoutes.post('/webhooks/:id/rotate', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const secret = webhookSecret();

  const result = await c.env.DB.prepare(`UPDATE webhook_endpoints SET secret = ? WHERE id = ? AND user_id = ?`)
    .bind(secret, c.req.param('id'), auth.id)
    .run();
  if (!result.meta?.changes) throw notFound('Webhook not found');

  return c.json({ success: true, secret });
});

integrationRoutes.post('/webhooks/:id/test', authGuard, rateLimitGuard('webhook-test', 10), async (c) => {
  const auth = c.get('authUser')!;
  const endpoint = await c.env.DB.prepare(`SELECT id FROM webhook_endpoints WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), auth.id)
    .first<{ id: string }>();
  if (!endpoint) throw notFound('Webhook not found');

  // Dispatch bypasses the subscription filter by going through the normal path
  // for a synthetic event the endpoint is guaranteed to receive.
  await c.env.DB.prepare(`UPDATE webhook_endpoints SET events = ? WHERE id = ?`).bind(JSON.stringify([]), endpoint.id).run();
  await dispatchWebhook(c.env, auth.id, 'moderation.report', { test: true, message: 'Test delivery from your dashboard' });

  return c.json({ success: true });
});

integrationRoutes.delete('/webhooks/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`DELETE FROM webhook_endpoints WHERE id = ? AND user_id = ?`).bind(c.req.param('id'), auth.id).run();
  if (!result.meta?.changes) throw notFound('Webhook not found');

  await recordAudit(c.env, { actorId: auth.id, action: 'webhook.deleted', targetType: 'webhook', targetId: c.req.param('id') });

  return c.json({ success: true });
});

/* --------------------------------- helpers ----------------------------------- */

function safeEvents(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((event): event is string => typeof event === 'string') : [];
  } catch {
    return [];
  }
}

function rateLimitGuard(name: string, perMinute: number): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const auth = c.get('authUser');
    const allowed = await rateLimitCheck(c.env, `${name}:${auth?.id ?? 'anon'}`, perMinute, 60_000);
    if (!allowed) throw tooManyRequests('Too many requests. Try again shortly.');
    await next();
  };
}
