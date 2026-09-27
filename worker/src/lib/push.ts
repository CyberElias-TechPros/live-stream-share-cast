/**
 * Web Push (VAPID + RFC 8291 `aes128gcm`) built on WebCrypto only.
 *
 * Add the two VAPID keys and push starts working — nothing else to wire:
 *
 *   PUSH_VAPID_PUBLIC_KEY   base64url uncompressed P-256 public point (65 bytes)
 *   PUSH_VAPID_PRIVATE_KEY  base64url P-256 private scalar (32 bytes)
 *   PUSH_SUBJECT            mailto: or https: contact for the push service
 *
 * Generate a pair with:
 *   npx web-push generate-vapid-keys
 *
 * Subscriptions live in `push_subscriptions` (see routes/notifications.ts).
 * Failed endpoints (404/410) are pruned automatically.
 */

import type { Env } from '../env';
import { log } from './logger';
import { nowIso } from './time';

export interface PushConfig {
  enabled: boolean;
  configured: boolean;
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(env: Env): PushConfig {
  const publicKey = (env.PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (env.PUSH_VAPID_PRIVATE_KEY ?? '').trim();
  const subject = (env.PUSH_SUBJECT ?? '').trim() || 'mailto:support@example.com';
  return {
    enabled: String(env.FEATURE_PUSH ?? 'false').toLowerCase() === 'true',
    configured: !!publicKey && !!privateKey,
    publicKey,
    privateKey,
    subject,
  };
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  failure_count: number | null;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  type?: string;
  data?: Record<string, unknown>;
}

/* --------------------------------- helpers ----------------------------------- */

/**
 * The Workers runtime ships the full WebCrypto surface; the bundled typings
 * spell ECDH's peer key as `$public` and pin `BufferSource` differently from
 * lib.dom, so the calls go through one narrow, documented shim.
 */
const subtle = crypto.subtle as unknown as {
  generateKey(algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<CryptoKeyPair>;
  importKey(format: string, keyData: unknown, algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<CryptoKey>;
  exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer>;
  deriveBits(algorithm: unknown, baseKey: CryptoKey, length?: number): Promise<ArrayBuffer>;
  encrypt(algorithm: unknown, key: CryptoKey, data: unknown): Promise<ArrayBuffer>;
  sign(algorithm: unknown, key: CryptoKey, data: unknown): Promise<ArrayBuffer>;
};

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Splits an uncompressed P-256 point (`0x04 || x || y`) into its coordinates. */
function jwkFromKeys(publicKey: string, privateKey: string): JsonWebKey {
  const raw = base64UrlToBytes(publicKey);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('PUSH_VAPID_PUBLIC_KEY must be an uncompressed P-256 point');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(raw.slice(1, 33)),
    y: bytesToBase64Url(raw.slice(33, 65)),
    d: privateKey,
    ext: true,
  };
}

/** RFC 8291 payload encryption. */
async function encryptPayload(
  subscription: PushSubscriptionRow,
  payload: string,
): Promise<{ body: Uint8Array; serverPublicKey: Uint8Array }> {
  const uaPublicKey = base64UrlToBytes(subscription.p256dh ?? '');
  const authSecret = base64UrlToBytes(subscription.auth ?? '');
  if (uaPublicKey.length !== 65 || authSecret.length < 16) throw new Error('Subscription keys are missing');

  const asKeys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicKey = new Uint8Array(await subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await subtle.importKey('raw', uaPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), uaPublicKey, asPublicKey);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const plaintext = concat(new TextEncoder().encode(payload), new Uint8Array([0x02]));
  const cekKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  const header = concat(salt, recordSize, new Uint8Array([asPublicKey.length]), asPublicKey);

  return { body: concat(header, ciphertext), serverPublicKey: asPublicKey };
}

/** Signed VAPID JWT for the push service origin. */
async function vapidToken(config: PushConfig, endpoint: string): Promise<string> {
  const origin = new URL(endpoint).origin;
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const claims = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: config.subject,
      }),
    ),
  );

  const signingInput = `${header}.${claims}`;
  const key = await subtle.importKey(
    'jwk',
    jwkFromKeys(config.publicKey, config.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)));

  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/* --------------------------------- delivery ---------------------------------- */

async function deliver(env: Env, config: PushConfig, subscription: PushSubscriptionRow, payload: PushPayload): Promise<boolean> {
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/notifications',
    tag: payload.tag ?? payload.type ?? 'lsc',
    type: payload.type ?? 'system',
    data: payload.data ?? {},
  });

  const { body: encrypted } = await encryptPayload(subscription, body);
  const token = await vapidToken(config, subscription.endpoint);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'normal',
      authorization: `vapid t=${token}, k=${config.publicKey}`,
    },
    body: encrypted as unknown as BodyInit,
  });

  if (response.status === 404 || response.status === 410) {
    await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(subscription.id).run();
    return false;
  }

  if (!response.ok) {
    await env.DB.prepare(`UPDATE push_subscriptions SET failure_count = COALESCE(failure_count, 0) + 1 WHERE id = ?`)
      .bind(subscription.id)
      .run();
    log.warn('push delivery failed', { status: response.status, endpoint: subscription.endpoint.slice(0, 80) });
    return false;
  }

  await env.DB.prepare(`UPDATE push_subscriptions SET last_used_at = ?, failure_count = 0 WHERE id = ?`)
    .bind(nowIso(), subscription.id)
    .run();
  return true;
}

/** Sends one notification to every device a user registered. Never throws. */
export async function sendPushToUser(env: Env, userId: string, payload: PushPayload): Promise<number> {
  const config = pushConfig(env);
  if (!config.enabled || !config.configured) return 0;

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth, failure_count FROM push_subscriptions
        WHERE user_id = ? AND COALESCE(failure_count, 0) < 5`,
    )
      .bind(userId)
      .all<PushSubscriptionRow>();

    let delivered = 0;
    for (const subscription of results ?? []) {
      try {
        if (await deliver(env, config, subscription, payload)) delivered++;
      } catch (error) {
        log.warn('push subscription failed', { id: subscription.id, error: String(error) });
      }
    }
    return delivered;
  } catch (error) {
    log.warn('push fan-out failed', { userId, error: String(error) });
    return 0;
  }
}

/** Test helper — proves the crypto pipeline without touching a real device. */
export async function encryptPushPayload(env: Env, subscription: PushSubscriptionRow, payload: PushPayload): Promise<Uint8Array> {
  const body = JSON.stringify(payload);
  const { body: encrypted } = await encryptPayload(subscription, body);
  return encrypted;
}
