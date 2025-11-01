// sw.js  v10.6 stabil
const CACHE_VERSION = "tidrapport-cache-v10-6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./balansregler.js",
  "./backup.js",
  "./export.js",
  "./search.html",
  "./search.js",
  "./help.html",
  "./manifest.json",
  "./lucide.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(res => {
      const fetchPromise = fetch(e.request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_VERSION).then(c => c.put(e.request, networkRes.clone()));
          }
          return networkRes;
        })
        .catch(() => res);
      return res || fetchPromise;
    })
  );
});