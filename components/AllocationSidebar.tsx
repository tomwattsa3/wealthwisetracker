
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Category } from '../types';

interface CategoryBreakdownItem {
  category: Category;
  total: number;
}

interface AllocationSidebarProps {
  categoryBreakdown: CategoryBreakdownItem[];
  totalExpenses: number;
  formatCurrency: (amount: number) => string;
  getCategoryEmoji: (categoryId: string) => string;
}

const AllocationSidebar: React.FC<AllocationSidebarProps> = ({
  categoryBreakdown,
  totalExpenses,
  formatCurrency,
  getCategoryEmoji
}) => {
  // Only show expense categories
  const expenseData = categoryBreakdown.filter(c => c.category.type === 'EXPENSE');

  const chartData = expenseData.map(item => ({
    name: item.category.name,
    value: item.total,
    color: item.category.color,
    id: item.category.id,
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col h-full">
      {/* Donut Chart */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Allocation</h3>
        <div className="relative w-full" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total</span>
            <span className="text-lg font-bold text-slate-900">{formatCurrency(totalExpenses)}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-3">
          {chartData.map(item => (
            <div key={item.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-slate-500">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-3" />

      {/* Spend by Category */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Spend by Category</h3>
        <div className="space-y-3">
          {expenseData.map(item => {
            const percentage = totalExpenses > 0 ? (item.total / totalExpenses) * 100 : 0;
            return (
              <div key={item.category.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{getCategoryEmoji(item.category.id)}</span>
                    <span className="text-xs font-medium text-slate-700">{item.category.name}</span>
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
    </div>
  );
};

export default AllocationSidebar;
