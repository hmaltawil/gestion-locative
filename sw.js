// Offline support: keeps a copy of the app files on the phone.
// Bump VERSION whenever a file changes so phones pick up the update.
const VERSION = 'v1.1.0';
const CACHE = 'gestion-locative-' + VERSION;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/bank.js',
  './js/charges.js',
  './js/deadlines.js',
  './js/tax.js',
  './js/calc.js',
  './js/docs.js',
  './js/i18n.js',
  './js/irl.js',
  './js/store.js',
  './js/util.js',
  './vendor/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// cache: 'reload' skips the browser's HTTP cache, so a new version never
// stores files left over from the previous one.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gestion-locative-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('./index.html'))),
  );
});
