// sw.js
// Tidrapport v10.17
// i samarbete med ChatGPT & Martin Mattsson

const CACHE_NAME = "tidrapport-cache-v10-17";
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
  "./lucide.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable_icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

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
  console.log("Service Worker v10.17 aktiv");
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(netRes => {
        if(netRes && netRes.status === 200 && netRes.type === "basic"){
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return netRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});