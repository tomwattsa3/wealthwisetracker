import { useSyncExternalStore } from 'react';

// "Hide amounts": hides every money figure on screen so you can see a number is there but not
// what it is. Two styles: X's (the default) swaps each digit for an X, so £21,552.19 reads
// £XX,XXX.XX; Blur softly blurs the figure instead.
//
// X's: the matched amounts in each text node are rewritten, and the real text is kept so it can be
// put back. When React later changes that text, the observer sees the new value, keeps it and
// masks it again (React compares against its own copy, never the page, so this is safe).
//
// Blur: Only the amount's text blurs — whatever it sits in (a coloured Breakdown
// cell, a card) stays sharp — and the blur fades out naturally rather than stopping at an edge.
//
// Amounts are formatted in many places, so a MutationObserver finds them in the page text
// instead of touching each component, and marks just the digits with the CSS Custom Highlight
// API (a text-shadow, so it isn't clipped). Each text colour gets its own highlight so the blur keeps the number's colour (white on a
// dark cell, green for money in…). Only highlight ranges are added — React's text nodes are
// never changed. Chart labels (SVG text) and browsers without highlights fall back to blurring
// the element. Saved per device.

const STORAGE_KEY = 'privacyMode';
const STRENGTH_KEY = 'privacyBlurStrength';
const STYLE_KEY = 'privacyStyle';
export type PrivacyStyle = 'x' | 'blur';
let style: PrivacyStyle = (() => { try { return localStorage.getItem(STYLE_KEY) === 'blur' ? 'blur' : 'x'; } catch { return 'x'; } })();
// X's: each masked text node and the real text it holds
const originals = new Map<Text, string>();
const maskText = (t: string) => t.replace(AMOUNT_G, m => m.replace(/\d/g, 'X'));
// Blur strength as a multiplier of the default (1 = 100%), set from the slider.
export const STRENGTH_MIN = 0.5;
export const STRENGTH_MAX = 2;
let strength = (() => {
  try { const v = parseFloat(localStorage.getItem(STRENGTH_KEY) || ''); return v >= STRENGTH_MIN && v <= STRENGTH_MAX ? v : 1; } catch { return 1; }
})();
const HAS_AMOUNT = /(£|AED)\s?\d|\d[\d,.]*\s?(AED|GBP)\b/;
const AMOUNT_G = /(?:[−+-]\s?)?(?:£|AED\s?)\s?\d[\d,.]*k?|\d[\d,.]*\s?(?:AED|GBP)\b/g;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT']);

type HighlightLike = { add: (r: Range) => void; delete: (r: Range) => void; clear: () => void };
const cssHighlights: Map<string, HighlightLike> | null =
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (window as any).Highlight === 'function' ? (CSS as any).highlights : null;

// One highlight per text colour, each with a text-shadow in that colour. The rules are rewritten
// whenever the strength changes (custom properties can't be relied on inside ::highlight).
const byColor = new Map<string, { name: string; h: HighlightLike }>();
let styleEl: HTMLStyleElement | null = null;
const writeRules = () => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--amt-k', String(strength));
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'amt-highlights'; document.head.appendChild(styleEl); }
  const radius = `calc(${(3.96 * strength).toFixed(2)}px + ${(0.132 * strength).toFixed(3)}em)`;
  styleEl.textContent = Array.from(byColor.entries())
    .map(([color, { name }]) => `html.privacy ::highlight(${name}) { color: transparent; text-shadow: 0 0 ${radius} ${color}; }`)
    .join('\n');
};
const highlightFor = (color: string) => {
  let entry = byColor.get(color);
  if (entry) return entry.h;
  const name = `amt-${byColor.size}`;
  const h = new (window as any).Highlight() as HighlightLike;
  cssHighlights!.set(name, h);
  entry = { name, h };
  byColor.set(color, entry);
  writeRules();
  return h;
};

const rangesByNode = new Map<Text, { r: Range; h: HighlightLike }[]>();

let on = (() => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } })();
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let themeObserver: MutationObserver | null = null;

const dropRanges = (node: Text) => {
  const rs = rangesByNode.get(node);
  if (!rs) return;
  rs.forEach(({ r, h }) => h.delete(r));
  rangesByNode.delete(node);
};

const restore = (node: Text) => {
  const real = originals.get(node);
  if (real === undefined) return;
  if (node.nodeValue === maskText(real)) node.nodeValue = real;
  originals.delete(node);
};

const process = (node: Text) => {
  const el = node.parentElement;
  dropRanges(node);
  if (!el || SKIP.has(el.tagName) || el.closest('[data-amt-skip]')) return;
  const text = node.nodeValue || '';
  if (style === 'x') {
    const real = originals.get(node);
    if (real !== undefined && text === maskText(real)) return; // our own change
    if (!HAS_AMOUNT.test(text)) { originals.delete(node); return; }
    originals.set(node, text);
    node.nodeValue = maskText(text);
    return;
  }
  const has = HAS_AMOUNT.test(text);
  // Fallback: blur the whole element (chart labels, browsers without highlights).
  if (!cssHighlights || el instanceof SVGElement) {
    if (has) el.setAttribute('data-amt', '');
    else if (el.hasAttribute('data-amt')) el.removeAttribute('data-amt');
    return;
  }
  if (!has) return;
  const h = highlightFor(getComputedStyle(el).color);
  const rs: { r: Range; h: HighlightLike }[] = [];
  for (const m of text.matchAll(AMOUNT_G)) {
    const r = document.createRange();
    r.setStart(node, m.index!);
    r.setEnd(node, m.index! + m[0].length);
    h.add(r);
    rs.push({ r, h });
  }
  if (rs.length) rangesByNode.set(node, rs);
};

const scan = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) { process(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) process(n as Text);
};

const forget = (root: Node) => {
  if (rangesByNode.size === 0 && originals.size === 0) return;
  // A node React only moved (rows reordering) is back in the page by now: keep its real text.
  const drop = (n: Text) => { dropRanges(n); if (!n.isConnected) originals.delete(n); };
  if (root.nodeType === Node.TEXT_NODE) { drop(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) drop(n as Text);
};

const clearAll = () => {
  byColor.forEach(({ h }) => h.clear());
  rangesByNode.clear();
  Array.from(originals.keys()).forEach(restore);
  document.querySelectorAll('[data-amt]').forEach(el => el.removeAttribute('data-amt'));
};

const start = () => {
  if (observer || typeof document === 'undefined') return;
  scan(document.body);
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') process(r.target as Text);
      else {
        r.removedNodes.forEach(forget);
        r.addedNodes.forEach(scan);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  // Text colours change with dark mode, so re-pick each number's highlight when it flips.
  themeObserver = new MutationObserver(() => { if (style === 'blur') { clearAll(); scan(document.body); } });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
};

const stop = () => {
  observer?.disconnect();
  themeObserver?.disconnect();
  observer = null;
  themeObserver = null;
  clearAll();
};

const apply = () => {
  if (on) start(); else stop();
  document.documentElement.classList.toggle('privacy', on && style === 'blur');
};
if (typeof document !== 'undefined') { writeRules(); apply(); }

export const setPrivacy = (next: boolean) => {
  on = next;
  try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* not saved */ }
  apply();
  listeners.forEach(l => l());
};

export const setPrivacyStyle = (next: PrivacyStyle) => {
  if (next === style) return;
  try { localStorage.setItem(STYLE_KEY, next); } catch { /* not saved */ }
  const wasOn = on;
  if (wasOn) { on = false; apply(); }
  style = next;
  if (wasOn) { on = true; apply(); }
  listeners.forEach(l => l());
};

export const usePrivacyStyle = (): [PrivacyStyle, (s: PrivacyStyle) => void] => {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => style
  );
  return [value, setPrivacyStyle];
};

export const setBlurStrength = (k: number) => {
  strength = Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, k));
  try { localStorage.setItem(STRENGTH_KEY, String(strength)); } catch { /* not saved */ }
  writeRules();
  listeners.forEach(l => l());
};

export const useBlurStrength = (): [number, (k: number) => void] => {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => strength
  );
  return [value, setBlurStrength];
};

export const usePrivacy = (): [boolean, () => void] => {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => on
  );
  return [value, () => setPrivacy(!on)];
};
