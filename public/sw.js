// Family Board service worker. Three jobs:
// 1. The app opens and updates like a normal web page: the board's own files always come fresh from the
//    network when there is one, so a new version reaches every family without them doing anything.
// 2. Without internet, the app shows a friendly "you're offline" screen instead of a browser error, and opens
//    the board again by itself once the internet is back.
// 3. Push notifications, and opening the board when one is tapped.
// Nothing a family adds (calendar, chores, photos, names) is ever kept here: /api and sign-in requests go
// straight to the network.
const CACHE = 'fb-app-v1';
const OFFLINE = '/offline.html';
const KEEP = [OFFLINE, '/icon-192.png', '/icon.svg'];
// Libraries and fonts the board loads from elsewhere. Their addresses carry a version, so a saved copy is safe.
const SHARED = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(KEEP)).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
  await self.clients.claim();
})()));

const save = async (req, res) => { if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) { const c = await caches.open(CACHE); await c.put(req, res.clone()); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith((async () => { try { return (await e.preloadResponse) || (await fetch(req)); } catch { return (await caches.match(OFFLINE)) || Response.error(); } })());
    return;
  }
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/sw.js') return;
    // The board's own files: fresh from the network, with the last copy kept only for when there's no internet.
    e.respondWith(fetch(req).then((r) => save(req, r)).catch(async () => (await caches.match(req)) || Response.error()));
    return;
  }
  if (SHARED.includes(url.hostname)) {
    // Versioned libraries and fonts: the saved copy first, so the app opens quickly.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => save(req, r))));
  }
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Family Board', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Family Board', { body: d.body || '', icon: '/icon-192.png', badge: '/icon.svg', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => { for (const c of list) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } return self.clients.openWindow(url); }));
});
