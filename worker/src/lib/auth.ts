import type { Context, Next } from 'hono';
import type { AppVariables, AuthUser, Env } from '../env';
import { randomToken, safeEqual, sha256Hex, toBase64Url } from './ids';
import { isoIn, nowIso } from './time';

/* ------------------------------- configuration ------------------------------ */

  const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

export const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const RESET_TTL_SECONDS = 60 * 60; // 1 hour

/* ------------------------------- passwords ---------------------------------- */

/**
 * PBKDF2-SHA256 with a per-user salt. Stored as
 * `pbkdf2$<iterations>$<salt>$<hash>` so the cost can be raised later without
 * invalidating existing passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_LENGTH_BITS,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltRaw || !hashRaw) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  // `atob` rejects invalid base64 — guard instead of throwing.
  let salt: Uint8Array;
  try {
    salt = decodeBase64Url(saltRaw);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, KEY_LENGTH_BITS));
  return safeEqual(toBase64Url(bits), hashRaw);
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* ---------------------------------- JWT ------------------------------------ */

interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  typ: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

let keyPromise: Promise<CryptoKey> | null = null;
let cachedSecret: string | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (!keyPromise || cachedSecret !== secret) {
    cachedSecret = secret;
    keyPromise = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
  }
  return keyPromise;
}

function secretFor(env: Env): string {
  // Development fallback so `wrangler dev` works before a secret is configured.
  return env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
}

export async function signJwt(
  env: Env,
  payload: Omit<JwtPayload, 'iat' | 'exp'> & { ttlSeconds?: number },
): Promise<{ token: string; expiresAt: string; jti: string }> {
  const { ttlSeconds = ACCESS_TTL_SECONDS, ...claims } = payload;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const body: JwtPayload = { ...claims, iat: issuedAt, exp: expiresAt };

  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadPart = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  const signingInput = `${header}.${payloadPart}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secretFor(env)), new TextEncoder().encode(signingInput));

  return {
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    jti: claims.jti,
  };
}

export async function verifyJwt(env: Env, token: string, expectedType?: JwtPayload['typ']): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secretFor(env)),
      decodeBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let claims: JwtPayload;
  try {
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    return null;
  }

  if (claims.exp * 1000 < Date.now()) return null;
  if (expectedType && claims.typ !== expectedType) return null;
  return claims;
}

/* -------------------------------- sessions ---------------------------------- */

interface SessionRow {
  id: string;
  user_id: string;
  email: string;
  username: string;
  is_streamer: number | null;
  is_admin: number | null;
  expires_at: string;
  revoked_at: string | null;
}

/* -------------------------------- account state ------------------------------- */

interface AccountState {
  id: string;
  email: string;
  username: string;
  is_streamer: number | null;
  is_admin: number | null;
  is_banned: number | null;
  suspended_until: string | null;
  deleted_at: string | null;
}

function isSuspended(row: Pick<AccountState, 'is_banned' | 'suspended_until'>): boolean {
  if (row.is_banned) return true;
  return !!row.suspended_until && new Date(row.suspended_until).getTime() > Date.now();
}

async function accountState(env: Env, userId: string): Promise<AccountState | null> {
  return env.DB.prepare(
    `SELECT id, email, username, is_streamer, is_admin, is_banned, suspended_until, deleted_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<AccountState>();
}

function toAuthUser(row: AccountState, scopes?: string[]): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    isStreamer: !!row.is_streamer,
    isAdmin: !!row.is_admin,
    banned: isSuspended(row),
    scopes,
  };
}

/* ------------------------------- API tokens ----------------------------------- */

const API_TOKEN_PREFIX = 'lsc_';

/**
 * Personal API tokens (`lsc_…`) let OBS overlays, bots and the CLI talk to the
 * API without a user session. Only the SHA-256 hash is stored.
 */
export async function resolveApiToken(env: Env, token: string): Promise<AuthUser | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;

  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT t.id, t.user_id, t.scopes, t.expires_at, t.revoked_at,
            u.id AS uid, u.email, u.username, u.is_streamer, u.is_admin, u.is_banned, u.suspended_until, u.deleted_at
       FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?`,
  )
    .bind(hash)
    .first<AccountState & { id: string; user_id: string; uid: string; scopes: string | null; expires_at: string | null; revoked_at: string | null }>();

  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  await env.DB.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?`).bind(nowIso(), hash).run();

  const scopes = row.scopes ? (JSON.parse(row.scopes) as string[]) : [];
  return {
    id: row.uid,
    email: row.email,
    username: row.username,
    isStreamer: !!row.is_streamer,
    isAdmin: !!row.is_admin,
    banned: isSuspended(row),
    scopes,
  };
}

/** Creates a token, returning the plaintext exactly once. */
export async function createApiToken(
  env: Env,
  userId: string,
  input: { name: string; scopes: string[]; expiresInDays?: number | null },
): Promise<{ token: string; id: string; prefix: string; expiresAt: string | null }> {
  const token = `${API_TOKEN_PREFIX}${randomToken(32)}`;
  const id = randomToken(8);
  const prefix = `${token.slice(0, 12)}…`;
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null;

  await env.DB.prepare(
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, input.name.slice(0, 60), await sha256Hex(token), prefix, JSON.stringify(input.scopes), expiresAt, nowIso())
    .run();

  return { token, id, prefix, expiresAt };
}

/* ------------------------------- login attempts -------------------------------- */

/** Records a login attempt and returns whether the account is currently locked. */
export async function loginLockState(
  env: Env,
  email: string,
  ip: string | null,
): Promise<{ locked: boolean; attempts: number; retryAfterSeconds: number }> {
  const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();

  const byEmail = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM login_attempts WHERE lower(email) = ? AND success = 0 AND created_at >= ?`,
  )
    .bind(email.toLowerCase(), windowStart)
    .first<{ count: number }>();

  const byIp = ip
    ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND success = 0 AND created_at >= ?`)
        .bind(ip, windowStart)
        .first<{ count: number }>()
    : null;

  const attempts = Math.max(byEmail?.count ?? 0, byIp?.count ?? 0);
  const limit = 10;
  return { locked: attempts >= limit, attempts, retryAfterSeconds: 15 * 60 };
}

export async function recordLoginAttempt(
  env: Env,
  input: { email: string; userId?: string | null; ip?: string | null; userAgent?: string | null; success: boolean },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO login_attempts (id, email, user_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(randomToken(9), input.email.toLowerCase(), input.userId ?? null, input.ip ?? null, input.userAgent?.slice(0, 200) ?? null, input.success ? 1 : 0, nowIso())
      .run();
  } catch {
    /* login must not fail because telemetry failed */
  }
}

export async function issueSession(
  env: Env,
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const profile = await env.DB.prepare(`SELECT email, username FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ email: string; username: string }>();
  if (!profile) throw new Error('Cannot issue a session for a user that does not exist');

  const refreshToken = randomToken(48);
  const refreshHash = await sha256Hex(refreshToken);

  const access = await signJwt(env, {
    sub: userId,
    email: profile.email,
    username: profile.username,
    typ: 'access',
    jti: randomToken(16),
    ttlSeconds: ACCESS_TTL_SECONDS,
  });

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, expires_at, refresh_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(access.jti, userId, refreshHash, meta.userAgent ?? null, meta.ip ?? null, access.expiresAt, isoIn(REFRESH_TTL_SECONDS * 1000))
    .run();

  return { accessToken: access.token, refreshToken, expiresAt: access.expiresAt };
}

/**
 * Re-issues an access token from a valid refresh token.
 *
 * The session row (and therefore the access-token `jti`) is reused so that a
 * background refresh never invalidates tokens that are already in flight; the
 * refresh token itself is rotated on every use.
 */
export async function rotateSession(
  env: Env,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string; userId: string } | null> {
  const refreshHash = await sha256Hex(refreshToken);
  const session = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.refresh_expires_at, s.revoked_at, u.email, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL`,
  )
    .bind(refreshHash)
    .first<{ id: string; user_id: string; refresh_expires_at: string; revoked_at: string | null; email: string; username: string }>();

  if (!session) return null;
  if (new Date(session.refresh_expires_at).getTime() < Date.now()) return null;

  const next = await signJwt(env, {
    sub: session.user_id,
    email: session.email,
    username: session.username,
    typ: 'access',
    jti: session.id,
    ttlSeconds: ACCESS_TTL_SECONDS,
  });

  const nextRefresh = randomToken(48);
  await env.DB.prepare(`UPDATE sessions SET refresh_token_hash = ?, expires_at = ?, refresh_expires_at = ? WHERE id = ?`)
    .bind(await sha256Hex(nextRefresh), next.expiresAt, isoIn(REFRESH_TTL_SECONDS * 1000), session.id)
    .run();

  return { accessToken: next.token, refreshToken: nextRefresh, expiresAt: next.expiresAt, userId: session.user_id };
}

export async function revokeSession(env: Env, jti: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).bind(nowIso(), jti).run();
}

export async function revokeAllSessions(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(nowIso(), userId).run();
}

/* ------------------------------- password reset ----------------------------- */

export async function createPasswordReset(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  await env.DB.prepare(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256Hex(token), userId, isoIn(RESET_TTL_SECONDS * 1000))
    .run();
  return token;
}

export async function consumePasswordReset(env: Env, token: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?`,
  )
    .bind(await sha256Hex(token))
    .first<{ user_id: string; expires_at: string; used_at: string | null }>();

  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  await env.DB.prepare(`UPDATE password_resets SET used_at = ? WHERE token_hash = ?`)
    .bind(nowIso(), await sha256Hex(token))
    .run();
  // Nuke every active session: the password changed everywhere.
  await revokeAllSessions(env, row.user_id);
  return row.user_id;
}

/* -------------------------------- middleware -------------------------------- */

function readBearer(c: Context<{ Bindings: Env; Variables: AppVariables }>): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // WebSockets cannot set headers — allow ?token= for upgrade requests.
  return c.req.query('token') ?? null;
}

async function resolveUser(env: Env, jti: string, claims: JwtPayload): Promise<AuthUser | null> {
  const session = await env.DB.prepare(`SELECT revoked_at FROM sessions WHERE id = ?`).bind(jti).first<{ revoked_at: string | null }>();
  if (!session || session.revoked_at) return null;

  const user = await accountState(env, claims.sub);
  if (!user || user.deleted_at) return null;
  return toAuthUser(user);
}

/** Resolves either a JWT session or a personal API token. */
async function authenticate(env: Env, token: string): Promise<{ user: AuthUser; jti?: string } | null> {
  if (token.startsWith(API_TOKEN_PREFIX)) {
    const user = await resolveApiToken(env, token);
    return user ? { user } : null;
  }

  const claims = await verifyJwt(env, token, 'access');
  if (!claims) return null;

  const user = await resolveUser(env, claims.jti, claims);
  return user ? { user, jti: claims.jti } : null;
}

/**
 * Rejects the request with 401 unless a valid access token is presented.
 * Banned accounts are rejected with 403 `account_banned`; use
 * `requireAuthAllowBanned` for the handful of routes a suspended user still
 * needs (viewing their own ban notice, logging out, exporting data).
 */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  return requireAuthWith(c, next, { allowBanned: false });
}

/** Same as `requireAuth` but lets suspended accounts through. */
export async function requireAuthAllowBanned(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  return requireAuthWith(c, next, { allowBanned: true });
}

async function requireAuthWith(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
  options: { allowBanned: boolean },
) {
  const token = readBearer(c);
  if (!token) return unauthorized(c, 'Missing authorization token');

  const resolved = await authenticate(c.env, token);
  if (!resolved) return unauthorized(c, 'Invalid or expired token');

  if (resolved.user.banned && !options.allowBanned) {
    return c.json({ error: 'Your account is suspended or banned', code: 'account_banned' }, 403);
  }

  c.set('authUser', resolved.user);
  if (resolved.jti) c.set('authJti', resolved.jti);
  await next();
}

/** Requires an authenticated administrator (or an admin-scoped API token). */
export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const token = readBearer(c);
  if (!token) return unauthorized(c, 'Missing authorization token');

  const resolved = await authenticate(c.env, token);
  if (!resolved) return unauthorized(c, 'Invalid or expired token');
  if (!resolved.user.isAdmin) return c.json({ error: 'Administrator access required', code: 'forbidden' }, 403);

  c.set('authUser', resolved.user);
  if (resolved.jti) c.set('authJti', resolved.jti);
  await next();
}

/** Attaches `authUser` when a valid token is present, but never rejects. */
export async function optionalAuth(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const token = readBearer(c);
  if (token) {
    const resolved = await authenticate(c.env, token);
    if (resolved && !resolved.user.banned) {
      c.set('authUser', resolved.user);
      if (resolved.jti) c.set('authJti', resolved.jti);
    }
  }
  await next();
}

/** True when the caller holds the given scope (API tokens) or is an admin. */
export function hasScope(user: AuthUser | undefined, scope: string): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!user.scopes?.length) return true; // session tokens are unscoped
  return user.scopes.includes(scope);
}

function unauthorized(c: Context, message: string): Response {
  return c.json({ error: message, code: 'unauthorized' }, 401);
}
