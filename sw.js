// sw.js
// Tidrapport v10.15
// Offline-cache (stale-while-revalidate)

const CACHE_NAME = "tidrapport-cache-v10-15";

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

// Install
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate
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
  console.log("Service Worker v10.15 aktiv");
});

// Fetch
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(netRes => {
        try{
          if (netRes && netRes.status === 200 && netRes.type === "basic") {
            const clone = netRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
        }catch(e){}
        return netRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});