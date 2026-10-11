import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category } from '../types';
import { MONTHS, localToday } from '../lib/periods';
import { AskSearch, AskAnswer, runSearch, buildVocab, askAI, shortDate } from '../lib/ask';


// Desktop page: ask a question about your money in your own words. The asking and the maths
// live in lib/ask.ts (shared with search).

interface AskPageProps {
  transactions: Transaction[];
  categories: Category[];
  currency: 'GBP' | 'AED';
  onOpenTransactions?: (o: { search: string; start: string; end: string; categoryId: string | null }) => void;
  // A question typed into ⌘K search: asked straight away
  initialQuestion?: { q: string; n: number } | null;
  onInitialQuestionUsed?: () => void;
}

const AskPage: React.FC<AskPageProps> = ({ transactions, categories, currency, onOpenTransactions, initialQuestion, onInitialQuestionUsed }) => {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<(AskAnswer & { question: string }) | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('askRecent') || '[]'); } catch { return []; } });
  const inputRef = useRef<HTMLInputElement>(null);
  const fmt2 = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // The names the AI may search by (no amounts or dates leave the app)
  const vocab = useMemo(() => buildVocab(transactions, categories), [transactions, categories]);

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
      const res = await askAI(text, vocab);
      if ('error' in res) { setError(res.error); return; }
      const s: AskSearch = res.search;
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

  useEffect(() => { if (initialQuestion?.q) { void ask(initialQuestion.q); onInitialQuestionUsed?.(); } }, [initialQuestion?.n]); // eslint-disable-line react-hooks/exhaustive-deps

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
