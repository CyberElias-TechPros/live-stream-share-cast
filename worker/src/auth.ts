import type { Env } from './env';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, nowISO, sha256Hex, toBase64Url, toSelfUser, type SelfUser, type UserRow } from './util';

const PBKDF2_ITERATIONS = 100_000;

/** Hash a password as `pbkdf2-sha256$iterations$salt_b64$hash_b64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

/** Verify a password against a stored hash in constant time. Supports iteration upgrades. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  const saltB64 = parts[2]!;
  const hashB64 = parts[3]!;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  try {
    const salt = base64ToBytes(saltB64);
    const expected = base64ToBytes(hashB64);
    const derived = await deriveBits(password, salt, iterations);
    if (derived.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i]! ^ expected[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}

/** Dummy verification used to equalize timing when the account does not exist. */
const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function equalizingVerify(password: string, stored: string | undefined): Promise<boolean> {
  return verifyPassword(password, stored ?? DUMMY_HASH);
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

export async function createSession(env: Env, userId: string, req: Request): Promise<CreatedSession> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, userId, nowISO(), expiresAt, req.headers.get('user-agent')?.slice(0, 256) ?? null, req.headers.get('cf-connecting-ip') ?? null)
    .run();
  return { token, expiresAt };
}

/**
 * Set the session cookie. When the API is consumed cross-origin (e.g. Vercel frontend
 * -> Worker API) the cookie must be `SameSite=None; Secure`; otherwise we prefer `Lax`.
 */
export function sessionSetCookie(req: Request, token: string, expiresAt: string): string {
  const crossOrigin = isCrossOriginApi(req);
  const secure = isSecureRequest(req) || crossOrigin;
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    crossOrigin ? 'SameSite=None' : 'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(req: Request): string {
  const crossOrigin = isCrossOriginApi(req);
  const secure = isSecureRequest(req) || crossOrigin;
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${crossOrigin ? 'SameSite=None' : 'SameSite=Lax'}; Max-Age=0${secure ? '; Secure' : ''}`;
}

function isSecureRequest(req: Request): boolean {
  if (req.headers.get('x-forwarded-proto') === 'https') return true;
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isCrossOriginApi(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return false;
  }
}

function parseCookies(req: Request): Map<string, string> {
  const map = new Map<string, string>();
  const header = req.headers.get('cookie');
  if (!header) return map;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return map;
}

export async function getSessionUser(env: Env, req: Request): Promise<{ user: SelfUser; sessionId: string } | null> {
  let token = parseCookies(req).get(SESSION_COOKIE) ?? null;
  if (!token) {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token) return null;

  const sessionId = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`
  )
    .bind(sessionId, nowISO())
    .first<{ session_id: string; session_expires_at: string } & UserRow>();
  if (!row) return null;
  const { session_id, session_expires_at, ...userRow } = row;
  void session_expires_at;
  return { user: toSelfUser(userRow as UserRow), sessionId: session_id };
}

/** CSRF defense for cookie-authenticated mutating requests: enforce Origin allowlist. */
export function originCheck(req: Request, allowedOrigins: string[] | '*'): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser client
  if (allowedOrigins === '*') {
    // Even with a wildcard CORS policy, never accept cross-site cookie auth from
    // an origin that is not the API's own origin.
    try {
      return new URL(origin).host === new URL(req.url).host;
    } catch {
      return false;
    }
  }
  return allowedOrigins.includes(origin);
}
