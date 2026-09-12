import type { Env } from './env';

export const SESSION_COOKIE = 'il_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** URL-safe random id (default 21 chars, ~125 bits of entropy). */
export function randomId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let out = '';
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Shorter id used for public stream URLs. */
export const shortId = () => randomId(10);

export const nowISO = () => new Date().toISOString();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time equality for equal-length strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  return json({ error: { code, message } }, status, headers);
}

export function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

/** Parse allowed origins from the ALLOWED_ORIGINS var ("*" or comma-separated list). */
export function allowedOrigins(env: Env): string[] | '*' {
  const raw = (env.ALLOWED_ORIGINS ?? '*').trim();
  if (raw === '*') return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isOriginAllowed(env: Env, origin: string | null): boolean {
  if (!origin) return true; // non-browser clients (curl, native apps)
  const allowed = allowedOrigins(env);
  if (allowed === '*') return true;
  return allowed.includes(origin);
}

export function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = allowedOrigins(env);
  const allowAll = allowed === '*';
  const isAllowed = origin && (allowAll || allowed.includes(origin));
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  if (isAllowed && origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-credentials'] = 'true';
  }
  return headers;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 100_000) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Escape a string for inclusion in XML (sitemap). */
export function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  followersCount: number;
  followingCount: number;
  socialLinks: { platform: string; url: string }[];
  createdAt: string;
}

export interface SelfUser extends PublicUser {
  email: string;
  preferences: Record<string, unknown>;
}

export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_color: string;
  followers_count: number;
  following_count: number;
  preferences: string;
  social_links: string;
  created_at: string;
  password_hash?: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  let socialLinks: { platform: string; url: string }[] = [];
  try {
    const parsed = JSON.parse(row.social_links ?? '[]');
    if (Array.isArray(parsed)) socialLinks = parsed;
  } catch {
    /* keep empty */
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarColor: row.avatar_color,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    socialLinks,
    createdAt: row.created_at,
  };
}

export function toSelfUser(row: UserRow): SelfUser {
  let preferences: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.preferences ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) preferences = parsed;
  } catch {
    /* keep empty */
  }
  return { ...toPublicUser(row), email: row.email, preferences };
}

export interface PublicStream {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: StreamKind;
  tags: string[];
  isLive: boolean;
  viewerCount: number;
  peakViewers: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  host: { username: string; displayName: string; avatarColor: string };
  hasRecording: boolean;
  recordingExpiresAt: string | null;
}

export interface StreamRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  kind: StreamKind;
  tags: string;
  is_live: number;
  is_recording: number;
  recording_key: string | null;
  recording_expires_at: string | null;
  viewer_count: number;
  peak_viewers: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  host_username?: string | null;
  host_display_name?: string | null;
  host_avatar_color?: string | null;
}

/**
 * Decide the deployment mode from the request host. 'lan' means the app is
 * being served on a private/loopback address — the client can skip internet
 * ICE (STUN) and every feature runs against a server on the local network.
 * DEPLOY_MODE env var ('lan' | 'cloud') overrides detection for unusual setups.
 */
export function resolveDeployMode(hostHeader: string | null, override: string | undefined): 'cloud' | 'lan' {
  const forced = (override ?? '').trim().toLowerCase();
  if (forced === 'lan' || forced === 'cloud') return forced;
  const raw = (hostHeader ?? '').split(',')[0]!.trim().toLowerCase();
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(raw);
  const unbracketed = bracketed ? null : raw.split(':');
  // A single colon means host:port; multiple colons mean a bare IPv6 literal.
  const host = bracketed?.[1] ?? (unbracketed && unbracketed.length === 2 ? raw.replace(/:\d+$/, '') : raw);
  if (!host) return 'cloud';
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || host.endsWith('.localdomain') || host.endsWith('.lan')) return 'lan';
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'lan';
  if (/^(fc|fd)[0-9a-f]{2}:/.test(host)) return 'lan'; // IPv6 unique-local fc00::/7
  return 'cloud';
}

export function toPublicStream(row: StreamRow): PublicStream {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags ?? '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    /* keep empty */
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    kind: row.kind === 'call' ? 'call' : 'broadcast',
    tags,
    isLive: row.is_live === 1,
    viewerCount: row.viewer_count,
    peakViewers: row.peak_viewers,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    host: {
      username: row.host_username ?? '',
      displayName: row.host_display_name ?? row.host_username ?? '',
      avatarColor: row.host_avatar_color ?? '#7C5CFF',
    },
    hasRecording: !!row.recording_key,
    recordingExpiresAt: row.recording_expires_at,
  };
}

export const STREAM_SELECT_HOST = `streams.id, streams.user_id, streams.title, streams.description, streams.category,
  streams.kind, streams.tags, streams.is_live, streams.is_recording, streams.recording_key, streams.recording_expires_at,
  streams.viewer_count, streams.peak_viewers, streams.started_at, streams.ended_at, streams.created_at,
  users.username AS host_username, users.display_name AS host_display_name, users.avatar_color AS host_avatar_color`

export type StreamKind = 'broadcast' | 'call';
