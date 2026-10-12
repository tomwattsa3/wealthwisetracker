import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, X, Pencil, RotateCcw, Link2, ChevronLeft, Search, MoreHorizontal } from 'lucide-react';
import type { Transaction } from '../types';
import AnimatedModal from './AnimatedModal';
import type { DebtActions } from '../lib/debts';

// Debts: what you owe, what you've paid back, and clearing it once it's done. Repayments added
// here are only for tracking; they aren't transactions, so they never touch your spending totals.
// Saved in the debts and debt_payments tables (see lib/debts.ts).

// counted: a linked bank payment's own choice (undefined = follow the debt's countAsSpending)
export interface DebtPayment { id: string; date: string; amount: number; note?: string; transactionId?: string; counted?: boolean }
export interface Debt {
  id: string;
  name: string;
  emoji: string;
  borrowed: number;
  date?: string; // when you borrowed it, YYYY-MM-DD (optional)
  note?: string;
  payments: DebtPayment[];
  clearedAt?: string;
  countAsSpending?: boolean; // linked bank payments count as spending by default
  interestRate?: number; // yearly rate in % (set only when the debt has interest)
  monthlyPayment?: number; // what you pay a month (used for the schedule)
}

const EMOJIS = ['💳', '👨', '👩', '🏦', '🚗', '🏠', '✈️', '🎓', '📱', '🤝'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const newId = () => crypto.randomUUID();
const gbp = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;
const gbp2 = (v: number) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const paidOf = (d: Debt) => d.payments.reduce((a, p) => a + p.amount, 0);

const monthIdx = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;

// Interest, month by month on what's still owed (yearly rate ÷ 12). Your actual repayments pay
// that month's interest first and the rest comes off the loan. Without a rate it's simply
// borrowed − paid.
export const balanceOf = (d: Debt) => {
  const paid = paidOf(d);
  if (!d.interestRate) return { left: Math.max(0, d.borrowed - paid), paid, interest: 0, offLoan: Math.min(paid, d.borrowed) };
  const r = d.interestRate / 100 / 12;
  const start = d.date ? monthIdx(d.date) : Math.min(monthIdx(today()), ...d.payments.map(p => monthIdx(p.date)));
  const end = monthIdx(today());
  const by = new Map<number, number>();
  d.payments.forEach(p => by.set(monthIdx(p.date), (by.get(monthIdx(p.date)) || 0) + p.amount));
  let bal = d.borrowed, interest = 0;
  for (let m = start; m <= end; m++) {
    const due = m > start ? bal * r : 0; // first interest a month after borrowing
    bal += due;
    const pay = by.get(m) || 0;
    interest += Math.min(pay, due);
    bal = Math.max(0, bal - pay);
  }
  return { left: bal, paid, interest, offLoan: Math.max(0, paid - interest) };
};
const leftOf = (d: Debt) => balanceOf(d).left;
// How much of the loan itself is paid off (0–100)
const progressOf = (d: Debt) => (d.borrowed > 0 ? Math.min(100, Math.max(0, (1 - leftOf(d) / d.borrowed) * 100)) : 0);

// The plan: each month's payment split into interest and money off the loan, until it's paid.
export const scheduleOf = (principal: number, ratePct: number, monthly: number) => {
  const r = ratePct / 100 / 12;
  const rows: { n: number; payment: number; interest: number; offLoan: number; balance: number }[] = [];
  if (!(monthly > 0) || monthly <= principal * r) return { rows, never: true };
  let bal = principal;
  for (let n = 1; bal > 0.005 && n <= 600; n++) {
    const interest = bal * r;
    const payment = Math.min(monthly, bal + interest);
    const off = payment - interest;
    bal = Math.max(0, bal - off);
    rows.push({ n, payment, interest, offLoan: off, balance: bal });
  }
  return { rows, never: false };
};

// On track: paid in the last ~6 weeks. Paid this month wins over that.
const statusOf = (d: Debt): { label: string; cls: string } => {
  if (d.clearedAt) return { label: 'Cleared', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' };
  if (d.payments.length === 0) return { label: 'Not started', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' };
  const last = d.payments.reduce((a, p) => (p.date > a ? p.date : a), '');
  const t = today();
  if (last.slice(0, 7) === t.slice(0, 7)) return { label: 'Paid this month', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' };
  const days = (Date.parse(t) - Date.parse(last)) / 86400000;
  if (days <= 45) return { label: 'On track', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' };
  return { label: `Last paid ${MONTHS[Number(last.slice(5, 7)) - 1]}`, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' };
};

// Debt, Borrowed, Paid, Left, Progress, Status (phones: Debt, Left, Status)
const grid = 'grid grid-cols-[minmax(0,1fr)_68px_108px] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_128px] gap-2 md:gap-3 items-center';

const inputCls = 'w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-slate-900 dark:text-neutral-100 outline-none focus:border-indigo-400';
const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-neutral-300 mb-1.5';

const DebtForm: React.FC<{ initial?: Debt; onSave: (d: Debt) => void; onCancel: () => void }> = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [emoji, setEmoji] = useState(initial?.emoji || EMOJIS[0]);
  const [amount, setAmount] = useState(initial ? String(initial.borrowed) : '');
  // '' = no date. New debts start on today; an existing one keeps whatever it had (or none).
  const [date, setDate] = useState(initial ? initial.date || '' : today());
  const [note, setNote] = useState(initial?.note || '');
  // Interest: the monthly payment, plus either the yearly rate or how much of the first payment
  // was interest (the rate is worked out from that: interest ÷ amount × 12).
  const [hasInterest, setHasInterest] = useState(!!initial?.interestRate);
  const [monthly, setMonthly] = useState(initial?.monthlyPayment ? String(initial.monthlyPayment) : '');
  const [know, setKnow] = useState<'rate' | 'first'>('rate');
  const [rateIn, setRateIn] = useState(initial?.interestRate ? String(initial.interestRate) : '');
  const [firstInt, setFirstInt] = useState('');
  const num = (v: string) => Number(v.replace(/[£,%\s]/g, ''));
  const value = num(amount);
  const monthlyV = num(monthly);
  const rate = know === 'rate' ? num(rateIn) : value > 0 ? (num(firstInt) / value) * 12 * 100 : 0;
  const plan = hasInterest && value > 0 && rate > 0 && monthlyV > 0 ? scheduleOf(value, rate, monthlyV) : null;
  const interestOk = !hasInterest || (rate > 0 && rate < 100 && monthlyV > 0 && plan && !plan.never);
  const ok = name.trim() && value > 0 && (date === '' || /^\d{4}-\d{2}-\d{2}$/.test(date)) && interestOk;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ id: initial?.id || newId(), name: name.trim(), emoji, borrowed: value, date: date || undefined, note: note.trim() || undefined, payments: initial?.payments || [], clearedAt: initial?.clearedAt, countAsSpending: initial?.countAsSpending, interestRate: hasInterest ? Math.round(rate * 1000) / 1000 : undefined, monthlyPayment: hasInterest ? monthlyV : undefined }); }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{initial ? 'Edit debt' : 'Add a debt'}</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-700"><X size={18} /></button>
      </div>
      <label className={labelCls}>Who or what</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Loan from Dad" maxLength={40} className={inputCls} />
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {EMOJIS.map(e => (
          <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Icon ${e}`} className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center ${emoji === e ? 'bg-indigo-100 ring-2 ring-indigo-400 dark:bg-indigo-900/60' : 'bg-slate-50 dark:bg-neutral-700/60'}`}>{e}</button>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <div className="flex-1">
          <label className={labelCls}>Amount (£)</label>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" className={inputCls} />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <label className={labelCls}>Borrowed on</label>
            <button type="button" onClick={() => setDate(date ? '' : today())} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 mb-1.5">{date ? 'No date' : 'Set a date'}</button>
          </div>
          {date
            ? <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            : <button type="button" onClick={() => setDate(today())} className="w-full h-11 px-3 rounded-xl border border-dashed border-slate-300 dark:border-neutral-600 text-sm text-slate-400 dark:text-neutral-500 text-left">No date</button>}
        </div>
      </div>
      <label className={`${labelCls} mt-4`}>Note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it was for" maxLength={80} className={inputCls} />

      <label className="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={hasInterest} onChange={(e) => setHasInterest(e.target.checked)} className="w-[18px] h-[18px] accent-indigo-600" />
        <span className="text-sm font-semibold text-slate-800 dark:text-neutral-200">Has interest</span>
      </label>
      {hasInterest && (
        <div className="mt-3 rounded-xl bg-slate-50 dark:bg-neutral-700/40 p-3.5">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className={labelCls}>Monthly payment (£)</label>
              <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="500" className={inputCls} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <label className={labelCls}>{know === 'rate' ? 'Interest rate (% a year)' : 'Interest in 1st payment (£)'}</label>
              </div>
              {know === 'rate'
                ? <input inputMode="decimal" value={rateIn} onChange={(e) => setRateIn(e.target.value)} placeholder="6.9" className={inputCls} />
                : <input inputMode="decimal" value={firstInt} onChange={(e) => setFirstInt(e.target.value)} placeholder="29" className={inputCls} />}
            </div>
          </div>
          <button type="button" onClick={() => setKnow(know === 'rate' ? 'first' : 'rate')} className="mt-2 text-[11.5px] font-semibold text-indigo-600 dark:text-indigo-300">
            {know === 'rate' ? "Don't know the rate? Enter how much of the first payment was interest" : 'I know the interest rate instead'}
          </button>
          {plan && (plan.never
            ? <p className="mt-2 text-[12px] text-rose-700 dark:text-rose-400">That payment doesn't cover the interest, so it would never be paid off.</p>
            : <p className="mt-2 text-[12px] text-slate-600 dark:text-neutral-300">
                {know === 'first' && <><b>{rate.toFixed(2)}%</b> a year · </>}
                Paid off in <b>{plan.rows.length} month{plan.rows.length === 1 ? '' : 's'}</b> · <b>{gbp2(Math.round(plan.rows.reduce((a, r) => a + r.interest, 0) * 100) / 100)}</b> interest in total
              </p>)}
        </div>
      )}
      <div className="flex gap-2.5 mt-5">
        <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-600 text-sm font-semibold text-slate-600 dark:text-neutral-300">Cancel</button>
        <button type="submit" disabled={!ok} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">{initial ? 'Save' : 'Add debt'}</button>
      </div>
    </form>
  );
};


// Link bank payments to a debt: tick the transactions that were repayments. Each becomes a
// repayment on the debt (same date and amount) and is left out of your spending totals.
// Suggestions first: names that match the debt or earlier linked payments, or the same amount
// as an earlier repayment.
const STOP = new Set(['loan', 'from', 'the', 'and', 'for', 'to', 'my', 'payment', 'card']);
const txAmount = (t: Transaction) => Math.abs(t.amountGBP || t.amount || 0);
const suggestRepayments = (debt: Debt, pool: Transaction[], byId: Map<string, Transaction>) => {
  const words = debt.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
  const prevDesc = new Set(debt.payments.map(p => p.transactionId && byId.get(p.transactionId)?.description?.trim().toLowerCase()).filter(Boolean) as string[]);
  const prevAmt = new Set(debt.payments.map(p => p.amount.toFixed(2)));
  return [...pool].sort((a, b) => b.date.localeCompare(a.date)).filter(t => {
    const d = (t.description || '').toLowerCase();
    return words.some(w => d.includes(w)) || prevDesc.has(d.trim()) || prevAmt.has(txAmount(t).toFixed(2));
  });
};
const LinkPicker: React.FC<{ debt: Debt; transactions: Transaction[]; linked: Set<string>; onLink: (ps: DebtPayment[]) => void; onBack: () => void }> = ({ debt, transactions, linked, onLink, onBack }) => {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [older, setOlder] = useState(false);
  const [more, setMore] = useState(false);
  const byId = useMemo(() => new Map(transactions.map(t => [String(t.id), t])), [transactions]);
  const since = older || !debt.date ? '' : debt.date;
  const pool = useMemo(() => transactions
    .filter(t => t.type === 'EXPENSE' && !linked.has(String(t.id)) && txAmount(t) > 0 && (!since || t.date.slice(0, 10) >= since))
    .sort((a, b) => b.date.localeCompare(a.date)), [transactions, linked, since]);
  const suggested = useMemo(() => suggestRepayments(debt, pool, byId).slice(0, 6), [pool, debt, byId]);
  const query = q.trim().toLowerCase();
  const list = useMemo(() => (query
    ? pool.filter(t => `${t.description} ${t.categoryName} ${t.subcategoryName} ${txAmount(t).toFixed(2)}`.toLowerCase().includes(query))
    : pool.filter(t => !suggested.includes(t))), [pool, query, suggested]);
  const shown = list.slice(0, more ? 200 : 40);
  const pickedTotal = Array.from(picked).reduce((a, id) => a + (byId.get(id) ? txAmount(byId.get(id)!) : 0), 0);
  const leftNow = leftOf(debt);
  const toggle = (id: string) => setPicked(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (t: Transaction) => {
    const id = String(t.id); const on = picked.has(id);
    return (
      <button key={id} onClick={() => toggle(id)} className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors ${on ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/30'}`}>
        <span className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center ${on ? 'bg-indigo-600 text-white' : 'border-[1.5px] border-slate-300 dark:border-neutral-500'}`}>{on && <Check size={13} strokeWidth={3} />}</span>
        <span className="w-[52px] shrink-0 text-xs text-slate-500 dark:text-neutral-400">{Number(t.date.slice(8, 10))} {MONTHS[Number(t.date.slice(5, 7)) - 1]}{t.date.slice(0, 4) !== today().slice(0, 4) ? ` ${t.date.slice(2, 4)}` : ''}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-900 dark:text-neutral-100 truncate">{t.description || 'Payment'}</span>
          <span className="block text-[11px] text-slate-400 dark:text-neutral-500 truncate">{t.categoryName || 'Not categorised'}{t.subcategoryName ? ` · ${t.subcategoryName}` : ''}{t.bankName ? ` · ${t.bankName}` : ''}</span>
        </span>
        <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100 shrink-0">{gbp2(txAmount(t))}</span>
      </button>
    );
  };
  return (
    <div className="flex flex-col max-h-[min(80vh,640px)]">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back" className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-700"><ChevronLeft size={18} /></button>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100 truncate">Link bank payments</h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400 truncate">to {debt.emoji} {debt.name} · {gbp2(leftNow)} left</p>
        </div>
      </div>
      <div className="relative mt-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments" aria-label="Search payments" className={`${inputCls} pl-9`} />
      </div>
      <div className="mt-2 flex-1 min-h-[200px] overflow-y-auto">
        {!query && suggested.length > 0 && (
          <>
            <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Might be repayments</div>
            {suggested.map(row)}
            <div className="px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">All payments{since ? ` since ${shortDate(since)}` : ''}</div>
          </>
        )}
        {shown.length === 0 && <p className="px-2.5 py-6 text-sm text-slate-500 dark:text-neutral-400">{query ? 'No payments match that.' : 'No payments to link.'}</p>}
        {shown.map(row)}
        <div className="flex gap-3 px-2.5 py-2">
          {list.length > shown.length && <button onClick={() => setMore(true)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Show more</button>}
          {debt.date && !older && <button onClick={() => setOlder(true)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Show payments before {shortDate(debt.date)}</button>}
        </div>
      </div>
      <div className="pt-3 mt-1 border-t border-slate-100 dark:border-neutral-700 flex items-center gap-3">
        <span className="flex-1 min-w-0 text-[13px] text-slate-600 dark:text-neutral-300">
          {picked.size ? <><b className="text-slate-900 dark:text-neutral-100">{picked.size} selected · {gbp2(pickedTotal)}</b> → {gbp2(Math.max(0, leftNow - pickedTotal))} left</> : 'Tick the payments that paid this back'}
        </span>
        <button
          disabled={!picked.size}
          onClick={() => onLink(Array.from(picked).map(id => { const t = byId.get(id)!; return { id: newId(), date: t.date.slice(0, 10), amount: txAmount(t), transactionId: id }; }))}
          className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 shrink-0"
        >Link{picked.size ? ` ${picked.size}` : ''}</button>
      </div>
    </div>
  );
};

// How a linked bank payment is treated: its own choice, else the debt's default.
const isCounted = (d: Debt, p: DebtPayment) => !!p.transactionId && (p.counted ?? !!d.countAsSpending);

// Repaid per month, from the month you borrowed (or the first repayment) to this month, at most
// the last 12 months.
const monthlyRepaid = (d: Debt) => {
  const t = today();
  const first = [d.date, ...d.payments.map(p => p.date)].filter(Boolean).sort()[0] as string | undefined;
  const idx = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
  const end = idx(t);
  const start = Math.max(first ? idx(first) : end - 5, end - 11);
  const months = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const by = new Map<number, number>();
  d.payments.forEach(p => by.set(idx(p.date), (by.get(idx(p.date)) || 0) + p.amount));
  const before = d.payments.filter(p => idx(p.date) < start).reduce((a, p) => a + p.amount, 0);
  let run = before;
  return months.map(m => { const v = by.get(m) || 0; run += v; return { m, label: MONTHS[m % 12], v, cum: run }; });
};

const RepaidChart: React.FC<{ debt: Debt }> = ({ debt }) => {
  const rows = monthlyRepaid(debt);
  const max = Math.max(...rows.map(r => r.v), 1);
  const H = 120;
  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height: H + 18 }}>
        {rows.map(r => (
          <div key={r.m} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center">
            {r.v > 0 && <span className="text-[10px] font-semibold text-slate-600 dark:text-neutral-300 mb-1 whitespace-nowrap">{gbp(r.v)}</span>}
            <span className={`w-full max-w-[34px] rounded-md ${r.v > 0 ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-neutral-700'}`} style={{ height: r.v > 0 ? Math.max(4, (r.v / max) * (H - 24)) : 3 }} />
          </div>
        ))}
        {/* Running total so far, as a dashed line against the amount borrowed */}
        <svg className="absolute inset-x-0 top-0 pointer-events-none" width="100%" height={H} viewBox={`0 0 ${rows.length * 10} ${H}`} preserveAspectRatio="none" aria-hidden>
          <polyline fill="none" stroke="#6366F1" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"
            points={rows.map((r, i) => `${i * 10 + 5},${H - 4 - Math.min(1, r.cum / Math.max(debt.borrowed, 1)) * (H - 12)}`).join(' ')} />
        </svg>
      </div>
      <div className="flex gap-1.5 mt-1">
        {rows.map(r => <span key={r.m} className="flex-1 text-center text-[10px] text-slate-400 dark:text-neutral-500">{r.label}</span>)}
      </div>
    </div>
  );
};


// Interest on a debt: what's gone on interest vs off the loan so far, and the plan from the
// original loan (rate + monthly payment), month by month.
const InterestPanel: React.FC<{ debt: Debt }> = ({ debt }) => {
  const [open, setOpen] = useState(false);
  const bal = balanceOf(debt);
  const rate = debt.interestRate!;
  const monthly = debt.monthlyPayment || 0;
  const plan = scheduleOf(debt.borrowed, rate, monthly);
  const totalInt = plan.rows.reduce((a, r) => a + r.interest, 0);
  // From where you are now, at the monthly payment
  const ahead = bal.left > 0 ? scheduleOf(bal.left, rate, monthly) : { rows: [], never: false };
  const start = debt.date ? monthIdx(debt.date) : monthIdx(today());
  const nowIdx = monthIdx(today());
  const label = (m: number) => `${MONTHS[m % 12]} ${String(Math.floor(m / 12)).slice(2)}`;
  const doneBy = !ahead.never && ahead.rows.length ? `${MONTHS[(nowIdx + ahead.rows.length) % 12]} ${Math.floor((nowIdx + ahead.rows.length) / 12)}` : null;
  const box = (l: string, v: string, sub?: string) => (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500 dark:text-neutral-400">{l}</div>
      <div className="text-[15px] font-bold text-slate-900 dark:text-neutral-100">{v}</div>
      {sub && <div className="text-[10.5px] text-slate-400 dark:text-neutral-500 truncate">{sub}</div>}
    </div>
  );
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-neutral-700 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Interest · {rate.toLocaleString('en-GB', { maximumFractionDigits: 3 })}% a year</span>
        {monthly > 0 && <span className="text-xs text-slate-500 dark:text-neutral-400">{gbp2(monthly)} a month</span>}
      </div>
      {/* Paid so far, split */}
      <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden flex">
        <span className="h-full bg-emerald-500" style={{ width: `${bal.paid > 0 ? (bal.offLoan / Math.max(bal.paid, 1)) * 100 : 0}%` }} />
        <span className="h-full bg-amber-400" style={{ width: `${bal.paid > 0 ? (bal.interest / Math.max(bal.paid, 1)) * 100 : 0}%` }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        {box('Off the loan so far', gbp2(Math.round(bal.offLoan * 100) / 100), `of ${gbp2(bal.paid)} paid`)}
        {box('Interest paid so far', gbp2(Math.round(bal.interest * 100) / 100))}
        {box('Interest over the whole loan', plan.never ? '–' : gbp2(Math.round(totalInt * 100) / 100), plan.never ? 'payment too low' : `${plan.rows.length} payments of ${gbp2(monthly)}`)}
        {box('Paid off by', ahead.never ? 'Never at this rate' : doneBy || 'Done', ahead.never ? 'the payment doesn’t cover the interest' : doneBy ? `${ahead.rows.length} more payment${ahead.rows.length === 1 ? '' : 's'}` : undefined)}
      </div>
      {!plan.never && plan.rows.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-3 text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-300">{open ? 'Hide the schedule' : `Show the schedule (${plan.rows.length} months)`}</button>
          {open && (
            <div className="mt-2 max-h-[280px] overflow-auto rounded-xl border border-slate-100 dark:border-neutral-700">
              <table className="w-full text-[11px] sm:text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="sticky top-0 bg-slate-50 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
                  <tr>
                    <th className="hidden sm:table-cell text-left font-semibold px-3 py-2">#</th>
                    <th className="text-left font-semibold pl-3 sm:pl-2 pr-1.5 sm:pr-2 py-2">Month</th>
                    <th className="hidden sm:table-cell text-right font-semibold px-1.5 sm:px-2 py-2">Payment</th>
                    <th className="text-right font-semibold px-1.5 sm:px-2 py-2">Interest</th>
                    <th className="text-right font-semibold px-1.5 sm:px-2 py-2">Off loan</th>
                    <th className="text-right font-semibold px-3 py-2">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map(r => {
                    const m = start + r.n;
                    const past = m < nowIdx, current = m === nowIdx;
                    return (
                      <tr key={r.n} className={`border-t border-slate-100 dark:border-neutral-700/70 ${current ? 'bg-indigo-50/70 dark:bg-indigo-950/30 font-semibold' : past ? 'text-slate-400 dark:text-neutral-500' : 'text-slate-700 dark:text-neutral-200'}`}>
                        <td className="hidden sm:table-cell px-3 py-1.5">{r.n}</td>
                        <td className="pl-3 sm:pl-2 pr-1.5 sm:pr-2 py-1.5 whitespace-nowrap">{label(m)}{current ? <span className="hidden sm:inline"> · now</span> : ''}</td>
                        <td className="hidden sm:table-cell px-1.5 sm:px-2 py-1.5 text-right">{gbp2(Math.round(r.payment * 100) / 100)}</td>
                        <td className="px-1.5 sm:px-2 py-1.5 text-right text-amber-700 dark:text-amber-400">{gbp2(Math.round(r.interest * 100) / 100)}</td>
                        <td className="px-1.5 sm:px-2 py-1.5 text-right text-emerald-700 dark:text-emerald-400">{gbp2(Math.round(r.offLoan * 100) / 100)}</td>
                        <td className="px-3 py-1.5 text-right">{gbp2(Math.round(r.balance * 100) / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-neutral-500">The schedule is the plan from the start of the loan. "Left to pay" uses your actual repayments: each month's interest is paid first and the rest comes off the loan. Estimates only; your lender's figures may differ slightly.</p>
        </>
      )}
    </div>
  );
};

const DebtDetail: React.FC<{ debt: Debt; actions: DebtActions; transactions: Transaction[]; linked: Set<string>; onDelete: () => void; onEdit: () => void; onClose: () => void }> = ({ debt, actions, transactions, linked, onDelete, onEdit, onClose }) => {
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState<'all' | 'linked' | 'added'>('all');
  const [menu, setMenu] = useState<string | null>(null);
  const txById = useMemo(() => new Map(transactions.map(t => [String(t.id), t])), [transactions]);
  const bal = balanceOf(debt);
  const paid = bal.paid;
  const left = bal.left;
  const pct = progressOf(debt);
  const value = Number(amt.replace(/[£,\s]/g, ''));
  const payments = [...debt.payments].sort((a, b) => b.date.localeCompare(a.date));
  const linkedN = payments.filter(p => p.transactionId).length;
  const shown = payments.filter(p => filter === 'all' || (filter === 'linked') === !!p.transactionId);
  const st = statusOf(debt);
  // Usually pay: what went in over the last 3 months, a month. Cleared by: left ÷ that.
  const t = today();
  const threeAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); })();
  const usual = payments.filter(p => p.date > threeAgo && p.date <= t).reduce((a, p) => a + p.amount, 0) / 3;
  const payRate = debt.interestRate && debt.monthlyPayment ? debt.monthlyPayment : usual;
  const monthsLeft = !debt.clearedAt && left > 0 && payRate > 0
    ? (debt.interestRate ? (s => (s.never ? 0 : s.rows.length))(scheduleOf(left, debt.interestRate, payRate)) : Math.ceil(left / payRate))
    : 0;
  const clearedBy = monthsLeft ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsLeft); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; })() : null;
  const last = payments[0];
  const daysAgo = last ? Math.round((Date.parse(t) - Date.parse(last.date)) / 86400000) : 0;
  const pool = useMemo(() => transactions.filter(x => x.type === 'EXPENSE' && !linked.has(String(x.id)) && txAmount(x) > 0 && (!debt.date || x.date.slice(0, 10) >= debt.date)), [transactions, linked, debt.date]);
  const suggestions = useMemo(() => suggestRepayments(debt, pool, txById).slice(0, 3), [debt, pool, txById]);
  const addPayment = () => {
    if (!(value > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    actions.addPayment(debt.id, { id: newId(), date, amount: value });
    setAmt(''); setAdding(false);
  };
  const linkOne = (x: Transaction) => actions.addPayments(debt.id, [{ id: newId(), date: x.date.slice(0, 10), amount: txAmount(x), transactionId: String(x.id) }]);

  if (linking) return <div className="max-w-xl mx-auto"><LinkPicker debt={debt} transactions={transactions} linked={linked} onBack={() => setLinking(false)} onLink={(ps) => { actions.addPayments(debt.id, ps); setLinking(false); }} /></div>;

  const stat = (label: string, v: string, sub: string, tone?: 'green') => (
    <div className={`rounded-xl px-3.5 py-2.5 ${tone ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-slate-50 dark:bg-neutral-700/40'}`}>
      <div className="text-[11px] text-slate-500 dark:text-neutral-400">{label}</div>
      <div className={`text-lg md:text-xl font-bold ${tone ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{v}</div>
      <div className="text-[10.5px] text-slate-400 dark:text-neutral-500 truncate">{sub}</div>
    </div>
  );
  const pill = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${on ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800'}`;

  return (
    <div className="max-h-[calc(100dvh-48px)] overflow-y-auto -m-6 p-6 md:p-8" onClick={() => setMenu(null)}>
      {/* Header */}
      <div className="flex items-start gap-3 md:gap-4">
        <span className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-2xl md:text-[26px] shrink-0">{debt.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-neutral-100 truncate">{debt.name}</h2>
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{gbp2(debt.borrowed)} borrowed{debt.date ? ` ${shortDate(debt.date)}` : ''}{debt.interestRate ? ` · ${debt.interestRate}% interest` : ''}{debt.note ? ` · ${debt.note}` : ''}</p>
        </div>
        <button onClick={onEdit} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-slate-600 dark:text-neutral-300 flex items-center gap-1.5"><Pencil size={13} /> <span className="hidden sm:inline">Edit</span></button>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-700"><X size={18} /></button>
      </div>

      {/* The numbers */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-2.5 mt-5">
        {stat('Left to pay', gbp2(Math.round(left * 100) / 100), debt.interestRate ? `of ${gbp2(debt.borrowed)} · with interest` : `of ${gbp2(debt.borrowed)}`)}
        {stat('Paid back', gbp2(paid), debt.interestRate ? `${gbp(bal.offLoan)} off the loan · ${gbp(bal.interest)} interest` : `${Math.round(pct)}% · ${payments.length} payment${payments.length === 1 ? '' : 's'}`, 'green')}
        {stat('Usually pay', usual > 0 ? gbp(usual) : '–', usual > 0 ? 'a month, lately' : 'nothing in 3 months')}
        {stat('Cleared by', debt.clearedAt ? shortDate(debt.clearedAt) : clearedBy || '–', debt.clearedAt ? 'marked as cleared' : clearedBy ? `at ${gbp(payRate)} a month` : 'add repayments to see')}
        <div className="col-span-2 md:col-span-1">{stat('Last payment', last ? `${Number(last.date.slice(8, 10))} ${MONTHS[Number(last.date.slice(5, 7)) - 1]}` : '–', last ? `${gbp2(last.amount)} · ${daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}` : 'none yet')}</div>
      </div>

      {/* Linked bank payments: counted or left out (only once some are linked) */}
      {linkedN > 0 && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 rounded-xl border border-slate-200 dark:border-neutral-700 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100">Linked bank payments for this debt</div>
            <div className="text-[11.5px] text-slate-500 dark:text-neutral-400">The default for this debt. Change one payment from its ⋯ menu.</div>
          </div>
          <div className="flex sm:inline-flex w-full sm:w-auto p-[3px] rounded-[10px] bg-slate-100 dark:bg-neutral-700">
            <button onClick={() => actions.setCountAsSpending(debt.id, false)} className={`flex-1 sm:flex-none ${pill(!debt.countAsSpending)}`}>Leave out<span className="hidden sm:inline"> of spending</span></button>
            <button onClick={() => actions.setCountAsSpending(debt.id, true)} className={`flex-1 sm:flex-none ${pill(!!debt.countAsSpending)}`}>Count<span className="hidden sm:inline"> as spending</span><span className="sm:hidden"> it</span></button>
          </div>
        </div>
      )}

      {/* Progress, with quarter marks */}
      <div className="mt-4">
        <div className="relative h-3 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          {[25, 50, 75].map(q => <span key={q} className="absolute inset-y-0 w-0.5 bg-white dark:bg-neutral-800" style={{ left: `${q}%` }} />)}
        </div>
        <div className="flex justify-between text-[10.5px] text-slate-400 dark:text-neutral-500 mt-1"><span>£0</span><span>25%</span><span>50%</span><span>75%</span><span>{gbp(debt.borrowed)}</span></div>
      </div>

      {debt.interestRate ? <InterestPanel debt={debt} /> : null}

      <div className="mt-5 flex flex-col md:flex-row gap-6 md:gap-7">
        {/* Left: month by month, and payments that might be repayments */}
        <div className="md:flex-[1.1] min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Repaid each month</span>
            <span className="text-[11px] text-slate-500 dark:text-neutral-400"><span className="text-emerald-500">■</span> repaid · <span className="text-indigo-500">- -</span> total so far</span>
          </div>
          <div className="mt-3"><RepaidChart debt={debt} /></div>
          {!debt.clearedAt && suggestions.length > 0 && (
            <div className="mt-4 rounded-xl border-[1.5px] border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{suggestions.length} payment{suggestions.length === 1 ? '' : 's'} might be repayments</span>
                <button onClick={() => setLinking(true)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">See all →</button>
              </div>
              {suggestions.map(x => (
                <div key={String(x.id)} className="flex items-center gap-2.5 mt-2 text-[13px]">
                  <span className="w-12 shrink-0 text-slate-500 dark:text-neutral-400 text-xs">{Number(x.date.slice(8, 10))} {MONTHS[Number(x.date.slice(5, 7)) - 1]}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-800 dark:text-neutral-200">{x.description}</span>
                  <span className="font-semibold text-slate-900 dark:text-neutral-100">{gbp2(txAmount(x))}</span>
                  <button onClick={() => linkOne(x)} className="h-7 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Link</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: the repayments */}
        <div className="md:flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-neutral-700">
            <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Repayments · {payments.length}</span>
            {payments.length > 0 && (
              <div className="flex gap-1">
                {([['all', 'All'], ['linked', `Linked · ${linkedN}`], ['added', `Added · ${payments.length - linkedN}`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`h-6 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${filter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300'}`}>{l}</button>
                ))}
              </div>
            )}
          </div>
          {adding && (
            <form onSubmit={(e) => { e.preventDefault(); addPayment(); }} className="grid grid-cols-2 gap-2 py-3 border-b border-slate-100 dark:border-neutral-700">
              <input autoFocus inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount £" aria-label="Amount" className={`${inputCls} min-w-0`} />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${inputCls} min-w-0`} />
              <button type="button" onClick={() => setAdding(false)} className="h-10 rounded-xl border border-slate-200 dark:border-neutral-600 text-sm font-semibold text-slate-600 dark:text-neutral-300">Cancel</button>
              <button type="submit" disabled={!(value > 0)} className="h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">Add payment</button>
            </form>
          )}
          <div className="md:max-h-[300px] md:overflow-y-auto">
            {payments.length === 0 && !adding && <p className="text-sm text-slate-500 dark:text-neutral-400 py-4">No repayments yet.</p>}
            {shown.map((p, i) => {
              const up = shown.length > 3 && i >= shown.length - 2; // open the menu upwards near the bottom
              const tx = p.transactionId ? txById.get(p.transactionId) : undefined;
              const counted = isCounted(debt, p);
              return (
                <div key={p.id} className="relative flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-neutral-700/70">
                  <span className="w-[76px] shrink-0 text-xs text-slate-500 dark:text-neutral-400">{shortDate(p.date)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-800 dark:text-neutral-200 truncate">{p.transactionId ? tx?.description || 'Bank payment' : 'Repayment'}</span>
                    {p.transactionId
                      ? <span className={`flex items-center gap-1 text-[11px] truncate ${counted ? 'text-amber-700 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-300'}`}><Link2 size={11} className="shrink-0" /> Linked{tx?.bankName ? ` · ${tx.bankName}` : ''} · {counted ? 'counted as spending' : 'not counted in spending'}{p.counted !== undefined && p.counted !== !!debt.countAsSpending ? ' (just this one)' : ''}</span>
                      : <span className="block text-[11px] text-slate-400 dark:text-neutral-500">Added by you</span>}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{gbp2(p.amount)}</span>
                  <button onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }} aria-label="Payment options" className={`w-7 h-7 rounded-lg flex items-center justify-center ${menu === p.id ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-700'}`}><MoreHorizontal size={16} /></button>
                  {menu === p.id && (
                    <div onClick={(e) => e.stopPropagation()} className={`absolute right-0 ${up ? 'bottom-11' : 'top-11'} z-10 w-60 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 shadow-xl p-1.5 text-[13px]`}>
                      {p.transactionId && (
                        <>
                          <button onClick={() => { actions.setPaymentCounted(debt.id, p.id, false === !!debt.countAsSpending ? null : false); setMenu(null); }} className="w-full flex justify-between px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-700 text-left text-slate-800 dark:text-neutral-200">Leave out of spending {!counted && <Check size={15} className="text-indigo-600" />}</button>
                          <button onClick={() => { actions.setPaymentCounted(debt.id, p.id, true === !!debt.countAsSpending ? null : true); setMenu(null); }} className="w-full flex justify-between px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-700 text-left text-slate-800 dark:text-neutral-200">Count as spending {counted && <Check size={15} className="text-indigo-600" />}</button>
                          <div className="h-px bg-slate-100 dark:bg-neutral-700 my-1" />
                        </>
                      )}
                      <button onClick={() => { actions.removePayment(debt.id, p.id); setMenu(null); }} className="w-full px-2.5 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left text-rose-600">{p.transactionId ? 'Unlink' : 'Remove'}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!debt.clearedAt && !adding && (
            <div className="flex gap-4 mt-3">
              {transactions.length > 0 && <button onClick={() => setLinking(true)} className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-300 flex items-center gap-1"><Link2 size={14} /> Link bank payments</button>}
              <button onClick={() => setAdding(true)} className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-300 flex items-center gap-1"><Plus size={14} /> Add a payment</button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-neutral-700 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-slate-600 dark:text-neutral-300">Delete this debt and its repayments?</span>
            <button onClick={() => setConfirmDelete(false)} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-slate-600 dark:text-neutral-300">Keep it</button>
            <button onClick={onDelete} className="h-9 px-3 rounded-xl bg-rose-600 text-white text-[13px] font-semibold">Delete</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="self-start text-[13px] font-semibold text-slate-500 dark:text-neutral-400 hover:text-rose-600 flex items-center gap-1.5"><Trash2 size={14} /> Delete debt</button>
        )}
        <div className="flex items-center gap-3">
          {!debt.clearedAt && <span className="hidden lg:inline text-[11.5px] text-slate-400 dark:text-neutral-500">You can clear it any time, even if the numbers don't add up exactly.</span>}
          {debt.clearedAt
            ? <button onClick={() => actions.updateDebt({ ...debt, clearedAt: undefined })} className="flex-1 sm:flex-none h-11 px-5 rounded-xl border border-slate-200 dark:border-neutral-600 text-sm font-semibold text-slate-700 dark:text-neutral-200 flex items-center justify-center gap-1.5"><RotateCcw size={14} /> Not cleared yet</button>
            : <button onClick={() => actions.updateDebt({ ...debt, clearedAt: today() })} className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Check size={16} /> Mark as cleared</button>}
        </div>
      </div>
    </div>
  );
};

// The Debts card on the Dashboard: the same table, read-only. Anything you click opens the Debts page.
export const DebtsCard: React.FC<{ debts: Debt[]; onOpen?: () => void }> = ({ debts, onOpen }) => {
  const active = debts.filter(d => !d.clearedAt).sort((a, b) => leftOf(b) - leftOf(a));
  const clearedN = debts.length - active.length;
  const borrowed = active.reduce((a, d) => a + d.borrowed, 0);
  const paid = active.reduce((a, d) => a + paidOf(d), 0);
  const left = active.reduce((a, d) => a + leftOf(d), 0);
  return (
    <section aria-label="Debts" className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-3xl p-6 md:p-7" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-neutral-100">Debts</h2>
          <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400">
            {active.length ? `${gbp(left)} still to pay · ${gbp(paid)} paid back` : 'Nothing owed right now'}
            {clearedN > 0 && ` · ${clearedN} cleared`}
          </p>
        </div>
        {onOpen && <button onClick={onOpen} className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-slate-50 dark:hover:bg-neutral-700/40 shrink-0">{active.length ? 'Open Debts →' : '＋ Add a debt'}</button>}
      </div>
      {active.length > 0 && (
        <div className="mt-4">
          <div className={`${grid} text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 pb-2.5 border-b border-slate-100 dark:border-neutral-700`}>
            <span>Debt</span>
            <span className="hidden md:block text-right">Borrowed</span>
            <span className="hidden md:block text-right">Paid</span>
            <span className="text-right">Left</span>
            <span className="hidden md:block">Progress</span>
            <span className="text-right">Status</span>
          </div>
          {active.map(d => {
            const p = paidOf(d);
            const pct = progressOf(d);
            const st = statusOf(d);
            return (
              <button key={d.id} onClick={onOpen} className={`${grid} w-full text-left py-3 border-b border-slate-100 dark:border-neutral-700/70 hover:bg-slate-50 dark:hover:bg-neutral-700/30 transition-colors`}>
                <span className="min-w-0 flex items-center gap-2 text-sm text-slate-900 dark:text-neutral-100"><span className="text-base shrink-0">{d.emoji}</span><span className="min-w-0 leading-snug break-words md:truncate">{d.name}</span></span>
                <span className="hidden md:block text-right text-sm text-slate-500 dark:text-neutral-400">{gbp(d.borrowed)}</span>
                <span className="hidden md:block text-right text-sm text-emerald-700 dark:text-emerald-400">{gbp(p)}</span>
                <span className="text-right text-sm font-bold text-slate-900 dark:text-neutral-100">{gbp(leftOf(d))}</span>
                <span className="hidden md:block h-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                <span className="text-right"><span className={`inline-flex items-center h-6 px-2 md:px-2.5 rounded-full text-[10.5px] md:text-[11px] font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span></span>
              </button>
            );
          })}
          {active.length > 1 && (
            <div className={`${grid} pt-3 text-sm font-bold text-slate-900 dark:text-neutral-100`}>
              <span>Total</span>
              <span className="hidden md:block text-right">{gbp(borrowed)}</span>
              <span className="hidden md:block text-right text-emerald-700 dark:text-emerald-400">{gbp(paid)}</span>
              <span className="text-right">{gbp(left)}</span>
              <span className="hidden md:block" />
              <span />
            </div>
          )}
        </div>
      )}
      {active.length === 0 && clearedN === 0 && (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-neutral-400">Track money you owe here: add a debt, log repayments, and clear it when it's done.</p>
      )}
    </section>
  );
};

const DebtsPage: React.FC<{ debts: Debt[]; actions: DebtActions; error?: string; onDismissError?: () => void; transactions?: Transaction[]; openId?: string | null; onOpened?: () => void }> = ({ debts, actions, error, onDismissError, transactions = [], openId: openRequest, onOpened }) => {
  // Transactions already linked to any debt (they can't be linked twice)
  const linked = useMemo(() => new Set(debts.flatMap(d => d.payments.map(p => p.transactionId).filter(Boolean) as string[])), [debts]);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Opened from search: show that debt straight away
  useEffect(() => {
    if (openRequest && debts.some(d => d.id === openRequest)) { setOpenId(openRequest); onOpened?.(); }
  }, [openRequest, debts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false);
  const active = useMemo(() => debts.filter(d => !d.clearedAt).sort((a, b) => leftOf(b) - leftOf(a)), [debts]);
  const cleared = useMemo(() => debts.filter(d => d.clearedAt).sort((a, b) => (b.clearedAt || '').localeCompare(a.clearedAt || '')), [debts]);
  const totals = useMemo(() => {
    const borrowed = active.reduce((a, d) => a + d.borrowed, 0);
    const paid = active.reduce((a, d) => a + paidOf(d), 0);
    return { borrowed, paid, left: active.reduce((a, d) => a + leftOf(d), 0) };
  }, [active]);
  const open = debts.find(d => d.id === openId) || null;


  return (
    <div className="max-w-5xl mx-auto pb-24 md:pb-6 flex flex-col gap-5" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Debts</h1>
        <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">What you owe, what you've paid back, and what's cleared</p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-[13px] text-rose-800 dark:text-rose-200">
          <span className="flex-1">{error}. The list now shows what's saved{/fetch|network|connection/i.test(error) ? '; check your connection and try again' : ''}.</span>
          {onDismissError && <button onClick={onDismissError} aria-label="Dismiss" className="text-rose-500 hover:text-rose-700"><X size={16} /></button>}
        </div>
      )}

      <section className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-3xl p-5 md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Debts</h2>
            <p className="text-[13px] text-slate-500 dark:text-neutral-400">{gbp(totals.left)} still to pay · {gbp(totals.paid)} paid back</p>
          </div>
          <button onClick={() => setAdding(true)} className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5 shrink-0"><Plus size={16} /> Add a debt</button>
        </div>

        {active.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{cleared.length ? 'Nothing owed right now' : 'No debts yet'}</p>
            <p className="text-[13px] text-slate-500 dark:text-neutral-400 mt-1">Add what you owe, then add repayments as you go and clear it when it's done.</p>
          </div>
        ) : (
          <div className="mt-5">
            <div className={`${grid} text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 pb-2.5 border-b border-slate-100 dark:border-neutral-700`}>
              <span>Debt</span>
              <span className="hidden md:block text-right">Borrowed</span>
              <span className="hidden md:block text-right">Paid</span>
              <span className="text-right">Left</span>
              <span className="hidden md:block">Progress</span>
              <span className="text-right">Status</span>
            </div>
            {active.map(d => {
              const paid = paidOf(d);
              const pct = progressOf(d);
              const st = statusOf(d);
              return (
                <button key={d.id} onClick={() => setOpenId(d.id)} className={`${grid} w-full text-left py-3.5 border-b border-slate-100 dark:border-neutral-700/70 hover:bg-slate-50 dark:hover:bg-neutral-700/30 transition-colors`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm text-slate-900 dark:text-neutral-100"><span className="text-base shrink-0">{d.emoji}</span><span className="min-w-0 leading-snug break-words md:truncate">{d.name}</span></span>
                    <span className="md:hidden block h-1.5 mt-2 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                  </span>
                  <span className="hidden md:block text-right text-sm text-slate-500 dark:text-neutral-400">{gbp(d.borrowed)}</span>
                  <span className="hidden md:block text-right text-sm text-emerald-700 dark:text-emerald-400">{gbp(paid)}</span>
                  <span className="text-right text-sm font-bold text-slate-900 dark:text-neutral-100">{gbp(leftOf(d))}</span>
                  <span className="hidden md:block h-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                  <span className="text-right"><span className={`inline-flex items-center h-6 px-2 md:px-2.5 rounded-full text-[10.5px] md:text-[11px] font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span></span>
                </button>
              );
            })}
            <div className={`${grid} py-3.5 text-sm font-bold text-slate-900 dark:text-neutral-100`}>
              <span>Total</span>
              <span className="hidden md:block text-right">{gbp(totals.borrowed)}</span>
              <span className="hidden md:block text-right text-emerald-700 dark:text-emerald-400">{gbp(totals.paid)}</span>
              <span className="text-right">{gbp(totals.left)}</span>
              <span className="hidden md:block" />
              <span />
            </div>
          </div>
        )}

        {cleared.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1">Cleared · {cleared.length}</div>
            {cleared.map(d => (
              <button key={d.id} onClick={() => setOpenId(d.id)} className="w-full flex items-center gap-3 py-2.5 text-left opacity-60 hover:opacity-90 transition-opacity">
                <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"><Check size={16} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-900 dark:text-neutral-100 line-through truncate">{d.emoji} {d.name}</span>
                  <span className="block text-xs text-slate-500 dark:text-neutral-400">{gbp(d.borrowed)} · cleared {shortDate(d.clearedAt!)} · {d.payments.length} payment{d.payments.length === 1 ? '' : 's'}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-4 rounded-xl bg-slate-50 dark:bg-neutral-700/40 px-4 py-2.5 text-xs text-slate-500 dark:text-neutral-400">
          Open a debt and use <span className="font-semibold text-slate-700 dark:text-neutral-200">Link bank payments</span> to attach the transactions that paid it back. Linked payments are left out of your spending totals; repayments you add by hand are just for tracking.
        </p>
      </section>

      <AnimatedModal isOpen={adding} onClose={() => setAdding(false)} panelClassName="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100 dark:border-neutral-700">
        <DebtForm onCancel={() => setAdding(false)} onSave={(d) => { actions.addDebt(d); setAdding(false); }} />
      </AnimatedModal>

      <AnimatedModal isOpen={!!open} onClose={() => { setOpenId(null); setEditing(false); }} panelClassName={`relative bg-white dark:bg-neutral-800 rounded-2xl md:rounded-3xl shadow-2xl w-full ${editing ? 'max-w-md' : 'max-w-[1180px]'} p-6 border border-slate-100 dark:border-neutral-700`}>
        {open && (editing
          ? <DebtForm initial={open} onCancel={() => setEditing(false)} onSave={(d) => { actions.updateDebt(d); setEditing(false); }} />
          : <DebtDetail debt={open} actions={actions} transactions={transactions} linked={linked} onEdit={() => setEditing(true)} onClose={() => setOpenId(null)} onDelete={() => { actions.deleteDebt(open.id); setOpenId(null); }} />)}
      </AnimatedModal>
    </div>
  );
};

export default DebtsPage;
