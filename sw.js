// sw.js – Tidrapport v10.8 | i samarbete med ChatGPT & Martin Mattsson
const CACHE_NAME = "tidrapport-cache-v10-8";
const APP_SHELL = [
  "./","./index.html","./app.js","./balansregler.js","./backup.js","./export.js","./search.html","./search.js","./help.html","./manifest.json","./lucide.min.js"
];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(caches.match(e.request).then(cached=>{const fetchP=fetch(e.request).then(net=>{if(net&&net.status===200){const clone=net.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,clone));}return net;}).catch(()=>cached);return cached||fetchP;}));
});