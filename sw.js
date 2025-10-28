// ===== sw.js – Service Worker (Tidrapport Next Q4 2025 v7) =====

const CACHE_NAME = "tidrapport-v7";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./export.js",
  "./backup.js",
  "./help.html",
  "./search.html",
  "./search.js",
  "./manifest.json",
  "./lucide.min.js",
  "./icon-192.png",
  "./icon-512.png"
];

// Installera och cacha alla kärnfiler
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Aktivera och ta bort gamla cachear
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Hjälpfunktion för att lägga till i cache
async function putInCache(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (err) {
    console.warn("Cache misslyckades:", err);
  }
  return response;
}

// Hantering av nätverksförfrågningar
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";

  // HTML-förfrågningar → Network-first
  if (accept.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          putInCache(req, net);
          return net.clone();
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match("./index.html");
          return (
            fallback ||
            new Response("<h1>Offline</h1><p>Ingen nätverksanslutning.</p>", {
              headers: { "Content-Type": "text/html" },
            })
          );
        }
      })()
    );
    return;
  }

  // Övriga filer → Cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "error") putInCache(req, res);
          return res;
        })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response("", { status: 504 });
    })()
  );
});

console.log("Service Worker v7 aktiv ✅");