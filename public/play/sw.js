// Offline shell: the game is small and static, so cache it whole and refresh in the background.
const CACHE = 'resonance-v5';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'src/main.js', 'src/game-lock.js', 'src/sim.js', 'src/content.js', 'src/harmony.js', 'src/audio.js', 'src/render.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then(r => { if (r.ok) void cache.put(e.request, r.clone()); return r; }).catch(() => cached);
    return cached || fresh;
  }));
});
