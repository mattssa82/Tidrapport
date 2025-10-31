// sw.js
// Tidrapport v10.3
// i samarbete med ChatGPT & Martin Mattsson
const CACHE_NAME="tidrapport-cache-v10-3";
const APP_SHELL=[
 "./","./index.html","./app.js","./balansregler.js","./backup.js",
 "./export.js","./search.html","./search.js","./help.html","./manifest.json","./lucide.min.js"
];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k