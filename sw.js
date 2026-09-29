/* Offline support. The page is network-first so updates show up straight away; the map library, fonts and
   map tiles are kept as they're used. Trip data (Firestore) is never cached here: the page keeps its own copy. */
const CORE='core-v3', TILES='tiles', ASSETS='assets', TILE_LIMIT=2000;
const PRECACHE=['./','manifest.webmanifest','icons/icon-192.png',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CORE)
    .then(c=>c.addAll(PRECACHE.map(u=>new Request(u,{mode:u.startsWith('http')?'cors':'same-origin'}))))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k.startsWith('core-') && k!==CORE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

let trimming=false;
async function trim(cache){
  if(trimming) return; trimming=true;
  try{ const keys=await cache.keys(); for(const k of keys.slice(0,Math.max(0,keys.length-TILE_LIMIT))) await cache.delete(k); }
  finally{ trimming=false; }
}

self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET') return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req)
      .then(r=>{ if(r.ok){ const copy=r.clone(); caches.open(CORE).then(c=>c.put('./',copy)); } return r; })
      .catch(()=>caches.match('./')));
    return;
  }
  const name=url.hostname.endsWith('openfreemap.org') ? TILES
    : /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|www\.gstatic\.com)$/.test(url.hostname) || url.origin===location.origin ? ASSETS
    : null;
  if(!name) return;
  // Serve what's cached immediately and refresh it in the background
  e.respondWith(caches.open(name).then(async c=>{
    const hit=await caches.match(req);
    const net=fetch(req).then(r=>{ if(r.ok){ c.put(req,r.clone()); if(name===TILES) trim(c); } return r; }).catch(()=>hit||Response.error());
    return hit||net;
  }));
});
