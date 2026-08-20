
import React, { useMemo, useState } from 'react';
import { Category, Transaction } from '../types';
import { Check, ChevronDown, Repeat } from 'lucide-react';

interface RecurringPaymentsProps {
  transactions: Transaction[];
  categories: Category[];
}

// Categories that are inherently variable day-to-day spending — even if you happen to buy the
// same amount of groceries on a suspiciously regular schedule, it's not a bill. Pre-ticked by
// default; adjustable in the UI since only you know which of your own categories are genuinely
// fixed costs (e.g. a gym membership under "Health & Wellness" should stay eligible).
const DEFAULT_EXCLUDED_KEYWORDS = ['food', 'grocer'];

type Cycle = 'Weekly' | 'Monthly' | 'Yearly' | null;

interface MerchantGroup {
  name: string;
  count: number;
  amounts: number[];
  dates: string[];
  amtMean: number;
  amtCV: number;
  gapMean: number;
  gapCV: number;
  cycle: Cycle;
  algoRecurring: boolean;
}

// Flags a merchant as recurring only when BOTH the amount and the gap between charges are
// consistent — not just how often it shows up. A merchant you just happen to use a lot (rides,
// marketplace orders, food delivery) has irregular amounts and irregular timing; a real bill or
// subscription charges the same amount on a predictable cycle.
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr: number[]) => { const m = mean(arr); return Math.sqrt(mean(arr.map(x => (x - m) ** 2))); };

const cycleFor = (avgGap: number): Cycle => {
  if (avgGap >= 5 && avgGap <= 9) return 'Weekly';
  if (avgGap >= 25 && avgGap <= 35) return 'Monthly';
  if (avgGap >= 350 && avgGap <= 380) return 'Yearly';
  return null;
};

const monthlyEstimate = (g: MerchantGroup) => {
  if (g.cycle === 'Monthly') return g.amtMean;
  if (g.cycle === 'Weekly') return g.amtMean * 4.33;
  if (g.cycle === 'Yearly') return g.amtMean / 12;
  return g.amtMean; // manually-included with no detected cycle — just show the average charge
};

const spreadDots = (values: number[]) => {
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => ((v - min) / range) * 96 + 2);
};

const RecurringPayments: React.FC<RecurringPaymentsProps> = ({ transactions, categories }) => {
  // Manual overrides are kept device-local for now — tick a payment as a subscription (or untick
  // one the algorithm got wrong) and it's remembered here rather than in Supabase, since that
  // would need a new table. Only stored when it actually differs from what the algorithm would
  // say on its own, so it stays correct if more transactions come in later and change the verdict.
  const [overrides, setOverrides] = useState<Record<string, 'include' | 'exclude'>>(() => {
    try {
      const saved = localStorage.getItem('recurringOverrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const expenseCategories = useMemo(() => categories.filter(c => c.type === 'EXPENSE' && c.id !== 'excluded'), [categories]);

  const [excludedCategories, setExcludedCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('recurringExcludedCategories');
      if (saved) return JSON.parse(saved);
    } catch {
      // fall through to keyword default below
    }
    return categories
      .filter(c => DEFAULT_EXCLUDED_KEYWORDS.some(k => c.name.toLowerCase().includes(k)))
      .map(c => c.name);
  });
  const [excludeMenuOpen, setExcludeMenuOpen] = useState(false);

  const toggleExcludedCategory = (name: string) => {
    setExcludedCategories(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      localStorage.setItem('recurringExcludedCategories', JSON.stringify(next));
      return next;
    });
  };

  const groups = useMemo<MerchantGroup[]>(() => {
    const map = new Map<string, Transaction[]>();
    transactions
      .filter(t => t.type === 'EXPENSE' && !t.excluded && t.categoryId !== 'excluded' && t.description)
      .filter(t => !excludedCategories.includes(t.categoryName))
      .forEach(t => {
        const key = t.description.trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      });

    const result: MerchantGroup[] = [];
    map.forEach((txs, name) => {
      if (txs.length < 2) return;
      const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
      const amounts = sorted.map(t => Math.abs(t.amountGBP || t.amount || 0));
      const dates = sorted.map(t => t.date);
      const gaps = dates.slice(1).map((d, i) => days(dates[i], d));
      const amtMean = mean(amounts);
      const amtCV = amtMean ? stdev(amounts) / amtMean : 0;
      const gapMean = gaps.length ? mean(gaps) : 0;
      const gapCV = gapMean ? stdev(gaps) / gapMean : Infinity;
      const cycle = gaps.length ? cycleFor(gapMean) : null;
      const algoRecurring = sorted.length >= 3 && amtCV < 0.15 && gapCV < 0.25 && cycle !== null;
      result.push({ name, count: sorted.length, amounts, dates, amtMean, amtCV, gapMean, gapCV, cycle, algoRecurring });
    });

    return result.sort((a, b) => b.amtMean - a.amtMean);
  }, [transactions, excludedCategories]);

  const finalStatus = (g: MerchantGroup) => {
    const override = overrides[g.name];
    if (override === 'include') return true;
    if (override === 'exclude') return false;
    return g.algoRecurring;
  };

  const handleToggle = (g: MerchantGroup) => {
    const next = !finalStatus(g);
    setOverrides(prev => {
      const updated = { ...prev };
      // Only remember the override when it actually differs from the algorithm's own verdict —
      // toggling back to what the algorithm would say anyway just clears it.
      if (next === g.algoRecurring) {
        delete updated[g.name];
      } else {
        updated[g.name] = next ? 'include' : 'exclude';
      }
      localStorage.setItem('recurringOverrides', JSON.stringify(updated));
      return updated;
    });
  };

  const recurring = groups.filter(finalStatus);
  const notRecurring = groups.filter(g => !finalStatus(g));
  const totalMonthly = recurring.reduce((sum, g) => sum + monthlyEstimate(g), 0);

  const formatAmount = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="pb-20 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-neutral-200 flex items-center gap-2">
            <Repeat size={20} className="text-[#635bff]" />
            Recurring
          </h1>
          <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1 max-w-md">
            Flagged automatically when a merchant's amount and billing interval are both consistent — tick any payment below to override it.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setExcludeMenuOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-neutral-400 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 active:scale-95 transition-colors"
          >
            Excluded categories
            {excludedCategories.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-700 text-[10px]">{excludedCategories.length}</span>
            )}
            <ChevronDown size={14} className={`transition-transform ${excludeMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {excludeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExcludeMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 max-h-72 overflow-y-auto bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl shadow-lg z-20 p-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                  Never flag as recurring
                </p>
                {expenseCategories.map(c => {
                  const checked = excludedCategories.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleExcludedCategory(c.name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 text-left"
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-neutral-600 text-transparent'}`}>
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-slate-200 dark:border-neutral-700 p-2.5 md:p-5">
          <span className="text-[8px] md:text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Merchants</span>
          <p className="text-sm md:text-3xl font-bold text-slate-900 dark:text-neutral-200 mt-1 md:mt-2">{groups.length}</p>
        </div>
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-slate-200 dark:border-neutral-700 p-2.5 md:p-5">
          <span className="text-[8px] md:text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Recurring</span>
          <p className="text-sm md:text-3xl font-bold text-emerald-600 mt-1 md:mt-2">{recurring.length}</p>
        </div>
        <div className="bg-[#635bff] rounded-2xl p-2.5 md:p-5">
          <span className="text-[8px] md:text-[10px] font-semibold text-white/70 uppercase tracking-wider">Est/mo</span>
          <p className="text-sm md:text-3xl font-bold text-white mt-1 md:mt-2 font-numeric tabular-nums truncate">{formatAmount(totalMonthly)}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-neutral-200 mb-2">
          Recurring <span className="text-slate-400 dark:text-neutral-500 font-medium">({recurring.length})</span>
        </h2>
        <div className="space-y-2">
          {recurring.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-neutral-500 py-4">Nothing flagged yet — tick a payment below if you know it's a subscription.</p>
          )}
          {recurring.map(g => (
            <RecurringRow key={g.name} g={g} isOn={true} onToggle={() => handleToggle(g)} formatAmount={formatAmount} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-neutral-200 mb-2">
          Not recurring <span className="text-slate-400 dark:text-neutral-500 font-medium">({notRecurring.length})</span>
        </h2>
        <div className="space-y-2">
          {notRecurring.map(g => (
            <RecurringRow key={g.name} g={g} isOn={false} onToggle={() => handleToggle(g)} formatAmount={formatAmount} />
          ))}
          {notRecurring.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-neutral-500 py-4">Nothing here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const RecurringRow: React.FC<{
  g: MerchantGroup;
  isOn: boolean;
  onToggle: () => void;
  formatAmount: (n: number) => string;
}> = ({ g, isOn, onToggle, formatAmount }) => {
  const amountDots = spreadDots(g.amounts);
  const gapVals = g.dates.slice(1).map((d, i) => days(g.dates[i], d));
  const gapDots = gapVals.length ? spreadDots(gapVals) : [];

  return (
    <div className={`bg-white dark:bg-neutral-800 rounded-2xl border p-3.5 md:p-4 transition-colors ${isOn ? 'border-emerald-200 dark:border-emerald-900' : 'border-slate-200 dark:border-neutral-700'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-neutral-200 truncate">{g.name}</span>
            {isOn && g.cycle && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">{g.cycle}</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-0.5">{g.count} transactions</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900 dark:text-neutral-200 tabular-nums font-numeric">{formatAmount(g.amtMean)}</p>
            <p className="text-[10px] text-slate-400 dark:text-neutral-500">avg per charge</p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            title={isOn ? 'Mark as not a subscription' : 'Mark as a subscription'}
            className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 active:scale-95 ${isOn ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-neutral-600 text-transparent hover:border-slate-400 dark:hover:border-neutral-500'}`}
          >
            <Check size={14} strokeWidth={3} />
          </button>
        </div>
      </div>

      {g.count >= 2 && (
        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-neutral-700">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1.5">Amount consistency</p>
            <div className="relative h-4 bg-slate-100 dark:bg-neutral-700 rounded-md overflow-hidden">
              {amountDots.map((left, i) => (
                <div key={i} className={`absolute top-1/2 w-1.5 h-1.5 rounded-full -translate-y-1/2 -translate-x-1/2 ${isOn ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-neutral-500'}`} style={{ left: `${left}%` }} />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1 font-numeric tabular-nums">±{(g.amtCV * 100).toFixed(0)}% variance</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1.5">Interval consistency</p>
            <div className="relative h-4 bg-slate-100 dark:bg-neutral-700 rounded-md overflow-hidden">
              {gapDots.map((left, i) => (
                <div key={i} className={`absolute top-1/2 w-1.5 h-1.5 rounded-full -translate-y-1/2 -translate-x-1/2 ${isOn ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-neutral-500'}`} style={{ left: `${left}%` }} />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1 font-numeric tabular-nums">
              {gapVals.length ? `avg ${g.gapMean.toFixed(0)}d gap, ±${(g.gapCV * 100).toFixed(0)}%` : 'n/a'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringPayments;
