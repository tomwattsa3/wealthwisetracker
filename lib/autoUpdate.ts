// Keeps the installed / open app on the latest deploy. Phones (iPhone home-screen apps, Android
// Chrome tabs) keep an old copy running and don't reload by themselves, so whenever the app opens
// or comes back into view we fetch index.html fresh and compare its bundle file name (Vite
// hashes it per build) with the one this page loaded. If it changed, reload — unless a pop-up is
// open, so a half-done import or edit isn't lost (it checks again next time).

const BUNDLE = /\/assets\/index-[\w-]+\.js/;
const MIN_GAP_MS = 30_000;

export const startAutoUpdate = () => {
  if ((import.meta as any).env?.DEV || typeof document === 'undefined') return;
  const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src.match(BUNDLE)?.[0];
  if (!current) return;
  let lastCheck = 0;

  const check = async () => {
    if (Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();
    try {
      const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const latest = (await res.text()).match(BUNDLE)?.[0];
      if (!latest || latest === current) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      window.location.reload();
    } catch {
      /* offline — try again next time */
    }
  };

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) { lastCheck = 0; check(); } });
  check();
};
