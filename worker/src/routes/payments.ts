/**
 * Tips / donations.
 *
 *   GET  /api/payments/config            is tipping live on this deployment?
 *   GET  /api/payments/presets           suggested amounts for the current currency
 *   POST /api/payments/tips              create a tip intent → provider checkout URL
 *   GET  /api/payments/tips/mine         tips I sent
 *   GET  /api/payments/earnings          tips I received (creator)
 *   POST /api/payments/webhook/stripe    Stripe webhook (signature verified)
 *   POST /api/payments/webhook/provider  generic provider callback (shared secret)
 *
 * Nothing settles here — webhooks do. A tip is `pending` until a verified event
 * arrives, so a cancelled checkout never touches the ledger.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { requireAuth } from '../lib/auth';
import { badRequest, int, notFound, readJson, unauthorized } from '../lib/http';
import { paymentConfig } from '../lib/config';
import { createTipCheckout, settleTip, verifyStripeSignature, PaymentsUnavailableError } from '../lib/payments';
import { createNotification } from '../lib/notifications';
import { recordAudit } from '../lib/audit';
import { dispatchWebhook } from '../lib/webhook';
import { uuid } from '../lib/ids';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';

export const paymentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/* ----------------------------------- config ---------------------------------- */

paymentRoutes.get('/config', (c) => {
  const config = paymentConfig(c.env);
  return c.json({
    enabled: config.enabled && config.configured,
    provider: config.provider,
    currency: config.currency,
    minTipCents: config.minTipCents,
    maxTipCents: config.maxTipCents,
    checkoutsEnabled: config.checkoutsEnabled,
    feePercent: config.platformFeePercent,
  });
});

paymentRoutes.get('/presets', (c) => {
  const config = paymentConfig(c.env);
  return c.json({
    currency: config.currency,
    presets: [200, 500, 1000, 2500, 5000].filter((cents) => cents >= config.minTipCents && cents <= config.maxTipCents),
  });
});

/* ------------------------------------ tips ----------------------------------- */

paymentRoutes.post('/tips', authGuard, rateLimit({ limit: 10, windowMs: 60_000, name: 'tips', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const config = paymentConfig(c.env);

  if (!config.enabled || !config.configured) throw new PaymentsUnavailableError();

  const body = await readJson(c);
  const streamerId = String(body.streamerId ?? '');
  const amountCents = int(body.amountCents, 0, config.minTipCents, config.maxTipCents);
  const streamId = typeof body.streamId === 'string' && body.streamId ? body.streamId : null;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 300) : null;

  if (!streamerId) throw badRequest('streamerId is required');
  if (streamerId === auth.id) throw badRequest('You cannot tip yourself');

  const streamer = await c.env.DB.prepare(`SELECT id, username, display_name, payout_account_id, donation_url FROM users WHERE id = ?`)
    .bind(streamerId)
    .first<{ id: string; username: string; display_name: string | null; payout_account_id: string | null; donation_url: string | null }>();
  if (!streamer) throw notFound('Streamer not found');

  // If the creator has no payout account, fall back to their own donation link.
  if (!streamer.payout_account_id && streamer.donation_url && !config.checkoutsEnabled) {
    return c.json({ success: true, redirectUrl: streamer.donation_url, external: true });
  }

  const tipId = uuid();
  const tipper = await c.env.DB.prepare(`SELECT username, display_name FROM users WHERE id = ?`)
    .bind(auth.id)
    .first<{ username: string; display_name: string | null }>();

  await c.env.DB.prepare(
    `INSERT INTO tips (id, stream_id, streamer_id, tipper_id, tipper_name, amount_cents, currency, message, status, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      tipId,
      streamId,
      streamerId,
      auth.id,
      tipper?.display_name ?? tipper?.username ?? auth.username,
      amountCents,
      config.currency,
      message,
      config.provider,
      nowIso(),
    )
    .run();

  let checkout;
  try {
    checkout = await createTipCheckout(c.env, {
      tipId,
      streamerId,
      streamerName: streamer.display_name ?? streamer.username,
      streamId,
      amountCents,
      currency: config.currency,
      message,
      tipperName: tipper?.username ?? auth.username,
      payoutAccountId: streamer.payout_account_id,
    });
  } catch (error) {
    // Never leave a dangling pending tip behind when the provider refuses.
    await c.env.DB.prepare(`UPDATE tips SET status = 'failed' WHERE id = ?`).bind(tipId).run();
    throw error;
  }

  await c.env.DB.prepare(`UPDATE tips SET provider_session_id = ? WHERE id = ?`).bind(checkout.sessionId ?? null, tipId).run();

  return c.json({ success: true, tipId, checkoutUrl: checkout.checkoutUrl, provider: checkout.provider }, 201);
});

paymentRoutes.get('/tips/mine', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.amount_cents, t.currency, t.message, t.status, t.created_at, t.paid_at,
            u.username AS streamer_username, u.display_name AS streamer_name, u.avatar_url
       FROM tips t JOIN users u ON u.id = t.streamer_id
      WHERE t.tipper_id = ? ORDER BY t.created_at DESC LIMIT 100`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  return c.json({
    tips: (results ?? []).map((row) => ({
      id: row.id,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      streamerUsername: row.streamer_username,
      streamerName: row.streamer_name,
      streamerAvatar: row.avatar_url,
    })),
  });
});

paymentRoutes.get('/earnings', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const config = paymentConfig(c.env);

  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.amount_cents, t.currency, t.message, t.status, t.created_at, t.paid_at,
            u.username AS tipper_username, u.display_name AS tipper_name
       FROM tips t LEFT JOIN users u ON u.id = t.tipper_id
      WHERE t.streamer_id = ? ORDER BY t.created_at DESC LIMIT 200`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  const totals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) AS pending,
            COUNT(*) AS count
       FROM tips WHERE streamer_id = ?`,
  )
    .bind(auth.id)
    .first<{ paid: number; pending: number; count: number }>();

  const payouts = await c.env.DB.prepare(`SELECT payout_account_id, payouts_enabled, donation_url FROM users WHERE id = ?`)
    .bind(auth.id)
    .first<{ payout_account_id: string | null; payouts_enabled: number | null; donation_url: string | null }>();

  return c.json({
    tips: (results ?? []).map((row) => ({
      id: row.id,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      tipperUsername: row.tipper_username,
      tipperName: row.tipper_name,
    })),
    totals: {
      paidCents: totals?.paid ?? 0,
      pendingCents: totals?.pending ?? 0,
      count: totals?.count ?? 0,
      paidDisplay: formatAmount(totals?.paid ?? 0, config.currency),
    },
    payouts: {
      connected: !!payouts?.payout_account_id,
      enabled: !!payouts?.payouts_enabled,
      donationUrl: payouts?.donation_url ?? null,
      provider: config.provider,
    },
  });
});

/** Lets a creator opt out of platform checkout and use their own link. */
paymentRoutes.put('/donation-link', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);
  const url = typeof body.donationUrl === 'string' && body.donationUrl.trim() ? body.donationUrl.trim().slice(0, 500) : null;

  if (url && !/^https:\/\//i.test(url)) throw badRequest('Donation links must use https://');

  await c.env.DB.prepare(`UPDATE users SET donation_url = ?, updated_at = ? WHERE id = ?`).bind(url, nowIso(), auth.id).run();
  return c.json({ success: true, donationUrl: url });
});

/* ---------------------------------- webhooks ---------------------------------- */

paymentRoutes.post('/webhook/stripe', async (c) => {
  const config = paymentConfig(c.env);
  if (config.provider !== 'stripe' || !config.secretKey) throw new PaymentsUnavailableError();

  const raw = await c.req.text();
  const signature = c.req.header('Stripe-Signature') ?? null;

  if (config.webhookSecret) {
    const valid = await verifyStripeSignature(raw, signature, config.webhookSecret);
    if (!valid) throw unauthorized('Invalid webhook signature');
  } else if ((c.env.ENVIRONMENT ?? 'development') === 'production') {
    // Refuse to trust unsigned callbacks in production.
    throw unauthorized('STRIPE_WEBHOOK_SECRET is not configured');
  }

  const event = JSON.parse(raw || '{}') as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const tipId = metadata.tipId ?? (typeof object.client_reference_id === 'string' ? object.client_reference_id : null);

  if (!tipId) return c.json({ received: true, ignored: 'no tip reference' });

  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const tip = await c.env.DB.prepare(`SELECT id, streamer_id, stream_id, amount_cents, currency, message, tipper_name FROM tips WHERE id = ?`)
      .bind(tipId)
      .first<{ id: string; streamer_id: string; stream_id: string | null; amount_cents: number; currency: string; message: string | null; tipper_name: string | null }>();

    if (!tip) return c.json({ received: true, ignored: 'unknown tip' });

    await settleTip(c.env, {
      tipId,
      streamerId: tip.streamer_id,
      streamId: tip.stream_id,
      amountCents: tip.amount_cents,
      currency: tip.currency,
      message: tip.message,
      tipperName: tip.tipper_name,
      provider: 'stripe',
      providerRef: String(object.payment_intent ?? object.id ?? event.id ?? ''),
      status: 'paid',
    });

    await createNotification(c.env, {
      userId: tip.streamer_id,
      type: 'tip',
      title: `You received ${formatAmount(tip.amount_cents, tip.currency)}`,
      body: tip.message,
      url: '/dashboard?tab=earnings',
      force: true,
    });

    await dispatchWebhook(c.env, tip.streamer_id, 'tip.received', {
      tipId,
      amountCents: tip.amount_cents,
      currency: tip.currency,
      message: tip.message,
    });

    await recordAudit(c.env, { actorId: 'stripe', actorRole: 'system', action: 'tip.paid', targetType: 'tip', targetId: tipId });
  }

  if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
    await c.env.DB.prepare(`UPDATE tips SET status = 'failed' WHERE id = ?`).bind(tipId).run();
  }

  return c.json({ received: true });
});

/**
 * Generic provider callback for non-Stripe setups. The provider posts
 * `{ tipId, status, reference }` with `Authorization: Bearer <PAYMENT_WEBHOOK_TOKEN>`.
 */
paymentRoutes.post('/webhook/provider', async (c) => {
  const expected = c.env.STRIPE_WEBHOOK_SECRET ?? c.env.CLEANUP_TOKEN;
  if (!expected) throw new PaymentsUnavailableError();

  const provided = c.req.header('Authorization')?.replace('Bearer ', '') ?? c.req.header('X-Payment-Token') ?? '';
  if (provided !== expected) throw unauthorized('Invalid payment token');

  const body = await readJson(c);
  const tipId = String(body.tipId ?? '');
  const status = String(body.status ?? '');
  if (!tipId) throw badRequest('tipId is required');
  if (!['paid', 'failed', 'refunded'].includes(status)) throw badRequest('status must be paid, failed or refunded');

  const tip = await c.env.DB.prepare(`SELECT id, streamer_id, stream_id, amount_cents, currency, message, tipper_name FROM tips WHERE id = ?`)
    .bind(tipId)
    .first<{ id: string; streamer_id: string; stream_id: string | null; amount_cents: number; currency: string; message: string | null; tipper_name: string | null }>();
  if (!tip) throw notFound('Tip not found');

  await settleTip(c.env, {
    tipId,
    streamerId: tip.streamer_id,
    streamId: tip.stream_id,
    amountCents: tip.amount_cents,
    currency: tip.currency,
    message: tip.message,
    tipperName: tip.tipper_name,
    provider: 'webhook',
    providerRef: String(body.reference ?? ''),
    status: status as 'paid' | 'failed' | 'refunded',
  });

  if (status === 'paid') {
    await createNotification(c.env, {
      userId: tip.streamer_id,
      type: 'tip',
      title: `You received ${formatAmount(tip.amount_cents, tip.currency)}`,
      body: tip.message,
      url: '/dashboard?tab=earnings',
      force: true,
    });
    await dispatchWebhook(c.env, tip.streamer_id, 'tip.received', { tipId, amountCents: tip.amount_cents, currency: tip.currency });
  }

  await recordAudit(c.env, {
    actorId: 'payment-provider',
    actorRole: 'system',
    action: status === 'paid' ? 'tip.paid' : 'tip.refunded',
    targetType: 'tip',
    targetId: tipId,
  });

  return c.json({ success: true });
});

/** Public receipt lookup (no auth) — used by the post-checkout return screen. */
paymentRoutes.get('/tips/:id/status', async (c) => {
  const row = await c.env.DB.prepare(`SELECT id, status, amount_cents, currency, message FROM tips WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; status: string; amount_cents: number; currency: string; message: string | null }>();
  if (!row) throw notFound('Tip not found');

  return c.json({
    tip: {
      id: row.id,
      status: row.status,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: row.message,
      display: formatAmount(row.amount_cents, row.currency),
    },
  });
});
