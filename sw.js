// sw.js - mycket enkel cache för offline-stöd

const CACHE_NAME = "tidrapport-v10-21";
const ASSETS = [
  "index.html",
  "help.html",
  "search.html",
  "app.js",
  "backup.js",
  "balansregler.js",
  "export.js",
  "search.js",
  "manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});