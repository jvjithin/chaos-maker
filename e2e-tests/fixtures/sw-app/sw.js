// Classic-SW fixture for @chaos-maker/core/sw. One line + the standard
// lifecycle and fetch routing used by the e2e harness.
importScripts('/sw-app/chaos-maker-sw.js');

self.addEventListener('install', function (event) {
  // Skip the wait-for-refresh ceremony so tests can drive chaos on the first
  // load without an explicit reload step.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.startsWith('/sw-app/sw-api/')) {
    // Re-issue as a real fetch so the chaos-patched `self.fetch` sees the
    // call. Strip the SW namespace and hit the canonical fixture JSON.
    event.respondWith(self.fetch('/api/data.json'));
  }
});
