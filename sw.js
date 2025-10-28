// ===== sw.js – Service Worker för Tidrapport (Vidare utveckling 1) =====
// Strategi: Stale-While-Revalidate för alla GET-resurser.
// HTML: nätet först → cache → fallback till index.html.

const CACHE_NAME = "tidrapport-v6";
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

// --- Install: cacha kärnresurser direkt
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

// --- Activate: städa gamla cacher och ta kontroll
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// --- Uppdatering på begäran från appen
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// --- Hjälpfunktion: lägg svar i cache "tyst"
async function putInCache(req, res) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res.clone());
  } catch (e) {
    // ignoreras vid cross-origin
  }
  return res;
}

// --- Fetch-strategi
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";

  // HTML → nätet först, fallback index.html
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
          const shell = await caches.match("./index.html");
          return shell || new Response("<h1>Offline</h1>", { headers: { "Content-Type": "text/html" } });
        }
      })()
    );
    return;
  }

  // Övriga resurser → stale-while-revalidate
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