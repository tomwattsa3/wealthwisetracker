
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { ShoppingBag, ChevronDown } from 'lucide-react';

interface CategoryTrendWidgetProps {
  categoryId: string;
  onCategoryChange: (newId: string) => void;
  allCategories: Category[];
  transactions: Transaction[];
}

const CategoryTrendWidget: React.FC<CategoryTrendWidgetProps> = ({ 
  categoryId, 
  onCategoryChange, 
  allCategories, 
  transactions
}) => {
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
          const existing = groups.get(t.description);
          if (existing) {
              existing.amount += t.amount;
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
                  amount: t.amount,
                  count: 1,
                  date: t.date
              });
          }
      });

      // Sort by Total Amount Descending
      return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions]);

  // Handle case where no categories exist yet
  if (!category) {
    return (
      <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm flex flex-col h-[420px] items-center justify-center p-6 text-center">
         <p className="text-slate-400 text-sm font-medium">Category not found</p>
      </div>
    );
  }

  const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Spreadsheet Grid Template: Retailer | Subcategory | Amount
  const gridTemplate = "grid-cols-[1.5fr_1fr_90px]";

  return (
    <div className="bg-white rounded-[10px] border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] flex flex-col h-[420px] overflow-hidden hover:shadow-md transition-all duration-300">
      
      {/* Header - Colored Background */}
      <div 
        className="px-4 py-3 border-b border-white/10 flex justify-between items-center sticky top-0 z-20 transition-colors duration-300"
        style={{ backgroundColor: category.color }}
      >
          <div className="flex items-center gap-3">
             {/* Category Selector - Minimal */}
              <div className="relative group z-10">
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm"></div>
                    <h3 className="text-sm font-bold text-white hover:text-white/90 transition-colors">{category.name}</h3>
                    <ChevronDown size={12} className="text-white/70" />
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

          {/* Total Amount Pill - Cleaner Style */}
          <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
               <div className="flex items-center">
                   <span className="text-xs font-bold text-slate-900 select-none">£</span>
                   <span className="text-sm font-bold font-mono text-slate-900">
                     {totalAmount.toLocaleString()}
                   </span>
               </div>
          </div>
      </div>

      {/* Subfilter - Simple toolbar */}
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between z-10">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transactions</span>
             <div className="relative">
                  <select 
                      value={subFilter}
                      onChange={(e) => setSubFilter(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-500 outline-none pr-4 cursor-pointer hover:text-slate-800 transition-colors"
                  >
                      <option value="all">All Subcategories</option>
                      {category.subcategories.map(s => (
                      <option key={s} value={s}>{s}</option>
                      ))}
                  </select>
              </div>
      </div>

      {/* Spreadsheet Header */}
      <div className={`grid ${gridTemplate} bg-slate-100 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider z-10`}>
          <div className="px-3 py-2 border-r border-slate-200/60">Retailer</div>
          <div className="px-3 py-2 border-r border-slate-200/60">Subcategory</div>
          <div className="px-3 py-2 text-right">Amount</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
        {groupedTransactions.length > 0 ? (
          <div> 
            {groupedTransactions.map((t, index) => (
              <div 
                key={t.id} 
                className={`grid ${gridTemplate} border-b border-slate-100 items-stretch text-xs group transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
              >
                 <div className="px-3 py-2.5 border-r border-slate-200/60 flex items-center justify-between min-w-0">
                    <span className="font-semibold text-slate-700 truncate mr-2" title={t.description}>{t.description || "Unknown"}</span>
                    {t.count > 1 && (
                        <span className="shrink-0 bg-slate-50 px-1.5 py-0.5 rounded text-[9px] text-slate-400 font-medium border border-slate-200">
                            x{t.count}
                        </span>
                    )}
                 </div>

                 <div className="px-3 py-2.5 border-r border-slate-200/60 flex items-center min-w-0">
                    <span className="truncate text-slate-500 font-medium text-[10px]">{t.subcategoryName}</span>
                 </div>
                 
                 <div className="px-3 py-2.5 flex items-center justify-end gap-0.5">
                    <span className="text-slate-900 font-medium text-[10px] select-none">£</span>
                    <span className="font-semibold text-slate-600 font-mono text-xs">
                       {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                 </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
            <ShoppingBag size={24} className="opacity-20" />
            <p className="text-xs font-medium opacity-60">No activity recorded</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryTrendWidget;
