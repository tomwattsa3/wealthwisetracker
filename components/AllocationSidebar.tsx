
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
      const txAmount = currency === 'GBP' ? t.amountGBP : t.amountAED;
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

  const incomeTotal = incomeTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);

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
      const txAmount = currency === 'GBP' ? t.amountGBP : t.amountAED;
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

  const excludedTotal = excludedTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Income Card — expense-sheet style, fixed height to match expense cards */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-[420px]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">💰</span>
              <span className="text-sm font-bold text-slate-900">Income</span>
            </div>
            <span className="text-sm font-bold text-slate-900">{formatCurrency(incomeTotal)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-slate-400">📋 INCOME SHEET</span>
          </div>
        </div>

        {/* 3-Column Grid: Merchant | Qty | Amount */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {groupedIncome.length > 0 ? (
            <div>
              <div className="grid grid-cols-[1fr_32px_80px] bg-slate-100 border-b border-dashed border-slate-200/80 sticky top-0 z-10">
                <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Merchant</div>
                <div className="px-1 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-dashed border-slate-200/80">Qty</div>
                <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
              </div>

              {groupedIncome.map((t, idx) => (
                <div key={t.id} className={`grid grid-cols-[1fr_32px_80px] items-center border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <div className="px-3 py-3 min-w-0 flex items-center justify-between gap-1.5 border-r border-dashed border-slate-200/80">
                    <span className="text-[11px] font-medium text-slate-700 truncate" title={t.description}>{t.description || "Unknown"}</span>
                    {t.subcategoryName && (
                      <span className="px-1.5 py-px bg-slate-50 border border-slate-200 rounded-md text-[8px] font-medium text-slate-500 shrink-0 leading-tight">{t.subcategoryName}</span>
                    )}
                  </div>
                  <div className="px-1 py-3 text-center border-r border-dashed border-slate-200/80">
                    <span className="text-[10px] text-slate-400">{t.count > 1 ? t.count : ''}</span>
                  </div>
                  <div className="px-3 py-3 text-right">
                    <span className="text-[11px] font-semibold text-emerald-700">{formatCurrency(t.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs">No income transactions</div>
          )}
        </div>
      </div>

      {/* Spend by Category */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 overflow-hidden">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Spend by Category</h3>
        <div className="space-y-4 max-h-[320px] overflow-y-auto custom-scrollbar">
          {expenseData.slice(0, 6).map(item => {
            const percentage = totalExpenses > 0 ? (item.total / totalExpenses) * 100 : 0;
            return (
              <div key={item.category.id} className="py-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{getCategoryEmoji(item.category.id)}</span>
                    <span className="text-xs font-medium text-slate-700">{item.category.name}</span>
                    {item.transactions && item.transactions.length > 0 && (
                      <span className="text-[9px] text-slate-400 font-medium">{item.transactions.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{percentage.toFixed(1)}%</span>
                    <span className="text-xs font-semibold text-slate-900">{formatCurrency(item.total)}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
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

      {/* Excluded Transactions */}
      {groupedExcluded.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚫</span>
                <span className="text-sm font-bold text-slate-900">Excluded</span>
              </div>
              <span className="text-sm font-bold text-slate-400">{formatCurrency(excludedTotal)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-slate-400">{excludedTransactions.length} transactions</span>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-[1fr_32px_80px] bg-slate-100 border-b border-dashed border-slate-200/80 sticky top-0 z-10">
              <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Merchant</div>
              <div className="px-1 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-dashed border-slate-200/80">Qty</div>
              <div className="px-3 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
            </div>

            {groupedExcluded.map((t, idx) => (
              <div key={t.id} className={`grid grid-cols-[1fr_32px_80px] items-center border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                <div className="px-3 py-3 min-w-0 border-r border-dashed border-slate-200/80">
                  <span className="text-[11px] font-medium text-slate-500 truncate block" title={t.description}>{t.description || "Unknown"}</span>
                </div>
                <div className="px-1 py-3 text-center border-r border-dashed border-slate-200/80">
                  <span className="text-[10px] text-slate-400">{t.count > 1 ? t.count : ''}</span>
                </div>
                <div className="px-3 py-3 text-right">
                  <span className="text-[11px] font-semibold text-slate-400">{formatCurrency(t.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AllocationSidebar;
