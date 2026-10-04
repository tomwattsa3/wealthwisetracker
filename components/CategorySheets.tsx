import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { Transaction } from '../types';
import SegmentedControl from './SegmentedControl';
import { MODAL_TRANSITION, SHEET_TRANSITION } from '../lib/motion';
import {
  MONTHS, FULL_MONTHS, TOM, PERIODS, PeriodId, keyToIndex, monthKey, indexLabel, indexToKey, daysIn, localToday,
  inWindow, computeWindow, merchantKey, sum, PeriodWindow,
} from '../lib/periods';

interface CategorySheetsProps {
  transactions: Transaction[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
  // Jump to the Transactions tab filtered to this category (and subcategory) over this date range.
  onViewTransactions: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
  // Render only the See all panel for one category (e.g. opened from the phone Home), on a year
  // and optionally one month of it. onPanelClose runs once it has slid away.
  panelOnly?: { cat: string; year: number; month: number | null } | null;
  onPanelClose?: () => void;
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

const CategorySheets: React.FC<CategorySheetsProps> = ({ transactions, currency, getCategoryEmoji, onViewTransactions, panelOnly, onPanelClose }) => {
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

  // The open "See all" panel and its filters. Laid out like the Breakdown panel: a side panel on
  // desktop, a bottom sheet on phones. `pm` narrows it to one month (null = the whole scope).
  const [open, setOpen] = useState<string | null>(panelOnly?.cat ?? null);
  const [sub, setSub] = useState<string>('all');
  const [pm, setPm] = useState<number | null>(panelOnly?.month ?? null);
  // Date/Amount and Summarise share the Breakdown panel's saved choices.
  const [sortBy, setSortBy] = useState<'date' | 'amount'>(() => {
    try { return localStorage.getItem('breakdownDetailSort') === 'amount' ? 'amount' : 'date'; } catch { return 'date'; }
  });
  const [summarise, setSummarise] = useState(() => {
    try { return localStorage.getItem('breakdownSummarise') === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('breakdownDetailSort', sortBy); localStorage.setItem('breakdownSummarise', summarise ? '1' : '0'); } catch { /* not persisted */ } }, [sortBy, summarise]);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const on = () => setIsPhone(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  const dragControls = useDragControls();

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
  const firstIdx = useMemo(() => (rows.length ? Math.min(...rows.map(r => r.monthIdx)) : lastIdx), [rows, lastIdx]);
  // Phones just pick a year (its imported months); desktop keeps the period presets.
  const [phoneYear, setPhoneYear] = useState<number | null>(panelOnly?.year ?? null);
  const year = phoneYear ?? Math.floor(lastIdx / 12);
  const yearWin = useMemo<PeriodWindow>(() => {
    const from = Math.max(year * 12, firstIdx), to = Math.min(year * 12 + 11, lastIdx);
    const monthIdxs = from <= to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : Array.from({ length: 12 }, (_, i) => year * 12 + i);
    const last = monthIdxs[monthIdxs.length - 1];
    return {
      start: `${indexToKey(monthIdxs[0])}-01`,
      end: `${indexToKey(last)}-${String(daysIn(last)).padStart(2, '0')}`,
      monthIdxs, single: false, dayLimit: 0, label: String(year), name: String(year), prev: null,
    };
  }, [year, firstIdx, lastIdx]);
  const win = useMemo(() => (isPhone || panelOnly ? yearWin : computeWindow(period, today, lastIdx)), [isPhone, panelOnly, yearWin, period, today, lastIdx]);
  const inRange = useMemo(() => rows.filter(r => inWindow(r.date, win)), [rows, win]);

  // Months picked from the month strip (empty = every month in the period). Any combination,
  // not just a continuous range; cleared whenever the period changes.
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());
  useEffect(() => { setSelMonths(new Set()); }, [period, year, isPhone]);
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

  const openSheet = (cat: string) => { setOpen(cat); setSub('all'); setPm(selSorted.length === 1 ? selSorted[0] : null); };
  const sheet = open ? sheets.find(s => s.cat === open) || null : null;
  const panel = useMemo(() => {
    if (!sheet) return null;
    const catAll = inRange.filter(r => r.cat === sheet.cat);
    // One month when picked, otherwise whatever the page is scoped to.
    const base = pm !== null ? catAll.filter(r => r.monthIdx === pm) : sheet.list;
    const subs = new Map<string, number>();
    base.forEach(r => subs.set(r.sub, (subs.get(r.sub) || 0) + r.amount));
    const filtered = base.filter(r => sub === 'all' || r.sub === sub);
    const perCol = cols.map(c => sum(catAll.filter(r => (sub === 'all' || r.sub === sub) && colOf(r) === c.key).map(r => r.amount)));
    const tx = [...filtered].sort((a, b) => (sortBy === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)));
    const merchants = groupMerchants(filtered);
    if (sortBy === 'date') {
      const latest = new Map<string, string>();
      filtered.forEach(r => { const k = merchantKey(r.desc); if (!latest.has(k) || r.date > latest.get(k)!) latest.set(k, r.date); });
      merchants.sort((a, b) => (latest.get(merchantKey(b.name)) || '').localeCompare(latest.get(merchantKey(a.name)) || ''));
    }
    return {
      base, subs: Array.from(subs.entries()).sort((a, b) => b[1] - a[1]),
      merchants, tx, perCol, baseTotal: sum(base.map(r => r.amount)), filteredTotal: sum(filtered.map(r => r.amount)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sub, win, inRange, pm, sortBy]);

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%');
  const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

  // See all: side panel on desktop, bottom sheet on phones (same content as Breakdown's)
  const panelPortal = createPortal(
        <AnimatePresence onExitComplete={() => { if (panelOnly) onPanelClose?.(); }}>
          {sheet && panel && (
            <motion.div className="fixed inset-0 z-[100]" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
              <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={() => setOpen(null)} />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={`${sheet.cat} details`}
                className={isPhone
                  ? 'absolute inset-x-0 bottom-0 h-[86dvh] bg-white dark:bg-neutral-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden'
                  : 'absolute top-0 right-0 bottom-0 w-[480px] bg-white dark:bg-neutral-800 shadow-2xl flex flex-col'}
                initial={isPhone ? { y: '100%' } : { x: '100%' }}
                animate={isPhone ? { y: 0 } : { x: 0 }}
                exit={isPhone ? { y: '100%' } : { x: '100%' }}
                transition={SHEET_TRANSITION}
                drag={isPhone ? 'y' : false}
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 600) setOpen(null); }}
              >
                {isPhone && (
                  <div onPointerDown={(e) => dragControls.start(e)} className="shrink-0 flex justify-center pt-2.5 pb-2 touch-none cursor-grab">
                    <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-neutral-600" />
                  </div>
                )}
                {(() => {
                  const idx = pm !== null ? win.monthIdxs.indexOf(pm) : -1;
                  const months = win.single ? [] : win.monthIdxs;
                  const prev = pm === null ? months[months.length - 1] : idx > 0 ? months[idx - 1] : undefined;
                  const next = pm !== null && idx < months.length - 1 ? months[idx + 1] : undefined;
                  const title = pm !== null ? `${MONTHS[pm % 12]} ${Math.floor(pm / 12)}` : scopeLabel;
                  const start = pm !== null ? `${indexToKey(pm)}-01` : scopeStart;
                  const end = pm !== null ? `${indexToKey(pm)}-${String(daysIn(pm)).padStart(2, '0')}` : scopeEnd;
                  const mx = Math.max(...panel.perCol, 1);
                  const avgMonth = panel.perCol.reduce((a, b) => a + b, 0) / Math.max(panel.perCol.length, 1);
                  return (
                    <>
                      <div className={`px-5 ${isPhone ? 'pt-1' : 'pt-5'} pb-3 flex flex-col gap-3 border-b border-slate-100 dark:border-neutral-700`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {months.length > 1 && <button onClick={() => prev !== undefined && setPm(prev)} disabled={prev === undefined} aria-label="Previous month" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 disabled:opacity-30">‹</button>}
                            <button onClick={() => setPm(null)} disabled={pm === null} className="min-w-[84px] px-1 text-center text-[13px] font-semibold text-indigo-700 dark:text-indigo-300" title={pm !== null ? 'Show the whole period' : undefined}>{title}</button>
                            {months.length > 1 && <button onClick={() => next !== undefined && setPm(next)} disabled={next === undefined} aria-label="Next month" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 disabled:opacity-30">›</button>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {pm !== null && (
                              <button onClick={() => setPm(null)} className="h-8 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold whitespace-nowrap hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                                ← All months
                              </button>
                            )}
                            <button onClick={() => setOpen(null)} aria-label="Close" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center"><X size={15} /></button>
                          </div>
                        </div>
                        <div className="flex justify-between items-end gap-3">
                          <div className="min-w-0">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100 truncate">
                              {getCategoryEmoji && sheet.catId ? <span className="mr-1.5">{getCategoryEmoji(sheet.catId)}</span> : null}{sheet.cat}
                            </h2>
                            <p className="text-xs mt-0.5 text-slate-500 dark:text-neutral-400">
                              {panel.base.length} {panel.base.length === 1 ? 'transaction' : 'transactions'}{pm === null ? ` · ${pct(panel.baseTotal)} of spending` : ''}
                            </p>
                          </div>
                          <span className="text-2xl font-bold whitespace-nowrap text-slate-900 dark:text-neutral-100">{fmt(panel.filteredTotal, 2)}</span>
                        </div>

                        {/* Month bars across the period: tap one to look at just that month, tap again for all.
                            The label shows the average month over the period. */}
                        {!win.single && panel.perCol.length > 1 && (
                          <div className="-mb-1.5 flex justify-end items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-neutral-400">
                            <span>Avg <strong className="font-semibold text-slate-800 dark:text-neutral-100">{fmt(avgMonth)}</strong> / month · {panel.perCol.length} months</span>
                          </div>
                        )}
                        <div className="grid gap-1.5 items-end h-[92px]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                          {panel.perCol.map((v, i) => {
                            const on = !win.single && pm === cols[i].key;
                            const inScope = win.single || (pm === null && (!selMonths.size || selMonths.has(cols[i].key)));
                            return (
                              <button
                                key={cols[i].key}
                                onClick={() => { if (!win.single) setPm(on ? null : cols[i].key); }}
                                aria-pressed={on}
                                aria-label={`${cols[i].label}: ${fmt(v, 2)}`}
                                className="flex flex-col items-center justify-end gap-1 h-full group"
                              >
                                <span className={`text-[10px] font-semibold whitespace-nowrap ${on ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-neutral-400'} ${cols.length > 9 ? 'hidden' : ''}`}>{v > 0 ? fmt(v) : '–'}</span>
                                <span className={`w-full rounded-t ${v <= 0 ? 'bg-slate-100 dark:bg-neutral-700' : on || (inScope && pm === null) ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-900 group-hover:bg-indigo-300'}`} style={{ height: v > 0 ? Math.max(3, Math.round((v / mx) * 52)) : 2 }} />
                                <span className={`text-[10px] ${on ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{cols[i].label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {panel.subs.length > 1 && (
                          <div className="flex flex-wrap gap-1.5">
                            {[['all', panel.baseTotal] as [string, number], ...panel.subs].map(([k, v]) => {
                              const on = sub === k;
                              return (
                                <button key={k} onClick={() => setSub(k)} aria-pressed={on} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300'}`}>
                                  {k === 'all' ? 'All' : k} · {fmt(v)}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex justify-between items-center">
                          <SegmentedControl
                            layoutId="sheetsPanelSortPill"
                            options={[{ id: 'date', label: 'Date' }, { id: 'amount', label: 'Amount' }]}
                            value={sortBy}
                            onChange={(id) => setSortBy(id as 'date' | 'amount')}
                            activeTextClassName="text-[#635bff] dark:text-[#8b85ff]"
                            inactiveTextClassName="text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300"
                            optionClassName="text-[11px]"
                          />
                          {panel.tx.length > 1 && (
                            <button onClick={() => setSummarise(v => !v)} aria-pressed={summarise} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${summarise ? 'bg-[#635bff] border-[#635bff] text-white' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300'}`}>
                              Summarise by merchant
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5">
                        {panel.tx.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No transactions</p>}
                        {summarise
                          ? panel.merchants.map(m => (
                              <div key={m.name} className="grid grid-cols-[44px_minmax(0,1fr)_90px] gap-3 items-center py-2.5 border-b border-slate-100 dark:border-neutral-700">
                                <span className="text-xs text-slate-500 dark:text-neutral-400">×{m.count}</span>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={m.name}>{m.name}</div>
                                  {m.sub !== NO_SUB && <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">{m.sub}</div>}
                                </div>
                                <span className="text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(m.total, 2)}</span>
                              </div>
                            ))
                          : panel.tx.map(r => (
                              <div key={r.id} className="grid grid-cols-[52px_minmax(0,1fr)_90px] gap-3 items-center py-2.5 border-b border-slate-100 dark:border-neutral-700">
                                <span className="text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap">{shortDate(r.date)}</span>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={r.desc}>{r.desc}</div>
                                  {r.sub !== NO_SUB && <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">{r.sub}</div>}
                                </div>
                                <span className="text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(r.amount, 2)}</span>
                              </div>
                            ))}
                      </div>

                      <div className="px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500 dark:text-neutral-400">
                          {panel.tx.length} {panel.tx.length === 1 ? 'transaction' : 'transactions'}{summarise ? ` · ${panel.merchants.length} merchants` : ''}
                        </span>
                        <button
                          onClick={() => { onViewTransactions(sheet.catId, sub === 'all' || sub === NO_SUB ? null : sub, start, end); setOpen(null); }}
                          disabled={!sheet.catId}
                          className="text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline disabled:opacity-50"
                        >
                          Open in Transactions →
                        </button>
                      </div>
                    </>
                  );
                })()}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      );

  if (panelOnly) return panelPortal;

  return (
    <div className="pb-24 md:pb-6 flex flex-col gap-4 md:gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header */}
      <div className="flex flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Category Sheets</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {scopeLabel} · {fmt(total)} spent
          </p>
        </div>
        {/* Phones: just a year picker */}
        <div className="md:hidden shrink-0 self-start mt-1 flex items-center bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl p-0.5 shadow-sm">
          <button onClick={() => setPhoneYear(year - 1)} disabled={year <= Math.floor(firstIdx / 12)} aria-label="Previous year" className="w-8 h-8 rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">‹</button>
          <span className="min-w-[48px] text-center text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{year}</span>
          <button onClick={() => setPhoneYear(year + 1)} disabled={year >= Math.floor(lastIdx / 12)} aria-label="Next year" className="w-8 h-8 rounded-lg text-lg text-slate-900 dark:text-neutral-100 disabled:text-slate-300 dark:disabled:text-neutral-600">›</button>
        </div>
        <div role="group" aria-label="Period" className="hidden md:flex gap-1 p-1 bg-slate-200/70 dark:bg-neutral-800 rounded-xl self-start max-w-full overflow-x-auto hide-scrollbar">
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

      {panelPortal}
    </div>
  );
};

export default CategorySheets;
