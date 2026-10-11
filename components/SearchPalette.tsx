import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Upload, EyeOff, Eye, Sparkles, Home, Wallet, Table, LayoutGrid, ArrowRightLeft, FolderCog, Settings, CornerDownLeft } from 'lucide-react';
import { Transaction, Category } from '../types';
import PlaceSheet, { PlacePick, PLACE_TINTS } from './PlaceSheet';
import TxDetail, { userNote } from './TxDetail';
import { merchantKey, monthKey, keyToIndex } from '../lib/periods';
import { usePrivacy } from '../lib/privacy';
import { MODAL_TRANSITION } from '../lib/motion';
import { useBackClose } from '../lib/backStack';

// Search: ⌘K on desktop (a centred box), or the search button on phone Home (a bubble that
// drops in near the top, over a blurred Home, and grows down as results come in). One box for places, payments (and their notes), categories, pages and
// actions. Spelling is matched loosely, so "kareem" finds Careem. A question goes to Ask.
// Picking a place opens its panel (every payment, by month); a payment opens its details.

type Tab = 'home' | 'history' | 'categories' | 'sheets' | 'breakdown' | 'recurring' | 'income' | 'ask' | 'settings';

interface SearchPaletteProps {
  open: boolean;
  phone?: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji: (categoryId: string) => string;
  onGo: (tab: Tab) => void;
  onImport: () => void;
  onAsk: (question: string) => void;
  onViewCategory: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
}

type Scope = 'all' | 'places' | 'payments' | 'categories';
const SCOPES: [Scope, string][] = [['all', 'All'], ['places', 'Places'], ['payments', 'Payments'], ['categories', 'Categories']];

interface Item {
  id: string;
  group: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  sub?: string;
  right?: React.ReactNode;
  run: () => void;
}

// Loose matching: "kareem" ~ "careem", "uber" ~ "UBER *TRIP". Sounds-alike is a consonant
// skeleton (c/k/q the same, vowels dropped after the first letter); near-misses allow a typo.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const skeleton = (w: string) => {
  const s = w.toLowerCase().replace(/ph/g, 'f').replace(/ck|c|q/g, 'k').replace(/z/g, 's').replace(/[^a-z]/g, '');
  return (s.charAt(0) + s.slice(1).replace(/[aeiouy]/g, '')).replace(/(.)\1+/g, '$1');
};
const near = (a: string, b: string) => {
  // edit distance, stopping early once it can't be within 2
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
const score = (text: string, q: string, loose = true) => {
  const t = norm(text);
  if (!q || !t) return 0;
  if (t.startsWith(q)) return 100;
  const words = t.split(' ');
  if (words.some(w => w.startsWith(q))) return 90;
  if (t.includes(q)) return 70;
  if (loose && q.length >= 3 && !q.includes(' ')) {
    const sq = skeleton(q);
    if (sq.length >= 2 && words.some(w => skeleton(w).startsWith(sq) && skeleton(w).length <= sq.length + 1)) return 55;
    if (q.length >= 4 && words.some(w => near(q, w.slice(0, q.length + 1)) <= (q.length >= 6 ? 2 : 1))) return 45;
  }
  return 0;
};
const QUESTION = /^(how|what|when|which|did|do|am|is|was|where|who|why|show|total|biggest|compare)\b|\?$/i;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

const iconBox = 'w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center text-[15px] font-bold';

const SearchPalette: React.FC<SearchPaletteProps> = ({ open, phone, onClose, transactions, categories, currency, getCategoryEmoji, onGo, onImport, onAsk, onViewCategory }) => {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [sel, setSel] = useState(0);
  const [place, setPlace] = useState<PlacePick | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [hideAmounts, toggleHideAmounts] = usePrivacy();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('searchRecent') || '[]'); } catch { return []; } });

  useBackClose(open && !!phone, onClose);
  // While search is open, the page behind it stays put: the app scrolls inside <main>, so lock
  // that (and the page itself) and put them back as they were on close.
  useEffect(() => {
    if (!open) return;
    const els = [document.querySelector('main'), document.body].filter(Boolean) as HTMLElement[];
    const prev = els.map(el => el.style.overflow);
    els.forEach(el => { el.style.overflow = 'hidden'; });
    return () => els.forEach((el, i) => { el.style.overflow = prev[i]; });
  }, [open]);
  // Phones: keep the bubble above the keyboard. The visual viewport shrinks when the keyboard
  // opens, so the bubble's height follows it (with a fallback where it isn't available).
  const [viewH, setViewH] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !phone || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setViewH(vv.height + vv.offsetTop);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [open, phone]);
  useEffect(() => {
    if (!open) return;
    setQ(''); setScope('all'); setSel(0);
    // Phones: wait until the bubble has settled before the keyboard opens (it resizes the screen,
    // which would otherwise jolt the bubble mid-animation).
    const id = window.setTimeout(() => inputRef.current?.focus(), phone ? 300 : 30);
    return () => window.clearTimeout(id);
  }, [open, phone]);

  const amt = (t: Transaction) => Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0;
  const sym = currency === 'GBP' ? '£' : 'AED ';
  const fmt = (v: number) => sym + Math.round(v).toLocaleString('en-GB');
  const fmt2 = (v: number) => sym + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Everything searchable, built once per data change.
  const index = useMemo(() => {
    const rows = transactions.filter(t => !t.excluded && /^\d{4}-\d{2}-\d{2}/.test(t.date) && amt(t) > 0 && (t.categoryName || '').trim().toLowerCase() !== 'excluded');
    const latestYear = rows.reduce((y, t) => Math.max(y, Number(t.date.slice(0, 4))), 0) || new Date().getFullYear();
    let firstIdx = Infinity, lastIdx = -Infinity;
    const places = new Map<string, { key: string; names: Map<string, number>; total: number; n: number; last: string; income: number; cats: Map<string, { id: string; n: number }> }>();
    const catTotals = new Map<string, number>();
    rows.forEach(t => {
      const idx = keyToIndex(monthKey(t.date));
      firstIdx = Math.min(firstIdx, idx); lastIdx = Math.max(lastIdx, idx);
      const desc = (t.description || 'Unknown').trim();
      const key = merchantKey(desc) || desc.toLowerCase();
      const p = places.get(key) || { key, names: new Map(), total: 0, n: 0, last: '', income: 0, cats: new Map() };
      p.names.set(desc, (p.names.get(desc) || 0) + 1);
      if (t.date.startsWith(String(latestYear))) p.total += amt(t);
      p.n++;
      if (t.date > p.last) p.last = t.date;
      if (t.type === 'INCOME') p.income++;
      if (t.categoryName) { const c = p.cats.get(t.categoryName) || { id: t.categoryId, n: 0 }; c.n++; p.cats.set(t.categoryName, c); }
      places.set(key, p);
      if (t.type === 'EXPENSE' && t.date.startsWith(String(latestYear))) {
        const ck = `${t.categoryName}\u0001`;
        catTotals.set(ck, (catTotals.get(ck) || 0) + amt(t));
        const sk = `${t.categoryName}\u0001${(t.subcategoryName || '').trim()}`;
        catTotals.set(sk, (catTotals.get(sk) || 0) + amt(t));
      }
    });
    const placeList = Array.from(places.values()).map(p => {
      const name = Array.from(p.names.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const [catName, cat] = Array.from(p.cats.entries()).sort((a, b) => b[1].n - a[1].n)[0] || ['', { id: '', n: 0 }];
      return { key: p.key, name, total: p.total, n: p.n, last: p.last, income: p.income > p.n / 2, catName, catId: cat.id, aliases: Array.from(p.names.keys()) };
    });
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
    return { places: placeList, rows: sorted, catTotals, latestYear, firstIdx, lastIdx };
  }, [transactions, currency]);

  const remember = (text: string) => {
    const v = text.trim();
    if (!v) return;
    const next = [v, ...recent.filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 5);
    setRecent(next);
    try { localStorage.setItem('searchRecent', JSON.stringify(next)); } catch { /* not saved */ }
  };
  const done = (fn: () => void) => () => { remember(q); onClose(); fn(); };

  const openPlace = (p: (typeof index.places)[number], i: number) => {
    setPlace({ key: p.key, name: p.name, catName: p.catName, catId: p.catId, tint: PLACE_TINTS[i % PLACE_TINTS.length], year: Number(p.last.slice(0, 4)) || index.latestYear, month: null, income: p.income });
  };

  const items = useMemo<Item[]>(() => {
    const query = norm(q);
    const out: Item[] = [];
    const PAGES: [Tab, string, React.ReactNode][] = [
      ['home', 'Dashboard', <Home size={16} />], ['income', 'Income', <Wallet size={16} />], ['breakdown', 'Breakdown', <Table size={16} />],
      ['sheets', 'Category Sheets', <LayoutGrid size={16} />], ['history', 'Transactions', <ArrowRightLeft size={16} />], ['ask', 'Ask', <Sparkles size={16} />],
      ['categories', 'Categories', <FolderCog size={16} />], ['settings', 'Settings', <Settings size={16} />],
    ];
    const ACTIONS: Item[] = [
      { id: 'a-import', group: 'Actions', icon: <Upload size={16} />, title: 'Import a statement', sub: 'Upload a CSV from your bank', run: done(onImport) },
      { id: 'a-hide', group: 'Actions', icon: hideAmounts ? <Eye size={16} /> : <EyeOff size={16} />, title: hideAmounts ? 'Show amounts' : 'Hide amounts', sub: hideAmounts ? 'Show the real figures again' : 'Swap figures for X’s', run: () => { toggleHideAmounts(); onClose(); } },
      { id: 'a-ask', group: 'Actions', icon: <Sparkles size={16} />, title: 'Ask about your money', sub: 'e.g. "biggest month for food?"', run: done(() => onGo('ask')) },
    ];
    const actionClass = `${iconBox} bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300`;
    const pageClass = `${iconBox} bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-300`;

    if (!query) {
      recent.forEach((r, i) => out.push({ id: `r-${i}`, group: 'Recent', icon: <Search size={15} />, title: r, run: () => { setQ(r); setSel(0); } }));
      ACTIONS.forEach(a => out.push({ ...a, icon: <span className={actionClass}>{a.icon}</span> }));
      // Phones keep the bubble short: just the pages you'd jump to from Home
      PAGES.filter(([tab]) => !phone || ['income', 'history', 'sheets'].includes(tab)).forEach(([tab, label, icon]) => out.push({ id: `p-${tab}`, group: 'Go to', icon: <span className={pageClass}>{icon}</span>, title: label, run: done(() => onGo(tab)) }));
      return out;
    }

    const askItem: Item = {
      id: 'ask', group: 'Ask', icon: <span className={`${iconBox} bg-indigo-600 text-white`}><Sparkles size={16} /></span>,
      title: <>Ask: “{q.trim()}”</>, sub: 'Answers from your own transactions', right: <CornerDownLeft size={14} className="text-slate-400" />,
      run: done(() => onAsk(q.trim())),
    };
    const isQuestion = QUESTION.test(q.trim()) && query.split(' ').length >= 2;
    if (isQuestion && scope === 'all') out.push(askItem);

    if (scope === 'all' || scope === 'places') {
      const ps = index.places
        .map(p => ({ p, s: Math.max(...p.aliases.map(a => score(a, query))) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || b.p.n - a.p.n)
        .slice(0, scope === 'places' ? 20 : 4);
      ps.forEach(({ p }, i) => out.push({
        id: `pl-${p.key}`, group: 'Places',
        icon: <span className={`${iconBox} ${PLACE_TINTS[i % PLACE_TINTS.length]}`}>{p.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>,
        title: p.name,
        sub: `${p.catName || 'Not categorised'} · ${p.n} ${p.income ? (p.n === 1 ? 'payment in' : 'payments in') : (p.n === 1 ? 'payment' : 'payments')} · last ${dayLabel(p.last).replace(/^\w+ /, '')}`,
        right: <span className={`text-[13px] font-bold ${p.income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{fmt(p.total)}<span className="block text-[10.5px] font-normal text-slate-400 text-right">{index.latestYear}</span></span>,
        run: () => { remember(q); onClose(); openPlace(p, i); },
      }));
    }

    if (scope === 'all' || scope === 'payments') {
      const max = scope === 'payments' ? 40 : 6;
      const hits: Item[] = [];
      for (const t of index.rows) {
        if (hits.length >= max) break;
        const note = userNote(t.notes);
        const sDesc = score(t.description || '', query);
        const sNote = note && norm(note).includes(query) ? 60 : 0;
        if (!sDesc && !sNote) continue;
        const income = t.type === 'INCOME';
        hits.push({
          id: `t-${t.id}`, group: 'Payments',
          icon: <span className={`${iconBox} bg-slate-100 dark:bg-neutral-700`}>{(t.categoryId && getCategoryEmoji(t.categoryId)) || '•'}</span>,
          title: <>{t.description || 'Unknown'} <span className="font-normal text-slate-400">· {dayLabel(t.date)}</span></>,
          sub: sNote && !sDesc ? `“${note}”` : `${t.categoryName || 'Not categorised'}${t.subcategoryName ? ` › ${t.subcategoryName}` : ''}${t.bankName ? ` · ${t.bankName}` : ''}${note ? ` · “${note}”` : ''}`,
          right: <span className={`text-[13px] font-bold ${income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{income ? '+' : ''}{fmt2(amt(t))}</span>,
          run: () => { remember(q); onClose(); setTxId(t.id); },
        });
      }
      out.push(...hits);
    }

    if (scope === 'all' || scope === 'categories') {
      const year = index.latestYear;
      const start = `${year}-01-01`, end = `${year}-12-31`;
      const cs: { s: number; item: Item }[] = [];
      categories.forEach(c => {
        const sc = score(c.name, query);
        const total = index.catTotals.get(`${c.name}\u0001`) || 0;
        if (sc) cs.push({ s: sc + 1, item: {
          id: `c-${c.id}`, group: 'Categories', icon: <span className={`${iconBox} bg-slate-100 dark:bg-neutral-700`}>{getCategoryEmoji(c.id) || '•'}</span>,
          title: c.name, sub: total ? `${fmt(total)} in ${year}` : 'Category', right: <span className="text-[11px] text-slate-400">Category</span>,
          run: done(() => onViewCategory(c.id, null, start, end)),
        } });
        (c.subcategories || []).forEach(sub => {
          const ss = score(sub, query);
          if (!ss) return;
          const st = index.catTotals.get(`${c.name}\u0001${sub}`) || 0;
          cs.push({ s: ss, item: {
            id: `s-${c.id}-${sub}`, group: 'Categories', icon: <span className={`${iconBox} bg-slate-100 dark:bg-neutral-700`}>{getCategoryEmoji(c.id) || '•'}</span>,
            title: <>{c.name} <span className="text-slate-400">›</span> {sub}</>, sub: st ? `${fmt(st)} in ${year}` : 'Subcategory', right: <span className="text-[11px] text-slate-400">Subcategory</span>,
            run: done(() => onViewCategory(c.id, sub, start, end)),
          } });
        });
      });
      out.push(...cs.sort((a, b) => b.s - a.s).slice(0, scope === 'categories' ? 30 : 4).map(x => x.item));
    }

    if (scope === 'all') {
      PAGES.filter(([, label]) => score(label, query, false)).forEach(([tab, label, icon]) => out.push({ id: `p-${tab}`, group: 'Go to', icon: <span className={pageClass}>{icon}</span>, title: label, run: done(() => onGo(tab)) }));
      ACTIONS.filter(a => score(String(a.title), query, false)).forEach(a => out.push({ ...a, icon: <span className={actionClass}>{a.icon}</span> }));
      if (!isQuestion) out.push(askItem);
    }
    return out;
  }, [q, scope, index, categories, recent, hideAmounts, currency, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSel(0); }, [q, scope]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const i = SCOPES.findIndex(([s]) => s === scope);
      setScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length][0]);
    }
  };

  let lastGroup = '';
  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div key="search" className={`fixed inset-0 z-[130] flex justify-center items-start ${phone ? 'px-3 pt-[calc(env(safe-area-inset-top)_+_20px)]' : 'pt-[12vh]'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={phone ? { duration: 0.24, ease: [0.22, 1, 0.36, 1] } : { duration: 0.16 }}>
              <div className={`absolute inset-0 touch-none ${phone ? 'bg-slate-900/25 backdrop-blur-md' : 'bg-slate-900/30 backdrop-blur-[3px]'}`} onClick={onClose} />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                className={phone
                  ? 'relative w-full bg-white/95 dark:bg-neutral-800/95 shadow-[0_18px_50px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/5 dark:ring-white/10 overflow-hidden flex flex-col max-h-[46dvh]'
                  : 'relative w-[640px] max-w-[calc(100vw-48px)] rounded-[18px] bg-white dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 shadow-[0_24px_60px_rgba(15,23,42,0.30)] overflow-hidden flex flex-col max-h-[72vh]'}
                // top padding (safe area + 20px) and 12px clear of the keyboard
                style={phone ? { borderRadius: 22, ...(viewH ? { maxHeight: `calc(${viewH}px - env(safe-area-inset-top) - 32px)` } : {}) } : undefined}
                // Phones: the bubble grows out of the Home Search pill (they share a layoutId) and
                // shrinks back into it on close. layoutDependency keeps that morph to opening and
                // closing, so results coming and going just resize it instead of stretching it.
                layoutId={phone ? 'homeSearch' : undefined}
                layoutDependency={open}
                initial={phone ? { opacity: 1 } : { opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: phone ? { duration: 0 } : MODAL_TRANSITION }}
                exit={phone ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
                transition={{ layout: { type: 'spring', stiffness: 400, damping: 36, mass: 0.9 } }}
                onKeyDown={onKey}
              >
                {/* The contents fade in once the bubble has mostly opened */}
                <motion.div
                  className="flex-1 min-h-0 flex flex-col"
                  initial={phone ? { opacity: 0 } : false}
                  animate={{ opacity: 1, transition: { delay: phone ? 0.14 : 0, duration: 0.2 } }}
                >
                <div className={`flex items-center gap-3 shrink-0 ${phone ? 'h-12 px-4' : 'h-14 px-5'} ${phone && !q.trim() && items.length === 0 ? '' : 'border-b border-slate-100 dark:border-neutral-700'}`}>
                  <Search size={phone ? 16 : 18} className={`${phone ? 'text-indigo-500' : 'text-slate-400'} shrink-0`} />
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={phone ? 'Search or ask…' : 'Search places, payments, notes, categories… or ask a question'}
                    enterKeyHint="search"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[16px] md:text-[15px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {phone ? (
                    q ? <button onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear" className="w-6 h-6 shrink-0 rounded-full bg-slate-200 dark:bg-neutral-600 text-slate-500 dark:text-neutral-300 text-[11px] flex items-center justify-center">✕</button> : null
                  ) : (
                    <kbd className="px-1.5 h-5 rounded-[5px] border border-slate-200 dark:border-neutral-600 bg-slate-50 dark:bg-neutral-700 text-[10px] font-semibold text-slate-500 dark:text-neutral-400 flex items-center">esc</kbd>
                  )}
                </div>
                {q.trim() && (
                  <div className={`flex gap-1.5 pt-2.5 pb-1 shrink-0 ${phone ? 'px-3 overflow-x-auto hide-scrollbar' : 'px-4'}`}>
                    {SCOPES.map(([s, l]) => (
                      <button key={s} onClick={() => { setScope(s); inputRef.current?.focus(); }} className={`h-[26px] px-2.5 rounded-full text-[11.5px] transition-colors ${scope === s ? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-semibold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-neutral-700 dark:text-neutral-300'}`}>{l}</button>
                    ))}
                  </div>
                )}
                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {items.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Nothing found for “{q.trim()}”</p>}
                  {items.map((it, i) => {
                    const head = it.group !== lastGroup;
                    lastGroup = it.group;
                    return (
                      <React.Fragment key={it.id}>
                        {head && <div className="px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">{it.group}</div>}
                        <button
                          data-i={i}
                          onMouseMove={() => sel !== i && setSel(i)}
                          onClick={it.run}
                          className={`w-full flex items-center gap-3 min-h-[50px] px-3 py-1.5 rounded-xl text-left ${!phone && sel === i ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''} ${phone ? 'active:bg-slate-100 dark:active:bg-neutral-700/60' : ''}`}
                        >
                          {typeof it.icon === 'object' && React.isValidElement(it.icon) && (it.icon.type === 'span') ? it.icon : <span className={`${iconBox} bg-slate-100 text-slate-500 dark:bg-neutral-700 dark:text-neutral-300`}>{it.icon}</span>}
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-medium text-slate-900 dark:text-neutral-100 truncate">{it.title}</span>
                            {it.sub && <span className="block text-[11.5px] text-slate-500 dark:text-neutral-400 truncate">{it.sub}</span>}
                          </span>
                          {it.right && <span className="shrink-0 text-right">{it.right}</span>}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
                {!phone && <div className="flex items-center gap-4 h-9 px-4 border-t border-slate-100 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/80 text-[11px] text-slate-500 dark:text-neutral-400 shrink-0">
                  <span><kbd className="font-sans font-semibold">↑↓</kbd> move</span>
                  <span><kbd className="font-sans font-semibold">↵</kbd> open</span>
                  {q.trim() && <span><kbd className="font-sans font-semibold">tab</kbd> filter</span>}
                  <span className="ml-auto">Places &amp; categories: {index.latestYear} totals</span>
                </div>}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <PlaceSheet
        side={!phone}
        place={place}
        onClose={() => setPlace(null)}
        transactions={transactions}
        currency={currency}
        getCategoryEmoji={getCategoryEmoji}
        firstIdx={Number.isFinite(index.firstIdx) ? index.firstIdx : 0}
        lastIdx={Number.isFinite(index.lastIdx) ? index.lastIdx : 0}
      />
      <TxDetail id={txId} onClose={() => setTxId(null)} sheet={!!phone} />
    </>
  );
};

export default SearchPalette;
