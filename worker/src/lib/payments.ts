/**
 * Tips / donations.
 *
 * Provider-agnostic on purpose: `PAYMENT_PROVIDER=stripe` gives real Stripe
 * Checkout with signed webhooks; `webhook` hands the payment to any external
 * checkout (Ko-fi, PayPal, Paystack, a custom page) and reconciles on callback.
 * With nothing configured the feature stays hidden in the UI and the API
 * returns 503 — never a broken button.
 *
 * Money never flows *through* the Worker: the provider hosts the payment page,
 * the Worker only records intents and settles them from verified webhooks.
 */

import type { Env } from '../env';
import { paymentConfig } from './config';
import { ApiError } from './http';
import { fetchWithTimeout } from './http';
import { log } from './logger';
import { baseUrl } from './url';

export interface TipIntent {
  tipId: string;
  streamerId: string;
  streamerName: string;
  streamId?: string | null;
  amountCents: number;
  currency: string;
  message?: string | null;
  tipperName?: string | null;
  email?: string | null;
  /** Stripe Connect destination, when the creator has connected payouts. */
  payoutAccountId?: string | null;
}

export interface CheckoutResult {
  provider: string;
  checkoutUrl: string;
  sessionId?: string;
}

export class PaymentsUnavailableError extends ApiError {
  constructor(message = 'Payments are not configured on this deployment') {
    super(503, message, 'payments_unavailable');
  }
}

export async function createTipCheckout(env: Env, intent: TipIntent): Promise<CheckoutResult> {
  const config = paymentConfig(env);
  if (!config.enabled) throw new PaymentsUnavailableError('Tips are disabled on this deployment');
  if (!config.configured) throw new PaymentsUnavailableError();

  const base = baseUrl(env);
  const successUrl = config.successUrl ?? `${base}/watch/${intent.streamId ?? ''}?tip=success`;
  const cancelUrl = config.cancelUrl ?? `${base}/watch/${intent.streamId ?? ''}?tip=cancelled`;

  if (config.provider === 'webhook') {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        env.PAYMENT_WEBHOOK_URL ?? '',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'create_checkout',
            tipId: intent.tipId,
            streamer: intent.streamerName,
            streamId: intent.streamId,
            amountCents: intent.amountCents,
            currency: intent.currency,
            message: intent.message,
            successUrl,
            cancelUrl,
          }),
        },
        10_000,
      );
    } catch (error) {
      log.warn('payment provider unreachable', { error: String(error) });
      throw new PaymentsUnavailableError('The payment provider could not be reached — try again shortly');
    }

    if (!response.ok) throw new PaymentsUnavailableError('Payment provider rejected the request');
    const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; sessionId?: string };
    if (!payload.checkoutUrl) throw new PaymentsUnavailableError('Payment provider did not return a checkout URL');
    return { provider: 'webhook', checkoutUrl: payload.checkoutUrl, sessionId: payload.sessionId };
  }

  // Stripe Checkout
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  body.set('client_reference_id', intent.tipId);
  body.set(`metadata[tipId]`, intent.tipId);
  body.set(`metadata[streamerId]`, intent.streamerId);
  if (intent.streamId) body.set('metadata[streamId]', intent.streamId);
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', intent.currency);
  body.set('line_items[0][price_data][unit_amount]', String(intent.amountCents));
  body.set('line_items[0][price_data][product_data][name]', `Tip for ${intent.streamerName}`);
  if (intent.message) body.set('line_items[0][price_data][product_data][description]', intent.message.slice(0, 200));
  if (intent.email) body.set('customer_email', intent.email);

  if (intent.payoutAccountId) {
    body.set('payment_intent_data[transfer_data][destination]', intent.payoutAccountId);
    if (config.platformFeePercent > 0) {
      body.set('payment_intent_data[application_fee_amount]', String(Math.round((intent.amountCents * config.platformFeePercent) / 100)));
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          // Idempotency protects against double-submitted tips.
          'Idempotency-Key': intent.tipId,
        },
        body,
      },
      12_000,
    );
  } catch (error) {
    log.warn('stripe unreachable', { error: String(error) });
    throw new PaymentsUnavailableError('The payment provider could not be reached — try again shortly');
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    log.warn('stripe checkout failed', { status: response.status, error: payload.error?.message });
    throw new PaymentsUnavailableError(payload.error?.message ?? 'Payment provider error');
  }

  return { provider: 'stripe', checkoutUrl: payload.url, sessionId: payload.id };
}

/* --------------------------------- webhooks ---------------------------------- */

/**
 * Verifies a Stripe webhook signature (`Stripe-Signature` header) using the
 * documented `t=...,v1=...` HMAC scheme and a 5-minute tolerance.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  ) as Record<string, string>;

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time-ish comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export interface SettledTip {
  tipId: string;
  streamerId: string;
  streamId: string | null;
  amountCents: number;
  currency: string;
  message: string | null;
  tipperName: string | null;
  provider: string;
  providerRef: string;
  status: 'paid' | 'failed' | 'refunded';
}

/**
 * Settles a tip row and updates the streamer's daily analytics + counters.
 * Called from the verified payment webhook handler.
 */
export async function settleTip(env: Env, tip: SettledTip): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE tips
        SET status = ?, provider = COALESCE(provider, ?), provider_ref = COALESCE(?, provider_ref),
            paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END
      WHERE id = ?`,
  )
    .bind(tip.status, tip.provider, tip.providerRef, tip.status, now, tip.tipId)
    .run();

  if (tip.status !== 'paid') return;

  const day = now.slice(0, 10);
  try {
    await env.DB.prepare(
      `INSERT INTO analytics_daily (id, user_id, day, tips_cents, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET tips_cents = COALESCE(analytics_daily.tips_cents, 0) + ?, updated_at = excluded.updated_at`,
    )
      .bind(crypto.randomUUID(), tip.streamerId, day, tip.amountCents, now, tip.amountCents)
      .run();
  } catch (error) {
    log.warn('tip analytics rollup failed', { error: String(error) });
  }
}
