import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env';

/** Uniform JSON error shape: `{ error, code?, details? }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, 'bad_request', details);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, message, 'unauthorized');
export const forbidden = (message = 'You do not have access to this resource') => new ApiError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new ApiError(404, message, 'not_found');
export const conflict = (message: string, code = 'conflict') => new ApiError(409, message, code);
export const tooManyRequests = (message = 'Slow down a little') => new ApiError(429, message, 'rate_limited');

/* --------------------------------- helpers ---------------------------------- */

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json(data, status);
}

/** Reads a JSON body, tolerating an empty body (returns `{}`). */
export async function readJson<T = Record<string, any>>(c: Context): Promise<T> {
  try {
    const body = await c.req.json<T>();
    return body ?? ({} as T);
  } catch {
    return {} as T;
  }
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next.length ? next : null;
}

export function int(value: unknown, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

/** Keeps only the keys present in `allowed`, so clients cannot write arbitrary columns. */
export function pick<T extends Record<string, unknown>>(source: T, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/* ----------------------------------- CORS ----------------------------------- */

export function corsHeaders(env: Env, origin?: string | null): Record<string, string> {
  const allowList = (env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim()).filter(Boolean);
  const allowAll = allowList.includes('*');
  const requested = origin || '*';
  const allowed = allowAll ? requested : allowList.includes(requested) ? requested : allowList[0] ?? 'null';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function preflight(env: Env) {
  return (c: Context) => new Response(null, { status: 204, headers: corsHeaders(env, c.req.header('Origin')) });
}

/* ------------------------------ misc utilities ------------------------------ */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(value: unknown): string {
  const username = trimmed(value);
  if (!username) throw badRequest('Username is required');
  if (!USERNAME_RE.test(username)) {
    throw badRequest('Username must be 3–24 characters and may only contain letters, numbers and underscores');
  }
  return username;
}

export function validateEmail(value: unknown): string {
  const email = trimmed(value)?.toLowerCase();
  if (!email) throw badRequest('Email is required');
  if (!EMAIL_RE.test(email)) throw badRequest('Please provide a valid email address');
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('Password is required');
  if (value.length < 8) throw badRequest('Password must be at least 8 characters long');
  if (value.length > 200) throw badRequest('Password is too long');
  return value;
}

/** Trimmed string, capped at `max` characters, or `null` when empty/absent. */
export function trimOrNull(value: unknown, max = 2000): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim().slice(0, max);
  return next.length ? next : null;
}

export function clampText(value: unknown, max: number): string | null {
  const text = trimmed(value);
  if (text === null) return null;
  return text.slice(0, max);
}

/** Converts an incoming value into a JSON string for storage, or `null`. */
export function jsonField(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value; // already serialised
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
