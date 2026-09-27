import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { tooManyRequests } from './http';

/**
 * Rate limiting, in two layers:
 *
 *  1. `limit()` — a fixed-window counter backed by the optional `CACHE` KV
 *     namespace. This is *globally* consistent across colos, so it is the right
 *     tool for anything security-sensitive (login, signup, payments, webhooks).
 *     Without a KV binding it transparently falls back to the per-isolate map.
 *
 *  2. `rateLimit()` — the original per-isolate middleware, kept for cheap
 *     per-route protection. Good enough to blunt chat spam; not a guarantee.
 *
 * For hard guarantees in front of everything, also add a Cloudflare WAF
 * rate-limiting rule (documented in docs/DEPLOYMENT.md).
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
  /** True when the KV namespace is missing and the limit is only approximate. */
  approximate: boolean;
}

/**
 * Fixed-window limiter. KV writes are eventually consistent, so the counter can
 * briefly under-count across colos; that is acceptable for abuse control and
 * much cheaper than a Durable Object round-trip on every request.
 */
export async function limit(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const result = await checkLimit(env, key, max, windowMs);
  return result.allowed;
}

export async function checkLimit(env: Env, key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();

  if (env.CACHE) {
    const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;
    try {
      const current = Number((await env.CACHE.get(windowKey)) ?? '0');
      if (current >= max) {
        return { allowed: false, remaining: 0, resetAt: (Math.floor(now / windowMs) + 1) * windowMs, approximate: false };
      }
      await env.CACHE.put(windowKey, String(current + 1), { expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) * 2) });
      return { allowed: true, remaining: Math.max(0, max - current - 1), resetAt: (Math.floor(now / windowMs) + 1) * windowMs, approximate: false };
    } catch {
      /* fall through to the in-memory limiter */
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
