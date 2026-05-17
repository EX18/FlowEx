// FlowEX Service Worker v2.2 - with server cache invalidation
const CACHE_VERSION = 'flowex-v2.2';
const CACHE = CACHE_VERSION;
const CACHE_BYPASS = Math.random().toString(36).slice(2);

const STATIC = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400&display=swap',
];

// Install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old caches and migrate to new version
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => {
        // Delete all old flowex cache versions except current
        return Promise.all(
          keys
            .filter(k => k.startsWith('flowex-v') && k !== CACHE)
            .map(k => caches.delete(k))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch — network first with server cache invalidation
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Skip Firebase calls — always network
  if (e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;

  const url = new URL(e.request.url);
  
  // Force revalidation for HTML and critical files
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/manifest.json') {
    e.respondWith(
      fetch(e.request.clone())
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            // Set no-cache headers for server to not cache these files
            const headers = new Headers(clone.headers);
            headers.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
            const newRes = new Response(clone.body, {
              status: res.status,
              statusText: res.statusText,
              headers: headers
            });
            caches.open(CACHE).then(c => c.put(e.request, newRes.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Network first, with fallback to cache for other resources
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

// Handle state updates from client
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (e.data?.type === 'UPDATE_CACHE') {
    // Client is notifying us to update cache
    e.waitUntil(
      caches.open(CACHE).then(cache => {
        const response = new Response(JSON.stringify(e.data.payload), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
        return cache.put(new Request('./__flowex-state__'), response);
      })
    );
  }
});

// Notification click behavior
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const client = clients.find(c => c.visibilityState === 'visible') || clients[0];
      if (client) {
        return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
