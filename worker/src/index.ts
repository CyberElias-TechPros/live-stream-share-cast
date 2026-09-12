import type { Env } from './env';
import { Router, type Ctx } from './router';
import { RoomDO } from './room';
import { apiError, corsHeaders, isOriginAllowed, json, nowISO } from './util';
import { handleLogin, handleLogout, handleMe, handleSignup } from './routes/auth';
import { handleFollow, handleGetProfile, handleMySessions, handleUnfollow, handleUpdateMe } from './routes/users';
import {
  handleCreateStream,
  handleDeleteRecording,
  handleDeleteStream,
  handleDownloadRecording,
  handleGetChat,
  handlePostChat,
  handleGetStream,
  handleListStreams,
  handleMyStreams,
  handleStartStream,
  handleJoinCall,
  handleStopStream,
  handleUpdateStream,
  handleUploadRecording,
} from './routes/streams';
import { handleConfig, handleHealth, handleSitemap } from './routes/misc';

export { RoomDO };

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

/** CSP applied to documents/assets served by this Worker (single-origin mode). */
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const router = new Router();

router.post('/api/auth/signup', guard(handleSignup));
router.post('/api/auth/login', guard(handleLogin));
router.post('/api/auth/logout', guard(handleLogout));
router.get('/api/auth/me', guard(handleMe));

router.get('/api/users/:username', guard(handleGetProfile));
router.patch('/api/users/me', guard(handleUpdateMe));
router.post('/api/users/:username/follow', guard(handleFollow));
router.delete('/api/users/:username/follow', guard(handleUnfollow));
router.get('/api/sessions', guard(handleMySessions));

router.get('/api/streams', guard(handleListStreams));
router.post('/api/streams', guard(handleCreateStream));
router.get('/api/streams/mine', guard(handleMyStreams));
router.get('/api/streams/:id', guard(handleGetStream));
router.patch('/api/streams/:id', guard(handleUpdateStream));
router.delete('/api/streams/:id', guard(handleDeleteStream));
router.post('/api/streams/:id/start', guard(handleStartStream));
router.post('/api/streams/:id/join-call', guard(handleJoinCall));
router.post('/api/streams/:id/stop', guard(handleStopStream));
router.get('/api/streams/:id/chat', guard(handleGetChat));
router.post('/api/streams/:id/chat', guard(handlePostChat));
router.put('/api/streams/:id/recording', guard(handleUploadRecording));
router.get('/api/streams/:id/recording', guard(handleDownloadRecording));
router.delete('/api/streams/:id/recording', guard(handleDeleteRecording));

router.get('/api/health', guard(handleHealth));
router.get('/api/config', guard(handleConfig));
router.get('/sitemap.xml', guard(handleSitemap));

/**
 * CSRF/origin gate for cookie-authenticated mutating requests, plus WebSocket
 * origin validation. Non-browser clients (no Origin header) pass through and
 * can use `Authorization: Bearer <token>` instead of cookies.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function guard(handler: (ctx: Ctx) => Promise<Response> | Response) {
  return async (ctx: Ctx): Promise<Response> => {
    const { req, env } = ctx;
    const origin = req.headers.get('origin');
    if (!isOriginAllowed(env, origin)) {
      return apiError(403, 'bad_origin', 'Origin not allowed');
    }
    if (MUTATING.has(req.method) && origin) {
      // Cross-site form posts / fetches must come from an allowlisted origin.
      const allowed = env.ALLOWED_ORIGINS.trim();
      const sameOrigin = safeHost(origin) === safeHost(req.url);
      const allowlisted = allowed !== '*' && allowed.split(',').map((s) => s.trim()).includes(origin);
      if (!sameOrigin && !allowlisted) {
        return apiError(403, 'bad_origin', 'Cross-site request rejected');
      }
    }
    return handler(ctx);
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Attach headers without mutating (possibly immutable) response objects.
 * Responses from DO stubs and static assets are immutable in the runtime;
 * WebSocket 101 responses are returned untouched.
 */
function withHeaders(response: Response, headers: Record<string, string>): Response {
  if (response.status === 101 || response.webSocket) return response;
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

async function handleApiRequest(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env, req) });
  }
  const match = router.match(req);
  if (!match) {
    const status = router.knowsPath(new URL(req.url).pathname) ? 405 : 404;
    return apiError(status, status === 405 ? 'method_not_allowed' : 'not_found', 'Unknown API route', corsHeaders(env, req));
  }
  const ctx: Ctx = { req, env, url: new URL(req.url), params: match.params };
  const response = await match.handler(ctx);
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!merged.has(k)) merged.set(k, v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

async function handleWebSocketUpgrade(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]+)\/ws$/);
  if (!match) return apiError(404, 'not_found', 'Unknown room');
  const origin = req.headers.get('origin');
  if (origin && !isOriginAllowed(env, origin)) {
    return apiError(403, 'bad_origin', 'Origin not allowed');
  }
  const id = env.ROOM.idFromName(match[1]!);
  const stub = env.ROOM.get(id);
  return stub.fetch(req);
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);
    try {
      let response: Response;
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.match(/^\/api\/room\/[^/]+\/ws$/)) {
          response = await handleWebSocketUpgrade(req, env);
        } else {
          response = await handleApiRequest(req, env);
        }
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        if (router.match(req)) {
          // Worker-served public routes (e.g. /sitemap.xml) win over static assets.
          response = await handleApiRequest(req, env);
        } else {
          // Single-origin mode: serve the built SPA from static assets.
          const assetResponse = await env.ASSETS.fetch(req);
          const extra: Record<string, string> = { 'x-request-id': requestId, ...SECURITY_HEADERS };
          const contentType = assetResponse.headers.get('content-type') ?? '';
          if (contentType.includes('text/html')) {
            extra['content-security-policy'] = DOCUMENT_CSP;
            extra['permissions-policy'] = 'camera=(self), microphone=(self), display-capture=(self)';
          }
          if (url.pathname === '/' || url.pathname === '/index.html') {
            extra['x-clacks-overhead'] = 'GNU Terry Pratchett';
          }
          response = withHeaders(assetResponse, extra);
        }
      } else {
        response = apiError(404, 'not_found', 'Not found');
      }
      return response.status === 101 ? response : withHeaders(response, { 'x-request-id': requestId });
    } catch (error: unknown) {
      console.error(`[${nowISO()}] ${requestId} ${req.method} ${url.pathname}`, error);
      return json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } }, 500, {
        'x-request-id': requestId,
      });
    }
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = nowISO();
    try {
      // 1. Reclaim orphaned live streams: the RoomDO heartbeat refreshes
      //    updated_at while a broadcast is actually running, so anything
      //    still flagged live after 10 minutes of silence is dead.
      const stale = await env.DB.prepare(
        `SELECT id, started_at, peak_viewers FROM streams WHERE is_live = 1 AND updated_at < ?`
      )
        .bind(new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .all<{ id: string; started_at: string | null; peak_viewers: number }>();
      for (const stream of stale.results) {
        const ended = nowISO();
        await env.DB.prepare('UPDATE streams SET is_live = 0, ended_at = ?, viewer_count = 0, updated_at = ? WHERE id = ?')
          .bind(ended, ended, stream.id)
          .run();
        const session = await env.DB.prepare(
          'SELECT id, started_at FROM stream_sessions WHERE stream_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
        )
          .bind(stream.id)
          .first<{ id: string; started_at: string }>();
        if (session) {
          const duration = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
          await env.DB.prepare('UPDATE stream_sessions SET ended_at = ?, duration_seconds = ?, peak_viewers = COALESCE(peak_viewers, ?) WHERE id = ?')
            .bind(ended, duration, stream.peak_viewers, session.id)
            .run();
        }
      }

      // 2. Expire cloud recordings (R2 configured deployments only).
      if (env.RECORDINGS) {
        const expired = await env.DB.prepare(
          `SELECT id, recording_key FROM streams WHERE recording_key IS NOT NULL AND recording_expires_at < ?`
        )
          .bind(now)
          .all<{ id: string; recording_key: string }>();
        for (const row of expired.results) {
          await env.RECORDINGS.delete(row.recording_key);
          await env.DB.prepare('UPDATE streams SET recording_key = NULL, recording_expires_at = NULL WHERE id = ?')
            .bind(row.id)
            .run();
        }
      } else {
        await env.DB.prepare(
          'UPDATE streams SET recording_key = NULL, recording_expires_at = NULL WHERE recording_key IS NOT NULL AND recording_expires_at < ?'
        )
          .bind(now)
          .run();
      }

      // 3. Prune noise.
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      const weekAgoSessions = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM stream_stats WHERE timestamp < ?').bind(weekAgo),
        env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(twoDaysAgo),
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(weekAgoSessions),
        env.DB.prepare('DELETE FROM room_tickets WHERE expires_at < ?').bind(now),
      ]);
    } catch (error) {
      console.error('scheduled maintenance failed', error);
    }
  },
};
