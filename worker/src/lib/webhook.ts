/**
 * Outbound webhooks — the integration surface for creators.
 *
 * A creator registers HTTPS endpoints (Discord/Slack/Zapier/n8n/their own bot)
 * and picks the events they care about. Deliveries are HMAC-SHA256 signed with
 * the endpoint secret so receivers can verify authenticity:
 *
 *   X-LSC-Event: stream.live
 *   X-LSC-Timestamp: 1730000000
 *   X-LSC-Signature: sha256=<hex hmac of `${timestamp}.${rawBody}`>
 */

import type { Env } from '../env';
import { toBase64Url } from './ids';
import { log } from './logger';
import { nowIso } from './time';
import { fetchWithTimeout } from './http';

export type WebhookEvent =
  | 'stream.live'
  | 'stream.ended'
  | 'stream.scheduled'
  | 'user.followed'
  | 'chat.message'
  | 'tip.received'
  | 'recording.ready'
  | 'moderation.report';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'stream.live',
  'stream.ended',
  'stream.scheduled',
  'user.followed',
  'chat.message',
  'tip.received',
  'recording.ready',
  'moderation.report',
];

interface EndpointRow {
  id: string;
  url: string;
  secret: string | null;
  events: string | null;
  failure_count: number | null;
}

async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256=${hex}`;
}

/**
 * Fans an event out to every enabled endpoint the user registered.
 * Never throws — webhooks are best-effort and must not break the caller.
 */
export async function dispatchWebhook(
  env: Env,
  userId: string | null,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;

  let endpoints: EndpointRow[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, url, secret, events, failure_count FROM webhook_endpoints
        WHERE user_id = ? AND enabled = 1 AND failure_count < 20`,
    )
      .bind(userId)
      .all<EndpointRow>();
    endpoints = results ?? [];
  } catch (error) {
    log.warn('webhook lookup failed', { error: String(error) });
    return;
  }

  const body = JSON.stringify({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event,
    occurredAt: nowIso(),
    data: payload,
  });

  for (const endpoint of endpoints) {
    const subscribed = parseEvents(endpoint.events);
    if (subscribed.length && !subscribed.includes(event)) continue;

    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'live-stream-share-cast-webhooks/1.0',
      'x-lsc-event': event,
      'x-lsc-timestamp': timestamp,
    };
    if (endpoint.secret) headers['x-lsc-signature'] = await sign(endpoint.secret, timestamp, body);

    try {
      const response = await fetchWithTimeout(endpoint.url, { method: 'POST', headers, body }, 8_000);
      const failed = !response.ok;
      await env.DB.prepare(
        `UPDATE webhook_endpoints
            SET last_status = ?, last_delivery_at = ?, failure_count = ?
          WHERE id = ?`,
      )
        .bind(response.status, nowIso(), failed ? (endpoint.failure_count ?? 0) + 1 : 0, endpoint.id)
        .run();
    } catch (error) {
      await env.DB.prepare(
        `UPDATE webhook_endpoints SET last_status = 0, last_delivery_at = ?, failure_count = COALESCE(failure_count, 0) + 1 WHERE id = ?`,
      )
        .bind(nowIso(), endpoint.id)
        .run();
      log.warn('webhook delivery failed', { endpoint: endpoint.id, error: String(error) });
    }
  }
}

function parseEvents(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Generates a webhook signing secret (`whsec_<32 bytes base64url>`). */
export function webhookSecret(): string {
  return `whsec_${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}
