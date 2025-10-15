/* ========= sw.js v5-A3 =========
   Service Worker för Tidrapport
   Stöd för offline och uppdatering av kärnresurser
================================ */

const CACHE_NAME = "tidrapport-v5-a3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./export.js",
  "./backup.js",
  "./help.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Installera: cacha kärnresurser
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Aktivera: ta bort gamla cache-versioner
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))
      )
    )
  );
  self.clients.claim();
});

// Fetch-strategi:
// - HTML: nätet först → cache → offline fallback
// - Övrigt: stale-while-revalidate
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  // HTML-förfrågningar
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match("./index.html");
        })
    );
    return;
  }

  // Övriga resurser (skript, bilder, etc.)
  event.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});