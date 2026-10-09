// Lucid Sentence offline cache (generated into dist/sw.js by vite.config.ts).
// Same-origin files only; no request ever leaves for another site.
const CACHE = 'lucid-sentence-__VERSION__';
const FILES = [/* __FILES__ */];
// On-device AI runtime files (ai/): kept across app updates in their own cache, which
// is renamed only when the runtime version changes. Model files live in OPFS, not here.
const AI_CACHE = 'lucid-sentence-ai-__AI_VERSION__';
const AI_BASE = new URL('ai/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

// An update waits until the page's "Reload for new version" button asks for it.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== AI_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // The desktop update feed is never cached.
  if (url.pathname.includes('/updates/')) return;
  // Pages: network first so updates show up, cache when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request, { ignoreSearch: true }).then((r) => r ?? caches.match('./')),
      ),
    );
    return;
  }
  // Handwriting recognition and on-device AI runtime files: cached on first use.
  const ai = url.pathname.startsWith(AI_BASE);
  if (ai || url.pathname.includes('/ocr/')) {
    event.respondWith(
      caches.open(ai ? AI_CACHE : CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              if (res.ok) void cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  // Built assets are content-hashed: cache first.
  event.respondWith(caches.match(request).then((r) => r ?? fetch(request)));
});
