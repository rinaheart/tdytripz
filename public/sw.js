const CACHE_NAME = 'tdytime-pwa-v2026.11.04_09.15';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Tải và xác minh đầy đủ 100% tài nguyên Tier A (Core Shell) + Tier B (Core Offline Features)
      // trước khi kết luận PWA đã sẵn sàng Offline và kích hoạt Service Worker mới.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(url, { cache: 'no-cache' });
          if (!response || response.status !== 200) {
            throw new Error(`Precache failed for required offline asset: ${url}`);
          }
          await cache.put(url, response);
        })
      );

      for (const requiredUrl of PRECACHE_URLS) {
        const matched = await cache.match(requiredUrl);
        if (!matched) {
          throw new Error(`Verification failed for required offline asset: ${requiredUrl}`);
        }
      }

      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const oldKeys = keys.filter((key) => key !== CACHE_NAME).sort();
        // Giữ lại tối đa 1 bản cache liền kề trước đó để các tab đang mở dở giữa phiên cập nhật
        // vẫn tải được lazy chunks cũ khi Offline mà không gặp lỗi ChunkLoadError.
        const keysToDelete = oldKeys.length > 1 ? oldKeys.slice(0, oldKeys.length - 1) : [];
        return Promise.all(keysToDelete.map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Skip Vite dev client, version check endpoint, Google Apps Script API calls,
  // and Tier C Optional Online-Only features (PDF report engine, self-hosted PDF fonts, Code.gs template)
  const isTierCOnlineOnly =
    url.pathname.startsWith('/assets/pdfReport-') ||
    url.pathname.startsWith('/assets/gasCode-') ||
    url.pathname.startsWith('/assets/html2canvas-') ||
    url.pathname.startsWith('/assets/purify.es-') ||
    url.pathname.startsWith('/assets/index.es-') ||
    url.pathname.startsWith('/fonts/');

  if (
    isTierCOnlineOnly ||
    url.pathname === '/version.json' ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ) {
    return;
  }

  const isImmutableAsset =
    url.pathname.startsWith('/assets/') ||
    url.hostname === 'fonts.gstatic.com';

  // Cache-First strategy for hashed immutable build assets (Tier A & B) and fonts
  if (isImmutableAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const isCacheable =
            response &&
            response.status === 200 &&
            (response.type === 'basic' || response.type === 'cors');
          if (isCacheable) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-First strategy with offline cache fallback for HTML navigation & app shell
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('/index.html').then((idx) => idx || caches.match('/'));
          }
          return caches.match('/');
        })
      )
  );
});
