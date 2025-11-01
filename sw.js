// sw.js
// Tidrapport v10.5
// i samarbete med ChatGPT & Martin Mattsson
//
// Offline-cache (stale-while-revalidate light)

const CACHE_NAME = "tidrapport-cache-v10-5";
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

// Installera och cacha grundfiler
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivera, städa gammal cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
  console.log("Service Worker v10.5 aktiv ✅");
});

// Hämta med fallback + uppdatera cache
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cachedRes => {
      const fetchPromise = fetch(event.request).then(netRes => {
        if (netRes && netRes.status === 200 && netRes.type === "basic") {
          const resClone = netRes.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone);
          });
        }
        return netRes;
      }).catch(() => cachedRes);
      return cachedRes || fetchPromise;
    })
  );
});
