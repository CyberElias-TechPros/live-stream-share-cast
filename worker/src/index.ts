import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppVariables, Env } from './env';
import { ApiError, notFound } from './lib/http';
import { optionalAuth, requireAuth } from './lib/auth';
import { authRoutes } from './routes/auth';
import { userRoutes, profileRoutes } from './routes/users';
import { streamRoutes, chatRoutes } from './routes/streams';
import { mediaRoutes } from './routes/media';
import { runCleanup } from './lib/cleanup';
import { nowIso } from './lib/time';
import { ChatRoom } from './durable/chat-room';
import { SignalRoom } from './durable/signal-room';

export { ChatRoom, SignalRoom };

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/* ----------------------------------- CORS ------------------------------------ */

const allowedOrigins = (env: Env): string[] => (env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim()).filter(Boolean);

app.use('/api/*', (c, next) => {
  const origins = allowedOrigins(c.env);
  const handler = cors({
    origin: (origin) => (origins.includes('*') ? origin : origins.includes(origin) ? origin : origins[0] ?? '*'),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type', 'x-client-info', 'apikey'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'ETag'],
    maxAge: 86400,
  });
  return handler(c, next);
});

/* ---------------------------------- health ----------------------------------- */

app.get('/', (c) =>
  c.json({
    name: 'live-stream-share-cast API',
    environment: c.env.ENVIRONMENT ?? 'development',
    docs: '/api/health',
    timestamp: nowIso(),
  }),
);

app.get('/api/health', async (c) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await c.env.DB.prepare(`SELECT 1 AS ok`).first();
  } catch (error) {
    database = 'error';
    console.error('health check failed', error);
  }

  return c.json(
    {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      environment: c.env.ENVIRONMENT ?? 'development',
      timestamp: nowIso(),
      services: { d1: database, r2: 'ok', durableObjects: 'ok' },
    },
    database === 'ok' ? 200 : 503,
  );
});

/* --------------------------------- WebSockets -------------------------------- */

/**
 * Live chat + presence socket.
 * `?role=host` requires stream ownership; viewers may connect anonymously.
 */
app.get('/api/ws/chat/:streamId', optionalAuth, async (c) => {
  const streamId = c.req.param('streamId') ?? '';
  const auth = c.get('authUser');
  const requestedRole = c.req.query('role') === 'host' ? 'host' : 'viewer';

  if (requestedRole === 'host') {
    if (!auth) throw new ApiError(401, 'Authentication required to broadcast', 'unauthorized');
    const row = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
    if (!row) throw notFound('Stream not found');
    if (row.user_id !== auth.id && !auth.isAdmin) {
      throw new ApiError(403, 'Only the stream owner can connect as host', 'forbidden');
    }
  }

  const params = new URL(c.req.url).searchParams;
  params.set('streamId', streamId);
  params.set('role', requestedRole);
  if (auth) {
    params.set('userId', auth.id);
    params.set('username', auth.username);
  }

  return forwardUpgrade(c.env.CHAT_ROOM, streamId, params, c.req.raw);
});

/**
 * WebRTC signalling socket (replaces the old Supabase Realtime channel).
 * Host = broadcaster, viewers request an offer/answer exchange.
 */
app.get('/api/ws/signal/:streamId', optionalAuth, async (c) => {
  const streamId = c.req.param('streamId') ?? '';
  const auth = c.get('authUser');
  const requestedRole = c.req.query('role') === 'host' ? 'host' : 'viewer';

  if (requestedRole === 'host') {
    if (!auth) throw new ApiError(401, 'Authentication required to broadcast', 'unauthorized');
    const row = await c.env.DB.prepare(`SELECT user_id FROM streams WHERE id = ?`).bind(streamId).first<{ user_id: string }>();
    if (!row) throw notFound('Stream not found');
    if (row.user_id !== auth.id && !auth.isAdmin) {
      throw new ApiError(403, 'Only the stream owner can connect as host', 'forbidden');
    }
  }

  const params = new URL(c.req.url).searchParams;
  params.set('streamId', streamId);
  params.set('role', requestedRole);
  if (auth) params.set('userId', auth.id);

  return forwardUpgrade(c.env.SIGNAL_ROOM, streamId, params, c.req.raw);
});

function forwardUpgrade(
  namespace: DurableObjectNamespace,
  streamId: string,
  params: URLSearchParams,
  source: Request,
): Response | Promise<Response> {
  if (source.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return Response.json({ error: 'Expected a WebSocket upgrade', code: 'upgrade_required' }, { status: 426 });
  }

  const target = new URL('https://durable-object.local/ws');
  target.search = params.toString();

  const headers = new Headers(source.headers);
  headers.set('X-Stream-Id', streamId);

  const stub = namespace.get(namespace.idFromName(streamId));
  return stub.fetch(new Request(target.toString(), { headers }));
}

/* ----------------------------------- admin ----------------------------------- */

app.post('/api/admin/cleanup', async (c) => {
  const expected = c.env.CLEANUP_TOKEN;
  if (!expected) throw new ApiError(503, 'CLEANUP_TOKEN is not configured on this worker', 'not_configured');

  const provided = c.req.header('X-Cleanup-Token') ?? c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  if (provided !== expected) throw new ApiError(401, 'Invalid cleanup token', 'unauthorized');

  const report = await runCleanup(c.env);
  return c.json({ success: true, report });
});

/** Authenticated convenience mirror of the cron job (own streams only). */
app.post('/api/admin/cleanup/recordings', requireAuth, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, recording_key FROM streams
      WHERE user_id = ? AND recording_key IS NOT NULL`,
  )
    .bind(auth.id)
    .all<{ id: string; recording_key: string }>();

  let deleted = 0;
  for (const row of results ?? []) {
    await c.env.RECORDINGS.delete(row.recording_key);
    await c.env.DB.prepare(`UPDATE streams SET recording_url = NULL, recording_key = NULL, recording_expiry = NULL WHERE id = ?`)
      .bind(row.id)
      .run();
    deleted += 1;
  }

  return c.json({ success: true, deleted });
});

/* ----------------------------------- routes ---------------------------------- */

app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/profiles', profileRoutes);
app.route('/api/streams', streamRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/media', mediaRoutes);

/* --------------------------------- fallbacks --------------------------------- */

app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${c.req.path}`, code: 'not_found' }, 404));

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.message, code: error.code, details: error.details }, error.status as 400);
  }
  console.error('unhandled error', error);
  return c.json({ error: 'Internal server error', code: 'internal_error' }, 500);
});

/* --------------------------------- scheduled --------------------------------- */

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runCleanup(env)
        .then((report) => console.info('[cron] cleanup', JSON.stringify(report)))
        .catch((error) => console.error('[cron] cleanup failed', error)),
    );
  },
} satisfies ExportedHandler<Env>;
