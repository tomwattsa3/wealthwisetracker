// WealthWise service worker: makes the app installable and gives it an offline fallback.
//
// - Pages: network first (so a new deploy shows straight away); the saved copy is only used
//   when there's no connection.
// - The app's own build files (/assets/…, hashed per deploy) and icons: saved after first use.
// - Fonts and the Tailwind script: served from the save, refreshed in the background.
// - Anything else — Supabase, exchange rates, any API — is never touched or saved, so numbers
//   are always live. (When offline, the app itself shows the copy of your data saved on the phone.)
// - Import reminders: Android wakes this worker about twice a day ('periodicsync'); if you've
//   turned reminders on and your bank data is older than you chose, it shows a notification.

const VERSION = 'ww-v3';
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

// ---- Import reminders ----
// Same on-phone store as lib/offline.ts.
const kvGet = (key) => new Promise((resolve) => {
  const open = indexedDB.open('wealthwise', 1);
  open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv'); };
  open.onerror = () => resolve(undefined);
  open.onsuccess = () => {
    try {
      const req = open.result.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  };
});
const kvSet = (key, value) => new Promise((resolve) => {
  const open = indexedDB.open('wealthwise', 1);
  open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv'); };
  open.onerror = () => resolve();
  open.onsuccess = () => {
    try {
      const tx = open.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  };
});

const DAY = 86400000;
const checkImportReminder = async () => {
  const prefs = await kvGet('reminder');
  const last = await kvGet('lastImport');
  if (!prefs || !prefs.on || !last || !last.date) return;
  const ends = new Date(`${last.date.slice(0, 10)}T00:00:00`).getTime();
  const days = Math.floor((Date.now() - ends) / DAY);
  if (!(days >= prefs.days)) return;
  // At most one reminder every 3 days, so it nudges rather than nags.
  const lastShown = (await kvGet('reminderShownAt')) || 0;
  if (Date.now() - lastShown < 3 * DAY) return;
  await self.registration.showNotification('Time to update WealthWise', {
    body: `Your latest ${last.bank || 'bank'} payment is from ${days} days ago. Import a new statement to catch up.`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'import-reminder',
    data: { url: '/?tab=history&action=import' },
  });
  await kvSet('reminderShownAt', Date.now());
};

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'import-reminder') event.waitUntil(checkImportReminder());
});

// The app asks for a test notification from Settings.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'test-reminder') {
    event.waitUntil(self.registration.showNotification('Time to update WealthWise', {
      body: 'This is what your import reminder will look like.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'import-reminder',
      data: { url: '/?tab=history&action=import' },
    }));
  }
});

// Tapping the reminder opens the app on the import screen (or brings it to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((c) => (c || open).focus()).catch(() => open.focus());
      return self.clients.openWindow(url);
    })
  );
});
