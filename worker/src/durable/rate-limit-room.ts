import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Globally consistent fixed-window limiter. The namespace ID is derived from
 * a hash of the route/identity key, so user IDs and IPs are not embedded in a
 * Durable Object name. Each key is serialized by one DO transaction.
 */
export class RateLimitRoom extends DurableObject<Env> {
  private static readonly STORAGE_KEY = 'counter';

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if (url.pathname !== '/check' || request.method !== 'POST') return new Response('Not found', { status: 404 });

    let input: { max?: unknown; windowMs?: unknown };
    try {
      input = await request.json() as typeof input;
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const max = input.max;
    const windowMs = input.windowMs;
    if (!Number.isSafeInteger(max) || (max as number) < 1 || (max as number) > 1_000_000 ||
      !Number.isSafeInteger(windowMs) || (windowMs as number) < 1_000 || (windowMs as number) > 86_400_000) {
      return Response.json({ error: 'Invalid rate limit configuration' }, { status: 400 });
    }

    const now = Date.now();
    const window = Math.floor(now / (windowMs as number));
    const resetAt = (window + 1) * (windowMs as number);
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const previous = await transaction.get<Counter>(RateLimitRoom.STORAGE_KEY);
      const count = previous?.resetAt === resetAt ? previous.count + 1 : 1;
      await transaction.put(RateLimitRoom.STORAGE_KEY, { count, resetAt } satisfies Counter);
      return { allowed: count <= (max as number), remaining: Math.max(0, (max as number) - count), resetAt };
    });

    // Bound storage growth for one-off identities and route keys. A request
    // just after the boundary may replace this alarm; alarm() rechecks state.
    await this.ctx.storage.setAlarm(Math.max(resetAt, Date.now() + 1_000));
    return Response.json(result);
  }

  async alarm(): Promise<void> {
    const counter = await this.ctx.storage.get<Counter>(RateLimitRoom.STORAGE_KEY);
    if (!counter) return;
    if (counter.resetAt <= Date.now()) {
      await this.ctx.storage.delete(RateLimitRoom.STORAGE_KEY);
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(counter.resetAt, Date.now() + 1_000));
  }
}
