import { Transaction, Category } from '../types';
import { supabase } from '../supabaseClient';
import { MONTHS, merchantKey, sum, localToday } from './periods';

// Ask about your money, shared by the Ask page and search. The AI (api/ask.ts) only turns the
// question into a search; runSearch runs that search on your own transactions and adds
// everything up here, so every number is the app's own.

export interface AskSearch {
  metric: 'total' | 'count' | 'average' | 'per_month' | 'per_week' | 'per_day' | 'by_month' | 'by_day' | 'biggest_payment' | 'biggest_day' | 'compare' | 'on_track' | 'suggest_budget' | 'budget_left' | 'net' | 'unsupported';
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
}

export interface Row { t: Transaction; date: string; amount: number; name: string }

export interface AskAnswer {
  metric: AskSearch['metric'];
  // For per_month / per_week / per_day: shown after the big figure ("a month")
  per?: string;
  // For by_month / by_day: each month's or day's total, oldest first
  breakdown?: { label: string; value: number }[];
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

  const match = (t: Transaction, start: string, end: string) => {
    if (hidden(t) || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) return false;
    const d = t.date.slice(0, 10);
    if (d < start || d > end) return false;
    if (s.direction === 'out' && t.type !== 'EXPENSE') return false;
    if (s.direction === 'in' && t.type !== 'INCOME') return false;
    if (places.length) {
      const desc = lc(t.description), k = merchantKey(t.description || '');
      if (!places.some(p => (p.key && p.key === k) || (p.raw && desc.includes(p.raw)))) return false;
    }
    if (cats.length && !cats.includes(lc(t.categoryName))) return false;
    if (subs.length && !subs.includes(lc(t.subcategoryName))) return false;
    return true;
  };
  const pick = (start: string, end: string): Row[] => transactions
    .filter(t => match(t, start, end))
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
      return { ...base, breakdown, big: fmt(total), unit: `over ${breakdown.length} ${word}${breakdown.length === 1 ? '' : 's'} · ${pay(n)}`,
        text: breakdown.map(b => `${b.label} ${fmt(b.value)}`).join(' · '),
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
export interface AskVocab { places: string[]; payers: string[]; categories: { name: string; subs: string[] }[] }
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
    categories: categories.filter(c => c.id !== 'excluded').map(c => ({ name: c.name, subs: c.subcategories })),
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
