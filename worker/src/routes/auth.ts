import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import {
  consumePasswordReset,
  createPasswordReset,
  hashPassword,
  issueSession,
  revokeAllSessions,
  revokeSession,
  requireAuth,
  rotateSession,
  verifyPassword,
} from '../lib/auth';
import { badRequest, conflict, notFound, readJson, unauthorized, validateEmail, validatePassword, validateUsername } from '../lib/http';
import { uuid } from '../lib/ids';
import { privateUser, defaultPreferences, type UserRow } from '../lib/serialize';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** Thin wrapper so route handlers keep their narrowed `c.get('authUser')` types. */
const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

/* --------------------------------- signup ----------------------------------- */

authRoutes.post('/signup', rateLimit({ limit: 10, windowMs: 60_000, name: 'signup' }), async (c) => {
  const body = await readJson(c);
  const username = validateUsername(body.username);
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 80) : username;

  const existing = await c.env.DB.prepare(`SELECT id, email, username FROM users WHERE lower(email) = ? OR lower(username) = ?`)
    .bind(email, username.toLowerCase())
    .first<{ id: string; email: string; username: string }>();

  if (existing) {
    if (existing.email.toLowerCase() === email) throw conflict('An account with this email already exists', 'email_taken');
    throw conflict('That username is already taken', 'username_taken');
  }

  const id = uuid();
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, preferences, social_links, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, username, displayName, passwordHash, JSON.stringify(defaultPreferences()), '[]', nowIso())
    .run();

  const session = await issueSession(c.env, id, { userAgent: c.req.header('User-Agent'), ip: c.req.header('CF-Connecting-IP') });
  const user = await loadUser(c.env, id);

  return c.json({ user, ...session }, 201);
});

/* ---------------------------------- login ----------------------------------- */

authRoutes.post('/login', rateLimit({ limit: 20, windowMs: 60_000, name: 'login' }), async (c) => {
  const body = await readJson(c);
  const email = validateEmail(body.email);
  const password = String(body.password ?? '');

  const row = await c.env.DB.prepare(`SELECT id, password_hash FROM users WHERE lower(email) = ?`)
    .bind(email)
    .first<{ id: string; password_hash: string }>();

  // Same message for unknown email and wrong password.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw unauthorized('Invalid email or password');
  }

  await c.env.DB.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).bind(nowIso(), row.id).run();

  const session = await issueSession(c.env, row.id, {
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('CF-Connecting-IP'),
  });
  const user = await loadUser(c.env, row.id);

  return c.json({ user, ...session });
});

/* --------------------------------- refresh ---------------------------------- */

authRoutes.post('/refresh', rateLimit({ limit: 60, windowMs: 60_000, name: 'refresh' }), async (c) => {
  const body = await readJson(c);
  const refreshToken = String(body.refreshToken ?? '');
  if (!refreshToken) throw badRequest('refreshToken is required');

  const rotated = await rotateSession(c.env, refreshToken);
  if (!rotated) throw unauthorized('Refresh token is invalid or expired');

  const user = await loadUser(c.env, rotated.userId);
  return c.json({ user, accessToken: rotated.accessToken, refreshToken: rotated.refreshToken, expiresAt: rotated.expiresAt });
});

/* ----------------------------------- me ------------------------------------- */

authRoutes.get('/me', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const user = await loadUser(c.env, auth.id);
  if (!user) throw notFound('User not found');
  return c.json({ user });
});

/* --------------------------------- logout ----------------------------------- */

authRoutes.post('/logout', authGuard, async (c) => {
  const jti = c.get('authJti');
  if (jti) await revokeSession(c.env, jti);
  return c.json({ success: true });
});

/* ------------------------------ password reset ------------------------------ */

authRoutes.post('/forgot-password', rateLimit({ limit: 5, windowMs: 10 * 60_000, name: 'forgot' }), async (c) => {
  const body = await readJson(c);
  const email = validateEmail(body.email);

  const user = await c.env.DB.prepare(`SELECT id FROM users WHERE lower(email) = ?`).bind(email).first<{ id: string }>();

  // Always answer the same way so the endpoint cannot enumerate accounts.
  if (!user) return c.json({ success: true, message: 'If that email exists, a reset link is on its way.' });

  const token = await createPasswordReset(c.env, user.id);
  const resetUrl = `${new URL(c.req.url).origin}/reset-password?token=${token}`;

  // No transactional email provider is wired in. In production, send `resetUrl`
  // here (Resend / Postmark / SES) and drop `devToken` from the response.
  if ((c.env.ENVIRONMENT || 'development') !== 'production') {
    console.info(`[auth] password reset for ${email}: ${resetUrl}`);
    return c.json({ success: true, message: 'Reset link created.', devToken: token, resetUrl });
  }

  return c.json({ success: true, message: 'If that email exists, a reset link is on its way.' });
});

authRoutes.post('/reset-password', rateLimit({ limit: 10, windowMs: 10 * 60_000, name: 'reset' }), async (c) => {
  const body = await readJson(c);
  const token = String(body.token ?? '');
  const password = validatePassword(body.password);

  const userId = await consumePasswordReset(c.env, token);
  if (!userId) throw badRequest('This reset link is invalid or has expired');

  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(password), nowIso(), userId)
    .run();

  return c.json({ success: true });
});

/* --------------------------------- sessions --------------------------------- */

authRoutes.get('/sessions', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, user_agent, ip, created_at, expires_at FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 20`,
  )
    .bind(auth.id)
    .all<{ id: string; user_agent: string | null; ip: string | null; created_at: string; expires_at: string }>();

  return c.json({
    sessions: (results ?? []).map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ip: row.ip,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
  });
});

authRoutes.delete('/sessions', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  await revokeAllSessions(c.env, auth.id);
  return c.json({ success: true });
});

/* --------------------------------- helpers ---------------------------------- */

export async function loadUser(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ? privateUser(row) : null;
}
