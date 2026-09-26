import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import {
  consumePasswordReset,
  createApiToken,
  createPasswordReset,
  hashPassword,
  issueSession,
  loginLockState,
  recordLoginAttempt,
  revokeAllSessions,
  revokeSession,
  requireAuth,
  requireAuthAllowBanned,
  rotateSession,
  verifyPassword,
} from '../lib/auth';
import { badRequest, conflict, forbidden, int, notFound, readJson, unauthorized, validateEmail, validatePassword, validateUsername } from '../lib/http';
import { EMAIL_VERIFICATION_TTL_HOURS, consumeEmailToken, issueEmailToken } from '../lib/emailTokens';
import { emailComposers, sendEmail, sendEmailNow } from '../lib/email';
import { featureConfig, limitsConfig, brandConfig } from '../lib/config';
import { requireCaptcha } from '../lib/security';
import { recordAudit } from '../lib/audit';
import { uuid } from '../lib/ids';
import { privateUser, defaultPreferences, parseJson, type UserRow } from '../lib/serialize';
import { nowIso } from '../lib/time';
import { rateLimit } from '../lib/ratelimit';
import { baseUrl } from '../lib/url';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** Thin wrapper so route handlers keep their narrowed `c.get('authUser')` types. */
const authGuard: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuth(c, next);

/** Routes a suspended account still needs access to. */
const authGuardLoose: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = (c, next) => requireAuthAllowBanned(c, next);

/* --------------------------------- helpers ---------------------------------- */

async function loadUser(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ? privateUser(row) : null;
}

function clientMeta(c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  return { userAgent: c.req.header('User-Agent'), ip: c.req.header('CF-Connecting-IP') ?? null };
}

/* --------------------------------- signup ----------------------------------- */

authRoutes.post('/signup', rateLimit({ limit: 10, windowMs: 60_000, name: 'signup' }), async (c) => {
  const features = featureConfig(c.env);
  if (!features.signups) throw forbidden('New registrations are currently closed');

  const body = await readJson(c);
  await requireCaptcha(c, body.captchaToken ?? body.cfTurnstileToken);

  const username = validateUsername(body.username);
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 80) : username;
  const brand = brandConfig(c.env);

  const existing = await c.env.DB.prepare(`SELECT id, email, username FROM users WHERE lower(email) = ? OR lower(username) = ?`)
    .bind(email, username.toLowerCase())
    .first<{ id: string; email: string; username: string }>();

  if (existing) {
    if (existing.email.toLowerCase() === email) throw conflict('An account with this email already exists', 'email_taken');
    throw conflict('That username is already taken', 'username_taken');
  }

  const id = uuid();
  const passwordHash = await hashPassword(password);
  const acceptedTerms = body.acceptTerms === true;

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, preferences, social_links, last_seen,
                        terms_accepted_at, terms_version, marketing_opt_in, analytics_opt_in)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      email,
      username,
      displayName,
      passwordHash,
      JSON.stringify(defaultPreferences()),
      '[]',
      nowIso(),
      acceptedTerms ? nowIso() : null,
      acceptedTerms ? brand.termsVersion : null,
      body.marketingOptIn === true ? 1 : 0,
      body.analyticsOptIn === false ? 0 : 1,
    )
    .run();

  // Consent + verification trail.
  if (acceptedTerms) {
    await c.env.DB.prepare(`INSERT INTO consents (id, user_id, kind, version, granted, ip, user_agent) VALUES (?, ?, 'terms', ?, 1, ?, ?)`)
      .bind(uuid(), id, brand.termsVersion, c.req.header('CF-Connecting-IP') ?? null, c.req.header('User-Agent')?.slice(0, 300) ?? null)
      .run();
  }

  const composers = emailComposers(c.env);
  const verifyToken = await issueEmailToken(c.env, id, 'verify_email', email);
  const verifyUrl = `${baseUrl(c.env, c.req.url)}/verify-email?token=${verifyToken}&email=${encodeURIComponent(email)}`;
  await sendEmail(c.env, composers.verifyEmail(email, username, verifyUrl));
  await sendEmail(c.env, composers.welcome(email, username));

  const session = await issueSession(c.env, id, clientMeta(c));
  const user = await loadUser(c.env, id);

  await recordLoginAttempt(c.env, { email, userId: id, ip: c.req.header('CF-Connecting-IP'), success: true });

  return c.json(
    {
      user,
      ...session,
      emailVerificationSent: true,
      verificationRequired: features.emailVerificationRequired,
    },
    201,
  );
});

/* ---------------------------------- login ----------------------------------- */

authRoutes.post('/login', rateLimit({ limit: 20, windowMs: 60_000, name: 'login' }), async (c) => {
  const body = await readJson(c);
  const email = validateEmail(body.email);
  const password = String(body.password ?? '');
  const ip = c.req.header('CF-Connecting-IP') ?? null;

  const lock = await loginLockState(c.env, email, ip);
  if (lock.locked) {
    c.header('Retry-After', String(lock.retryAfterSeconds));
    throw unauthorized('Too many failed attempts. Try again in a few minutes.');
  }

  const row = await c.env.DB.prepare(`SELECT id, password_hash, is_banned, suspended_until, deleted_at, email_verified FROM users WHERE lower(email) = ?`)
    .bind(email)
    .first<{
      id: string;
      password_hash: string;
      is_banned: number | null;
      suspended_until: string | null;
      deleted_at: string | null;
      email_verified: number | null;
    }>();

  // Same message for unknown email and wrong password.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    await recordLoginAttempt(c.env, { email, ip, userAgent: c.req.header('User-Agent'), success: false });
    throw unauthorized('Invalid email or password');
  }

  if (row.deleted_at) throw unauthorized('Invalid email or password');

  const suspended = !!row.is_banned || (!!row.suspended_until && new Date(row.suspended_until).getTime() > Date.now());
  if (suspended) {
    const reason = await c.env.DB.prepare(`SELECT ban_reason FROM users WHERE id = ?`).bind(row.id).first<{ ban_reason: string | null }>();
    return c.json(
      {
        error: 'Your account is suspended or banned',
        code: 'account_banned',
        details: { reason: reason?.ban_reason ?? null, until: row.suspended_until ?? null },
      },
      403,
    );
  }

  const features = featureConfig(c.env);
  if (features.emailVerificationRequired && !row.email_verified) {
    return c.json(
      { error: 'Please verify your email address before signing in', code: 'email_unverified', details: { email } },
      403,
    );
  }

  await c.env.DB.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).bind(nowIso(), row.id).run();
  await recordLoginAttempt(c.env, { email, userId: row.id, ip, userAgent: c.req.header('User-Agent'), success: true });

  const session = await issueSession(c.env, row.id, clientMeta(c));
  const user = await loadUser(c.env, row.id);

  return c.json({ user, ...session, emailVerified: !!row.email_verified });
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

authRoutes.get('/me', authGuardLoose, async (c) => {
  const auth = c.get('authUser')!;
  const user = await loadUser(c.env, auth.id);
  if (!user) throw notFound('User not found');

  const ban = await c.env.DB.prepare(
    `SELECT reason, expires_at FROM bans WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(auth.id, nowIso())
    .first<{ reason: string | null; expires_at: string | null }>();

  return c.json({
    user,
    banned: auth.banned ?? false,
    ban: ban ? { reason: ban.reason, until: ban.expires_at } : null,
  });
});

/* --------------------------------- logout ----------------------------------- */

authRoutes.post('/logout', authGuardLoose, async (c) => {
  const jti = c.get('authJti');
  if (jti) await revokeSession(c.env, jti);
  return c.json({ success: true });
});

authRoutes.post('/logout-all', authGuardLoose, async (c) => {
  const auth = c.get('authUser')!;
  await revokeAllSessions(c.env, auth.id);
  return c.json({ success: true });
});

/* ------------------------------ password reset ------------------------------ */

authRoutes.post('/forgot-password', rateLimit({ limit: 5, windowMs: 10 * 60_000, name: 'forgot' }), async (c) => {
  const body = await readJson(c);
  const email = validateEmail(body.email);
  await requireCaptcha(c, body.captchaToken);

  const user = await c.env.DB.prepare(`SELECT id, username FROM users WHERE lower(email) = ? AND deleted_at IS NULL`)
    .bind(email)
    .first<{ id: string; username: string }>();

  // Always answer the same way so the endpoint cannot enumerate accounts.
  const generic = { success: true, message: 'If that email exists, a reset link is on its way.' };
  if (!user) return c.json(generic);

  const token = await createPasswordReset(c.env, user.id);
  const resetUrl = `${baseUrl(c.env, c.req.url)}/reset-password?token=${token}`;
  const delivered = await sendEmailNow(c.env, emailComposers(c.env).resetPassword(email, resetUrl));

  if (!delivered) {
    // No provider configured yet: keep the API usable in development, and log
    // so an operator can hand the link over until the key is added.
    console.warn(JSON.stringify({ level: 'warn', message: 'password reset email not delivered', reason: 'no email provider', email }));
    if ((c.env.ENVIRONMENT || 'development') !== 'production') {
      return c.json({ ...generic, devToken: token, resetUrl });
    }
  }

  return c.json(generic);
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

  const account = await c.env.DB.prepare(`SELECT email, username FROM users WHERE id = ?`).bind(userId).first<{ email: string; username: string }>();
  if (account) await sendEmail(c.env, emailComposers(c.env).passwordChanged(account.email, account.username));

  await recordAudit(c.env, { actorId: userId, action: 'auth.password_changed', targetType: 'user', targetId: userId, ip: c.req.header('CF-Connecting-IP') });

  return c.json({ success: true });
});

authRoutes.post('/change-password', authGuard, rateLimit({ limit: 10, windowMs: 60_000, name: 'change-password', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const body = await readJson(c);

  const current = String(body.currentPassword ?? '');
  const next = validatePassword(body.newPassword ?? body.password);

  const row = await c.env.DB.prepare(`SELECT password_hash, email, username FROM users WHERE id = ?`)
    .bind(auth.id)
    .first<{ password_hash: string; email: string; username: string }>();
  if (!row) throw notFound('User not found');
  if (!(await verifyPassword(current, row.password_hash))) throw unauthorized('Your current password is incorrect');

  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(next), nowIso(), auth.id)
    .run();

  // Keep the caller signed in, drop every other device.
  const jti = c.get('authJti');
  await c.env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?`)
    .bind(nowIso(), auth.id, jti ?? '')
    .run();

  await sendEmail(c.env, emailComposers(c.env).passwordChanged(row.email, row.username));
  await recordAudit(c.env, { actorId: auth.id, action: 'auth.password_changed', targetType: 'user', targetId: auth.id });

  return c.json({ success: true });
});

/* ----------------------------- email verification ---------------------------- */

authRoutes.post('/verify-email', rateLimit({ limit: 20, windowMs: 10 * 60_000, name: 'verify-email' }), async (c) => {
  const body = await readJson(c);
  const token = String(body.token ?? c.req.query('token') ?? '');
  if (!token) throw badRequest('A verification token is required');

  const result = await consumeEmailToken(c.env, token, 'verify_email');
  if (!result) throw badRequest('This verification link is invalid or has expired');

  await c.env.DB.prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`).bind(nowIso(), result.userId).run();

  return c.json({ success: true, email: result.email });
});

authRoutes.post('/resend-verification', authGuardLoose, rateLimit({ limit: 3, windowMs: 10 * 60_000, name: 'resend-verification', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  const row = await c.env.DB.prepare(`SELECT email, username, email_verified FROM users WHERE id = ?`)
    .bind(auth.id)
    .first<{ email: string; username: string; email_verified: number | null }>();
  if (!row) throw notFound('User not found');
  if (row.email_verified) return c.json({ success: true, alreadyVerified: true });

  const token = await issueEmailToken(c.env, auth.id, 'verify_email', row.email);
  const url = `${baseUrl(c.env, c.req.url)}/verify-email?token=${token}&email=${encodeURIComponent(row.email)}`;
  const delivered = await sendEmailNow(c.env, emailComposers(c.env).verifyEmail(row.email, row.username, url));

  return c.json({ success: true, delivered, expiresInHours: EMAIL_VERIFICATION_TTL_HOURS });
});

/* --------------------------------- sessions --------------------------------- */

authRoutes.get('/sessions', authGuardLoose, async (c) => {
  const auth = c.get('authUser')!;
  const jti = c.get('authJti') ?? null;

  const { results } = await c.env.DB.prepare(
    `SELECT id, user_agent, ip, created_at, expires_at FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND refresh_expires_at > ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(auth.id, nowIso())
    .all<{ id: string; user_agent: string | null; ip: string | null; created_at: string; expires_at: string }>();

  return c.json({
    sessions: (results ?? []).map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ip: row.ip,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      current: row.id === jti,
    })),
  });
});

authRoutes.delete('/sessions/:id', authGuardLoose, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .bind(nowIso(), c.req.param('id'), auth.id)
    .run();
  if (!result.meta?.changes) throw notFound('Session not found');
  return c.json({ success: true });
});

authRoutes.delete('/sessions', authGuardLoose, async (c) => {
  const auth = c.get('authUser')!;
  await revokeAllSessions(c.env, auth.id);
  return c.json({ success: true });
});

/* ------------------------ personal API tokens (OBS/bots) ---------------------- */

authRoutes.get('/tokens', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at
       FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(auth.id)
    .all<Record<string, unknown>>();

  return c.json({
    tokens: (results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: parseJson<string[]>(row.scopes as string | null, []),
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revoked: !!row.revoked_at,
      createdAt: row.created_at,
    })),
  });
});

authRoutes.post('/tokens', authGuard, rateLimit({ limit: 10, windowMs: 60 * 60_000, name: 'tokens', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  if (!featureConfig(c.env).apiTokens) throw forbidden('API tokens are disabled on this deployment');

  const body = await readJson(c);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'API token';
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter((scope: unknown): scope is string => typeof scope === 'string').slice(0, 12)
    : ['read'];
  const expiresInDays = body.expiresInDays === undefined ? null : int(body.expiresInDays, 90, 1, 3650);

  const created = await createApiToken(c.env, auth.id, { name, scopes, expiresInDays });

  await recordAudit(c.env, { actorId: auth.id, action: 'token.created', targetType: 'api_token', targetId: created.id, metadata: { name, scopes } });

  // The plaintext token is returned exactly once.
  return c.json({ success: true, ...created }, 201);
});

authRoutes.delete('/tokens/:id', authGuard, async (c) => {
  const auth = c.get('authUser')!;
  const result = await c.env.DB.prepare(`UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .bind(nowIso(), c.req.param('id'), auth.id)
    .run();
  if (!result.meta?.changes) throw notFound('Token not found');

  await recordAudit(c.env, { actorId: auth.id, action: 'token.revoked', targetType: 'api_token', targetId: c.req.param('id') });

  return c.json({ success: true });
});

/* ------------------------------ account lifecycle ----------------------------- */

/** GDPR-style export: everything we hold about the account, as JSON. */
authRoutes.get('/account/export', authGuardLoose, rateLimit({ limit: 3, windowMs: 24 * 60 * 60_000, name: 'export', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  if (!featureConfig(c.env).dataExport) throw forbidden('Data export is disabled on this deployment');

  const [user, streams, sessions, chat, follows, notifications, recordings, tips] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(auth.id).first(),
    c.env.DB.prepare(`SELECT * FROM streams WHERE user_id = ?`).bind(auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM stream_sessions WHERE user_id = ?`).bind(auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM chat_messages WHERE user_id = ? LIMIT 5000`).bind(auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM followers WHERE follower_id = ? OR following_id = ?`).bind(auth.id, auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM notifications WHERE user_id = ? LIMIT 2000`).bind(auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM recordings WHERE user_id = ?`).bind(auth.id).all(),
    c.env.DB.prepare(`SELECT * FROM tips WHERE streamer_id = ? OR tipper_id = ?`).bind(auth.id, auth.id).all(),
  ]);

  const { password_hash: _passwordHash, ...profile } = (user ?? {}) as Record<string, unknown>;

  await c.env.DB.prepare(`UPDATE users SET data_exported_at = ? WHERE id = ?`).bind(nowIso(), auth.id).run();
  await recordAudit(c.env, { actorId: auth.id, action: 'user.exported', targetType: 'user', targetId: auth.id });

  return c.json(
    {
      exportedAt: nowIso(),
      format: 'live-stream-share-cast/account-export@1',
      profile,
      streams: streams.results ?? [],
      sessions: sessions.results ?? [],
      chatMessages: chat.results ?? [],
      follows: follows.results ?? [],
      notifications: notifications.results ?? [],
      recordings: recordings.results ?? [],
      tips: tips.results ?? [],
    },
    200,
    { 'content-disposition': `attachment; filename="account-${auth.id}.json"` },
  );
});

/**
 * Account deletion.
 *
 * The row is anonymised immediately (so nothing user-visible remains) and marked
 * `deleted_at`; the cleanup cron hard-deletes it after 30 days, which is the
 * window covered by backups.
 */
authRoutes.delete('/account', authGuardLoose, rateLimit({ limit: 3, windowMs: 24 * 60 * 60_000, name: 'delete-account', perUser: true }), async (c) => {
  const auth = c.get('authUser')!;
  if (!featureConfig(c.env).accountDeletion) throw forbidden('Account deletion is disabled on this deployment');

  const body = await readJson(c);
  const password = String(body.password ?? '');
  const confirm = String(body.confirm ?? '');

  const row = await c.env.DB.prepare(`SELECT password_hash, email, username FROM users WHERE id = ?`)
    .bind(auth.id)
    .first<{ password_hash: string; email: string; username: string }>();
  if (!row) throw notFound('User not found');
  if (!(await verifyPassword(password, row.password_hash))) throw unauthorized('Your password is incorrect');
  if (confirm !== 'DELETE') throw badRequest('Type DELETE to confirm');

  const now = nowIso();
  const anonymisedEmail = `deleted+${auth.id}@deleted.invalid`;
  const anonymisedUsername = `deleted_${auth.id.slice(0, 8)}`;

  // Stop anything that is currently live.
  await c.env.DB.prepare(`UPDATE streams SET is_live = 0, host_connected = 0, viewer_count = 0, ended_at = ?, updated_at = ? WHERE user_id = ? AND is_live = 1`)
    .bind(now, now, auth.id)
    .run();
  await c.env.DB.prepare(`UPDATE stream_sessions SET ended_at = COALESCE(ended_at, ?) WHERE user_id = ? AND ended_at IS NULL`)
    .bind(now, auth.id)
    .run();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET email = ?, username = ?, display_name = 'Deleted account', bio = NULL, avatar_url = NULL,
              social_links = NULL, donation_url = NULL, website_url = NULL, preferences = '{}',
              is_streamer = 0, is_banned = 0, email_verified = 0, deleted_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(anonymisedEmail, anonymisedUsername, now, now, auth.id),
    c.env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(now, auth.id),
    c.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ?`).bind(auth.id),
    c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).bind(auth.id),
    c.env.DB.prepare(`UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(now, auth.id),
  ]);

  await sendEmail(c.env, emailComposers(c.env).accountDeleted(row.email, row.username));
  await recordAudit(c.env, { actorId: auth.id, action: 'user.deleted', targetType: 'user', targetId: auth.id });

  return c.json({ success: true, purgeAfter: new Date(Date.now() + 30 * 86_400_000).toISOString() });
});

/* -------------------------------- dev helper -------------------------------- */

/** Convenience endpoint the SPA uses to render legal/consent copy versions. */
authRoutes.get('/legal', (c) => {
  const brand = brandConfig(c.env);
  const limits = limitsConfig(c.env);
  return c.json({
    termsVersion: brand.termsVersion,
    privacyVersion: brand.privacyVersion,
    legalEntity: brand.legalEntity,
    jurisdiction: brand.jurisdiction,
    supportEmail: brand.supportEmail,
    retention: { recordingsHours: limits.recordingRetentionHours, deletedAccountsDays: 30 },
  });
});
