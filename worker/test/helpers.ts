import { execSync } from 'node:child_process';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

export interface TestServer {
  worker: Unstable_DevWorker;
  url: string;
  stop: () => Promise<void>;
}

let instance: TestServer | null = null;

/**
 * Start one real `wrangler dev` instance (workerd + local D1 + local Durable
 * Objects) shared by the whole suite. Migrations are applied first through the
 * wrangler CLI against the same local state directory.
 */
export async function getTestServer(): Promise<TestServer> {
  if (instance) return instance;

  execSync('npx wrangler d1 migrations apply imlive --local', {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  });

  const worker = await unstable_dev('src/index.ts', {
    experimental: { disableExperimentalWarning: true },
    ip: '127.0.0.1',
    port: 0,
    persist: true,
    vars: {
      ALLOWED_ORIGINS: '*',
      PUBLIC_URL: '',
      TURN_URL: '',
      TURN_USERNAME: '',
      TURN_CREDENTIAL: '',
    },
  });

  instance = {
    worker,
    url: `http://${worker.address}:${worker.port}`,
    stop: async () => {
      await worker.stop();
      instance = null;
    },
  };
  return instance;
}

export interface TestUser {
  email: string;
  username: string;
  password: string;
  cookie: string;
  token?: string;
}

let counter = 0;

/** Create a fresh signed-in user; returns cookie for cookie-auth and token for Bearer/WS auth. */
export async function makeUser(base: string, overrides: Partial<TestUser> = {}): Promise<TestUser> {
  counter += 1;
  const user: TestUser = {
    email: overrides.email ?? `user${Date.now()}_${counter}@example.com`,
    username: overrides.username ?? `u${Date.now().toString(36)}${counter}`,
    password: overrides.password ?? 'correct-horse-battery',
    cookie: '',
  };
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, username: user.username, password: user.password }),
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  user.cookie = setCookie.split(';')[0] ?? '';
  const body = (await res.json()) as { user?: { username?: string } };
  if (body.user?.username) user.username = body.user.username;

  // Obtain a Bearer token via login (the signup token lives in an HttpOnly cookie).
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: user.email, password: user.password }),
  });
  const authHeader = login.headers.get('set-cookie') ?? '';
  user.cookie = authHeader.split(';')[0] ?? user.cookie;
  return user;
}

export async function api(
  base: string,
  path: string,
  init: RequestInit & { cookie?: string } = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${base}${path}`, { ...init, headers, redirect: 'manual' });
}

interface SocketBuffer {
  queue: Record<string, unknown>[];
  waiters: ((msg: Record<string, unknown>) => void)[];
  closed: boolean;
}

const buffers = new WeakMap<WebSocket, SocketBuffer>();

/** Small WebSocket helper for signaling tests (Node 22 global WebSocket). */
export function roomSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const buffer: SocketBuffer = { queue: [], waiters: [], closed: false };
    buffers.set(ws, buffer);
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      const waiter = buffer.waiters.shift();
      if (waiter) waiter(msg);
      else buffer.queue.push(msg);
    });
    ws.addEventListener('close', () => {
      buffer.closed = true;
      for (const waiter of buffer.waiters.splice(0)) waiter({ type: '__closed__' });
    });
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('ws connect failed')), { once: true });
  });
}

export function nextMessage(ws: WebSocket, timeoutMs = 10_000): Promise<Record<string, unknown>> {
  const buffer = buffers.get(ws);
  if (!buffer) return Promise.reject(new Error('socket was not created via roomSocket()'));
  const queued = buffer.queue.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = buffer.waiters.indexOf(resolve);
      if (idx >= 0) buffer.waiters.splice(idx, 1);
      reject(new Error('ws message timeout'));
    }, timeoutMs);
    buffer.waiters.push((msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

export function peekBuffer(ws: WebSocket): SocketBuffer | undefined {
  return buffers.get(ws);
}

export function send(ws: WebSocket, data: unknown) {
  ws.send(JSON.stringify(data));
}
