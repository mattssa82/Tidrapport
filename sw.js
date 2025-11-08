// sw.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson

const CACHE_NAME = "tidrapport-cache-v10-16";
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
  "./icons/icon-512.png"
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
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
  console.log("Service Worker v10.16 aktiv ✅");
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(res => {
        if(res && res.status === 200 && res.type === "basic"){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});