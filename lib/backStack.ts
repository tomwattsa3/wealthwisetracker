import { useEffect, useRef } from 'react';

// Lets the phone's back gesture (Android back button/swipe, iOS edge swipe) close the open sheet
// or pop-up instead of leaving the app. Each open layer pushes a history entry; Back pops the
// top layer. Closing a layer from the UI removes its entry again so history stays tidy.
//
// history.back() finishes later (on popstate), so a layer opened while one is still being
// removed (close one sheet, open the next straight away) waits for that before adding its entry.

type Layer = { id: number; close: () => void; pushed: boolean };
const stack: Layer[] = [];
let nextId = 1;
let ignorePops = 0;

const flush = () => {
  for (const l of stack) if (!l.pushed) { l.pushed = true; history.pushState({ wwLayer: l.id }, ''); }
};

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; if (ignorePops === 0) flush(); return; }
    const top = stack.pop();
    top?.close();
  });
}

const open = (close: () => void) => {
  const id = nextId++;
  stack.push({ id, close, pushed: false });
  if (ignorePops === 0) flush();
  return id;
};

// Called when a layer closes some other way (X, scrim, drag): drop its history entry.
const dismiss = (id: number) => {
  const i = stack.findIndex(l => l.id === id);
  if (i === -1) return; // already closed by Back
  const [layer] = stack.splice(i, 1);
  if (!layer.pushed) return; // its entry was never added
  ignorePops++;
  history.back();
};

// While `isOpen`, Back runs `onClose` instead of navigating away.
export const useBackClose = (isOpen: boolean, onClose: () => void) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const id = open(() => closeRef.current());
    return () => dismiss(id);
  }, [isOpen]);
};
