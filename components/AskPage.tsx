import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category } from '../types';
import { supabase } from '../supabaseClient';
import { MONTHS, merchantKey, sum, localToday } from '../lib/periods';

// Desktop page: ask a question about your money in your own words.
// The AI (api/ask.ts) only turns the question into a search; this page runs that search on
// your own transactions and adds everything up itself, so every number is the app's own.

export interface AskSearch {
  metric: 'total' | 'count' | 'average' | 'biggest_payment' | 'biggest_day' | 'compare' | 'unsupported';
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
}

interface Row { t: Transaction; date: string; amount: number; name: string }

export interface AskAnswer {
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
const hidden = (t: Transaction) => !!t.excluded || t.categoryId === 'excluded' || (t.categoryName || '').trim().toLowerCase() === 'excluded';
const dateLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const shortDate = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };

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
  const base = { scope: s.title, understood: s.understood, green, open };

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

interface AskPageProps {
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  onOpenTransactions?: (o: { search: string; start: string; end: string; categoryId: string | null }) => void;
}

const AskPage: React.FC<AskPageProps> = ({ transactions, categories, currency, onOpenTransactions }) => {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<(AskAnswer & { question: string }) | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('askRecent') || '[]'); } catch { return []; } });
  const inputRef = useRef<HTMLInputElement>(null);
  const fmt2 = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // The names the AI may search by (no amounts or dates leave the app)
  const vocab = useMemo(() => {
    // Places by how often you go; payers by how much they've paid you.
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
  }, [transactions, categories]);

  const examples = useMemo(() => {
    const now = new Date();
    const lastMonth = MONTHS[(now.getMonth() + 11) % 12];
    const topCat = categories.find(c => c.type === 'EXPENSE' && !/housing|excluded/i.test(c.name))?.name || 'food';
    const out = [
      vocab.places[0] && `How much did I spend at ${vocab.places[0]} in ${lastMonth}?`,
      vocab.payers[0] && `What did ${vocab.payers[0].replace(/^from\s+/i, '')} pay me this year?`,
      `Am I spending more on ${topCat.toLowerCase()} than last year?`,
      'What was my most expensive day this year?',
      vocab.places[1] && `How many times did I go to ${vocab.places[1]} this year?`,
    ];
    return out.filter(Boolean) as string[];
  }, [vocab, categories]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text);
    setBusy(true);
    setError(null);
    setShowAll(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: text, today: localToday(), ...vocab }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error === 'not_configured'
          ? "Ask isn't switched on yet: it needs an Anthropic API key added in Vercel (ANTHROPIC_API_KEY)."
          : body.error || 'Something went wrong. Try again.');
        return;
      }
      const s: AskSearch = body.search;
      if (s.metric === 'unsupported') { setError(s.reason || "That isn't something your transactions can answer."); setAnswer(null); return; }
      setAnswer({ ...runSearch(s, transactions, categories, currency), question: text });
      const next = [text, ...recent.filter(x => x !== text)].slice(0, 8);
      setRecent(next);
      try { localStorage.setItem('askRecent', JSON.stringify(next)); } catch { /* not saved */ }
    } catch {
      setError(navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Ask needs a connection.");
    } finally {
      setBusy(false);
    }
  };

  const max = Math.max(...(answer?.bars.map(b => b.value) || [0]), 1);
  const anyHi = answer?.bars.some(b => b.hi);
  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';

  return (
    <div className="max-w-[980px] flex flex-col gap-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100">Ask</h1>
        <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">Ask anything about your money, in your own words</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex items-center gap-3 h-14 pl-4 pr-2 rounded-2xl bg-white dark:bg-neutral-800 border-[1.5px] border-indigo-300 dark:border-indigo-800 shadow-[0_4px_18px_rgba(79,70,229,0.08)] focus-within:border-indigo-500">
        <span className="text-lg" aria-hidden>✨</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. How much did I spend on Uber in August?"
          aria-label="Your question"
          maxLength={300}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400"
        />
        <button type="submit" disabled={!q.trim() || busy} className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold disabled:opacity-40">
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {examples.map(x => (
          <button key={x} onClick={() => void ask(x)} disabled={busy} className={`h-[34px] px-3.5 rounded-full border text-[12.5px] transition-colors ${answer?.question === x ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-semibold dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300 hover:border-slate-300'}`}>{x}</button>
        ))}
      </div>

      {error && <div role="alert" className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[13px] text-amber-900 dark:text-amber-200">{error}</div>}

      <AnimatePresence mode="wait">
        {busy && !answer && (
          <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} px-6 py-6`}>
            <div className="h-3 w-40 rounded bg-slate-100 dark:bg-neutral-700 animate-pulse" />
            <div className="h-9 w-56 rounded bg-slate-100 dark:bg-neutral-700 animate-pulse mt-3" />
            <div className="h-3 w-full rounded bg-slate-100 dark:bg-neutral-700 animate-pulse mt-4" />
          </motion.div>
        )}
        {answer && (
          <motion.section key={answer.question} initial={{ opacity: 0, y: 8 }} animate={{ opacity: busy ? 0.5 : 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={`${card} px-6 py-5`}>
            <div className="text-xs text-slate-500 dark:text-neutral-400">{answer.scope}</div>
            <div className="flex items-baseline gap-3.5 mt-1 flex-wrap">
              <span className={`text-[40px] leading-tight font-bold tracking-tight ${answer.green ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{answer.big}</span>
              <span className="text-sm text-slate-600 dark:text-neutral-300">{answer.unit}</span>
            </div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-slate-700 dark:text-neutral-300">{answer.text}</p>

            {answer.bars.length > 1 && (
              <div className="mt-5 flex items-end gap-1.5 h-[92px]">
                {answer.bars.map((b, i) => (
                  <span key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1">
                    <span className="block w-full max-w-[40px] rounded-[5px]" title={fmt2(b.value)} style={{ height: b.value ? Math.max(4, Math.round((b.value / max) * 70)) : 3, background: !b.value ? 'rgb(241 245 249)' : (!anyHi || b.hi) ? (answer.green ? '#22C55E' : '#4F46E5') : (answer.green ? '#BBF7D0' : '#C7D2FE') }} />
                    <span className="text-[10.5px] text-slate-500 dark:text-neutral-400 truncate">{answer.bars.length > 20 && i % 2 ? '' : b.label}</span>
                  </span>
                ))}
              </div>
            )}

            {answer.rows.length > 0 && (
              <>
                <div className="mt-5 flex justify-between items-baseline">
                  <span className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">{answer.listTitle}</span>
                  {onOpenTransactions && <button onClick={() => onOpenTransactions(answer.open)} className="text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-300">Open in Transactions →</button>}
                </div>
                {(showAll ? answer.rows : answer.rows.slice(0, 8)).map(r => (
                  <div key={r.t.id} className="grid grid-cols-[96px_minmax(0,1fr)_minmax(0,0.8fr)_110px] gap-3 items-center h-11 border-t border-slate-100 dark:border-neutral-700 text-[13px]">
                    <span className="text-slate-500 dark:text-neutral-400">{shortDate(r.date)} {r.date.slice(0, 4) !== localToday().slice(0, 4) ? r.date.slice(0, 4) : ''}</span>
                    <span className="truncate text-slate-900 dark:text-neutral-100">{r.name}</span>
                    <span className="truncate text-slate-500 dark:text-neutral-400">{r.t.categoryName}{r.t.subcategoryName ? ` › ${r.t.subcategoryName}` : ''}</span>
                    <span className={`text-right font-semibold ${r.t.type === 'INCOME' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{r.t.type === 'INCOME' ? '+' : '−'}{fmt2(r.amount)}</span>
                  </div>
                ))}
                {answer.rows.length > 8 && (
                  <button onClick={() => setShowAll(v => !v)} className="mt-1.5 w-full h-10 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">
                    {showAll ? 'Show fewer' : `Show all ${answer.rows.length}`}
                  </button>
                )}
              </>
            )}
            <div className="mt-3 text-[11.5px] text-slate-400 dark:text-neutral-500">Understood as: {answer.understood}</div>
          </motion.section>
        )}
      </AnimatePresence>

      {recent.length > 0 && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1.5">Recent questions</div>
          <div className="flex flex-col">
            {recent.map(x => (
              <button key={x} onClick={() => void ask(x)} disabled={busy} className="text-left h-9 text-[13px] text-slate-600 dark:text-neutral-300 hover:text-indigo-700 dark:hover:text-indigo-300 truncate">↻ {x}</button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-slate-400 dark:text-neutral-500 leading-relaxed">
        Private: only your question and the names of your categories, places and payers are sent to the AI, never amounts or dates. The totals are worked out here in the app.
      </p>
    </div>
  );
};

export default AskPage;
