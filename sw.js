// Shrani aplikacijo v telefon, da se odpre hitro in brez prenosa podatkov
const C = 'doma-v2';
const FILES = ['./', 'index.html', 'app.js', 'config.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // baza gre vedno na splet
  // najprej splet (da dobimo posodobitve), ob napaki iz predpomnilnika
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
