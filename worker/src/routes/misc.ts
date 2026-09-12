import type { Ctx } from '../router';
import { corsHeaders, escapeXml, json, nowISO } from '../util';
import { CATEGORIES } from './auth';

// GET /api/health
export async function handleHealth(ctx: Ctx): Promise<Response> {
  const { env } = ctx;
  let dbOk = true;
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
  } catch {
    dbOk = false;
  }
  return json({ ok: true, db: dbOk, time: nowISO() }, dbOk ? 200 : 503);
}

// GET /api/config — ICE servers and feature flags for the client.
export async function handleConfig(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const iceServers: RTCIceServerLike[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (env.TURN_URL) {
    iceServers.push({
      urls: env.TURN_URL.split(',').map((u) => u.trim()),
      username: env.TURN_USERNAME || undefined,
      credential: env.TURN_CREDENTIAL || undefined,
    });
  }
  return json(
    {
      iceServers,
      turnConfigured: !!env.TURN_URL,
      recordingsEnabled: !!env.RECORDINGS,
      categories: CATEGORIES,
    },
    200,
    { 'cache-control': 'public, max-age=300', ...corsHeaders(env, req) }
  );
}

interface RTCIceServerLike {
  urls: string[];
  username?: string;
  credential?: string;
}

function baseUrl(ctx: Ctx): string {
  const configured = ctx.env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const url = new URL(ctx.req.url);
  const proto = ctx.req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = ctx.req.headers.get('x-forwarded-host') ?? ctx.req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

// GET /sitemap.xml — dynamic sitemap: static pages + live streams + profiles.
export async function handleSitemap(ctx: Ctx): Promise<Response> {
  const { env } = ctx;
  const base = baseUrl(ctx);
  const today = nowISO().slice(0, 10);

  const urls: { loc: string; changefreq: string; priority: string }[] = [
    { loc: `${base}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${base}/browse`, changefreq: 'hourly', priority: '0.9' },
    { loc: `${base}/privacy`, changefreq: 'yearly', priority: '0.2' },
    { loc: `${base}/terms`, changefreq: 'yearly', priority: '0.2' },
  ];

  try {
    const live = await env.DB.prepare(
      `SELECT s.id, u.username FROM streams s JOIN users u ON u.id = s.user_id
       WHERE s.is_live = 1 ORDER BY s.viewer_count DESC LIMIT 200`
    )
      .all<{ id: string; username: string }>();
    for (const row of live.results) {
      urls.push({ loc: `${base}/watch/${row.id}`, changefreq: 'hourly', priority: '0.8' });
      urls.push({ loc: `${base}/profile/${row.username}`, changefreq: 'daily', priority: '0.6' });
    }
    const streamers = await env.DB.prepare(
      `SELECT DISTINCT u.username FROM users u
       JOIN streams s ON s.user_id = u.id OR EXISTS (SELECT 1 FROM stream_sessions ss WHERE ss.user_id = u.id)
       LIMIT 500`
    ).all<{ username: string }>();
    for (const row of streamers.results) {
      if (!urls.some((u) => u.loc.endsWith(`/profile/${row.username}`))) {
        urls.push({ loc: `${base}/profile/${row.username}`, changefreq: 'daily', priority: '0.5' });
      }
    }
  } catch {
    // Sitemap stays valid with static routes even if the DB is unavailable.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
  });
}
