import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Bank } from '../types';
import { MONTHS, FULL_MONTHS, merchantKey, sum, localToday } from '../lib/periods';
import { MODAL_TRANSITION } from '../lib/motion';
import { userNote } from './TxDetail';
import { useBackClose } from '../lib/backStack';

// Desktop page: everything that came in for a year. Who pays you, how much, how often, and
// when the next one is likely, with the months that covered your spending.
// Same rules as the Dashboard's Money in: income rows, not hidden, not "Excluded".

interface IncomePageProps {
  transactions: Transaction[];
  currency: 'GBP' | 'AED';
  banks?: Bank[];
  onViewPayer?: (name: string, start: string, end: string) => void;
}

const TYPE_COLORS = ['#22C55E', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
const DAY = 86400000;
// The typical gap (median), so one long break doesn't skew "usually every".
const typical = (gaps: number[]) => {
  const g = gaps.filter(x => x > 0).sort((a, b) => a - b);
  if (!g.length) return null;
  return Math.round(g.length % 2 ? g[(g.length - 1) / 2] : (g[g.length / 2 - 1] + g[g.length / 2]) / 2);
};

interface Row { id: string; date: string; year: number; month: number; amount: number; type: string; key: string; name: string; bank: string; gbp: number; aed: number; cat: string; sub: string; note: string }

const IncomePage: React.FC<IncomePageProps> = ({ transactions, currency, banks = [], onViewPayer }) => {
  const amt = (t: Transaction) => Math.abs((currency === 'GBP' ? t.amountGBP : t.amountAED) || 0);
  const fmt = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + (v > 0 && v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('en-GB'));
  const fmt2 = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valid = (t: Transaction) => !t.excluded && t.categoryId !== 'excluded' && (t.categoryName || '').trim().toLowerCase() !== 'excluded' && /^\d{4}-\d{2}-\d{2}/.test(t.date);

  const { allIncome, spendRows, years } = useMemo(() => {
    const income: Row[] = [];
    const spendRows: { k: string; bank: string; amount: number }[] = [];
    transactions.forEach(t => {
      if (!valid(t) || amt(t) <= 0) return;
      const year = Number(t.date.slice(0, 4)), month = Number(t.date.slice(5, 7)) - 1;
      if (t.type === 'INCOME') {
        const name = (t.description || 'Unknown').trim();
        income.push({ id: t.id, date: t.date.slice(0, 10), year, month, amount: amt(t), type: (t.subcategoryName || '').trim() || (t.categoryName || '').trim() || 'Other', key: merchantKey(name) || name.toLowerCase(), name, bank: (t.bankName || '').trim(), gbp: Math.abs(t.amountGBP || 0), aed: Math.abs(t.amountAED || 0), cat: (t.categoryName || '').trim(), sub: (t.subcategoryName || '').trim(), note: userNote(t.notes) });
      } else {
        const k = `${year}-${month}`;
        spendRows.push({ k, bank: (t.bankName || '').trim().toLowerCase(), amount: amt(t) });
      }
    });
    const years = Array.from(new Set(income.map(r => r.year))).sort();
    return { allIncome: income, spendRows, years };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, currency]);

  const today = localToday();
  const [year, setYear] = useState<number>(() => years[years.length - 1] ?? Number(today.slice(0, 4)));
  // The months picked on the strip (null = the whole year); one month or a shift-click range.
  const [range, setRange] = useState<[number, number] | null>(null);
  const inSel = (m: number) => range === null || (m >= range[0] && m <= range[1]);
  const single = range && range[0] === range[1] ? range[0] : null;
  const pickMonth = (m: number, extend = false) => {
    setPayer(null);
    if (!extend && single === m) { setRange(null); return; }
    if (extend && range) { setRange([Math.min(range[0], m), Math.max(range[1], m)]); return; }
    setRange([m, m]);
  };
  const [type, setType] = useState<string | null>(null);
  const [payer, setPayer] = useState<string | null>(null);

  // One bank account, or all of them (money can land in either)
  const [bank, setBank] = useState<string | null>(null);
  const bankList = useMemo(() => {
    const m = new Map<string, { name: string; total: number }>();
    allIncome.forEach(r => { if (!r.bank) return; const k = r.bank.toLowerCase(); const e = m.get(k) || { name: r.bank, total: 0 }; e.total += r.amount; m.set(k, e); });
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total).map(([key, e]) => ({ key, name: e.name }));
  }, [allIncome]);
  const income = useMemo(() => (bank ? allIncome.filter(r => r.bank.toLowerCase() === bank) : allIncome), [allIncome, bank]);
  const spendByMonth = useMemo(() => {
    const m = new Map<string, number>();
    spendRows.forEach(r => { if (!bank || r.bank === bank) m.set(r.k, (m.get(r.k) || 0) + r.amount); });
    return m;
  }, [spendRows, bank]);

  const yearRows = income.filter(r => r.year === year);
  // Months to show: January to the last month with any data (or this month, this year).
  const lastMonth = Math.max(
    ...yearRows.map(r => r.month),
    ...Array.from(spendByMonth.keys()).filter(k => k.startsWith(`${year}-`)).map(k => Number(k.split('-')[1])),
    year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) - 1 : 0,
  );
  const months = Array.from({ length: Math.max(1, lastMonth + 1) }, (_, i) => i);

  const typeTotals = new Map<string, number>();
  yearRows.forEach(r => typeTotals.set(r.type, (typeTotals.get(r.type) || 0) + r.amount));
  const types = Array.from(typeTotals.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const colorOf = (t: string) => { const i = types.indexOf(t); return i >= 0 && i < TYPE_COLORS.length ? TYPE_COLORS[i] : '#94A3B8'; };

  const shown = yearRows.filter(r => inSel(r.month) && (!type || r.type === type));
  const shownTotal = sum(shown.map(r => r.amount));
  const yearTotal = sum(yearRows.map(r => r.amount));

  // Same point last year (for the current year), or the whole of last year.
  const isThisYear = year === Number(today.slice(0, 4));
  const cutoff = `${year - 1}${today.slice(4)}`;
  const lastYearRows = income.filter(r => r.year === year - 1 && (!isThisYear || r.date <= cutoff));
  const lastYearTotal = sum(lastYearRows.map(r => r.amount));

  const monthsWithData = months.filter(m => yearRows.some(r => r.month === m) || (spendByMonth.get(`${year}-${m}`) || 0) > 0);
  const avgIn = monthsWithData.length ? yearTotal / monthsWithData.length : 0;
  const avgOut = monthsWithData.length ? sum(monthsWithData.map(m => spendByMonth.get(`${year}-${m}`) || 0)) / monthsWithData.length : 0;

  // Payers for the current filters
  const payers = useMemo(() => {
    const m = new Map<string, { key: string; name: string; type: string; total: number; rows: Row[] }>();
    shown.forEach(r => {
      const e = m.get(r.key) || { key: r.key, name: r.name, type: r.type, total: 0, rows: [] };
      e.total += r.amount; e.rows.push(r);
      m.set(r.key, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, year, range, type]);
  const yearPayers = useMemo(() => {
    const m = new Map<string, number>();
    yearRows.forEach(r => m.set(r.key, (m.get(r.key) || 0) + r.amount));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, year]);
  const topKey = Array.from(yearPayers.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const top = topKey ? { name: yearRows.find(r => r.key === topKey)!.name, total: yearPayers.get(topKey)! } : null;

  // Last payment of your main kind of income (commission if you have it), and how long it usually takes.
  const mainType = types.find(t => /commission/i.test(t)) || types[0];
  const mainRows = income.filter(r => r.type === mainType).sort((a, b) => a.date.localeCompare(b.date));
  const lastMain = mainRows[mainRows.length - 1];
  const gaps = mainRows.slice(1).map((r, i) => (new Date(r.date).getTime() - new Date(mainRows[i].date).getTime()) / DAY).filter(g => g > 0);
  const avgGap = typical(gaps);
  const daysSince = lastMain ? Math.round((new Date(today).getTime() - new Date(lastMain.date).getTime()) / DAY) : null;
  const overdue = daysSince !== null && avgGap !== null && daysSince > avgGap * 1.5;

  // Chart
  const byMonthType = months.map(m => {
    const t = new Map<string, number>();
    yearRows.filter(r => r.month === m && (!type || r.type === type)).forEach(r => t.set(r.type, (t.get(r.type) || 0) + r.amount));
    return t;
  });
  const chartMax = Math.max(avgOut, ...byMonthType.map(t => sum(Array.from(t.values()))), 1);
  const BAR_H = 190;

  const selAll = payer ? income.filter(r => r.key === payer).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const sel = selAll[0] ? { key: payer!, name: selAll[0].name, type: selAll[0].type } : null;
  // The details slide in from the right; Esc or Back closes them.
  useBackClose(!!sel, () => setPayer(null));
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPayer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);
  const selYear = selAll.filter(r => r.year === year);
  const selGaps = selAll.slice(0, -1).map((r, i) => Math.round((new Date(r.date).getTime() - new Date(selAll[i + 1].date).getTime()) / DAY));
  const selAvgGap = typical(selGaps);
  // Which accounts this payer pays into, and in what currency
  const bankCur = (name: string) => (banks.find(b => b.name.trim().toLowerCase() === name.toLowerCase())?.currency || '').toUpperCase();
  const selBanks = Array.from(new Set(selAll.map(r => r.bank).filter(Boolean)));
  const native = (r: Row) => { const c = bankCur(r.bank); return c === 'AED' ? `AED ${r.aed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c === 'GBP' ? `£${r.gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''; };
  const selYearTotal = sum(selYear.map(r => r.amount));
  const selLargest = selAll.reduce<Row | null>((m, r) => (!m || r.amount > m.amount ? r : m), null);
  const selFirst = selAll[selAll.length - 1];
  const nextExpected = selAll[0] && selAvgGap ? new Date(new Date(selAll[0].date).getTime() + selAvgGap * DAY) : null;
  const dayLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]}${x.getFullYear() !== year ? ` ${x.getFullYear()}` : ''}`; };

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const kicker = 'text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const periodText = range === null ? (isThisYear ? `1 Jan – ${dayLabel(today)} ${year}` : `${year}`) : single !== null ? `${FULL_MONTHS[single]} ${year}` : `${MONTHS[range[0]]} – ${MONTHS[range[1]]} ${year}`;

  if (!allIncome.length) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">Income</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">No money in yet. Once you import payments in, they'll show here by payer.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100">Income</h1>
          <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">
            {periodText}{type ? ` · ${type} only` : ''}{bank ? ` · ${bankList.find(b => b.key === bank)?.name}` : ''} · {fmt(shownTotal)} in
          </p>
        </div>
        {type && (
          <button onClick={() => setType(null)} className="h-9 px-3 rounded-lg text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">Show every type</button>
        )}
      </div>

      {/* Slim month row, as on Transactions: click a month (again for the whole year), shift-click for a range */}
      {(() => {
        const vals = Array.from({ length: 12 }, (_, m) => sum(yearRows.filter(r => r.month === m).map(r => r.amount)));
        const mx = Math.max(...vals, 1);
        const yi = years.indexOf(year);
        const stepYear = (d: number) => { const y = years[yi + d]; if (y) { setYear(y); setRange(null); setPayer(null); } };
        const allOn = range === null;
        return (
          <div className="flex items-center gap-3 -mt-1">
            <div className="flex items-center shrink-0">
              <button onClick={() => stepYear(-1)} disabled={yi <= 0} aria-label="Earlier year" className="w-7 h-8 flex items-center justify-center text-slate-500 dark:text-neutral-400 disabled:text-slate-300 dark:disabled:text-neutral-600">‹</button>
              <span className="text-[13px] font-bold text-slate-900 dark:text-neutral-100">{year}</span>
              <button onClick={() => stepYear(1)} disabled={yi < 0 || yi >= years.length - 1} aria-label="Later year" className="w-7 h-8 flex items-center justify-center text-slate-500 dark:text-neutral-400 disabled:text-slate-300 dark:disabled:text-neutral-600">›</button>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-12 gap-1" role="group" aria-label={`Months of ${year}`}>
              {Array.from({ length: 12 }, (_, m) => m).map(m => {
                const v = vals[m];
                const has = m <= lastMonth;
                const on = has && range !== null && inSel(m);
                return (
                  <button
                    key={m}
                    onClick={(e) => has && pickMonth(m, e.shiftKey)}
                    disabled={!has}
                    aria-pressed={on}
                    title={has ? `${FULL_MONTHS[m]} ${year} · ${fmt(v)} in · click again for the whole year, shift-click for a range` : undefined}
                    className="group h-9 flex flex-col justify-end items-stretch gap-1 rounded-lg px-1 hover:bg-slate-100/70 dark:hover:bg-neutral-800 disabled:hover:bg-transparent"
                  >
                    <span className="flex items-end h-3">
                      <span className={`block w-full rounded-[3px] transition-colors duration-300 ${!has ? 'bg-slate-100 dark:bg-neutral-800' : on ? 'bg-emerald-600' : 'bg-emerald-100 dark:bg-emerald-900/50 group-hover:bg-emerald-200'}`} style={{ height: has && v ? Math.max(3, Math.round((v / mx) * 12)) : 2 }} />
                    </span>
                    <span className={`text-[11.5px] leading-none ${on ? 'font-bold text-slate-900 dark:text-neutral-100' : has ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-300 dark:text-neutral-600'}`}>{MONTHS[m]}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setRange(null); setPayer(null); }} aria-pressed={allOn} className={`relative shrink-0 h-8 px-3 rounded-full text-[12.5px] whitespace-nowrap transition-colors duration-300 ${allOn ? 'text-white font-semibold dark:text-neutral-900' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700'}`}>
              {allOn && <motion.span layoutId="incomeYearChip" className="absolute inset-0 rounded-full bg-slate-900 dark:bg-neutral-100" />}
              <span className="relative">{isThisYear ? 'YTD' : `All ${year}`}</span>
            </button>
            {bankList.length > 1 && (
              <div role="group" aria-label="Bank account" className="shrink-0 flex gap-0.5 p-[3px] bg-slate-200/70 dark:bg-neutral-700/60 rounded-[11px]">
                {[{ key: null as string | null, name: 'All banks' }, ...bankList].map(b => {
                  const on = bank === b.key;
                  return (
                    <button key={b.key ?? 'all'} onClick={() => { setBank(b.key); setPayer(null); }} aria-pressed={on} className={`relative h-8 px-3 rounded-[9px] text-[12.5px] whitespace-nowrap transition-colors ${on ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>
                      {on && <motion.span layoutId="incomeBankPill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} className="absolute inset-0 rounded-[9px] bg-white dark:bg-neutral-600 shadow-sm" />}
                      <span className="relative">{b.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Headline cards */}
      <div className="grid grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr] gap-4">
        <div className={`${card} px-5 py-4`}>
          <div className={kicker}>{range === null ? (isThisYear ? 'Money in this year' : `Money in ${year}`) : `Money in · ${single !== null ? FULL_MONTHS[single] : `${MONTHS[range[0]]} – ${MONTHS[range[1]]}`}`}</div>
          <div className="text-[30px] leading-tight font-bold text-emerald-700 dark:text-emerald-400 mt-1">{fmt(shownTotal)}</div>
          <div className="text-[12.5px] text-slate-500 dark:text-neutral-400">
            {range === null && !type && lastYearTotal > 0
              ? `${yearTotal >= lastYearTotal ? '↑' : '↓'} ${fmt(Math.abs(yearTotal - lastYearTotal))} on ${isThisYear ? 'this point last year' : `${year - 1}`}`
              : `${shown.length} ${shown.length === 1 ? 'payment' : 'payments'}`}
          </div>
        </div>
        <div className={`${card} px-5 py-4`}>
          <div className={kicker}>Average a month</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-neutral-100 mt-1.5">{fmt(avgIn)}</div>
          <div className="text-[12.5px] text-slate-500 dark:text-neutral-400">Spending averages {fmt(avgOut)}</div>
        </div>
        <div className={`${card} px-5 py-4 min-w-0`}>
          <div className={kicker}>Biggest payer</div>
          <div className="text-[17px] font-bold text-slate-900 dark:text-neutral-100 mt-2 truncate">{top?.name || '—'}</div>
          <div className="text-[12.5px] text-slate-500 dark:text-neutral-400">{top ? `${fmt(top.total)} · ${Math.round((top.total / Math.max(yearTotal, 1)) * 100)}% of everything in` : ''}</div>
        </div>
        <div className={`${card} px-5 py-4 min-w-0`}>
          <div className={kicker}>Last {mainType ? mainType.toLowerCase() : 'payment'}</div>
          <div className="text-[17px] font-bold text-slate-900 dark:text-neutral-100 mt-2 truncate">{lastMain ? `${dayLabel(lastMain.date)} · ${lastMain.name}` : '—'}</div>
          <div className={`text-[12.5px] ${overdue ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400'}`}>
            {daysSince === null ? '' : `${daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`}${avgGap ? `${overdue ? ', longer than usual' : ''} (usually every ${avgGap} days)` : ''}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
        {/* Month by month */}
        <section className={`${card} px-5 py-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Month by month</h2>
            <div className="flex flex-wrap gap-1.5">
              {types.map(t => {
                const on = type === t;
                return (
                  <button key={t} onClick={() => { setType(on ? null : t); setPayer(null); }} aria-pressed={on} className={`h-[30px] px-2.5 rounded-full border text-xs flex items-center gap-1.5 capitalize transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white font-semibold dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: colorOf(t) }} />{t}
                    <span className={on ? 'opacity-70' : 'text-slate-400 dark:text-neutral-500'}>{fmt(sum(yearRows.filter(r => r.type === t && inSel(r.month)).map(r => r.amount)))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative mt-4" style={{ height: BAR_H + 44 }}>
            {avgOut > 0 && (
              <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: 22 + (avgOut / chartMax) * BAR_H }}>
                <div className="border-t-[1.5px] border-dashed border-slate-300 dark:border-neutral-600" />
                <span className="absolute right-0 -top-[9px] px-1 bg-white dark:bg-neutral-800 text-[11px] text-slate-400 dark:text-neutral-500">Avg spending {fmt(avgOut)}</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-end gap-2.5">
              {months.map(m => {
                const t = byMonthType[m];
                const total = sum(Array.from(t.values()));
                const on = inSel(m);
                return (
                  <button key={m} onClick={(e) => pickMonth(m, e.shiftKey)} aria-pressed={range !== null && inSel(m)} aria-label={`${FULL_MONTHS[m]}: ${fmt(total)} in`} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400">{total ? fmt(total) : ''}</span>
                    <span className={`w-full max-w-[48px] flex flex-col-reverse rounded-[7px] overflow-hidden transition-opacity duration-300 ${on ? '' : 'opacity-30'}`}>
                      {types.filter(k => t.has(k)).map(k => (
                        <span key={k} className="block w-full transition-[height] duration-500" style={{ height: Math.max(2, Math.round((t.get(k)! / chartMax) * BAR_H)), background: colorOf(k) }} />
                      ))}
                      {!total && <span className="block w-full h-[3px] bg-slate-100 dark:bg-neutral-700" />}
                    </span>
                    <span className={`text-[11.5px] ${range !== null && inSel(m) ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{MONTHS[m]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        {/* Where it lands: which account the money came into, and in which currency */}
        {(() => {
          const bankOf = (name: string) => banks.find(b => b.name.trim().toLowerCase() === name.toLowerCase());
          const groups = new Map<string, { name: string; icon: string; cur: string; total: number; native: number; n: number }>();
          shown.forEach(r => {
            const b = bankOf(r.bank);
            const cur = (b?.currency || '').toUpperCase();
            const k = r.bank.toLowerCase() || '—';
            const e = groups.get(k) || { name: r.bank || 'No bank set', icon: b?.icon || (r.bank ? r.bank.slice(0, 2).toUpperCase() : '?'), cur, total: 0, native: 0, n: 0 };
            e.total += r.amount; e.native += cur === 'AED' ? r.aed : cur === 'GBP' ? r.gbp : 0; e.n++;
            groups.set(k, e);
          });
          const list = Array.from(groups.values()).sort((a, b) => b.total - a.total);
          const byCur = new Map<string, number>();
          list.forEach(g => byCur.set(g.cur || 'Unknown', (byCur.get(g.cur || 'Unknown') || 0) + g.total));
          const curs = Array.from(byCur.entries()).sort((a, b) => b[1] - a[1]);
          const CUR_COLOR: Record<string, string> = { AED: '#0EA5E9', GBP: '#6366F1', Unknown: '#CBD5E1' };
          const nat = (g: { cur: string; native: number }) => g.cur === 'AED' ? `AED ${Math.round(g.native).toLocaleString('en-GB')}` : g.cur === 'GBP' ? `£${Math.round(g.native).toLocaleString('en-GB')}` : '';
          return (
            <section className={`${card} px-5 py-4`}>
              <div className="flex justify-between items-baseline gap-3">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Where it lands</h2>
                <span className="text-xs text-slate-500 dark:text-neutral-400">{periodText}{type ? ` · ${type}` : ''}</span>
              </div>
              {list.length ? (
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_220px] gap-8 items-start">
                  <div>
                    {list.map(g => {
                      const pct = shownTotal ? (g.total / shownTotal) * 100 : 0;
                      return (
                        <div key={g.name} className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center py-2 border-t border-slate-100 dark:border-neutral-700 first:border-t-0">
                          <span className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[11.5px] font-bold bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-300">{g.icon}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{g.name}</span>
                              {g.cur && <span className="px-1.5 rounded text-[10px] font-semibold text-white" style={{ background: CUR_COLOR[g.cur] || '#94A3B8' }}>{g.cur}</span>}
                            </span>
                            <span className="block mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden">
                              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: CUR_COLOR[g.cur] || '#94A3B8' }} />
                            </span>
                            <span className="block mt-1 text-[11.5px] text-slate-500 dark:text-neutral-400">{g.n} {g.n === 1 ? 'payment' : 'payments'} · {Math.round(pct)}%</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[13.5px] font-bold text-emerald-700 dark:text-emerald-400">{fmt(g.total)}</span>
                            {g.cur && g.cur !== currency && <span className="block text-[11px] text-slate-400 dark:text-neutral-500">{nat(g)} received</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">By currency</div>
                    <div className="mt-2 h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-neutral-700">
                      {curs.map(([c, v]) => <span key={c} className="h-full transition-[width] duration-500" style={{ width: `${(v / Math.max(shownTotal, 1)) * 100}%`, background: CUR_COLOR[c] || '#94A3B8' }} />)}
                    </div>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {curs.map(([c, v]) => (
                        <div key={c} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-2 h-2 rounded-full" style={{ background: CUR_COLOR[c] || '#94A3B8' }} />
                          <span className="flex-1 text-slate-600 dark:text-neutral-300">{c === 'AED' ? 'Dirhams' : c === 'GBP' ? 'Pounds' : 'Currency not set'}</span>
                          <span className="font-semibold text-slate-900 dark:text-neutral-100">{Math.round((v / Math.max(shownTotal, 1)) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-slate-500 dark:text-neutral-400">Nothing in for this choice.</p>
              )}
            </section>
          );
        })()}
        </div>

        {/* Who pays you */}
        <section className={`${card} px-5 py-4 flex flex-col min-h-[420px]`}>
          <div className="flex justify-between items-baseline">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">Who pays you</h2>
            <span className="text-xs text-slate-500 dark:text-neutral-400">Biggest first · click for details</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_84px] gap-3 mt-3 mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
            <span>Payer</span><span>{MONTHS[0]} → {MONTHS[months[months.length - 1]]}</span><span className="text-right">Total</span>
          </div>
          {/* Fills the card to the chart's height and scrolls inside, so the two cards line up */}
          <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 overflow-y-auto overscroll-contain -mx-2 px-2">
            {payers.map(p => {
              const on = payer === p.key;
              const byM = months.map(m => sum(yearRows.filter(r => r.key === p.key && r.month === m && (!type || r.type === type)).map(r => r.amount)));
              const mx = Math.max(...byM, 1);
              const last = p.rows.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <button key={p.key} onClick={() => setPayer(p.key)} aria-pressed={on} className={`w-full grid grid-cols-[minmax(0,1fr)_auto_84px] gap-3 items-center h-[54px] px-2 -mx-2 rounded-xl border-t border-slate-100 dark:border-neutral-700 text-left transition-colors ${on ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/40'}`}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center text-[13px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{p.name.replace(/^from\s+/i, '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{p.name}</span>
                      <span className="block text-[11.5px] text-slate-500 dark:text-neutral-400 truncate"><span className="capitalize">{p.type}</span> · {p.rows.length} {p.rows.length === 1 ? 'payment' : 'payments'} · last {dayLabel(last.date)}</span>
                    </span>
                  </span>
                  <span className="flex items-end gap-[3px] h-5" aria-hidden>
                    {byM.map((v, i) => <span key={i} className="block w-[7px] rounded-[2px]" style={{ height: v ? Math.max(4, Math.round((v / mx) * 20)) : 2, background: v ? colorOf(p.type) : 'rgb(226 232 240)' }} />)}
                  </span>
                  <span className="text-right text-[13.5px] font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.total)}</span>
                </button>
              );
            })}
            {!payers.length && <p className="py-8 text-center text-sm text-slate-400">Nothing in for this choice.</p>}
          </div>
          </div>
        </section>
      </div>

      {/* Payer details: a panel that slides in from the right */}
      {createPortal(
        <AnimatePresence>
          {sel && (
            <motion.div key="payer" className="fixed inset-0 z-[100]" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
              <motion.div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={() => setPayer(null)} />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={`${sel.name} details`}
                className="absolute top-0 right-0 bottom-0 w-[480px] max-w-full bg-white dark:bg-neutral-800 shadow-2xl flex flex-col"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={sel.key} className="flex-1 min-h-0 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-neutral-700">
                      <div className="flex items-center gap-3">
                        <span className="w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center text-lg font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{sel.name.replace(/^from\s+/i, '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[17px] font-bold text-slate-900 dark:text-neutral-100 leading-tight truncate">{sel.name}</div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[12.5px] text-slate-500 dark:text-neutral-400">
                            <span className="capitalize">{sel.type}</span>
                            {selBanks.map(b => (
                              <span key={b} className="inline-flex items-center gap-1 px-1.5 py-px rounded-md bg-slate-100 dark:bg-neutral-700 text-[11.5px] text-slate-700 dark:text-neutral-200">
                                Into {b}{bankCur(b) && <span className={`px-1 rounded text-[9.5px] font-bold text-white ${bankCur(b) === 'AED' ? 'bg-sky-500' : 'bg-indigo-500'}`}>{bankCur(b)}</span>}
                              </span>
                            ))}
                            {!selBanks.length && <span className="text-slate-400">· No bank set</span>}
                          </div>
                        </div>
                        <button onClick={() => setPayer(null)} aria-label="Close" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-700">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 mt-4">
                        {[
                          [`Total in ${year}`, fmt2(selYearTotal)],
                          ['Share of your income', yearTotal ? `${Math.max(selYearTotal ? 1 : 0, Math.round((selYearTotal / yearTotal) * 100))}% of ${year}` : '—'],
                          ['Average payment', fmt2(sum(selAll.map(r => r.amount)) / Math.max(selAll.length, 1))],
                          ['Largest payment', selLargest ? `${fmt2(selLargest.amount)} · ${dayLabel(selLargest.date)}` : '—'],
                          ['Usually every', selAvgGap ? `${selAvgGap} days` : selAll.length < 2 ? 'Only paid once' : '—'],
                          selAvgGap
                            ? [nextExpected && nextExpected.getTime() < new Date(`${today}T12:00:00`).getTime() ? 'Was due' : 'Next expected', nextExpected ? `around ${nextExpected.getDate()} ${MONTHS[nextExpected.getMonth()]}` : '—']
                            : ['First paid', selFirst ? dayLabel(selFirst.date) : '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="rounded-xl bg-slate-50 dark:bg-neutral-900/50 px-3 py-2.5">
                            <div className="text-[11px] text-slate-500 dark:text-neutral-400">{k}</div>
                            <div className="text-[15px] font-bold text-slate-900 dark:text-neutral-100">{v}</div>
                          </div>
                        ))}
                      </div>
                      {onViewPayer && (
                        <button onClick={() => onViewPayer(sel.name, `${year}-01-01`, `${year}-12-31`)} className="mt-3 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">See in Transactions →</button>
                      )}
                    </div>
                    <div className="shrink-0 px-6 pt-4 pb-1 flex justify-between items-baseline">
                      <span className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">Every payment</span>
                      <span className="text-xs text-slate-500 dark:text-neutral-400">{selAll.length} · {fmt2(sum(selAll.map(r => r.amount)))} all time</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
                      {selAll.map((r, i) => {
                        const nat = bankCur(r.bank) && bankCur(r.bank) !== currency ? native(r) : '';
                        return (
                          <div key={r.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3 items-start py-2.5 border-t border-slate-100 dark:border-neutral-700 text-[13px]">
                            <span className="pt-px text-slate-500 dark:text-neutral-400">{dayLabel(r.date)}</span>
                            <span className="min-w-0">
                              <span className="block text-slate-700 dark:text-neutral-200 truncate">{r.cat}{r.sub ? ` › ${r.sub}` : ''}</span>
                              <span className="block text-[11.5px] text-slate-400 dark:text-neutral-500 truncate">
                                {r.bank || 'No bank'} · {selGaps[i] ? `${selGaps[i]} days after the last` : i === selAll.length - 1 ? 'first one' : 'same day'}
                              </span>
                              {r.note && <span className="block mt-0.5 text-[11.5px] italic text-slate-500 dark:text-neutral-400 truncate">“{r.note}”</span>}
                            </span>
                            <span className="text-right">
                              <span className="block font-semibold text-emerald-700 dark:text-emerald-400">+{fmt2(r.amount)}</span>
                              {nat && <span className="block text-[11px] text-slate-400 dark:text-neutral-500">{nat}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default IncomePage;
