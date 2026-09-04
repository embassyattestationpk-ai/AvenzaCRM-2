// Minimal service worker — just enough to satisfy PWA installability.
// This app talks to a live Google Sheets backend, so we deliberately do NOT
// cache API responses (that would show stale CRM data). We only cache the
// app shell itself so the icon/launch experience is reliable.
const CACHE_NAME = 'avenza-crm-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never intercept API calls to the Apps Script backend — always go live.
  if (event.request.url.includes('script.google.com')) return;
  // Network-first for navigation/app shell; fall back to cache if offline.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
