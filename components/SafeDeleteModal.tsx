import React, { useEffect, useRef, useState } from 'react';
import { Category, Transaction } from '../types';
import AnimatedModal from './AnimatedModal';

// Deleting a category or subcategory, carefully:
// 1. A warning that says what it affects. Anything with more than MAX_PAYMENTS payments can't be
//    deleted (move them elsewhere first). With a few, you choose where they move to.
// 2. Type DELETE to continue.
// 3. A last check: press and hold the red button for 2 seconds.
// The caller then waits a few seconds with an Undo before actually deleting.

export const MAX_PAYMENTS = 3;

export interface DeleteTarget {
  kind: 'category' | 'subcategory';
  category: Category;
  subcategory?: string;          // for kind 'subcategory'
  payments: Transaction[];       // every payment filed under it (all time)
}

interface Props {
  target: DeleteTarget | null;
  categories: Category[];
  onClose: () => void;
  // moveTo: where the payments go ("categoryId\u0001subcategory"), or null when there are none
  onConfirm: (moveTo: string | null) => void;
  getCategoryEmoji?: (categoryId: string) => string;
  onShowPayments?: (categoryId: string, subcategory: string | null) => void;
}

const HOLD_MS = 2000;
const money = (v: number) => '£' + Math.round(v).toLocaleString('en-GB');
const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const TrashIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
);
const WarnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
);

const SafeDeleteModal: React.FC<Props> = ({ target, categories, onClose, onConfirm, getCategoryEmoji, onShowPayments }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [hold, setHold] = useState(0); // 0..1 while the button is held
  const holdStart = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  // Where the payments could go: every other category/subcategory of the same kind
  const options = target ? categories
    .filter(c => c.type === target.category.type && c.id !== 'excluded')
    .flatMap(c => (c.subcategories.length ? c.subcategories : ['']).map(s => ({ c, s })))
    .filter(({ c, s }) => target.kind === 'category' ? c.id !== target.category.id : !(c.id === target.category.id && s === target.subcategory)) : [];

  useEffect(() => {
    if (!target) return;
    setStep(1); setTyped(''); setHold(0);
    const sameCat = options.find(o => o.c.id === target.category.id);
    const first = target.kind === 'subcategory' && sameCat ? sameCat : options[0];
    setMoveTo(first ? `${first.c.id}\u0001${first.s}` : '');
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopHold = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null; holdStart.current = null; setHold(0);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  if (!target) return <AnimatedModal isOpen={false} onClose={onClose}>{null}</AnimatedModal>;

  const name = target.kind === 'category' ? target.category.name : target.subcategory || 'No subcategory';
  const n = target.payments.length;
  const total = target.payments.reduce((s, t) => s + Math.abs(t.amountGBP || 0), 0);
  const blocked = n > MAX_PAYMENTS;
  const ok = typed.trim().toUpperCase() === 'DELETE';
  const moveLabel = (() => {
    const [cid, s] = moveTo.split('\u0001');
    const c = categories.find(x => x.id === cid);
    return c ? `${c.name}${s ? ` › ${s}` : ''}` : '';
  })();
  const subtitle = target.kind === 'category'
    ? `${target.category.type === 'INCOME' ? 'Income' : 'Spending'} category · ${target.category.subcategories.length} ${target.category.subcategories.length === 1 ? 'subcategory' : 'subcategories'}`
    : `A subcategory of ${target.category.name}`;

  const startHold = () => {
    holdStart.current = performance.now();
    const tick = () => {
      if (holdStart.current === null) return;
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) { stopHold(); onConfirm(n ? moveTo : null); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const iconBox = 'w-11 h-11 rounded-[14px] bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center';
  const btn = 'flex-1 h-11 rounded-xl text-[14px] font-semibold';

  return (
    <AnimatedModal isOpen={!!target} onClose={onClose} panelClassName="relative w-full max-w-[440px] bg-white dark:bg-neutral-800 rounded-[20px] shadow-2xl p-5 sm:p-6">
      {blocked ? (
        <div>
          <span className={iconBox}><WarnIcon /></span>
          <h3 className="mt-3 text-[18px] font-bold text-slate-900 dark:text-neutral-100">“{name}” can't be deleted yet</h3>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-neutral-400">{subtitle}</p>
          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 px-4 py-3 text-[13px] text-slate-700 dark:text-neutral-200 leading-relaxed">
            <div className="flex justify-between"><span><b>{n} payments</b> use {name}</span><b>{money(total)}</b></div>
            <p className="mt-1.5 text-[12px] text-slate-500 dark:text-neutral-400">You can only delete a {target.kind} with {MAX_PAYMENTS} or fewer payments. Move these to another category first, then delete it.</p>
          </div>
          <div className="mt-5 flex gap-2">
            {onShowPayments && <button onClick={() => { onClose(); onShowPayments(target.category.id, target.kind === 'subcategory' ? target.subcategory ?? '' : null); }} className={`${btn} bg-indigo-600 text-white`}>Show the payments</button>}
            <button onClick={onClose} className={`${btn} bg-slate-100 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200`}>OK</button>
          </div>
        </div>
      ) : step === 1 ? (
        <div>
          <span className={iconBox}><TrashIcon /></span>
          <h3 className="mt-3 text-[18px] font-bold text-slate-900 dark:text-neutral-100">Delete {target.kind === 'category' ? 'the ' : ''}“{name}”{target.kind === 'category' ? ' category' : ''}?</h3>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-neutral-400">{subtitle}. This can't be undone.</p>

          {n === 0 ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-[13px] text-emerald-800 dark:text-emerald-300">Nothing is filed under {name}, so no payments are affected.</div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 px-4 py-3 text-[13px] text-slate-700 dark:text-neutral-200">
              <div className="flex justify-between"><span><b>{n} {n === 1 ? 'payment' : 'payments'}</b> filed under {name}</span><b>{money(total)}</b></div>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-slate-500 dark:text-neutral-400">
                {target.payments.map(t => <div key={t.id} className="flex justify-between gap-3"><span className="truncate">{shortDate(t.date)} · {t.description}</span><span>{money(Math.abs(t.amountGBP || 0))}</span></div>)}
              </div>
              <label className="block mt-3 text-[12px] text-slate-500 dark:text-neutral-400">Move {n === 1 ? 'it' : 'them'} to</label>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-[10px] border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-[16px] sm:text-[13px] text-slate-900 dark:text-neutral-100 outline-none">
                {options.map(({ c, s }) => <option key={`${c.id}-${s}`} value={`${c.id}\u0001${s}`}>{getCategoryEmoji ? `${getCategoryEmoji(c.id)} ` : ''}{c.name}{s ? ` › ${s}` : ''}</option>)}
              </select>
              <p className="mt-1.5 text-[11.5px] text-slate-400">Nothing is lost: the payments just move.</p>
            </div>
          )}

          <p className="mt-4 text-[12.5px] text-slate-700 dark:text-neutral-200">To confirm, type <b className="tracking-wider">DELETE</b> below.</p>
          <div className="relative mt-1.5">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type DELETE"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={`w-full h-11 px-3.5 rounded-xl border-[1.5px] bg-white dark:bg-neutral-900 text-[16px] font-semibold tracking-wider text-slate-900 dark:text-neutral-100 placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 outline-none ${ok ? 'border-rose-500' : typed ? 'border-rose-300' : 'border-slate-300 dark:border-neutral-600'}`}
            />
            {ok && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-rose-600">✓</span>}
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className={`${btn} bg-slate-100 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200`}>Cancel</button>
            <button onClick={() => setStep(2)} disabled={!ok || (n > 0 && !moveTo)} className={`${btn} text-white transition-colors ${ok ? 'bg-rose-600 hover:bg-rose-700' : 'bg-rose-200 dark:bg-rose-900/50'}`}>Continue</button>
          </div>
        </div>
      ) : (
        <div>
          <span className={iconBox}><WarnIcon /></span>
          <h3 className="mt-3 text-[18px] font-bold text-slate-900 dark:text-neutral-100">Last check</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-neutral-300">
            You're about to delete <b>{name}</b>{target.kind === 'category' && target.category.subcategories.length ? ` and its ${target.category.subcategories.length} ${target.category.subcategories.length === 1 ? 'subcategory' : 'subcategories'}` : ''}{target.kind === 'subcategory' ? ` from ${target.category.name}` : ''}.
            {n > 0 && <><br />{n} {n === 1 ? 'payment' : 'payments'} ({money(total)}) move to <b>{moveLabel}</b>.</>}
          </p>
          <button
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}
            className="relative mt-4 w-full h-12 rounded-xl bg-rose-600 text-white text-[14px] font-semibold overflow-hidden select-none touch-none"
          >
            <span className="absolute inset-y-0 left-0 bg-rose-800" style={{ width: `${hold * 100}%` }} />
            <span className="relative">{hold > 0 ? 'Keep holding…' : `Hold to delete ${name}`}</span>
          </button>
          <p className="mt-1.5 text-center text-[11.5px] text-slate-400">Press and hold for 2 seconds. Let go to stop.</p>
          <button onClick={onClose} className="mt-3 w-full h-11 rounded-xl bg-slate-100 dark:bg-neutral-700 text-[14px] font-semibold text-slate-700 dark:text-neutral-200">Keep it</button>
        </div>
      )}
    </AnimatedModal>
  );
};

export default SafeDeleteModal;
