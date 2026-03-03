import React from 'react';
import { Category } from '../types';

interface SummaryRow {
  category: Category;
  count: number;
  total: number;
}

interface SummaryTableProps {
  summaryData: SummaryRow[];
  totalExpenses: number;
}

const SummaryTable: React.FC<SummaryTableProps> = ({ summaryData, totalExpenses }) => {
  // Sort by total amount descending
  const sortedData = [...summaryData].sort((a, b) => b.total - a.total);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-slate-200 dark:border-neutral-600 overflow-hidden">
      <div className="bg-slate-900 dark:bg-neutral-600 px-4 py-3 flex justify-between items-center">
        <h3 className="text-white font-semibold text-sm">Total Monthly Summary</h3>
      </div>
      
      {/* Grand Total Header Row */}
      <div className="bg-rose-600 px-4 py-2 flex justify-between items-center text-white">
        <span className="text-xs font-bold uppercase">Expenses</span>
        <span className="font-bold text-sm">
          {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(totalExpenses)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 dark:bg-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-center">Count</th>
              <th className="px-4 py-2 text-right">GBP (Est)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-700">
            {sortedData.map((row) => (
              <tr key={row.category.id} className="hover:bg-slate-50 dark:hover:bg-neutral-700">
                <td className="px-4 py-2 text-slate-700 dark:text-neutral-400 font-medium">
                  {row.category.name}
                </td>
                <td className="px-4 py-2 text-center text-slate-500 dark:text-neutral-500">
                  {row.count}
                </td>
                <td className="px-4 py-2 text-right text-slate-900 dark:text-neutral-200 font-medium">
                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(row.total)}
                </td>
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-slate-400 dark:text-neutral-500 text-xs">
                  No expenses recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SummaryTable;