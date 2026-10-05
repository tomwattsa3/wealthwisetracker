import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Transaction } from '../types';
import Sheet from './Sheet';
import { useBackClose } from '../lib/backStack';
import { MODAL_TRANSITION, SHEET_SPRING } from '../lib/motion';
import { MONTHS, FULL_MONTHS, monthKey, keyToIndex, merchantKey } from '../lib/periods';

// Tapping a place in Top places opens this — laid out like a transaction's pop-up, with month
// bars for the year (tap one to see just that month) and every payment there. Phones get a
// bottom sheet; desktop (`side`) gets a panel sliding in from the right, like Category Sheets.

// Initial-badge tints, in rank order (shared by every Top places list).
export const PLACE_TINTS = [
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
];

export interface PlacePick {
  key: string;          // merchant key, grouped the same way Top places groups them
  name: string;
  catName: string;
  catId: string;
  tint: string;         // badge colours from the Top places row
  year: number;
  month: number | null; // month index (year * 12 + m) to start on, or null for the whole year
  income?: boolean;     // a source of money in (its payments in), rather than a place you spend
}

interface PlaceSheetProps {
  place: PlacePick | null;
  onClose: () => void;
  transactions: Transaction[];
  currency: 'GBP' | 'AED';
  getCategoryEmoji?: (categoryId: string) => string;
  firstIdx: number;
  lastIdx: number;
  side?: boolean; // desktop: slide in from the right instead of up from the bottom
}

const Body: React.FC<Omit<PlaceSheetProps, 'place' | 'onClose' | 'firstIdx' | 'lastIdx' | 'side'> & { place: PlacePick; onClose?: () => void }> = ({ place, transactions, currency, getCategoryEmoji, onClose }) => {
  const amt = (t: Transaction) => Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED) || 0;
  const sym = currency === 'GBP' ? '£' : 'AED ';
  const fmt = (v: number) => sym + Math.round(v).toLocaleString('en-GB');
  const fmt2 = (v: number) => sym + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Every visit to this place (same rule as Top places: money out, not excluded, has a category).
  const visits = useMemo(() => transactions
    .filter(t => !t.excluded && /^\d{4}-\d{2}-\d{2}/.test(t.date) && t.type === (place.income ? 'INCOME' : 'EXPENSE') && t.categoryName && t.categoryName.trim().toLowerCase() !== 'excluded' && amt(t) > 0)
    .filter(t => { const d = (t.description || 'Unknown').trim(); return (merchantKey(d) || d.toLowerCase()) === place.key; })
    .map(t => ({ t, idx: keyToIndex(monthKey(t.date)), a: amt(t) }))
    .sort((a, b) => b.t.date.localeCompare(a.t.date)), [transactions, currency, place.key, place.income]);

  const [year, setYear] = useState(place.year);
  const [month, setMonth] = useState<number | null>(place.month);
  const years = useMemo(() => Array.from(new Set(visits.map(v => Math.floor(v.idx / 12)))).sort(), [visits]);
  const canPrev = years.some(y => y < year);
  const canNext = years.some(y => y > year);
  const stepYear = (dir: -1 | 1) => {
    const next = dir < 0 ? Math.max(...years.filter(y => y < year)) : Math.min(...years.filter(y => y > year));
    setYear(next);
    setMonth(null);
  };

  // Months shown: Jan up to this month for the current year (like Home), the whole year otherwise.
  const now = new Date();
  const thisIdx = now.getFullYear() * 12 + now.getMonth();
  const lastMonth = year * 12 + 11 <= thisIdx ? 11 : Math.max(thisIdx - year * 12, 0);
  const cols = Array.from({ length: lastMonth + 1 }, (_, m) => {
    const i = year * 12 + m;
    const list = visits.filter(v => v.idx === i);
    return { i, total: list.reduce((s, v) => s + v.a, 0), count: list.length };
  });
  const max = Math.max(...cols.map(c => c.total), 1);
  const active = cols.filter(c => c.count > 0);
  const avgMonth = active.length ? active.reduce((s, c) => s + c.total, 0) / active.length : 0;

  const shown = visits.filter(v => (month === null ? Math.floor(v.idx / 12) === year : v.idx === month));
  const total = shown.reduce((s, v) => s + v.a, 0);
  const periodLabel = month === null ? String(year) : `${MONTHS[month % 12]} ${year}`;
  const toggle = (i: number) => setMonth(m => (m === i ? null : i));
  // Ten payments at first, more on request (back to ten when the period changes).
  const PAGE = 10;
  const [listShown, setListShown] = useState(PAGE);
  useEffect(() => setListShown(PAGE), [year, month]);
  // The list keeps room for the most it ever shows for this place (up to ten rows, plus the
  // Show more button if any year has more), so the sheet stays the same height when you switch
  // between the whole year and a single month.
  const ROW_H = 37, MORE_H = 46;
  const perYear = years.map(y => visits.filter(v => Math.floor(v.idx / 12) === y).length);
  const listReserve = Math.min(PAGE, Math.max(1, ...perYear)) * ROW_H + (perYear.some(n => n > PAGE) ? MORE_H : 0);
  const shortName = place.name.length > 22 ? `${place.name.slice(0, 20).trim()}…` : place.name;
  const thisYear = now.getFullYear();
  const day = (d: string) => {
    const dt = new Date(`${d.slice(0, 10)}T12:00:00`);
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]}${dt.getFullYear() !== thisYear ? ` '${String(dt.getFullYear()).slice(2)}` : ''}`;
  };

  return (
    <>
      {/* Header, like a transaction's pop-up: badge, name, and the total for the period */}
      <div className={`shrink-0 px-5 ${onClose ? 'pt-5' : 'pt-1'} pb-3 flex items-center gap-3`}>
        <span className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold ${place.tint}`}>
          {place.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '•'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-neutral-100 leading-tight truncate">{place.name}</h2>
          <p className="text-[12.5px] text-slate-500 dark:text-neutral-400 truncate">{(getCategoryEmoji && place.catId && getCategoryEmoji(place.catId)) || ''} {place.catName}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-[22px] leading-none font-bold ${place.income ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-neutral-100'}`}>{place.income ? '+' : ''}{fmt2(total)}</div>
          <div className="mt-1 text-[11.5px] text-slate-500 dark:text-neutral-400">{periodLabel}</div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 self-start rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center"><X size={15} /></button>
        )}
      </div>

      {/* Month bars: tap one to see just that month, tap it again for the whole year */}
      <div className="shrink-0 px-5 pt-2 pb-3 border-t border-slate-100 dark:border-neutral-700">
        <div className="flex items-center justify-between h-8">
          <div className="flex items-center -ml-2">
            <button onClick={() => stepYear(-1)} disabled={!canPrev} aria-label="Previous year" className="w-8 h-8 relative after:absolute after:-inset-1.5 after:content-[''] rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-25">‹</button>
            <span className="text-[13px] font-semibold text-slate-900 dark:text-neutral-100">{year}</span>
            <button onClick={() => stepYear(1)} disabled={!canNext} aria-label="Next year" className="w-8 h-8 relative after:absolute after:-inset-1.5 after:content-[''] rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-25">›</button>
          </div>
          <div className="flex items-center gap-2.5">
            {active.length > 0 && (
              <span className="text-[11.5px] text-slate-500 dark:text-neutral-400 whitespace-nowrap">Avg <strong className="text-slate-800 dark:text-neutral-200">{fmt(avgMonth)}</strong> / month</span>
            )}
            {month !== null && (
              <button onClick={() => setMonth(null)} className="min-h-[32px] px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">← All {year}</button>
            )}
          </div>
        </div>
        <div className={`mt-1.5 flex items-end h-[84px] ${cols.length > 8 ? 'gap-1' : 'gap-2'}`}>
          {cols.map(c => {
            const on = month === c.i;
            return (
              <button
                key={c.i}
                onClick={() => c.count && toggle(c.i)}
                disabled={!c.count}
                aria-pressed={on}
                aria-label={`${FULL_MONTHS[c.i % 12]} ${year}: ${fmt(c.total)}, ${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
                className="flex-1 min-w-0 h-full flex flex-col justify-end gap-1.5"
              >
                <span
                  className={`block rounded-md transition-colors ${!c.total ? 'bg-slate-100 dark:bg-neutral-700' : place.income ? (on ? 'bg-emerald-600' : month === null ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-emerald-100 dark:bg-emerald-900/60') : on ? 'bg-indigo-600' : month === null ? 'bg-indigo-400 dark:bg-indigo-500' : 'bg-indigo-100 dark:bg-indigo-900/60'}`}
                  style={{ height: c.total ? Math.max(4, Math.round((c.total / max) * 60)) : 4 }}
                />
                <span className={`${cols.length > 8 ? 'text-[10px]' : 'text-[11px]'} ${on ? 'font-bold text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>{MONTHS[c.i % 12]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Every payment in the period, laid out like "Other … payments" on a transaction */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-slate-100 dark:border-neutral-700">
        <div className="shrink-0 px-5 pt-3 pb-1 flex justify-between items-baseline gap-2">
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100 truncate">{shortName} payments</h3>
          <span className="shrink-0 text-xs text-slate-500 dark:text-neutral-400">{periodLabel} <strong className="font-semibold text-slate-700 dark:text-neutral-200">{shown.length} · {fmt2(total)}</strong></span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
          <div style={{ minHeight: listReserve }}>
          {shown.slice(0, listShown).map(({ t, a }) => (
            <div key={t.id} style={{ height: ROW_H }} className="grid grid-cols-[58px_minmax(0,1fr)_auto] gap-2 items-center border-t border-slate-100 dark:border-neutral-700 text-[12.5px]">
              <span className="text-slate-500 dark:text-neutral-400">{day(t.date)}</span>
              <span className="truncate text-slate-600 dark:text-neutral-300">{(getCategoryEmoji && t.categoryId && getCategoryEmoji(t.categoryId)) || ''} {t.categoryName}{t.subcategoryName ? ` › ${t.subcategoryName}` : ''}</span>
              <span className="font-semibold text-slate-900 dark:text-neutral-100">{fmt2(a)}</span>
            </div>
          ))}
          {shown.length > listShown && (
            <button onClick={() => setListShown(n => n + PAGE)} style={{ height: MORE_H - 4 }} className="w-full mt-1 rounded-xl border border-slate-200 dark:border-neutral-600 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 active:bg-slate-50 dark:active:bg-neutral-700/40">
              Show {Math.min(PAGE, shown.length - listShown)} more <span className="font-normal text-slate-500 dark:text-neutral-400">· {shown.length - listShown} left</span>
            </button>
          )}
          {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No payments in {periodLabel}</p>}
          </div>
        </div>
      </div>
    </>
  );
};

const PlaceSheet: React.FC<PlaceSheetProps> = ({ place, side, ...rest }) => {
  // Keep the last place on screen while the sheet slides away.
  const [last, setLast] = useState<PlacePick | null>(place);
  useEffect(() => { if (place) setLast(place); }, [place]);
  const shown = place || last;
  useBackClose(!!place && !!side, rest.onClose);
  useEffect(() => {
    if (!place || !side) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') rest.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, side, rest.onClose]);

  if (side) {
    return createPortal(
      <AnimatePresence>
        {place && (
          <motion.div key="place" className="fixed inset-0 z-[100]" initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
            <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION} onClick={rest.onClose} />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={`${place.name} details`}
              className="absolute top-0 right-0 bottom-0 w-[480px] max-w-full bg-white dark:bg-neutral-800 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={SHEET_SPRING}
            >
              <Body key={`${place.key}-${place.year}-${place.month}`} place={place} transactions={rest.transactions} currency={rest.currency} getCategoryEmoji={rest.getCategoryEmoji} onClose={rest.onClose} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  }
  return (
    <Sheet open={!!place} onClose={rest.onClose} label={`${shown?.name || 'Place'} details`} heightClass="max-h-[86dvh]">
      {shown && <Body key={`${shown.key}-${shown.year}-${shown.month}`} place={shown} transactions={rest.transactions} currency={rest.currency} getCategoryEmoji={rest.getCategoryEmoji} />}
    </Sheet>
  );
};

export default PlaceSheet;
