
const CACHE = 'pks-reader-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './feeds.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/data/items.json')) {
    // Network-first for the feed data
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
