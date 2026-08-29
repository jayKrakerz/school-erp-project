const CACHE_NAME = 'wav-erp-v3-static-only';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/logo.png'];
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'manifest']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isApiRequest = request.headers.has('authorization') ||
    (sameOrigin && (url.pathname === '/api' || url.pathname.startsWith('/api/')));

  // API and authenticated responses are always network-only. In particular,
  // they must never fall through to the cross-origin static cache strategy.
  if (isApiRequest) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // request.destination is assigned by the browser, so a cross-origin fetch()
  // to an API is not mistaken for an image/script solely because of its URL.
  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then((response) => {
        if (!response.ok && response.type !== 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }))
    );
    return;
  }

  event.respondWith(fetch(request));
});
