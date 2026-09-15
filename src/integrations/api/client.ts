/**
 * HTTP + WebSocket client for the Cloudflare Worker API.
 *
 * Replaces `@supabase/supabase-js` one-for-one at the service layer:
 *   • access/refresh tokens live in localStorage
 *   • 401s transparently trigger one refresh + retry
 *   • every helper returns parsed JSON and throws `ApiRequestError` otherwise
 */

const rawBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') || '/api';

/** Base URL (or path) for REST calls, e.g. `/api` or `https://api.example.com/api`. */
export const API_BASE = rawBase;

/** Path prefix the API is mounted under (normally `/api`). */
const API_PREFIX = /^https?:\/\//.test(rawBase) ? new URL(rawBase).pathname.replace(/\/+$/, '') : rawBase;

/**
 * Origin (scheme + host, **no** path) for WebSocket upgrades — same origin when
 * the API is proxied by Vite.
 */
export const WS_BASE =
  (import.meta.env.VITE_WS_BASE as string | undefined)?.replace(/\/+$/, '') ||
  (/^https?:\/\//.test(rawBase)
    ? `${rawBase.replace(/^http/, 'ws').split('/').slice(0, 3).join('/')}`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);

const ACCESS_KEY = 'lsc.access_token';
const REFRESH_KEY = 'lsc.refresh_token';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/* --------------------------------- tokens ------------------------------------ */

function decodeJwtSub(token: string): string | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  /** User id of the current access token (decoded locally — no network call). */
  get userId(): string | null {
    const token = this.access;
    return token ? decodeJwtSub(token) : null;
  },
  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  setAccess(accessToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Fired when the session could not be recovered — AuthContext listens for it. */
export const SESSION_EXPIRED_EVENT = 'lsc:session-expired';

/* --------------------------------- requests ---------------------------------- */

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Defaults to true — pass false for public endpoints only if needed. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  try {
    const response = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) throw new Error('refresh failed');

    const data = (await response.json()) as { accessToken: string; refreshToken: string };
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    return false;
  }
}

async function request<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers = new Headers({ 'content-type': 'application/json', ...(options.headers ?? {}) });
  const useAuth = options.auth ?? true;
  const access = tokenStore.access;
  if (useAuth && access) headers.set('Authorization', `Bearer ${access}`);

  const init: RequestInit = { method, headers, signal: options.signal };
  if (options.body instanceof FormData) {
    headers.delete('content-type'); // let the browser add the multipart boundary
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(path, options.query), init);

  if (response.status === 401 && useAuth && !retried) {
    refreshInFlight ??= refreshSession().finally(() => {
      refreshInFlight = null;
    });
    if (await refreshInFlight) return request<T>(method, path, options, true);
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (payload ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiRequestError(response.status, error.error ?? response.statusText ?? 'Request failed', error.code, error.details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('DELETE', path, { ...options, body }),
  /** Multipart upload (avatar, recording). */
  upload: <T>(path: string, form: FormData, options?: RequestOptions) => request<T>('POST', path, { ...options, body: form }),
};

/* -------------------------------- WebSocket ---------------------------------- */

export interface SocketOptions {
  /** Appended as `?token=` so the Worker can authenticate the upgrade. */
  auth?: boolean;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Builds a WebSocket URL for one of the Worker's `/api/ws/*` endpoints.
 * `path` may be given with or without the `/api` prefix.
 */
export function apiSocket(path: string, options: SocketOptions = {}): WebSocket {
  const normalized = path === API_PREFIX || path.startsWith(`${API_PREFIX}/`) ? path : `${API_PREFIX}${path}`;
  const url = new URL(`${WS_BASE}${normalized}`, window.location.origin);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  if ((options.auth ?? true) && tokenStore.access) url.searchParams.set('token', tokenStore.access);
  return new WebSocket(url.toString());
}
