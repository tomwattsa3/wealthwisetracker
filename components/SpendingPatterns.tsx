import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category } from '../types';
import {
  MONTHS, FULL_MONTHS, TOM, PERIODS, PeriodId, PeriodWindow, monthKey, keyToIndex, indexLabel, daysIn, localToday,
  inWindow, computeWindow, merchantKey, mean, sum,
} from '../lib/periods';

import PlaceSheet, { PlacePick, PLACE_TINTS } from './PlaceSheet';
import CategorySheets from './CategorySheets';
import { useMixedMerchants } from './MixedMerchants';
import { needsReview } from './TransactionsView';
interface SpendingPatternsProps {
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
  // Opens the Transactions tab filtered to a category (from the category panel).
  onViewTransactions?: (categoryId: string, subcategory: string | null, start: string, end: string) => void;
  // Quick links in the hero card.
  lastImport?: string;
  onImport?: () => void;
  onOpenTransactions?: (view: 'review' | 'mixed') => void;
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

const SpendingPatterns: React.FC<SpendingPatternsProps> = ({ transactions, categories, currency, getCategoryEmoji, onViewTransactions, lastImport, onImport, onOpenTransactions }) => {
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { period?: PeriodId; unselected?: string[]; view?: 'total' | 'category'; level?: 'category' | 'subcategory'; merchantAmount?: 'month' | 'total'; placeRank?: 'spent' | 'visits'; snapshot?: string };
    } catch {
      return {};
    }
  }, []);
  // Always opens on Year to date; pick another period from the menu for this visit.
  const [period, setPeriod] = useState<PeriodId>('ytd');
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
  // The category clicked in "Where it went", shown in the same panel as Category Sheets' See all.
  const [catPanel, setCatPanel] = useState<{ cat: string; year: number; month: number | null; n: number } | null>(null);
  const [periodMenu, setPeriodMenu] = useState(false);
  const [pickerMenu, setPickerMenu] = useState(false);
  const [moreCats, setMoreCats] = useState(false);
  // "Where it came from": every type, or just one (Commission, Refund…).
  const [srcType, setSrcType] = useState('all');
  // The bar you're pointing at in the By category chart (its split shows above the chart).
  const [hoverKey, setHoverKey] = useState<number | null>(null);
  // The small card under the headline you flip through with ‹ ›; remembers the last one shown.
  const SNAPSHOTS = ['ring', 'links', 'housing', 'costs', 'net'] as const;
  const [snapshot, setSnapshot] = useState<typeof SNAPSHOTS[number]>(() => (SNAPSHOTS as readonly string[]).includes(saved.snapshot || '') ? saved.snapshot as typeof SNAPSHOTS[number] : 'ring');
  // Which way the last flip went, so the next view slides in from that side.
  const [snapDir, setSnapDir] = useState<1 | -1>(1);
  const flipSnapshot = (dir: 1 | -1) => { setSnapDir(dir); setSnapshot(cur => SNAPSHOTS[(SNAPSHOTS.indexOf(cur) + dir + SNAPSHOTS.length) % SNAPSHOTS.length]); };
  const reviewCount = useMemo(() => transactions.filter(needsReview).length, [transactions]);
  const { mixed: mixedMerchants } = useMixedMerchants(transactions);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, unselected: Array.from(unselected), view, level, merchantAmount, placeRank, snapshot }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
  }, [period, unselected, view, level, merchantAmount, placeRank, snapshot]);

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
    const bySource = new Map<string, { key: string; name: string; type: string; total: number; count: number; months: Set<number> }>();
    scoped.forEach(r => {
      const k = merchantKey(r.desc);
      const e = bySource.get(k) || { key: k, name: r.desc, type: r.type, total: 0, count: 0, months: new Set<number>() };
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
      sources: Array.from(bySource.values()).sort((a, b) => b.total - a.total),
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
  const BAR_H = 250;

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

  // Colours that tie each category's chip, dot and bars together (busiest first).
  const CAT_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  const catColor = (name: string) => { const i = catStats.findIndex(c => c.name === name); return i >= 0 && i < CAT_COLORS.length ? CAT_COLORS[i] : '#94A3B8'; };
  const focusLabel = focus ? (win.single ? focus.longLabel : `${FULL_MONTHS[focus.key % 12]} ${Math.floor(focus.key / 12)}`) : '';
  const periodLabel = PERIODS.find(p => p.id === period)?.label || win.label;
  // The month a panel opens on: the bar you picked, or a one-month period; otherwise the whole year.
  const panelMonth = win.single ? monthIdxs[0] : focus ? focus.key : null;
  const panelYear = Math.floor((panelMonth ?? Math.max(...inRange.map(s => s.monthIdx), lastIdx)) / 12);
  const shortTrend = trend === null ? '' : `${trendText.charAt(0).toUpperCase()}${trendText.slice(1)} ${trendLabel.startsWith('vs ') ? trendLabel : `in ${trendLabel.replace(' vs ', ' compared with ')}`}`;
  const heroSub = focus && vsAvg && vsAvg.diff !== null
    ? { text: Math.abs(vsAvg.diff) < 0.05 ? 'About your average' : `${vsAvg.diff > 0 ? '↑' : '↓'} ${Math.round(Math.abs(vsAvg.diff) * 100)}% ${vsAvg.diff > 0 ? 'above' : 'below'} your average`, cls: Math.abs(vsAvg.diff) < 0.05 ? 'text-slate-600 dark:text-neutral-300' : vsAvg.diff > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400' }
    : { text: `Average ${fmt(avg)} a ${unit}`, cls: 'text-slate-600 dark:text-neutral-300' };
  const chipCats = catStats.slice(0, 4);
  const shownRows = moreCats ? focusRows : focusRows.slice(0, 8);
  const placesShown = rankedMerchants.slice(0, moreMerchants ? 16 : 8);
  // Spending in every category per column, for Money in's "in against out" bars.
  const outPerCol = cols.map(c => sum(inRange.filter(s => colOf(s) === c.key).map(s => s.amount)));
  const srcTypes = income.types.slice(0, 4).map(t => t.name);
  // A type picked for another period that has none here falls back to All.
  const activeSrc = income.types.some(t => t.name === srcType) ? srcType : 'all';
  const srcList = (activeSrc === 'all' ? income.sources : income.sources.filter(x => x.type === activeSrc)).slice(0, 8);
  // Snapshot data for what's on screen: the picked month, or the whole period.
  const inScope = (s: Spend) => !focus || (win.single ? Number(s.date.slice(8, 10)) === focus.key : s.monthIdx === focus.key);
  const scopeCats = (() => {
    const m = new Map<string, number>();
    chosen.filter(inScope).forEach(s => m.set(s.cat, (m.get(s.cat) || 0) + s.amount));
    return Array.from(m.entries()).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
  })();
  const scopeTotal = sum(scopeCats.map(c => c.v));
  const housingV = scopeCats.filter(c => c.name.trim().toLowerCase() === 'housing').reduce((a, c) => a + c.v, 0);
  const everyday = scopeTotal - housingV;
  const spentAll = sum(inRange.filter(inScope).map(s => s.amount));
  const netV = income.total - spentAll;
  const ringParts = (() => {
    const top = scopeCats.slice(0, 4).map(c => ({ name: c.name, v: c.v, color: catColor(c.name) }));
    const rest = scopeTotal - sum(top.map(t => t.v));
    return rest > 0.005 ? [...top, { name: 'The rest', v: rest, color: '#CBD5E1' }] : top;
  })();
  // The chart shows only imported months (no empty slots for months you haven't imported yet).
  const shownBuckets = win.single ? buckets : buckets.filter(b => b.key <= lastIdx);
  // By category: your top 3 categories in this period, then everything else, as one stacked bar.
  const bucketOf = (s: Spend) => (win.single ? Number(s.date.slice(8, 10)) : s.monthIdx);
  const STACK_COLORS = ['#3730A3', '#6366F1', '#A5B4FC'];
  const stackGroups = (() => {
    const tot = new Map<string, number>();
    chosen.forEach(s => tot.set(s.cat, (tot.get(s.cat) || 0) + s.amount));
    const top3 = Array.from(tot.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    const per = new Map<number, Map<string, number>>();
    chosen.forEach(s => {
      const k = bucketOf(s);
      const m = per.get(k) || new Map<string, number>();
      const g = top3.includes(s.cat) ? s.cat : 'Everything else';
      m.set(g, (m.get(g) || 0) + s.amount);
      per.set(k, m);
    });
    const groups = [...top3.map((name, i) => ({ name, color: STACK_COLORS[i] })), { name: 'Everything else', color: '' }];
    return { groups, per, totals: groups.map(g => ({ ...g, v: sum(Array.from(per.values()).map(m => m.get(g.name) || 0)) })) };
  })();
  const readKey = hoverKey ?? focus?.key ?? null;
  const readBucket = readKey === null ? null : buckets.find(b => b.key === readKey) || null;
  const pct = (v: number, of: number) => (of > 0 ? (v / of < 0.005 ? '<1' : Math.round((v / of) * 100)) : 0);
  const pill = (on: boolean) => `min-h-[32px] px-3.5 rounded-full text-[13px] transition-colors whitespace-nowrap ${on ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'}`;
  const bigCard = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-3xl';

  // Scrolls with the page (<main>) rather than inside its own box, so pull-to-refresh works.
  return (
    <div className="pb-24 md:pb-6 flex flex-col gap-5 md:gap-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header: title, and the period as one compact menu (a month picked on the chart overrides it) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Dashboard</h1>
          <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">
            {focus ? <>Showing <strong className="font-semibold text-slate-700 dark:text-neutral-200">{focusLabel}</strong> only · picked on the chart</> : <>{win.label}{period.endsWith('m') ? ' · up to your latest imported month' : ''}</>}
          </p>
        </div>
        <div className="relative flex items-center gap-2">
          {focus && (
            <button onClick={() => setFocusKey(null)} className="min-h-[40px] px-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">← Back to {periodLabel.toLowerCase()}</button>
          )}
          <button
            onClick={() => setPeriodMenu(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={periodMenu}
            className="min-h-[40px] min-w-[180px] px-3.5 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-slate-900 dark:text-neutral-100 flex items-center justify-between gap-3 hover:border-slate-300"
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {focus ? focusLabel : periodLabel}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${periodMenu ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {periodMenu && (
            <>
              <button aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setPeriodMenu(false)} />
              <div role="listbox" aria-label="Period" className="absolute right-0 top-12 z-30 w-56 p-1.5 rounded-2xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-xl flex flex-col gap-0.5">
                {PERIODS.map(p => {
                  const on = period === p.id && !focus;
                  return (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={on}
                      onClick={() => { setPeriod(p.id); setFocusKey(null); setPeriodMenu(false); }}
                      className={`min-h-[40px] px-3 rounded-xl text-sm text-left flex items-center justify-between ${on ? 'bg-indigo-50 dark:bg-indigo-950/50 font-semibold text-indigo-800 dark:text-indigo-200' : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700/50'}`}
                    >
                      {p.label}
                      {on && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
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
      <>
      {/* Hero: the headline numbers beside the chart, category chips underneath */}
      <section aria-label="Spending overview" className={bigCard}>
        <div className="flex flex-wrap gap-8 xl:gap-12 p-6 md:p-8 pb-5">
          <div className="flex-[1_1_240px] max-w-[320px] flex flex-col">
            <div className="text-[13px] font-medium text-slate-500 dark:text-neutral-400">{focus ? `Spent in ${focusLabel}` : `Spent · ${periodLabel.toLowerCase()}`}</div>
            <div className="text-[44px] xl:text-[52px] leading-[1.05] font-bold tracking-tight text-slate-900 dark:text-neutral-100 mt-1.5">{fmt(focus ? focus.total : total)}</div>
            <div className={`text-[15px] font-semibold mt-1.5 ${heroSub.cls}`}>{heroSub.text}</div>
            <div className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">
              {focus
                ? `${total > 0 ? Math.round((focus.total / total) * 100) : 0}% of ${periodLabel.toLowerCase()}`
                : selected.size && peak.total > 0 ? `Busiest ${unit}: ${peak.label} · ${fmt(peak.total)}` : ''}
            </div>

            {/* Snapshot: flip through with ‹ › (remembered) */}
            <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 px-4 pt-3 pb-4 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
                  {{ ring: 'Where it went', links: 'Quick links', housing: 'Without housing', costs: 'Biggest costs', net: 'Net position' }[snapshot]}
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1" aria-hidden>
                    {SNAPSHOTS.map(k => <span key={k} className={`h-1.5 rounded-full transition-all duration-300 ${k === snapshot ? 'w-4 bg-indigo-500 dark:bg-indigo-400' : 'w-1.5 bg-slate-300 dark:bg-neutral-500'}`} />)}
                  </span>
                  <span className="flex">
                    <button onClick={() => flipSnapshot(-1)} aria-label="Previous snapshot" className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-800 hover:shadow-sm dark:hover:bg-neutral-600 dark:hover:text-neutral-100 transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <button onClick={() => flipSnapshot(1)} aria-label="Next snapshot" className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-800 hover:shadow-sm dark:hover:bg-neutral-600 dark:hover:text-neutral-100 transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  </span>
                </span>
              </div>
              <div className="relative h-[104px] mt-2">
                <AnimatePresence initial={false} custom={snapDir} mode="popLayout">
                  <motion.div
                    key={snapshot}
                    custom={snapDir}
                    variants={{
                      enter: (d: number) => ({ x: d * 28, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (d: number) => ({ x: d * -28, opacity: 0 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0"
                  >
                {snapshot === 'ring' && (
                  scopeTotal > 0 ? (
                    <div className="h-full flex items-center gap-4">
                      <svg width="92" height="92" viewBox="0 0 42 42" role="img" aria-label={ringParts.map(p => `${p.name} ${pct(p.v, scopeTotal)}%`).join(', ')} className="shrink-0 -rotate-90">
                        <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5" className="stroke-slate-200 dark:stroke-neutral-600" />
                        {(() => {
                          let acc = 0;
                          return ringParts.map(p => {
                            const len = (p.v / scopeTotal) * 100;
                            const el = <circle key={p.name} cx="21" cy="21" r="15.9155" fill="none" stroke={p.color} strokeWidth="5" strokeLinecap="butt" strokeDasharray={`${Math.max(0, len - 0.8)} ${100 - Math.max(0, len - 0.8)}`} strokeDashoffset={-acc} />;
                            acc += len;
                            return el;
                          });
                        })()}
                      </svg>
                      <div className="min-w-0 flex-1 flex flex-col gap-1 text-xs">
                        {ringParts.map(p => (
                          <span key={p.name} className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                            <span className={`flex-1 truncate ${p.name === 'The rest' ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-700 dark:text-neutral-200'}`}>{p.name}</span>
                            <span className="text-slate-500 dark:text-neutral-400">{pct(p.v, scopeTotal)}%</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : <p className="pt-3 text-xs text-slate-500">Nothing selected.</p>
                )}
                {snapshot === 'links' && (
                  <div className="h-full flex flex-col justify-center gap-1.5">
                    {[
                      { label: reviewCount ? `Review ${reviewCount} transaction${reviewCount === 1 ? '' : 's'}` : 'Nothing to review', on: () => onOpenTransactions?.('review'), dot: reviewCount ? '#F59E0B' : '#CBD5E1' },
                      { label: mixedMerchants.length ? `${mixedMerchants.length} mixed categor${mixedMerchants.length === 1 ? 'y' : 'ies'}` : 'No mixed categories', on: () => onOpenTransactions?.('mixed'), dot: mixedMerchants.length ? '#8B5CF6' : '#CBD5E1' },
                      { label: lastImport ? `Import · last ${lastImport}` : 'Import statements', on: () => onImport?.(), dot: '#4F46E5' },
                    ].map(l => (
                      <button key={l.label} onClick={l.on} className="min-h-[30px] px-3 rounded-[10px] bg-white dark:bg-neutral-800 text-[13px] font-medium text-slate-700 dark:text-neutral-200 flex items-center gap-2.5 hover:shadow-sm transition-shadow">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.dot }} />
                        <span className="flex-1 truncate text-left">{l.label}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m9 18 6-6-6-6" /></svg>
                      </button>
                    ))}
                  </div>
                )}
                {snapshot === 'housing' && (
                  <div className="h-full flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[26px] leading-none font-bold tracking-tight text-slate-900 dark:text-neutral-100">{fmt(everyday)}</span>
                      {!focus && !win.single && <span className="text-[13px] text-slate-500 dark:text-neutral-400">{fmt(everyday / dataMonths)} a month</span>}
                    </div>
                    <div className="mt-3 h-1.5 flex gap-1">
                      {housingV > 0 && <span className="h-full rounded-full" style={{ width: `${(housingV / scopeTotal) * 100}%`, background: catColor('Housing') }} />}
                      <span className="h-full rounded-full flex-1 bg-slate-300 dark:bg-neutral-500" />
                    </div>
                    <div className="mt-2 flex gap-4 text-[11px] text-slate-500 dark:text-neutral-400">
                      {housingV > 0
                        ? <>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: catColor('Housing') }} />Housing {fmt(housingV)}</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-neutral-500" />Everyday {fmt(everyday)}</span>
                          </>
                        : <span>No housing in this selection</span>}
                    </div>
                  </div>
                )}
                {snapshot === 'costs' && (
                  <div className="h-full flex flex-col justify-center gap-3">
                    {scopeCats.slice(0, 3).map(c => (
                      <div key={c.name} className="grid grid-cols-[84px_minmax(0,1fr)_34px] gap-2.5 items-center text-[13px]">
                        <span className="truncate text-slate-700 dark:text-neutral-200">{c.name}</span>
                        <span className="h-1.5 rounded-full bg-slate-200 dark:bg-neutral-600 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(c.v / (scopeCats[0]?.v || 1)) * 100}%`, background: catColor(c.name) }} /></span>
                        <span className="text-right text-xs text-slate-500 dark:text-neutral-400">{pct(c.v, scopeTotal)}%</span>
                      </div>
                    ))}
                    {scopeCats.length === 0 && <p className="text-xs text-slate-500">Nothing selected.</p>}
                  </div>
                )}
                {snapshot === 'net' && (
                  <div className="h-full flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-[26px] leading-none font-bold tracking-tight ${netV < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{netV < 0 ? '−' : '+'}{fmt(Math.abs(netV))}</span>
                      <span className="text-[13px] text-slate-500 dark:text-neutral-400">{spentAll > 0 ? Math.round((income.total / spentAll) * 100) : 0}% covered</span>
                    </div>
                    <div className="mt-3 h-1.5 flex gap-1">
                      <span className="h-full rounded-full bg-emerald-500" style={{ width: `${income.total + spentAll > 0 ? (income.total / (income.total + spentAll)) * 100 : 0}%` }} />
                      <span className="h-full rounded-full flex-1 bg-slate-300 dark:bg-neutral-500" />
                    </div>
                    <div className="mt-2 flex gap-4 text-[11px] text-slate-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />In {fmt(income.total)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-neutral-500" />Out {fmt(spentAll)}</span>
                    </div>
                  </div>
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Money in at a glance: follows the period, or the month you picked */}
            <div className="mt-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 px-4 pt-3 pb-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">Money in</span>
                {income.coverage !== null && <span className="text-xs text-slate-500 dark:text-neutral-400">{Math.round(income.coverage * 100)}% covered</span>}
              </div>
              <div className="mt-1 flex items-end justify-between gap-4">
                <span className="text-[22px] leading-none font-bold tracking-tight text-emerald-700 dark:text-emerald-400">{fmt(income.total)}</span>
                <span aria-hidden className="flex items-end gap-[3px] h-9">
                  {cols.map((c, i) => {
                    const mx = Math.max(...income.perCol, 1);
                    const v = income.perCol[i];
                    const on = focusCol === null || c.key === focusCol;
                    return <span key={c.key} title={`${c.label}: ${fmt(v)}`} className={`w-2 rounded-[3px] ${v <= 0 ? 'bg-emerald-100 dark:bg-emerald-950' : on ? 'bg-emerald-500' : 'bg-emerald-200 dark:bg-emerald-900'}`} style={{ height: v > 0 ? Math.max(4, Math.round((v / mx) * 36)) : 3 }} />;
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-[3_1_420px] min-w-0 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <p className="text-[13px] text-slate-500 dark:text-neutral-400">
                {focus ? `Click ${win.single ? 'that day' : MONTHS[focus.key % 12]} again, or Back, for the whole period` : <>{shortTrend}{shortTrend ? ' · ' : ''}click a {win.single ? 'day' : 'month'} to see just that {win.single ? 'day' : 'month'}</>}
              </p>
              <div className="flex items-center gap-3">
                {selected.size > 0 && total > 0 && (
                  <span className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-neutral-400"><span className="w-[18px] border-t-2 border-dashed border-slate-400" />Average {fmt(avg)}</span>
                )}
                <div role="group" aria-label="Chart view" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-full">
                  {([['total', 'Totals'], ['category', 'By category']] as const).map(([id, l]) => (
                    <button key={id} onClick={() => setView(id)} aria-pressed={view === id} className={pill(view === id)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {view === 'total' ? (
              <div className="relative overflow-x-auto">
                <div
                  className={`relative grid items-end ${win.single ? 'gap-[3px]' : monthIdxs.length >= 12 ? 'gap-2.5' : 'gap-4 xl:gap-5'}`}
                  style={{ gridTemplateColumns: `repeat(${shownBuckets.length}, minmax(${win.single ? 6 : 28}px, 1fr))`, height: BAR_H + (win.single ? 40 : 56) }}
                >
                  {selected.size > 0 && total > 0 && (
                    <div aria-hidden className="absolute left-0 right-0 border-t-2 border-dashed border-slate-400/70 pointer-events-none z-[1]" style={{ bottom: Math.round((avg / maxBucket) * BAR_H) + 26 }} />
                  )}
                  {shownBuckets.map(b => {
                    const isFocus = focus?.key === b.key;
                    const dim = !!focus && !isFocus;
                    return (
                      <button
                        key={b.key}
                        onClick={() => b.total > 0 && setFocusKey(isFocus ? null : b.key)}
                        disabled={b.total === 0}
                        aria-pressed={isFocus}
                        aria-label={`${b.longLabel}: ${fmt(b.total, 2)}`}
                        className="flex flex-col items-stretch justify-end gap-2 h-full group disabled:cursor-default min-w-0"
                      >
                        {!win.single && (
                          <span className={`relative z-[2] self-center px-1 rounded bg-white dark:bg-neutral-800 text-xs font-semibold text-center whitespace-nowrap ${isFocus ? 'text-indigo-700 dark:text-indigo-300' : dim ? 'text-slate-300 dark:text-neutral-600' : 'text-slate-500 dark:text-neutral-400'}`}>{b.total > 0 ? fmt(b.total) : ''}</span>
                        )}
                        <span
                          className={`block w-full mx-auto ${win.single ? 'rounded-sm' : 'rounded-[10px] max-w-[96px]'} transition-colors ${b.total === 0 ? 'bg-slate-100 dark:bg-neutral-700' : isFocus ? 'bg-indigo-600' : dim ? 'bg-indigo-100 dark:bg-indigo-950 group-hover:bg-indigo-200' : 'bg-indigo-400 dark:bg-indigo-500 group-hover:bg-indigo-500'}`}
                          style={{ height: b.total > 0 ? Math.max(4, Math.round((b.total / maxBucket) * BAR_H)) : 4 }}
                        />
                        <span className={`h-[18px] text-xs text-center ${isFocus ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'} ${win.single && b.key !== 1 && Number(b.key) % 5 !== 0 && !isFocus ? 'invisible' : ''}`}>{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* What's under the pointer (or the picked month), else the whole period */}
                <div className="min-h-[28px] flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-2">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">
                    {readBucket ? `${win.single ? readBucket.longLabel : `${FULL_MONTHS[readBucket.key % 12]} ${Math.floor(readBucket.key / 12)}`} · ${fmt(readBucket.total)}` : `${fmt(total)} ${periodLabel.toLowerCase()}`}
                  </span>
                  {stackGroups.totals.map(g => {
                    const v = readBucket ? (stackGroups.per.get(readBucket.key)?.get(g.name) || 0) : g.v;
                    return (
                      <span key={g.name} className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-neutral-400">
                        <span className={`w-2 h-2 rounded-full ${g.color ? '' : 'bg-slate-200 dark:bg-neutral-600 ring-1 ring-inset ring-slate-300 dark:ring-neutral-500'}`} style={g.color ? { background: g.color } : undefined} />
                        {g.name} <strong className="font-semibold text-slate-900 dark:text-neutral-100">{fmt(v)}</strong>
                      </span>
                    );
                  })}
                </div>
                <div className="relative overflow-x-auto">
                  <div
                    className={`relative grid items-end ${win.single ? 'gap-[3px]' : monthIdxs.length >= 12 ? 'gap-3' : 'gap-6 xl:gap-8'}`}
                    style={{ gridTemplateColumns: `repeat(${shownBuckets.length}, minmax(${win.single ? 6 : 28}px, 1fr))`, height: BAR_H + (win.single ? 14 : 28) - 28 }}
                    onMouseLeave={() => setHoverKey(null)}
                  >
                    {selected.size > 0 && total > 0 && (
                      <div aria-hidden className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-300 dark:border-neutral-600 pointer-events-none z-[1]" style={{ bottom: Math.round((avg / maxBucket) * (BAR_H - 28)) + 26 }} />
                    )}
                    {shownBuckets.map(b => {
                      const isFocus = focus?.key === b.key;
                      const lit = readKey === null || readKey === b.key;
                      const h = b.total > 0 ? Math.max(4, Math.round((b.total / maxBucket) * (BAR_H - 28))) : 4;
                      const parts = stackGroups.per.get(b.key);
                      return (
                        <button
                          key={b.key}
                          onClick={() => b.total > 0 && setFocusKey(isFocus ? null : b.key)}
                          onMouseEnter={() => setHoverKey(b.key)}
                          onFocus={() => setHoverKey(b.key)}
                          onBlur={() => setHoverKey(null)}
                          disabled={b.total === 0}
                          aria-pressed={isFocus}
                          aria-label={`${b.longLabel}: ${fmt(b.total, 2)}`}
                          className="flex flex-col items-center justify-end gap-2.5 h-full disabled:cursor-default min-w-0"
                        >
                          <span
                            className={`w-full ${win.single ? 'rounded-sm' : 'max-w-[92px] rounded-xl'} overflow-hidden flex flex-col-reverse gap-[1.5px] transition-opacity duration-150 ${lit ? '' : 'opacity-35'} ${b.total === 0 ? 'bg-slate-100 dark:bg-neutral-700' : ''}`}
                            style={{ height: h }}
                          >
                            {b.total > 0 && stackGroups.groups.map(g => {
                              const v = parts?.get(g.name) || 0;
                              if (v <= 0) return null;
                              return <span key={g.name} className={`block w-full ${g.color ? '' : 'bg-slate-200 dark:bg-neutral-600'}`} style={{ flex: `${v} 1 0`, minHeight: 2, ...(g.color ? { background: g.color } : {}) }} />;
                            })}
                          </span>
                          <span className={`h-[18px] text-xs text-center ${isFocus || readKey === b.key ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'} ${win.single && b.key !== 1 && Number(b.key) % 5 !== 0 && !isFocus ? 'invisible' : ''}`}>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick picks, the biggest categories as chips, and every category in a menu */}
        <div className="border-t border-slate-100 dark:border-neutral-700 px-6 md:px-8 py-4 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Quick picks" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-full mr-1.5">
            {presets.map(p => (
              <button key={p.label} onClick={() => selectOnly(p.names)} aria-pressed={presetActive(p.names)} className={pill(presetActive(p.names))}>{p.label}</button>
            ))}
          </div>
          {chipCats.map(c => {
            const on = catState(c) !== 'off';
            return (
              <button
                key={c.name}
                onClick={() => toggle(c.name)}
                aria-pressed={on}
                className={`min-h-[34px] px-3 rounded-full border text-[13px] flex items-center gap-2 transition-colors ${on ? 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100' : 'border-dashed border-slate-300 dark:border-neutral-600 bg-slate-50 dark:bg-neutral-800/50 text-slate-400 line-through'}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: on ? catColor(c.name) : '#CBD5E1' }} />
                {c.name}
                <span className="text-slate-400 dark:text-neutral-500">{fmt(c.total)}</span>
              </button>
            );
          })}
          <div className="relative">
            <button onClick={() => setPickerMenu(o => !o)} aria-expanded={pickerMenu} className="min-h-[34px] px-3 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
              {selected.size === catStats.length ? `All ${catStats.length} categories` : `${selected.size} of ${catStats.length} categories`}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={pickerMenu ? 'rotate-180' : ''}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {pickerMenu && (
              <>
                <button aria-label="Close categories" className="fixed inset-0 z-20 cursor-default" onClick={() => setPickerMenu(false)} />
                <div className="absolute left-0 top-11 z-30 w-[320px] max-h-[420px] overflow-y-auto p-2 rounded-2xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-xl flex flex-col gap-0.5">
                  {catStats.map(c => {
                    const state = catState(c);
                    const on = state !== 'off';
                    const emoji = getCategoryEmoji && c.catId ? getCategoryEmoji(c.catId) : '';
                    const hasSubs = c.subs.length > 1 || (c.subs.length === 1 && c.subs[0].name !== NO_SUB);
                    const open = expanded.has(c.name);
                    return (
                      <div key={c.name}>
                        <div className={`flex items-center rounded-lg ${on ? 'bg-slate-50 dark:bg-neutral-700/60' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/40'}`}>
                          <button onClick={() => toggle(c.name)} aria-pressed={state === 'on' ? true : state === 'some' ? 'mixed' : false} className="flex-1 min-w-0 flex items-center gap-2.5 pl-2.5 pr-1 py-2 text-left">
                            <span aria-hidden className={`w-4 h-4 rounded-[5px] shrink-0 border-2 flex items-center justify-center ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-neutral-500'}`}>
                              {state === 'on' && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                              {state === 'some' && <span className="block w-2 h-0.5 rounded bg-white" />}
                            </span>
                            <span className={`flex-1 truncate text-[13px] ${on ? 'font-semibold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{emoji && <span className="mr-1">{emoji}</span>}{c.name}</span>
                            <span className="text-xs text-slate-500 dark:text-neutral-400">{fmt(c.total)}</span>
                          </button>
                          {hasSubs ? (
                            <button onClick={() => toggleExpanded(c.name)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${c.name} subcategories`} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200">
                              <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
                            </button>
                          ) : <span className="w-8 shrink-0" />}
                        </div>
                        {hasSubs && open && (
                          <div className="ml-6 pl-2 border-l border-slate-200 dark:border-neutral-700 flex flex-col my-0.5">
                            {c.subs.map(sb => {
                              const subOn = isIncluded({ cat: c.name, sub: sb.name });
                              return (
                                <button key={sb.name} onClick={() => toggleSub(c.name, sb.name)} aria-pressed={subOn} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-slate-50 dark:hover:bg-neutral-700/40">
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
              </>
            )}
          </div>
        </div>
      </section>

      {/* Where it went beside Top places */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 md:gap-6 items-stretch">
        <section aria-label="Where it went" className={`${bigCard} p-6 md:p-7 flex flex-col`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Where it went</h2>
              <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{focus ? focusLabel : win.label} · {focusRows.length} {level === 'category' ? (focusRows.length === 1 ? 'category' : 'categories') : 'subcategories'}</p>
            </div>
            <div className="flex items-center gap-3">
              <div role="group" aria-label="Group by" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-full">
                {([['category', 'Categories'], ['subcategory', 'Subcategories']] as const).map(([id, l]) => (
                  <button key={id} onClick={() => setLevel(id)} aria-pressed={level === id} className={pill(level === id)}>{l}</button>
                ))}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-neutral-400">Total</div>
                <div className="text-lg font-bold text-slate-900 dark:text-neutral-100">{fmt(focusTotal, 2)}</div>
              </div>
            </div>
          </div>
          {focusRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6">Nothing selected.</p>
          ) : (
            <>
              <div aria-hidden className="mt-4 h-2.5 rounded-full bg-slate-100 dark:bg-neutral-700 flex overflow-hidden">
                {focusRows.slice(0, 8).map(r => (
                  <span key={r.key} style={{ width: `${(r.value / focusTotal) * 100}%`, background: catColor(r.cat) }} />
                ))}
              </div>
              <div className="mt-3 flex flex-col">
                {shownRows.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setCatPanel({ cat: r.cat, year: panelYear, month: panelMonth, n: Date.now() })}
                    title={`Open ${r.cat}`}
                    className="grid grid-cols-[10px_minmax(0,1.15fr)_minmax(0,1fr)_40px_96px] gap-3.5 items-center min-h-[44px] px-2 -mx-2 rounded-xl border-t border-slate-100 dark:border-neutral-700/70 text-left hover:bg-slate-50 dark:hover:bg-neutral-700/30"
                  >
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: catColor(r.cat) }} />
                    <span className="text-sm text-slate-900 dark:text-neutral-100 truncate">{r.sub ? <>{r.sub === NO_SUB ? 'No subcategory' : r.sub} <span className="text-slate-400 dark:text-neutral-500">· {r.cat}</span></> : r.cat}</span>
                    <span className="h-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (r.value / focusRows[0].value) * 100)}%`, background: catColor(r.cat) }} /></span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400 text-right">{focusTotal > 0 && r.value / focusTotal < 0.005 ? '<1' : Math.round((r.value / focusTotal) * 100)}%</span>
                    <span className="text-sm font-semibold text-right text-slate-900 dark:text-neutral-100">{fmt(r.value, 2)}</span>
                  </button>
                ))}
              </div>
              {focusRows.length > 8 && (
                <button onClick={() => setMoreCats(v => !v)} className="mt-auto pt-3 self-start min-h-[40px] text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {moreCats ? 'Show fewer' : `Show ${focusRows.length - 8} more`}
                </button>
              )}
            </>
          )}
        </section>

        <section aria-label="Top places" className={`${bigCard} p-6 md:p-7 flex flex-col`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Top places</h2>
              <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{placeRank === 'visits' ? 'Where you paid most often' : 'Where you spent the most'}{focus ? ` in ${focusLabel}` : ''}</p>
            </div>
            <div role="group" aria-label="Rank places by" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-full">
              {([['visits', 'Most visits'], ['spent', 'Most spent']] as const).map(([id, l]) => (
                <button key={id} onClick={() => { setPlaceRank(id); setMoreMerchants(false); }} aria-pressed={placeRank === id} className={pill(placeRank === id)}>{l}</button>
              ))}
            </div>
          </div>
          {placesShown.length === 0 ? (
            <p className="text-sm text-slate-500 py-6">Nothing selected.</p>
          ) : (
            <div className="mt-3 flex flex-col">
              {placesShown.map((m, i) => (
                <button
                  key={m.key}
                  onClick={() => setPlacePick({
                    key: m.key, name: m.name, catName: m.cat, catId: m.catId,
                    tint: PLACE_TINTS[i % PLACE_TINTS.length],
                    year: Math.floor((focus && !win.single ? focus.key : m.lastMonth) / 12),
                    month: focus && !win.single ? focus.key : win.single ? m.lastMonth : null,
                  })}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3.5 items-center min-h-[56px] px-2 -mx-2 rounded-xl border-t border-slate-100 dark:border-neutral-700/70 text-left hover:bg-slate-50 dark:hover:bg-neutral-700/30"
                >
                  <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center text-sm font-bold ${PLACE_TINTS[i % PLACE_TINTS.length]}`}>{m.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>
                  <span className="min-w-0 flex flex-col">
                    <span className="text-sm font-medium text-slate-900 dark:text-neutral-100 truncate">{m.name}</span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                      {placeRank === 'visits' ? `${m.cat}${m.count > 1 ? ` · avg ${fmt(m.avg, 2)}` : ''}` : `${m.cat} · ${m.count === 1 ? 'once' : `${m.count} payments`}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-sm font-bold text-slate-900 dark:text-neutral-100">{placeRank === 'visits' ? (m.count === 1 ? 'once' : `${m.count}×`) : fmt(m.total)}</span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">{placeRank === 'visits' ? fmt(m.total) : m.count === 1 ? 'once' : `${m.count}×`}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-auto pt-3 flex items-center justify-between gap-3">
            {rankedMerchants.length > 8 ? (
              <button onClick={() => setMoreMerchants(v => !v)} className="min-h-[40px] text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">{moreMerchants ? 'Show fewer' : `Show ${Math.min(8, rankedMerchants.length - 8)} more`}</button>
            ) : <span />}
            <span className="text-xs text-slate-400 dark:text-neutral-500">Click a place for its months and payments</span>
          </div>
        </section>
      </div>

      {/* Money in beside Where it came from */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 md:gap-6 items-stretch">
        <section aria-label="Money in" className={`${bigCard} p-6 md:p-7 flex flex-col gap-6`}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Money in</h2>
              <div className="text-[40px] leading-[1.1] font-bold tracking-tight text-emerald-700 dark:text-emerald-400 mt-1.5">{fmt(income.total)}</div>
              <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-1">
                {income.count} {income.count === 1 ? 'payment' : 'payments'}{focus ? ` in ${focusLabel}` : ` · average ${fmt(income.avg)} a ${win.single ? 'week' : 'month'}`}
              </p>
            </div>
            {income.coverage !== null && (
              <div className="flex-[0_1_260px] min-w-[200px]">
                <div className="flex justify-between text-[13px]">
                  <span className="text-slate-600 dark:text-neutral-300">Covered of your spending</span>
                  <span className="font-bold text-slate-900 dark:text-neutral-100">{Math.round(income.coverage * 100)}%</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, income.coverage * 100)}%` }} />
                </div>
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1.5">{fmt(income.total)} in · {fmt(income.total / income.coverage)} out · net {income.total / income.coverage > income.total ? '−' : '+'}{fmt(Math.abs(income.total / income.coverage - income.total))}</p>
              </div>
            )}
          </div>
          {incomeRows.length === 0 ? (
            <p className="text-sm text-slate-500">No money in during this period.</p>
          ) : (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                  <p className="text-[13px] text-slate-600 dark:text-neutral-300">Each {win.single ? 'week' : 'month'}, in against out</p>
                  <span className="flex gap-3.5 text-xs text-slate-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500" />In</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-slate-300 dark:bg-neutral-500" />Out</span>
                  </span>
                </div>
                <div className="grid items-end gap-3 h-[180px]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                  {cols.map((c, i) => {
                    const mx = Math.max(...income.perCol, ...outPerCol, 1);
                    const on = focusCol === null || c.key === focusCol;
                    const h = (v: number) => (v > 0 ? Math.max(4, Math.round((v / mx) * 140)) : 3);
                    return (
                      <button
                        key={c.key}
                        onClick={() => !win.single && (income.perCol[i] > 0 || outPerCol[i] > 0) && setFocusKey(focus?.key === c.key ? null : (c.key as number))}
                        disabled={win.single}
                        aria-label={`${c.label}: ${fmt(income.perCol[i])} in, ${fmt(outPerCol[i])} out`}
                        title={`${c.label}: ${fmt(income.perCol[i], 2)} in · ${fmt(outPerCol[i], 2)} out`}
                        className={`h-full flex flex-col justify-end gap-2 min-w-0 disabled:cursor-default ${on ? '' : 'opacity-35'}`}
                      >
                        <span className="flex items-end justify-center gap-1">
                          <span className="block w-[38%] max-w-[26px] rounded-md bg-emerald-500" style={{ height: h(income.perCol[i]) }} />
                          <span className="block w-[38%] max-w-[26px] rounded-md bg-slate-300 dark:bg-neutral-500" style={{ height: h(outPerCol[i]) }} />
                        </span>
                        <span className={`h-[18px] text-xs text-center ${c.key === focusCol ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-500 dark:text-neutral-400'}`}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {income.types.length > 0 && (
                <div>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">By type</h3>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">{income.types.length} {income.types.length === 1 ? 'type' : 'types'}</span>
                  </div>
                  <div aria-hidden className="mt-2.5 h-2.5 rounded-full bg-slate-100 dark:bg-neutral-700 flex overflow-hidden">
                    {income.types.map((t, i) => <span key={t.name} style={{ width: `${(t.v / income.total) * 100}%`, background: ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B'][i] || '#94A3B8' }} />)}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-2.5">
                    {income.types.map((t, i) => (
                      <button key={t.name} onClick={() => setSrcType(activeSrc === t.name ? 'all' : t.name)} aria-pressed={activeSrc === t.name} className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-1.5 -mx-1.5 min-h-[32px] ${activeSrc === t.name ? 'bg-slate-100 dark:bg-neutral-700/60' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/30'}`}>
                        <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B'][i] || '#94A3B8' }} />
                        <span className="flex-1 min-w-0 truncate capitalize text-slate-900 dark:text-neutral-100">{t.name}</span>
                        <span className="text-xs text-slate-500 dark:text-neutral-400">{income.total > 0 && t.v / income.total < 0.005 ? '<1' : Math.round((t.v / Math.max(income.total, 1)) * 100)}%</span>
                        <span className="font-semibold min-w-[84px] text-right text-slate-900 dark:text-neutral-100">{fmt(t.v, 2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-label="Where it came from" className={`${bigCard} p-6 md:p-7 flex flex-col`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Where it came from</h2>
              <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">
                {activeSrc === 'all' ? 'Biggest payments in' : <><span className="capitalize">{activeSrc}</span> · {fmt(income.types.find(t => t.name === activeSrc)?.v || 0, 2)} in total</>}{focus ? ` · ${focusLabel}` : ''}
              </p>
            </div>
            {srcTypes.length > 1 && (
              <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-full">
                {['all', ...srcTypes].map(t => (
                  <button key={t} onClick={() => setSrcType(t)} aria-pressed={srcType === t} className={`${pill(activeSrc === t)} capitalize`}>{t === 'all' ? 'All' : t.replace(/ interest$/i, '')}</button>
                ))}
              </div>
            )}
          </div>
          {srcList.length === 0 ? (
            <p className="text-sm text-slate-500 py-6">{activeSrc === 'all' ? 'No money in during this period.' : `No ${activeSrc.toLowerCase()} payments in this period.`}</p>
          ) : (
            <div className="mt-3 flex flex-col">
              {srcList.map(src => (
                <button
                  key={src.key}
                  onClick={() => setPlacePick({
                    key: src.key, name: src.name, catName: src.type, catId: '',
                    tint: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
                    year: panelYear, month: panelMonth, income: true,
                  })}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3.5 items-center min-h-[56px] px-2 -mx-2 rounded-xl border-t border-slate-100 dark:border-neutral-700/70 text-left hover:bg-slate-50 dark:hover:bg-neutral-700/30"
                >
                  <span className="w-9 h-9 rounded-[11px] flex items-center justify-center text-sm font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{src.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}</span>
                  <span className="min-w-0 flex flex-col">
                    <span className="text-sm font-medium text-slate-900 dark:text-neutral-100 truncate" title={src.name}>{src.name}</span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400 truncate"><span className="capitalize">{src.type}</span> · {src.count > 1 ? `${src.count} payments` : Array.from(src.months).map(m => MONTHS[m % 12]).join(', ')}</span>
                  </span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">+{fmt(src.total, 2)}</span>
                </button>
              ))}
            </div>
          )}
          <span className="mt-auto pt-3 text-xs text-slate-400 dark:text-neutral-500">Click a payment for its months and history</span>
        </section>
      </div>
      </>
      )}

      {/* Regular payments: a 6-month overview, or a check of the selected month */}
      <section className={`${bigCard} p-6 md:p-7`}>
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
