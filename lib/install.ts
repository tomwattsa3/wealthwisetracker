import { useSyncExternalStore } from 'react';

// "Install app": Android Chrome fires beforeinstallprompt when the app can be installed; we keep
// that event so our own Install button can show the real install dialog. iPhone Safari has no
// such event, so there we show a hint instead (Share → Add to Home Screen). Nothing shows once
// the app is running installed (standalone).

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);

// iPhone/iPad Safari (not already installed, not another browser that can't add to Home Screen).
export const isIosSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua) && !isStandalone();
};

// Call once at startup, before React renders, so the event isn't missed.
export const listenForInstall = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of Chrome's mini-bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });
};

export const promptInstall = async (): Promise<boolean> => {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') { installed = true; notify(); }
  return outcome === 'accepted';
};

// 'android' = we can show the real install dialog; 'ios' = show the Add to Home Screen hint;
// null = nothing to offer (already installed, or a browser that can't install).
export const useInstall = (): 'android' | 'ios' | null =>
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => (installed || isStandalone() ? null : deferred ? 'android' : isIosSafari() ? 'ios' : null)
  );
