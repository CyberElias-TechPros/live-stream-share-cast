/*
 * Shared app-shell and Web Push service worker.
 *
 * The cache is intentionally narrow: it only makes the SPA shell and its
 * static assets available for the fully-offline LAN room. API calls, auth,
 * WebSockets, signed media URLs, and uploads are never cached.
 */

const SHELL_CACHE = 'imlive-shell-v1';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/app-icon.svg', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('imlive-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isStaticAppRequest = request.method === 'GET'
    && url.origin === self.location.origin
    && !url.pathname.startsWith('/api/')
    && request.destination !== 'audio'
    && request.destination !== 'video';

  if (!isStaticAppRequest) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => {
      if (cached) return cached;
      // Vite's SPA fallback is the cached root document. This makes a deep
      // route such as /offline reopen while the network is disconnected.
      if (request.mode === 'navigate') return caches.match('/');
      return Response.error();
    })),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: "I'm Live", body: '', url: '/notifications', tag: 'lsc' };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: payload.url || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
