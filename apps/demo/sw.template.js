// Lucid Sentence offline cache (generated into dist/sw.js by vite.config.ts).
// Same-origin files only; no request ever leaves for another site.
const CACHE = 'lucid-sentence-__VERSION__';
const FILES = [/* __FILES__ */];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Pages: network first so updates show up, cache when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request, { ignoreSearch: true }).then((r) => r ?? caches.match('./')),
      ),
    );
    return;
  }
  // Built assets are content-hashed: cache first.
  event.respondWith(caches.match(request).then((r) => r ?? fetch(request)));
});
