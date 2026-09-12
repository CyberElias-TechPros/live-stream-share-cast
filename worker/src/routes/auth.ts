import { z } from 'zod';
import type { Ctx } from '../router';
import {
  apiError,
  corsHeaders,
  getClientIp,
  json,
  nowISO,
  randomId,
  readJson,
  toSelfUser,
  type UserRow,
} from '../util';
import {
  clearSessionCookie,
  createSession,
  equalizingVerify,
  getSessionUser,
  hashPassword,
  originCheck,
  sessionSetCookie,
  verifyPassword,
} from '../auth';

export const CATEGORIES = ['Gaming', 'Music', 'Talk', 'Tech', 'Art', 'Sports', 'Education', 'IRL', 'Other'] as const;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, 'Username must be 3-24 characters: letters, numbers, underscores');

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  username: usernameSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().trim().min(1).max(32).optional(),
});

const loginSchema = z.object({
  identity: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

const AVATAR_COLORS = ['#7C5CFF', '#FF3B30', '#FF8A3C', '#2DD4BF', '#38BDF8', '#F472B6', '#A3E635', '#FACC15'];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

async function recentAttemptCount(
  db: Ctx['env']['DB'],
  opts: { identity?: string; ip?: string; sinceMs: number; failuresOnly?: boolean }
): Promise<number> {
  const since = new Date(Date.now() - opts.sinceMs).toISOString();
  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (opts.identity) {
    conditions.push('identity = ?');
    binds.push(opts.identity);
  }
  if (opts.ip) {
    conditions.push('ip = ?');
    binds.push(opts.ip);
  }
  binds.push(since);
  const where = `(${conditions.join(' OR ')}) AND created_at > ?${opts.failuresOnly ? ' AND success = 0' : ''}`;
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function recordAttempt(db: Ctx['env']['DB'], identity: string, ip: string, success: boolean) {
  await db
    .prepare('INSERT INTO login_attempts (identity, ip, success, created_at) VALUES (?, ?, ?, ?)')
    .bind(identity.slice(0, 254), ip, success ? 1 : 0, nowISO())
    .run();
}

// POST /api/auth/signup
export async function handleSignup(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const origins = env.ALLOWED_ORIGINS === '*' ? '*' : env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!originCheck(req, origins)) return apiError(403, 'bad_origin', 'Origin not allowed');

  const body = await readJson(req);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input', corsHeaders(env, req));
  }
  const { email, username, password } = parsed.data;
  const ip = getClientIp(req);

  const signupCount = await recentAttemptCount(env.DB, { identity: `signup:${ip}`, sinceMs: 60 * 60 * 1000 });
  if (signupCount >= 25) {
    return apiError(429, 'rate_limited', 'Too many signup attempts from this address. Try again later.', {
      'retry-after': '3600',
      ...corsHeaders(env, req),
    });
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
    .bind(email, username)
    .first<{ id: string }>();
  if (existing) {
    await recordAttempt(env.DB, `signup:${ip}`, ip, false);
    const emailTaken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    return apiError(409, emailTaken ? 'email_taken' : 'username_taken', emailTaken ? 'An account with this email already exists' : 'That username is already taken', corsHeaders(env, req));
  }

  const now = nowISO();
  const id = randomId();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, username, display_name, password_hash, bio, avatar_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`
    )
      .bind(id, email, username, parsed.data.displayName ?? username, passwordHash, pickAvatarColor(id), now, now)
      .run();
  } catch (e: unknown) {
    // Unique constraint race (two signups at once) — report a friendly conflict.
    const message = e instanceof Error ? e.message : '';
    if (message.includes('UNIQUE')) {
      return apiError(409, 'account_taken', 'An account with this email or username already exists', corsHeaders(env, req));
    }
    throw e;
  }

  await recordAttempt(env.DB, `signup:${ip}`, ip, true);
  const session = await createSession(env, id, req);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return json(
    { user: row ? toSelfUser(row) : null },
    201,
    { 'set-cookie': sessionSetCookie(req, session.token, session.expiresAt), ...corsHeaders(env, req) }
  );
}

// POST /api/auth/login
export async function handleLogin(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const origins = env.ALLOWED_ORIGINS === '*' ? '*' : env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!originCheck(req, origins)) return apiError(403, 'bad_origin', 'Origin not allowed');

  const body = await readJson(req);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'validation_error', 'Enter your email/username and password', corsHeaders(env, req));
  }
  const { identity, password } = parsed.data;
  const ip = getClientIp(req);
  const identityNorm = identity.toLowerCase();

  const fails = await recentAttemptCount(env.DB, { identity: identityNorm, ip, sinceMs: 15 * 60 * 1000, failuresOnly: true });
  if (fails >= 10) {
    return apiError(429, 'rate_limited', 'Too many attempts. Please wait 15 minutes and try again.', {
      'retry-after': '900',
      ...corsHeaders(env, req),
    });
  }

  const row = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ? OR username = ? COLLATE NOCASE'
  )
    .bind(identityNorm, identityNorm)
    .first<UserRow>();

  const valid = await equalizingVerify(password, row?.password_hash);
  if (!row || !valid) {
    await recordAttempt(env.DB, identityNorm, ip, false);
    return apiError(401, 'invalid_credentials', 'Incorrect email/username or password', corsHeaders(env, req));
  }

  await recordAttempt(env.DB, identityNorm, ip, true);
  const session = await createSession(env, row.id, req);
  return json(
    { user: toSelfUser(row) },
    200,
    { 'set-cookie': sessionSetCookie(req, session.token, session.expiresAt), ...corsHeaders(env, req) }
  );
}

// POST /api/auth/logout
export async function handleLogout(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (auth) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(auth.sessionId).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(req), ...corsHeaders(env, req) });
}

// GET /api/auth/me
export async function handleMe(ctx: Ctx): Promise<Response> {
  const { req, env } = ctx;
  const auth = await getSessionUser(env, req);
  if (!auth) return apiError(401, 'unauthenticated', 'Not signed in', corsHeaders(env, req));
  return json({ user: auth.user }, 200, corsHeaders(env, req));
}

// Re-export verifyPassword for tests
export { verifyPassword, hashPassword };
