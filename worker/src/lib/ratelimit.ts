import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { tooManyRequests } from './http';

/**
 * Best-effort fixed-window rate limiter.
 *
 * State lives in the isolate, so limits are per-colocation rather than global —
 * good enough to blunt credential stuffing and chat spam. For hard guarantees
 * put a WAF rate-limiting rule (or a Durable Object counter) in front.
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
  const { limit, windowMs, name, perUser } = options;

  return async (c, next) => {
    const now = Date.now();

    // Cheap periodic GC so the map cannot grow without bound.
    if (now - lastSweep > 60_000) {
      for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
      lastSweep = now;
    }

    const identity = perUser ? c.get('authUser')?.id || clientId(c) : clientId(c);
    const key = `${name}:${identity}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      const error = tooManyRequests(`Too many requests. Try again in ${retryAfter}s`);
      c.header('Retry-After', String(retryAfter));
      throw error;
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    await next();
  };
}
