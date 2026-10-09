import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { Transaction } from '../types';
import { usePrivacy } from '../lib/privacy';
import BlurStrengthSlider from './BlurStrengthSlider';
import CategorySheets from './CategorySheets';
import InstallCard from './InstallCard';
import PlaceSheet, { PlacePick } from './PlaceSheet';
import { useBackClose } from '../lib/backStack';
import Sheet from './Sheet';
import { supabase } from '../supabaseClient';
import { MONTHS, FULL_MONTHS, monthKey, keyToIndex, indexToKey, daysIn, localToday, merchantKey, sum } from '../lib/periods';

// The phone Home screen: one month at a time, fitting on a single screen. How much went out vs
// your usual month, money in and net, six month bars to jump between, and the top categories
// with their share of the month, then the places you went most (or spent most at). A Month / YTD
// switch shows the same cards for the whole year so far.
// The full Dashboard (SpendingPatterns) stays on tablet and desktop.

interface MobileHomeProps {
  transactions: Transaction[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
  // Opens Breakdown on these months ('YYYY-MM', inclusive).
  onOpenBreakdown?: (startMonth: string, endMonth: string) => void;
  onViewTransactions?: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
  onImport?: () => void;
  // Opens the Income page (every payer, the year by month, where it lands).
  onOpenIncome?: () => void;
}

const TOP_N = 6;
const TOP_PLACES = 5;
// Initial-badge tints for the Top places rows, in rank order.
const TINTS = [
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
];

interface Place { key: string; name: string; total: number; count: number; cats: Map<string, { id: string; amount: number }> }

// Rows of a list arriving one after another after a month change.
const Stagger: React.FC<{ i: number; children: React.ReactNode }> = ({ i, children }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </motion.div>
);

// A money figure that glides from its old value to the new one instead of jumping.
// Text that changes with a soft fade and slide: the old value drifts up and fades out while the
// new one rises in from below, in about a quarter of a second. Only opacity and position move
// (no blur), which phones can animate without redrawing the page.
const Swap: React.FC<{ text: string }> = ({ text }) => (
  <span className="relative inline-grid align-baseline">
    <AnimatePresence initial={false}>
      <motion.span
        key={text}
        style={{ gridArea: '1 / 1', willChange: 'transform, opacity' }}
        className="whitespace-nowrap"
        initial={{ opacity: 0, y: '0.35em' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '-0.35em' }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  </span>
);

// A money figure that swaps smoothly when it changes.
const Glide: React.FC<{ value: number; format: (v: number) => string }> = ({ value, format }) => <Swap text={format(value)} />;

const MobileHome: React.FC<MobileHomeProps> = ({ transactions, currency, getCategoryEmoji, onOpenBreakdown, onViewTransactions, onImport, onOpenIncome }) => {
  const amt = (t: Transaction) => Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0;
  const valid = (t: Transaction) => !t.excluded && /^\d{4}-\d{2}-\d{2}/.test(t.date);

  // Categories switched off on Home (a saved view or your own pick); remembered on this phone.
  const [homeOff, setHomeOff] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('homeCatsOff') || '[]')); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem('homeCatsOff', JSON.stringify(Array.from(homeOff))); } catch { /* not saved */ } }, [homeOff]);

  // Same rule as the Dashboard: spending = every money-out row that isn't excluded.
  const { outByMonth, inByMonth, catByMonth, catAllByMonth, catInfo, placesByMonth, firstIdx, lastIdx } = useMemo(() => {
    const outByMonth = new Map<number, number>();
    const inByMonth = new Map<number, number>();
    const catByMonth = new Map<string, Map<number, number>>();
    // Every category, whether or not it's switched off (for the picker)
    const catAllByMonth = new Map<string, Map<number, number>>();
    const catInfo = new Map<string, { name: string; id: string }>();
    // month -> merchant -> totals, grouped the same way the Dashboard groups merchants
    const placesByMonth = new Map<number, Map<string, Place>>();
    let firstIdx = Infinity, lastIdx = -Infinity;
    transactions.forEach(t => {
      if (!valid(t)) return;
      const a = amt(t);
      if (!a) return;
      const idx = keyToIndex(monthKey(t.date));
      if (t.type === 'EXPENSE' && t.categoryName) {
        const name = t.categoryName.trim().replace(/Fee's/i, 'Fees');
        if (!catInfo.has(name)) catInfo.set(name, { name, id: t.categoryId });
        const all = catAllByMonth.get(name) || new Map<number, number>();
        all.set(idx, (all.get(idx) || 0) + a);
        catAllByMonth.set(name, all);
        firstIdx = Math.min(firstIdx, idx);
        lastIdx = Math.max(lastIdx, idx);
        if (homeOff.has(name)) return;
        outByMonth.set(idx, (outByMonth.get(idx) || 0) + a);
        const m = catByMonth.get(name) || new Map<number, number>();
        m.set(idx, (m.get(idx) || 0) + a);
        catByMonth.set(name, m);
        const desc = (t.description || 'Unknown').trim();
        const key = merchantKey(desc) || desc.toLowerCase();
        const pm = placesByMonth.get(idx) || new Map<string, Place>();
        const pl = pm.get(key) || { key, name: desc, total: 0, count: 0, cats: new Map() };
        pl.total += a;
        pl.count += 1;
        const pc = pl.cats.get(name) || { id: t.categoryId, amount: 0 };
        pc.amount += a;
        pl.cats.set(name, pc);
        pm.set(key, pl);
        placesByMonth.set(idx, pm);
      } else if (t.type === 'INCOME' && (t.categoryName || '').trim().toLowerCase() !== 'excluded') {
        inByMonth.set(idx, (inByMonth.get(idx) || 0) + a);
      }
    });
    return { outByMonth, inByMonth, catByMonth, catAllByMonth, catInfo, placesByMonth, firstIdx, lastIdx };
  }, [transactions, currency, homeOff]);

  // Your saved views come from your account (the same ones as the desktop Dashboard).
  const [views, setViews] = useState<{ name: string; cats: string[] }[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata || {};
      const list = meta.dashboardPrefs?.views ?? meta.dashboardViews;
      if (Array.isArray(list)) setViews(list.filter((v: any) => v && typeof v.name === 'string' && Array.isArray(v.cats)));
    });
  }, []);
  const [catSheet, setCatSheet] = useState(false);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState('');

  const hasData = Number.isFinite(lastIdx);
  const [picked, setPicked] = useState<number | null>(null);
  const [placeRank, setPlaceRank] = useState<'visits' | 'spent'>('visits');
  const [mode, setMode] = useState<'month' | 'ytd'>('month');
  // Tapping a month opens it; tapping the month that's already open goes back to the year.
  const toggleMonth = (i: number) => {
    if (mode === 'month' && i === (picked ?? lastIdx)) { setMode('ytd'); return; }
    setPicked(i);
    setMode('month');
  };
  const [hideAmounts, toggleHideAmounts] = usePrivacy();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  useBackClose(privacyOpen, () => setPrivacyOpen(false));
  const [showAllCats, setShowAllCats] = useState(false);
  // The category tapped in "Where it went", shown in the same panel as Sheets' See all.
  const [catPanel, setCatPanel] = useState<{ cat: string; year: number; month: number | null; n: number } | null>(null);
  // Extra places opened under the top five, ten at a time.
  const [extraPlaces, setExtraPlaces] = useState(0);
  // The place tapped in Top places, shown in its own slide-up sheet.
  const [placePick, setPlacePick] = useState<PlacePick | null>(null);
  const sel = picked ?? (hasData ? lastIdx : keyToIndex(monthKey(localToday())));
  useEffect(() => setExtraPlaces(0), [sel, mode, placeRank]);
  // Money in: every payment in (same rule as the totals above), its type, and who it came from.
  const incomeRows = useMemo(() => transactions
    .filter(t => t.type === 'INCOME' && valid(t) && (t.categoryName || '').trim().toLowerCase() !== 'excluded' && amt(t) > 0)
    .map(t => {
      const desc = (t.description || 'Unknown').trim();
      return { idx: keyToIndex(monthKey(t.date)), desc, key: merchantKey(desc) || desc.toLowerCase(), type: (t.subcategoryName || '').trim() || (t.categoryName || '').trim() || 'Other', amount: amt(t) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, currency]);
  const [inType, setInType] = useState('all');
  // The rest of the sources, opened under the first four (closes on a new month or type).
  const [moreSources, setMoreSources] = useState(false);
  useEffect(() => setMoreSources(false), [sel, mode, inType]);

  const fmt = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + Math.round(v).toLocaleString('en-GB');

  if (!hasData) {
    return (
      <div className="pb-24 pt-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">Home</h1>
        <p className="mt-6 text-sm text-slate-500 dark:text-neutral-400 text-center">No spending imported yet. Add statements on the Transactions tab.</p>
      </div>
    );
  }

  const ytd = mode === 'ytd';
  const year = Math.floor(sel / 12);
  // The months being summed: just the picked month, or every imported month of its year so far.
  const idxs = ytd
    ? Array.from({ length: 12 }, (_, i) => year * 12 + i).filter(i => i >= firstIdx && i <= lastIdx)
    : [sel];
  const sumOver = (m: Map<number, number> | undefined, list: number[]) => list.reduce((s, i) => s + (m?.get(i) || 0), 0);
  const out = sumOver(outByMonth, idxs);
  const inc = sumOver(inByMonth, idxs);
  const net = inc - out;

  // Month: vs the monthly average of that year so far (January up to your latest import).
  // YTD: vs the same months last year, when those were imported too.
  const usualMonths = Array.from({ length: 12 }, (_, i) => sel - (sel % 12) + i).filter(i => i <= lastIdx && (outByMonth.get(i) || 0) > 0);
  const prevYearIdxs = idxs.map(i => i - 12);
  const hasPrevYear = ytd && prevYearIdxs.every(i => i >= firstIdx);
  const usual = ytd
    ? (hasPrevYear ? sumOver(outByMonth, prevYearIdxs) : 0)
    : usualMonths.length > 1 ? usualMonths.reduce((s, i) => s + (outByMonth.get(i) || 0), 0) / usualMonths.length : 0;
  const diff = usual ? (out - usual) / usual : 0;
  const near = Math.abs(diff) < 0.05;
  const partialYear = ytd && idxs.length > 0 && idxs[idxs.length - 1] % 12 !== 11;
  const compareLine = ytd
    ? !usual
      ? `Avg ${fmt(out / Math.max(idxs.length, 1))} a month`
      : near
        ? 'About the same as last year'
        : `${diff > 0 ? '↑' : '↓'} ${fmt(Math.abs(out - usual))} vs ${partialYear ? 'this point ' : ''}last year (${fmt(usual)})`
    : !usual ? 'First month of the year' : near ? 'About your average month' : `${diff > 0 ? '↑' : '↓'} ${fmt(Math.abs(out - usual))}`;
  const compareTone = !usual || near ? 'text-slate-500 dark:text-neutral-400' : diff > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400';

  // Month: six bars ending at the latest month, sliding back when you step further than that.
  // YTD: one bar per month of the year; tapping one opens that month.
  const barEnd = Math.max(sel, Math.min(lastIdx, sel + 5));
  const barIdxs = ytd ? idxs : Array.from({ length: 6 }, (_, i) => barEnd - 5 + i);
  const barMax = Math.max(...barIdxs.map(i => outByMonth.get(i) || 0), 1);

  const cats = Array.from(catByMonth.entries())
    .map(([name, m]) => ({ name, id: catInfo.get(name)!.id, v: sumOver(m, idxs) }))
    .filter(c => c.v > 0)
    .sort((a, b) => b.v - a.v);
  const top = cats.slice(0, TOP_N);
  const rest = cats.slice(TOP_N);
  const catMax = top.length ? top[0].v : 1;
  const catRow = (c: { name: string; id: string; v: number }) => (
          <button
            key={c.name}
            onClick={() => setCatPanel({ cat: c.name, year, month: ytd ? null : sel, n: Date.now() })}
            className="w-full grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2.5 items-center py-2 border-t border-slate-100 dark:border-neutral-700 text-left"
          >
            <span className="w-[30px] h-[30px] rounded-[9px] bg-slate-100 dark:bg-neutral-700 flex items-center justify-center text-[15px]">
              {(getCategoryEmoji && c.id && getCategoryEmoji(c.id)) || '•'}
            </span>
            <span className="min-w-0 flex flex-col gap-1">
              <span className="flex justify-between gap-2">
                <span className="text-[13.5px] font-medium text-slate-900 dark:text-neutral-100 truncate">{c.name}</span>
                <span className="text-[13.5px] font-bold text-slate-900 dark:text-neutral-100"><Swap text={fmt(c.v)} /></span>
              </span>
              <span className="block h-1 rounded bg-slate-100 dark:bg-neutral-700">
                <span className="block h-1 rounded bg-indigo-500 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${(c.v / catMax) * 100}%` }} />
              </span>
            </span>
            <span className="min-w-[40px] text-right text-[12px] font-semibold text-slate-500 dark:text-neutral-400">
              {out ? <Swap text={`${Math.round((c.v / out) * 100)}%`} /> : ''}
            </span>
          </button>
  );

  // Merge each month's places across the selected months.
  const merged = new Map<string, Place>();
  idxs.forEach(i => placesByMonth.get(i)?.forEach((p, key) => {
    const m = merged.get(key) || { key, name: p.name, total: 0, count: 0, cats: new Map() };
    m.total += p.total;
    m.count += p.count;
    p.cats.forEach((c, name) => {
      const mc = m.cats.get(name) || { id: c.id, amount: 0 };
      mc.amount += c.amount;
      m.cats.set(name, mc);
    });
    merged.set(key, m);
  }));
  const monthPlaces = Array.from(merged.values());
  // Most visits breaks ties by money, so a 4× utility bill still ranks above 4 coffees.
  const allPlaces = [...monthPlaces]
    .sort((a, b) => (placeRank === 'visits' ? b.count - a.count || b.total - a.total : b.total - a.total))
    .map(p => {
      const [catName, cat] = Array.from(p.cats.entries()).sort((a, b) => b[1].amount - a[1].amount)[0];
      return { ...p, catName, catId: cat.id };
    });
  const places = allPlaces.slice(0, TOP_PLACES);
  const PLACES_STEP = 10;
  const restPlaces = allPlaces.slice(TOP_PLACES);
  const placesLeft = Math.max(0, restPlaces.length - extraPlaces);
  const placeChunks = Array.from({ length: Math.ceil(Math.min(extraPlaces, restPlaces.length) / PLACES_STEP) }, (_, c) =>
    restPlaces.slice(c * PLACES_STEP, (c + 1) * PLACES_STEP));
  const placeRow = (p: typeof allPlaces[number], i: number) => (
    <button
      key={p.key}
      onClick={() => setPlacePick({ key: p.key, name: p.name, catName: p.catName, catId: p.catId, tint: TINTS[i % TINTS.length], year, month: ytd ? null : sel })}
      className="w-full text-left grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2.5 items-center py-2 border-t border-slate-100 dark:border-neutral-700 active:bg-slate-50 dark:active:bg-neutral-700/40"
    >
      <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[13px] font-bold ${TINTS[i % TINTS.length]}`}>
        {p.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}
      </span>
      <span className="min-w-0 flex flex-col">
        <span className="text-[13.5px] font-medium text-slate-900 dark:text-neutral-100 truncate">{p.name}</span>
        <span className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
          {(getCategoryEmoji && p.catId && getCategoryEmoji(p.catId)) || ''} {p.catName}{p.count > 1 ? ` · avg ${fmt(p.total / p.count)}` : ''}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-[13.5px] font-bold text-slate-900 dark:text-neutral-100">{fmt(p.total)}</span>
        <span className="text-[10.5px] font-semibold text-slate-500 dark:text-neutral-400">{p.count === 1 ? 'once' : `${p.count}×`}</span>
      </span>
    </button>
  );

  const firstSel = idxs[0] ?? sel;
  const lastSel = idxs[idxs.length - 1] ?? sel;
  const start = `${indexToKey(firstSel)}-01`;
  const end = `${indexToKey(lastSel)}-${String(daysIn(lastSel)).padStart(2, '0')}`;
  const periodShort = ytd ? String(year) : MONTHS[sel % 12];
  const canPrev = ytd ? year * 12 > firstIdx : sel > firstIdx;
  const canNext = ytd ? year * 12 + 11 < lastIdx : sel < lastIdx;
  const step = (dir: -1 | 1) => setPicked(ytd ? Math.min(lastIdx, Math.max(firstIdx, sel + dir * 12)) : sel + dir);

  // ---- Month by month (money in vs out for every month of the selected year) ----
  const todayIdx = keyToIndex(monthKey(localToday()));
  const yearIdxs = Array.from({ length: 12 }, (_, i) => year * 12 + i);
  const yearCols = yearIdxs.map(i => {
    const vin = inByMonth.get(i) || 0, vout = outByMonth.get(i) || 0;
    const imported = i >= firstIdx && i <= lastIdx;
    return { i, vin, vout, imported, missing: !imported && i > lastIdx && i <= todayIdx, future: i > todayIdx };
  });
  const chartRaw = Math.max(...yearCols.map(c => Math.max(c.vin, c.vout)), 1);
  // Three even steps up to a round number, e.g. £2k / £4k / £6k.
  const nice = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
  const chartStep = nice(chartRaw / 3);
  const chartTop = chartStep * 3;
  const CHART_H = 132;
  const axis = (v: number) => (v === 0 ? '£0' : v >= 1000 ? `£${+(v / 1000).toFixed(1)}k` : `£${Math.round(v)}`);
  const missingCols = yearCols.filter(c => c.missing);
  const missingLabel = missingCols.length
    ? missingCols.length === 1 ? FULL_MONTHS[missingCols[0].i % 12].slice(0, 3) : `${FULL_MONTHS[missingCols[0].i % 12].slice(0, 3)} – ${FULL_MONTHS[missingCols[missingCols.length - 1].i % 12].slice(0, 3)}`
    : '';
  const yearImported = yearCols.filter(c => c.imported);
  const detail = ytd
    ? { title: `${year} so far${yearImported.length ? ` (${FULL_MONTHS[yearImported[0].i % 12].slice(0, 3)} – ${FULL_MONTHS[yearImported[yearImported.length - 1].i % 12].slice(0, 3)})` : ''}`, vin: inc, vout: out }
    : { title: `${FULL_MONTHS[sel % 12]} ${year}`, vin: inc, vout: out };
  const detailNet = detail.vin - detail.vout;

  // Full breakdown opens on what Home is showing: the picked month, or the year's imported months.
  const openBreakdown = () => onOpenBreakdown?.(indexToKey(firstSel), indexToKey(lastSel));

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';

  return (
    <div className="pb-24 flex flex-col gap-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">Home</h1>
          <span className="relative">
            <button onClick={() => setPrivacyOpen(o => !o)} aria-expanded={privacyOpen} aria-label="Hide amounts settings" data-amt-skip className={`w-8 h-8 relative after:absolute after:-inset-1.5 after:content-[''] rounded-lg flex items-center justify-center ${hideAmounts ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-400'}`}>
              {hideAmounts ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            {privacyOpen && (
              <>
                <button aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setPrivacyOpen(false)} />
                <div className="absolute left-0 top-10 z-50 w-64 p-3.5 flex flex-col gap-3 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl shadow-lg">
                  <button onClick={toggleHideAmounts} aria-pressed={hideAmounts} className="flex items-center justify-between gap-3 text-left" data-amt-skip>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900 dark:text-neutral-100">Hide amounts</span>
                      <span className="block text-xs text-slate-500 dark:text-neutral-400">Blur every £ figure in the app</span>
                    </span>
                    <span className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors ${hideAmounts ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-neutral-600'}`}>
                      <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${hideAmounts ? 'left-[21px]' : 'left-[3px]'}`} />
                    </span>
                  </button>
                  <BlurStrengthSlider disabled={!hideAmounts} />
                </div>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label="Period" className="flex gap-0.5 p-[3px] bg-slate-200/70 dark:bg-neutral-800 rounded-[10px]">
            {([['month', 'Month'], ['ytd', 'YTD']] as const).map(([id, l]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`px-2.5 py-1.5 rounded-[7px] text-[11.5px] transition-colors ${mode === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl p-0.5">
            <button onClick={() => step(-1)} disabled={!canPrev} aria-label={ytd ? 'Previous year' : 'Previous month'} className="w-7 h-8 relative after:absolute after:-inset-y-1.5 after:-inset-x-2 after:content-[''] rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">‹</button>
            <span className="min-w-[70px] text-center text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{ytd ? year : `${MONTHS[sel % 12]} ${year}`}</span>
            <button onClick={() => step(1)} disabled={!canNext} aria-label={ytd ? 'Next year' : 'Next month'} className="w-7 h-8 relative after:absolute after:-inset-y-1.5 after:-inset-x-2 after:content-[''] rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">›</button>
          </div>
        </div>
      </div>

      {/* Saved views (swipe sideways) and the categories picker */}
      {(() => {
        const allNames = Array.from(catAllByMonth.keys());
        const inPeriod = allNames
          .map(n => ({ name: n, id: catInfo.get(n)?.id || '', v: sumOver(catAllByMonth.get(n), idxs) }))
          .filter(c => c.v > 0)
          .sort((a, b) => b.v - a.v);
        const onNames = allNames.filter(n => !homeOff.has(n));
        const showOnly = (cats: string[]) => setHomeOff(new Set(allNames.filter(n => !cats.includes(n))));
        const same = (cats: string[]) => allNames.every(n => cats.includes(n) === !homeOff.has(n));
        const topName = inPeriod[0]?.name;
        const pills = [
          { name: 'All spending', cats: allNames },
          ...(topName ? [{ name: `Without ${topName}`, cats: allNames.filter(n => n !== topName) }] : []),
          { name: 'Top 3', cats: inPeriod.slice(0, 3).map(c => c.name) },
          ...views,
        ];
        const current = pills.find(p => same(p.cats));
        const COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
        const colorOf = (n: string) => { const i = inPeriod.findIndex(c => c.name === n); return i >= 0 && i < COLORS.length ? COLORS[i] : '#94A3B8'; };
        const onTotal = inPeriod.filter(c => !homeOff.has(c.name)).reduce((a, c) => a + c.v, 0);
        const saveView = async () => {
          const name = viewName.trim();
          if (!name || onNames.length === 0) return;
          const next = [...views.filter(v => v.name !== name), { name, cats: onNames }];
          setViews(next);
          setNaming(false);
          setViewName('');
          setCatSheet(false);
          // Add it to your account without touching the rest of your Dashboard setup.
          const { data } = await supabase.auth.getUser();
          const prefs = data.user?.user_metadata?.dashboardPrefs || {};
          await supabase.auth.updateUser({ data: { dashboardPrefs: { ...prefs, views: next } } });
        };
        return (
          <>
            <div className="-mx-1 flex items-center gap-1.5">
              <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto hide-scrollbar px-1" data-no-pull-refresh>
                {pills.map(p => {
                  const on = current?.name === p.name;
                  return (
                    <button
                      key={p.name}
                      onClick={() => showOnly(p.cats)}
                      aria-pressed={on}
                      className={`shrink-0 min-h-[30px] px-3 rounded-full border text-[12px] whitespace-nowrap transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white font-semibold dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-300'}`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCatSheet(true)}
                aria-label="Choose categories"
                className={`relative shrink-0 w-8 h-8 rounded-[10px] border flex items-center justify-center ${current ? 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-500 dark:text-neutral-400' : 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 text-indigo-700 dark:text-indigo-300'}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
                {!current && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </button>
            </div>

            <Sheet open={catSheet} onClose={() => { setCatSheet(false); setNaming(false); }} label="Choose categories">
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-5 flex justify-between items-baseline">
                  <span className="text-[17px] font-bold text-slate-900 dark:text-neutral-100">Show</span>
                  <span className="text-[13px] text-slate-500 dark:text-neutral-400">{onNames.length} of {allNames.length} · {fmt(onTotal)}</span>
                </div>
                <div className="px-5 pt-2.5 pb-2 flex gap-1.5">
                  {([['All', allNames], ['Without housing', allNames.filter(n => n.toLowerCase() !== 'housing')], ['Clear', [] as string[]]] as const).map(([l, cats]) => (
                    <button key={l} onClick={() => showOnly(cats as string[])} className="min-h-[32px] px-3 rounded-full border border-slate-200 dark:border-neutral-600 text-xs text-slate-700 dark:text-neutral-300">{l}</button>
                  ))}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3">
                  {inPeriod.map(c => {
                    const on = !homeOff.has(c.name);
                    return (
                      <div key={c.name} className="flex items-center gap-2.5 min-h-[48px] px-2 border-t border-slate-50 dark:border-neutral-700/50">
                        <button onClick={() => setHomeOff(prev => { const n = new Set(prev); if (on) n.add(c.name); else n.delete(c.name); return n; })} aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${c.name}`} className={`w-6 h-6 shrink-0 rounded-[7px] flex items-center justify-center ${on ? 'bg-indigo-600 text-white' : 'border-2 border-slate-300 dark:border-neutral-500'}`}>
                          {on && <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                        </button>
                        <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: colorOf(c.name) }} />
                        <span className={`flex-1 min-w-0 truncate text-sm ${on ? 'text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>{(getCategoryEmoji && c.id && getCategoryEmoji(c.id)) || ''} {c.name}</span>
                        <span className="text-xs text-slate-400 dark:text-neutral-500">{fmt(c.v)}</span>
                        <button onClick={() => showOnly([c.name])} className="shrink-0 min-h-[32px] px-2.5 rounded-[10px] bg-slate-100 dark:bg-neutral-700 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Only</button>
                      </div>
                    );
                  })}
                </div>
                <div className="shrink-0 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-neutral-700 flex gap-2">
                  {naming ? (
                    <form onSubmit={(e) => { e.preventDefault(); void saveView(); }} className="flex-1 flex gap-2">
                      <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Name this view" maxLength={30} aria-label="View name" className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-neutral-900 text-sm text-slate-900 dark:text-neutral-100 outline-none" />
                      <button type="submit" disabled={!viewName.trim()} className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">Save</button>
                    </form>
                  ) : (
                    <>
                      <button onClick={() => setNaming(true)} disabled={onNames.length === 0} className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-600 text-sm font-semibold text-indigo-700 dark:text-indigo-300 disabled:opacity-40">＋ Save as a view</button>
                      <button onClick={() => setCatSheet(false)} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Done</button>
                    </>
                  )}
                </div>
              </div>
            </Sheet>
          </>
        );
      })()}

      <InstallCard />

      <section className={`${card} p-4 flex flex-col gap-3.5`}>
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 dark:text-neutral-400">Spent in {ytd ? `${year}${partialYear ? ' so far' : ''}` : FULL_MONTHS[sel % 12]}</div>
            <div className="text-[34px] leading-tight font-bold text-slate-900 dark:text-neutral-100"><Glide value={out} format={fmt} /></div>
            {usual > 0 ? (() => {
              // How far through your usual month (or last year) you are; the tick is your usual.
              const scale = Math.max(out, usual) * 1.04;
              const tick = (usual / scale) * 100;
              const fill = near ? 'bg-slate-400 dark:bg-neutral-400' : diff > 0 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div className="mt-2 max-w-[150px]" aria-label={`${fmt(out)} spent; average ${fmt(usual)}`}>
                  <div className="relative h-2 rounded-full bg-slate-100 dark:bg-neutral-700">
                    <span className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-[1100ms] delay-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${fill}`} style={{ width: `${(out / scale) * 100}%` }} />
                    <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate-900 dark:bg-neutral-100 transition-[left] duration-[1100ms] delay-150 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ left: `calc(${tick}% - 1px)` }} />
                  </div>
                  <div className="relative h-4 mt-1 text-[10.5px] text-slate-500 dark:text-neutral-400">
                    <span className="absolute whitespace-nowrap" style={tick < 18 ? { left: 0 } : { left: `${tick}%`, transform: 'translateX(-50%)' }}>
                      {ytd ? 'Last year' : 'Avg'} {fmt(usual)}
                    </span>
                  </div>
                </div>
              );
            })() : (
              <div className={`text-[12.5px] font-semibold mt-0.5 ${compareTone}`}><Swap text={compareLine} /></div>
            )}
          </div>
          <div className="text-right text-xs leading-relaxed text-slate-500 dark:text-neutral-400 shrink-0">
            In <strong className="text-emerald-700 dark:text-emerald-400"><Glide value={inc} format={fmt} /></strong>
            <br />
            Net <strong className={net < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}><Swap text={`${net < 0 ? '−' : '+'}${fmt(Math.abs(net))}`} /></strong>
          </div>
        </div>
        {/* Switching between the year and six months: bars that leave shrink away and the rest widen
            smoothly into the space (and back), rather than jumping. */}
        <div className="flex items-end h-24">
          <AnimatePresence initial={false} mode="popLayout">
          {barIdxs.map(i => {
            const v = outByMonth.get(i) || 0;
            const on = ytd || i === sel;
            const inRange = i >= firstIdx && i <= lastIdx;
            return (
              <motion.button
                key={i}
                layout
                initial={{ opacity: 0, scaleX: 0.4 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0, scaleX: 0.4 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => { if (!inRange) return; toggleMonth(i); }}
                disabled={!inRange}
                aria-pressed={on}
                aria-label={`${FULL_MONTHS[i % 12]} ${Math.floor(i / 12)}: ${fmt(v)}`}
                className="flex-1 basis-0 min-w-0 h-full flex flex-col justify-end gap-1.5 px-[3px]"
              >
                {/* Full-height bar scaled from the bottom: growing and shrinking is a cheap transform */}
                <span
                  className={`block h-[72px] rounded-md origin-bottom transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${on ? (ytd ? 'bg-indigo-500' : 'bg-indigo-600') : v ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-slate-100 dark:bg-neutral-700'}`}
                  style={{ transform: `scaleY(${(v ? Math.max(4, Math.round((v / barMax) * 72)) : 4) / 72})` }}
                />
                <span className={`transition-colors duration-700 text-[10.5px] whitespace-nowrap ${on && !ytd ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>{MONTHS[i % 12]}</span>
              </motion.button>
            );
          })}
          </AnimatePresence>
        </div>
      </section>

      <section className={`${card} px-4 py-1.5`}>
        <div className="flex justify-between items-baseline pt-2.5 pb-1">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Where it went</h2>
        </div>
        {top.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No spending {ytd ? 'this year' : 'this month'}</p>}
        {/* On a new month the rows stay put: amounts and % swap softly, rows that move glide to
            their new place, and categories that come or go fade in or out. */}
        <div className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {top.map(c => (
              <motion.div
                key={c.name}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                {catRow(c)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {/* The rest of the categories open smoothly under the top six */}
        <AnimatePresence initial={false}>
          {showAllCats && rest.length > 0 && (
            <motion.div
              key="rest"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              {rest.map(catRow)}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="border-t border-slate-100 dark:border-neutral-700 py-3 flex justify-between text-[12.5px]">
          {rest.length ? (
            <button onClick={() => setShowAllCats(v => !v)} aria-expanded={showAllCats} className="flex items-center gap-1 font-medium text-slate-600 dark:text-neutral-300">
              {showAllCats ? 'Show less' : `+${rest.length} more · ${fmt(rest.reduce((s, c) => s + c.v, 0))}`}
              <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform duration-300 ${showAllCats ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>
            </button>
          ) : (
            <span className="text-slate-500 dark:text-neutral-400">All categories shown</span>
          )}
          {onOpenBreakdown && (
            <button onClick={openBreakdown} className="font-semibold text-indigo-700 dark:text-indigo-300">Full breakdown →</button>
          )}
        </div>
      </section>

      {places.length > 0 && (
        <section className={`${card} px-4 py-1.5`}>
          <div className="flex justify-between items-center pt-2.5 pb-1.5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Top places</h2>
            <div role="group" aria-label="Rank places by" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-[9px]">
              {([['visits', 'Most visits'], ['spent', 'Most spent']] as const).map(([id, l]) => (
                <button
                  key={id}
                  onClick={() => setPlaceRank(id)}
                  aria-pressed={placeRank === id}
                  className={`px-2.5 py-1 rounded-[7px] text-[11px] transition-colors ${placeRank === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div key={`${mode}-${sel}-${placeRank}`}>
            {places.map((p, i) => <Stagger key={p.key} i={i}>{placeRow(p, i)}</Stagger>)}
          </div>
          {/* More places open smoothly under the top five, ten at a time */}
          <AnimatePresence initial={false}>
            {placeChunks.map((chunk, c) => (
              <motion.div
                key={c}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {chunk.map((p, k) => placeRow(p, TOP_PLACES + c * PLACES_STEP + k))}
              </motion.div>
            ))}
          </AnimatePresence>
          {placesLeft > 0 && (
            <button onClick={() => setExtraPlaces(n => n + PLACES_STEP)} className="w-full mb-2.5 mt-0.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 active:bg-slate-50 dark:active:bg-neutral-700/40">
              Show {Math.min(PLACES_STEP, placesLeft)} more <span className="font-normal text-slate-500 dark:text-neutral-400">· {placesLeft} left</span>
            </button>
          )}
          <div className="border-t border-slate-100 dark:border-neutral-700 py-3 flex justify-between text-[12.5px]">
            {extraPlaces > 0 ? (
              <button onClick={() => setExtraPlaces(0)} className="flex items-center gap-1 font-medium text-slate-600 dark:text-neutral-300">
                Show less
                <svg viewBox="0 0 12 12" className="w-3 h-3 rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>
              </button>
            ) : (
              <span className="text-slate-500 dark:text-neutral-400">{monthPlaces.length} {monthPlaces.length === 1 ? 'place' : 'places'} in {periodShort}</span>
            )}
            {onOpenBreakdown && (
              <button onClick={openBreakdown} className="font-semibold text-indigo-700 dark:text-indigo-300">Full breakdown →</button>
            )}
          </div>
        </section>
      )}

      <section className={`${card} px-4 pt-3.5 pb-3 flex flex-col gap-3`}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Month by month</h2>
            <p className="text-[11.5px] text-slate-500 dark:text-neutral-400">{year} · tap a month</p>
          </div>
          <div className="flex gap-2.5 text-[11.5px] text-slate-600 dark:text-neutral-300">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-green-600" />In</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-slate-900 dark:bg-neutral-200" />Out</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {/* £ axis */}
          <div className="relative w-8 shrink-0" style={{ height: CHART_H }}>
            {[3, 2, 1, 0].map(k => (
              <span key={k} className="absolute right-0 -translate-y-1/2 text-[9.5px] text-slate-400 dark:text-neutral-500 tabular-nums" style={{ top: CHART_H - (k / 3) * CHART_H }}>{axis(chartStep * k)}</span>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative" style={{ height: CHART_H }}>
              {[3, 2, 1, 0].map(k => (
                <span key={k} className={`absolute left-0 right-0 border-t ${k === 0 ? 'border-slate-200 dark:border-neutral-600' : 'border-dashed border-slate-100 dark:border-neutral-700'}`} style={{ top: CHART_H - (k / 3) * CHART_H }} />
              ))}
              <div className="absolute inset-0 grid grid-cols-12 gap-0.5 items-end">
                {yearCols.map(c => {
                  const on = !ytd && c.i === sel;
                  const faded = !ytd && !on && c.imported;
                  return (
                    <button
                      key={c.i}
                      onClick={() => { if (c.imported) toggleMonth(c.i); }}
                      disabled={!c.imported}
                      aria-pressed={on}
                      aria-label={`${FULL_MONTHS[c.i % 12]} ${year}: ${c.imported ? `in ${fmt(c.vin)}, out ${fmt(c.vout)}` : c.missing ? 'not imported' : 'no data'}`}
                      className={`h-full flex items-end justify-center rounded-md ${on ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''} ${faded ? 'opacity-45' : ''}`}
                    >
                      {c.imported ? (
                        <span className="flex items-end gap-[2px]">
                          <span className="w-[7px] rounded-t-[3px] bg-green-600" style={{ height: c.vin > 0 ? Math.max(3, Math.round((c.vin / chartTop) * CHART_H)) : 0 }} />
                          <span className="w-[7px] rounded-t-[3px] bg-slate-900 dark:bg-neutral-200" style={{ height: c.vout > 0 ? Math.max(3, Math.round((c.vout / chartTop) * CHART_H)) : 0 }} />
                        </span>
                      ) : c.missing ? (
                        <span className="w-[18px] h-[70px] rounded-md border-[1.5px] border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-12 gap-0.5 mt-1.5">
              {yearCols.map(c => (
                <span key={c.i} className={`text-center text-[10.5px] ${!ytd && c.i === sel ? 'font-bold text-slate-900 dark:text-neutral-100' : c.missing ? 'font-medium text-amber-700 dark:text-amber-400' : c.imported ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-300 dark:text-neutral-600'}`}>
                  {FULL_MONTHS[c.i % 12][0]}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2.5 ${ytd ? 'bg-slate-50 dark:bg-neutral-700/50' : 'bg-indigo-50/70 dark:bg-indigo-950/30'}`}>
          <div className="text-xs font-semibold text-slate-600 dark:text-neutral-300">{detail.title}</div>
          <div className="flex flex-wrap gap-x-3.5 text-[13px] mt-0.5 text-slate-700 dark:text-neutral-300">
            <span>In <strong className="text-emerald-700 dark:text-emerald-400">{fmt(detail.vin)}</strong></span>
            <span>Out <strong className="text-slate-900 dark:text-neutral-100">{fmt(detail.vout)}</strong></span>
            <span>Net <strong className={detailNet < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>{detailNet < 0 ? '−' : '+'}{fmt(Math.abs(detailNet))}</strong></span>
          </div>
        </div>
        {missingLabel && (
          <button onClick={onImport} disabled={!onImport} className="flex justify-between items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 text-left">
            <span><strong>{missingLabel}</strong> not imported yet</span>
            {onImport && <span className="font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">Import CSV →</span>}
          </button>
        )}
      </section>

      {/* Money in: how much came in, how much of your spending it covered, by type, and from whom */}
      {(() => {
        const rows = incomeRows.filter(r => idxs.includes(r.idx));
        const inV = sum(rows.map(r => r.amount));
        const outV = out;
        const cover = outV > 0 ? inV / outV : null;
        const netV = inV - outV;
        const fmt2 = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const TYPE_COLORS = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B'];
        const byType = new Map<string, number>();
        rows.forEach(r => byType.set(r.type, (byType.get(r.type) || 0) + r.amount));
        const types = Array.from(byType.entries()).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
        const typeColor = (name: string) => { const i = types.findIndex(t => t.name === name); return i >= 0 && i < TYPE_COLORS.length ? TYPE_COLORS[i] : '#94A3B8'; };
        const activeType = types.some(t => t.name === inType) ? inType : 'all';
        const bySource = new Map<string, { key: string; name: string; type: string; total: number; count: number; months: Set<number> }>();
        rows.filter(r => activeType === 'all' || r.type === activeType).forEach(r => {
          const e = bySource.get(r.key) || { key: r.key, name: r.desc, type: r.type, total: 0, count: 0, months: new Set<number>() };
          e.total += r.amount; e.count++; e.months.add(r.idx);
          bySource.set(r.key, e);
        });
        const sources = Array.from(bySource.values()).sort((a, b) => b.total - a.total);
        const SHOWN = 4;
        const shortType = (t: string) => t.replace(/ interest$/i, '');
        const openSource = (src: typeof sources[number]) => setPlacePick({ key: src.key, name: src.name, catName: src.type, catId: '', tint: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', year, month: ytd ? null : sel, income: true });
        const sourceRow = (src: typeof sources[number]) => (
          <button
            key={src.key}
            onClick={() => openSource(src)}
            className="w-full h-[52px] grid grid-cols-[32px_minmax(0,1fr)_auto] gap-2.5 items-center border-t border-slate-100 dark:border-neutral-700 text-left"
          >
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{src.name.replace(/^from\s+/i, '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>
            <span className="min-w-0 flex flex-col">
              <span className="text-[12.5px] leading-snug font-medium text-slate-900 dark:text-neutral-100 truncate">{src.name}</span>
              <span className="text-[11px] text-slate-500 dark:text-neutral-400 truncate"><span className="capitalize">{src.type}</span> · {src.count > 1 ? `${src.count} payments` : Array.from(src.months).map(m => MONTHS[m % 12]).join(', ')}</span>
            </span>
            <span className="text-[12.5px] font-bold text-emerald-700 dark:text-emerald-400">+{fmt2(src.total)}</span>
          </button>
        );
        // The chart always shows the year's imported months, like Month by month.
        const chartIdxs = yearIdxs.filter(i => i >= firstIdx && i <= lastIdx);
        const inOf = (i: number) => sum(incomeRows.filter(r => r.idx === i).map(r => r.amount));
        const chartMax = Math.max(...chartIdxs.map(i => Math.max(inOf(i), outByMonth.get(i) || 0)), 1);
        const pctOf = (v: number, of: number) => (of > 0 ? (v / of < 0.005 ? '<1' : Math.round((v / of) * 100)) : 0);
        return (
          <>
            <section aria-label="Money in" className={`${card} p-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Money in</h2>
                <span className="text-xs text-slate-500 dark:text-neutral-400">{ytd ? `${year} so far` : `${FULL_MONTHS[sel % 12]} ${year}`}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <span className="text-[30px] leading-tight font-bold tracking-tight text-emerald-700 dark:text-emerald-400"><Glide value={inV} format={fmt} /></span>
                <span className={`text-[13px] font-semibold ${netV < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{netV < 0 ? '−' : '+'}{fmt(Math.abs(netV))} net</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-neutral-400">
                {rows.length} {rows.length === 1 ? 'payment' : 'payments'}{ytd && idxs.length > 1 ? ` · average ${fmt(inV / idxs.length)} a month` : ''}
              </div>
              {cover !== null && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-600 dark:text-neutral-300"><span>Covered of your spending</span><span className="font-bold text-slate-900 dark:text-neutral-100">{Math.round(cover * 100)}%</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-[1100ms] delay-150 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${Math.min(100, cover * 100)}%` }} /></div>
                </div>
              )}

              {chartIdxs.length > 0 && (
                <>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-600 dark:text-neutral-300">{ytd ? 'Each month · tap one' : `${MONTHS[sel % 12]}: ${fmt(inV)} in · ${fmt(outV)} out`}</span>
                    <span className="flex gap-2.5 text-[11px] text-slate-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-emerald-500" />In</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-slate-300 dark:bg-neutral-500" />Out</span>
                    </span>
                  </div>
                  <div className={`mt-2 flex items-end h-28 ${chartIdxs.length > 6 ? 'gap-1' : 'gap-1.5'}`}>
                    {chartIdxs.map(i => {
                      const vin = inOf(i), vout = outByMonth.get(i) || 0;
                      const on = !ytd && i === sel;
                      const dim = !ytd && !on;
                      const h = (v: number) => (v > 0 ? Math.max(3, Math.round((v / chartMax) * 84)) : 3);
                      return (
                        <button
                          key={i}
                          onClick={() => toggleMonth(i)}
                          aria-pressed={on}
                          aria-label={`${FULL_MONTHS[i % 12]}: ${fmt(vin)} in, ${fmt(vout)} out`}
                          className={`flex-1 min-w-0 h-full flex flex-col justify-end gap-1.5 transition-opacity duration-700 ${dim ? 'opacity-35' : ''}`}
                        >
                          <span className="flex items-end justify-center gap-[3px]">
                            <span className="block w-[40%] max-w-[16px] rounded bg-emerald-500" style={{ height: h(vin) }} />
                            <span className="block w-[40%] max-w-[16px] rounded bg-slate-300 dark:bg-neutral-500" style={{ height: h(vout) }} />
                          </span>
                          <span className={`text-[11px] ${on ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{MONTHS[i % 12]}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {types.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-neutral-700">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100">Where it came from</h3>
                    <span className="text-[11px] text-slate-400 dark:text-neutral-500">Biggest first</span>
                  </div>
                  <div aria-hidden className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 flex overflow-hidden">
                    {types.map(t => <span key={t.name} className="transition-[width] duration-[1100ms] delay-150 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${(t.v / inV) * 100}%`, background: typeColor(t.name) }} />)}
                  </div>
                  {/* One switch for the type; the list below always keeps the same height so nothing jumps */}
                  {types.length > 0 && (
                    <div role="group" aria-label="Filter by type" className="mt-2.5 p-[3px] rounded-xl bg-slate-100 dark:bg-neutral-900/60 flex gap-0.5 overflow-x-auto hide-scrollbar" data-no-pull-refresh>
                      {['all', ...types.map(t => t.name)].map(t => {
                        const on = activeType === t;
                        const v = t === 'all' ? inV : (byType.get(t) || 0);
                        return (
                          <button
                            key={t}
                            onClick={() => setInType(t)}
                            aria-pressed={on}
                            className="relative flex-1 basis-0 min-w-[calc((100%_-_4px)/3)] min-h-[44px] px-1.5 rounded-[9px]"
                          >
                            {on && <motion.span layoutId="money-in-type" transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="absolute inset-0 rounded-[9px] bg-white dark:bg-neutral-700 shadow-sm" />}
                            <span className="relative flex flex-col items-center leading-tight">
                              <span className={`flex items-center gap-1 text-[12px] capitalize truncate max-w-full ${on ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-600 dark:text-neutral-300'}`}>
                                {t !== 'all' && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor(t) }} />}
                                {t === 'all' ? 'All' : shortType(t)}
                              </span>
                              <span className="text-[10.5px] text-slate-500 dark:text-neutral-400">{fmt(v)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2" style={{ height: SHOWN * 52 }}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={`${activeType}-${mode}-${sel}`} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {sources.slice(0, SHOWN).map((src, i) => <Stagger key={src.key} i={i}>{sourceRow(src)}</Stagger>)}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <AnimatePresence initial={false}>
                    {moreSources && sources.length > SHOWN && (
                      <motion.div
                        key="more"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        {sources.slice(SHOWN).map(sourceRow)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="border-t border-slate-100 dark:border-neutral-700 py-3 text-[12.5px] flex justify-between items-center gap-3">
                    {sources.length > SHOWN ? (
                      <button onClick={() => setMoreSources(v => !v)} aria-expanded={moreSources} className="flex items-center gap-1 font-medium text-slate-600 dark:text-neutral-300">
                        {moreSources ? 'Show less' : `+${sources.length - SHOWN} more · ${fmt(sources.slice(SHOWN).reduce((a, x) => a + x.total, 0))}`}
                        <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform duration-300 ${moreSources ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>
                      </button>
                    ) : (
                      <span className="text-slate-500 dark:text-neutral-400">All sources shown</span>
                    )}
                    {onOpenIncome && <button onClick={onOpenIncome} className="shrink-0 font-semibold text-indigo-700 dark:text-indigo-300">See all income →</button>}
                  </div>
                </div>
              )}
              {rows.length === 0 && <p className="mt-3 text-sm text-slate-500 dark:text-neutral-400">No money in {ytd ? 'this year' : 'this month'}.</p>}
            </section>

          </>
        );
      })()}

      <PlaceSheet
        place={placePick}
        onClose={() => setPlacePick(null)}
        transactions={transactions}
        currency={currency}
        getCategoryEmoji={getCategoryEmoji}
        firstIdx={firstIdx}
        lastIdx={lastIdx}
      />
      {catPanel && (
        <CategorySheets
          key={catPanel.n}
          transactions={transactions}
          currency={currency}
          getCategoryEmoji={getCategoryEmoji}
          onViewTransactions={onViewTransactions || (() => {})}
          panelOnly={catPanel}
          onPanelClose={() => setCatPanel(null)}
        />
      )}
    </div>
  );
};

export default MobileHome;
