import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { Debt, DebtPayment } from '../components/DebtsPage';

// Debts live in two tables: debts (one row per debt) and debt_payments (one row per repayment).
// Paid and left are worked out from the payments, never stored. Every change is saved straight
// away, one row at a time, and shown on screen first; if the save fails it's undone and `error`
// says why.

type DebtRow = {
  id: string; name: string; emoji: string; borrowed: number | string; borrowed_on: string | null;
  note: string | null; cleared_at: string | null; count_as_spending?: boolean | null; interest_rate?: number | string | null; monthly_payment?: number | string | null;
  debt_payments?: { id: string; paid_on: string; amount: number | string; transaction_id: string | null; counted?: boolean | null }[];
};

const fromRow = (r: DebtRow): Debt => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  borrowed: Number(r.borrowed),
  date: r.borrowed_on || undefined,
  note: r.note || undefined,
  clearedAt: r.cleared_at || undefined,
  countAsSpending: !!r.count_as_spending,
  interestRate: r.interest_rate != null && Number(r.interest_rate) > 0 ? Number(r.interest_rate) : undefined,
  monthlyPayment: r.monthly_payment != null && Number(r.monthly_payment) > 0 ? Number(r.monthly_payment) : undefined,
  payments: (r.debt_payments || []).map(p => ({ id: p.id, date: p.paid_on, amount: Number(p.amount), transactionId: p.transaction_id || undefined, counted: typeof p.counted === 'boolean' ? p.counted : undefined })),
});

// Interest columns (sent only when the debt has interest or had it, so a debt without interest
// still saves before those columns exist)
const interestCols = (d: Debt & { hadInterest?: boolean }) => (d.interestRate || d.monthlyPayment || d.hadInterest
  ? { interest_rate: d.interestRate ?? null, monthly_payment: d.monthlyPayment ?? null }
  : {});

export interface DebtActions {
  addDebt: (d: Debt) => void;
  updateDebt: (d: Debt) => void; // name, icon, amount, date, note, cleared
  deleteDebt: (id: string) => void;
  addPayment: (debtId: string, p: DebtPayment) => void;
  addPayments: (debtId: string, ps: DebtPayment[]) => void; // several at once (linking bank payments)
  removePayment: (debtId: string, paymentId: string) => void;
  // Linked bank payments: count them as spending or leave them out. The debt sets the default;
  // a payment can override it (null = follow the debt).
  setCountAsSpending: (debtId: string, on: boolean) => void;
  setPaymentCounted: (debtId: string, paymentId: string, counted: boolean | null) => void;
}

export const useDebts = (userId: string | undefined) => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!userId) { setDebts([]); return; }
    const { data, error: e } = await supabase.from('debts').select('*, debt_payments(*)').order('created_at');
    if (e) { setError(`Couldn't load your debts: ${e.message}`); return; }
    setDebts((data as DebtRow[]).map(fromRow));
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);

  // Show the change now; if the save fails, reload what's really saved and say so.
  const attempt = (next: (cur: Debt[]) => Debt[], save: () => PromiseLike<{ error: { message: string } | null }>) => {
    setDebts(next);
    setError('');
    void Promise.resolve(save()).then(({ error: e }) => {
      if (e) { setError(`Couldn't save that change: ${e.message}`); void reload(); }
    }, (e: unknown) => {
      setError(`Couldn't save that change: ${e instanceof Error ? e.message : 'no connection'}`); void reload();
    });
  };

  const actions: DebtActions = {
    addDebt: (d) => attempt(
      cur => [...cur, d],
      () => supabase.from('debts').insert({ id: d.id, name: d.name, emoji: d.emoji, borrowed: d.borrowed, borrowed_on: d.date ?? null, note: d.note ?? null, ...interestCols(d) }),
    ),
    updateDebt: (d) => {
      const prev = debts.find(x => x.id === d.id);
      const hadInterest = !!(prev?.interestRate || prev?.monthlyPayment);
      attempt(
        cur => cur.map(x => (x.id === d.id ? { ...d, payments: x.payments } : x)),
        () => supabase.from('debts').update({ name: d.name, emoji: d.emoji, borrowed: d.borrowed, borrowed_on: d.date ?? null, note: d.note ?? null, cleared_at: d.clearedAt ?? null, ...interestCols({ ...d, hadInterest }) }).eq('id', d.id),
      );
    },
    deleteDebt: (id) => attempt(
      cur => cur.filter(x => x.id !== id),
      () => supabase.from('debts').delete().eq('id', id),
    ),
    addPayment: (debtId, p) => attempt(
      cur => cur.map(x => (x.id === debtId ? { ...x, payments: [...x.payments, p] } : x)),
      () => supabase.from('debt_payments').insert({ id: p.id, debt_id: debtId, paid_on: p.date, amount: p.amount, transaction_id: p.transactionId ?? null }),
    ),
    addPayments: (debtId, ps) => attempt(
      cur => cur.map(x => (x.id === debtId ? { ...x, payments: [...x.payments, ...ps] } : x)),
      () => supabase.from('debt_payments').insert(ps.map(p => ({ id: p.id, debt_id: debtId, paid_on: p.date, amount: p.amount, transaction_id: p.transactionId ?? null }))),
    ),
    setCountAsSpending: (debtId, on) => attempt(
      cur => cur.map(x => (x.id === debtId ? { ...x, countAsSpending: on } : x)),
      () => supabase.from('debts').update({ count_as_spending: on }).eq('id', debtId),
    ),
    setPaymentCounted: (debtId, paymentId, counted) => attempt(
      cur => cur.map(x => (x.id === debtId ? { ...x, payments: x.payments.map(p => (p.id === paymentId ? { ...p, counted: counted ?? undefined } : p)) } : x)),
      () => supabase.from('debt_payments').update({ counted }).eq('id', paymentId),
    ),
    removePayment: (debtId, paymentId) => attempt(
      cur => cur.map(x => (x.id === debtId ? { ...x, payments: x.payments.filter(p => p.id !== paymentId) } : x)),
      () => supabase.from('debt_payments').delete().eq('id', paymentId),
    ),
  };

  return { debts, actions, error, clearError: () => setError(''), reload };
};
