const CACHE = 'wasp-buddy-v5';
const ASSETS = ['./','./index.html','./mobile.css','./mobile.js','./audio.js','./runtime-config.js','./insect-classifier.mjs','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('wasp-buddy-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/') || event.request.method!=='GET' || url.origin!==self.location.origin)return;
  const reusable=url.pathname.includes('/models/') || url.pathname.includes('/vendor/');
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(reusable){const hit=await cache.match(event.request);if(hit)return hit;}
    try{
      const response=await fetch(event.request,{cache:reusable?'default':'no-cache'});
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch{
      return await cache.match(event.request,{ignoreSearch:true}) || (event.request.mode==='navigate'?await cache.match('./index.html'):undefined) || Response.error();
    }
  })());
});
