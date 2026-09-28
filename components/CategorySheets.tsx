import React, { useEffect, useMemo, useState } from 'react';
import { Transaction } from '../types';
import {
  MONTHS, FULL_MONTHS, TOM, PERIODS, PeriodId, keyToIndex, monthKey, indexLabel, indexToKey, daysIn, localToday,
  inWindow, computeWindow, merchantKey, sum,
} from '../lib/periods';

interface CategorySheetsProps {
  transactions: Transaction[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
  // Jump to the Transactions tab filtered to this category (and subcategory) over this date range.
  onViewTransactions: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
}

const STORAGE_KEY = 'categorySheets';
const NO_SUB = 'No subcategory';

interface Row {
  id: string;
  cat: string;
  catId: string;
  sub: string;
  date: string;
  monthIdx: number;
  desc: string;
  amount: number;
}

const CategorySheets: React.FC<CategorySheetsProps> = ({ transactions, currency, getCategoryEmoji, onViewTransactions }) => {
  const [period, setPeriod] = useState<PeriodId>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').period;
      return PERIODS.some(p => p.id === saved) ? saved : '6m';
    } catch {
      return '6m';
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ period })); } catch { /* not persisted */ }
  }, [period]);

  // The open "See all" panel and its filters.
  const [open, setOpen] = useState<string | null>(null);
  const [sub, setSub] = useState<string>('all');
  const [mode, setMode] = useState<'merchant' | 'tx'>('merchant');
  const openSheet = (cat: string) => { setOpen(cat); setSub('all'); setMode('merchant'); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const fmt = (v: number, decimals = 0) => {
    const n = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${v < 0 ? '−' : ''}${currency === 'GBP' ? '£' : 'AED '}${n}`;
  };

  // Same spending rule as the Dashboard: every money-out row that isn't excluded.
  const rows = useMemo<Row[]>(() => transactions
    .filter(t => t.type === 'EXPENSE' && !t.excluded && t.categoryName && /^\d{4}-\d{2}-\d{2}/.test(t.date))
    .map(t => ({
      id: t.id,
      cat: t.categoryName.trim().replace(/Fee's/i, 'Fees'),
      catId: t.categoryId,
      sub: (t.subcategoryName || '').trim() || NO_SUB,
      date: t.date.slice(0, 10),
      monthIdx: keyToIndex(monthKey(t.date)),
      desc: (t.description || 'Unknown').trim(),
      amount: Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0,
    }))
    .filter(r => r.amount > 0), [transactions, currency]);

  const today = localToday();
  const lastIdx = useMemo(() => (rows.length ? Math.max(...rows.map(r => r.monthIdx)) : keyToIndex(monthKey(today))), [rows, today]);
  const win = useMemo(() => computeWindow(period, today, lastIdx), [period, today, lastIdx]);
  const inRange = useMemo(() => rows.filter(r => inWindow(r.date, win)), [rows, win]);

  // Months picked from the month strip (empty = every month in the period). Any combination,
  // not just a continuous range; cleared whenever the period changes.
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());
  useEffect(() => { setSelMonths(new Set()); }, [period]);
  const toggleMonth = (mi: number) => setSelMonths(prev => {
    const next = new Set(prev);
    if (next.has(mi)) next.delete(mi); else next.add(mi);
    return next;
  });
  const monthTotals = useMemo(() => win.monthIdxs.map(mi => sum(inRange.filter(r => r.monthIdx === mi).map(r => r.amount))), [inRange, win]);
  const scoped = useMemo(() => (selMonths.size ? inRange.filter(r => selMonths.has(r.monthIdx)) : inRange), [inRange, selMonths]);
  const total = sum(scoped.map(r => r.amount));
  const selSorted = Array.from(selMonths).sort((a, b) => a - b);
  const isContiguous = selSorted.every((m, i) => i === 0 || m === selSorted[i - 1] + 1);
  const scopeLabel = !selSorted.length
    ? win.label
    : selSorted.length === 1
      ? `${FULL_MONTHS[selSorted[0] % 12]} ${Math.floor(selSorted[0] / 12)}`
      : isContiguous
        ? `${MONTHS[selSorted[0] % 12]} – ${MONTHS[selSorted[selSorted.length - 1] % 12]} ${Math.floor(selSorted[selSorted.length - 1] / 12)}`
        : `${selSorted.map(m => MONTHS[m % 12]).join(', ')} ${Math.floor(selSorted[selSorted.length - 1] / 12)}`;
  // Date range handed to the Transactions tab: the span of the picked months (Transactions can
  // only filter one continuous range, so a gap-y selection opens the full span).
  const scopeStart = selSorted.length ? `${indexToKey(selSorted[0])}-01` : win.start;
  const scopeEndRaw = selSorted.length ? `${indexToKey(selSorted[selSorted.length - 1])}-${String(daysIn(selSorted[selSorted.length - 1])).padStart(2, '0')}` : win.end;
  const scopeEnd = scopeEndRaw > win.end ? win.end : scopeEndRaw;

  // Month columns for the panel's mini chart (weeks of the month for a single-month period).
  const cols = win.single
    ? TOM.map((l, i) => ({ key: i, label: l }))
    : win.monthIdxs.map(mi => ({ key: mi, label: indexLabel(mi) }));
  const colOf = (r: Row) => {
    if (!win.single) return r.monthIdx;
    const d = Number(r.date.slice(8, 10));
    return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
  };

  const groupMerchants = (list: Row[]) => {
    const map = new Map<string, { name: string; sub: string; total: number; count: number; names: Map<string, number> }>();
    list.forEach(r => {
      const k = merchantKey(r.desc);
      const e = map.get(k) || { name: r.desc, sub: r.sub, total: 0, count: 0, names: new Map<string, number>() };
      e.total += r.amount; e.count++;
      e.names.set(r.desc, (e.names.get(r.desc) || 0) + 1);
      map.set(k, e);
    });
    return Array.from(map.values())
      .map(e => ({ ...e, name: Array.from(e.names.entries()).sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => b.total - a.total);
  };

  const sheets = useMemo(() => {
    const byCat = new Map<string, Row[]>();
    scoped.forEach(r => byCat.set(r.cat, [...(byCat.get(r.cat) || []), r]));
    return Array.from(byCat.entries())
      .map(([cat, list]) => ({ cat, catId: list[0].catId, list, total: sum(list.map(r => r.amount)), top: groupMerchants(list).slice(0, 3) }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped]);

  const sheet = open ? sheets.find(s => s.cat === open) || null : null;
  const panel = useMemo(() => {
    if (!sheet) return null;
    const subs = new Map<string, number>();
    sheet.list.forEach(r => subs.set(r.sub, (subs.get(r.sub) || 0) + r.amount));
    const filtered = sheet.list.filter(r => sub === 'all' || r.sub === sub);
    // Whole period for context; picked months are highlighted in the chart.
    const catAll = inRange.filter(r => r.cat === sheet.cat);
    const perCol = cols.map(c => sum(catAll.filter(r => colOf(r) === c.key).map(r => r.amount)));
    return {
      subs: Array.from(subs.entries()).sort((a, b) => b[1] - a[1]),
      merchants: groupMerchants(filtered),
      tx: [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
      perCol,
      filteredTotal: sum(filtered.map(r => r.amount)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sub, win, inRange]);

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%');
  const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

  return (
    <div className="pb-24 md:pb-6 flex flex-col gap-4 md:gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Category Sheets</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {scopeLabel} · {fmt(total)} spent
          </p>
        </div>
        <div role="group" aria-label="Period" className="flex gap-1 p-1 bg-slate-200/70 dark:bg-neutral-800 rounded-xl self-start max-w-full overflow-x-auto hide-scrollbar">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm whitespace-nowrap transition-colors ${period === p.id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Month strip: pick any months within the period */}
      {!win.single && win.monthIdxs.length > 1 && (
        <div className={`${card} p-2 md:p-3 flex items-center gap-2 overflow-x-auto hide-scrollbar`}>
          <button
            onClick={() => setSelMonths(new Set())}
            aria-pressed={selMonths.size === 0}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${selMonths.size === 0 ? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700'}`}
          >
            All months
          </button>
          <span aria-hidden className="w-px h-8 bg-slate-200 dark:bg-neutral-700 shrink-0" />
          <div role="group" aria-label="Months" className="flex gap-1.5 flex-1">
            {win.monthIdxs.map((mi, i) => {
              const on = selMonths.has(mi);
              const empty = monthTotals[i] === 0;
              return (
                <button
                  key={mi}
                  onClick={() => toggleMonth(mi)}
                  disabled={empty}
                  aria-pressed={on}
                  title={empty ? `${FULL_MONTHS[mi % 12]}: nothing imported` : `${FULL_MONTHS[mi % 12]}: ${fmt(monthTotals[i], 2)}`}
                  className={`flex-1 min-w-[58px] flex flex-col items-center px-2 py-1.5 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-default ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-transparent text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700'}`}
                >
                  <span className="text-xs font-semibold">{MONTHS[mi % 12]}</span>
                  <span className={`text-[10px] ${on ? 'text-indigo-100' : 'text-slate-500 dark:text-neutral-400'}`}>{empty ? '–' : fmt(monthTotals[i])}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sheets.length === 0 ? (
        <div className={`${card} p-6 md:p-8 text-center`}>
          <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-neutral-100">No spending imported for {win.name} yet</p>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-1">
            Your latest transactions are from {FULL_MONTHS[lastIdx % 12]} {Math.floor(lastIdx / 12)}. Pick a longer period or import newer statements.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {sheets.map(s => {
            const emoji = getCategoryEmoji && s.catId ? getCategoryEmoji(s.catId) : '';
            return (
              <article key={s.cat} className={`${card} p-4 md:p-5 flex flex-col gap-2.5 ${open === s.cat ? 'ring-2 ring-indigo-500 border-transparent' : ''}`}>
                <div className="flex justify-between items-baseline gap-2">
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{emoji && <span className="mr-1">{emoji}</span>}{s.cat}</h2>
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100 whitespace-nowrap">{fmt(s.total, 2)}</span>
                </div>
                <div className="h-1.5 rounded bg-slate-100 dark:bg-neutral-700 overflow-hidden">
                  <div className="h-full rounded bg-indigo-500" style={{ width: `${Math.max(1, (s.total / total) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-neutral-400">{pct(s.total)} of spending · {s.list.length} {s.list.length === 1 ? 'transaction' : 'transactions'}</span>
                <div className="border-t border-slate-100 dark:border-neutral-700 pt-0.5">
                  {s.top.map(m => (
                    <div key={m.name} className="flex justify-between gap-2 py-1.5 text-xs">
                      <span className="truncate text-slate-700 dark:text-neutral-300">{m.name}</span>
                      <span className="font-medium whitespace-nowrap text-slate-900 dark:text-neutral-100">{fmt(m.total, 2)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => openSheet(s.cat)} className="mt-auto self-start py-1 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">
                  See all →
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* See all panel */}
      {sheet && panel && (
        <div className="fixed inset-0 z-[100]">
          <button aria-label="Close panel" onClick={() => setOpen(null)} className="absolute inset-0 w-full h-full bg-slate-900/40 cursor-default" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${sheet.cat} details`}
            className="absolute top-0 right-0 bottom-0 w-full sm:w-[560px] bg-white dark:bg-neutral-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            <div className="p-5 md:p-7 pb-4 flex flex-col gap-4 border-b border-slate-100 dark:border-neutral-700">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Category sheet</div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-neutral-100 truncate">
                    {getCategoryEmoji && sheet.catId ? <span className="mr-1.5">{getCategoryEmoji(sheet.catId)}</span> : null}{sheet.cat}
                  </h2>
                  <div className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">
                    {sheet.list.length} transactions · {pct(sheet.total)} of spending · {scopeLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xl md:text-2xl font-bold text-slate-900 dark:text-neutral-100">{fmt(sheet.total, 2)}</span>
                  <button onClick={() => setOpen(null)} aria-label="Close" className="w-9 h-9 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center">✕</button>
                </div>
              </div>

              {/* Spend over the period */}
              <div className="grid gap-2 items-end h-20" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                {(() => {
                  const mx = Math.max(...panel.perCol, 1);
                  return panel.perCol.map((v, i) => (
                    <div key={cols[i].key} className="flex flex-col items-center justify-end gap-1 h-full" title={`${cols[i].label}: ${fmt(v, 2)}`}>
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-neutral-300 whitespace-nowrap">{v > 0 ? fmt(v) : '–'}</span>
                      <div className={`w-full rounded-t ${v <= 0 ? 'bg-slate-100 dark:bg-neutral-700' : !selMonths.size || win.single || selMonths.has(cols[i].key) ? 'bg-indigo-400' : 'bg-indigo-100 dark:bg-indigo-950'}`} style={{ height: v > 0 ? Math.max(3, Math.round((v / mx) * 44)) : 2 }} />
                      <span className={`text-[10px] ${!win.single && selMonths.has(cols[i].key) ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{cols[i].label}</span>
                    </div>
                  ));
                })()}
              </div>

              {/* Subcategory filter */}
              {panel.subs.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {[['all', sheet.total] as [string, number], ...panel.subs].map(([k, v]) => {
                    const on = sub === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setSub(k)}
                        aria-pressed={on}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300'}`}
                      >
                        {k === 'all' ? 'All' : k} · {fmt(v)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between items-center">
                <div role="group" aria-label="Show as" className="flex gap-1 p-1 bg-slate-100 dark:bg-neutral-700/60 rounded-lg">
                  {([['merchant', 'By merchant'], ['tx', 'Transactions']] as const).map(([id, l]) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      aria-pressed={mode === id}
                      className={`px-3 py-1 rounded-md text-xs transition-colors ${mode === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-neutral-400">
                  {mode === 'merchant' ? `${panel.merchants.length} merchants` : `${panel.tx.length} transactions · latest first`}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-7">
              {mode === 'merchant'
                ? panel.merchants.map(m => (
                    <div key={m.name} className="grid grid-cols-[minmax(0,1fr)_80px_92px] gap-3 items-center py-2.5 border-b border-slate-100 dark:border-neutral-700">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={m.name}>{m.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">{m.sub === NO_SUB ? '' : `${m.sub} · `}{m.count} {m.count === 1 ? 'payment' : 'payments'}</div>
                      </div>
                      <div className="h-1.5 rounded bg-slate-100 dark:bg-neutral-700 overflow-hidden">
                        <div className="h-full rounded bg-indigo-500" style={{ width: `${(m.total / (panel.merchants[0]?.total || 1)) * 100}%` }} />
                      </div>
                      <span className="text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(m.total, 2)}</span>
                    </div>
                  ))
                : panel.tx.map(r => (
                    <div key={r.id} className="grid grid-cols-[52px_minmax(0,1fr)_84px] gap-3 items-center py-2.5 border-b border-slate-100 dark:border-neutral-700">
                      <span className="text-xs text-slate-500 dark:text-neutral-400">{shortDate(r.date)}</span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={r.desc}>{r.desc}</div>
                        {r.sub !== NO_SUB && <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">{r.sub}</div>}
                      </div>
                      <span className="text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(r.amount, 2)}</span>
                    </div>
                  ))}
            </div>

            <div className="px-5 md:px-7 py-4 border-t border-slate-200 dark:border-neutral-700">
              <button
                onClick={() => { onViewTransactions(sheet.catId, sub === 'all' ? null : sub, scopeStart, scopeEnd); setOpen(null); }}
                disabled={!sheet.catId}
                className="text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline disabled:opacity-50"
              >
                {selSorted.length > 1 && !isContiguous
                  ? `View ${sub === 'all' ? sheet.cat : sub} for ${MONTHS[selSorted[0] % 12]}–${MONTHS[selSorted[selSorted.length - 1] % 12]} in Transactions →`
                  : `View ${sub === 'all' ? `all ${sheet.list.length}` : `${panel.tx.length} ${sub}`} transactions in Transactions →`}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default CategorySheets;
