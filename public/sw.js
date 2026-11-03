const CACHE_NAME = 'eat-and-fit-shell-v7';
const EXERCISE_PREVIEW_CACHE = 'eat-and-fit-exercise-previews-v1';
const EXERCISE_MEDIA_ORIGIN = 'https://pub-585d42eb1aa64a67aedf483ec328d3fe.r2.dev';
const MAX_EXERCISE_PREVIEWS = 160;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/eat-and-fit-mark.svg',
  '/apple-touch-icon.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (
        (key.startsWith('eat-and-fit-shell-') && key !== CACHE_NAME)
        || (key.startsWith('eat-and-fit-exercise-previews-') && key !== EXERCISE_PREVIEW_CACHE)
      )).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  if (url.origin === EXERCISE_MEDIA_ORIGIN && url.pathname.startsWith('/exercise-posters/')) {
    event.respondWith(
      caches.open(EXERCISE_PREVIEW_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          try {
            await cache.put(request, response.clone());
            const cachedRequests = await cache.keys();
            await Promise.all(cachedRequests.slice(0, -MAX_EXERCISE_PREVIEWS).map((cachedRequest) => cache.delete(cachedRequest)));
          } catch { /* Continue without persistent preview storage. */ }
        }
        return response;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then((response) => response || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      });
      return cached || network;
    }),
  );
});
