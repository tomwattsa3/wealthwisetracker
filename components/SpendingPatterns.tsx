import React, { useEffect, useMemo, useState } from 'react';
import { Transaction, Category } from '../types';

interface SpendingPatternsProps {
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TOM = ['1–7', '8–14', '15–21', '22–end'];
const TOM_LONG = ['the first week', 'the second week', 'the third week', 'the last week'];

// Assigned by spend rank rather than taken from Category.color, because several categories share
// similar colours and the stacked chart needs neighbouring segments to be told apart.
const PALETTE = ['#312e81', '#f59e0b', '#6366f1', '#0ea5e9', '#7c3aed', '#f97316', '#14b8a6', '#64748b', '#ec4899', '#ca8a04', '#22c55e', '#84cc16', '#94a3b8', '#cbd5e1'];
const RANGES = [3, 6, 12] as const;
type Range = typeof RANGES[number];

const STORAGE_KEY = 'spendingPatterns';

// "YYYY-MM" month index, used as a sortable key.
const monthKey = (date: string) => date.slice(0, 7);
const keyToIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const indexLabel = (i: number) => MONTHS[i % 12];

// Groups merchant descriptions that are the same payee written slightly differently
// ("Motor city llc - Parking" / "Motor city llc Parking", "Subscription fee for Jan 2026" /
// "... for Feb 2026", "Tesco Bank" / "Tesco Bank - Loan Payment") by their first two words once
// dates, numbers and punctuation are stripped.
const merchantKey = (desc: string) => {
  const cleaned = desc
    .toLowerCase()
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 2).join(' ') || desc.toLowerCase();
};

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

interface Spend {
  cat: string;
  catId: string;
  date: string;
  monthIdx: number;
  desc: string;
  amount: number;
}

interface RegularPayment {
  name: string;
  category: string;
  months: number[];
  count: number;
  avg: number;
  total: number;
  note: string;
  stale: boolean;
}

const SpendingPatterns: React.FC<SpendingPatternsProps> = ({ transactions, categories, currency, getCategoryEmoji }) => {
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { range?: Range; unselected?: string[] };
    } catch {
      return {};
    }
  }, []);
  const [range, setRange] = useState<Range>(saved.range && RANGES.includes(saved.range) ? saved.range : 6);
  // Stored as the categories that are switched OFF, so a category that appears later (a new
  // import) shows up selected by default instead of silently missing from the chart.
  const [unselected, setUnselected] = useState<Set<string>>(() => new Set(saved.unselected || []));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ range, unselected: Array.from(unselected) }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
  }, [range, unselected]);

  const fmt = (v: number, decimals = 0) => {
    const n = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${v < 0 ? '−' : ''}${currency === 'GBP' ? '£' : 'AED '}${n}`;
  };

  // Spending = every money-out row that isn't excluded, whatever category it's filed under — the
  // same rule the dashboard uses, so totals agree. Every category that has spending shows up in
  // the picker (even an odd one like "Income") and can be unticked there.
  const spends = useMemo<Spend[]>(() => {
    return transactions
      .filter(t => t.type === 'EXPENSE' && !t.excluded && t.categoryName && /^\d{4}-\d{2}-\d{2}/.test(t.date))
      .map(t => ({
        cat: t.categoryName.trim().replace(/Fee's/i, 'Fees'),
        catId: t.categoryId,
        date: t.date,
        monthIdx: keyToIndex(monthKey(t.date)),
        desc: (t.description || 'Unknown').trim(),
        amount: Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0,
      }))
      .filter(s => s.amount > 0);
  }, [transactions, categories, currency]);

  // The window ends at the latest month that actually has data, so un-imported months at the
  // end of the year don't drag every average down.
  const lastIdx = useMemo(() => (spends.length ? Math.max(...spends.map(s => s.monthIdx)) : keyToIndex(monthKey(new Date().toISOString()))), [spends]);
  const monthIdxs = useMemo(() => Array.from({ length: range }, (_, i) => lastIdx - range + 1 + i), [lastIdx, range]);
  const inRange = useMemo(() => spends.filter(s => s.monthIdx >= monthIdxs[0] && s.monthIdx <= lastIdx), [spends, monthIdxs, lastIdx]);

  const catStats = useMemo(() => {
    const map = new Map<string, { name: string; catId: string; total: number }>();
    for (const s of inRange) {
      const e = map.get(s.cat) || { name: s.cat, catId: s.catId, total: 0 };
      e.total += s.amount;
      map.set(s.cat, e);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map((c, i) => ({ ...c, color: PALETTE[i] || PALETTE[PALETTE.length - 1] }));
  }, [inRange]);
  const colorOf = useMemo(() => Object.fromEntries(catStats.map(c => [c.name, c.color])), [catStats]);

  const selected = useMemo(() => new Set(catStats.map(c => c.name).filter(n => !unselected.has(n))), [catStats, unselected]);
  const chosen = useMemo(() => inRange.filter(s => selected.has(s.cat)), [inRange, selected]);

  const toggle = (name: string) => setUnselected(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const selectOnly = (names: string[]) => setUnselected(new Set(catStats.map(c => c.name).filter(n => !names.includes(n))));

  const top = catStats[0]?.name;
  const presets = [
    { label: 'All spending', names: catStats.map(c => c.name) },
    ...(top ? [{ label: `Without ${top}`, names: catStats.slice(1).map(c => c.name) }] : []),
    { label: 'Top 3', names: catStats.slice(0, 3).map(c => c.name) },
  ];
  const presetActive = (names: string[]) => names.length === selected.size && names.every(n => selected.has(n));

  // --- Month by month, stacked by category ---
  const months = useMemo(() => monthIdxs.map(mi => {
    const rows = chosen.filter(s => s.monthIdx === mi);
    const byCat = new Map<string, number>();
    rows.forEach(r => byCat.set(r.cat, (byCat.get(r.cat) || 0) + r.amount));
    return { mi, total: sum(rows.map(r => r.amount)), segs: catStats.filter(c => byCat.has(c.name)).map(c => ({ cat: c.name, value: byCat.get(c.name)! })) };
  }), [chosen, monthIdxs, catStats]);
  const monthTotals = months.map(m => m.total);
  const total = sum(monthTotals);
  // Average over months that have any imported spending, so a 12-month window reaching back
  // before your first import isn't diluted by empty months.
  const dataMonths = Math.max(1, monthIdxs.filter(mi => inRange.some(s => s.monthIdx === mi)).length);
  const avg = total / dataMonths;
  const maxMonth = Math.max(...monthTotals, 1);
  const peak = months.reduce((a, b) => (b.total > a.total ? b : a), months[0]);
  const half = Math.floor(range / 2);
  const firstHalf = sum(monthTotals.slice(0, half));
  const secondHalf = sum(monthTotals.slice(range - half));
  const trend = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
  const trendLabel = `${indexLabel(monthIdxs[range - half])}–${indexLabel(lastIdx)} vs ${indexLabel(monthIdxs[0])}–${indexLabel(monthIdxs[half - 1])}`;

  // --- When the money goes out ---
  const dow = useMemo(() => {
    const a = [0, 0, 0, 0, 0, 0, 0];
    chosen.forEach(s => { a[(new Date(`${s.date.slice(0, 10)}T00:00:00`).getDay() + 6) % 7] += s.amount; });
    return a;
  }, [chosen]);
  const tom = useMemo(() => {
    const a = [0, 0, 0, 0];
    chosen.forEach(s => { const d = Number(s.date.slice(8, 10)); a[d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3] += s.amount; });
    return a;
  }, [chosen]);
  const dowPeak = dow.indexOf(Math.max(...dow));
  const tomPeak = tom.indexOf(Math.max(...tom));

  const merchants = useMemo(() => {
    const map = new Map<string, { name: string; cat: string; total: number; count: number }>();
    chosen.forEach(s => {
      const k = merchantKey(s.desc);
      const e = map.get(k) || { name: s.desc, cat: s.cat, total: 0, count: 0 };
      e.total += s.amount; e.count++;
      map.set(k, e);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 7);
  }, [chosen]);

  // --- Regular payments, detected from repeat payments across all categories ---
  const { bills, habits, billsPerMonth } = useMemo(() => {
    const groups = new Map<string, Spend[]>();
    inRange.forEach(s => { const k = merchantKey(s.desc); groups.set(k, [...(groups.get(k) || []), s]); });
    const bills: RegularPayment[] = [];
    const habits: RegularPayment[] = [];
    groups.forEach(rows => {
      const ms = Array.from(new Set(rows.map(r => r.monthIdx))).sort((a, b) => a - b);
      if (ms.length < 3) return;
      const amounts = rows.map(r => r.amount);
      const avgAmt = mean(amounts);
      const cv = Math.sqrt(mean(amounts.map(x => (x - avgAmt) ** 2))) / avgAmt;
      const nameCounts = new Map<string, number>();
      rows.forEach(r => nameCounts.set(r.desc, (nameCounts.get(r.desc) || 0) + 1));
      // Most common spelling, minus any month/year it carries ("Subscription fee for May 2026").
      const name = Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        .replace(/\s*(for\s+)?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i, '')
        .trim();
      const cats = new Map<string, number>();
      rows.forEach(r => cats.set(r.cat, (cats.get(r.cat) || 0) + 1));
      const category = Array.from(cats.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const totalAmt = sum(amounts);
      const base = { name, category, months: ms, count: rows.length, avg: avgAmt, total: totalAmt };
      if (cv < 0.25 && rows.length / ms.length <= 1.5) {
        const gaps = ms.slice(1).map((m, i) => m - ms[i]);
        const gap = gaps.every(g => g === 1) ? 1 : gaps.every(g => g === 2) ? 2 : 0;
        const schedule = gap === 1 ? 'monthly' : gap === 2 ? 'every 2 months' : 'regular';
        const stale = gap > 0 && lastIdx - ms[ms.length - 1] > gap;
        bills.push({ ...base, stale, note: `${category} · ${schedule}${stale ? ` · nothing since ${FULL_MONTHS[ms[ms.length - 1] % 12]}` : ''}` });
      } else if (rows.length >= 8 && totalAmt >= (currency === 'GBP' ? 50 : 230)) {
        habits.push({ ...base, stale: false, note: `${category} · ${rows.length} payments · ${fmt(totalAmt, 2)} total` });
      }
    });
    bills.sort((a, b) => b.avg - a.avg);
    habits.sort((a, b) => b.total - a.total);
    const dataMonths = Math.max(1, new Set(inRange.map(s => s.monthIdx)).size);
    return { bills: bills.slice(0, 8), habits: habits.slice(0, 6), billsPerMonth: sum(bills.map(b => b.total)) / dataMonths };
    // fmt depends only on currency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, lastIdx, range, currency]);

  const sentence = selected.size === 0
    ? 'Pick at least one category to see its patterns.'
    : `You spend ${fmt(avg)} a month on this. Most of it goes out on ${DOW_FULL[dowPeak]}s and in ${TOM_LONG[tomPeak]} of the month, and it's ${Math.abs(trend) < 0.05 ? 'been flat' : `${trend > 0 ? 'up' : 'down'} ${Math.round(Math.abs(trend) * 100)}%`} in ${trendLabel.replace(' vs ', ' compared with ')}.`;

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const label = 'text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const BAR_H = 190;

  const renderDots = (p: RegularPayment, color: string) => (
    <div className="flex gap-1" aria-label={`Paid in ${p.months.map(m => MONTHS[m % 12]).join(', ')}`}>
      {monthIdxs.map(mi => (
        <span key={mi} className="flex flex-col items-center gap-0.5">
          <span
            className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded ${p.months.includes(mi) ? '' : 'bg-slate-100 dark:bg-neutral-700'}`}
            style={p.months.includes(mi) ? { background: color } : undefined}
          />
          <span className="text-[8px] text-slate-400">{MONTHS[mi % 12][0]}</span>
        </span>
      ))}
    </div>
  );

  if (spends.length === 0) {
    return <div className={`${card} p-10 text-center text-sm text-slate-500`}>No spending to analyse yet.</div>;
  }

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6 flex flex-col gap-4 md:gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Spending patterns</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {FULL_MONTHS[monthIdxs[0] % 12]} {Math.floor(monthIdxs[0] / 12)} – {FULL_MONTHS[lastIdx % 12]} {Math.floor(lastIdx / 12)} · up to your latest imported month
          </p>
        </div>
        <div role="group" aria-label="Range" className="flex gap-1 p-1 bg-slate-200/70 dark:bg-neutral-800 rounded-xl self-start">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm transition-colors ${range === r ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
            >
              {r} months
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 md:gap-6 items-start">
        {/* Category picker */}
        <section aria-label="Choose categories" className={`${card} p-3 md:p-4 flex flex-col gap-3`}>
          <div>
            <h2 className={`${label} mb-2 px-1`}>Quick picks</h2>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => {
                const on = presetActive(p.names);
                return (
                  <button
                    key={p.label}
                    onClick={() => selectOnly(p.names)}
                    aria-pressed={on}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h2 className={`${label} mb-1 px-1`}>Categories</h2>
            <div className="flex flex-wrap lg:flex-col gap-1">
              {catStats.map(c => {
                const on = selected.has(c.name);
                const emoji = getCategoryEmoji && c.catId ? getCategoryEmoji(c.catId) : '';
                return (
                  <button
                    key={c.name}
                    onClick={() => toggle(c.name)}
                    aria-pressed={on}
                    className={`flex items-center gap-2 lg:gap-2.5 px-2.5 py-1.5 lg:py-2 rounded-lg text-left transition-colors border lg:border-0 ${on ? 'bg-slate-50 dark:bg-neutral-700/60 border-slate-200 dark:border-neutral-600' : 'border-slate-100 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700/40'}`}
                  >
                    <span aria-hidden className="w-4 h-4 rounded-[5px] shrink-0 border-2" style={{ borderColor: c.color, background: on ? c.color : 'transparent' }} />
                    <span className={`flex-1 text-xs lg:text-[13px] ${on ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>
                      {emoji && <span className="mr-1">{emoji}</span>}{c.name}
                    </span>
                    <span className="hidden lg:inline text-xs text-slate-500 dark:text-neutral-400">{fmt(c.total)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 md:gap-6 min-w-0">
          {/* Summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {[
              { l: `Total, ${range} months`, v: fmt(total) },
              { l: 'Per month', v: fmt(avg) },
              { l: 'Busiest month', v: selected.size ? `${indexLabel(peak.mi)} · ${fmt(peak.total)}` : '–' },
              { l: trendLabel, v: !selected.size ? '–' : Math.abs(trend) < 0.05 ? 'Flat' : `${trend > 0 ? '↑' : '↓'} ${Math.round(Math.abs(trend) * 100)}%`, c: Math.abs(trend) < 0.05 ? '' : trend > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400' },
            ].map(k => (
              <div key={k.l} className={`${card} px-4 py-3 md:px-5 md:py-4`}>
                <div className={label}>{k.l}</div>
                <div className={`text-lg md:text-2xl font-semibold mt-1 text-slate-900 dark:text-neutral-100 ${k.c || ''}`}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Month by month */}
          <section className={`${card} p-4 md:p-6`}>
            <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-1">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">Month by month</h2>
              <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">Dashed line = your average for this selection</span>
            </div>
            <p className="text-xs md:text-sm text-slate-600 dark:text-neutral-300 mt-1 mb-4">{sentence}</p>
            <div className="relative overflow-x-auto">
              <div className="relative grid gap-2 md:gap-6 items-end px-1 md:px-4" style={{ gridTemplateColumns: `repeat(${range}, minmax(${range === 12 ? 28 : 40}px, 1fr))`, height: BAR_H + 50 }}>
                {selected.size > 0 && (
                  <div aria-hidden className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-400" style={{ bottom: Math.round((avg / maxMonth) * BAR_H) + 22 }} />
                )}
                {months.map(m => (
                  <div key={m.mi} className="flex flex-col items-center justify-end gap-1.5 h-full">
                    <span className="text-[10px] md:text-xs font-semibold text-slate-800 dark:text-neutral-200 whitespace-nowrap">{m.total > 0 ? fmt(m.total) : '–'}</span>
                    <div className="w-full max-w-[64px] flex flex-col-reverse rounded overflow-hidden">
                      {m.segs.map(s => (
                        <div key={s.cat} title={`${s.cat}: ${fmt(s.value, 2)}`} style={{ height: Math.max(1, Math.round((s.value / maxMonth) * BAR_H)), background: colorOf[s.cat] }} />
                      ))}
                    </div>
                    <span className="text-[10px] md:text-xs text-slate-500 dark:text-neutral-400">{indexLabel(m.mi)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Patterns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <section className={`${card} p-4 md:p-5`}>
              <h2 className="text-sm md:text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Day of the week</h2>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mb-3">Busiest: {selected.size ? DOW_FULL[dowPeak] : '–'}</p>
              <div className="grid grid-cols-7 gap-1.5 items-end h-28">
                {dow.map((v, i) => (
                  <div key={i} className="flex flex-col items-center justify-end gap-1 h-full" title={`${DOW_FULL[i]}: ${fmt(v)}`}>
                    <div className={`w-full rounded-sm ${i === dowPeak ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-900'}`} style={{ height: Math.max(2, Math.round((v / Math.max(...dow, 1)) * 88)) }} />
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400">{DOW[i]}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className={`${card} p-4 md:p-5`}>
              <h2 className="text-sm md:text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Time of the month</h2>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mb-3">Heaviest: {selected.size ? `days ${TOM[tomPeak]}` : '–'}</p>
              <div className="grid grid-cols-4 gap-2 items-end h-28">
                {tom.map((v, i) => (
                  <div key={i} className="flex flex-col items-center justify-end gap-1 h-full">
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-neutral-300">{fmt(v)}</span>
                    <div className={`w-full rounded-sm ${i === tomPeak ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-900'}`} style={{ height: Math.max(2, Math.round((v / Math.max(...tom, 1)) * 70)) }} />
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400">{TOM[i]}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className={`${card} p-4 md:p-5`}>
              <h2 className="text-sm md:text-[15px] font-semibold text-slate-900 dark:text-neutral-100 mb-2">Where it goes</h2>
              {merchants.length === 0 && <p className="text-xs text-slate-500">Nothing selected.</p>}
              {merchants.map(m => (
                <div key={m.name} className="flex items-center justify-between gap-2 py-1.5 border-t border-slate-100 dark:border-neutral-700">
                  <span className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf[m.cat] }} />
                    <span className="text-xs md:text-[13px] truncate text-slate-800 dark:text-neutral-200">{m.name}</span>
                  </span>
                  <span className="text-xs md:text-[13px] font-semibold whitespace-nowrap text-slate-900 dark:text-neutral-100">{fmt(m.total)}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      {/* Regular payments */}
      <section className={`${card} p-4 md:p-6`}>
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-1">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">Regular payments we spotted</h2>
          <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">Found automatically from repeat payments. Nothing to tag.</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mt-4">
          {[
            { title: 'Bills · same amount, on a schedule', side: bills.length ? `≈ ${fmt(billsPerMonth)} a month` : '', rows: bills, color: '#312e81', empty: 'No regular bills found in this range.' },
            { title: 'Habits · frequent, amounts vary', side: 'Average per payment', rows: habits, color: '#f59e0b', empty: 'No frequent habits found in this range.' },
          ].map(col => (
            <div key={col.title}>
              <div className="flex justify-between items-baseline pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{col.title}</h3>
                <span className="text-[11px] text-slate-500 dark:text-neutral-400">{col.side}</span>
              </div>
              {col.rows.length === 0 && <p className="text-xs text-slate-500 py-2">{col.empty}</p>}
              {col.rows.map(p => (
                <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto_80px] md:grid-cols-[minmax(0,1fr)_auto_96px] gap-3 items-center py-2.5 border-t border-slate-100 dark:border-neutral-700">
                  <div className="min-w-0">
                    <div className="text-[13px] md:text-sm font-medium truncate text-slate-900 dark:text-neutral-100">{p.name}</div>
                    <div className={`text-[11px] md:text-xs truncate ${p.stale ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400'}`}>{p.note}</div>
                  </div>
                  <div className={range === 12 ? 'hidden md:block' : ''}>{renderDots(p, col.color)}</div>
                  <span className="text-[13px] md:text-sm font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(p.avg, 2)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SpendingPatterns;
