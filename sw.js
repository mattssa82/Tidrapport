// sw.js v10.11
// Enkel cache för offline-stöd
const CACHE_NAME = 'tidrapport-v10.11';

const ASSETS_TO_CACHE = [
  './index.html',
  './app.js',
  './balansregler.js',
  './export.js',
  './lucide.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
  // lägg till ev. css/js/pdf-lib/jsPDF om lokalt
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>{
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>{
      return Promise.all(
        keys.map(k=>{
          if (k!==CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    })
  );
});

// network falling back to cache first offline logic
self.addEventListener('fetch', (event)=>{
  const req = event.request;
  event.respondWith(
    fetch(req).catch(()=>{
      return caches.match(req).then(r=> r || caches.match('./index.html'));
    })
  );
});