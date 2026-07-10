'use strict';

const VERSION = '3.1.0';
const STATIC_CACHE = `sst-prime-static-${VERSION}`;
const RUNTIME_CACHE = `sst-prime-runtime-${VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=3.1.0',
  './app.js?v=3.1.0',
  './data.js?v=3.1.0',
  './config.js?v=3.1.0',
  './assistant.js?v=3.1.0',
  './converter.js?v=3.1.0',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('sst-prime-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async response => {
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  const response = cached || await update;
  return response || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // config.js contém a URL do backend e precisa refletir alterações imediatamente.
    if (url.pathname.endsWith('/config.js')) {
      event.respondWith(networkFirst(request));
      return;
    }
    const staticAsset = /\.(?:css|js|svg|png|webp|ico|webmanifest)$/i.test(url.pathname);
    event.respondWith(staticAsset ? staleWhileRevalidate(request) : cacheFirst(request));
    return;
  }

  if (request.destination === 'image' || ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'].includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
