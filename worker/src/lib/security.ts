/**
 * Security middleware: request ids, security headers, body-size limits and
 * captcha verification.
 *
 * The Worker serves a JSON API (the SPA is served from Pages/Vercel), so the
 * header set is deliberately conservative: no CSP on API responses (the
 * frontend sets its own), but HSTS, nosniff, frame-deny, referrer policy and a
 * strict permissions policy that also documents which browser capabilities the
 * app actually uses.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../env';
import { ApiError } from './http';
import { newRequestId, normaliseRequestId } from './logger';
import { captchaConfig } from './config';

/* --------------------------------- request id -------------------------------- */

export const requestId: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const id = normaliseRequestId(c.req.header('X-Request-Id')) ?? normaliseRequestId(c.req.header('CF-Ray')) ?? newRequestId();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};

/* ---------------------------------- headers ---------------------------------- */

export const securityHeaders: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  await next();

  const headers = c.res.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin'); // media is fetched cross-origin by design
  headers.set('X-Robots-Tag', 'noindex'); // API responses are never indexed

  if (new URL(c.req.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};

/* ------------------------------- body size limit ------------------------------ */

export function bodyLimit(maxBytes: number): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const declared = Number(c.req.header('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ApiError(413, `Request body is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`, 'payload_too_large');
    }
    await next();
  };
}

/* ----------------------------------- captcha ---------------------------------- */

export interface CaptchaVerifyResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * Verifies a Turnstile / hCaptcha token. When no captcha provider is
 * configured the check is a no-op, so the app keeps working before keys land.
 */
export async function verifyCaptcha(env: Env, token: unknown, ip?: string | null): Promise<CaptchaVerifyResult> {
  const config = captchaConfig(env);
  if (!config.configured || !config.secret) return { ok: true, skipped: true };

  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return { ok: false, error: 'captcha_required' };

  try {
    const endpoint =
      config.provider === 'turnstile'
        ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
        : 'https://api.hcaptcha.com/siteverify';

    const body = new URLSearchParams({ secret: config.secret, response: value });
    if (ip) body.set('remoteip', ip);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const payload = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (payload.success) return { ok: true };
    return { ok: false, error: payload['error-codes']?.[0] ?? 'captcha_failed' };
  } catch (error) {
    // Never lock users out because the captcha provider is unreachable.
    console.warn(JSON.stringify({ level: 'warn', message: 'captcha verification failed', error: String(error) }));
    return { ok: true, skipped: true };
  }
}

/** Throws a 400 with a machine-readable code when the captcha token is invalid. */
export async function requireCaptcha(c: Context<{ Bindings: Env; Variables: AppVariables }>, token: unknown): Promise<void> {
  const result = await verifyCaptcha(c.env, token, c.req.header('CF-Connecting-IP'));
  if (!result.ok) {
    throw new ApiError(400, 'Captcha verification failed. Please try again.', result.error ?? 'captcha_failed');
  }
}

/* -------------------------------- simple guards ------------------------------- */

/** Basic SSRF guard for creator-supplied webhook URLs. */
export function validateExternalUrl(raw: unknown): { ok: boolean; url?: string; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'url_required' };

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'invalid_url' };
  }

  if (url.protocol !== 'https:') return { ok: false, error: 'https_required' };

  const host = url.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal', '169.254.169.254'];
  if (blocked.includes(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'private_host_blocked' };
  }

  // Reject raw IPs in private ranges.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) {
      return { ok: false, error: 'private_host_blocked' };
    }
  }

  return { ok: true, url: url.toString() };
}

/** Escapes user text before it is interpolated into an HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
