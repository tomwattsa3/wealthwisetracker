import React, { useState } from 'react';
import { Transaction } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CategorySectionProps {
  title: string;
  color: string;
  transactions: Transaction[];
  total: number;
  onDelete: (id: string) => void;
  type?: 'INCOME' | 'EXPENSE';
}

const CategorySection: React.FC<CategorySectionProps> = ({ 
  title, 
  color, 
  transactions, 
  total,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Group by subcategory
  const subcategories = transactions.reduce((acc, curr) => {
    acc[curr.subcategoryName] = (acc[curr.subcategoryName] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

  const formattedTotal = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(total);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 overflow-hidden transition-all hover:border-slate-300 shadow-sm">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: color }}></div>
          <div className="text-left">
            <h3 className="font-bold text-slate-800 dark:text-neutral-300 text-sm">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-neutral-500 mt-0.5 font-medium">{transactions.length} transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-900 dark:text-neutral-200 font-mono">{formattedTotal}</span>
          {isExpanded ? <ChevronUp size={16} className="text-slate-400 dark:text-neutral-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-neutral-500" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 bg-slate-50/50 dark:bg-neutral-700/50">
          <div className="h-px bg-slate-100 dark:bg-neutral-700 w-full mb-4"></div>
          <div className="space-y-2">
            {Object.entries(subcategories).map(([subName, subTotal]) => (
              <div key={subName} className="flex justify-between items-center text-sm group">
                <span className="text-slate-600 dark:text-neutral-500 font-medium flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                  {subName}
                </span>
                <span className="text-slate-900 dark:text-neutral-200 font-bold font-mono text-xs">
                  £{(subTotal as number).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySection;