// A short vibration for confirmations (save, delete, install). Android only — iPhone doesn't let
// websites vibrate, so this quietly does nothing there.
export const buzz = (ms = 12) => {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
};
