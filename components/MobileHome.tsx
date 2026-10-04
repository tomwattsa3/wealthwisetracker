import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { Transaction } from '../types';
import { usePrivacy } from '../lib/privacy';
import BlurStrengthSlider from './BlurStrengthSlider';
import CategorySheets from './CategorySheets';
import { MONTHS, FULL_MONTHS, monthKey, keyToIndex, indexToKey, daysIn, localToday, merchantKey } from '../lib/periods';

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

interface Place { name: string; total: number; count: number; cats: Map<string, { id: string; amount: number }> }

const MobileHome: React.FC<MobileHomeProps> = ({ transactions, currency, getCategoryEmoji, onOpenBreakdown, onViewTransactions, onImport }) => {
  const amt = (t: Transaction) => Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0;
  const valid = (t: Transaction) => !t.excluded && /^\d{4}-\d{2}-\d{2}/.test(t.date);

  // Same rule as the Dashboard: spending = every money-out row that isn't excluded.
  const { outByMonth, inByMonth, catByMonth, catInfo, placesByMonth, firstIdx, lastIdx } = useMemo(() => {
    const outByMonth = new Map<number, number>();
    const inByMonth = new Map<number, number>();
    const catByMonth = new Map<string, Map<number, number>>();
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
        outByMonth.set(idx, (outByMonth.get(idx) || 0) + a);
        const name = t.categoryName.trim().replace(/Fee's/i, 'Fees');
        if (!catInfo.has(name)) catInfo.set(name, { name, id: t.categoryId });
        const m = catByMonth.get(name) || new Map<number, number>();
        m.set(idx, (m.get(idx) || 0) + a);
        catByMonth.set(name, m);
        const desc = (t.description || 'Unknown').trim();
        const key = merchantKey(desc) || desc.toLowerCase();
        const pm = placesByMonth.get(idx) || new Map<string, Place>();
        const pl = pm.get(key) || { name: desc, total: 0, count: 0, cats: new Map() };
        pl.total += a;
        pl.count += 1;
        const pc = pl.cats.get(name) || { id: t.categoryId, amount: 0 };
        pc.amount += a;
        pl.cats.set(name, pc);
        pm.set(key, pl);
        placesByMonth.set(idx, pm);
        firstIdx = Math.min(firstIdx, idx);
        lastIdx = Math.max(lastIdx, idx);
      } else if (t.type === 'INCOME' && (t.categoryName || '').trim().toLowerCase() !== 'excluded') {
        inByMonth.set(idx, (inByMonth.get(idx) || 0) + a);
      }
    });
    return { outByMonth, inByMonth, catByMonth, catInfo, placesByMonth, firstIdx, lastIdx };
  }, [transactions, currency]);

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
  const [showAllCats, setShowAllCats] = useState(false);
  // The category tapped in "Where it went", shown in the same panel as Sheets' See all.
  const [catPanel, setCatPanel] = useState<{ cat: string; year: number; month: number | null; n: number } | null>(null);
  const sel = picked ?? (hasData ? lastIdx : keyToIndex(monthKey(localToday())));

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

  // Month: vs the average of the other months with spending in the 12 up to your latest import.
  // YTD: vs the same months last year, when those were imported too.
  const usualMonths = Array.from({ length: 12 }, (_, i) => lastIdx - 11 + i).filter(i => i !== sel && (outByMonth.get(i) || 0) > 0);
  const prevYearIdxs = idxs.map(i => i - 12);
  const hasPrevYear = ytd && prevYearIdxs.every(i => i >= firstIdx);
  const usual = ytd
    ? (hasPrevYear ? sumOver(outByMonth, prevYearIdxs) : 0)
    : usualMonths.length ? usualMonths.reduce((s, i) => s + (outByMonth.get(i) || 0), 0) / usualMonths.length : 0;
  const diff = usual ? (out - usual) / usual : 0;
  const near = Math.abs(diff) < 0.05;
  const partialYear = ytd && idxs.length > 0 && idxs[idxs.length - 1] % 12 !== 11;
  const compareLine = ytd
    ? !usual
      ? `Avg ${fmt(out / Math.max(idxs.length, 1))} a month`
      : near
        ? 'About the same as last year'
        : `${diff > 0 ? '↑' : '↓'} ${fmt(Math.abs(out - usual))} vs ${partialYear ? 'this point ' : ''}last year (${fmt(usual)})`
    : !usual ? 'Your first month' : near ? 'About your usual month' : `${diff > 0 ? '↑' : '↓'} ${fmt(Math.abs(out - usual))} vs your usual ${fmt(usual)}`;
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
                <span className="text-[13.5px] font-bold text-slate-900 dark:text-neutral-100">{fmt(c.v)}</span>
              </span>
              <span className="block h-1 rounded bg-slate-100 dark:bg-neutral-700">
                <span className="block h-1 rounded bg-indigo-500" style={{ width: `${(c.v / catMax) * 100}%` }} />
              </span>
            </span>
            <span className="min-w-[40px] text-right text-[12px] font-semibold text-slate-500 dark:text-neutral-400">
              {out ? `${Math.round((c.v / out) * 100)}%` : ''}
            </span>
          </button>
  );

  // Merge each month's places across the selected months.
  const merged = new Map<string, Place>();
  idxs.forEach(i => placesByMonth.get(i)?.forEach((p, key) => {
    const m = merged.get(key) || { name: p.name, total: 0, count: 0, cats: new Map() };
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
  const places = [...monthPlaces]
    .sort((a, b) => (placeRank === 'visits' ? b.count - a.count || b.total - a.total : b.total - a.total))
    .slice(0, TOP_PLACES)
    .map(p => {
      const [catName, cat] = Array.from(p.cats.entries()).sort((a, b) => b[1].amount - a[1].amount)[0];
      return { ...p, catName, catId: cat.id };
    });

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
            <button onClick={() => setPrivacyOpen(o => !o)} aria-expanded={privacyOpen} aria-label="Hide amounts settings" data-amt-skip className={`w-8 h-8 rounded-lg flex items-center justify-center ${hideAmounts ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-400'}`}>
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
            <button onClick={() => step(-1)} disabled={!canPrev} aria-label={ytd ? 'Previous year' : 'Previous month'} className="w-7 h-8 rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">‹</button>
            <span className="min-w-[70px] text-center text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{ytd ? year : `${MONTHS[sel % 12]} ${year}`}</span>
            <button onClick={() => step(1)} disabled={!canNext} aria-label={ytd ? 'Next year' : 'Next month'} className="w-7 h-8 rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">›</button>
          </div>
        </div>
      </div>

      <section className={`${card} p-4 flex flex-col gap-3.5`}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-neutral-400">Spent in {ytd ? `${year}${partialYear ? ' so far' : ''}` : FULL_MONTHS[sel % 12]}</div>
            <div className="text-[34px] leading-tight font-bold text-slate-900 dark:text-neutral-100">{fmt(out)}</div>
            <div className={`text-[12.5px] font-semibold mt-0.5 ${compareTone}`}>{compareLine}</div>
          </div>
          <div className="text-right text-xs leading-relaxed text-slate-500 dark:text-neutral-400 shrink-0">
            In <strong className="text-emerald-700 dark:text-emerald-400">{fmt(inc)}</strong>
            <br />
            Net <strong className={net < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>{net < 0 ? '−' : '+'}{fmt(Math.abs(net))}</strong>
          </div>
        </div>
        <div className={`flex items-end h-24 ${barIdxs.length > 6 ? 'gap-1' : 'gap-2'}`}>
          {barIdxs.map(i => {
            const v = outByMonth.get(i) || 0;
            const on = ytd || i === sel;
            const inRange = i >= firstIdx && i <= lastIdx;
            return (
              <button
                key={i}
                onClick={() => { if (!inRange) return; toggleMonth(i); }}
                disabled={!inRange}
                aria-pressed={on}
                aria-label={`${FULL_MONTHS[i % 12]} ${Math.floor(i / 12)}: ${fmt(v)}`}
                className="flex-1 h-full flex flex-col justify-end gap-1.5"
              >
                <span
                  className={`block rounded-md ${on ? (ytd ? 'bg-indigo-500' : 'bg-indigo-600') : v ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-slate-100 dark:bg-neutral-700'}`}
                  style={{ height: v ? Math.max(4, Math.round((v / barMax) * 72)) : 4 }}
                />
                <span className={`${barIdxs.length > 6 ? 'text-[10px]' : 'text-[11px]'} ${on && !ytd ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>{MONTHS[i % 12]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${card} px-4 py-1.5`}>
        <div className="flex justify-between items-baseline pt-2.5 pb-1">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Where it went</h2>
        </div>
        {top.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No spending {ytd ? 'this year' : 'this month'}</p>}
        {top.map(catRow)}
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
          {places.map((p, i) => (
            <div key={p.name} className="grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2.5 items-center py-2 border-t border-slate-100 dark:border-neutral-700">
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
            </div>
          ))}
          <div className="border-t border-slate-100 dark:border-neutral-700 py-3 flex justify-between text-[12.5px]">
            <span className="text-slate-500 dark:text-neutral-400">{monthPlaces.length} {monthPlaces.length === 1 ? 'place' : 'places'} in {periodShort}</span>
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
