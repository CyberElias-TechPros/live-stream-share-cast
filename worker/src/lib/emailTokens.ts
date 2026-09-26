/**
 * Single-use, hashed email tokens (verification, email change).
 *
 * Tokens are random, stored as SHA-256 hashes, expire, and can only be consumed
 * once — so a leaked database row cannot be replayed.
 */

import type { Env } from '../env';
import { randomToken, sha256Hex } from './ids';
import { isoIn, nowIso } from './time';

export const EMAIL_VERIFICATION_TTL_HOURS = 24;
export const EMAIL_CHANGE_TTL_HOURS = 2;

export type EmailTokenKind = 'verify_email' | 'change_email';

export async function issueEmailToken(env: Env, userId: string, kind: EmailTokenKind, email?: string | null): Promise<string> {
  const token = randomToken(32);
  const hours = kind === 'verify_email' ? EMAIL_VERIFICATION_TTL_HOURS : EMAIL_CHANGE_TTL_HOURS;

  // Only one live token per kind so an old link cannot linger.
  await env.DB.prepare(`DELETE FROM email_tokens WHERE user_id = ? AND kind = ? AND used_at IS NULL`).bind(userId, kind).run();

  await env.DB.prepare(
    `INSERT INTO email_tokens (token_hash, user_id, kind, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(await sha256Hex(token), userId, kind, email ?? null, isoIn(hours * 3600_000), nowIso())
    .run();

  return token;
}

export async function consumeEmailToken(
  env: Env,
  token: string,
  kind: EmailTokenKind,
): Promise<{ userId: string; email: string | null } | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT user_id, email, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND kind = ?`)
    .bind(hash, kind)
    .first<{ user_id: string; email: string | null; expires_at: string; used_at: string | null }>();

  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  await env.DB.prepare(`UPDATE email_tokens SET used_at = ? WHERE token_hash = ?`).bind(nowIso(), hash).run();

  return { userId: row.user_id, email: row.email };
}
