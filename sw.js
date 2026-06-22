// Service Worker - Coach Maman
// Stratégie : Network-First pour les fichiers locaux (toujours à jour),
// Cache-First pour les libs CDN (rarement changent, économie de bande).

const VERSION = 'v8-' + Date.now();
const CACHE = 'coachmaman-' + VERSION;

const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './data/exercises.js',
  './data/plan-template.js',
  './data/quotes.js',
  './data/firebase-config.js',
  './data/planif.xlsx'
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all([...LOCAL_ASSETS, ...CDN_ASSETS].map(url =>
        fetch(url, { cache: 'reload' }).then(r => r.ok ? c.put(url, r) : null).catch(() => null)
      ))
    )
  );
  self.skipWaiting(); // activer immédiatement
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => {
      // notifier les clients qu'une nouvelle version est active
      return self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'sw-updated', version: VERSION }))
      );
    })
  );
});

function isLocal(url) {
  const u = new URL(url);
  return u.origin === self.location.origin;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Local : Network-First (toujours frais si online, cache sinon)
  if (isLocal(url)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN : Cache-First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// Notifications wellness
self.addEventListener('message', e => {
  if (e.data?.type === 'notify') {
    self.registration.showNotification(e.data.title || 'Coach Maman', {
      body: e.data.body || 'N\'oublie pas ton wellness du jour',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: e.data.tag || 'wellness-reminder',
      requireInteraction: false
    });
  }
  if (e.data?.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window' }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
