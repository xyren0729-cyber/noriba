// アプリ本体をキャッシュし、電波が弱くても開けるようにする（APIの通信はキャッシュしない）
const V='noriba-v3';
const SHELL=['./','index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','icon-180.png','widget.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  // まずネットから最新を取り、失敗したらキャッシュを使う
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
