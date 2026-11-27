import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { tooManyRequests } from './http';
import { sha256Hex } from './ids';

/**
 * Rate limiting uses one Durable Object per hashed route/identity key. The DO
 * serializes fixed-window increments globally, so security-sensitive endpoints
 * cannot be bypassed by changing Workers isolates or regions. KV and in-memory
 * counters remain development fallbacks only; production fails closed if the
 * distributed limiter is missing or unavailable. A Cloudflare WAF rule is still
 * recommended for edge-wide volumetric abuse (docs/DEPLOYMENT.md).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function clientId(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'anonymous';
}

/* ----------------------------- distributed limiter ---------------------------- */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** True when a development-only fallback is used instead of the Durable Object. */
  approximate: boolean;
}

/**
 * Fixed-window limiter backed by the Durable Object namespace in production.
 * Local development may use KV or an isolate-local map when no DO binding is
 * available; production never silently degrades to either fallback.
 */
export async function limit(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const result = await checkLimit(env, key, max, windowMs);
  return result.allowed;
}

export async function checkLimit(env: Env, key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const production = (env.ENVIRONMENT ?? 'development').toLowerCase() === 'production';

  if (env.RATE_LIMITER) {
    try {
      const id = env.RATE_LIMITER.idFromName(await sha256Hex(key));
      const response = await env.RATE_LIMITER.get(id).fetch('https://rate-limiter.internal/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max, windowMs }),
      });
      if (!response.ok) throw new Error(`Rate limiter returned ${response.status}`);
      const result = await response.json() as Omit<RateLimitResult, 'approximate'>;
      if (typeof result.allowed !== 'boolean' || typeof result.remaining !== 'number' || typeof result.resetAt !== 'number') {
        throw new Error('Rate limiter returned an invalid response');
      }
      return { ...result, approximate: false };
    } catch {
      // Do not let a regional or Durable Object outage disable security limits.
      if (production) return { allowed: false, remaining: 0, resetAt: now + windowMs, approximate: false };
    }
  } else if (production) {
    return { allowed: false, remaining: 0, resetAt: now + windowMs, approximate: false };
  }

  if (env.CACHE) {
    const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;
    try {
      const current = Number((await env.CACHE.get(windowKey)) ?? '0');
      if (current >= max) {
        return { allowed: false, remaining: 0, resetAt: (Math.floor(now / windowMs) + 1) * windowMs, approximate: true };
      }
      await env.CACHE.put(windowKey, String(current + 1), { expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) * 2) });
      return { allowed: true, remaining: Math.max(0, max - current - 1), resetAt: (Math.floor(now / windowMs) + 1) * windowMs, approximate: true };
    } catch {
      /* fall through to the isolate-local development limiter */
    }
  }

  if (now - lastSweep > 60_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(bucketKey);
    lastSweep = now;
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs, approximate: true };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
    approximate: true,
  };
}

/* -------------------------------- middleware --------------------------------- */

export function rateLimit(options: {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Separate buckets per route group. */
  name: string;
  /** Key by authenticated user id instead of IP address. */
  perUser?: boolean;
}): MiddlewareHandler<{ Bindings: Env; Variables: { authUser?: { id: string } } }> {
  const { limit: max, windowMs, name, perUser } = options;

  return async (c, next) => {
    const identity = perUser ? c.get('authUser')?.id || clientId(c) : clientId(c);
    const result = await checkLimit(c.env, `${name}:${identity}`, max, windowMs);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      c.header('Retry-After', String(retryAfter));
      throw tooManyRequests(`Too many requests. Try again in ${retryAfter}s`);
    }

    await next();
  };
}
