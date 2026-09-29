import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
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
  onOpenBreakdown?: () => void;
  onViewTransactions?: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
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

const MobileHome: React.FC<MobileHomeProps> = ({ transactions, currency, getCategoryEmoji, onOpenBreakdown, onViewTransactions }) => {
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

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';

  return (
    <div className="pb-24 flex flex-col gap-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex items-center justify-between gap-2 pt-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">Home</h1>
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
                onClick={() => { if (!inRange) return; setPicked(i); setMode('month'); }}
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
        {top.map(c => (
          <button
            key={c.name}
            onClick={() => onViewTransactions?.(c.id, null, start, end)}
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
        ))}
        <div className="border-t border-slate-100 dark:border-neutral-700 py-3 flex justify-between text-[12.5px]">
          <span className="text-slate-500 dark:text-neutral-400">
            {rest.length ? `+${rest.length} more · ${fmt(rest.reduce((s, c) => s + c.v, 0))}` : 'All categories shown'}
          </span>
          {onOpenBreakdown && (
            <button onClick={onOpenBreakdown} className="font-semibold text-indigo-700 dark:text-indigo-300">Full breakdown →</button>
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
            {onViewTransactions && (
              <button onClick={() => onViewTransactions('all', null, start, end)} className="font-semibold text-indigo-700 dark:text-indigo-300">All transactions →</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default MobileHome;
