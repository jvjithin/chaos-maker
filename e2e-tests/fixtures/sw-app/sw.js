// Plain service worker fixture. Intercepts fetches under /sw-app/sw-api/* and
// proxies them upstream to the real fixture endpoint at /api/data.json.
// Spike chaos shim is injected by the test runner via Playwright route rewrite
// (prepended above this file's contents at request time).

self.addEventListener('install', function (event) {
  // Activate immediately so the spike test doesn't have to wait a refresh.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.startsWith('/sw-app/sw-api/')) {
    // Re-issue as a real fetch so chaos shim (which patches self.fetch) sees
    // the call. Strip the SW namespace and hit the canonical fixture file.
    event.respondWith(self.fetch('/api/data.json'));
  }
});
