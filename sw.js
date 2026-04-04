// S-09: Every supabase.min.js update REQUIRES a CACHE_NAME bump.
// The SW caches the vendored Supabase client — a vulnerability in the cached copy
// persists until the cache is invalidated. Bump the version suffix on every update.
const CACHE_NAME = 'astra-v69';
const ASSETS = [
  'index.html', 'diagnostics.html', 'app.js', 'astra-materials.js', 'astra-maps.js', 'astra-auth.js', 'astra-sync.js', 'astra-estimates.js',
  'manifest.json', 'rough_materials.json', 'trim_materials.json',
  'seed_intelligence.json',
  'supabase.min.js'
];
const TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  // S-02: Validate origin on install — reject if loaded over HTTP (MitM/cache poisoning defense)
  if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
    console.error('SW: Refusing to install on insecure origin:', self.location.origin);
    return; // Do not cache anything — prevents poisoned SW persistence
  }
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

// BUG-044: Use AbortController to properly cancel zombie fetch connections
function timeoutFetch(request, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms);
  return fetch(request, { signal: ctrl.signal }).then(function(response) {
    clearTimeout(timer);
    return response;
  }).catch(function(err) {
    clearTimeout(timer);
    throw err;
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // SEC-020: Whitelist cacheable paths — don't cache dynamic data or API responses
  var CACHEABLE = /\/(index\.html|diagnostics\.html|app\.js|astra-[a-z]+\.js|sw\.js|manifest\.json|supabase\.min\.js|[a-z_]+\.json)$/;
  var isCacheable = url.origin === self.location.origin && CACHEABLE.test(url.pathname);

  // App shell (same-origin CACHEABLE assets) — cache-first
  if (url.origin === self.location.origin && isCacheable) {
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

  // Same-origin but NOT cacheable (dynamic data, blob URLs) — network only
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(e.request));
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
