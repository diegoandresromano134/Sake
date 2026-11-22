// Service worker de Bodega Komatsu: abre rápido y muestra la tienda aunque la conexión falle.
// Estrategia "primero la red": siempre la última versión; si no hay conexión, lo guardado.
// La API (/api) nunca se guarda: precios, stock y sesión vienen siempre del servidor.
const VERSION = 'komatsu-v1';
const CORE = ['/', '/css/styles.css', '/js/app.js', '/manifest.webmanifest', '/img/icon-192.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('/') : Response.error());
    }
  })());
});
