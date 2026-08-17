
import React, { useMemo } from 'react';
import { Category, Transaction } from '../types';

interface CategoryBreakdownItem {
  category: Category;
  total: number;
  transactions?: any[];
}

interface AllocationSidebarProps {
  categoryBreakdown: CategoryBreakdownItem[];
  totalExpenses: number;
  formatCurrency: (amount: number) => string;
  getCategoryEmoji: (categoryId: string) => string;
  incomeTransactions?: Transaction[];
  excludedTransactions?: Transaction[];
  currency?: 'GBP' | 'AED';
}

const AllocationSidebar: React.FC<AllocationSidebarProps> = ({
  categoryBreakdown,
  totalExpenses,
  formatCurrency,
  getCategoryEmoji,
  incomeTransactions = [],
  excludedTransactions = [],
  currency = 'GBP'
}) => {
  const expenseData = categoryBreakdown.filter(c => c.category.type === 'EXPENSE');

  // Group income transactions by merchant
  const groupedIncome = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      description: string;
      subcategoryName: string;
      amount: number;
      count: number;
      date: string;
    }>();

    incomeTransactions.forEach(t => {
      const txAmount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
      const existing = groups.get(t.description);
      if (existing) {
        existing.amount += txAmount;
        existing.count += 1;
        if (new Date(t.date) > new Date(existing.date)) {
          existing.date = t.date;
          existing.subcategoryName = t.subcategoryName;
          existing.id = t.id;
        }
      } else {
        groups.set(t.description, {
          id: t.id,
          description: t.description,
          subcategoryName: t.subcategoryName,
          amount: txAmount,
          count: 1,
          date: t.date
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  }, [incomeTransactions, currency]);

  const incomeTotal = incomeTransactions.reduce((sum, t) => sum + (Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED)), 0);

  // Group excluded transactions by merchant
  const groupedExcluded = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      description: string;
      amount: number;
      count: number;
      date: string;
    }>();

    excludedTransactions.forEach(t => {
      const txAmount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
      const existing = groups.get(t.description);
      if (existing) {
        existing.amount += txAmount;
        existing.count += 1;
        if (new Date(t.date) > new Date(existing.date)) {
          existing.date = t.date;
          existing.id = t.id;
        }
      } else {
        groups.set(t.description, {
          id: t.id,
          description: t.description,
          amount: txAmount,
          count: 1,
          date: t.date
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [excludedTransactions, currency]);

  const excludedTotal = excludedTransactions.reduce((sum, t) => sum + (Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED)), 0);

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Income Card — expense-sheet style, fixed height to match expense cards */}
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-900/40 flex flex-col overflow-hidden h-[420px]">
        {/* Header */}
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-sm shrink-0">💰</span>
              <span className="text-sm font-bold text-slate-900 dark:text-neutral-200">Income</span>
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-neutral-200">{formatCurrency(incomeTotal)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-slate-400 dark:text-neutral-500">📋 INCOME SHEET</span>
          </div>
        </div>

        {/* 3-Column Grid: Merchant | Qty | Amount */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {groupedIncome.length > 0 ? (
            <div>
              <div className="grid grid-cols-[1fr_32px_80px] bg-slate-50 dark:bg-neutral-700/50 border-b border-slate-200 dark:border-neutral-700 sticky top-0 z-10">
                <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Merchant</div>
                <div className="px-1 py-1.5 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-center">Qty</div>
                <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-right">Amount</div>
              </div>

              {groupedIncome.map((t) => (
                <div key={t.id} className="grid grid-cols-[1fr_32px_80px] items-center border-b border-slate-100 dark:border-neutral-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-neutral-700/40">
                  <div className="px-3 py-3 min-w-0 flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-medium text-slate-700 dark:text-neutral-400 truncate" title={t.description}>{t.description || "Unknown"}</span>
                    {t.subcategoryName && (
                      <span className="px-1.5 py-px bg-slate-100 dark:bg-neutral-700 rounded-full text-[8px] font-medium text-slate-500 dark:text-neutral-500 shrink-0 leading-tight">{t.subcategoryName}</span>
                    )}
                  </div>
                  <div className="px-1 py-3 text-center">
                    <span className="text-[10px] text-slate-400 dark:text-neutral-500">{t.count > 1 ? t.count : ''}</span>
                  </div>
                  <div className="px-3 py-3 text-right">
                    <span className="text-[11px] font-semibold text-emerald-700">{formatCurrency(t.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-slate-400 dark:text-neutral-500 text-xs">No income transactions</div>
          )}
        </div>
      </div>

      {/* Spend by Category */}
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-slate-100 dark:border-neutral-700 p-5 overflow-hidden">
        <h3 className="text-xs font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-3">Spend by Category</h3>
        <div className="space-y-4">
          {expenseData.map(item => {
            const percentage = totalExpenses > 0 ? (item.total / totalExpenses) * 100 : 0;
            return (
              <div key={item.category.id} className="py-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: `${item.category.color || '#94a3b8'}1A` }}
                    >
                      {getCategoryEmoji(item.category.id)}
                    </span>
                    <span className="text-xs font-medium text-slate-700 dark:text-neutral-400">{item.category.name}</span>
                    {item.transactions && item.transactions.length > 0 && (
                      <span className="text-[9px] text-slate-400 dark:text-neutral-500 font-medium">{item.transactions.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-neutral-500">{percentage.toFixed(1)}%</span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-neutral-200">{formatCurrency(item.total)}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: item.category.color
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default AllocationSidebar;
