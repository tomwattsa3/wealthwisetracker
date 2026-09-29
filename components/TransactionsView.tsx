import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Search, Upload, X, LogOut, ChevronDown, Sparkles, RotateCcw } from 'lucide-react';
import { Transaction, Category } from '../types';
import { DateRange } from './DashboardDateFilter';
import SegmentedControl from './SegmentedControl';
import { MODAL_TRANSITION, SHEET_TRANSITION } from '../lib/motion';

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
const needsReview = (t: Transaction) => {
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
  } = p;
  const isLg = useMedia('(min-width: 1024px)');

  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(dateRange.start);
  const [customEnd, setCustomEnd] = useState(dateRange.end);

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
  const stalest = latestByBank[0];

  // ---- Category chips: the four busiest in this period, the rest under "More" ----
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    periodTransactions.forEach(t => { if (t.categoryId && !isHidden(t)) m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1); });
    return m;
  }, [periodTransactions]);
  const topCats = useMemo(
    () => categories.filter(c => catCounts.has(c.id)).sort((a, b) => (catCounts.get(b.id) || 0) - (catCounts.get(a.id) || 0)).slice(0, isLg && selectedId ? 3 : 4),
    [categories, catCounts, isLg, selectedId]
  );
  const moreCats = categories.filter(c => !topCats.some(t => t.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
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

  const SelectPill: React.FC<{ value: string; on: boolean; onChange: (v: string) => void; label: string; children: React.ReactNode }> = ({ value, on, onChange, label, children }) => (
    <span className="relative shrink-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${pill} ${on ? pillOn : pillOff}`}>{children}</select>
      <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${on ? 'text-white dark:text-neutral-900' : 'text-slate-400'}`} />
    </span>
  );

  const panelOpen = !!selected;

  return (
    <div
      data-scroll-root
      className="h-full flex flex-col gap-3 md:gap-4 overflow-y-auto lg:overflow-hidden pb-24 lg:pb-0"
      style={{ fontVariantNumeric: 'tabular-nums' }}
      onDragEnter={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) onOpenImport(); }}
    >
      {/* Header */}
      <div className="shrink-0 flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Transactions</h1>
            <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{periodText} · {transactions.length.toLocaleString('en-GB')} {transactions.length === 1 ? 'transaction' : 'transactions'}</p>
          </div>
          <button onClick={onLogout} title="Log out" className="md:hidden p-2 bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-full text-slate-500"><LogOut size={16} /></button>
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
      <div className={`${card} shrink-0 grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.3fr]`}>
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

      <div className="flex gap-4 lg:flex-1 lg:min-h-0">
        {/* List */}
        <section className={`${card} flex-1 min-w-0 flex flex-col lg:min-h-0 overflow-hidden`}>
          <div className="shrink-0 flex items-center gap-2 px-3 md:px-4 py-3 border-b border-slate-100 dark:border-neutral-700 overflow-x-auto hide-scrollbar">
            <SelectPill label="Bank" value={filterBank} on={filterBank !== 'all'} onChange={onFilterBank}>
              <option value="all">Bank: All</option>
              {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
            </SelectPill>
            <SelectPill label="Money in or out" value={filterType} on={filterType !== 'all'} onChange={(v) => onFilterType(v as 'all' | 'INCOME' | 'EXPENSE')}>
              <option value="all">Money out & in</option>
              <option value="EXPENSE">Money out</option>
              <option value="INCOME">Money in</option>
            </SelectPill>
            <span className="w-px h-5 bg-slate-200 dark:bg-neutral-700 shrink-0" />
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
            {filterSubcategory !== 'all' && (
              <button onClick={() => onFilterSubcategory('all')} className={`shrink-0 px-3 py-1.5 rounded-full border text-[12.5px] whitespace-nowrap flex items-center gap-1 ${pillOn}`}>
                {filterSubcategory} <X size={12} />
              </button>
            )}
            <SelectPill label="Added" value={filterRecentlyAdded === 'uncategorized' ? 'all' : filterRecentlyAdded} on={filterRecentlyAdded === 'today' || filterRecentlyAdded === 'week'} onChange={(v) => onFilterRecentlyAdded(v as 'all' | 'today' | 'week')}>
              <option value="all">Added: any time</option>
              <option value="today">Added today</option>
              <option value="week">Added this week</option>
            </SelectPill>
            <span className="flex-1 min-w-2" />
            {filtersOn && (
              <button onClick={() => { onResetFilters(); setReviewOnly(false); }} className="shrink-0 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 whitespace-nowrap">Reset</button>
            )}
            {(reviewCount > 0 || reviewOnly) && (
              <button
                onClick={() => setReviewOnly(r => !r)}
                aria-pressed={reviewOnly}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${reviewOnly ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}
              >
                {reviewCount} to review
              </button>
            )}
          </div>

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

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
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
                  const on = t.id === selectedId;
                  const hidden = isHidden(t);
                  const review = needsReview(t);
                  const income = t.type === 'INCOME';
                  const catText = hidden ? 'Hidden from totals' : t.categoryId ? `${getCategoryEmoji(t.categoryId)} ${t.categoryName}` : 'Not categorised';
                  return (
                    <button
                      key={t.id}
                      data-tx-row={t.id}
                      onClick={() => setSelectedId(on ? null : t.id)}
                      aria-pressed={on}
                      className={`w-full text-left grid items-center gap-3 md:gap-4 pl-[13px] md:pl-[17px] pr-4 md:pr-5 py-2.5 border-b border-slate-100 dark:border-neutral-700/70 border-l-[3px] transition-colors ${on ? 'border-l-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-neutral-700/30'} ${panelOpen && isLg ? 'grid-cols-[36px_minmax(0,1.3fr)_minmax(0,1fr)_110px]' : 'grid-cols-[36px_minmax(0,1fr)_auto] md:grid-cols-[36px_minmax(0,1.5fr)_minmax(0,1.4fr)_150px]'}`}
                    >
                      <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center text-sm font-bold ${hidden ? 'bg-slate-100 text-slate-400 dark:bg-neutral-700' : tintFor(t.description)}`}>{initialOf(t.description)}</span>
                      <span className="min-w-0 flex flex-col">
                        <span className={`text-[13.5px] md:text-sm font-semibold truncate ${hidden ? 'text-slate-400 dark:text-neutral-500' : 'text-slate-900 dark:text-neutral-100'}`}>{t.description || 'Unknown'}</span>
                        <span className="text-xs text-slate-400 dark:text-neutral-500 truncate">
                          <span className="md:hidden">{catText}{t.subcategoryName && !hidden ? ` · ${t.subcategoryName}` : ''}{review ? ' · check' : ''}</span>
                          <span className="hidden md:inline">{t.bankName || '—'}</span>
                        </span>
                      </span>
                      <span className="hidden md:flex items-center gap-1.5 min-w-0">
                        <span className={`shrink-0 max-w-full truncate px-2.5 py-1 rounded-full text-[12.5px] ${hidden ? 'bg-slate-100 text-slate-500 dark:bg-neutral-700 dark:text-neutral-400' : t.categoryId ? 'bg-slate-100 text-slate-800 dark:bg-neutral-700 dark:text-neutral-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>{catText}</span>
                        {!(panelOpen && isLg) && !hidden && t.subcategoryName && <span className="text-[12.5px] text-slate-500 dark:text-neutral-400 truncate">{t.subcategoryName}</span>}
                        {review && t.categoryId && <span title="Filed automatically, check it" className="w-[7px] h-[7px] shrink-0 rounded-full bg-amber-500" />}
                      </span>
                      <span className="flex flex-col items-end">
                        <span className={`text-sm font-bold whitespace-nowrap ${hidden ? 'text-slate-400 line-through' : income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{income ? '+' : '−'}{gbp(Math.abs(t.amountGBP || 0))}</span>
                        {t.amountAED > 0 && <span className="text-[11.5px] text-slate-400 dark:text-neutral-500 whitespace-nowrap">{aed(Math.abs(t.amountAED))}</span>}
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
        </section>

        {/* Desktop: details docked beside the list */}
        {isLg && selected && (
          <aside aria-label="Transaction details" className={`${card} w-[400px] shrink-0 flex flex-col min-h-0 overflow-hidden animate-in slide-in-from-right-4 fade-in duration-200`}>
            <DetailPanel key={selected.id} t={selected} {...{ allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember }} onClose={() => setSelectedId(null)} onPick={setSelectedId} onDone={() => (reviewOnly ? move(1) : undefined)} />
          </aside>
        )}
      </div>

      {/* Phones and tablets: the same details as a bottom sheet */}
      {!isLg && <DetailSheet t={selected} onClose={() => setSelectedId(null)}>
        {selected && <DetailPanel key={selected.id} t={selected} sheet {...{ allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember }} onClose={() => setSelectedId(null)} onPick={setSelectedId} onDone={() => (reviewOnly ? move(1) : setSelectedId(null))} />}
      </DetailSheet>}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const DetailSheet: React.FC<{ t: Transaction | null; onClose: () => void; children: React.ReactNode }> = ({ t, onClose, children }) => {
  const drag = useDragControls();
  return createPortal(
    <AnimatePresence>
      {t && (
        <motion.div className="fixed inset-0 z-[100]" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
          <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={t.description}
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] bg-white dark:bg-neutral-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET_TRANSITION}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 600) onClose(); }}
          >
            <div onPointerDown={(e) => drag.start(e)} className="shrink-0 flex justify-center pt-2.5 pb-1 touch-none cursor-grab">
              <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-neutral-600" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
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
  onClose: () => void;
  onPick: (id: string) => void;
  onDone: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ t, sheet, allTransactions, categories, getCategoryEmoji, onUpdate, onBulkUpdate, onDelete, onRemember, onClose, onPick, onDone }) => {
  const hidden = isHidden(t);
  const [catId, setCatId] = useState(hidden ? '' : t.categoryId);
  const [sub, setSub] = useState(hidden ? '' : t.subcategoryName || '');
  const [remember, setRemember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cat = categories.find(c => c.id === catId);
  const subs = cat ? Array.from(new Set([...cat.subcategories, ...(sub && !cat.subcategories.includes(sub) ? [sub] : [])])) : [];
  const review = needsReview(t);
  const dirty = catId !== (hidden ? '' : t.categoryId) || sub !== (hidden ? '' : t.subcategoryName || '');

  const others = useMemo(
    () => allTransactions.filter(x => x.id !== t.id && norm(x.description) === norm(t.description)).sort((a, b) => b.date.localeCompare(a.date)),
    [allTransactions, t.id, t.description]
  );
  const othersTotal = others.reduce((s, x) => s + Math.abs(x.amountGBP || 0), 0);
  const dt = parse(t.date);
  const income = t.type === 'INCOME';
  const shortName = t.description.length > 24 ? `${t.description.slice(0, 22)}…` : t.description || 'this merchant';
  const canSave = !!catId && (dirty || remember || review);

  const save = () => {
    if (!cat) return;
    const update: Partial<Transaction> = { categoryId: cat.id, categoryName: cat.name, subcategoryName: sub, excluded: false };
    const note = (t.notes || '').replace(AUTO_NOTE, '').trim();
    onUpdate(t.id, note !== (t.notes || '') ? { ...update, notes: note } : update);
    if (remember) {
      const ids = others.filter(x => !isHidden(x) && (x.categoryId !== cat.id || (x.subcategoryName || '') !== sub)).map(x => x.id);
      if (ids.length) onBulkUpdate(ids, update);
      onRemember(t.description, cat.id, cat.name, sub);
    }
    onDone();
  };
  const toggleHidden = () => onUpdate(t.id, hidden ? { categoryId: '', categoryName: '', excluded: false } : { categoryId: 'excluded', categoryName: 'Excluded', excluded: true });

  const label = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-1.5';
  const selectCls = 'w-full appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[13px] text-slate-900 dark:text-neutral-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className={`px-5 ${sheet ? 'pt-1' : 'pt-5'} pb-4 border-b border-slate-100 dark:border-neutral-700 flex flex-col gap-3`}>
        <div className="flex items-start gap-3">
          <span className={`w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center text-xl font-bold ${hidden ? 'bg-slate-100 text-slate-400 dark:bg-neutral-700' : tintFor(t.description)}`}>{initialOf(t.description)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug text-slate-900 dark:text-neutral-100 break-words">{t.description || 'Unknown'}</h2>
            <p className="text-[12.5px] text-slate-500 dark:text-neutral-400">{LONG_DAYS[dt.getDay()]} {dt.getDate()} {MONTHS[dt.getMonth()]} {dt.getFullYear()}{t.bankName ? ` · ${t.bankName}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close details" className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center"><X size={15} /></button>
        </div>
        <div className="flex justify-between items-baseline gap-3">
          <span className={`text-3xl font-bold ${hidden ? 'text-slate-400 line-through' : income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{income ? '+' : '−'}{gbp(Math.abs(t.amountGBP || 0))}</span>
          {t.amountAED > 0 && <span className="text-[13px] text-slate-400">{aed(Math.abs(t.amountAED))}</span>}
        </div>
        {hidden && <p className="text-xs font-medium text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-700 rounded-lg px-3 py-2">Hidden from totals. Pick a category and Save, or tap “Show in totals”.</p>}
        {!hidden && review && (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
            {t.categoryId ? 'Filed automatically from memory. Check it’s right, then Save.' : 'Not categorised yet. Pick a category below.'}
          </p>
        )}
        {t.notes && t.notes.replace(AUTO_NOTE, '').trim() && <p className="text-xs text-slate-500 dark:text-neutral-400">Note: {t.notes.replace(AUTO_NOTE, '').trim()}</p>}
      </div>

      <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="min-w-0">
            <div className={label}>Category</div>
            <span className="relative block">
              <select value={catId} onChange={(e) => { const c = categories.find(x => x.id === e.target.value); setCatId(e.target.value); setSub(c?.subcategories[0] || ''); }} className={selectCls}>
                <option value="" disabled>Choose…</option>
                <optgroup label="Spending">
                  {categories.filter(c => c.type === 'EXPENSE').map(c => <option key={c.id} value={c.id}>{getCategoryEmoji(c.id)} {c.name}</option>)}
                </optgroup>
                <optgroup label="Money in">
                  {categories.filter(c => c.type === 'INCOME').map(c => <option key={c.id} value={c.id}>{getCategoryEmoji(c.id)} {c.name}</option>)}
                </optgroup>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </span>
          </label>
          <label className="min-w-0">
            <div className={label}>Subcategory</div>
            <span className="relative block">
              <select value={sub} onChange={(e) => setSub(e.target.value)} disabled={!cat} className={`${selectCls} disabled:opacity-50`}>
                {subs.length === 0 && <option value="">None</option>}
                {subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </span>
          </label>
        </div>

        <button
          onClick={() => setRemember(r => !r)}
          aria-pressed={remember}
          className={`flex gap-3 items-start text-left rounded-xl border px-3 py-2.5 transition-colors ${remember ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-neutral-600'}`}
        >
          <span className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-[5px] border-2 flex items-center justify-center ${remember ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-neutral-500'}`}>
            {remember && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-slate-900 dark:text-neutral-100">Remember for {shortName}</span>
            <span className="block text-xs text-slate-500 dark:text-neutral-400">
              {others.length ? `Also re-file the ${others.length} other ${others.length === 1 ? 'payment' : 'payments'} and any future ones` : 'File future payments here automatically'}
            </span>
          </span>
        </button>

        <div className="flex gap-2">
          <button onClick={save} disabled={!canSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold disabled:bg-indigo-200 dark:disabled:bg-indigo-900/60 disabled:cursor-not-allowed">
            {remember && others.length ? `Save and update ${others.length + 1}` : !dirty && review && !remember ? 'Looks right' : 'Save'}
          </button>
          <button onClick={toggleHidden} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] text-slate-700 dark:text-neutral-300 whitespace-nowrap">
            {hidden ? 'Show in totals' : 'Hide from totals'}
          </button>
          <button
            onClick={() => { if (confirmDelete) { onDelete(t.id); onClose(); } else setConfirmDelete(true); }}
            onBlur={() => setConfirmDelete(false)}
            className={`px-3 py-2.5 rounded-xl border text-[13px] whitespace-nowrap ${confirmDelete ? 'bg-rose-600 border-rose-600 text-white font-semibold' : 'border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400'}`}
          >
            {confirmDelete ? 'Confirm' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex justify-between items-baseline gap-2 mb-1">
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100 truncate">Other {shortName} payments</h3>
          <span className="shrink-0 text-xs text-slate-500 dark:text-neutral-400">{others.length ? `${others.length} · ${gbp0(othersTotal)} total` : 'First time'}</span>
        </div>
        {others.slice(0, 10).map(x => {
          const d = parse(x.date);
          return (
            <button key={x.id} onClick={() => onPick(x.id)} className="w-full grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2 items-center py-2 border-t border-slate-100 dark:border-neutral-700 text-left text-[12.5px] hover:bg-slate-50 dark:hover:bg-neutral-700/30">
              <span className="text-slate-500 dark:text-neutral-400">{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}{d.getFullYear() !== new Date().getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ''}</span>
              <span className="truncate text-slate-600 dark:text-neutral-300">{isHidden(x) ? 'Hidden' : x.categoryId ? `${getCategoryEmoji(x.categoryId)} ${x.categoryName}${x.subcategoryName ? ` › ${x.subcategoryName}` : ''}` : 'Not categorised'}</span>
              <span className="font-semibold text-slate-900 dark:text-neutral-100">{gbp(Math.abs(x.amountGBP || 0))}</span>
            </button>
          );
        })}
        {others.length > 10 && <p className="pt-2 text-xs text-slate-400">and {others.length - 10} more</p>}
      </div>
    </div>
  );
};

export default TransactionsView;
