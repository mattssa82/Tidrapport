// sw.js — Service Worker för Tidrapport v6
// Offline-stöd med "stale-while-revalidate" strategi

const CACHE_NAME = "tidrapport-v6";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./help.html",
  "./app.js",
  "./export.js",
  "./backup.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// --- Install: cache kärnresurser ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: ta bort gamla cache-versioner ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) =>
          key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()
        )
      )
    )
  );
  self.clients.claim();
});

// --- Fetch: hantera förfrågningar ---
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // HTML: nätet först, fallback till cache, sen index.html
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || (await caches.match("./index.html"));
        })
    );
    return;
  }

  // Övriga GET: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// --- Message (för manuell uppdatering via appen) ---
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});