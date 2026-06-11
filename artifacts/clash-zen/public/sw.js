const STATIC_CACHE  = 'cz-static-v8';
const IMAGE_CACHE   = 'cz-images-v8';
const DYNAMIC_CACHE = 'cz-dynamic-v8';

// App shell + all icons precached on install so they load from cache on every repeat visit
const PRECACHE_ASSETS = [
  '/offline.html',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon-48.png',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

// ── Install: pre-cache shell assets ──────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  const KEEP = [STATIC_CACHE, IMAGE_CACHE, DYNAMIC_CACHE];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Cache First: serve from cache instantly; only hit network if missing.
// Ideal for: hashed JS/CSS bundles, fonts, icons — content that never changes at the same URL.
async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

// Network First: try network, fall back to cache on failure.
// Used for HTML navigation so the app shell is always fresh after a deploy.
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stale-While-Revalidate: return cached immediately, refresh in background.
// Ideal for: API data that should feel instant but stay fresh.
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchAndCache = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  if (cached) {
    fetchAndCache; // fire-and-forget background refresh
    return cached;
  }

  return fetchAndCache ?? new Response(JSON.stringify({ error: 'Offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Fetch: route requests ─────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── 1. API calls ────────────────────────────────────────────────────────────
  // Auth-sensitive endpoints always hit the network so suspension/blocks are caught.
  // Everything else: stale-while-revalidate — instant cached response + background refresh.
  if (url.pathname.startsWith('/api/')) {
    const noCache = [
      '/api/users/heartbeat',
      '/api/users/me',
      '/api/users/sse',
      '/api/auth',
    ];
    if (noCache.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
      e.respondWith(fetch(request));
    } else {
      e.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    }
    return;
  }

  // ── 2. Hashed JS/CSS bundles + fonts → Cache First ─────────────────────────
  // These files have content-hash in the filename so they never change at the same URL.
  if (
    url.pathname.match(/\/assets\/.*\.(js|css)$/) ||
    url.pathname.match(/\.(woff2?|ttf|otf|eot)$/) ||
    url.hostname.includes('fonts.g')
  ) {
    e.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── 3. Images (local + external CDN) → Cache First ─────────────────────────
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|avif|ico|gif)$/)) {
    e.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  // External CDN images (GitHub raw, CDN avatar URLs, etc.)
  if (
    url.hostname !== self.location.hostname &&
    url.href.match(/\.(png|jpg|jpeg|svg|webp|gif|avif)(\?.*)?$/)
  ) {
    e.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // ── 4. SPA HTML shell → Network First ──────────────────────────────────────
  // Always fetch the HTML from the network so the latest hashed JS/CSS filenames
  // are used after every deploy. Falls back to cache only when truly offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      networkFirst(request, STATIC_CACHE).then(res => {
        if (res && res.status !== 503) return res;
        return caches.match('/offline.html');
      })
    );
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
const TYPE_ICONS = {
  tournament: '/icons/icon-192.png',
  result:     '/icons/icon-192.png',
  wallet:     '/icons/icon-192.png',
  system:     '/icons/icon-192.png',
};

self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try { payload = e.data.json(); }
  catch { payload = { title: 'Clash Ren', body: e.data.text(), type: 'system' }; }

  const title = payload.title || 'Clash Ren';
  const options = {
    body:    payload.body   || '',
    icon:    payload.icon   || TYPE_ICONS[payload.type] || '/icons/icon-192.png',
    badge:   payload.badge  || '/icons/icon-192.png',
    tag:     payload.type   || 'cz-notif',
    data:    { url: payload.url || '/' },
    vibrate: [100, 50, 100],
    renotify: true,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const rawTarget = e.notification.data?.url || '/#/';

  const scope = self.registration.scope;
  const base  = scope.replace(/\/$/, '');
  const target = rawTarget.startsWith('http') ? rawTarget : base + rawTarget;

  e.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    const appClients = allClients.filter(c => c.url.startsWith(scope) || c.url.startsWith(base + '/#'));

    if (appClients.length > 0) {
      const client = appClients.find(c => c.visibilityState === 'visible') || appClients[0];
      try { await client.focus(); } catch (_) {}
      try { if (client.navigate) await client.navigate(target); } catch (_) {}
      return;
    }

    await self.clients.openWindow(target);
  })());
});
