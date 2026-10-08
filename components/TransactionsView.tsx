import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Upload, X, LogOut, ChevronDown, Sparkles, RotateCcw, Trash2, Check, ListChecks, Pencil } from 'lucide-react';
import { Transaction, Category } from '../types';
import { DateRange } from './DashboardDateFilter';
import SegmentedControl from './SegmentedControl';
import { MODAL_TRANSITION } from '../lib/motion';
import Sheet from './Sheet';
import MixedMerchants, { useMixedMerchants } from './MixedMerchants';
import { NoteBox, userNote } from './TxDetail';
import { useBackClose } from '../lib/backStack';
import { buzz } from '../lib/haptics';

// The Transactions tab: a summary strip, one row of filters, and every transaction grouped
// under its day. Clicking a row opens a details panel (docked on the right on desktop, a bottom
// sheet on phones) to re-file it, remember the merchant, hide it from totals or delete it.

interface LatestBank { name: string; dateLabel: string; agoLabel: string; stale: boolean }

interface TransactionsViewProps {
  transactions: Transaction[]; // after every filter below
  periodTransactions: Transaction[]; // everything in the date range (for totals and chip counts)
  allTransactions: Transaction[];
  categories: Category[];
  getCategoryEmoji: (categoryId: string) => string;
  searchQuery: string;
  onSearch: (q: string) => void;
  dateRange: DateRange;
  onDateRange: (r: DateRange) => void;
  availableBanks: string[];
  filterBank: string;
  onFilterBank: (v: string) => void;
  filterType: 'all' | 'INCOME' | 'EXPENSE';
  onFilterType: (v: 'all' | 'INCOME' | 'EXPENSE') => void;
  filterCategory: string;
  onFilterCategory: (v: string) => void;
  filterSubcategory: string;
  onFilterSubcategory: (v: string) => void;
  filterRecentlyAdded: 'all' | 'today' | 'week' | 'uncategorized';
  onFilterRecentlyAdded: (v: 'all' | 'today' | 'week' | 'uncategorized') => void;
  onResetFilters: () => void;
  latestByBank: LatestBank[];
  onOpenImport: () => void;
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onBulkUpdate: (ids: string[], updates: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
  onRemember: (merchant: string, categoryId: string, categoryName: string, subcategoryName: string) => void;
  onApplyMemory: (list: Transaction[]) => void;
  applyingMemory: boolean;
  onLogout: () => void;
  // Opened from the Dashboard's quick links: start on the review list or the mixed categories.
  startWith?: 'review' | 'mixed' | null;
  onStarted?: () => void;
  // Opened from a payment's pop-up: select that transaction.
  selectOnStart?: string | null;
  onSelected?: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AUTO_NOTE = '✨ Auto-categorized';
const PAGE = 150;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const gbp = (v: number) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gbp0 = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;
const aed = (v: number) => `AED ${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isHidden = (t: Transaction) => !!t.excluded || t.categoryId === 'excluded';
const norm = (s: string) => (s || '').trim().toLowerCase();

// Built with local dates (not toISOString, which shifts to UTC and can land on the wrong day).
const PRESETS: { id: string; label: string; range: () => [Date, Date] }[] = [
  { id: 'This Month', label: 'This month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)]; } },
  { id: 'Last Week', label: 'Last week', range: () => { const n = new Date(); const dow = (n.getDay() + 6) % 7; const sun = new Date(n.getFullYear(), n.getMonth(), n.getDate() - dow - 1); return [new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() - 6), sun]; } },
  { id: 'Last Month', label: 'Last month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
  { id: 'YTD', label: 'YTD', range: () => { const n = new Date(); return [new Date(n.getFullYear(), 0, 1), n]; } },
];

// Needs a check: not categorised yet, or filed by memory on an import in the last 30 days.
const RECENT_MS = 30 * 86400000;
export const needsReview = (t: Transaction) => {
  if (isHidden(t)) return false;
  if (!t.categoryId) return true;
  if (!(t.notes || '').includes(AUTO_NOTE)) return false;
  const created = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
  return !isNaN(created) && Date.now() - created < RECENT_MS;
};

const TINTS = [
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
  'bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-300',
];
const tintFor = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return TINTS[h % TINTS.length]; };
const initialOf = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•';

const useMedia = (q: string) => {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mql = window.matchMedia(q);
    const on = () => setM(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [q]);
  return m;
};

const TransactionsView: React.FC<TransactionsViewProps> = (p) => {
  const {
    transactions, periodTransactions, allTransactions, categories, getCategoryEmoji,
    searchQuery, onSearch, dateRange, onDateRange,
    availableBanks, filterBank, onFilterBank, filterType, onFilterType,
    filterCategory, onFilterCategory, filterSubcategory, onFilterSubcategory,
    filterRecentlyAdded, onFilterRecentlyAdded, onResetFilters,
    latestByBank, onOpenImport, onUpdate, onBulkUpdate, onDelete, onRemember, onApplyMemory, applyingMemory, onLogout,
    startWith, onStarted, selectOnStart, onSelected,
  } = p;
  const isLg = useMedia('(min-width: 1024px)');

  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(dateRange.start);
  const [customEnd, setCustomEnd] = useState(dateRange.end);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3500); return () => clearTimeout(id); }, [toast]);

  const list = useMemo(() => (reviewOnly ? transactions.filter(needsReview) : transactions), [transactions, reviewOnly]);
  useEffect(() => { setVisible(PAGE); }, [list]);

  // ---- Summary strip (hidden rows never count) ----
  const summary = useMemo(() => {
    let spent = 0, spentAed = 0, moneyIn = 0, outCount = 0;
    periodTransactions.forEach(t => {
      if (isHidden(t)) return;
      const g = Math.abs(t.amountGBP || 0);
      if (t.type === 'EXPENSE') { spent += g; spentAed += Math.abs(t.amountAED || 0); outCount++; } else moneyIn += g;
    });
    return { spent, spentAed, moneyIn, outCount, net: moneyIn - spent };
  }, [periodTransactions]);
  const reviewCount = useMemo(() => transactions.filter(needsReview).length, [transactions]);
  // Merchants filed under more than one category, across all your transactions.
  const { mixed, hiddenCount: mixedOk, markOk, resetOk } = useMixedMerchants(allTransactions);
  const [mixedOpen, setMixedOpen] = useState(false);
  useEffect(() => {
    if (!selectOnStart) return;
    setSelectedId(selectOnStart);
    onSelected?.();
    requestAnimationFrame(() => document.querySelector(`[data-tx-row="${selectOnStart}"]`)?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectOnStart]);
  useEffect(() => {
    if (!startWith) return;
    if (startWith === 'review') setReviewOnly(true);
    if (startWith === 'mixed') setMixedOpen(true);
    onStarted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith]);
  const stalest = latestByBank[0];

  // ---- Category chips: the four busiest in this period, the rest under "More" ----
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    // Only categories with payments of the picked kind (Money in shows just the ones money came in under).
    periodTransactions.forEach(t => {
      if (!t.categoryId || isHidden(t) || (filterType !== 'all' && t.type !== filterType)) return;
      m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
    });
    return m;
  }, [periodTransactions, filterType]);
  // Switching to Money in (or out) drops a picked category that has nothing of that kind.
  useEffect(() => {
    if (filterType !== 'all' && filterCategory !== 'all' && !catCounts.has(filterCategory)) { onFilterCategory('all'); onFilterSubcategory('all'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);
  const topCats = useMemo(
    () => categories.filter(c => catCounts.has(c.id)).sort((a, b) => (catCounts.get(b.id) || 0) - (catCounts.get(a.id) || 0)).slice(0, isLg && selectedId ? 3 : 4),
    [categories, catCounts, isLg, selectedId]
  );
  const moreCats = categories.filter(c => !topCats.some(t => t.id === c.id) && (filterType === 'all' || catCounts.has(c.id))).sort((a, b) => a.name.localeCompare(b.name));

  // ---- Subcategory chips under the filter row once a category is picked: count and total of each ----
  const subChips = useMemo(() => {
    if (filterCategory === 'all') return [];
    const m = new Map<string, { name: string; count: number; total: number }>();
    periodTransactions.forEach(t => {
      if (t.categoryId !== filterCategory || isHidden(t)) return;
      if (filterBank !== 'all' && t.bankName !== filterBank) return;
      if (filterType !== 'all' && t.type !== filterType) return;
      const name = (t.subcategoryName || '').trim();
      if (!name) return;
      const e = m.get(name) || { name, count: 0, total: 0 };
      e.count++; e.total += Math.abs(t.amountGBP || 0);
      m.set(name, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [periodTransactions, filterCategory, filterBank, filterType]);
  const filtersOn = filterCategory !== 'all' || filterSubcategory !== 'all' || filterType !== 'all' || filterBank !== 'all' || filterRecentlyAdded !== 'all' || reviewOnly;

  // ---- Day groups over the visible slice ----
  const groups = useMemo(() => {
    const out: { date: string; rows: Transaction[]; out: number }[] = [];
    list.slice(0, visible).forEach(t => {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) { g = { date: t.date, rows: [], out: 0 }; out.push(g); }
      g.rows.push(t);
      if (t.type === 'EXPENSE' && !isHidden(t)) g.out += Math.abs(t.amountGBP || 0);
    });
    return out;
  }, [list, visible]);
  const thisYear = new Date().getFullYear();
  const dayLabel = (d: string) => { const dt = parse(d); return `${DAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}${dt.getFullYear() !== thisYear ? ` ${dt.getFullYear()}` : ''}`; };

  // Load the next page as the bottom of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(v => Math.min(v + PAGE, list.length)); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, visible]);

  // ---- Selection + keyboard ----
  const selected = selectedId ? allTransactions.find(t => t.id === selectedId) || null : null;
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);
  const move = (dir: 1 | -1) => {
    if (!selectedId) return;
    const i = list.findIndex(t => t.id === selectedId);
    const next = list[i + dir];
    if (next) {
      setSelectedId(next.id);
      if (i + dir >= visible) setVisible(v => v + PAGE);
      requestAnimationFrame(() => document.querySelector(`[data-tx-row="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
  };
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === 'Escape') setSelectedId(null);
      else if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- Select mode: tick several transactions and move them to one category together ----
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const startSelecting = (firstId?: string) => {
    setSelectedId(null);
    setSelecting(true);
    setPicked(new Set(firstId ? [firstId] : []));
    setAnchor(firstId || null);
  };
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); setAnchor(null); setBulkOpen(false); };
  useBackClose(selecting, stopSelecting);
  // Shift-click ticks everything between the last one ticked and this one.
  const togglePick = (id: string, range: boolean) => {
    setPicked(prev => {
      const next = new Set(prev);
      const a = anchor ? list.findIndex(t => t.id === anchor) : -1;
      const b = list.findIndex(t => t.id === id);
      if (range && a !== -1 && b !== -1) {
        const on = !prev.has(id) || prev.has(anchor!);
        list.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(t => (on ? next.add(t.id) : next.delete(t.id)));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };
  const pickedTx = useMemo(() => allTransactions.filter(t => picked.has(t.id)), [allTransactions, picked]);
  const pickedTotal = pickedTx.reduce((sum, t) => sum + Math.abs(t.amountGBP || 0), 0);
  const allShownPicked = list.length > 0 && list.every(t => picked.has(t.id));
  const pickAllShown = () => { setPicked(allShownPicked ? new Set() : new Set(list.map(t => t.id))); setAnchor(null); };
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bulkOpen) stopSelecting(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const applyBulk = (cat: Category, sub: string) => {
    const ids = pickedTx.map(t => t.id);
    if (!ids.length) return;
    onBulkUpdate(ids, { categoryId: cat.id, categoryName: cat.name, subcategoryName: sub, excluded: false });
    // Ones filed automatically on import count as checked now.
    pickedTx.forEach(t => { if ((t.notes || '').includes(AUTO_NOTE)) onUpdate(t.id, { notes: (t.notes || '').replace(AUTO_NOTE, '').trim() }); });
    setToast(`Moved ${ids.length} ${ids.length === 1 ? 'transaction' : 'transactions'} to ${cat.name}${sub ? ` › ${sub}` : ''}`);
    buzz();
    stopSelecting();
  };
  // Phones: press and hold a row to start selecting.
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const holdStart = (id: string) => {
    held.current = false;
    if (selecting) return;
    holdTimer.current = window.setTimeout(() => { held.current = true; buzz(); startSelecting(id); }, 450);
  };
  const holdEnd = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };

  const pickPreset = (id: string) => {
    if (id === 'Custom Range') { setCustomOpen(o => !o); return; }
    const preset = PRESETS.find(x => x.id === id);
    if (!preset) return;
    const [s, e] = preset.range();
    onDateRange({ start: iso(s), end: iso(e), label: preset.id });
    setCustomOpen(false);
  };
  const periodText = (() => {
    const s = parse(dateRange.start), e = parse(dateRange.end);
    if (s.getDate() === 1 && e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear() && e.getDate() === new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate()) return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    const f = (d: Date, y: boolean) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${y ? ` ${d.getFullYear()}` : ''}`;
    return `${f(s, s.getFullYear() !== e.getFullYear())} – ${f(e, true)}`;
  })();

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const pill = 'appearance-none pl-3 pr-7 py-1.5 rounded-full border text-[12.5px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
  const pillOff = 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300';
  const pillOn = 'border-slate-900 bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100';

  const SelectPill: React.FC<{ value: string; on: boolean; onChange: (v: string) => void; label: string; className?: string; children: React.ReactNode }> = ({ value, on, onChange, label, className = '', children }) => (
    <span className={`relative shrink-0 ${className}`}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${pill} ${on ? pillOn : pillOff}`}>{children}</select>
      <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${on ? 'text-white dark:text-neutral-900' : 'text-slate-400'}`} />
    </span>
  );

  const panelOpen = !!selected;

  // ---- Phones: month strip (spending per month of the year in view) ----
  const spendByMonth = useMemo(() => {
    const m = new Map<string, number>();
    allTransactions.forEach(t => {
      if (t.type !== 'EXPENSE' || isHidden(t) || !/^\d{4}-\d{2}/.test(t.date)) return;
      const k = t.date.slice(0, 7);
      m.set(k, (m.get(k) || 0) + Math.abs(t.amountGBP || 0));
    });
    return m;
  }, [allTransactions]);
  const dataYears = useMemo(() => Array.from(new Set(Array.from(spendByMonth.keys()).map(k => Number(k.slice(0, 4))))).sort(), [spendByMonth]);
  const today = new Date();
  const stripYear = dataYears.includes(Number(dateRange.end.slice(0, 4))) ? Number(dateRange.end.slice(0, 4)) : dataYears[dataYears.length - 1] ?? today.getFullYear();
  const stripMonths = (() => {
    const keys = Array.from(spendByMonth.keys()).filter(k => k.startsWith(`${stripYear}-`)).sort();
    const last = keys.length ? Number(keys[keys.length - 1].slice(5, 7)) : (stripYear === today.getFullYear() ? today.getMonth() + 1 : 12);
    return Array.from({ length: last }, (_, i) => i + 1);
  })();
  const monthRange = (y: number, m: number) => ({ start: `${y}-${String(m).padStart(2, '0')}-01`, end: iso(new Date(y, m, 0)) });
  const yearRange = (y: number) => (y === today.getFullYear()
    ? { start: `${y}-01-01`, end: iso(today), label: 'YTD' }
    : { start: `${y}-01-01`, end: `${y}-12-31`, label: 'Custom Range' });
  const activeMonth = stripMonths.find(m => { const r = monthRange(stripYear, m); return r.start === dateRange.start && r.end === dateRange.end; });
  const allActive = !activeMonth && dateRange.start === `${stripYear}-01-01` && (dateRange.label === 'YTD' || dateRange.end === `${stripYear}-12-31`);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [dateRange.start, dateRange.end]);

  return (
    <div
      className="h-full flex flex-col gap-3 md:gap-4 overflow-hidden"
      style={{ fontVariantNumeric: 'tabular-nums' }}
      onDragEnter={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) onOpenImport(); }}
    >
      {/* Phones: compact header — title with search and import, then period and totals */}
      <div className="md:hidden shrink-0 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-2xl font-bold text-slate-900 dark:text-neutral-100">Transactions</h1>
          <button onClick={() => setSearchOpen(o => !o)} aria-label="Search" aria-expanded={searchOpen} className={`w-10 h-10 rounded-xl border flex items-center justify-center ${searchOpen || searchQuery ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'}`}><Search size={17} /></button>
          <button onClick={() => (selecting ? stopSelecting() : startSelecting())} aria-label="Select transactions" aria-pressed={selecting} className={`w-10 h-10 rounded-xl border flex items-center justify-center ${selecting ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'}`}><ListChecks size={17} /></button>
          <button onClick={onOpenImport} className="h-10 px-3.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold flex items-center gap-1.5"><Upload size={15} /> Import</button>
          <button onClick={onLogout} aria-label="Log out" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400"><LogOut size={16} /></button>
        </div>
        <p className="-mt-2 text-[12.5px] text-slate-600 dark:text-neutral-300">Spent <strong className="text-slate-900 dark:text-neutral-100">{gbp0(summary.spent)}</strong> · In <strong className="text-emerald-700 dark:text-emerald-400">{gbp0(summary.moneyIn)}</strong></p>
        {(searchOpen || searchQuery) && (
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Merchant, category or amount"
                className="w-full h-10 pl-9 pr-3 bg-white dark:bg-neutral-800 border-[1.5px] border-indigo-500 rounded-xl text-[15px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 outline-none"
              />
            </label>
            <button onClick={() => { onSearch(''); setSearchOpen(false); }} className="text-sm text-slate-500">Cancel</button>
          </div>
        )}
        {/* Compact month strip: the year, each month with what you spent, and custom dates */}
        <div ref={stripRef} role="group" aria-label="Period" className="flex items-center gap-1 p-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl overflow-x-auto hide-scrollbar">
          {(dataYears.length > 1 ? dataYears : [stripYear]).map(y => {
            const on = y === stripYear && allActive;
            return (
              <button key={y} onClick={() => { onDateRange(yearRange(y)); setCustomOpen(false); }} aria-pressed={on} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${on ? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : y === stripYear ? 'text-slate-700 dark:text-neutral-200' : 'text-slate-400 dark:text-neutral-500'}`}>
                {dataYears.length > 1 ? y : `All ${y}`}
              </button>
            );
          })}
          <span className="shrink-0 w-px h-6 bg-slate-200 dark:bg-neutral-700" />
          {stripMonths.map(m => {
            const on = activeMonth === m;
            const total = spendByMonth.get(`${stripYear}-${String(m).padStart(2, '0')}`) || 0;
            return (
              <button key={m} onClick={() => { onDateRange({ ...monthRange(stripYear, m), label: 'Custom Range' }); setCustomOpen(false); }} aria-pressed={on} className={`shrink-0 min-w-[52px] px-2 py-1 rounded-xl flex flex-col items-center ${on ? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-slate-700 dark:text-neutral-200'}`}>
                <span className="text-xs font-semibold">{MONTHS[m - 1].slice(0, 3)}</span>
                <span className={`text-[10px] ${on ? 'text-slate-300 dark:text-neutral-600' : 'text-slate-400 dark:text-neutral-500'}`}>{total ? gbp0(total) : '–'}</span>
              </button>
            );
          })}
          <button onClick={() => setCustomOpen(o => !o)} aria-pressed={customOpen || (!activeMonth && !allActive)} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${customOpen || (!activeMonth && !allActive) ? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-slate-500 dark:text-neutral-400'}`}>
            {!activeMonth && !allActive && !customOpen ? periodText : 'Custom'}
          </button>
        </div>
        {customOpen && (
          <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 px-2.5 py-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="flex-1 min-w-0 bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-200" />
            <span className="text-slate-300 text-xs">–</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="flex-1 min-w-0 bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-200" />
            <button onClick={() => { if (customStart && customEnd) { onDateRange({ start: customStart, end: customEnd, label: 'Custom Range' }); setCustomOpen(false); } }} disabled={!customStart || !customEnd} className="px-3 py-1.5 bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-md text-xs font-bold disabled:opacity-40">Go</button>
          </div>
        )}
      </div>

      {/* Tablet and desktop header */}
      <div className="hidden md:flex shrink-0 flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Transactions</h1>
            <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{periodText} · {transactions.length.toLocaleString('en-GB')} {transactions.length === 1 ? 'transaction' : 'transactions'}</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-2.5 md:flex-wrap xl:flex-nowrap">
          <label className="relative md:w-64 xl:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search merchant, category or amount"
              className="w-full h-10 pl-9 pr-3 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-xl text-[13px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            <SegmentedControl
              layoutId="txPeriodPill"
              optionClassName="md:px-3 md:py-1.5 text-xs md:text-[13px] whitespace-nowrap"
              options={[...PRESETS.map(x => ({ id: x.id, label: x.label })), { id: 'Custom Range', label: 'Custom' }]}
              value={customOpen ? 'Custom Range' : dateRange.label}
              onChange={pickPreset}
            />
            <button onClick={() => (selecting ? stopSelecting() : startSelecting())} aria-pressed={selecting} className={`shrink-0 h-10 px-3.5 rounded-xl border text-[13px] font-semibold flex items-center gap-1.5 ${selecting ? 'border-indigo-500 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 hover:bg-slate-50'}`}>
              <ListChecks size={15} /> {selecting ? 'Done' : 'Select'}
            </button>
            <button onClick={onOpenImport} className="shrink-0 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-sm">
              <Upload size={15} /> Import CSV
            </button>
          </div>
          {customOpen && (
            <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 px-2.5 py-1.5">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 dark:text-neutral-200" />
              <span className="text-slate-300 text-xs">–</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 dark:text-neutral-200" />
              <button
                onClick={() => { if (customStart && customEnd) { onDateRange({ start: customStart, end: customEnd, label: 'Custom Range' }); setCustomOpen(false); } }}
                disabled={!customStart || !customEnd}
                className="px-3 py-1 bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-md text-xs font-bold disabled:opacity-40"
              >
                Go
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className={`${card} shrink-0 hidden md:grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.3fr]`}>
        <div className="px-4 md:px-5 py-3 md:py-4 border-r border-b lg:border-b-0 border-slate-100 dark:border-neutral-700">
          <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Spent</div>
          <div className="text-lg md:text-2xl font-bold text-slate-900 dark:text-neutral-100">{gbp0(summary.spent)}</div>
          <div className="text-[11px] md:text-xs text-slate-400 dark:text-neutral-500 truncate">{aed(summary.spentAed)}</div>
        </div>
        <div className="px-4 md:px-5 py-3 md:py-4 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-neutral-700">
          <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Money in</div>
          <div className="text-lg md:text-2xl font-bold text-emerald-700 dark:text-emerald-400">{gbp0(summary.moneyIn)}</div>
          <div className="text-[11px] md:text-xs text-slate-400 dark:text-neutral-500">Net {summary.net < 0 ? '−' : '+'}{gbp0(Math.abs(summary.net))}</div>
        </div>
        <div className="px-4 md:px-5 py-3 md:py-4 border-r border-slate-100 dark:border-neutral-700">
          <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Average payment</div>
          <div className="text-lg md:text-2xl font-bold text-slate-900 dark:text-neutral-100">{gbp(summary.outCount ? summary.spent / summary.outCount : 0)}</div>
          <div className="text-[11px] md:text-xs text-slate-400 dark:text-neutral-500">{summary.outCount.toLocaleString('en-GB')} payments out</div>
        </div>
        <button onClick={onOpenImport} className="px-4 md:px-5 py-3 md:py-4 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-neutral-700/40 rounded-br-2xl lg:rounded-r-2xl">
          <span className={`hidden md:flex w-10 h-10 shrink-0 rounded-xl items-center justify-center ${stalest?.stale ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50' : 'bg-slate-100 text-slate-500 dark:bg-neutral-700'}`}><RotateCcw size={17} /></span>
          <span className="min-w-0">
            <span className="block text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Last import</span>
            {stalest ? (
              <>
                <span className="block text-sm md:text-[15px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{stalest.dateLabel.replace(/ \d{4}$/, '')} · {stalest.name}</span>
                <span className={`block text-[11px] md:text-xs font-semibold ${stalest.stale ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`}>{stalest.agoLabel}{stalest.stale ? ', time to update' : ''}</span>
              </>
            ) : (
              <span className="block text-sm font-semibold text-slate-900 dark:text-neutral-100">Nothing yet</span>
            )}
          </span>
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* List */}
        <section className={`${card} flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden`}>
          <div className="shrink-0 flex items-center gap-2 px-3 md:px-4 py-3 border-b border-slate-100 dark:border-neutral-700 overflow-x-auto hide-scrollbar">
            <SelectPill label="Bank" className="max-md:order-last" value={filterBank} on={filterBank !== 'all'} onChange={onFilterBank}>
              <option value="all">Bank: All</option>
              {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
            </SelectPill>
            <SelectPill label="Money in or out" className="max-md:order-last" value={filterType} on={filterType !== 'all'} onChange={(v) => onFilterType(v as 'all' | 'INCOME' | 'EXPENSE')}>
              <option value="all">Money out & in</option>
              <option value="EXPENSE">Money out</option>
              <option value="INCOME">Money in</option>
            </SelectPill>
            <span className="hidden md:block w-px h-5 bg-slate-200 dark:bg-neutral-700 shrink-0" />
            <button onClick={() => { onFilterCategory('all'); onFilterSubcategory('all'); }} aria-pressed={filterCategory === 'all'} className={`shrink-0 px-3 py-1.5 rounded-full border text-[12.5px] whitespace-nowrap ${filterCategory === 'all' ? pillOn : pillOff}`}>All categories</button>
            {topCats.map(c => {
              const on = filterCategory === c.id;
              return (
                <button key={c.id} onClick={() => { onFilterCategory(on ? 'all' : c.id); onFilterSubcategory('all'); }} aria-pressed={on} className={`shrink-0 px-3 py-1.5 rounded-full border text-[12.5px] whitespace-nowrap ${on ? pillOn : pillOff}`}>
                  {getCategoryEmoji(c.id)} {c.name} <span className={on ? 'opacity-70' : 'text-slate-400'}>{catCounts.get(c.id)}</span>
                </button>
              );
            })}
            {moreCats.length > 0 && (
              <SelectPill label="More categories" value={moreCats.some(c => c.id === filterCategory) ? filterCategory : ''} on={moreCats.some(c => c.id === filterCategory)} onChange={(v) => { onFilterCategory(v || 'all'); onFilterSubcategory('all'); }}>
                <option value="">More…</option>
                {moreCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectPill>
            )}
            {filterSubcategory !== 'all' && filterCategory === 'all' && (
              <button onClick={() => onFilterSubcategory('all')} className={`shrink-0 px-3 py-1.5 rounded-full border text-[12.5px] whitespace-nowrap flex items-center gap-1 ${pillOn}`}>
                {filterSubcategory} <X size={12} />
              </button>
            )}
            <SelectPill label="Added" className="max-md:order-last" value={filterRecentlyAdded === 'uncategorized' ? 'all' : filterRecentlyAdded} on={filterRecentlyAdded === 'today' || filterRecentlyAdded === 'week'} onChange={(v) => onFilterRecentlyAdded(v as 'all' | 'today' | 'week')}>
              <option value="all">Added: any time</option>
              <option value="today">Added today</option>
              <option value="week">Added this week</option>
            </SelectPill>
            <span className="hidden md:block flex-1 min-w-2" />
            {filtersOn && (
              <button onClick={() => { onResetFilters(); setReviewOnly(false); }} className="max-md:order-last shrink-0 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 whitespace-nowrap">Reset</button>
            )}
            {(reviewCount > 0 || reviewOnly) && (
              <button
                onClick={() => setReviewOnly(r => !r)}
                aria-pressed={reviewOnly}
                className={`max-md:order-first shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${reviewOnly ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}
              >
                {reviewCount} to review
              </button>
            )}
            {(mixed.length > 0 || mixedOk > 0) && (
              <button
                onClick={() => setMixedOpen(true)}
                aria-haspopup="dialog"
                title="Merchants filed under more than one category"
                className="max-md:order-first shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
              >
                {mixed.length} mixed
              </button>
            )}
          </div>

          {/* The picked category's subcategories, sliding in under the filters */}
          <AnimatePresence initial={false}>
            {filterCategory !== 'all' && subChips.length > 0 && (() => {
              const catName = categories.find(c => c.id === filterCategory)?.name || '';
              const SUB_COLORS = ['#22C55E', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
              const shownTotal = transactions.filter(t => !isHidden(t)).reduce((a, t) => a + Math.abs(t.amountGBP || 0), 0);
              const allCount = subChips.reduce((a, c) => a + c.count, 0);
              const allTotal = subChips.reduce((a, c) => a + c.total, 0);
              const chips = [{ name: 'all', count: allCount, total: allTotal }, ...subChips];
              return (
                <motion.div
                  key="subs"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="flex items-center gap-1.5 px-3 md:px-4 py-2.5 bg-slate-50 dark:bg-neutral-900/40 border-b border-slate-100 dark:border-neutral-700 overflow-x-auto hide-scrollbar">
                    <span className="shrink-0 mr-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">{catName}</span>
                    {chips.map((c, i) => {
                      const on = c.name === 'all' ? filterSubcategory === 'all' : filterSubcategory === c.name;
                      return (
                        <button
                          key={c.name}
                          onClick={() => onFilterSubcategory(c.name === 'all' || on ? 'all' : c.name)}
                          aria-pressed={on}
                          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12.5px] whitespace-nowrap transition-colors duration-200 ${on ? pillOn : pillOff}`}
                        >
                          {c.name !== 'all' && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: SUB_COLORS[(i - 1) % SUB_COLORS.length] }} />}
                          <span className="capitalize">{c.name === 'all' ? `All ${catName}` : c.name}</span>
                          <span className={`text-[11.5px] ${on ? 'opacity-70' : 'text-slate-400 dark:text-neutral-500'}`}>{c.count} · {gbp0(c.total)}</span>
                        </button>
                      );
                    })}
                    <span className="hidden md:block flex-1 min-w-2" />
                    <span className="hidden md:block shrink-0 text-[12.5px] text-slate-500 dark:text-neutral-400 whitespace-nowrap">
                      {transactions.length} {transactions.length === 1 ? 'payment' : 'payments'} · {gbp0(shownTotal)}
                    </span>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {reviewOnly && (
            <div className="shrink-0 flex flex-col md:flex-row md:items-center gap-2 px-4 py-2.5 bg-amber-50/70 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/50 text-[12.5px] text-amber-900 dark:text-amber-200">
              <span className="flex-1">These aren't categorised yet, or were filed automatically on a recent import. Open one to check it, and tick <strong>Remember</strong> to file that merchant automatically next time.</span>
              <button
                onClick={() => onApplyMemory(list)}
                disabled={applyingMemory}
                className="self-start md:self-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800 font-semibold disabled:opacity-50"
              >
                <Sparkles size={13} /> {applyingMemory ? 'Applying…' : 'Apply memory'}
              </button>
            </div>
          )}

          {/* Header, totals and chips stay put; only the list scrolls (on phones too). */}
          <div data-scroll-root className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {list.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-neutral-200">{reviewOnly ? 'Nothing left to review' : 'No transactions match'}</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">{reviewOnly ? 'Everything in this period has a category.' : 'Try a different period or clear the filters.'}</p>
              </div>
            )}
            {groups.map(g => (
              <div key={g.date}>
                <div className="sticky top-0 z-[1] flex justify-between px-4 md:px-5 py-2 bg-slate-50/95 dark:bg-neutral-900/90 backdrop-blur-sm border-b border-slate-100 dark:border-neutral-700 text-xs font-semibold text-slate-600 dark:text-neutral-300">
                  <span>{dayLabel(g.date)} <span className="font-normal text-slate-400">· {g.rows.length} {g.rows.length === 1 ? 'transaction' : 'transactions'}</span></span>
                  <span>{g.out > 0 ? `−${gbp(g.out)}` : ''}</span>
                </div>
                {g.rows.map(t => {
                  const ticked = selecting && picked.has(t.id);
                  const on = selecting ? ticked : t.id === selectedId;
                  const hidden = isHidden(t);
                  const review = needsReview(t);
                  const income = t.type === 'INCOME';
                  const catText = hidden ? 'Hidden from totals' : t.categoryId ? `${getCategoryEmoji(t.categoryId)} ${t.categoryName}` : 'Not categorised';
                  return (
                    <button
                      key={t.id}
                      data-tx-row={t.id}
                      onClick={(e) => {
                        if (held.current) { held.current = false; return; }
                        if (selecting) togglePick(t.id, e.shiftKey);
                        else setSelectedId(on ? null : t.id);
                      }}
                      onTouchStart={() => holdStart(t.id)}
                      onTouchMove={holdEnd}
                      onTouchEnd={holdEnd}
                      onContextMenu={(e) => { if (holdTimer.current || held.current) e.preventDefault(); }}
                      aria-pressed={on}
                      className={`w-full text-left grid items-center gap-3 md:gap-4 pl-[13px] md:pl-[17px] pr-4 md:pr-5 py-2.5 md:py-2 border-b border-slate-100 dark:border-neutral-700/70 border-l-[3px] transition-colors ${on ? 'border-l-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-neutral-700/30'} ${panelOpen && isLg ? 'grid-cols-[32px_minmax(0,1.3fr)_minmax(0,1fr)_104px]' : 'grid-cols-[36px_minmax(0,1fr)_auto] md:grid-cols-[32px_minmax(0,1.5fr)_minmax(0,1.4fr)_140px]'}`}
                    >
                      {selecting ? (
                        <span className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center">
                          <span className={`w-[22px] h-[22px] rounded-[7px] border-2 flex items-center justify-center transition-colors ${ticked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-neutral-500 bg-white dark:bg-neutral-800'}`}>{ticked && <Check size={14} strokeWidth={3} />}</span>
                        </span>
                      ) : (
                        <span className={`w-9 h-9 md:w-8 md:h-8 rounded-[11px] md:rounded-[10px] flex items-center justify-center text-sm md:text-[13px] font-bold ${hidden ? 'bg-slate-100 text-slate-400 dark:bg-neutral-700' : tintFor(t.description)}`}>{initialOf(t.description)}</span>
                      )}
                      <span className="min-w-0 flex flex-col">
                        <span className={`text-[13.5px] md:text-[13px] font-semibold truncate ${hidden ? 'text-slate-400 dark:text-neutral-500' : 'text-slate-900 dark:text-neutral-100'}`}>{t.description || 'Unknown'}</span>
                        <span className="text-xs md:text-[11.5px] text-slate-400 dark:text-neutral-500 truncate">
                          <span className={`md:hidden ${review ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400'}`}>{catText}{t.subcategoryName && !hidden ? ` · ${t.subcategoryName}` : ''}{review ? ' · check' : ''}</span>
                          <span className="hidden md:inline">{t.bankName || '—'}</span>
                        </span>
                      </span>
                      <span className={`hidden md:flex min-w-0 ${panelOpen && isLg ? 'flex-col items-start gap-0.5' : 'items-center gap-1.5'}`}>
                        <span className={`shrink-0 max-w-full truncate px-2.5 rounded-full ${panelOpen && isLg ? 'py-0.5 text-[11.5px]' : 'py-0.5 text-[12px]'} ${hidden ? 'bg-slate-100 text-slate-500 dark:bg-neutral-700 dark:text-neutral-400' : t.categoryId ? 'bg-slate-100 text-slate-800 dark:bg-neutral-700 dark:text-neutral-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>{catText}</span>
                        {!hidden && t.subcategoryName && <span className={`text-slate-500 dark:text-neutral-400 truncate ${panelOpen && isLg ? 'max-w-full pl-2.5 text-[11px] leading-tight' : 'text-[12px]'}`}>{t.subcategoryName}</span>}
                        {review && t.categoryId && <span title="Filed automatically, check it" className="w-[7px] h-[7px] shrink-0 rounded-full bg-amber-500" />}
                      </span>
                      <span className="flex flex-col items-end">
                        <span className={`text-sm md:text-[13px] font-bold whitespace-nowrap ${hidden ? 'text-slate-400 line-through' : income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{income ? '+' : '−'}{gbp(Math.abs(t.amountGBP || 0))}</span>
                        {t.bankName && <span className="md:hidden text-[11px] text-slate-400 dark:text-neutral-500 whitespace-nowrap">{t.bankName}</span>}
                        {t.amountAED > 0 && <span className="hidden md:inline text-[11px] text-slate-400 dark:text-neutral-500 whitespace-nowrap">{aed(Math.abs(t.amountAED))}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {visible < list.length && (
              <div ref={sentinel} className="py-4 text-center">
                <button onClick={() => setVisible(v => v + PAGE)} className="text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">Show more ({(list.length - visible).toLocaleString('en-GB')} left)</button>
              </div>
            )}
          </div>

          {/* Select mode: what's ticked, select all, and move them all to one category */}
          {selecting && (
            <div className="shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 border-t border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
              <div className="min-w-0 flex-1 flex flex-col md:flex-row md:items-center md:gap-3">
                <span className="text-[13.5px] text-slate-900 dark:text-neutral-100 truncate">
                  {picked.size ? <><strong>{picked.size}</strong> selected <span className="text-slate-500 dark:text-neutral-400">· {gbp(pickedTotal)}</span></> : <span className="text-slate-500 dark:text-neutral-400">{isLg ? 'Click to select · Shift-click for a range' : 'Tap transactions to select'}</span>}
                </span>
                <button onClick={pickAllShown} disabled={!list.length} className="self-start text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-300 disabled:opacity-40 whitespace-nowrap">
                  {allShownPicked ? 'Clear selection' : `Select all ${list.length.toLocaleString('en-GB')}`}
                </button>
              </div>
              <button onClick={() => setBulkOpen(true)} disabled={!picked.size} className="shrink-0 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13.5px] font-semibold disabled:opacity-40">Recategorise</button>
              <button onClick={stopSelecting} aria-label="Stop selecting" className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 dark:border-neutral-600 text-slate-500 flex items-center justify-center"><X size={16} /></button>
            </div>
          )}
        </section>

        {/* Desktop: details docked beside the list */}
        {isLg && selected && (
          <aside aria-label="Transaction details" className={`${card} w-[400px] shrink-0 flex flex-col min-h-0 overflow-hidden animate-in slide-in-from-right-4 fade-in duration-200`}>
            <DetailPanel key={selected.id} t={selected} {...{ allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember }} onToast={setToast} onClose={() => setSelectedId(null)} onPick={setSelectedId} onDone={() => (reviewOnly ? move(1) : undefined)} />
          </aside>
        )}
      </div>

      {/* Phones and tablets: the same details as a bottom sheet */}
      {!isLg && <DetailSheet t={selected} onClose={() => setSelectedId(null)}>
        {selected && <DetailPanel key={selected.id} t={selected} sheet {...{ allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember }} onToast={setToast} onClose={() => setSelectedId(null)} onPick={setSelectedId} onDone={() => (reviewOnly ? move(1) : undefined)} />}
      </DetailSheet>}

      <MixedMerchants
        open={mixedOpen}
        onClose={() => setMixedOpen(false)}
        sheet={!isLg}
        mixed={mixed}
        hiddenCount={mixedOk}
        onMarkOk={markOk}
        onResetOk={resetOk}
        getCategoryEmoji={getCategoryEmoji}
        categories={categories}
        onBulkUpdate={onBulkUpdate}
        onShow={(q) => { setSelectedId(null); onSearch(q); setSearchOpen(true); }}
        onToast={setToast}
      />

      <BulkRecategorise
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        sheet={!isLg}
        txs={pickedTx}
        allTransactions={allTransactions}
        categories={categories}
        getCategoryEmoji={getCategoryEmoji}
        onApply={applyBulk}
      />

      {createPortal(
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="fixed z-[130] left-4 right-4 bottom-24 md:left-auto md:right-6 md:bottom-6 md:w-[360px] flex items-center justify-between gap-3 rounded-2xl bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-3 text-[13.5px] shadow-xl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={MODAL_TRANSITION}
            >
              <span className="truncate">{toast}</span>
              <button onClick={() => setToast(null)} className="shrink-0 font-semibold text-indigo-300 dark:text-indigo-600">OK</button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

// Move every ticked transaction to one category (and subcategory) in one go. A centred pop-up
// on desktop, a bottom sheet on phones.
const BulkRecategorise: React.FC<{
  open: boolean;
  onClose: () => void;
  sheet: boolean;
  txs: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  getCategoryEmoji: (categoryId: string) => string;
  onApply: (cat: Category, sub: string) => void;
}> = ({ open, onClose, sheet, txs, allTransactions, categories, getCategoryEmoji, onApply }) => {
  const [catId, setCatId] = useState('');
  const [sub, setSub] = useState('');
  useEffect(() => { if (open) { setCatId(''); setSub(''); } }, [open]);
  useBackClose(open && !sheet, onClose);
  useEffect(() => {
    if (!open || sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sheet, onClose]);

  // Most of the ticked ones are spending (or money in): offer that kind first.
  const kind = txs.filter(t => t.type === 'INCOME').length > txs.length / 2 ? 'INCOME' : 'EXPENSE';
  const quick = useMemo(() => {
    const used = new Map<string, number>();
    allTransactions.forEach(x => { if (x.categoryId && !isHidden(x)) used.set(x.categoryId, (used.get(x.categoryId) || 0) + 1); });
    return categories.filter(c => used.has(c.id) && c.type === kind).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0)).slice(0, 10);
  }, [allTransactions, categories, kind]);
  const more = categories.filter(c => c.id !== 'excluded' && !quick.some(q => q.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const cat = categories.find(c => c.id === catId);
  const subs = cat?.subcategories || [];
  const pickCat = (id: string) => { const c = categories.find(x => x.id === id); setCatId(id); setSub(c?.subcategories[0] || ''); };

  // Where they are now, e.g. "Subscriptions › General ×5, Work › Software ×2"
  const now = useMemo(() => {
    const m = new Map<string, number>();
    txs.forEach(t => { const k = isHidden(t) ? 'Hidden' : t.categoryId ? `${t.categoryName}${t.subcategoryName ? ` › ${t.subcategoryName}` : ''}` : 'Not categorised'; m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [txs]);
  const total = txs.reduce((s, t) => s + Math.abs(t.amountGBP || 0), 0);
  const n = txs.length;
  const label = 'text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl border-[1.5px] text-[13px] transition-colors ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-semibold dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300 hover:border-slate-300'}`;

  const body = (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`px-5 ${sheet ? 'pt-1' : 'pt-5'} pb-3 flex items-start gap-3 border-b border-slate-100 dark:border-neutral-700`}>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-neutral-100">Move {n} {n === 1 ? 'transaction' : 'transactions'}</h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400">{gbp(total)} in total</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 relative after:absolute after:-inset-1.5 after:content-[''] rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 flex items-center justify-center"><X size={15} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-3">
        <div>
          <span className={label}>Now in</span>
          <p className="mt-0.5 text-[13px] text-slate-700 dark:text-neutral-300">
            {now.slice(0, 4).map(([k, c], i) => <span key={k}>{i > 0 && ', '}{k}{now.length > 1 || c > 1 ? <span className="text-slate-400"> ×{c}</span> : null}</span>)}
            {now.length > 4 && <span className="text-slate-400">, +{now.length - 4} more</span>}
          </p>
        </div>
        <span className={label}>Move to</span>
        <div className="flex flex-wrap gap-1.5 -mt-1.5">
          {quick.map(c => (
            <button key={c.id} onClick={() => pickCat(c.id)} aria-pressed={catId === c.id} className={chip(catId === c.id)}>{getCategoryEmoji(c.id)} {c.name}</button>
          ))}
          {more.length > 0 && (
            <span className="relative">
              <select aria-label="More categories" value={more.some(c => c.id === catId) ? catId : ''} onChange={(e) => e.target.value && pickCat(e.target.value)} className={`appearance-none pr-7 ${chip(more.some(c => c.id === catId))} bg-transparent`}>
                <option value="">More…</option>
                {more.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </span>
          )}
        </div>
        {subs.length > 0 && (
          <>
            <span className={label}>Subcategory</span>
            <div className="flex flex-wrap gap-1.5 -mt-1.5">
              {subs.map(x => <button key={x} onClick={() => setSub(x)} aria-pressed={sub === x} className={`${chip(sub === x)} rounded-full`}>{x}</button>)}
            </div>
          </>
        )}
      </div>
      <div className="shrink-0 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-neutral-700">
        <button onClick={() => cat && onApply(cat, sub)} disabled={!cat} className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold disabled:opacity-40">
          {cat ? `Move ${n} to ${cat.name}${sub ? ` › ${sub}` : ''}` : 'Choose a category'}
        </button>
      </div>
    </div>
  );

  if (sheet) return <Sheet open={open} onClose={onClose} label="Move transactions" zClass="z-[110]">{body}</Sheet>;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Move transactions"
            className="relative w-full max-w-[480px] max-h-[85vh] flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.97, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: 8 }}
            transition={MODAL_TRANSITION}
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

// Phone sheet for a transaction's details. Keeps showing the last transaction while it slides
// away, so the sheet doesn't go blank on the way down.
const DetailSheet: React.FC<{ t: Transaction | null; onClose: () => void; children: React.ReactNode }> = ({ t, onClose, children }) => {
  const last = useRef<{ t: Transaction; children: React.ReactNode } | null>(null);
  if (t) last.current = { t, children };
  return (
    <Sheet open={!!t} onClose={onClose} label={(t || last.current?.t)?.description || 'Transaction'} heightClass="h-[86dvh]">
      {t ? children : last.current?.children}
    </Sheet>
  );
};

interface DetailPanelProps {
  t: Transaction;
  sheet?: boolean;
  allTransactions: Transaction[];
  categories: Category[];
  getCategoryEmoji: (categoryId: string) => string;
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onBulkUpdate: (ids: string[], updates: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
  onRemember: (merchant: string, categoryId: string, categoryName: string, subcategoryName: string) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
  onPick: (id: string) => void;
  onDone: () => void;
}

const QUICK_CATS = 7;

// The category is shown locked until you tap Edit, so a stray tap can't re-file anything, and
// Delete asks first (offering Hide from totals as the gentler option).
const DetailPanel: React.FC<DetailPanelProps> = ({ t, sheet, allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember, onToast, onClose, onPick, onDone }) => {
  const hidden = isHidden(t);
  const startCat = hidden ? '' : t.categoryId;
  const startSub = hidden ? '' : t.subcategoryName || '';
  const [editing, setEditing] = useState(!startCat);
  const [catId, setCatId] = useState(startCat);
  const [sub, setSub] = useState(startSub);
  const [remember, setRemember] = useState(false);
  // Whether Remember also re-files the earlier payments (chosen in the pop-up), and that pop-up.
  const [refileOthers, setRefileOthers] = useState(true);
  const [askRefile, setAskRefile] = useState(false);
  const [saved, setSaved] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [histShown, setHistShown] = useState(10);
  // Renaming this one transaction (the merchant name shown everywhere).
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(t.description || '');
  const saveName = () => {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!name || name === t.description) { setNameDraft(t.description || ''); return; }
    onUpdate(t.id, { description: name });
    onToast(`Renamed to ${name}`);
    buzz();
  };
  useEffect(() => { if (!saved) return; const id = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(id); }, [saved]);

  const cat = categories.find(c => c.id === catId);
  const subs = cat ? Array.from(new Set([...cat.subcategories, ...(sub && !cat.subcategories.includes(sub) ? [sub] : [])])) : [];
  const review = needsReview(t);
  const dirty = catId !== startCat || sub !== startSub;

  // Quick picks: the chosen category, then the ones used most across all transactions.
  const quickCats = useMemo(() => {
    const used = new Map<string, number>();
    allTransactions.forEach(x => { if (x.categoryId && !isHidden(x)) used.set(x.categoryId, (used.get(x.categoryId) || 0) + 1); });
    // Same kind as this transaction (spending vs money in) first; the rest live under More.
    const ranked = categories.filter(c => used.has(c.id) && c.type === t.type).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0));
    const current = categories.find(c => c.id === startCat);
    return Array.from(new Set([...(current ? [current] : []), ...ranked])).slice(0, QUICK_CATS);
  }, [allTransactions, categories, startCat, t.type]);
  const moreCats = categories.filter(c => !quickCats.some(q => q.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));

  const others = useMemo(
    () => allTransactions.filter(x => x.id !== t.id && norm(x.description) === norm(t.description)).sort((a, b) => b.date.localeCompare(a.date)),
    [allTransactions, t.id, t.description]
  );
  // Net spent at this merchant: payments out minus refunds in; hidden ones don't count (as
  // everywhere else). The total is all time, including the open transaction; the list shows the others.
  const netOf = (list: Transaction[]) => list.reduce((s, x) => (isHidden(x) ? s : s + (x.type === 'INCOME' ? -1 : 1) * Math.abs(x.amountGBP || 0)), 0);
  const allTime = [t, ...others];
  // The list under the details: every payment at this merchant, newest first, this one included.
  const history = useMemo(() => [...allTime].sort((a, b) => b.date.localeCompare(a.date)), [t, others]); // eslint-disable-line react-hooks/exhaustive-deps
  const allTotal = netOf(allTime);
  const allRefunds = allTime.filter(x => !isHidden(x) && x.type === 'INCOME').length;
  const allHidden = allTime.filter(isHidden).length;
  // Only the other payments that Remember would actually change (filed somewhere else).
  const toRefile = others.filter(x => !isHidden(x) && (x.categoryId !== catId || (x.subcategoryName || '') !== sub));
  const dt = parse(t.date);
  const income = t.type === 'INCOME';
  const shortName = t.description.length > 22 ? `${t.description.slice(0, 20)}…` : t.description || 'this merchant';

  const pickCat = (id: string) => { const c = categories.find(x => x.id === id); setCatId(id); setSub(c?.subcategories[0] || ''); setSaved(false); };
  const cancelEdit = () => { setCatId(startCat); setSub(startSub); setEditing(false); };
  const showSave = saved || remember || (editing && dirty && !!catId) || (review && !!startCat && !editing);

  const save = () => {
    if (!cat) return;
    const update: Partial<Transaction> = { categoryId: cat.id, categoryName: cat.name, subcategoryName: sub, excluded: false };
    const note = (t.notes || '').replace(AUTO_NOTE, '').trim();
    onUpdate(t.id, note !== (t.notes || '') ? { ...update, notes: note } : update);
    if (remember) {
      if (refileOthers && toRefile.length) onBulkUpdate(toRefile.map(x => x.id), update);
      onRemember(t.description, cat.id, cat.name, sub);
    }
    setRemember(false);
    setEditing(false);
    setSaved(true);
    buzz();
    onDone();
  };
  const setHidden = (hide: boolean) => {
    onUpdate(t.id, hide ? { categoryId: 'excluded', categoryName: 'Excluded', excluded: true } : { categoryId: '', categoryName: '', excluded: false });
    onToast(`${shortName} ${hide ? 'hidden from totals' : 'back in totals'}`);
    if (hide) onClose();
  };

  const label = 'text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl border-[1.5px] text-[13px] transition-colors ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-semibold dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300 hover:border-slate-300'}`;
  const amountText = `${income ? '+' : '−'}${gbp(Math.abs(t.amountGBP || 0))}`;

  // The details and actions stay put; only the list of other payments scrolls underneath.
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 max-h-[65%] overflow-y-auto overscroll-contain">
      <div className={`px-5 ${sheet ? 'pt-1' : 'pt-5'} pb-4 border-b border-slate-100 dark:border-neutral-700 flex flex-col gap-3`}>
        <div className="flex items-center gap-3">
          <span className={`w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center text-xl font-bold ${hidden ? 'bg-slate-100 text-slate-400 dark:bg-neutral-700' : tintFor(t.description)}`}>{initialOf(t.description)}</span>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                    if (e.key === 'Escape') { e.stopPropagation(); setNameDraft(t.description || ''); setRenaming(false); }
                  }}
                  aria-label="Transaction name"
                  className="min-w-0 flex-1 h-9 px-2.5 rounded-lg border-[1.5px] border-indigo-500 bg-white dark:bg-neutral-900 text-[15px] font-semibold text-slate-900 dark:text-neutral-100 outline-none"
                />
                <button onClick={saveName} className="shrink-0 h-9 px-3 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold">Save</button>
                <button onClick={() => { setNameDraft(t.description || ''); setRenaming(false); }} aria-label="Cancel rename" className="shrink-0 w-9 h-9 rounded-lg text-slate-500 flex items-center justify-center"><X size={15} /></button>
              </div>
            ) : (
              <button onClick={() => { setNameDraft(t.description || ''); setRenaming(true); }} title="Rename" className="group text-left">
                <h2 className="inline text-[17px] font-bold leading-snug text-slate-900 dark:text-neutral-100 break-words">{t.description || 'Unknown'}</h2>
                <Pencil size={13} className="inline ml-1.5 -mt-0.5 text-slate-400 group-hover:text-indigo-600" />
              </button>
            )}
            <p className="text-xs text-slate-500 dark:text-neutral-400">{sheet ? DAYS[dt.getDay()] : LONG_DAYS[dt.getDay()]} {dt.getDate()} {sheet ? MONTHS[dt.getMonth()].slice(0, 3) : `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`}{t.bankName ? ` · ${t.bankName}` : ''}</p>
          </div>
          {sheet ? (
            <span className={`shrink-0 text-xl font-bold ${hidden ? 'text-slate-400 line-through' : income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{amountText}</span>
          ) : (
            <button onClick={onClose} aria-label="Close details" className="w-8 h-8 relative after:absolute after:-inset-1.5 after:content-[''] shrink-0 self-start rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center"><X size={15} /></button>
          )}
        </div>
        {!sheet && (
          <div className="flex justify-between items-baseline gap-3">
            <span className={`text-3xl font-bold ${hidden ? 'text-slate-400 line-through' : income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{amountText}</span>
            {t.amountAED > 0 && <span className="text-[13px] text-slate-400">{aed(Math.abs(t.amountAED))}</span>}
          </div>
        )}
        {hidden && <p className="text-xs font-medium text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-700 rounded-lg px-3 py-2">Hidden from totals. Pick a category and Save, or tap “Show in totals”.</p>}
        {!hidden && review && (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
            {t.categoryId ? 'Filed automatically from memory. If it’s right, tap Looks right.' : 'Not categorised yet. Pick a category below.'}
          </p>
        )}
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {!editing ? (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-neutral-700/50 pl-3.5 pr-2.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className={`block ${label}`}>Category</span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-neutral-100 truncate">
                {getCategoryEmoji(startCat)} {t.categoryName}{startSub ? <span className="font-normal text-slate-500 dark:text-neutral-400"> › {startSub}</span> : null}
              </span>
            </span>
            <button onClick={() => { setEditing(true); setSaved(false); }} className="shrink-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">✎ Edit</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/10 p-3">
            <div className="flex justify-between items-center">
              <span className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">{startCat ? 'Change category' : 'Choose a category'}</span>
              {startCat && <button onClick={cancelEdit} className="text-[13px] text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100">Cancel</button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickCats.map(c => (
                <button key={c.id} onClick={() => pickCat(c.id)} aria-pressed={catId === c.id} className={chip(catId === c.id)}>{getCategoryEmoji(c.id)} {c.name}</button>
              ))}
              {moreCats.length > 0 && (
                <span className="relative">
                  <select aria-label="More categories" value={moreCats.some(c => c.id === catId) ? catId : ''} onChange={(e) => e.target.value && pickCat(e.target.value)} className={`appearance-none pr-7 ${chip(moreCats.some(c => c.id === catId))} bg-transparent`}>
                    <option value="">More…</option>
                    {moreCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </span>
              )}
            </div>
            {subs.length > 0 && (
              <>
                <span className={label}>Subcategory</span>
                <div className="flex flex-wrap gap-1.5">
                  {subs.map(x => (
                    <button key={x} onClick={() => { setSub(x); setSaved(false); }} aria-pressed={sub === x} className={`${chip(sub === x)} rounded-full`}>{x}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!!(catId || startCat) && (
          <button onClick={() => { setSaved(false); if (remember) setRemember(false); else if (toRefile.length) setAskRefile(true); else { setRefileOthers(true); setRemember(true); } }} aria-pressed={remember} className="flex items-center gap-3 text-left rounded-2xl bg-slate-50 dark:bg-neutral-700/50 px-3.5 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">Remember for {shortName}</span>
              <span className="block text-xs text-slate-500 dark:text-neutral-400">
                {toRefile.length
                  ? remember && !refileOthers
                    ? `Future payments only · ${toRefile.length} earlier ${toRefile.length === 1 ? 'one' : 'ones'} left as ${toRefile.length === 1 ? 'it is' : 'they are'}`
                    : `Also re-files ${toRefile.length} other ${toRefile.length === 1 ? 'payment' : 'payments'} and future ones`
                  : others.length ? 'Other payments already match · future ones too' : 'Files future payments here automatically'}
              </span>
            </span>
            <span className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors ${remember ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-neutral-600'}`}>
              <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${remember ? 'left-[21px]' : 'left-[3px]'}`} />
            </span>
          </button>
        )}

        {showSave && (
          <button onClick={saved ? undefined : save} disabled={!cat} className={`py-3 rounded-2xl text-white text-[15px] font-semibold disabled:opacity-50 ${saved ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saved ? '✓ Saved' : remember && refileOthers && toRefile.length ? `Save and update ${toRefile.length + 1}` : !editing && review ? 'Looks right' : 'Save'}
          </button>
        )}

        <NoteBox t={t} onSave={onUpdate} />

        <div className="flex justify-center gap-7 pt-0.5 text-[13.5px] font-medium">
          <button onClick={() => setHidden(!hidden)} className="text-slate-600 dark:text-neutral-300 hover:text-slate-900">{hidden ? 'Show in totals' : 'Hide from totals'}</button>
          <button onClick={() => setAskDelete(true)} className="text-rose-700 dark:text-rose-400 hover:text-rose-800">Delete</button>
        </div>
      </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col border-t border-slate-100 dark:border-neutral-700">
        <div className="shrink-0 px-5 pt-3 pb-1 flex justify-between items-baseline gap-2">
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{shortName} payments</h3>
          <span className="shrink-0 text-xs text-slate-500 dark:text-neutral-400">{others.length ? <>All time <strong className="font-semibold text-slate-700 dark:text-neutral-200">{allTime.length} · {gbp(allTotal)}</strong></> : 'First time'}</span>
        </div>
        {others.length > 0 && (allRefunds > 0 || allHidden > 0) && (
          <p className="shrink-0 px-5 pb-1.5 text-[11.5px] text-slate-500 dark:text-neutral-400">
            {[allRefunds > 0 && `${allRefunds} ${allRefunds === 1 ? 'refund' : 'refunds'} taken off`, allHidden > 0 && `${allHidden} hidden not counted`].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
        {history.slice(0, Math.max(histShown, history.findIndex(x => x.id === t.id) + 1)).map(x => {
          const d = parse(x.date);
          const current = x.id === t.id;
          return (
            <button
              key={x.id}
              onClick={() => !current && onPick(x.id)}
              aria-current={current ? 'true' : undefined}
              className={`w-full grid grid-cols-[58px_minmax(0,1fr)_auto] gap-2 items-center py-2 px-2 -mx-2 rounded-lg border-t border-slate-100 dark:border-neutral-700 text-left text-[12.5px] ${current ? 'bg-indigo-50 dark:bg-indigo-950/40 cursor-default' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/30'}`}
            >
              <span className={current ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-neutral-400'}>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}{d.getFullYear() !== new Date().getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ''}</span>
              <span className="truncate text-slate-600 dark:text-neutral-300 flex items-center gap-1.5">
                {current && <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">This one ·</span>}
                <span className="truncate">{isHidden(x) ? 'Hidden' : x.categoryId ? `${getCategoryEmoji(x.categoryId)} ${x.categoryName}${x.subcategoryName ? ` › ${x.subcategoryName}` : ''}` : 'Not categorised'}</span>
                {userNote(x.notes) && <span title="Has a note" className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" />}
              </span>
              <span className={`font-semibold ${current ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-900 dark:text-neutral-100'}`}>{gbp(Math.abs(x.amountGBP || 0))}</span>
            </button>
          );
        })}
        {history.length > Math.max(histShown, history.findIndex(x => x.id === t.id) + 1) && (
          <button onClick={() => setHistShown(n => n + 20)} className="w-full mt-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-slate-50 dark:hover:bg-neutral-700/40">
            {(() => { const shownN = Math.max(histShown, history.findIndex(x => x.id === t.id) + 1); const left = history.length - shownN; return <>Show {Math.min(20, left)} more <span className="font-normal text-slate-500 dark:text-neutral-400">· {left} left</span></>; })()}
          </button>
        )}
        </div>
      </div>

      <RefileDialog
        open={askRefile}
        merchant={t.description || 'this merchant'}
        target={cat ? `${getCategoryEmoji(cat.id)} ${cat.name}${sub ? ` › ${sub}` : ''}` : ''}
        rows={toRefile}
        getCategoryEmoji={getCategoryEmoji}
        onCancel={() => setAskRefile(false)}
        onChoose={(all) => { setRefileOthers(all); setRemember(true); setAskRefile(false); }}
      />

      <DeleteDialog
        open={askDelete}
        t={t}
        amountText={amountText}
        onCancel={() => setAskDelete(false)}
        onDelete={() => { setAskDelete(false); onDelete(t.id); buzz(20); onToast(`${shortName} deleted`); onClose(); }}
        onHide={() => { setAskDelete(false); setHidden(true); }}
        hidden={hidden}
      />
    </div>
  );
};

// Shown before Remember re-files earlier payments: exactly which ones would change, from what to
// what, with the choice to leave them alone and only file future ones.
const RefileDialog: React.FC<{ open: boolean; merchant: string; target: string; rows: Transaction[]; getCategoryEmoji: (id: string) => string; onCancel: () => void; onChoose: (all: boolean) => void }> = ({ open, merchant, target, rows, getCategoryEmoji, onCancel, onChoose }) => {
  useBackClose(open, onCancel);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);
  const n = rows.length;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[120] flex items-center justify-center p-5" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
          <motion.div className="absolute inset-0 bg-slate-900/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={onCancel} />
          <motion.div
            role="dialog"
            aria-label={`Also change ${n} earlier ${n === 1 ? 'payment' : 'payments'}?`}
            className="relative w-full max-w-[400px] max-h-[85dvh] flex flex-col bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={MODAL_TRANSITION}
          >
            <div className="shrink-0 px-5 pt-5 pb-3">
              <h2 className="text-lg font-bold leading-snug text-slate-900 dark:text-neutral-100">Also change {n === 1 ? 'your' : `${n}`} earlier {merchant} {n === 1 ? 'payment' : 'payments'}?</h2>
              <p className="text-[13px] text-slate-600 dark:text-neutral-300 mt-1.5">
                From now on, {merchant} will go under <strong className="text-slate-900 dark:text-neutral-100">{target}</strong>. {n === 1 ? 'This earlier payment is' : 'These earlier payments are'} in a different category:
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5">
              {rows.map(x => {
                const d = parse(x.date);
                return (
                  <div key={x.id} className="py-2.5 border-t border-slate-100 dark:border-neutral-700">
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="min-w-0 truncate text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">{x.description || 'Unknown'}</span>
                      <span className="shrink-0 text-[13.5px] font-bold text-slate-900 dark:text-neutral-100">{x.type === 'INCOME' ? '+' : '−'}{gbp(Math.abs(x.amountGBP || 0))}</span>
                    </div>
                    <div className="text-[11.5px] text-slate-500 dark:text-neutral-400">{DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)} {d.getFullYear()}{x.bankName ? ` · ${x.bankName}` : ''}</div>
                    <div className="mt-2 rounded-xl bg-slate-50 dark:bg-neutral-700/50 px-3 py-2 grid grid-cols-[62px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                      <span className="text-slate-500 dark:text-neutral-400">Now</span>
                      <span className="text-slate-700 dark:text-neutral-300">{x.categoryId ? `${getCategoryEmoji(x.categoryId)} ${x.categoryName}${x.subcategoryName ? ` › ${x.subcategoryName}` : ''}` : 'Not categorised'}</span>
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300">Will be</span>
                      <span className="font-semibold text-indigo-800 dark:text-indigo-200">{target}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 px-5 pt-3 pb-4 flex flex-col gap-2 border-t border-slate-100 dark:border-neutral-700">
              <button onClick={() => onChoose(true)} className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold">Yes, change {n === 1 ? 'it' : `all ${n}`} too</button>
              <button onClick={() => onChoose(false)} className="w-full py-3 rounded-2xl border border-slate-200 dark:border-neutral-600 text-sm font-medium text-slate-900 dark:text-neutral-100">No, just future payments</button>
              <button onClick={onCancel} className="py-1.5 text-sm text-slate-500 dark:text-neutral-400">Cancel</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

const DeleteDialog: React.FC<{ open: boolean; t: Transaction; amountText: string; hidden: boolean; onCancel: () => void; onDelete: () => void; onHide: () => void }> = ({ open, t, amountText, hidden, onCancel, onDelete, onHide }) => {
  useBackClose(open, onCancel);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);
  const dt = parse(t.date);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[120] flex items-center justify-center p-6" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
          <motion.div className="absolute inset-0 bg-slate-900/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={onCancel} />
          <motion.div
            role="alertdialog"
            aria-label="Delete this transaction?"
            className="relative w-full max-w-[360px] bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl px-5 pt-6 pb-4 flex flex-col items-center gap-3 text-center"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={MODAL_TRANSITION}
          >
            <span className="w-[52px] h-[52px] rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center"><Trash2 size={22} /></span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">Delete this transaction?</h2>
            <div className="w-full flex items-center gap-2.5 rounded-2xl bg-slate-50 dark:bg-neutral-700/50 px-3 py-2.5 text-left">
              <span className={`w-[34px] h-[34px] shrink-0 rounded-[10px] flex items-center justify-center text-[13px] font-bold ${tintFor(t.description)}`}>{initialOf(t.description)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{t.description || 'Unknown'}</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-neutral-400">{DAYS[dt.getDay()]} {dt.getDate()} {MONTHS[dt.getMonth()].slice(0, 3)} {dt.getFullYear()}{t.bankName ? ` · ${t.bankName}` : ''}</span>
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-neutral-100">{amountText}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-neutral-300">
              This removes it for good, and it can't be undone.{!hidden && ' If you just want it out of your totals, hide it instead.'}
            </p>
            <button onClick={onDelete} className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-[15px] font-semibold">Delete transaction</button>
            {!hidden && <button onClick={onHide} className="w-full py-3 rounded-2xl border border-slate-200 dark:border-neutral-600 text-sm font-medium text-slate-900 dark:text-neutral-100">Hide from totals instead</button>}
            <button onClick={onCancel} className="py-1.5 text-sm text-slate-500 dark:text-neutral-400">Cancel</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default TransactionsView;
