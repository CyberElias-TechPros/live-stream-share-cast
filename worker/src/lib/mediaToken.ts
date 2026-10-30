/**
 * Short-lived HMAC tokens for browser media requests.
 *
 * A video/audio element cannot attach the app's Authorization header. Private
 * and unlisted recordings therefore use a narrowly scoped token containing the
 * exact R2 key and an expiry. The token is never persisted in D1 or local
 * storage and cannot be replayed for a different object.
 */

import type { Env } from '../env';

interface MediaClaims {
  key: string;
  subject: string;
  exp: number;
}

function secretFor(env: Env): string {
  const production = (env.ENVIRONMENT ?? 'development').trim().toLowerCase() === 'production';
  if (production && (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.includes('change-me') || env.JWT_SECRET.includes('dev-only'))) {
    throw new Error('JWT_SECRET must be a strong secret in production');
  }
  return env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
}

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signingKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretFor(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createMediaToken(env: Env, key: string, subject: string, ttlSeconds: number): Promise<string> {
  const claims: MediaClaims = {
    key,
    subject,
    exp: Math.floor(Date.now() / 1000) + Math.max(30, Math.min(ttlSeconds, 86_400)),
  };
  const payload = encode(JSON.stringify(claims));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encodedSignature = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${payload}.${encodedSignature}`;
}

export async function verifyMediaToken(env: Env, key: string, token: string): Promise<{ subject: string; expiresAt: string } | null> {
  const [payload, encodedSignature] = token.split('.');
  if (!payload || !encodedSignature) return null;

  let claims: MediaClaims;
  let signature: Uint8Array;
  try {
    claims = JSON.parse(decode(payload)) as MediaClaims;
    const padded = encodedSignature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encodedSignature.length % 4)) % 4);
    const binary = atob(padded);
    signature = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }

  if (claims.key !== key || typeof claims.subject !== 'string' || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(env),
    signature,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  return { subject: claims.subject, expiresAt: new Date(claims.exp * 1000).toISOString() };
}
