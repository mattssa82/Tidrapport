// sw.js
// Tidrapport v10.5
// i samarbete med ChatGPT & Martin Mattsson
// Förhindrar gammal cache och ser till att appen alltid uppdateras korrekt

const CACHE_VERSION = "tidrapport-cache-v10-5-" + Date.now();
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

// Installera och cachea grundfiler
self.addEventListener("install", event => {
  console.log("💾 Installerar SW v10.5...");
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivera och ta bort gammal cache
self.addEventListener("activate", event => {
  console.log("🚀 Aktiverar SW v10.5...");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_VERSION) {
          console.log("🧹 Rensar gammal cache:", key);
          return caches.delete(key);
        }
      }))
    )
  );
  self.clients.claim();
});

// Fånga fetch och uppdatera cache vid behov
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});

console.log("✅ Service Worker v10.5 laddad och aktiv");