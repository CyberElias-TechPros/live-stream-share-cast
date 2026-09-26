/**
 * Public runtime configuration.
 *
 * The SPA calls `GET /api/config` once on boot to learn what this deployment
 * supports (features, limits, brand, captcha site key, analytics provider,
 * payment presets). That is what makes "add the keys later" possible without
 * shipping a new frontend: the server decides what is switched on.
 */

import { Hono } from 'hono';
import type { AppVariables, Env } from '../env';
import { publicConfig } from '../lib/config';
import { optionalAuth } from '../lib/auth';
import { iceServersFor } from '../lib/turn';
import { parseJson } from '../lib/serialize';
import { baseUrl } from '../lib/url';

export const configRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** Everything the browser needs to render itself correctly. */
configRoutes.get('/', (c) => {
  const origin = baseUrl(c.env, c.req.url) || new URL(c.req.url).origin;
  return c.json(publicConfig(c.env, origin));
});

/**
 * ICE servers for WebRTC. TURN credentials are minted per request with a short
 * TTL, so the shared secret never reaches the client.
 */
configRoutes.get('/rtc/ice', async (c) => {
  const ice = await iceServersFor(c.env);
  c.header('Cache-Control', 'no-store');
  return c.json(ice);
});

/** Browse taxonomy — active categories, ordered for navigation chips. */
configRoutes.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT slug, name, description, emoji, color, sort_order
       FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`,
  ).all<{ slug: string; name: string; description: string | null; emoji: string | null; color: string | null; sort_order: number | null }>();

  // Include live-stream counts so the UI can hide empty categories if it wants.
  const { results: counts } = await c.env.DB.prepare(
    `SELECT LOWER(category) AS slug, COUNT(*) AS live FROM streams WHERE is_live = 1 AND category IS NOT NULL GROUP BY LOWER(category)`,
  ).all<{ slug: string; live: number }>();

  const liveBySlug = new Map((counts ?? []).map((row) => [row.slug, row.live]));

  return c.json({
    categories: (results ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      emoji: row.emoji,
      color: row.color,
      liveStreams: liveBySlug.get(row.slug.toLowerCase()) ?? 0,
    })),
  });
});

/** Feature flags resolved for the caller (admin flags can be overridden in D1). */
configRoutes.get('/features', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT key, enabled, value FROM feature_flags`).all<{ key: string; enabled: number; value: string | null }>();
  const flags: Record<string, { enabled: boolean; value: unknown }> = {};
  for (const row of results ?? []) flags[row.key] = { enabled: !!row.enabled, value: parseJson(row.value, null) };
  return c.json({ flags });
});

/**
 * Client-side telemetry intake: uncaught errors from the SPA. Errors are
 * fingerprinted and de-duplicated so a render loop cannot flood D1.
 *
 * Mounted at `/api/telemetry`.
 */
export const telemetryRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

telemetryRoutes.post('/errors', optionalAuth, async (c) => {
  if (String(c.env.FEATURE_CLIENT_ERRORS ?? 'true').toLowerCase() === 'false') return c.json({ success: true, ignored: true });

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : null;
  if (!message) return c.json({ success: true, ignored: true });

  const fingerprint = `${message.slice(0, 120)}|${String(body.url ?? '').slice(0, 120)}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const fingerprintHash = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

  const existing = await c.env.DB.prepare(`SELECT id, occurrences FROM client_errors WHERE fingerprint = ?`).bind(fingerprintHash).first<{
    id: string;
    occurrences: number;
  }>();

  if (existing) {
    await c.env.DB.prepare(`UPDATE client_errors SET occurrences = occurrences + 1, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO client_errors (id, user_id, message, stack, url, user_agent, app_version, release, fingerprint, level, source, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        // Trust the session, never the payload — reports cannot be forged onto another account.
        c.get('authUser')?.id ?? null,
        message,
        typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null,
        typeof body.url === 'string' ? body.url.slice(0, 500) : null,
        c.req.header('User-Agent')?.slice(0, 300) ?? null,
        typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : null,
        c.env.APP_VERSION ?? null,
        fingerprintHash,
        ['error', 'warning', 'info'].includes(String(body.level)) ? String(body.level) : 'error',
        typeof body.source === 'string' ? body.source.slice(0, 60) : 'spa',
        body.context === undefined ? null : JSON.stringify(body.context).slice(0, 4000),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
  }

  return c.json({ success: true });
});

/** Health + integration readiness. Safe to expose: no secret values, only booleans. */
