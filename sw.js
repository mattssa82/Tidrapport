// ===== sw.js – Tidrapport v9.7 =====
// Offline-cache / PWA

const CACHE_NAME = "tidrapport-v9.7";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./backup.js",
  "./export.js",
  "./manifest.json",
  "./lucide.min.js",
  "./help.html",
  "./search.html",
  "./search.js"
];

self.addEventListener("install",(e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate",(e)=>{
  e.waitUntil(
    caches.keys().then(keys=>{
      return Promise.all(
        keys
          .filter(k=>k!==CACHE_NAME)
          .map(k=>caches.delete(k))
      );
    })
  );
  self.clients.claim();
  console.log("Service Worker v9.7 aktiv ✅");
});

self.addEventListener("fetch",(e)=>{
  if(e.request.method!=="GET") return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise = fetch(e.request)
        .then(resp=>{
          if(resp && resp.status===200){
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(cache=>{
              cache.put(e.request,copy);
            });
          }
          return resp;
        })
        .catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});