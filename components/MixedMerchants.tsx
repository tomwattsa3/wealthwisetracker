import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { Transaction, Category } from '../types';
import Sheet from './Sheet';
import { useBackClose } from '../lib/backStack';
import { merchantKey } from '../lib/periods';
import { SHEET_SPRING, MODAL_TRANSITION } from '../lib/motion';
import { buzz } from '../lib/haptics';

// Merchants whose payments are filed under more than one category (e.g. Careem under Food and
// Transport). Merchants are grouped the same way as Home's Top places. Each one shows how its
// payments are split; you can move them all into one of those categories, show them in the
// list, or mark the split as fine (it comes back if a new category turns up for it).

const OK_KEY = 'mixedMerchantsOk';
const isHidden = (t: Transaction) => !!t.excluded || t.categoryId === 'excluded';
const gbp = (v: number) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string) => { const [y, m, day] = d.slice(0, 10).split('-').map(Number); return `${day} ${MONTHS[m - 1]} '${String(y).slice(2)}`; };

export interface MixedSplit { categoryId: string; categoryName: string; sub: string; ids: string[]; total: number; last: string }
export interface MixedMerchant { key: string; query: string; name: string; count: number; splits: MixedSplit[]; signature: string }

const readOk = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(OK_KEY) || '[]')); } catch { return new Set(); } };

// Every merchant with payments in two or more categories, busiest first, minus the ones marked fine.
export const useMixedMerchants = (transactions: Transaction[]) => {
  const [ok, setOk] = useState(readOk);
  const all = useMemo(() => {
    const groups = new Map<string, { names: Map<string, number>; splits: Map<string, MixedSplit> }>();
    transactions.forEach(t => {
      if (isHidden(t) || !t.categoryId || !t.description) return;
      const desc = t.description.trim();
      // Spending and money in are compared separately, so a refund isn't counted as a mix-up.
      const key = `${t.type}:${merchantKey(desc) || desc.toLowerCase()}`;
      const g = groups.get(key) || { names: new Map(), splits: new Map() };
      g.names.set(desc, (g.names.get(desc) || 0) + 1);
      const sk = `${t.categoryId}|${t.subcategoryName || ''}`;
      const sp = g.splits.get(sk) || { categoryId: t.categoryId, categoryName: t.categoryName, sub: t.subcategoryName || '', ids: [], total: 0, last: '' };
      sp.ids.push(t.id);
      sp.total += Math.abs(t.amountGBP || 0);
      if (t.date > sp.last) sp.last = t.date;
      g.splits.set(sk, sp);
      groups.set(key, g);
    });
    const out: MixedMerchant[] = [];
    groups.forEach((g, key) => {
      const cats = new Set(Array.from(g.splits.values()).map(s => s.categoryId));
      if (cats.size < 2) return;
      const splits = Array.from(g.splits.values()).sort((a, b) => b.ids.length - a.ids.length || b.total - a.total);
      const name = Array.from(g.names.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const signature = `${key}|${Array.from(cats).sort().join(',')}`;
      out.push({ key, query: key.slice(key.indexOf(':') + 1), name, count: splits.reduce((s, x) => s + x.ids.length, 0), splits, signature });
    });
    return out.sort((a, b) => b.count - a.count);
  }, [transactions]);
  const mixed = all.filter(m => !ok.has(m.signature));
  const markOk = (m: MixedMerchant) => {
    const next = new Set(ok);
    next.add(m.signature);
    setOk(next);
    try { localStorage.setItem(OK_KEY, JSON.stringify(Array.from(next))); } catch { /* not saved */ }
  };
  const resetOk = () => { setOk(new Set()); try { localStorage.removeItem(OK_KEY); } catch { /* ignore */ } };
  return { mixed, hiddenCount: all.length - mixed.length, markOk, resetOk };
};

interface MixedMerchantsProps {
  open: boolean;
  onClose: () => void;
  sheet: boolean;
  mixed: MixedMerchant[];
  hiddenCount: number;
  onMarkOk: (m: MixedMerchant) => void;
  onResetOk: () => void;
  getCategoryEmoji: (categoryId: string) => string;
  categories: Category[];
  onBulkUpdate: (ids: string[], updates: Partial<Transaction>) => void;
  onShow: (query: string) => void;
  onToast: (msg: string) => void;
}

const MixedMerchants: React.FC<MixedMerchantsProps> = ({ open, onClose, sheet, mixed, hiddenCount, onMarkOk, onResetOk, getCategoryEmoji, categories, onBulkUpdate, onShow, onToast }) => {
  // The split you've asked to move everything into, waiting for a second tap to confirm.
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => { if (!open) setConfirm(null); }, [open]);
  useBackClose(open && !sheet, onClose);
  useEffect(() => {
    if (!open || sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sheet, onClose]);

  const moveAll = (m: MixedMerchant, to: MixedSplit) => {
    const ids = m.splits.filter(s => s !== to).flatMap(s => s.ids);
    const cat = categories.find(c => c.id === to.categoryId);
    onBulkUpdate(ids, { categoryId: to.categoryId, categoryName: cat?.name || to.categoryName, subcategoryName: to.sub, excluded: false });
    onToast(`Moved ${ids.length} ${m.name} ${ids.length === 1 ? 'payment' : 'payments'} to ${to.categoryName}${to.sub ? ` › ${to.sub}` : ''}`);
    buzz();
    setConfirm(null);
  };

  const body = (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`shrink-0 px-5 ${sheet ? 'pt-1' : 'pt-5'} pb-3 flex items-start gap-3 border-b border-slate-100 dark:border-neutral-700`}>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-neutral-100">Mixed categories</h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {mixed.length ? `${mixed.length} ${mixed.length === 1 ? 'merchant is' : 'merchants are'} filed under more than one category` : 'Every merchant is in one category'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 relative after:absolute after:-inset-1.5 after:content-[''] rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 flex items-center justify-center"><X size={15} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
        {mixed.map(m => (
          <div key={m.key} className="py-3.5 border-b border-slate-100 dark:border-neutral-700">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[14.5px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{m.name}</p>
              <span className="shrink-0 text-xs text-slate-500 dark:text-neutral-400">{m.count} payments</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {m.splits.map(sp => {
                const id = `${m.key}|${sp.categoryId}|${sp.sub}`;
                const others = m.count - sp.ids.length;
                const asking = confirm === id;
                return (
                  <div key={id} className={`rounded-xl border px-3 py-2 ${asking ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-neutral-700'}`}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-[13px] text-slate-800 dark:text-neutral-200 truncate">
                        {getCategoryEmoji(sp.categoryId)} {sp.categoryName}{sp.sub ? <span className="text-slate-500 dark:text-neutral-400"> › {sp.sub}</span> : null}
                      </span>
                      <span className="shrink-0 text-[12.5px] font-semibold text-slate-900 dark:text-neutral-100">×{sp.ids.length}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-slate-500 dark:text-neutral-400">{gbp(sp.total)} · last {shortDate(sp.last)}</span>
                      {!asking && (
                        <button onClick={() => setConfirm(id)} className="shrink-0 min-h-[30px] px-2 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300">Move all here</button>
                      )}
                    </div>
                    {asking && (
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => moveAll(m, sp)} className="flex-1 min-h-[36px] rounded-lg bg-indigo-600 text-white text-[12.5px] font-semibold">Move the other {others} here</button>
                        <button onClick={() => setConfirm(null)} className="min-h-[36px] px-3 rounded-lg text-[12.5px] text-slate-600 dark:text-neutral-300">Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-[12.5px] font-medium">
              <button onClick={() => { onShow(m.query); onClose(); }} className="flex items-center gap-1 text-slate-600 dark:text-neutral-300"><Search size={12} /> Show in list</button>
              <button onClick={() => onMarkOk(m)} className="text-slate-500 dark:text-neutral-400">Looks right</button>
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <p className="pt-3 text-center text-[12px] text-slate-400 dark:text-neutral-500">
            {hiddenCount} marked as fine · <button onClick={onResetOk} className="font-semibold text-indigo-700 dark:text-indigo-300">Show them again</button>
          </p>
        )}
      </div>
    </div>
  );

  if (sheet) return <Sheet open={open} onClose={onClose} label="Mixed categories" heightClass="h-[86dvh]">{body}</Sheet>;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="mixed" className="fixed inset-0 z-[110]">
          <motion.div className="absolute inset-0 bg-slate-900/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Mixed categories"
            className="absolute top-0 right-0 bottom-0 w-[440px] max-w-full flex flex-col bg-white dark:bg-neutral-800 shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={SHEET_SPRING}
          >
            {body}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MixedMerchants;
