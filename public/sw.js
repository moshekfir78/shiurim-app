const V='shiurim-v31', SHELL=['./','index.html','style.css?v=31','app.js?v=31','sources.js?v=31','study.js?v=31','config.js?v=31','sync.js?v=31','personal.js?v=31','manifest.webmanifest','icons/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin||e.request.method!=='GET')return; // audio/video stream straight from source
  // network-first, always revalidating with the server (bypasses the 10-min HTTP cache); cache only as offline fallback
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request)));
});
