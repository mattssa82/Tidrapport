// sw.js  v10.0
// Service Worker för Tidrapport – offline-stöd med cache-uppdatering

const CACHE_NAME = "tidrapport-cache-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./backup.js",
  "./export.js",
  "./search.html",
  "./search.js",
  "./help.html",
  "./balansregler.js",
  "./manifest.json",
  "./lucide.min.js"
];

// Install – cacha grundfilerna
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate – ta bort gammal cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch – stale-while-revalidate
self.addEventListener("fetch", event => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cachedRes => {
      const fetchPromise = fetch(req).then(netRes => {
        if (netRes && netRes.status === 200 && netRes.type === "basic") {
          const resClone = netRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return netRes;
      }).catch(() => cachedRes);
      return cachedRes || fetchPromise;
    })
  );
});