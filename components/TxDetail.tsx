import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Transaction, Bank } from '../types';
import Sheet from './Sheet';
import { useBackClose } from '../lib/backStack';
import { MODAL_TRANSITION } from '../lib/motion';

// A transaction's details in a small pop-up (a card on desktop, a slide-up sheet on phones):
// both amounts and the currency it was paid in, its category and bank, and a note that saves
// itself as you type. App provides the transactions and the save function through this context.

export const AUTO_NOTE = '✨ Auto-categorized';
// The part of a transaction's notes you wrote (the auto-categorised tag is kept separately).
export const userNote = (notes?: string) => (notes || '').replace(AUTO_NOTE, '').trim();

interface TxActions {
  transactions: Transaction[];
  banks: Bank[];
  getCategoryEmoji: (categoryId: string) => string;
  onUpdate: (id: string, updates: Partial<Transaction>) => Promise<void> | void;
  onOpenInTransactions: (t: Transaction) => void;
}
export const TxActionsContext = createContext<TxActions | null>(null);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const money = (sym: string, v: number) => `${sym}${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Body: React.FC<{ t: Transaction; sheet: boolean; onClose: () => void; flushRef: React.MutableRefObject<(() => void) | null> }> = ({ t, sheet, onClose, flushRef }) => {
  const ctx = useContext(TxActionsContext)!;
  const [draft, setDraft] = useState(userNote(t.notes));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>(userNote(t.notes) ? 'saved' : 'idle');
  const lastSaved = useRef(userNote(t.notes));
  const timer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const save = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const text = draftRef.current.trim();
    if (text === lastSaved.current) return;
    const auto = (t.notes || '').includes(AUTO_NOTE);
    setStatus('saving');
    lastSaved.current = text;
    await ctx.onUpdate(t.id, { notes: auto ? `${text}${text ? ' ' : ''}${AUTO_NOTE}` : text });
    setStatus(text ? 'saved' : 'idle');
  };
  // Save a second after you stop typing, and straight away when the pop-up closes (however it
  // closes: the parent calls this before closing, and unmounting saves anything left).
  flushRef.current = () => { void save(); };
  useEffect(() => () => { void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const type = (v: string) => {
    setDraft(v);
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void save(); }, 900);
  };

  const income = t.type === 'INCOME';
  const d = new Date(`${t.date.slice(0, 10)}T12:00:00`);
  const bank = ctx.banks.find(b => b.name.trim().toLowerCase() === (t.bankName || '').trim().toLowerCase());
  const paidAED = (bank?.currency || '').toUpperCase() === 'AED';
  const sign = income ? '+' : '−';
  const initial = (t.description || '').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•';
  const hasBoth = t.amountGBP > 0 && t.amountAED > 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center text-lg font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-slate-900 dark:text-neutral-100 truncate" title={t.description}>{t.description || 'Unknown'}</div>
          <div className="text-xs text-slate-500 dark:text-neutral-400">{DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</div>
        </div>
        {!sheet && (
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 self-start rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center"><X size={15} /></button>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 px-4 py-3">
        <div className={`text-[26px] leading-tight font-bold ${income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{sign}{money('£', t.amountGBP)}</div>
        {hasBoth && (
          <>
            <div className="text-[13px] text-slate-600 dark:text-neutral-300 mt-0.5">
              {paidAED ? `Paid in dirhams · ${money('AED ', t.amountAED)}` : bank ? `Paid in pounds · ${money('AED ', t.amountAED)} equivalent` : money('AED ', t.amountAED)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-neutral-500">£1 = AED {(t.amountAED / t.amountGBP).toFixed(2)}</div>
          </>
        )}
      </div>

      <div className="mt-1 flex flex-col text-[13px]">
        <div className="flex justify-between items-center gap-3 min-h-[44px] border-b border-slate-100 dark:border-neutral-700">
          <span className="text-slate-500 dark:text-neutral-400">Category</span>
          <span className="font-medium text-slate-900 dark:text-neutral-100 truncate">
            {t.categoryId ? `${ctx.getCategoryEmoji(t.categoryId)} ${t.categoryName}${t.subcategoryName ? ` › ${t.subcategoryName}` : ''}` : 'Not categorised'}
          </span>
        </div>
        {t.bankName && (
          <div className="flex justify-between items-center gap-3 min-h-[44px] border-b border-slate-100 dark:border-neutral-700">
            <span className="text-slate-500 dark:text-neutral-400">Bank</span>
            <span className="font-medium text-slate-900 dark:text-neutral-100">{t.bankName}</span>
          </div>
        )}
      </div>

      <label className="mt-3.5 flex flex-col gap-1.5">
        <span className="flex justify-between text-xs font-semibold text-slate-600 dark:text-neutral-300">
          Note
          <span className="font-normal text-slate-400 dark:text-neutral-500">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</span>
        </span>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => type(e.target.value)}
          onBlur={() => { void save(); }}
          placeholder="Add a note…"
          data-no-sheet-drag
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 resize-none outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
        />
      </label>

      <button
        onClick={() => { onClose(); ctx.onOpenInTransactions(t); }}
        className={`mt-4 min-h-[44px] rounded-xl text-sm font-semibold text-indigo-700 dark:text-indigo-300 ${sheet ? 'bg-slate-100 dark:bg-neutral-700' : 'hover:bg-slate-50 dark:hover:bg-neutral-700/50'}`}
      >
        Open in Transactions{sheet ? '' : ' →'}
      </button>
    </div>
  );
};

// `id` = the transaction to show (null = closed). `sheet` = phone layout.
const TxDetail: React.FC<{ id: string | null; onClose: () => void; sheet: boolean }> = ({ id, onClose: closeRaw, sheet }) => {
  const ctx = useContext(TxActionsContext);
  const flushRef = useRef<(() => void) | null>(null);
  const onClose = () => { flushRef.current?.(); closeRaw(); };
  const t = id && ctx ? ctx.transactions.find(x => x.id === id) || null : null;
  // Keep the last one on screen while it slides away.
  const last = useRef<Transaction | null>(null);
  if (t) last.current = t;
  const shown = t || last.current;
  useBackClose(!!t && !sheet, onClose);
  useEffect(() => {
    if (!t || sheet) return;
    // Escape closes just this pop-up, not the panel underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [t, sheet, onClose]);
  if (!ctx) return null;

  if (sheet) {
    return (
      <Sheet open={!!t} onClose={onClose} label="Payment details" zClass="z-[120]">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(20px,env(safe-area-inset-bottom))]">
          {shown && <Body key={shown.id} t={shown} sheet onClose={onClose} flushRef={flushRef} />}
        </div>
      </Sheet>
    );
  }
  return createPortal(
    <AnimatePresence>
      {t && (
        <div key="tx" className="fixed inset-0 z-[120] pointer-events-none">
          {/* Clicking the page closes it; the panel on the right stays clickable, so tapping
              another payment there switches to it. */}
          <button aria-label="Close details" className="absolute inset-y-0 left-0 right-[480px] cursor-default pointer-events-auto" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Payment details"
            className="pointer-events-auto absolute right-[500px] top-20 w-[340px] max-w-[calc(100vw-520px)] rounded-[20px] border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-2xl p-5"
            initial={{ opacity: 0, x: 12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.98 }}
            transition={MODAL_TRANSITION}
          >
            <Body key={t.id} t={t} sheet={false} onClose={onClose} flushRef={flushRef} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default TxDetail;
