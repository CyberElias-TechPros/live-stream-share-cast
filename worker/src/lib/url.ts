/**
 * Canonical URL helpers.
 *
 * Emails, webhooks and share links must point at the *public* frontend, not at
 * the API host. `APP_URL` is the source of truth; when it is not set we fall
 * back to the request origin so local development and previews still work.
 */

import type { Env } from '../env';

export function baseUrl(env: Env, requestUrl?: string): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* fall through */
    }
  }
  return '';
}

export function absoluteUrl(env: Env, path: string, requestUrl?: string): string {
  const base = baseUrl(env, requestUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Share links used by social cards and the "copy link" button. */
export function streamUrl(env: Env, streamId: string, requestUrl?: string): string {
  return absoluteUrl(env, `/watch/${streamId}`, requestUrl);
}

export function vodUrl(env: Env, recordingId: string, requestUrl?: string): string {
  return absoluteUrl(env, `/video/${recordingId}`, requestUrl);
}

export function profileUrl(env: Env, username: string, requestUrl?: string): string {
  return absoluteUrl(env, `/profile/${encodeURIComponent(username)}`, requestUrl);
}

/** Splits `Origin`/`Referer` headers for analytics attribution. */
export function referrerHost(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 120);
  } catch {
    return null;
  }
}

/** Coarse device class from a user agent — used by watch analytics. */
export function deviceClass(userAgent: string | undefined | null): string {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/(ipad|tablet|playbook|silk)/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'tablet';
  if (/(smart-tv|smarttv|appletv|googletv|androidtv|hbbtv|netcast|viera|roku)/.test(ua)) return 'tv';
  if (/(mobi|iphone|ipod|android)/.test(ua)) return 'mobile';
  return 'desktop';
}
