
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { ShoppingBag, ChevronDown } from 'lucide-react';

interface CategoryTrendWidgetProps {
  categoryId: string;
  onCategoryChange: (newId: string) => void;
  allCategories: Category[];
  transactions: Transaction[];
  currency?: 'GBP' | 'AED';
}

const CategoryTrendWidget: React.FC<CategoryTrendWidgetProps> = ({
  categoryId,
  onCategoryChange,
  allCategories,
  transactions,
  currency = 'GBP'
}) => {
  // Currency formatter helper
  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `£${formatted}` : `AED ${formatted}`;
  };

  // Get amount based on currency
  const getAmount = (t: Transaction) => currency === 'GBP' ? t.amountGBP : t.amountAED;
  const [subFilter, setSubFilter] = useState('all');

  const category = useMemo(() => 
    allCategories.find(c => c.id === categoryId) || allCategories[0], 
  [allCategories, categoryId]);

  // Reset subfilter when category changes
  useEffect(() => {
    setSubFilter('all');
  }, [categoryId]);

  // Filter transactions for this specific category and selected subcategory
  const filteredTransactions = useMemo(() => {
    if (!category) return [];
    return transactions.filter(t => {
      // Must match parent category
      if (t.categoryId !== category.id) return false;
      // Must match subcategory filter if set
      if (subFilter !== 'all' && t.subcategoryName !== subFilter) return false;
      return true;
    });
  }, [transactions, category, subFilter]);

  // Group transactions by Description (Retailer) and Sort by Amount Descending
  const groupedTransactions = useMemo(() => {
      const groups = new Map<string, {
          id: string; // Use latest transaction ID for key
          description: string;
          subcategoryName: string; // Use latest subcategory
          amount: number;
          count: number;
          date: string; // Latest date
      }>();

      filteredTransactions.forEach(t => {
          const txAmount = getAmount(t);
          const existing = groups.get(t.description);
          if (existing) {
              existing.amount += txAmount;
              existing.count += 1;
              // Update to latest metadata if current transaction is newer
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

      // Sort by Total Amount Descending
      return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, currency]);

  // Handle case where no categories exist yet
  if (!category) {
    return (
      <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm flex flex-col h-[420px] items-center justify-center p-6 text-center">
         <p className="text-slate-400 text-sm font-medium">Category not found</p>
      </div>
    );
  }

  const totalAmount = filteredTransactions.reduce((sum, t) => sum + getAmount(t), 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[520px] overflow-hidden">

      {/* Mercury Style Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
             {/* Category color indicator */}
             <div
               className="w-2 h-2 rounded-full shrink-0"
               style={{ backgroundColor: category.color }}
             />
             {/* Category Selector */}
             <div className="relative">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{category.name}</span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </div>
                  <select
                      value={categoryId}
                      onChange={(e) => onCategoryChange(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  >
                      {allCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
              </div>
          </div>

          {/* Total Amount */}
          <span className="text-sm font-semibold text-slate-900 font-mono">
            {formatCurrency(totalAmount)}
          </span>
      </div>

      {/* Subfilter */}
      <div className="px-4 py-2 border-b border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Transactions</span>
             <select
                 value={subFilter}
                 onChange={(e) => setSubFilter(e.target.value)}
                 className="bg-transparent text-[10px] font-medium text-slate-500 outline-none cursor-pointer hover:text-slate-700 transition-colors"
             >
                 <option value="all">All</option>
                 {category.subcategories.map(s => (
                 <option key={s} value={s}>{s}</option>
                 ))}
             </select>
      </div>

      {/* List - Spreadsheet Style */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {groupedTransactions.length > 0 ? (
          <div className="md:block">
            {/* Mobile Spreadsheet Header */}
            <div className="md:hidden grid grid-cols-[1fr_auto_auto] bg-slate-50/80 border-b border-slate-200">
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-r border-slate-200">Merchant</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-slate-200 w-12">Qty</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right w-24">Amount</div>
            </div>

            {/* Desktop Spreadsheet Header */}
            <div className="hidden md:grid grid-cols-[1fr_48px_100px] bg-slate-50/80 border-b border-slate-200 sticky top-0">
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-r border-slate-200">Merchant</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-slate-200">Qty</div>
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
            </div>

            {groupedTransactions.map((t, idx) => (
              <div key={t.id}>
                {/* Mobile Spreadsheet Row */}
                <div className="md:hidden grid grid-cols-[1fr_auto_auto] items-center bg-white border-b border-dashed border-slate-300 last:border-b-0">
                  <div className="px-3 py-3 border-r border-slate-200">
                    <span className="text-sm font-medium text-slate-700 block truncate" title={t.description}>{t.description || "Unknown"}</span>
                    <span className="text-[10px] text-slate-400">{t.subcategoryName}</span>
                  </div>
                  <div className="px-3 py-3 text-center border-r border-slate-200 w-12">
                    <span className="text-sm text-slate-500">{t.count > 1 ? t.count : '-'}</span>
                  </div>
                  <div className="px-3 py-3 text-right w-24">
                    <span className="text-sm font-semibold text-slate-800">{formatCurrency(t.amount)}</span>
                  </div>
                </div>

                {/* Desktop Spreadsheet Row */}
                <div className={`hidden md:grid grid-cols-[1fr_48px_100px] items-center bg-white border-b border-dashed border-slate-300 last:border-b-0`}>
                  <div className="px-3 py-2.5 border-r border-slate-200 min-w-0 flex items-center gap-2">
                    <span className="text-[13px] font-medium text-slate-700 truncate" title={t.description}>{t.description || "Unknown"}</span>
                    <span className="px-1 py-0.5 bg-slate-100 rounded text-[8px] text-slate-400 shrink-0 leading-none">{t.subcategoryName}</span>
                  </div>
                  <div className="px-3 py-2.5 text-center border-r border-slate-200">
                    <span className="text-xs text-slate-500">{t.count > 1 ? t.count : '-'}</span>
                  </div>
                  <div className="px-3 py-2.5 text-right">
                    <span className="text-[13px] font-semibold text-slate-800">{formatCurrency(t.amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 py-8">
            <ShoppingBag size={20} className="opacity-30" />
            <p className="text-xs text-slate-400">No transactions</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryTrendWidget;
