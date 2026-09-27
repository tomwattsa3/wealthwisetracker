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

const PERIODS = [
  { id: 'mtd', label: 'MTD' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: '12m', label: '12 months' },
] as const;
type PeriodId = typeof PERIODS[number]['id'];

const STORAGE_KEY = 'spendingPatterns';
const NO_SUB = 'No subcategory';
// Subcategories are switched off individually as "Category › Sub" keys, alongside whole
// categories (plain names) in the same `unselected` set.
const subKey = (cat: string, sub: string) => `${cat} › ${sub}`;

// "YYYY-MM" month index, used as a sortable key.
const monthKey = (date: string) => date.slice(0, 7);
const keyToIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const indexLabel = (i: number) => MONTHS[i % 12];
const indexToKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const daysIn = (i: number) => new Date(Math.floor(i / 12), (i % 12) + 1, 0).getDate();
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface PeriodWindow {
  start: string; // inclusive YYYY-MM-DD
  end: string;   // inclusive YYYY-MM-DD
  monthIdxs: number[];
  single: boolean; // one calendar month → day-by-day view
  dayLimit: number; // days of that month shown / counted (MTD stops at today)
  label: string;
  name: string; // plain period name for messages ("September 2026")
  prev: { start: string; end: string; label: string } | null; // equal-length period before it
}

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
  sub: string;
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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { period?: PeriodId; unselected?: string[]; view?: 'total' | 'category'; level?: 'category' | 'subcategory' };
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, unselected: Array.from(unselected), view, level }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
  }, [period, unselected, view, level]);

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
  const win = useMemo<PeriodWindow>(() => {
    const monthSpan = (idx: number, lastDay = daysIn(idx)) => ({ start: `${indexToKey(idx)}-01`, end: `${indexToKey(idx)}-${String(lastDay).padStart(2, '0')}` });
    const monthName = (idx: number) => `${FULL_MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;
    const day = Number(today.slice(8, 10));
    if (period === 'mtd' || period === 'thisMonth' || period === 'lastMonth') {
      const idx = period === 'lastMonth' ? curIdx - 1 : curIdx;
      const limit = period === 'mtd' ? day : daysIn(idx);
      const prevLimit = period === 'mtd' ? Math.min(day, daysIn(idx - 1)) : daysIn(idx - 1);
      return {
        ...monthSpan(idx, limit),
        monthIdxs: [idx],
        single: true,
        dayLimit: limit,
        label: period === 'mtd' ? `${monthName(idx)} so far` : monthName(idx),
        name: monthName(idx),
        prev: { ...monthSpan(idx - 1, prevLimit), label: period === 'mtd' ? `the same days of ${FULL_MONTHS[(idx - 1) % 12]}` : FULL_MONTHS[(idx - 1) % 12] },
      };
    }
    if (period === 'ytd') {
      const y = Math.floor(curIdx / 12);
      const first = y * 12;
      return {
        start: `${y}-01-01`,
        end: today,
        monthIdxs: Array.from({ length: curIdx - first + 1 }, (_, i) => first + i),
        single: false,
        dayLimit: 0,
        label: `1 Jan – ${day} ${MONTHS[curIdx % 12]} ${y}`,
        name: `${y} so far`,
        prev: { start: `${y - 1}-01-01`, end: `${y - 1}${today.slice(4)}`, label: 'the same time last year' },
      };
    }
    const n = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    const first = lastIdx - n + 1;
    return {
      start: monthSpan(first).start,
      end: monthSpan(lastIdx).end,
      monthIdxs: Array.from({ length: n }, (_, i) => first + i),
      single: false,
      dayLimit: 0,
      label: `${monthName(first)} – ${monthName(lastIdx)}`,
      name: `${monthName(first)} – ${monthName(lastIdx)}`,
      prev: { start: monthSpan(first - n).start, end: monthSpan(first - 1).end, label: `the previous ${n} months` },
    };
  }, [period, today, curIdx, lastIdx]);

  const inWindow = (d: string, w: { start: string; end: string }) => d.slice(0, 10) >= w.start && d.slice(0, 10) <= w.end;
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
  // Always based on the last 6 imported months, whatever period is picked above — a single
  // month can't show whether something repeats.
  const regMonths = useMemo(() => Array.from({ length: 6 }, (_, i) => lastIdx - 5 + i), [lastIdx]);
  const { bills, habits, billsPerMonth } = useMemo(() => {
    const regRows = spends.filter(s => s.monthIdx >= regMonths[0] && s.monthIdx <= lastIdx);
    const groups = new Map<string, Spend[]>();
    regRows.forEach(s => { const k = merchantKey(s.desc); groups.set(k, [...(groups.get(k) || []), s]); });
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
    const dataMonths = Math.max(1, new Set(regRows.map(s => s.monthIdx)).size);
    return { bills: bills.slice(0, 8), habits: habits.slice(0, 6), billsPerMonth: sum(bills.map(b => b.total)) / dataMonths };
    // fmt depends only on currency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spends, regMonths, lastIdx, currency]);

  const trendText = trend === null ? '' : Math.abs(trend) < 0.05 ? 'about the same' : `${trend > 0 ? 'up' : 'down'} ${Math.round(Math.abs(trend) * 100)}%`;
  const trendClause = trend === null ? '' : trendLabel.startsWith('vs ')
    ? ` That's ${trendText} ${trendLabel.replace('vs ', Math.abs(trend) < 0.05 ? 'as ' : 'on ')}.`
    : ` It's ${trendText} in ${trendLabel.replace(' vs ', ' compared with ')}.`;
  const sentence = selected.size === 0
    ? 'Pick at least one category to see its patterns.'
    : win.single
      ? `You've spent ${fmt(total)} on this in ${win.label}, about ${fmt(avg)} a day. Most of it went out on ${DOW_FULL[dowPeak]}s.${trendClause}`
      : `You spend ${fmt(avg)} a month on this. Most of it goes out on ${DOW_FULL[dowPeak]}s and in ${TOM_LONG[tomPeak]} of the month.${trendClause}`;

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const label = 'text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400';
  const BAR_H = 190;

  // The bar whose breakdown is shown under the Totals chart: the one you clicked, else the latest
  // with spending.
  // Breakdown under the Totals chart: the whole period by default, or one month/day once you
  // click its bar (click it again, or "Show all", to go back).
  const focus = buckets.find(b => b.key === focusKey && b.total > 0) || null;
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
    const cols = win.single
      ? TOM.map((l, i) => ({ key: i, label: l }))
      : monthIdxs.map(mi => ({ key: mi, label: indexLabel(mi) }));
    const colOf = (s: Spend) => {
      if (!win.single) return s.monthIdx;
      const d = Number(s.date.slice(8, 10));
      return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
    };
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
  }, [win, monthIdxs, catStats, chosen, level]);
  const compact = (v: number) => (v >= 1000 ? `${currency === 'GBP' ? '£' : 'AED '}${(v / 1000).toFixed(1)}k` : fmt(v));

  const renderDots = (p: RegularPayment, color: string) => (
    <div className="flex gap-1" aria-label={`Paid in ${p.months.map(m => MONTHS[m % 12]).join(', ')}`}>
      {regMonths.map(mi => (
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
              { l: trendLabel || 'Trend', v: !selected.size || trend === null ? '–' : Math.abs(trend) < 0.05 ? 'Flat' : `${trend > 0 ? '↑' : '↓'} ${Math.round(Math.abs(trend) * 100)}%`, c: trend === null || Math.abs(trend) < 0.05 ? '' : trend > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400' },
            ].map(k => (
              <div key={k.l} className={`${card} px-4 py-3 md:px-5 md:py-4`}>
                <div className={label}>{k.l}</div>
                <div className={`text-lg md:text-2xl font-semibold mt-1 text-slate-900 dark:text-neutral-100 ${k.c || ''}`}>{k.v}</div>
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
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs md:text-[13px] truncate text-slate-800 dark:text-neutral-200">{m.name}</span>
                    <span className="text-[10px] md:text-[11px] text-slate-500 dark:text-neutral-400 truncate">{m.cat}</span>
                  </span>
                  <span className="text-xs md:text-[13px] font-semibold whitespace-nowrap text-slate-900 dark:text-neutral-100">{fmt(m.total)}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
      )}

      {/* Regular payments */}
      <section className={`${card} p-4 md:p-6`}>
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-1">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">Regular payments we spotted</h2>
          <span className="text-[11px] md:text-xs text-slate-500 dark:text-neutral-400">Found automatically from repeat payments in your last 6 months of data. Nothing to tag.</span>
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
                  <div>{renderDots(p, col.color)}</div>
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
