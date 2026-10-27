const CACHE = 'wasp-buddy-v4';
const ASSETS = ['./','./index.html','./mobile.css','./mobile.js','./runtime-config.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('wasp-buddy-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(new URL(event.request.url).pathname.startsWith('/api/'))return;
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request) || (event.request.mode==='navigate' ? caches.match('./index.html') : Response.error())));
});
