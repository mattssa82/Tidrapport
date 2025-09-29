const CACHE_NAME = "tidrapport-cache-v1";
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-512.png",
  "./offline.html"
];

// Installera och cacha basfiler
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

// Rensa gammal cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first med offline-fallback för navigering
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Navigationsförfrågningar → försök nät först, annars offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put("./index.html", clone));
          return resp;
        })
        .catch(() => caches.match("./index.html").then((x) => x || caches.match("./offline.html")))
    );
    return;
  }

  // Övriga förfrågningar → cache-first, annars nät + lägg i cache
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          // Cachea GET-resurser
          if (req.method === "GET" && resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
          }
          return resp;
        })
        .catch(() => {
          // Fallback endast vid HTML
          if (req.headers.get("accept")?.includes("text/html")) {
            return caches.match("./offline.html");
          }
        });
    })
  );
});