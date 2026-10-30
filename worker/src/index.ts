import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppVariables, Env } from './env';
import { ApiError, notFound, readJson } from './lib/http';
import { optionalAuth, requireAuth } from './lib/auth';
import { authRoutes } from './routes/auth';
import { userRoutes, profileRoutes } from './routes/users';
import { streamRoutes, chatRoutes } from './routes/streams';
import { mediaRoutes } from './routes/media';
import { configRoutes, telemetryRoutes } from './routes/config';
import { notificationRoutes } from './routes/notifications';
import { recordingRoutes } from './routes/recordings';
import { analyticsRoutes } from './routes/analytics';
import { scheduleRoutes } from './routes/schedule';
import { moderationRoutes } from './routes/moderation';
import { adminRoutes } from './routes/admin';
import { paymentRoutes } from './routes/payments';
import { integrationRoutes } from './routes/integrations';
import { searchRoutes } from './routes/search';
import { runCleanup } from './lib/cleanup';
import { integrationStatus, limitsConfig, productionConfigIssues, publicConfig } from './lib/config';
import { reportToSentry, log, setLogLevel } from './lib/logger';
import { requestId, securityHeaders } from './lib/security';
import { nowIso } from './lib/time';
import { randomToken, sha256Hex, uuid } from './lib/ids';
import { rateLimit } from './lib/ratelimit';
import { ChatRoom } from './durable/chat-room';
import { SignalRoom } from './durable/signal-room';

export { ChatRoom, SignalRoom };

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/* ------------------------------- observability ------------------------------- */

app.use('*', requestId);
app.use('*', securityHeaders);

app.use('*', async (c, next) => {
  setLogLevel(c.env.LOG_LEVEL);
  const started = Date.now();
  await next();

  const status = c.res.status;
  if (status >= 500) {
    await reportToSentry(c.env.SENTRY_DSN, new Error(`${c.req.method} ${c.req.path} → ${status}`), {
      requestId: c.get('requestId'),
      path: c.req.path,
    });
  }

  // Structured request log (sampled down for the noisiest successful reads).
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  log[level]('request', {
    requestId: c.get('requestId'),
    method: c.req.method,
    path: c.req.path,
    status,
    durationMs: Date.now() - started,
    userId: c.get('authUser')?.id,
    environment: c.env.ENVIRONMENT ?? 'development',
  });
});

/* ----------------------------------- CORS ------------------------------------ */

const allowedOrigins = (env: Env): string[] => {
  const configured = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (configured.length) return configured;
  return (env.ENVIRONMENT ?? 'development').toLowerCase() === 'production'
    ? []
    : ['http://localhost:8080', 'http://127.0.0.1:8080'];
};

app.use('/api/*', (c, next) => {
  const origins = allowedOrigins(c.env);
  const handler = cors({
    // An empty result omits Access-Control-Allow-Origin for disallowed origins.
    origin: (origin) => (origin && origins.includes(origin) ? origin : ''),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type', 'x-client-info', 'apikey', 'x-request-id', 'x-cleanup-token'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'ETag', 'X-Request-Id', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 86400,
    credentials: true,
  });
  return handler(c, next);
});

/* ---------------------------------- health ----------------------------------- */

app.get('/', (c) =>
  c.json({
    name: 'live-stream-share-cast API',
    version: c.env.APP_VERSION ?? 'dev',
    environment: c.env.ENVIRONMENT ?? 'development',
    docs: '/api/health',
    timestamp: nowIso(),
  }),
);

/**
 * Liveness + readiness. Reports which integrations still need a key so an
 * operator can see exactly what is left to configure.
 */
app.get('/api/health', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = { d1: 'ok', r2: 'ok', durableObjects: 'ok' };

  try {
    await c.env.DB.prepare(`SELECT 1 AS ok`).first();
  } catch (error) {
    checks.d1 = 'error';
    console.error('health check: d1 failed', error);
  }

  try {
    await c.env.RECORDINGS.head('__healthcheck__');
  } catch {
    // A missing object throws NotFound — only a binding/auth error is real.
    checks.r2 = 'ok';
  }

  const integrations = integrationStatus(c.env);
  const missing = integrations.filter((integration) => !integration.configured).map((integration) => integration.id);
  const configurationIssues = productionConfigIssues(c.env);
  const healthy = checks.d1 === 'ok' && checks.r2 === 'ok' && configurationIssues.length === 0;

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database: checks.d1,
      environment: c.env.ENVIRONMENT ?? 'development',
      version: c.env.APP_VERSION ?? 'dev',
      timestamp: nowIso(),
      services: { d1: checks.d1, r2: checks.r2, durableObjects: checks.durableObjects },
      integrations: Object.fromEntries(integrations.map((integration) => [integration.id, integration.configured])),
      // Optional keys that are not set yet — the app degrades gracefully.
      pendingConfiguration: missing,
      configurationIssues,
    },
    healthy ? 200 : 503,
  );
});

/* -------------------------- WebSocket ticketing ----------------------------- */

/**
 * Mints a one-minute, stream-scoped ticket for one WebSocket upgrade. Viewer
 * tickets may be anonymous; host tickets require the stream owner session.
 * The raw value is returned once and only its hash is stored in D1.
 */
app.post('/api/ws/tickets', optionalAuth, rateLimit({ limit: 30, windowMs: 60_000, name: 'ws-ticket' }), async (c) => {
  const body = await readJson<{ streamId?: unknown; role?: unknown }>(c);
  const streamId = typeof body.streamId === 'string' ? body.streamId.trim() : '';
  const role = body.role === 'host' ? 'host' : body.role === 'viewer' ? 'viewer' : null;
  if (!streamId || !role) throw new ApiError(400, 'streamId and role are required', 'bad_request');

  const stream = await c.env.DB.prepare(`SELECT id, user_id, is_live FROM streams WHERE id = ?`)
    .bind(streamId)
    .first<{ id: string; user_id: string; is_live: number }>();
  if (!stream) throw notFound('Stream not found');

  const auth = c.get('authUser');
  if (role === 'host') {
    if (!auth) throw new ApiError(401, 'Authentication required to broadcast', 'unauthorized');
    if (stream.user_id !== auth.id && !auth.isAdmin) {
      throw new ApiError(403, 'Only the stream owner can connect as host', 'forbidden');
    }
  }

  // Both peers must use the explicit stream lifecycle. A host ticket cannot
  // turn an unstarted row into a live broadcast by connecting to the DO.
  if (!stream.is_live) throw new ApiError(409, 'This broadcast is not live', 'stream_offline');

  const ticket = randomToken(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO ws_tickets (id, token_hash, stream_id, user_id, role, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), await sha256Hex(ticket), streamId, auth?.id ?? null, role, expiresAt)
    .run();

  return c.json({ ticket, expiresAt, streamId, role }, 201);
});

async function consumeWebSocketTicket(
  env: Env,
  streamId: string,
  ticket: string,
  role: 'host' | 'viewer',
): Promise<{ userId: string | null; role: 'host' | 'viewer' }> {
  const tokenHash = await sha256Hex(ticket);
  const now = nowIso();
  const row = await env.DB.prepare(
    `SELECT user_id, role FROM ws_tickets
      WHERE token_hash = ? AND stream_id = ? AND role = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(tokenHash, streamId, role, now)
    .first<{ user_id: string | null; role: 'host' | 'viewer' }>();
  if (!row) throw new ApiError(401, 'Invalid or expired WebSocket ticket', 'ws_ticket_invalid');

  const consumed = await env.DB.prepare(`UPDATE ws_tickets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`)
    .bind(now, tokenHash)
    .run();
  if ((consumed.meta?.changes ?? 0) !== 1) throw new ApiError(401, 'WebSocket ticket has already been used', 'ws_ticket_used');
  return { userId: row.user_id, role: row.role };
}

/* -------------------------------- WebSockets --------------------------------- */

/**
 * Live chat + presence socket.
 * `?role=host` requires stream ownership; viewers may connect anonymously.
 * Banned accounts are rejected here as well, so a lost session token cannot be
 * used to keep chatting.
 */
app.get('/api/ws/chat/:streamId', optionalAuth, async (c) => {
  const streamId = c.req.param('streamId') ?? '';
  const auth = c.get('authUser');
  const query = new URL(c.req.url).searchParams;
  const requestedRole = query.get('role') === 'host' ? 'host' : 'viewer';
  const ticket = query.get('ticket');

  if (auth?.banned) throw new ApiError(403, 'Your account is suspended or banned', 'account_banned');
  if (!ticket) throw new ApiError(401, 'A short-lived WebSocket ticket is required', 'ws_ticket_required');
  const granted = await consumeWebSocketTicket(c.env, streamId, ticket, requestedRole);

  const params = new URLSearchParams();
  params.set('streamId', streamId);
  params.set('role', granted.role);
  if (granted.userId) params.set('userId', granted.userId);
  return forwardUpgrade(c.env.CHAT_ROOM, streamId, params, c.req.raw);
});

/** WebRTC signalling socket (replaces the old Supabase Realtime channel). */
app.get('/api/ws/signal/:streamId', optionalAuth, async (c) => {
  const streamId = c.req.param('streamId') ?? '';
  const auth = c.get('authUser');
  const query = new URL(c.req.url).searchParams;
  const requestedRole = query.get('role') === 'host' ? 'host' : 'viewer';
  const ticket = query.get('ticket');

  if (auth?.banned) throw new ApiError(403, 'Your account is suspended or banned', 'account_banned');
  if (!ticket) throw new ApiError(401, 'A short-lived WebSocket ticket is required', 'ws_ticket_required');
  const granted = await consumeWebSocketTicket(c.env, streamId, ticket, requestedRole);

  const params = new URLSearchParams();
  params.set('streamId', streamId);
  params.set('role', granted.role);
  params.set('maxViewers', String(limitsConfig(c.env).maxP2pViewers));
  const peerId = query.get('peerId');
  if (peerId && /^[A-Za-z0-9._:-]{1,100}$/.test(peerId)) params.set('peerId', peerId);
  if (granted.userId) params.set('userId', granted.userId);

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

/** Cron-style maintenance, protected by `CLEANUP_TOKEN`. */
app.post('/api/admin/cleanup', async (c) => {
  const expected = c.env.CLEANUP_TOKEN;
  if (!expected) throw new ApiError(503, 'CLEANUP_TOKEN is not configured on this worker', 'not_configured');

  const provided = c.req.header('X-Cleanup-Token') ?? c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  if (provided !== expected) throw new ApiError(401, 'Invalid cleanup token', 'unauthorized');

  const weekly = new Date().getUTCDay() === 1;
  const report = await runCleanup(c.env, { weekly });
  return c.json({ success: true, report });
});

/** Authenticated convenience mirror of the cron job (own recordings only). */
app.post('/api/admin/cleanup/recordings', requireAuth, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, r2_key FROM recordings WHERE user_id = ? AND status = 'ready'`,
  )
    .bind(auth.id)
    .all<{ id: string; r2_key: string }>();

  let deleted = 0;
  for (const row of results ?? []) {
    await c.env.RECORDINGS.delete(row.r2_key).catch(() => undefined);
    await c.env.DB.prepare(`DELETE FROM recordings WHERE id = ?`).bind(row.id).run();
    deleted += 1;
  }

  await c.env.DB.prepare(
    `UPDATE streams SET recording_url = NULL, recording_key = NULL, recording_expiry = NULL, recording_id = NULL WHERE user_id = ?`,
  )
    .bind(auth.id)
    .run();

  return c.json({ success: true, deleted });
});

/* ----------------------------------- routes ---------------------------------- */

app.route('/api/auth', authRoutes);
app.route('/api/config', configRoutes);
app.route('/api/telemetry', telemetryRoutes);
app.route('/api/users', userRoutes);
app.route('/api/profiles', profileRoutes);
app.route('/api/streams', streamRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/recordings', recordingRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/schedule', scheduleRoutes);
app.route('/api/moderation', moderationRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/integrations', integrationRoutes);
app.route('/api/search', searchRoutes);

/** Public, cacheable runtime config for static hosting (no DB round-trip). */
app.get('/api/runtime-config.json', (c) => {
  const origin = c.env.APP_URL ?? new URL(c.req.url).origin;
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(publicConfig(c.env, origin));
});

/* --------------------------------- fallbacks --------------------------------- */

app.notFound((c) => c.json({ error: `No route for ${c.req.method} ${c.req.path}`, code: 'not_found' }, 404));

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.message, code: error.code, details: error.details }, error.status as 400);
  }

  console.error(JSON.stringify({ level: 'error', message: 'unhandled error', error: String(error), requestId: c.get('requestId') }));
  c.executionCtx.waitUntil(reportToSentry(c.env.SENTRY_DSN, error, { requestId: c.get('requestId'), path: c.req.path }));

  return c.json({ error: 'Internal server error', code: 'internal_error', requestId: c.get('requestId') }, 500);
});

/* --------------------------------- scheduled --------------------------------- */

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // `0 * * * *` → hourly housekeeping; the Monday run also queues digests.
    const weekly = controller.cron === '0 8 * * 1' || new Date(controller.scheduledTime).getUTCDay() === 1;
    ctx.waitUntil(
      runCleanup(env, { weekly })
        .then((report) => console.info(JSON.stringify({ level: 'info', message: 'cron cleanup', report })))
        .catch((error) => {
          console.error(JSON.stringify({ level: 'error', message: 'cron cleanup failed', error: String(error) }));
          return reportToSentry(env.SENTRY_DSN, error, { cron: controller.cron });
        }),
    );
  },
} satisfies ExportedHandler<Env>;
