const STATIC_CACHE_NAME = 'qa-runner-static-v2';
const API_CACHE_NAME = 'qa-runner-api-v2';

// Keep static precache minimal to avoid stale hashed bundle issues.
const STATIC_ASSETS = ['/manifest.json'];

// API endpoints to cache for offline fallback
const API_ENDPOINTS = ['/plugin/qa/suites', '/plugin/qa/runtime'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/plugin/qa/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  event.respondWith(fetch(request));
});

async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const url = new URL(request.url);

  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok && request.method === 'GET') {
      const responseToCache = networkResponse.clone();
      const responseWithHeader = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: {
          ...Object.fromEntries(responseToCache.headers),
          'sw-cache': 'false',
        },
      });
      cache.put(request, responseWithHeader);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'sw-cache': 'true',
        },
      });
    }

    if (API_ENDPOINTS.some((endpoint) => url.pathname.startsWith(endpoint))) {
      return new Response(
        JSON.stringify({
          error: 'offline',
          message: 'You are currently offline. Some features may not be available.',
          cached: true,
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    throw error;
  }
}

// Network-first for documents/scripts/styles to prevent stale hashed assets.
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (
      networkResponse.ok &&
      (request.destination === 'image' || request.destination === 'font' || request.url.endsWith('/manifest.json'))
    ) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
