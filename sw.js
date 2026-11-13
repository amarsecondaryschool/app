// Service worker: lets the app install and open quickly.
// Network first (so updates show up), cache as a fallback. Database calls go to another domain and are never cached.
// IMPORTANT: files are cached one by one, so a missing file can never stop the app from installing.
const CACHE = 'amar-school-v17';
const FILES = ['./', './index.html', './styles.css', './app.js', './config.js', './strings.js', './strings2.js', './grading.js', './importer.js', './daily.js', './exams.js', './finance.js', './data.js', './simple.js', './results.js', './routine.js',
               './manifest.webmanifest', './amar-icon-192.png', './amar-icon-512.png', './logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html') || Response.error()))
  );
});
