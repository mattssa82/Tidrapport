// ===== sw.js – Service Worker för Tidrapport =====
// Strategi: Stale-While-Revalidate för alla GET-resurser.
// HTML ruttas: nätet först → cache → fallback till index.html (offline-shell).

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
  "./icon-512.png",
];

// --- Install: cacha kärnresurser direkt
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting(); // hoppa direkt till activate
});

// --- Activate: städa gamla cacher och ta kontroll
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      )
    )
  );
  self.clients.claim();
});

// --- Uppdatering på begäran från appen
// I appen kan du kalla: navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
self.addEventListener("message", (event) => {
  if (event && event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// --- Hjälpfunktion: lägg svar i cache "tyst"
async function putInCache(req, res) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req, res.clone());
  } catch (_) {
    // Ignorera cache-fel (t.ex. opaque / cross-origin)
  }
  return res;
}

// --- Fetch: HTML → nätet först; övrigt → stale-while-revalidate
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";

  // HTML sidor (nätet först -> cache -> index.html)
  if (accept.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          putInCache(req, net);
          return net.clone();
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Fallback till index.html som offline-shell
          const shell = await caches.match("./index.html");
          if (shell) return shell;
          // Sista utväg: generera enkel offline-sida
          return new Response(
            "<h1>Offline</h1><p>Sidan kunde inte laddas och finns inte i cache.</p>",
            { headers: { "Content-Type": "text/html; charset=UTF-8" }, status: 503 }
          );
        }
      })()
    );
    return;
  }

  // Övrigt: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          // Bara cacha OK-svar
          if (res && res.status === 200 && res.type !== "error") {
            putInCache(req, res);
          }
          return res;
        })
        .catch(() => null);

      // returnera cache direkt om finns, annars nätet
      return cached || (await fetchPromise) || new Response("", { status: 504 });
    })()
  );
});