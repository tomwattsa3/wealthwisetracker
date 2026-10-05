// WealthWise service worker: makes the app installable and gives it an offline fallback.
//
// - Pages: network first (so a new deploy shows straight away); the saved copy is only used
//   when there's no connection.
// - The app's own build files (/assets/…, hashed per deploy) and icons: saved after first use.
// - Fonts and the Tailwind script: served from the save, refreshed in the background.
// - Anything else — Supabase, exchange rates, any API — is never touched or saved, so numbers
//   are always live.

const VERSION = 'ww-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const SHELL_FILES = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.tailwindcss.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first, saved shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); }
          return res;
        })
        .catch(() => caches.match('/', { ignoreSearch: true }))
    );
    return;
  }

  // The app's hashed build files and icons: cache first (a new deploy has new file names).
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest)$/.test(url.pathname) || url.pathname === '/manifest.json')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Fonts and the Tailwind script: serve the saved copy, refresh it in the background.
  if (STATIC_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(req).then((hit) => {
          const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
  // Everything else (Supabase, rates, APIs, index.html checks): straight to the network.
});
