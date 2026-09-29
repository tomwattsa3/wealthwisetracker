import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { Transaction, Bank, MerchantMapping } from '../types';
import { parseBankCsv, sendImportWebhook } from '../lib/csvImport';
import { MODAL_TRANSITION } from '../lib/motion';

// Import CSV pop-up: pick the bank, drop (or browse for) its statement, see what's in it, then
// hand the new rows to the existing review step. Rows already in the app (same date, merchant
// and amount) are skipped so re-importing an overlapping statement doesn't double up.

interface LatestBank { name: string; dateLabel: string; agoLabel: string; stale: boolean }

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  banks: Bank[];
  latestByBank: LatestBank[];
  merchantMappings: MerchantMapping[];
  existing: Transaction[];
  webhookUrl?: string;
  onImport: (transactions: Omit<Transaction, 'id'>[]) => void;
}

type Ready = {
  file: File;
  fresh: Omit<Transaction, 'id'>[];
  dupes: number;
  total: number;
  autoCount: number;
  range: string;
};

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const norm = (s: string) => (s || '').trim().toLowerCase();

// Each existing row can only cancel out one imported row, so two genuine identical charges on
// the same day still import if the app only has one of them.
const splitDuplicates = (incoming: Omit<Transaction, 'id'>[], existing: Transaction[]) => {
  const pool = new Map<string, { gbp: number; aed: number; used: boolean }[]>();
  existing.forEach(t => {
    const key = `${t.date}|${norm(t.description)}`;
    const list = pool.get(key) || [];
    list.push({ gbp: Math.abs(t.amountGBP || 0), aed: Math.abs(t.amountAED || 0), used: false });
    pool.set(key, list);
  });
  const fresh: Omit<Transaction, 'id'>[] = [];
  let dupes = 0;
  incoming.forEach(t => {
    const list = pool.get(`${t.date}|${norm(t.description)}`);
    const gbp = Math.abs(t.amountGBP || 0), aed = Math.abs(t.amountAED || 0);
    const match = list?.find(e => !e.used && ((gbp > 0 && Math.abs(e.gbp - gbp) < 0.015) || (aed > 0 && Math.abs(e.aed - aed) < 0.015)));
    if (match) { match.used = true; dupes++; } else fresh.push(t);
  });
  return { fresh, dupes };
};

const ImportCsvModal: React.FC<ImportCsvModalProps> = ({ open, onClose, banks, latestByBank, merchantMappings, existing, webhookUrl, onImport }) => {
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bank = banks.find(b => b.id === bankId) || banks[0];
  // Phones get a bottom sheet with a "Choose file" button (there's nothing to drag a file from).
  const sheet = useMemo(() => window.matchMedia('(max-width: 767px)').matches, [open]);
  const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [open]);

  // Start clean each time it opens; default to the bank that's most overdue for an import.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setReady(null);
    setDragging(false);
    const stalest = latestByBank[0] && banks.find(b => norm(b.name) === norm(latestByBank[0].name));
    setBankId((stalest || banks[0])?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const readFile = async (file: File, forBank: Bank | undefined = bank) => {
    setError(null);
    setReady(null);
    if (!forBank) { setError('Add a bank in Settings first.'); return; }
    if (!(file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'))) {
      setError('That isn’t a CSV file. Export your statement as .csv and try again.');
      return;
    }
    setReading(true);
    const result = await parseBankCsv(file, forBank, merchantMappings);
    setReading(false);
    if (result.error) { setError(result.error); return; }
    const { fresh, dupes } = splitDuplicates(result.transactions, existing);
    const dates = result.transactions.map(t => t.date).sort();
    setReady({
      file,
      fresh,
      dupes,
      total: result.transactions.length,
      autoCount: fresh.filter(t => t.categoryName).length,
      range: dates.length ? (dates[0] === dates[dates.length - 1] ? shortDate(dates[0]) : `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`) : '–',
    });
  };

  // Changing bank after a file is in re-reads it, since the bank sets the currency for
  // single-amount statements.
  const pickBank = (id: string) => {
    setBankId(id);
    const b = banks.find(x => x.id === id);
    if (ready && b) readFile(ready.file, b);
  };

  const doImport = () => {
    if (!ready || ready.fresh.length === 0) return;
    if (webhookUrl) {
      sendImportWebhook(webhookUrl, bank?.name || '', ready.file.name, ready.fresh).then(err => { if (err) console.error(err); });
    }
    onImport(ready.fresh);
    onClose();
  };

  const lastFor = (b: Bank) => latestByBank.find(l => norm(l.name) === norm(b.name));
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) readFile(f);
    },
  };
  const importCount = ready?.fresh.length || 0;
  const sizeLabel = useMemo(() => (ready ? `${Math.max(1, Math.round(ready.file.size / 1024))} KB` : ''), [ready]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-end md:items-center justify-center md:p-6 overflow-y-auto"
          initial={{ pointerEvents: 'auto' }}
          animate={{ pointerEvents: 'auto' }}
          exit={{ pointerEvents: 'none' }}
          {...dropHandlers}
        >
          <motion.div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Import transactions"
            className="relative w-full md:max-w-[560px] max-h-[92dvh] overflow-y-auto bg-white dark:bg-neutral-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col"
            initial={{ opacity: 0, y: sheet ? 60 : 12, scale: sheet ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: sheet ? 60 : 12, scale: sheet ? 1 : 0.98 }}
            transition={MODAL_TRANSITION}
          >
            <div className="px-6 pt-5 pb-4 flex justify-between items-start gap-4">
              {sheet && <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-300 dark:bg-neutral-600" />}
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100">Import transactions</h2>
                <p className="text-[13px] text-slate-500 dark:text-neutral-400">Upload a CSV statement exported from your bank</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 dark:border-neutral-600 text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100 flex items-center justify-center">
                <X size={15} />
              </button>
            </div>

            <div className="px-6 pb-5 flex flex-col gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-2">1 · Which bank is it from?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {banks.map(b => {
                    const on = b.id === bank?.id;
                    const last = lastFor(b);
                    return (
                      <button
                        key={b.id}
                        onClick={() => pickBank(b.id)}
                        aria-pressed={on}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-colors ${on ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600'}`}
                      >
                        <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300'}`}>{b.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100 truncate">{b.name}</span>
                            <span className="text-[10.5px] font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-700 rounded-md px-1.5">{b.currency}</span>
                          </span>
                          <span className={`block text-[11.5px] font-medium ${last?.stale ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400'}`}>
                            {last ? `Last: ${last.dateLabel.replace(/ \d{4}$/, '')} · ${last.agoLabel}` : 'Nothing imported yet'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1.5">Different bank? Add it in Settings.</p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-2">2 · Add the CSV file</p>
                <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
                {!ready ? (
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={reading}
                    className={`w-full rounded-2xl border-2 border-dashed px-5 py-8 flex flex-col items-center gap-2 transition-colors ${dragging ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/10 hover:border-indigo-400'}`}
                  >
                    <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${dragging ? 'bg-indigo-600 text-white' : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300'}`}>
                      {reading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                    </span>
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-neutral-100">
                      {reading ? 'Reading your statement…' : dragging ? 'Drop it here' : touch ? `Choose your ${bank?.name || ''} CSV` : `Drop your ${bank?.name || ''} CSV here`}
                    </span>
                    {!reading && !touch && (
                      <span className="text-[12.5px] text-slate-500 dark:text-neutral-400">
                        or <span className="text-indigo-600 dark:text-indigo-300 font-semibold underline">browse your files</span> · .csv only
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">CSV</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 dark:text-neutral-100 truncate">{ready.file.name}</span>
                        <span className="block text-xs text-slate-500 dark:text-neutral-400">{sizeLabel} · {bank?.name}</span>
                      </span>
                      <button onClick={() => setReady(null)} className="text-[13px] text-slate-500 hover:text-slate-900 dark:hover:text-neutral-100">Remove</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ['Found', `${ready.total} rows`],
                        ['Dates', ready.range],
                        ['Already in', `${ready.dupes} skipped`],
                      ].map(([l, v]) => (
                        <div key={l} className="bg-white dark:bg-neutral-800 rounded-lg px-2.5 py-2 min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">{l}</div>
                          <div className="text-[13px] font-bold text-slate-900 dark:text-neutral-100 truncate">{v}</div>
                        </div>
                      ))}
                    </div>
                    {importCount === 0 && (
                      <p className="text-xs font-medium text-slate-600 dark:text-neutral-300">Everything in this file is already in WealthWise.</p>
                    )}
                  </div>
                )}
                {error && (
                  <p className="mt-2 flex items-start gap-1.5 text-[13px] text-rose-700 dark:text-rose-400">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 pt-3.5 pb-[max(14px,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/40 flex flex-wrap md:flex-nowrap items-center gap-2.5">
              <span className="w-full md:w-auto md:flex-1 text-xs text-slate-500 dark:text-neutral-400">
                {ready && ready.autoCount > 0 ? `${ready.autoCount} will be filed automatically from memory.` : 'You can check categories before anything is saved.'}
              </span>
              <button onClick={onClose} className="flex-1 md:flex-none px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[13px] text-slate-700 dark:text-neutral-300">Cancel</button>
              <button
                onClick={doImport}
                disabled={importCount === 0}
                className="flex-[2] md:flex-none px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold disabled:bg-indigo-200 dark:disabled:bg-indigo-900/60 disabled:cursor-not-allowed"
              >
                {importCount > 0 ? `Import ${importCount} ${importCount === 1 ? 'transaction' : 'transactions'}` : 'Import'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ImportCsvModal;
