/* Cache public offline assets only. Account data and API responses never enter Cache Storage. */
const CACHE='polka-offline-v2';
const ASSETS=['/offline.html','/icons/icon-192.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(ASSETS.map(path=>cache.add(new Request(path,{credentials:'omit',cache:'reload'}))))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('polka-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/api'||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=>{
   const fallback=await caches.match('/offline.html',{cacheName:CACHE});
   return fallback||new Response('Нет соединения. Откройте polka, когда появится интернет.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
 }else if(ASSETS.includes(url.pathname)&&!url.search){
  event.respondWith(caches.match(request,{cacheName:CACHE}).then(cached=>cached||fetch(request)));
 }
});
