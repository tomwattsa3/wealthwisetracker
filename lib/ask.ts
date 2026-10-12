import { Transaction, Category } from '../types';
import { supabase } from '../supabaseClient';
import { MONTHS, merchantKey, sum, localToday } from './periods';

// Ask about your money, shared by the Ask page and search. The AI (api/ask.ts) only turns the
// question into a search; runSearch runs that search on your own transactions and adds
// everything up here, so every number is the app's own.

export interface AskGroup { label: string; places: string[]; categories: string[]; subcategories: string[] }
export type GroupBy = '' | 'category' | 'subcategory' | 'place' | 'month' | 'weekday' | 'day' | 'payment' | 'bank';
export interface AskSearch {
  metric: 'total' | 'count' | 'average' | 'per_month' | 'per_week' | 'per_day' | 'by_month' | 'by_day' | 'biggest_payment' | 'biggest_day' | 'compare' | 'on_track' | 'suggest_budget' | 'budget_left' | 'net'
    | 'compare_groups' | 'top' | 'list' | 'last_payment' | 'share_of_income' | 'net_by_month' | 'what_if' | 'projection' | 'duplicates' | 'new_places' | 'unsupported';
  direction: 'out' | 'in' | 'both';
  places: string[];
  categories: string[];
  subcategories: string[];
  start: string;
  end: string;
  compare_start?: string;
  compare_end?: string;
  title: string;
  understood: string;
  reason?: string;
  budget_amount?: number;
  // Two or more things side by side over the same dates (compare_groups)
  groups?: AskGroup[];
  // Rankings (top): what to group by, highest or lowest first, by money / how often / average
  group_by?: GroupBy;
  rank?: 'top' | 'bottom';
  rank_by?: 'amount' | 'count' | 'average';
  limit?: number;
  // Extra filters (0 / empty = none)
  min_amount?: number;
  max_amount?: number;
  weekdays?: number[]; // 1 = Monday … 7 = Sunday
  days_of_month?: number[];
  include_hidden?: boolean; // also look at payments left out of totals (transfers, refunds, excluded…)
  uncategorised?: boolean; // only payments with no category
  change_pct?: number; // what_if: e.g. -50 for "cut by half"
}

export interface Row { t: Transaction; date: string; amount: number; name: string }

export interface AskAnswer {
  metric: AskSearch['metric'];
  // For per_month / per_week / per_day: shown after the big figure ("a month")
  per?: string;
  // For by_month / by_day: each month's or day's total, oldest first. Also rankings and side-by-side
  // groups (value may be a count or a percentage, see breakdownUnit; net can be negative).
  breakdown?: { label: string; value: number; sub?: string }[];
  breakdownUnit?: 'money' | 'count';
  scope: string;
  big: string;
  unit: string;
  text: string;
  green: boolean;
  bars: { label: string; value: number; hi: boolean }[];
  listTitle: string;
  rows: Row[];
  understood: string;
  open: { search: string; start: string; end: string; categoryId: string | null };
}

const DAY = 86400000;
export const hidden = (t: Transaction) => !!t.excluded || t.categoryId === 'excluded' || (t.categoryName || '').trim().toLowerCase() === 'excluded';
export const dateLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
export const shortDate = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };

// Run the AI's search on your transactions and build the answer (all maths happens here).
export const runSearch = (s: AskSearch, transactions: Transaction[], categories: Category[], currency: 'GBP' | 'AED'): AskAnswer => {
  const amt = (t: Transaction) => Math.abs((currency === 'GBP' ? t.amountGBP : t.amountAED) || 0);
  const fmt = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + Math.round(v).toLocaleString('en-GB');
  const fmt2 = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lc = (x: string) => (x || '').trim().toLowerCase();
  const places = (s.places || []).map(p => ({ key: merchantKey(p), raw: lc(p) }));
  const cats = (s.categories || []).map(lc);
  const subs = (s.subcategories || []).map(lc);

  type Filter = { places: { key: string; raw: string }[]; cats: string[]; subs: string[] };
  const mainFilter: Filter = { places, cats, subs };
  const minA = Number(s.min_amount) || 0, maxA = Number(s.max_amount) || 0;
  const weekdays = (s.weekdays || []).filter(n => n >= 1 && n <= 7);
  const dom = (s.days_of_month || []).filter(n => n >= 1 && n <= 31);
  const weekdayOf = (d: string) => { const g = new Date(`${d}T12:00:00`).getDay(); return g === 0 ? 7 : g; };
  const match = (t: Transaction, start: string, end: string, f: Filter = mainFilter) => {
    if ((!s.include_hidden && hidden(t)) || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) return false;
    const d = t.date.slice(0, 10);
    if (d < start || d > end) return false;
    if (s.direction === 'out' && t.type !== 'EXPENSE') return false;
    if (s.direction === 'in' && t.type !== 'INCOME') return false;
    if (f.places.length) {
      const desc = lc(t.description), k = merchantKey(t.description || '');
      if (!f.places.some(p => (p.key && p.key === k) || (p.raw && desc.includes(p.raw)))) return false;
    }
    if (f.cats.length && !f.cats.includes(lc(t.categoryName))) return false;
    if (f.subs.length && !f.subs.includes(lc(t.subcategoryName))) return false;
    if (s.uncategorised && t.categoryId && lc(t.categoryName)) return false;
    const a = amt(t);
    if (minA && a < minA) return false;
    if (maxA && a > maxA) return false;
    if (weekdays.length && !weekdays.includes(weekdayOf(d))) return false;
    if (dom.length && !dom.includes(Number(d.slice(8, 10)))) return false;
    return true;
  };
  const pick = (start: string, end: string, f: Filter = mainFilter): Row[] => transactions
    .filter(t => match(t, start, end, f))
    .map(t => ({ t, date: t.date.slice(0, 10), amount: amt(t), name: (t.description || '').trim() }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows = pick(s.start, s.end);
  const total = sum(rows.map(r => r.amount));
  const green = s.direction === 'in';
  const sign = (r: Row) => (r.t.type === 'INCOME' ? '+' : '−');
  const n = rows.length;
  const pay = (k: number) => `${k} ${k === 1 ? 'payment' : 'payments'}`;

  // Chart: by day for a month or less, otherwise by month
  const spanDays = Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / DAY) + 1;
  const bars: AskAnswer['bars'] = [];
  if (spanDays <= 35) {
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(new Date(`${s.start}T12:00:00`).getTime() + i * DAY);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      bars.push({ label: String(d.getDate()), value: sum(rows.filter(r => r.date === key).map(r => r.amount)), hi: false });
    }
  } else {
    const a = new Date(`${s.start}T12:00:00`), b = new Date(`${s.end}T12:00:00`);
    for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      bars.push({ label: MONTHS[m], value: sum(rows.filter(r => r.date.startsWith(key)).map(r => r.amount)), hi: false });
      if (bars.length > 36) break;
    }
  }
  const peak = bars.reduce((best, b, i) => (b.value > (bars[best]?.value || 0) ? i : best), 0);
  const biggest = rows.reduce<Row | null>((m, r) => (!m || r.amount > m.amount ? r : m), null);
  const catId = s.categories?.length === 1 ? categories.find(c => lc(c.name) === lc(s.categories[0]))?.id || null : null;
  const open = { search: s.places?.length === 1 ? s.places[0] : '', start: s.start, end: s.end, categoryId: catId };
  const base = { metric: s.metric, scope: s.title, understood: s.understood, green, open };

  // ---- Budgeting (worked out from your history; the app keeps no saved budgets) ----
  const monthKeyOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const monthEnd = (y: number, m: number) => `${monthKeyOf(y, m)}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;
  const monthTotal = (y: number, m: number, upToDay?: number) => {
    const end = upToDay ? `${monthKeyOf(y, m)}-${String(upToDay).padStart(2, '0')}` : monthEnd(y, m);
    return sum(pick(`${monthKeyOf(y, m)}-01`, end).map(r => r.amount));
  };
  const back = (y: number, m: number, k: number) => { const d = new Date(y, m - k, 1); return [d.getFullYear(), d.getMonth()] as const; };
  const todayStr = localToday();
  const ty = Number(todayStr.slice(0, 4)), tm = Number(todayStr.slice(5, 7)) - 1, td = Number(todayStr.slice(8, 10));

  if (s.metric === 'on_track') {
    // This month so far, against the last 3 full months (both up to the same day, and in full)
    const y = Number(s.start.slice(0, 4)) || ty, m = (Number(s.start.slice(5, 7)) || tm + 1) - 1;
    const current = y === ty && m === tm;
    const dim = new Date(y, m + 1, 0).getDate();
    const day = current ? td : dim;
    const so = monthTotal(y, m, day);
    const prev = [3, 2, 1].map(k => back(y, m, k));
    const full = prev.map(([py, pm]) => monthTotal(py, pm));
    const usual = sum(full) / 3;
    const usualSoFar = sum(prev.map(([py, pm]) => monthTotal(py, pm, Math.min(day, new Date(py, pm + 1, 0).getDate())))) / 3;
    const projected = current ? (so / Math.max(day, 1)) * dim : so;
    const diff = projected - usual;
    const near = usual > 0 && Math.abs(diff) / usual < 0.05;
    const verdict = !usual ? 'Not enough history to compare yet.' : near ? 'Right in line with a usual month.' : diff > 0 ? `About ${fmt(diff)} more than a usual month.` : `About ${fmt(-diff)} less than a usual month.`;
    return { ...base, green: usual > 0 && diff <= 0, per: current ? 'by month end' : 'this month',
      big: fmt(projected), unit: `${fmt(so)} so far · usual month ${fmt(usual)}`,
      text: `${verdict}${current ? ` By day ${day} you'd usually have spent ${fmt(usualSoFar)}.` : ''}`,
      bars: [...prev.map(([py, pm], i) => ({ label: MONTHS[pm], value: full[i], hi: false })), { label: MONTHS[m], value: projected, hi: true }],
      listTitle: `${pay(n)} this month`, rows };
  }
  if (s.metric === 'suggest_budget') {
    // The last 6 full months before this one
    const months = [6, 5, 4, 3, 2, 1].map(k => back(ty, tm, k));
    const totals = months.map(([py, pm]) => monthTotal(py, pm));
    const used = totals.filter(v => v > 0);
    const avg = used.length ? sum(used) / used.length : 0;
    const step = avg >= 1000 ? 50 : avg >= 200 ? 25 : 10;
    const suggest = Math.ceil((avg * 1.05) / step) * step;
    const covered = totals.filter(v => v <= suggest).length;
    return { ...base, per: 'a month', big: fmt(suggest),
      unit: used.length ? `your last ${totals.length} months averaged ${fmt(avg)}` : 'no recent spending to go on',
      text: used.length ? `That covers ${covered} of the last ${totals.length} months. They ranged from ${fmt(Math.min(...totals))} to ${fmt(Math.max(...totals))}.` : 'Nothing matched in the last 6 months.',
      bars: months.map(([, pm], i) => ({ label: MONTHS[pm], value: totals[i], hi: false })), listTitle: `${pay(n)}`, rows };
  }
  if (s.metric === 'budget_left') {
    const budget = Math.max(0, Number(s.budget_amount) || 0);
    const spent = total;
    const left = budget - spent;
    const endUsed = s.end;
    const daysLeft = endUsed >= todayStr ? Math.round((new Date(`${endUsed}T12:00:00`).getTime() - new Date(`${todayStr}T12:00:00`).getTime()) / DAY) + 1 : 0;
    return { ...base, green: left >= 0, per: left >= 0 ? 'left' : 'over',
      big: fmt(Math.abs(left)), unit: `of ${fmt(budget)} · ${fmt(spent)} spent`,
      text: left >= 0 ? (daysLeft ? `That's about ${fmt(left / daysLeft)} a day for the ${daysLeft} day${daysLeft === 1 ? '' : 's'} left (today included).` : 'That period has finished.') : `You've gone ${fmt(-left)} over.`,
      bars, listTitle: `${pay(n)}, newest first`, rows };
  }
  if (s.metric === 'net') {
    const both = (dir: 'in' | 'out') => transactions.filter(t => {
      if (hidden(t) || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) return false;
      const d = t.date.slice(0, 10);
      return d >= s.start && d <= s.end && t.type === (dir === 'in' ? 'INCOME' : 'EXPENSE');
    }).reduce((a, t) => a + amt(t), 0);
    const inn = both('in'), out = both('out'), net = inn - out;
    return { ...base, green: net >= 0, per: net >= 0 ? 'saved' : 'overspent',
      big: fmt(Math.abs(net)), unit: `${fmt(inn)} in · ${fmt(out)} out`,
      text: inn > 0 ? `${net >= 0 ? 'You kept' : 'You spent'} ${Math.abs(Math.round((net / inn) * 100))}% ${net >= 0 ? 'of what came in' : 'more than came in'}.` : 'Nothing came in during that period.',
      bars: [], listTitle: '', rows: [] };
  }


  // ---- Side by side, rankings, lists and checks ----
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const endToday = s.end > todayStr ? todayStr : s.end;
  const monthsIn = (a: string, b: string) => {
    const out: { key: string; label: string; y: number; m: number }[] = [];
    const A = new Date(`${a}T12:00:00`), B = new Date(`${b}T12:00:00`);
    const multi = A.getFullYear() !== B.getFullYear();
    for (let y = A.getFullYear(), m = A.getMonth(); (y < B.getFullYear() || (y === B.getFullYear() && m <= B.getMonth())) && out.length < 36; m === 11 ? (y++, m = 0) : m++) {
      out.push({ key: monthKeyOf(y, m), label: multi ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m], y, m });
    }
    return out;
  };
  const countWeekday = (wd: number, a: string, b: string) => {
    let c = 0;
    for (let t = new Date(`${a}T12:00:00`).getTime(); t <= new Date(`${b}T12:00:00`).getTime(); t += DAY) {
      const g = new Date(t).getDay(); if ((g === 0 ? 7 : g) === wd) c++;
    }
    return Math.max(1, c);
  };

  if (s.metric === 'compare_groups') {
    const groups = (s.groups || []).filter(g => g && (g.places?.length || g.categories?.length || g.subcategories?.length)).slice(0, 6);
    if (groups.length < 2) return { ...base, big: '—', unit: 'needs two things to compare', text: 'Name two things to compare, e.g. "Meals Out vs Food Delivery last month".', bars: [], listTitle: '', rows: [] };
    const res = groups.map(g => {
      const f: Filter = { places: (g.places || []).map(p => ({ key: merchantKey(p), raw: lc(p) })), cats: (g.categories || []).map(lc), subs: (g.subcategories || []).map(lc) };
      const r = pick(s.start, s.end, f);
      return { label: g.label || [...(g.subcategories || []), ...(g.categories || []), ...(g.places || [])].join(' + ') || 'Other', rows: r, total: sum(r.map(x => x.amount)) };
    });
    const sorted = [...res].sort((a, b) => b.total - a.total);
    const all = res.reduce((acc, g) => acc + g.total, 0);
    const [hi, lo] = sorted;
    const seen = new Set<Transaction>();
    const union = res.flatMap(g => g.rows).filter(r => (seen.has(r.t) ? false : (seen.add(r.t), true))).sort((a, b) => b.date.localeCompare(a.date));
    const two = res.length === 2;
    return { ...base, breakdownUnit: 'money', breakdown: res.map(g => ({ label: g.label, value: g.total, sub: `${pay(g.rows.length)}` })),
      big: two ? (lo.total > 0 ? `${fmt(hi.total - lo.total)}` : fmt(hi.total)) : fmt(all), per: two ? `more on ${hi.label}` : 'in total',
      unit: res.map(g => `${g.label} ${fmt(g.total)}`).join(' · '),
      text: `${two ? `${hi.label} was ${fmt(hi.total)} and ${lo.label} ${fmt(lo.total)}${lo.total > 0 ? ` (${Math.round((hi.total / lo.total) * 10) / 10}× as much)` : ''}.` : `${hi.label} was the highest at ${fmt(hi.total)}.`} Together ${fmt(all)}.`,
      bars: [], listTitle: `${pay(union.length)}, newest first`, rows: union };
  }

  if (s.metric === 'share_of_income') {
    const income = transactions.filter(t => !hidden(t) && t.type === 'INCOME' && /^\d{4}-\d{2}-\d{2}/.test(t.date) && t.date.slice(0, 10) >= s.start && t.date.slice(0, 10) <= s.end).reduce((a, t) => a + amt(t), 0);
    const pct = income > 0 ? (total / income) * 100 : 0;
    return { ...base, per: 'of your income', big: income > 0 ? `${Math.round(pct)}%` : '—', unit: `${fmt(total)} of ${fmt(income)} that came in`,
      text: income > 0 ? `${fmt(total)} went on this, out of ${fmt(income)} income over the same dates.` : 'No income recorded over those dates.', bars, listTitle: `${pay(n)}, newest first`, rows };
  }

  if (s.metric === 'net_by_month') {
    const ms = monthsIn(s.start, endToday);
    const inOut = (dir: 'INCOME' | 'EXPENSE', key: string) => transactions.filter(t => !hidden(t) && t.type === dir && (t.date || '').startsWith(key)).reduce((a, t) => a + amt(t), 0);
    const breakdown = ms.map(m => { const i = inOut('INCOME', m.key), o = inOut('EXPENSE', m.key); return { label: m.label, value: i - o, sub: `${fmt(i)} in · ${fmt(o)} out${i > 0 ? ` · kept ${Math.round(((i - o) / i) * 100)}%` : ''}` }; });
    const tot = sum(breakdown.map(b => b.value));
    const bad = breakdown.filter(b => b.value < 0);
    return { ...base, breakdownUnit: 'money', breakdown, green: tot >= 0, per: tot >= 0 ? 'saved in total' : 'overspent in total', big: fmt(Math.abs(tot)),
      unit: `over ${ms.length} month${ms.length === 1 ? '' : 's'}`,
      text: bad.length ? `You spent more than came in during ${bad.map(b => b.label).join(', ')}.` : 'You kept money back every month.', bars: [], listTitle: '', rows: [] };
  }

  if (s.metric === 'what_if') {
    const ms = monthsIn(s.start, endToday).length || 1;
    const perMonth = total / ms;
    const pct = Math.max(-100, Math.min(100, Number(s.change_pct) || -50));
    const save = -perMonth * (pct / 100);
    return { ...base, green: save >= 0, per: save >= 0 ? 'a year saved' : 'a year extra', big: fmt(Math.abs(save * 12)),
      unit: `${fmt(Math.abs(save))} a month · now about ${fmt(perMonth)} a month`,
      text: `You spend about ${fmt(perMonth)} a month on this. ${pct < 0 ? `Cutting it by ${Math.abs(pct)}%` : `Raising it by ${pct}%`} ${save >= 0 ? 'saves' : 'costs'} about ${fmt(Math.abs(save))} a month, or ${fmt(Math.abs(save * 12))} a year.`,
      bars, listTitle: `${pay(n)}, newest first`, rows };
  }

  if (s.metric === 'projection') {
    const days = Math.max(1, Math.round((new Date(`${endToday}T12:00:00`).getTime() - new Date(`${s.start}T12:00:00`).getTime()) / DAY) + 1);
    const full = Math.max(days, Math.round((new Date(`${s.end}T12:00:00`).getTime() - new Date(`${s.start}T12:00:00`).getTime()) / DAY) + 1);
    const projected = (total / days) * full;
    return { ...base, per: `by ${dateLabel(s.end)}`, big: fmt(projected), unit: `${fmt(total)} so far after ${days} of ${full} days`,
      text: `At your pace so far (${total / days >= 100 ? fmt(total / days) : fmt2(total / days)} a day), you'd reach about ${fmt(projected)} by ${dateLabel(s.end)}.`, bars, listTitle: `${pay(n)}, newest first`, rows };
  }

  if (s.metric === 'new_places') {
    const first = new Map<string, { name: string; date: string }>();
    transactions.filter(t => !hidden(t) && t.type === 'EXPENSE' && t.description && /^\d{4}-\d{2}-\d{2}/.test(t.date)).forEach(t => {
      const k = merchantKey(t.description) || lc(t.description); const d = t.date.slice(0, 10);
      const e = first.get(k); if (!e || d < e.date) first.set(k, { name: t.description.trim(), date: d });
    });
    const fresh = rows.filter(r => { const e = first.get(merchantKey(r.name) || lc(r.name)); return e && e.date >= s.start && e.date <= s.end; });
    const byPlace = new Map<string, { name: string; v: number; n: number; d: string }>();
    fresh.forEach(r => { const k = merchantKey(r.name) || lc(r.name); const e = byPlace.get(k) || { name: r.name, v: 0, n: 0, d: r.date }; e.v += r.amount; e.n++; if (r.date < e.d) e.d = r.date; byPlace.set(k, e); });
    const list = Array.from(byPlace.values()).sort((a, b) => b.v - a.v);
    return { ...base, breakdownUnit: 'money', breakdown: list.slice(0, 15).map(e => ({ label: e.name, value: e.v, sub: `first on ${shortDate(e.d)} · ${pay(e.n)}` })),
      big: `${list.length}`, per: list.length === 1 ? 'new place' : 'new places', unit: `${fmt(sum(list.map(e => e.v)))} spent at them`,
      text: list.length ? `First-time places: ${list.slice(0, 5).map(e => e.name).join(', ')}${list.length > 5 ? '…' : ''}.` : 'No new places in that period.', bars: [], listTitle: `${pay(fresh.length)} at new places`, rows: fresh };
  }

  if (s.metric === 'duplicates') {
    const key = (r: Row) => `${r.date}|${r.amount.toFixed(2)}|${merchantKey(r.name) || lc(r.name)}`;
    const counts = new Map<string, number>();
    rows.forEach(r => counts.set(key(r), (counts.get(key(r)) || 0) + 1));
    const dup = rows.filter(r => (counts.get(key(r)) || 0) > 1);
    const sets = Array.from(new Set(dup.map(key))).length;
    return { ...base, big: `${sets}`, per: sets === 1 ? 'possible double charge' : 'possible double charges', unit: dup.length ? `${fmt(sum(dup.map(r => r.amount)) / 2)} or so charged twice` : 'nothing charged twice',
      text: dup.length ? 'Same place, same amount, same day. Check them in Transactions.' : 'No payments with the same place, amount and day.', bars: [], listTitle: `${pay(dup.length)} that look doubled`, rows: dup };
  }

  if (!n && s.metric !== 'compare') {
    return { ...base, big: green ? fmt(0) : '—', unit: 'nothing found', text: 'No payments match that. Try a wider date range, or check the name is spelt the way it appears in Transactions.', bars, listTitle: 'No payments', rows: [] };
  }

  switch (s.metric) {
    case 'count': {
      const weeks = spanDays / 7, perWeek = n / weeks, perMonth = n / (spanDays / 30.4);
      const often = weeks < 2 ? '' : perWeek >= 1 ? `About ${perWeek.toFixed(1)} a week. ` : perMonth >= 1 ? `About ${perMonth.toFixed(1)} a month. ` : `About once every ${Math.round(spanDays / n)} days. `;
      return { ...base, big: pay(n), unit: `${fmt(total)} in total`,
        text: `${often}Average ${fmt2(total / n)} each${biggest ? `; the biggest was ${fmt2(biggest.amount)} on ${shortDate(biggest.date)}` : ''}.`,
        bars, listTitle: `Latest ${Math.min(n, 8)} of ${n}`, rows };
    }
    case 'by_month':
    case 'by_day': {
      // Each month (or day) in the range, up to today, with its own total
      const today = localToday();
      const endUsed = s.end > today ? today : s.end;
      const breakdown: { label: string; value: number }[] = [];
      if (s.metric === 'by_month') {
        const a = new Date(`${s.start}T12:00:00`), b = new Date(`${endUsed}T12:00:00`);
        const multiYear = a.getFullYear() !== b.getFullYear();
        for (let y = a.getFullYear(), m = a.getMonth(); (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) && breakdown.length < 36; m === 11 ? (y++, m = 0) : m++) {
          const key = `${y}-${String(m + 1).padStart(2, '0')}`;
          breakdown.push({ label: multiYear ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m], value: sum(rows.filter(r => r.date.startsWith(key)).map(r => r.amount)) });
        }
      } else {
        for (let t = new Date(`${s.start}T12:00:00`).getTime(); t <= new Date(`${endUsed}T12:00:00`).getTime() && breakdown.length < 62; t += DAY) {
          const d = new Date(t);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          breakdown.push({ label: shortDate(key), value: sum(rows.filter(r => r.date === key).map(r => r.amount)) });
        }
      }
      const word = s.metric === 'by_month' ? 'month' : 'day';
      // Going up or down: the later half of the months against the earlier half
      let trend = '';
      if (s.metric === 'by_month' && breakdown.length >= 3) {
        const half = Math.floor(breakdown.length / 2);
        const early = sum(breakdown.slice(0, half).map(b => b.value)) / half;
        const late = sum(breakdown.slice(-half).map(b => b.value)) / half;
        const ch = early > 0 ? (late - early) / early : 0;
        trend = early <= 0 ? '' : Math.abs(ch) < 0.1 ? 'Steady. ' : `Going ${ch > 0 ? 'up' : 'down'}: about ${Math.round(Math.abs(ch) * 100)}% ${ch > 0 ? 'more' : 'less'} in the later months. `;
      }
      return { ...base, breakdown, breakdownUnit: 'money', big: fmt(total), unit: `over ${breakdown.length} ${word}${breakdown.length === 1 ? '' : 's'} · ${pay(n)}`,
        text: trend + breakdown.map(b => `${b.label} ${fmt(b.value)}`).join(' · '),
        bars, listTitle: `${pay(n)}, newest first`, rows };
    }
    case 'per_month':
    case 'per_week':
    case 'per_day': {
      // Spread over the range, up to today (a month that has started counts as one)
      const today = localToday();
      const endUsed = s.end > today ? today : s.end;
      const days = Math.max(1, Math.round((new Date(`${endUsed}T12:00:00`).getTime() - new Date(`${s.start}T12:00:00`).getTime()) / DAY) + 1);
      const months = Math.max(1, (Number(endUsed.slice(0, 4)) - Number(s.start.slice(0, 4))) * 12 + Number(endUsed.slice(5, 7)) - Number(s.start.slice(5, 7)) + 1);
      const [per, units, word] = s.metric === 'per_month' ? ['a month', months, 'month'] : s.metric === 'per_week' ? ['a week', days / 7, 'week'] : ['a day', days, 'day'];
      const each = total / units;
      const shown = Math.round(units);
      return { ...base, per, big: each >= 100 ? fmt(each) : fmt2(each), unit: `${per} · ${fmt(total)} over ${shown} ${word}${shown === 1 ? '' : 's'}`,
        text: `${fmt(total)} in total across ${pay(n)}.${biggest ? ` The biggest was ${fmt2(biggest.amount)} at ${biggest.name} on ${shortDate(biggest.date)}.` : ''}`,
        bars, listTitle: `${pay(n)}, newest first`, rows };
    }
    case 'list':
      return { ...base, big: fmt2(total), unit: `across ${pay(n)}`,
        text: `${pay(n)} from ${dateLabel(s.start)} to ${dateLabel(endToday)}${biggest ? `; the biggest was ${fmt2(biggest.amount)} at ${biggest.name}` : ''}.`,
        bars, listTitle: `${pay(n)}, newest first`, rows };
    case 'last_payment': {
      const last = rows[0];
      const ago = Math.round((new Date(`${todayStr}T12:00:00`).getTime() - new Date(`${last.date}T12:00:00`).getTime()) / DAY);
      return { ...base, big: dateLabel(last.date), unit: `${last.name} · ${fmt2(last.amount)}`,
        text: `${ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${ago} days ago`}.${rows[1] ? ` The time before was ${dateLabel(rows[1].date)}.` : ''}`,
        bars, listTitle: `${pay(n)}, newest first`, rows };
    }
    case 'top': {
      const by: GroupBy = s.group_by || 'category';
      const limit = Math.max(1, Math.min(25, Number(s.limit) || 5));
      const rankBy = s.rank_by || 'amount';
      if (by === 'payment') {
        const list = rows.slice().sort((a, b) => (s.rank === 'bottom' ? a.amount - b.amount : b.amount - a.amount)).slice(0, limit);
        return { ...base, breakdownUnit: 'money', breakdown: list.map(r => ({ label: r.name, value: r.amount, sub: shortDate(r.date) })),
          big: fmt2(list[0].amount), unit: `${list[0].name} · ${dateLabel(list[0].date)}`,
          text: list.map((r, i) => `${i + 1}. ${r.name} ${fmt2(r.amount)} (${shortDate(r.date)})`).join(' · '), bars, listTitle: `${s.rank === 'bottom' ? 'Smallest' : 'Biggest'} ${list.length}`, rows: list };
      }
      const keyOf = (r: Row): [string, string] => {
        switch (by) {
          case 'subcategory': return [`${r.t.categoryName}\u0001${r.t.subcategoryName}`, r.t.subcategoryName ? `${r.t.subcategoryName}` : `${r.t.categoryName || 'Other'} (no subcategory)`];
          case 'place': { const k = merchantKey(r.name) || lc(r.name); return [k, r.name || 'Unknown']; }
          case 'month': return [r.date.slice(0, 7), `${MONTHS[Number(r.date.slice(5, 7)) - 1]} ${r.date.slice(2, 4)}`];
          case 'weekday': { const w = weekdayOf(r.date); return [String(w), WEEKDAYS[w - 1]]; }
          case 'day': return [r.date, dateLabel(r.date)];
          case 'bank': return [r.t.bankName || 'Other', r.t.bankName || 'Other'];
          default: return [r.t.categoryName || 'Not categorised', r.t.categoryName || 'Not categorised'];
        }
      };
      const g = new Map<string, { label: string; v: number; n: number }>();
      rows.forEach(r => { const [k, label] = keyOf(r); const e = g.get(k) || { label, v: 0, n: 0 }; e.v += r.amount; e.n++; g.set(k, e); });
      // Months with nothing still count when looking for the cheapest month
      if (by === 'month') monthsIn(s.start, endToday).forEach(m => { if (!g.has(m.key)) g.set(m.key, { label: `${MONTHS[m.m]} ${String(m.y).slice(2)}`, v: 0, n: 0 }); });
      const value = (k: string, e: { v: number; n: number }) => rankBy === 'count' ? e.n
        : rankBy === 'average' ? (by === 'weekday' ? e.v / countWeekday(Number(k), s.start, endToday) : e.v / Math.max(1, e.n)) : e.v;
      const ranked = Array.from(g.entries()).map(([k, e]) => ({ k, ...e, val: value(k, e) }))
        .sort((a, b) => (s.rank === 'bottom' ? a.val - b.val : b.val - a.val)).slice(0, limit);
      const top1 = ranked[0];
      const unitWord = rankBy === 'count' ? '' : rankBy === 'average' ? (by === 'weekday' ? ' a day on average' : ' a payment on average') : '';
      const show = (v: number) => (rankBy === 'count' ? `${v}×` : fmt(v));
      return { ...base, breakdownUnit: rankBy === 'count' ? 'count' : 'money',
        breakdown: ranked.map(e => ({ label: e.label, value: e.val, sub: rankBy === 'count' ? fmt(e.v) : pay(e.n) })),
        big: top1.label, per: `${show(top1.val)}${unitWord}`, unit: `${s.rank === 'bottom' ? 'lowest' : 'highest'} of ${g.size} · ${fmt(total)} in total`,
        text: ranked.map((e, i) => `${i + 1}. ${e.label} ${show(e.val)}`).join(' · '), bars, listTitle: `${pay(n)}, newest first`, rows };
    }
    case 'average':
      return { ...base, big: fmt2(total / n), unit: `per payment · ${pay(n)}`,
        text: `${fmt(total)} in total.${biggest ? ` The biggest was ${fmt2(biggest.amount)} at ${biggest.name} on ${shortDate(biggest.date)}.` : ''}`,
        bars, listTitle: `${pay(n)}`, rows };
    case 'biggest_payment':
      return { ...base, big: fmt2(biggest!.amount), unit: `${biggest!.name} · ${dateLabel(biggest!.date)}`,
        text: `Out of ${pay(n)} that matched, adding up to ${fmt(total)}.`,
        bars, listTitle: 'Biggest first', rows: rows.slice().sort((a, b) => b.amount - a.amount) };
    case 'biggest_day': {
      const byDay = new Map<string, number>();
      rows.forEach(r => byDay.set(r.date, (byDay.get(r.date) || 0) + r.amount));
      const ranked = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1]);
      const [day, v] = ranked[0];
      const dayRows = rows.filter(r => r.date === day).sort((a, b) => b.amount - a.amount);
      const next = ranked[1];
      return { ...base, big: fmt(v), unit: `on ${dateLabel(day)}`,
        text: `${dayRows[0] ? `Mostly ${dayRows[0].name} (${fmt2(dayRows[0].amount)}).` : ''}${next ? ` The next biggest day was ${shortDate(next[0])} (${fmt(next[1])}).` : ''}`,
        bars: bars.map((b, i) => ({ ...b, hi: spanDays <= 35 ? b.label === String(Number(day.slice(8, 10))) : i === bars.findIndex(x => x.label === MONTHS[Number(day.slice(5, 7)) - 1]) })),
        listTitle: `Payments on ${shortDate(day)}`, rows: dayRows };
    }
    case 'compare': {
      const cs = s.compare_start || s.start, ce = s.compare_end || s.end;
      const before = pick(cs, ce);
      const bTotal = sum(before.map(r => r.amount));
      const diff = total - bTotal;
      const pct = bTotal ? Math.round((diff / bTotal) * 100) : null;
      // What moved most: by subcategory inside one category, otherwise by category
      const groupOf = (r: Row) => (cats.length === 1 ? r.t.subcategoryName || 'Other' : r.t.categoryName || 'Other');
      const g = new Map<string, number>();
      rows.forEach(r => g.set(groupOf(r), (g.get(groupOf(r)) || 0) + r.amount));
      before.forEach(r => g.set(groupOf(r), (g.get(groupOf(r)) || 0) - r.amount));
      const moves = Array.from(g.entries()).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => (diff >= 0 ? b[1] - a[1] : a[1] - b[1])).slice(0, 3);
      const range = (a: string, b: string) => `${shortDate(a)} – ${dateLabel(b)}`;
      return { ...base, green: false,
        big: pct === null ? fmt(total) : `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`,
        unit: `${fmt(total)} vs ${fmt(bTotal)}`,
        text: `${Math.abs(diff) < 1 ? 'About the same.' : `${fmt(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} (${range(s.start, s.end)} against ${range(cs, ce)}).`}${moves.length ? ` Biggest changes: ${moves.map(([k, v]) => `${k} ${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`).join(', ')}.` : ''}`,
        bars, listTitle: `${pay(n)} in the newer period`, rows };
    }
    default: {
      const peakText = bars.length > 1 && bars[peak]?.value ? ` Busiest ${spanDays <= 35 ? 'day' : 'month'}: ${spanDays <= 35 ? shortDate(`${s.start.slice(0, 8)}${String(bars[peak].label).padStart(2, '0')}`) : bars[peak].label} (${fmt(bars[peak].value)}).` : '';
      return { ...base, big: fmt2(total), unit: `across ${pay(n)}`,
        text: `Average ${fmt2(total / n)} each${biggest ? `; the biggest was ${fmt2(biggest.amount)} at ${biggest.name} on ${shortDate(biggest.date)}` : ''}.${peakText}`,
        bars, listTitle: `${pay(n)}, newest first`, rows };
    }
  }
};

// The names the AI may search by (no amounts or dates leave the app). Places by how often you
// go; payers by how much they've paid you.
export interface AskVocab { places: string[]; payers: string[]; categories: { name: string; subs: string[]; hidden?: boolean }[] }
export const buildVocab = (transactions: Transaction[], categories: Category[]): AskVocab => {
  const rank = (type: Transaction['type'], by: 'n' | 'v') => {
    const m = new Map<string, { name: string; n: number; v: number }>();
    transactions.forEach(t => {
      if (t.type !== type || hidden(t) || !t.description) return;
      const k = merchantKey(t.description) || t.description.toLowerCase();
      const e = m.get(k) || { name: t.description.trim(), n: 0, v: 0 };
      e.n++; e.v += Math.abs(t.amountGBP || 0); m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b[by] - a[by]).map(e => e.name);
  };
  return {
    places: rank('EXPENSE', 'n').slice(0, 400),
    payers: rank('INCOME', 'v').slice(0, 150),
    categories: categories.map(c => ({ name: c.name, subs: c.subcategories, hidden: c.id === 'excluded' || c.name.trim().toLowerCase() === 'excluded' })),
  };
};

// Turn a question into a search (one call to api/ask). `history` is the earlier questions in a
// chat, so a follow-up like "and last month?" makes sense. Errors come back as a sentence to show.
export const askAI = async (question: string, vocab: AskVocab, history: string[] = []): Promise<{ ok: true; search: AskSearch } | { ok: false; error: string }> => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ question, history, today: localToday(), ...vocab }),
    });
    const body = await r.json().catch(() => ({ error: `Ask hit a server error (${r.status}).` }));
    if (!r.ok) {
      return { ok: false, error: body.error === 'not_configured'
        ? "Ask isn't switched on yet: it needs an Anthropic API key added in Vercel (ANTHROPIC_API_KEY)."
        : body.error || 'Something went wrong. Try again.' };
    }
    return { ok: true, search: body.search as AskSearch };
  } catch {
    return { ok: false, error: navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Ask needs a connection." };
  }
};
