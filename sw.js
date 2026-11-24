// Service worker: lets the app install and open quickly.
// Network first (so updates show up), cache as a fallback. Database calls go to another domain and are never cached.
// IMPORTANT: files are cached one by one, so a missing file can never stop the app from installing.
const CACHE = 'amar-school-v35';
const FILES = ['./', './index.html', './styles.css', './app.js', './config.js', './strings.js', './strings2.js', './grading.js', './importer.js', './daily.js', './exams.js', './finance.js', './data.js', './simple.js', './results.js', './routine.js', './bscal.js',
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
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const code = /\.(js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (code) {   // network first, but never wait more than 3 s: fall back to the cached copy so the app opens fast on slow data
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fromCache = () => caches.match(req).then(r => r || caches.match('./index.html'));
      const timer = setTimeout(() => fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }), 3000);
      fetch(req).then(res => { clearTimeout(timer); if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } if (!done) { done = true; resolve(res); } })
        .catch(() => { clearTimeout(timer); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
    }));
  } else {   // images, icons: cache first, refresh in the background
    e.respondWith(caches.match(req).then(r => { const net = fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; }).catch(() => r); return r || net; }));
  }
});
