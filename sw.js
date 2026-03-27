const CACHE_NAME = 'astra-v51';
const ASSETS = [
  'index.html', 'app.js', 'astra-materials.js', 'astra-maps.js', 'astra-sync.js', 'astra-estimates.js',
  'manifest.json', 'rough_materials.json', 'trim_materials.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];
const TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'astra-icons').map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function timeoutFetch(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(response => {
      clearTimeout(timer);
      resolve(response);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // App shell (same-origin assets) — cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return timeoutFetch(e.request, TIMEOUT_MS).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return response;
        });
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // External requests (Google Maps, etc.) — network-first with timeout, cache fallback
  e.respondWith(
    timeoutFetch(e.request, TIMEOUT_MS).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request).then(cached => cached || new Response('OFFLINE', { status: 503 })))
  );
});
