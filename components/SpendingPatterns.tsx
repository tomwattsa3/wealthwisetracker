import React, { useEffect, useMemo, useState } from 'react';
import { Transaction, Category } from '../types';
import {
  MONTHS, FULL_MONTHS, TOM, PERIODS, PeriodId, PeriodWindow, monthKey, keyToIndex, indexLabel, daysIn, localToday,
  inWindow, computeWindow, merchantKey, mean, sum,
} from '../lib/periods';

import PlaceSheet, { PlacePick, PLACE_TINTS } from './PlaceSheet';
interface SpendingPatternsProps {
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
}



const STORAGE_KEY = 'spendingPatterns';
const NO_SUB = 'No subcategory';
// Subcategories are switched off individually as "Category › Sub" keys, alongside whole
// categories (plain names) in the same `unselected` set.
const subKey = (cat: string, sub: string) => `${cat} › ${sub}`;



interface Spend {
  cat: string;
  sub: string;
  catId: string;
  date: string;
  monthIdx: number;
  desc: string;
  amount: number;
}

interface RegularPayment {
  key: string; // merchantKey, to look the merchant's payments up again for a given month
  gap: number; // 1 = monthly, 2 = every 2 months, 0 = no fixed schedule
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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { period?: PeriodId; unselected?: string[]; view?: 'total' | 'category'; level?: 'category' | 'subcategory'; merchantAmount?: 'month' | 'total'; placeRank?: 'spent' | 'visits' };
    } catch {
      return {};
    }
  }, []);
  const [period, setPeriod] = useState<PeriodId>(PERIODS.some(p => p.id === saved.period) ? saved.period! : '6m');
  // Stored as the categories that are switched OFF, so a category that appears later (a new
  // import) shows up selected by default instead of silently missing from the chart.
  const [unselected, setUnselected] = useState<Set<string>>(() => new Set(saved.unselected || []));
  // Chart style: one bar per month/day (click one for its breakdown), or a category × time table.
  const [view, setView] = useState<'total' | 'category'>(saved.view === 'category' ? 'category' : 'total');
  const [focusKey, setFocusKey] = useState<number | null>(null);
  // Whether the breakdown list and by-category table group by category or by subcategory.
  const [level, setLevel] = useState<'category' | 'subcategory'>(saved.level === 'subcategory' ? 'subcategory' : 'category');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false); // phone only; always open on desktop
  const [moreMerchants, setMoreMerchants] = useState(false);
  // Regular merchants' headline figure: typical spend per active month, or total for the period.
  const [merchantAmount, setMerchantAmount] = useState<'month' | 'total'>(saved.merchantAmount === 'total' ? 'total' : 'month');
  // Top places: ranked by money spent there, or by how often you went (like the phone Home).
  const [placeRank, setPlaceRank] = useState<'spent' | 'visits'>(saved.placeRank === 'visits' ? 'visits' : 'spent');
  // The place clicked in Top places, shown in a panel from the right (its months and payments).
  const [placePick, setPlacePick] = useState<PlacePick | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, unselected: Array.from(unselected), view, level, merchantAmount, placeRank }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
  }, [period, unselected, view, level, merchantAmount, placeRank]);

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
        sub: (t.subcategoryName || '').trim() || NO_SUB,
        catId: t.categoryId,
        date: t.date,
        monthIdx: keyToIndex(monthKey(t.date)),
        desc: (t.description || 'Unknown').trim(),
        amount: Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0,
      }))
      .filter(s => s.amount > 0);
  }, [transactions, categories, currency]);

  const today = localToday();
  const curIdx = keyToIndex(monthKey(today));
  // Latest month with any imported spending.
  const lastIdx = useMemo(() => (spends.length ? Math.max(...spends.map(s => s.monthIdx)) : curIdx), [spends, curIdx]);

  // Calendar periods (MTD, this/last month, YTD) follow today's date; the rolling 3/6/12-month
  // windows end at the latest imported month instead, so un-imported months don't drag every
  // average down.
  const win = useMemo<PeriodWindow>(() => computeWindow(period, today, lastIdx), [period, today, lastIdx]);

  const inRange = useMemo(() => spends.filter(s => inWindow(s.date, win)), [spends, win]);
  const monthIdxs = win.monthIdxs;

  const catStats = useMemo(() => {
    const map = new Map<string, { name: string; catId: string; total: number; subs: Map<string, number> }>();
    for (const s of inRange) {
      const e = map.get(s.cat) || { name: s.cat, catId: s.catId, total: 0, subs: new Map<string, number>() };
      e.total += s.amount;
      e.subs.set(s.sub, (e.subs.get(s.sub) || 0) + s.amount);
      map.set(s.cat, e);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map(c => ({ ...c, subs: Array.from(c.subs.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total) }));
  }, [inRange]);

  const isIncluded = (s: { cat: string; sub: string }) => !unselected.has(s.cat) && !unselected.has(subKey(s.cat, s.sub));
  // 'on' = every subcategory ticked, 'some' = only some, 'off' = none.
  const catState = (c: { name: string; subs: { name: string }[] }): 'on' | 'some' | 'off' => {
    if (unselected.has(c.name)) return 'off';
    const offSubs = c.subs.filter(sb => unselected.has(subKey(c.name, sb.name))).length;
    return offSubs === 0 ? 'on' : offSubs === c.subs.length ? 'off' : 'some';
  };
  const selected = useMemo(() => new Set(catStats.filter(c => catState(c) !== 'off').map(c => c.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catStats, unselected]);
  const chosen = useMemo(() => inRange.filter(isIncluded),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inRange, unselected]);

  // Clears any per-subcategory choices for a category, so it's either fully on or fully off.
  const withoutSubs = (set: Set<string>, cat: string) => new Set(Array.from(set).filter(k => !k.startsWith(`${cat} › `)));
  const toggle = (name: string) => setUnselected(prev => {
    const c = catStats.find(x => x.name === name);
    const state = c ? catState(c) : 'on';
    const next = withoutSubs(prev, name);
    if (state === 'on') next.add(name); else next.delete(name);
    return next;
  });
  const toggleSub = (cat: string, sub: string) => setUnselected(prev => {
    const c = catStats.find(x => x.name === cat);
    let next = new Set(prev);
    if (next.has(cat)) {
      // Category was off entirely: turn on just this subcategory.
      next = withoutSubs(next, cat);
      next.delete(cat);
      c?.subs.forEach(sb => { if (sb.name !== sub) next.add(subKey(cat, sb.name)); });
    } else {
      const k = subKey(cat, sub);
      if (next.has(k)) next.delete(k); else next.add(k);
    }
    return next;
  });
  const toggleExpanded = (cat: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });
  const selectOnly = (names: string[]) => setUnselected(new Set(catStats.map(c => c.name).filter(n => !names.includes(n))));

  const top = catStats[0]?.name;
  const presets = [
    { label: 'All spending', names: catStats.map(c => c.name) },
    ...(top ? [{ label: `Without ${top}`, names: catStats.slice(1).map(c => c.name) }] : []),
    { label: 'Top 3', names: catStats.slice(0, 3).map(c => c.name) },
  ];
  const presetActive = (names: string[]) => catStats.every(c => catState(c) === (names.includes(c.name) ? 'on' : 'off'));

  // --- Chart buckets, stacked by category: days for a single month, otherwise months ---
  const buckets = useMemo(() => {
    const keys = win.single
      ? Array.from({ length: win.dayLimit }, (_, i) => i + 1)
      : monthIdxs;
    return keys.map(k => {
      const rows = chosen.filter(s => (win.single ? Number(s.date.slice(8, 10)) === k : s.monthIdx === k));
      const byCat = new Map<string, number>();
      rows.forEach(r => byCat.set(r.cat, (byCat.get(r.cat) || 0) + r.amount));
      return {
        key: k,
        label: win.single ? String(k) : indexLabel(k),
        longLabel: win.single ? `${k} ${MONTHS[monthIdxs[0] % 12]}` : indexLabel(k),
        total: sum(rows.map(r => r.amount)),
        segs: catStats.filter(c => byCat.has(c.name)).map(c => ({ cat: c.name, value: byCat.get(c.name)! })),
      };
    });
  }, [chosen, monthIdxs, catStats, win]);
  const bucketTotals = buckets.map(b => b.total);
  const total = sum(bucketTotals);
  // Per-month average counts only months with imported spending (so a window reaching back
  // before your first import isn't diluted); per-day average counts the days elapsed.
  const dataMonths = Math.max(1, monthIdxs.filter(mi => inRange.some(s => s.monthIdx === mi)).length);
  const avg = win.single ? total / Math.max(1, win.dayLimit) : total / dataMonths;
  const unit = win.single ? 'day' : 'month';
  const maxBucket = Math.max(...bucketTotals, 1);
  const peak = buckets.reduce((a, b) => (b.total > a.total ? b : a), buckets[0]);

  // Trend: against the equal-length period just before this one. If there's no data there
  // (e.g. before your first import), fall back to comparing the later half of this period's
  // data months with the earlier half.
  const { trend, trendLabel } = useMemo(() => {
    // Uses "not switched off" rather than `selected`, which only lists categories with spending in
    // this period — otherwise a category you spent on last month but not this month would be
    // silently dropped from the comparison.
    const prevTotal = win.prev ? sum(spends.filter(s => isIncluded(s) && inWindow(s.date, win.prev!)).map(s => s.amount)) : 0;
    if (prevTotal > 0) return { trend: (total - prevTotal) / prevTotal, trendLabel: `vs ${win.prev!.label}` };
    const dm = monthIdxs.filter(mi => inRange.some(s => s.monthIdx === mi));
    const h = Math.floor(dm.length / 2);
    if (win.single || h === 0) return { trend: null as number | null, trendLabel: win.prev ? `vs ${win.prev.label}` : '' };
    const span = (a: number[]) => (a.length === 1 ? indexLabel(a[0]) : `${indexLabel(a[0])}–${indexLabel(a[a.length - 1])}`);
    const early = dm.slice(0, h), late = dm.slice(dm.length - h);
    const e = sum(chosen.filter(s => early.includes(s.monthIdx)).map(s => s.amount));
    const l = sum(chosen.filter(s => late.includes(s.monthIdx)).map(s => s.amount));
    return { trend: e > 0 ? (l - e) / e : null, trendLabel: `${span(late)} vs ${span(early)}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spends, unselected, win, total, monthIdxs, inRange, chosen]);

  // Time columns shared by the by-category table and the merchant cards: months, or weeks of the
  // month for a single-month period.
  const { cols, colOf } = useMemo(() => ({
    cols: win.single
      ? TOM.map((l, i) => ({ key: i, label: l, short: l }))
      : monthIdxs.map(mi => ({ key: mi, label: indexLabel(mi), short: indexLabel(mi)[0] })),
    colOf: (s: Spend) => {
      if (!win.single) return s.monthIdx;
      const d = Number(s.date.slice(8, 10));
      return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
    },
  }), [win, monthIdxs]);

  // The month (or day) clicked in the Totals chart, if any. The chart breakdown and the merchant
  // list both follow it.
  const focusBucket = buckets.find(b => b.key === focusKey && b.total > 0) || null;
  const inFocusBucket = (s: Spend) => !focusBucket || (win.single ? Number(s.date.slice(8, 10)) === focusBucket.key : s.monthIdx === focusBucket.key);
  // Column of the mini charts that the focused bar falls in (weeks for a single-month period).
  const focusCol = focusBucket ? (win.single ? cols[(() => { const d = Number(focusBucket.key); return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3; })()].key : focusBucket.key) : null;

  // Biggest merchants in the selection — for the whole period, or just the focused month/day.
  // The mini charts always span the whole period for context.
  const { merchants, periodTopMerchant } = useMemo(() => {
    const groups = new Map<string, Spend[]>();
    chosen.forEach(s => { const k = merchantKey(s.desc); groups.set(k, [...(groups.get(k) || []), s]); });
    const mostCommon = (vals: string[]) => {
      const m = new Map<string, number>();
      vals.forEach(v => m.set(v, (m.get(v) || 0) + 1));
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0];
    };
    const all = Array.from(groups.entries())
      .map(([key, allRows]) => {
        const rows = allRows.filter(inFocusBucket);
        if (rows.length === 0) return null;
        const amounts = rows.map(r => r.amount);
        const cells = cols.map(c => sum(allRows.filter(r => colOf(r) === c.key).map(r => r.amount)));
        const last = rows.map(r => r.date.slice(0, 10)).sort().pop()!;
        const sub = mostCommon(allRows.map(r => r.sub));
        const cat = mostCommon(allRows.map(r => r.cat));
        return {
          key,
          catId: allRows.find(r => r.cat === cat)?.catId || '',
          lastMonth: Math.max(...rows.map(r => r.monthIdx)),
          name: mostCommon(allRows.map(r => r.desc)),
          cat,
          sub: sub === NO_SUB ? '' : sub,
          total: sum(amounts),
          periodTotal: sum(allRows.map(r => r.amount)),
          count: rows.length,
          avg: mean(amounts),
          max: Math.max(...amounts),
          last,
          cells,
          cellMax: Math.max(...cells, 1),
          activeCols: cells.filter(v => v > 0).length,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    // The summary sentence is about the whole period, so its top merchant ignores the focused bar.
    const topGroup = Array.from(groups.values()).sort((a, b) => sum(b.map(r => r.amount)) - sum(a.map(r => r.amount)))[0];
    const periodTop = topGroup ? { name: mostCommon(topGroup.map(r => r.desc)), periodTotal: sum(topGroup.map(r => r.amount)) } : null;
    return { merchants: all.sort((a, b) => b.total - a.total), periodTopMerchant: periodTop };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, cols, colOf, focusBucket?.key, win.single]);
  // One ranked list, flowed across two columns on desktop (#1–8 left, #9–16 right).
  // Most visits breaks ties by money, so a 4× bill still ranks above 4 coffees.
  const rankedMerchants = (placeRank === 'visits' ? [...merchants].sort((a, b) => b.count - a.count || b.total - a.total) : merchants).slice(0, 40);
  const merchantsShown = rankedMerchants.slice(0, moreMerchants ? 32 : 16);
  const merchantHalf = Math.ceil(merchantsShown.length / 2);
  const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

  // --- Regular payments, detected from repeat payments across all categories ---
  // Always based on the last 6 imported months, whatever period is picked above — a single
  // month can't show whether something repeats.
  const regMonths = useMemo(() => Array.from({ length: 6 }, (_, i) => lastIdx - 5 + i), [lastIdx]);
  const { bills, habits, billsPerMonth } = useMemo(() => {
    const regRows = spends.filter(s => s.monthIdx >= regMonths[0] && s.monthIdx <= lastIdx);
    const groups = new Map<string, Spend[]>();
    regRows.forEach(s => { const k = merchantKey(s.desc); groups.set(k, [...(groups.get(k) || []), s]); });
    const bills: RegularPayment[] = [];
    const habits: RegularPayment[] = [];
    groups.forEach((rows, key) => {
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
      const base = { key, gap: 0, name, category, months: ms, count: rows.length, avg: avgAmt, total: totalAmt };
      if (cv < 0.25 && rows.length / ms.length <= 1.5) {
        const gaps = ms.slice(1).map((m, i) => m - ms[i]);
        const gap = gaps.every(g => g === 1) ? 1 : gaps.every(g => g === 2) ? 2 : 0;
        const schedule = gap === 1 ? 'monthly' : gap === 2 ? 'every 2 months' : 'regular';
        const stale = gap > 0 && lastIdx - ms[ms.length - 1] > gap;
        bills.push({ ...base, gap, stale, note: `${category} · ${schedule}${stale ? ` · nothing since ${FULL_MONTHS[ms[ms.length - 1] % 12]}` : ''}` });
      } else if (rows.length >= 8 && totalAmt >= (currency === 'GBP' ? 50 : 230)) {
        habits.push({ ...base, stale: false, note: `${category} · ${rows.length} payments · ${fmt(totalAmt, 2)} total` });
      }
    });
    bills.sort((a, b) => b.avg - a.avg);
    habits.sort((a, b) => b.total - a.total);
    const dataMonths = Math.max(1, new Set(regRows.map(s => s.monthIdx)).size);
    return { bills: bills.slice(0, 8), habits: habits.slice(0, 6), billsPerMonth: sum(bills.map(b => b.total)) / dataMonths };
    // fmt depends only on currency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spends, regMonths, lastIdx, currency]);

  // Month the regular-payments section checks: the bar selected in the chart, or the month of a
  // single-month period. null = no month picked, so it shows the 6-month overview.
  const checkMonth: number | null = win.single ? monthIdxs[0] : focusBucket ? focusBucket.key : null;
  const checkLabel = checkMonth === null ? '' : `${FULL_MONTHS[checkMonth % 12]} ${Math.floor(checkMonth / 12)}`;
  const paymentsIn = (key: string, mi: number) => spends.filter(s => s.monthIdx === mi && merchantKey(s.desc) === key);
  const billStatus = (b: RegularPayment) => {
    const mi = checkMonth!;
    if (mi > lastIdx) return { tone: 'muted' as const, icon: '·', text: 'not imported yet', amount: null as number | null };
    const rows = paymentsIn(b.key, mi);
    if (rows.length) {
      const d = rows.map(r => r.date.slice(0, 10)).sort()[0];
      return { tone: 'ok' as const, icon: '✓', text: `paid ${Number(d.slice(8, 10))} ${MONTHS[mi % 12]}`, amount: sum(rows.map(r => r.amount)) };
    }
    const first = b.months[0], last = b.months[b.months.length - 1];
    if (mi < first) return { tone: 'muted' as const, icon: '–', text: `started ${MONTHS[first % 12]}`, amount: null };
    if (b.gap === 2 && (mi - first) % 2 !== 0) return { tone: 'muted' as const, icon: '–', text: 'not due this month', amount: null };
    if (mi > last) return { tone: 'warn' as const, icon: '✗', text: `none since ${MONTHS[last % 12]}`, amount: null };
    return { tone: 'warn' as const, icon: '✗', text: 'not paid this month', amount: null };
  };
  const billChecks = checkMonth === null ? [] : bills.map(b => ({ b, st: billStatus(b) }));

  // --- Money in: income for the period (or the selected month/day). Not affected by the
  // spending category ticks.
  const incomeRows = useMemo(() => transactions
    .filter(t => t.type === 'INCOME' && !t.excluded && (t.categoryName || '').trim().toLowerCase() !== 'excluded' && /^\d{4}-\d{2}-\d{2}/.test(t.date))
    .map(t => ({
      date: t.date.slice(0, 10),
      monthIdx: keyToIndex(monthKey(t.date)),
      desc: (t.description || 'Unknown').trim(),
      type: (t.subcategoryName || '').trim() || (t.categoryName || '').trim() || 'Other',
      amount: Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0,
    }))
    .filter(r => r.amount > 0 && inWindow(r.date, win)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, currency, win]);
  const income = useMemo(() => {
    const colOfDate = (d: string, mi: number) => {
      if (!win.single) return mi;
      const day = Number(d.slice(8, 10));
      return day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
    };
    const perCol = cols.map(c => sum(incomeRows.filter(r => colOfDate(r.date, r.monthIdx) === c.key).map(r => r.amount)));
    const scoped = focusBucket
      ? incomeRows.filter(r => (win.single ? Number(r.date.slice(8, 10)) === focusBucket.key : r.monthIdx === focusBucket.key))
      : incomeRows;
    const byType = new Map<string, number>();
    scoped.forEach(r => byType.set(r.type, (byType.get(r.type) || 0) + r.amount));
    const bySource = new Map<string, { name: string; type: string; total: number; count: number; months: Set<number> }>();
    scoped.forEach(r => {
      const k = merchantKey(r.desc);
      const e = bySource.get(k) || { name: r.desc, type: r.type, total: 0, count: 0, months: new Set<number>() };
      e.total += r.amount; e.count++; e.months.add(r.monthIdx);
      bySource.set(k, e);
    });
    const scopedTotal = sum(scoped.map(r => r.amount));
    // Coverage is against all spending in the same window (every category), not just the ticked ones.
    const spendAll = sum(inRange.filter(s => !focusBucket || (win.single ? Number(s.date.slice(8, 10)) === focusBucket.key : s.monthIdx === focusBucket.key)).map(s => s.amount));
    const dataCols = perCol.filter((_, i) => win.single || inRange.some(s => s.monthIdx === cols[i].key)).length || 1;
    return {
      perCol,
      avg: sum(perCol) / dataCols,
      total: scopedTotal,
      count: scoped.length,
      coverage: spendAll > 0 ? scopedTotal / spendAll : null,
      types: Array.from(byType.entries()).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v),
      sources: Array.from(bySource.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, cols, focusBucket?.key, win, inRange]);

  // "vs your average" card: the selected month (or single-month period, or else the latest month
  // in the period) against your average of the OTHER imported months, for the ticked categories.
  // MTD compares with the average scaled to the same number of days.
  const vsAvg = useMemo(() => {
    const dataMonths = Array.from(new Set(spends.map(s => s.monthIdx)));
    const byMonth = new Map<number, number>();
    spends.filter(isIncluded).forEach(s => byMonth.set(s.monthIdx, (byMonth.get(s.monthIdx) || 0) + s.amount));
    const inPeriod = inRange.map(s => s.monthIdx);
    const subject = win.single ? monthIdxs[0] : focusBucket ? focusBucket.key : (inPeriod.length ? Math.max(...inPeriod) : null);
    if (subject === null) return null;
    const others = dataMonths.filter(m => m !== subject && m <= lastIdx);
    if (others.length === 0) return null;
    const partial = period === 'mtd' ? win.dayLimit / daysIn(subject) : 1;
    const base = (sum(others.map(m => byMonth.get(m) || 0)) / others.length) * partial;
    const now = win.single ? total : byMonth.get(subject) || 0;
    return { subject, now, base, diff: base > 0 ? (now - base) / base : null, partial: partial < 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spends, unselected, inRange, win, monthIdxs, focusBucket?.key, lastIdx, period, total]);
  const billsPaid = billChecks.filter(x => x.st.tone === 'ok');
  const habitChecks = checkMonth === null ? [] : habits.map(h => {
    const now = checkMonth > lastIdx ? null : sum(paymentsIn(h.key, checkMonth).map(r => r.amount));
    const usual = h.total / Math.max(1, h.months.length);
    return { h, now, usual, change: now === null || usual === 0 ? null : (now - usual) / usual };
  });

  const trendText = trend === null ? '' : Math.abs(trend) < 0.05 ? 'about the same' : `${trend > 0 ? 'up' : 'down'} ${Math.round(Math.abs(trend) * 100)}%`;
  const trendClause = trend === null ? '' : trendLabel.startsWith('vs ')
    ? ` That's ${trendText} ${trendLabel.replace('vs ', Math.abs(trend) < 0.05 ? 'as ' : 'on ')}.`
    : ` It's ${trendText} in ${trendLabel.replace(' vs ', ' compared with ')}.`;
  const topClause = periodTopMerchant && total > 0
    ? ` Your biggest merchant is ${periodTopMerchant.name} at ${fmt(periodTopMerchant.periodTotal)} (${Math.round((periodTopMerchant.periodTotal / total) * 100)}%).`
    : '';
  const sentence = selected.size === 0
    ? 'Pick at least one category to see its patterns.'
    : win.single
      ? `You've spent ${fmt(total)} on this in ${win.label}, about ${fmt(avg)} a day.${topClause}${trendClause}`
      : `You spend ${fmt(avg)} a month on this.${topClause}${trendClause}`;

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const label = 'text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const BAR_H = 190;

  // The bar whose breakdown is shown under the Totals chart: the one you clicked, else the latest
  // with spending.
  // Breakdown under the Totals chart: the whole period by default, or one month/day once you
  // click its bar (click it again, or "Show all", to go back).
  const focus = focusBucket;
  const groupOf = (s: Spend) => (level === 'category' ? s.cat : subKey(s.cat, s.sub));
  const focusRows = useMemo(() => {
    const inFocus = focus
      ? chosen.filter(s => (win.single ? Number(s.date.slice(8, 10)) === focus.key : s.monthIdx === focus.key))
      : chosen;
    const map = new Map<string, { key: string; cat: string; sub: string | null; value: number }>();
    inFocus.forEach(s => {
      const k = groupOf(s);
      const e = map.get(k) || { key: k, cat: s.cat, sub: level === 'category' ? null : s.sub, value: 0 };
      e.value += s.amount;
      map.set(k, e);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, focus?.key, win.single, level]);
  const focusTotal = focus ? focus.total : total;
  const focusName = focus ? (win.single ? focus.longLabel : `${FULL_MONTHS[focus.key % 12]} ${Math.floor(focus.key / 12)}`) : win.label;
  const allLabel = win.single ? 'all days' : 'all months';

  // By-category table: a row per selected category, a column per month (or per week for a
  // single month). Cells are shaded relative to that row's own busiest column, so each row
  // reads as that category's pattern over time.
  const matrix = useMemo(() => {
    const groups = new Map<string, { name: string; cat: string; sub: string | null; catId: string; rows: Spend[] }>();
    chosen.forEach(s => {
      const k = level === 'category' ? s.cat : subKey(s.cat, s.sub);
      const g = groups.get(k) || { name: k, cat: s.cat, sub: level === 'category' ? null : s.sub, catId: s.catId, rows: [] };
      g.rows.push(s);
      groups.set(k, g);
    });
    // Keep categories in spend order, and subcategories grouped under their category.
    const catRank = new Map(catStats.map((c, i) => [c.name, i]));
    const rows = Array.from(groups.values())
      .map(g => {
        const cells = cols.map(col => sum(g.rows.filter(s => colOf(s) === col.key).map(s => s.amount)));
        return { name: g.name, cat: g.cat, sub: g.sub, catId: g.catId, cells, total: sum(cells), max: Math.max(...cells, 1) };
      })
      .sort((a, b) => (catRank.get(a.cat)! - catRank.get(b.cat)!) || b.total - a.total);
    return { cols, rows };
  }, [cols, colOf, catStats, chosen, level]);
  const compact = (v: number) => (v >= 1000 ? `${currency === 'GBP' ? '£' : 'AED '}${(v / 1000).toFixed(1)}k` : fmt(v));

  const renderDots = (p: RegularPayment, color: string) => (
    <div className="flex gap-1" aria-label={`Paid in ${p.months.map(m => MONTHS[m % 12]).join(', ')}`}>
      {regMonths.map(mi => (
        <span key={mi} className="flex flex-col items-center gap-0.5">
          <span
            className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded ${p.months.includes(mi) ? '' : 'bg-slate-100 dark:bg-neutral-700'} ${mi === checkMonth ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-neutral-100 dark:ring-offset-neutral-800' : ''}`}
            style={p.months.includes(mi) ? { background: color } : undefined}
          />
          <span className={`text-[8px] ${mi === checkMonth ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-400'}`}>{MONTHS[mi % 12][0]}</span>
        </span>
      ))}
    </div>
  );

  if (spends.length === 0) {
    return <div className={`${card} p-10 text-center text-sm text-slate-500`}>No spending to analyse yet.</div>;
  }

  // Scrolls with the page (<main>) rather than inside its own box, so pull-to-refresh and the
  // sticky category picker both work off the same scroll position.
  return (
    <div className="pb-24 md:pb-6 flex flex-col gap-4 md:gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Dashboard</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {win.label}{period.endsWith('m') ? ' · up to your latest imported month' : ''}
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

      {inRange.length === 0 && (
        <div className={`${card} p-6 md:p-8 text-center`}>
          <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-neutral-100">No spending imported for {win.name} yet</p>
          <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-1">
            Your latest transactions are from {FULL_MONTHS[lastIdx % 12]} {Math.floor(lastIdx / 12)}. Import newer statements on the Transactions tab, or pick a longer period.
          </p>
        </div>
      )}

      {inRange.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 md:gap-6 items-start">
        {/* Category picker */}
        {/* Sticky on desktop: follows the page down while the chart and pattern cards scroll past, and
            is pushed up with the rest of this row when the regular-payments section arrives. */}
        <section aria-label="Choose categories" className={`${card} p-3 md:p-4 flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}>
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
            <div className="flex items-center justify-between px-1 mb-1">
              <h2 className={label}>Categories</h2>
              <button onClick={() => setPickerOpen(o => !o)} aria-expanded={pickerOpen} className="lg:hidden text-xs font-medium text-indigo-700 dark:text-indigo-300">
                {pickerOpen ? 'Hide' : `Choose (${selected.size} of ${catStats.length})`}
              </button>
            </div>
            <div className={`${pickerOpen ? 'flex' : 'hidden'} lg:flex flex-col gap-0.5`}>
              {catStats.map(c => {
                const state = catState(c);
                const on = state !== 'off';
                const emoji = getCategoryEmoji && c.catId ? getCategoryEmoji(c.catId) : '';
                const hasSubs = c.subs.length > 1 || (c.subs.length === 1 && c.subs[0].name !== NO_SUB);
                const open = expanded.has(c.name);
                return (
                  <div key={c.name}>
                    <div className={`flex items-center rounded-lg transition-colors ${on ? 'bg-slate-50 dark:bg-neutral-700/60' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/40'}`}>
                      <button
                        onClick={() => toggle(c.name)}
                        aria-pressed={state === 'on' ? true : state === 'some' ? 'mixed' : false}
                        className="flex-1 min-w-0 flex items-center gap-2.5 pl-2.5 pr-1 py-2 text-left"
                      >
                        <span aria-hidden className={`w-4 h-4 rounded-[5px] shrink-0 border-2 flex items-center justify-center ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-neutral-500'}`}>
                          {state === 'on' && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                          {state === 'some' && <span className="block w-2 h-0.5 rounded bg-white" />}
                        </span>
                        <span className={`flex-1 truncate text-[13px] ${on ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>
                          {emoji && <span className="mr-1">{emoji}</span>}{c.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-neutral-400">{fmt(c.total)}</span>
                      </button>
                      {hasSubs ? (
                        <button
                          onClick={() => toggleExpanded(c.name)}
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} ${c.name} subcategories`}
                          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200"
                        >
                          <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
                        </button>
                      ) : <span className="w-8 shrink-0" />}
                    </div>
                    {hasSubs && open && (
                      <div className="ml-6 pl-2 border-l border-slate-200 dark:border-neutral-700 flex flex-col my-0.5">
                        {c.subs.map(sb => {
                          const subOn = isIncluded({ cat: c.name, sub: sb.name });
                          return (
                            <button
                              key={sb.name}
                              onClick={() => toggleSub(c.name, sb.name)}
                              aria-pressed={subOn}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-slate-50 dark:hover:bg-neutral-700/40"
                            >
                              <span aria-hidden className={`w-3.5 h-3.5 rounded shrink-0 border-2 flex items-center justify-center ${subOn ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-neutral-500'}`}>
                                {subOn && <svg viewBox="0 0 12 12" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                              </span>
                              <span className={`flex-1 truncate text-xs ${subOn ? 'text-slate-800 dark:text-neutral-200' : 'text-slate-400 dark:text-neutral-500'}`}>{sb.name}</span>
                              <span className="text-[11px] text-slate-500 dark:text-neutral-400">{fmt(sb.total)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 md:gap-6 min-w-0">
          {/* Summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {[
              { l: 'Total', v: fmt(total) },
              { l: `Per ${unit}`, v: fmt(avg) },
              { l: `Busiest ${unit}`, v: selected.size && peak.total > 0 ? `${peak.longLabel} · ${fmt(peak.total)}` : '–' },
              vsAvg && selected.size
                ? {
                    l: `${FULL_MONTHS[vsAvg.subject % 12]}${vsAvg.partial ? ' so far' : ''} vs your average`,
                    v: vsAvg.diff === null ? '–' : Math.abs(vsAvg.diff) < 0.05 ? 'About average' : `${vsAvg.diff > 0 ? '↑' : '↓'} ${Math.round(Math.abs(vsAvg.diff) * 100)}% ${vsAvg.diff > 0 ? 'above' : 'below'}`,
                    c: vsAvg.diff === null || Math.abs(vsAvg.diff) < 0.05 ? '' : vsAvg.diff > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                    sub: `${fmt(vsAvg.now)} vs ${fmt(vsAvg.base)}${vsAvg.partial ? ' by this point' : ' a month'}`,
                  }
                : { l: 'Vs your average', v: '–' },
            ].map((k: { l: string; v: string; c?: string; sub?: string }) => (
              <div key={k.l} className={`${card} px-4 py-3 md:px-5 md:py-4`}>
                <div className={label}>{k.l}</div>
                <div className={`text-lg md:text-2xl font-semibold mt-1 text-slate-900 dark:text-neutral-100 ${k.c || ''}`}>{k.v}</div>
                {k.sub && <div className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400 mt-0.5">{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Month by month */}
          <section className={`${card} p-4 md:p-6`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">{win.single ? 'Day by day' : 'Month by month'}</h2>
              <div className="flex flex-wrap gap-2 self-start">
              <div role="group" aria-label="Group by" className="flex gap-1 p-1 bg-slate-100 dark:bg-neutral-700/60 rounded-lg">
                {([['category', 'Categories'], ['subcategory', 'Subcategories']] as const).map(([id, l]) => (
                  <button
                    key={id}
                    onClick={() => setLevel(id)}
                    aria-pressed={level === id}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${level === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Chart view" className="flex gap-1 p-1 bg-slate-100 dark:bg-neutral-700/60 rounded-lg">
                {([['total', 'Totals'], ['category', 'By category']] as const).map(([id, l]) => (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    aria-pressed={view === id}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${view === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              </div>
            </div>
            <p className="text-xs md:text-sm text-slate-600 dark:text-neutral-300 mt-1 mb-4">{sentence}</p>

            {view === 'total' ? (
              <>
                <div className="relative overflow-x-auto">
                  <div
                    className={`relative grid items-end ${win.single ? 'gap-[2px] md:gap-1' : 'gap-2 md:gap-6 px-1 md:px-4'}`}
                    style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(${win.single ? 6 : monthIdxs.length >= 12 ? 28 : 40}px, 1fr))`, height: BAR_H + (win.single ? 50 : 74) }}
                  >
                    {selected.size > 0 && total > 0 && (
                      <div aria-hidden className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-400 pointer-events-none" style={{ bottom: Math.round((avg / maxBucket) * BAR_H) + 22 }} />
                    )}
                    {buckets.map(b => {
                      const isFocus = focus?.key === b.key;
                      return (
                        <button
                          key={b.key}
                          onClick={() => b.total > 0 && setFocusKey(isFocus ? null : b.key)}
                          disabled={b.total === 0}
                          aria-pressed={isFocus}
                          aria-label={`${b.longLabel}: ${fmt(b.total, 2)}`}
                          className="flex flex-col items-center justify-end gap-1.5 h-full group disabled:cursor-default"
                        >
                          {!win.single && isFocus && (
                            <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-white bg-indigo-600 rounded px-1.5 py-0.5">Selected</span>
                          )}
                          {!win.single && (
                            <span className={`text-[10px] md:text-xs font-semibold whitespace-nowrap ${isFocus ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-neutral-200'}`}>{b.total > 0 ? fmt(b.total) : '–'}</span>
                          )}
                          <div
                            className={`w-full rounded-t transition-colors ${win.single ? '' : 'max-w-[64px]'} ${b.total === 0 ? 'bg-slate-200 dark:bg-neutral-700' : isFocus ? 'bg-indigo-600' : focus ? 'bg-indigo-200 dark:bg-indigo-900 group-hover:bg-indigo-300' : 'bg-indigo-400 dark:bg-indigo-700 group-hover:bg-indigo-500'}`}
                            style={{ height: b.total > 0 ? Math.max(2, Math.round((b.total / maxBucket) * BAR_H)) : 2 }}
                          />
                          <span className={`text-[9px] md:text-xs ${isFocus ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'} ${win.single && b.key !== 1 && Number(b.key) % 5 !== 0 && !isFocus ? 'invisible md:visible' : ''}`}>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-2">Dashed line = your average for this selection. {focus
                  ? <>Showing <strong className="text-slate-700 dark:text-neutral-200">{focusName}</strong> below. Click another bar to switch, or click it again to show {allLabel}.</>
                  : <>Showing <strong className="text-slate-700 dark:text-neutral-200">{allLabel}</strong> below. Click a bar to see just that {win.single ? 'day' : 'month'}.</>}</p>

                {focusRows.length > 0 && (
                  <div className="mt-4 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 md:p-4">
                    <div className="flex items-end justify-between gap-3 mb-3 pb-3 border-b border-indigo-100 dark:border-indigo-900/60">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span aria-hidden className="w-3 h-3 rounded-sm bg-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                            {focus ? `Breakdown for selected ${win.single ? 'day' : 'month'}` : `Breakdown for ${allLabel}`}
                          </div>
                          <h3 className="text-sm md:text-base font-semibold text-slate-900 dark:text-neutral-100 truncate">{focusName}</h3>
                          {focus && (
                            <button onClick={() => setFocusKey(null)} className="mt-1 text-[11px] md:text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
                              ← Show {allLabel}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] md:text-[11px] text-slate-500 dark:text-neutral-400">{focus ? `Total spent in ${win.single ? focus.longLabel : FULL_MONTHS[focus.key % 12]}` : 'Total spent in this period'}</div>
                        <div className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">{fmt(focusTotal, 2)}</div>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      {focusRows.map(r => (
                        <div key={r.key} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_44px_84px] md:grid-cols-[180px_minmax(0,1fr)_52px_100px] items-center gap-3 py-1.5">
                          <span className="text-xs md:text-[13px] text-slate-800 dark:text-neutral-200 truncate">
                            {r.sub ? <>{r.sub} <span className="text-slate-400 dark:text-neutral-500">· {r.cat}</span></> : r.cat}
                          </span>
                          <span className="h-2 rounded bg-slate-100 dark:bg-neutral-700 overflow-hidden">
                            <span className="block h-full rounded bg-indigo-500" style={{ width: `${(r.value / focusRows[0].value) * 100}%` }} />
                          </span>
                          <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400 text-right">{Math.round((r.value / focusTotal) * 100)}%</span>
                          <span className="text-xs md:text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(r.value, 2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-neutral-400 pb-1 min-w-[110px]"></th>
                      {matrix.cols.map(c => (
                        <th key={c.key} className="text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-neutral-400 pb-1 min-w-[44px]">{c.label}</th>
                      ))}
                      <th className="text-right text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-neutral-400 pb-1 pl-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map(r => (
                      <tr key={r.name}>
                        <th scope="row" className="text-left text-xs md:text-[13px] font-medium text-slate-800 dark:text-neutral-200 pr-2 whitespace-nowrap">
                          {getCategoryEmoji && r.catId ? <span className="mr-1">{getCategoryEmoji(r.catId)}</span> : null}
                          {r.sub ? <>{r.sub} <span className="text-slate-400 dark:text-neutral-500 font-normal">· {r.cat}</span></> : r.name}
                        </th>
                        {r.cells.map((v, i) => {
                          const ratio = v / r.max;
                          return (
                            <td
                              key={i}
                              title={`${r.name}, ${matrix.cols[i].label}: ${fmt(v, 2)}`}
                              className={`h-8 md:h-9 rounded-md text-center text-[10px] md:text-[11px] font-medium ${v === 0 ? 'bg-slate-50 dark:bg-neutral-700/40 text-slate-400' : ratio > 0.55 ? 'text-white' : 'text-slate-800 dark:text-neutral-100'}`}
                              style={v > 0 ? { background: `rgba(79, 70, 229, ${0.12 + 0.78 * ratio})` } : undefined}
                            >
                              {v > 0 ? compact(v) : '–'}
                            </td>
                          );
                        })}
                        <td className="text-right text-xs md:text-[13px] font-semibold text-slate-900 dark:text-neutral-100 pl-2 whitespace-nowrap">{fmt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-2">Each row is shaded against its own busiest {win.single ? 'week' : 'month'}, so darker = more than usual for that category.</p>
              </div>
            )}
          </section>

          {/* Top places: one ranked list across two columns, by money spent or by visits */}
          <section className={`${card} p-4 md:p-6`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">Top places</h2>
                <div role="group" aria-label="Rank places by" className="flex gap-1 p-1 bg-slate-100 dark:bg-neutral-700/60 rounded-lg">
                  {([['visits', 'Most visits'], ['spent', 'Most spent']] as const).map(([id, l]) => (
                    <button
                      key={id}
                      onClick={() => { setPlaceRank(id); setMoreMerchants(false); }}
                      aria-pressed={placeRank === id}
                      className={`px-3 py-1 rounded-md text-xs transition-colors ${placeRank === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 self-start md:self-auto">
                {focusBucket ? (
                  <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">
                    Showing <strong className="text-indigo-700 dark:text-indigo-300">{win.single ? focusBucket.longLabel : `${FULL_MONTHS[focusBucket.key % 12]} ${Math.floor(focusBucket.key / 12)}`}</strong> ·{' '}
                    <button onClick={() => setFocusKey(null)} className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline">show {win.single ? 'all days' : 'all months'}</button>
                  </span>
                ) : (
                  <span className="hidden md:inline text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">{placeRank === 'visits' ? 'Ranked by visits' : 'Ranked by total'} · bars show each {win.single ? 'week' : 'month'}</span>
                )}
                <div role="group" aria-label="Merchant amounts" className={`${focusBucket || placeRank === 'visits' ? 'hidden' : 'flex'} gap-1 p-1 bg-slate-100 dark:bg-neutral-700/60 rounded-lg`}>
                  {([['month', win.single ? 'Per week' : 'Per month'], ['total', 'Total']] as const).map(([id, l]) => (
                    <button
                      key={id}
                      onClick={() => setMerchantAmount(id)}
                      aria-pressed={merchantAmount === id}
                      className={`px-3 py-1 rounded-md text-xs transition-colors ${merchantAmount === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {merchants.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">Nothing selected.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
                  {[merchantsShown.slice(0, merchantHalf), merchantsShown.slice(merchantHalf)].map((colRows, ci0) => (
                    <div key={ci0}>
                      {colRows.map((m, j) => {
                        const rank = ci0 * merchantHalf + j + 1;
                        const perUnit = m.total / Math.max(1, m.activeCols);
                        return (
                          <button
                            key={m.name}
                            onClick={() => setPlacePick({
                              key: m.key,
                              name: m.name,
                              catName: m.cat,
                              catId: m.catId,
                              tint: PLACE_TINTS[(rank - 1) % PLACE_TINTS.length],
                              // Opens on the month you're looking at (a clicked bar or a one-month
                              // period), otherwise the whole year of its latest payment.
                              year: Math.floor((focusBucket && !win.single ? focusBucket.key : m.lastMonth) / 12),
                              month: focusBucket && !win.single ? focusBucket.key : win.single ? m.lastMonth : null,
                            })}
                            className="w-full text-left grid grid-cols-[22px_minmax(0,1fr)_86px] sm:grid-cols-[22px_minmax(0,1fr)_76px_86px] gap-3 items-center py-2.5 border-t border-slate-100 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700/30 rounded-md"
                          >
                            <span className="text-xs text-slate-400">{rank}</span>
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={m.name}>{m.name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                                {placeRank === 'visits' ? `${m.cat}${m.count > 1 ? ` · avg ${fmt(m.avg, 2)}` : ''}` : `${m.cat} · ${m.count} ${m.count === 1 ? 'payment' : 'payments'}`}
                                {placeRank === 'visits' ? (focusBucket ? ` in ${win.single ? focusBucket.longLabel : MONTHS[focusBucket.key % 12]}` : '') : focusBucket
                                  ? ` in ${win.single ? focusBucket.longLabel : MONTHS[focusBucket.key % 12]} · ${fmt(m.periodTotal)} over the period`
                                  : m.activeCols > 1 && ` · ${merchantAmount === 'month' ? `${fmt(m.total)} total` : `${fmt(perUnit)}/${win.single ? 'week' : 'month'}`}`}
                              </div>
                            </div>
                            <div aria-label={`${m.name} by ${win.single ? 'week' : 'month'}`} className="hidden sm:flex items-end gap-[3px] h-[26px]">
                              {m.cells.map((v, ci) => (
                                <span key={cols[ci].key} title={`${cols[ci].label}: ${fmt(v, 2)}`} className={`flex-1 rounded-[2px] ${v <= 0 ? 'bg-slate-100 dark:bg-neutral-700' : focusCol === null || cols[ci].key === focusCol ? 'bg-indigo-500' : 'bg-indigo-200 dark:bg-indigo-900'}`} style={{ height: v > 0 ? Math.max(3, Math.round((v / m.cellMax) * 26)) : 2 }} />
                              ))}
                            </div>
                            {placeRank === 'visits' ? (
                              <span className="flex flex-col items-end leading-tight">
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{m.count === 1 ? 'once' : `${m.count}×`}</span>
                                <span className="text-[11px] text-slate-500 dark:text-neutral-400">{fmt(m.total)}</span>
                              </span>
                            ) : (
                              <span className="text-[13px] font-semibold text-right text-slate-900 dark:text-neutral-100">
                                {focusBucket || merchantAmount === 'total' ? fmt(m.total, 2) : fmt(perUnit)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3">
                  {rankedMerchants.length > 16 ? (
                    <button onClick={() => setMoreMerchants(v => !v)} className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
                      {moreMerchants ? 'Show fewer' : `Show ${Math.min(16, rankedMerchants.length - 16)} more`}
                    </button>
                  ) : <span />}
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400">{focusBucket ? `Amounts are for ${win.single ? focusBucket.longLabel : MONTHS[focusBucket.key % 12]} only · highlighted bar = that ${win.single ? 'week' : 'month'}` : placeRank === 'visits' ? 'Times paid in the period, with the total spent' : merchantAmount === 'month' ? `Per ${win.single ? 'week' : 'month'} = average across the ${win.single ? 'weeks' : 'months'} it was paid` : 'Total for the period'}</span>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
      )}

      {/* Money in */}
      {inRange.length > 0 && (
        <section className={`${card} p-4 md:p-6`}>
          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-1">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">
              Money in{focusBucket && <> · <span className="text-emerald-700 dark:text-emerald-400">{win.single ? focusBucket.longLabel : `${FULL_MONTHS[focusBucket.key % 12]} ${Math.floor(focusBucket.key / 12)}`}</span></>}
            </h2>
            <span className="text-xs md:text-sm text-slate-600 dark:text-neutral-300">
              <strong className="text-base text-emerald-700 dark:text-emerald-400">{fmt(income.total)}</strong>
              {' '}· {income.count} {income.count === 1 ? 'payment' : 'payments'}
              {income.coverage !== null && <> · covered {Math.round(income.coverage * 100)}% of spending</>}
            </span>
          </div>
          {incomeRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No income recorded in this period.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1.3fr] gap-6 lg:gap-8 mt-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100 mb-2">By type</h3>
                {income.types.length === 0 && <p className="text-xs text-slate-500 py-2 border-t border-slate-100 dark:border-neutral-700">None this {win.single ? 'day' : 'month'}.</p>}
                {income.types.map(t => (
                  <div key={t.name} className="py-2.5 border-t border-slate-100 dark:border-neutral-700">
                    <div className="flex justify-between text-[13px]">
                      <span className="font-medium text-slate-900 dark:text-neutral-100 capitalize">{t.name}</span>
                      <span className="font-semibold text-slate-900 dark:text-neutral-100">
                        {fmt(t.v, 2)} <span className="font-normal text-[11px] text-slate-500 dark:text-neutral-400">{income.total > 0 ? (t.v / income.total < 0.005 ? '<1' : Math.round((t.v / income.total) * 100)) : 0}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded bg-slate-100 dark:bg-neutral-700 mt-1.5 overflow-hidden">
                      <div className="h-full rounded bg-emerald-500" style={{ width: `${(t.v / income.types[0].v) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Each {win.single ? 'week' : 'month'}</h3>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mb-3">Dashed line = {fmt(income.avg)} average</p>
                <div className="relative grid gap-2 md:gap-3 items-end h-44" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                  {(() => {
                    const mx = Math.max(...income.perCol, 1);
                    const H = 120;
                    return (
                      <>
                        <div aria-hidden className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-400 pointer-events-none" style={{ bottom: Math.round((income.avg / mx) * H) + 20 }} />
                        {income.perCol.map((v, i) => {
                          const on = focusCol === null || cols[i].key === focusCol;
                          return (
                            <div key={cols[i].key} className="flex flex-col items-center justify-end gap-1 h-full" title={`${cols[i].label}: ${fmt(v, 2)}`}>
                              <span className={`text-[10px] font-semibold whitespace-nowrap ${on ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}>{v > 0 ? fmt(v) : '–'}</span>
                              <div className={`w-full max-w-[44px] rounded-t ${v <= 0 ? 'bg-slate-100 dark:bg-neutral-700' : on ? 'bg-emerald-400' : 'bg-emerald-100 dark:bg-emerald-950'}`} style={{ height: v > 0 ? Math.max(3, Math.round((v / mx) * H)) : 2 }} />
                              <span className={`text-[10px] ${cols[i].key === focusCol ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{cols[i].label}</span>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100 mb-2">Where it came from</h3>
                {income.sources.length === 0 && <p className="text-xs text-slate-500 py-2 border-t border-slate-100 dark:border-neutral-700">No income this {win.single ? 'day' : 'month'}.</p>}
                {income.sources.map(src => (
                  <div key={src.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-2 border-t border-slate-100 dark:border-neutral-700">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-slate-900 dark:text-neutral-100 truncate" title={src.name}>{src.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate capitalize">
                        {src.type} · {src.count > 1 ? `${src.count} payments` : Array.from(src.months).map(m => MONTHS[m % 12]).join(', ')}
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">{fmt(src.total, 2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Regular payments: a 6-month overview, or a check of the selected month */}
      <section className={`${card} p-4 md:p-6`}>
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-1">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">
            Regular payments{checkMonth !== null && <> · <span className="text-indigo-700 dark:text-indigo-300">{checkLabel}</span></>}
          </h2>
          <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">
            {checkMonth !== null
              ? <>Checked against your usual pattern.{!win.single && <> <button onClick={() => setFocusKey(null)} className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline">Back to overview</button></>}</>
              : 'Found automatically from your last 6 months. Select a month in the chart to check it.'}
          </span>
        </div>

        {checkMonth === null ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mt-4">
            {[
              { title: 'Bills · same amount, on a schedule', side: bills.length ? `≈ ${fmt(billsPerMonth)} a month` : '', rows: bills, color: '#312e81', empty: 'No regular bills found.' },
              { title: 'Habits · frequent, amounts vary', side: 'Average per payment', rows: habits, color: '#f59e0b', empty: 'No frequent habits found.' },
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
                    <div>{renderDots(p, col.color)}</div>
                    <span className="text-[13px] md:text-sm font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(p.avg, 2)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mt-4">
            <div>
              <div className="flex justify-between items-baseline pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Bills · {MONTHS[checkMonth % 12]}</h3>
                <span className="text-[11px] text-slate-500 dark:text-neutral-400">
                  {billChecks.length ? `${billsPaid.length} of ${billChecks.filter(x => x.st.tone !== 'muted').length || billChecks.length} due paid · ${fmt(sum(billsPaid.map(x => x.st.amount || 0)), 2)}` : ''}
                </span>
              </div>
              {billChecks.length === 0 && <p className="text-xs text-slate-500 py-2">No regular bills found.</p>}
              {billChecks.map(({ b, st }) => (
                <div key={b.name} className="grid grid-cols-[22px_minmax(0,1fr)_auto_80px] md:grid-cols-[22px_minmax(0,1fr)_auto_96px] gap-3 items-center py-2.5 border-t border-slate-100 dark:border-neutral-700">
                  <span
                    aria-label={st.tone === 'ok' ? 'Paid' : st.tone === 'warn' ? 'Not paid' : 'Not due'}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${st.tone === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : st.tone === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' : 'bg-slate-100 text-slate-400 dark:bg-neutral-700'}`}
                  >
                    {st.icon}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-[13px] md:text-sm font-medium truncate ${st.tone === 'muted' ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-900 dark:text-neutral-100'}`}>{b.name}</div>
                    <div className={`text-[11px] md:text-xs truncate ${st.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400'}`}>{b.category} · {st.text}</div>
                  </div>
                  <div className="hidden sm:block">{renderDots(b, '#312e81')}</div>
                  <span className={`text-[13px] md:text-sm text-right ${st.amount !== null ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>
                    {st.amount !== null ? fmt(st.amount, 2) : `~${fmt(b.avg, 2)}`}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="flex justify-between items-baseline pb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Habits · {MONTHS[checkMonth % 12]} vs your usual month</h3>
              </div>
              {habitChecks.length === 0 && <p className="text-xs text-slate-500 py-2">No frequent habits found.</p>}
              {habitChecks.map(({ h, now, usual, change }) => (
                <div key={h.name} className="grid grid-cols-[minmax(0,1fr)_auto_80px] md:grid-cols-[minmax(0,1fr)_auto_96px] gap-3 items-center py-2.5 border-t border-slate-100 dark:border-neutral-700">
                  <div className="min-w-0">
                    <div className="text-[13px] md:text-sm font-medium truncate text-slate-900 dark:text-neutral-100">{h.name}</div>
                    <div className="text-[11px] md:text-xs truncate text-slate-500 dark:text-neutral-400">
                      {h.category} · usually {fmt(usual)} a month{' '}
                      {change !== null && (
                        <span className={`font-semibold ${now === 0 || Math.abs(change) < 0.15 ? 'text-slate-500 dark:text-neutral-400' : change > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          · {now === 0 ? 'none this month' : Math.abs(change) < 0.15 ? 'about usual' : `${change > 0 ? '↑' : '↓'} ${Math.round(Math.abs(change) * 100)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:block">{renderDots(h, '#f59e0b')}</div>
                  <span className={`text-[13px] md:text-sm text-right ${now ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>
                    {now === null ? 'no data' : now > 0 ? fmt(now, 2) : 'none'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <PlaceSheet
        side
        place={placePick}
        onClose={() => setPlacePick(null)}
        transactions={transactions}
        currency={currency}
        getCategoryEmoji={getCategoryEmoji}
        firstIdx={0}
        lastIdx={lastIdx}
      />
    </div>
  );
};

export default SpendingPatterns;
