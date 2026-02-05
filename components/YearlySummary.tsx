
import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types';
import { TrendingUp, TrendingDown, Hash, Calendar, PieChart, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

interface YearlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const YearlySummary: React.FC<YearlySummaryProps> = ({ transactions, categories }) => {
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    const sorted = Array.from(years).sort((a: number, b: number) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  }, [transactions]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0]);
  const [viewType, setViewType] = useState<'all' | 'income' | 'expense'>('all');

  const yearlyTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === selectedYear && !t.excluded;
    });
  }, [transactions, selectedYear]);

  // Monthly data
  const monthlyData = useMemo(() => {
    return MONTHS.map((month, idx) => {
      const monthTx = yearlyTransactions.filter(t => new Date(t.date).getMonth() === idx);
      const income = monthTx.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
      const expense = monthTx.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
      return { month, fullMonth: FULL_MONTHS[idx], income, expense, net: income - expense, txCount: monthTx.length };
    });
  }, [yearlyTransactions]);

  // Top categories
  const topExpenseCategories = useMemo(() => {
    const expenseTx = yearlyTransactions.filter(t => t.type === 'EXPENSE');
    const byCategory: { [key: string]: { name: string; color: string; amount: number; count: number } } = {};

    expenseTx.forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
      const catName = cat?.name || t.categoryName || 'Uncategorized';
      const catColor = cat?.color || '#94a3b8';
      const catId = cat?.id || catName;

      if (!byCategory[catId]) {
        byCategory[catId] = { name: catName, color: catColor, amount: 0, count: 0 };
      }
      byCategory[catId].amount += t.amount;
      byCategory[catId].count += 1;
    });

    return Object.values(byCategory).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [yearlyTransactions, categories]);

  const topIncomeCategories = useMemo(() => {
    const incomeTx = yearlyTransactions.filter(t => t.type === 'INCOME');
    const byCategory: { [key: string]: { name: string; color: string; amount: number; count: number } } = {};

    incomeTx.forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
      const catName = cat?.name || t.categoryName || 'Uncategorized';
      const catColor = cat?.color || '#10b981';
      const catId = cat?.id || catName;

      if (!byCategory[catId]) {
        byCategory[catId] = { name: catName, color: catColor, amount: 0, count: 0 };
      }
      byCategory[catId].amount += t.amount;
      byCategory[catId].count += 1;
    });

    return Object.values(byCategory).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [yearlyTransactions, categories]);

  // KPI calculations
  const totalIncome = yearlyTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = yearlyTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const totalTransactions = yearlyTransactions.length;
  const avgMonthlySpend = totalExpense / 12;
  const avgMonthlyIncome = totalIncome / 12;

  // Donut chart data for top categories
  const donutData = topExpenseCategories.slice(0, 4);
  const donutTotal = donutData.reduce((sum, c) => sum + c.amount, 0);

  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return `£${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `£${(amount / 1000).toFixed(0)}k`;
    return `£${amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4">
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Yearly Summary</h1>
      </div>

      {/* Filters Row */}
      <div className="px-4 md:px-8 pb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Type filters */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewType('all')}
              className={`px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-md transition-all ${
                viewType === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setViewType('income')}
              className={`px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-md transition-all ${
                viewType === 'income' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Income
            </button>
            <button
              onClick={() => setViewType('expense')}
              className={`px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-md transition-all ${
                viewType === 'expense' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Expenses
            </button>
          </div>

          {/* Right: Year selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-slate-100 border-0 rounded-lg px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px' }}
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="px-4 md:px-8 pb-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y md:divide-y-0 divide-slate-100">
            {/* Total Income */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-emerald-500" />
                <span className="text-[10px] md:text-xs font-medium text-emerald-600 uppercase tracking-wide">Total Income</span>
              </div>
              <p className="text-lg md:text-2xl font-semibold text-slate-900">{formatAmount(totalIncome)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Earnings</p>
            </div>

            {/* Total Expenses */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={14} className="text-rose-500" />
                <span className="text-[10px] md:text-xs font-medium text-rose-600 uppercase tracking-wide">Total Expenses</span>
              </div>
              <p className="text-lg md:text-2xl font-semibold text-slate-900">{formatAmount(totalExpense)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Spending</p>
            </div>

            {/* Net Balance */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={14} className={netBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                <span className={`text-[10px] md:text-xs font-medium uppercase tracking-wide ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Net Balance</span>
              </div>
              <p className={`text-lg md:text-2xl font-semibold ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netBalance >= 0 ? '+' : ''}{formatAmount(netBalance)}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{netBalance >= 0 ? 'Surplus' : 'Deficit'}</p>
            </div>

            {/* Avg Monthly Spend */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <PieChart size={14} className="text-violet-500" />
                <span className="text-[10px] md:text-xs font-medium text-violet-600 uppercase tracking-wide">Avg. Monthly</span>
              </div>
              <p className="text-lg md:text-2xl font-semibold text-slate-900">{formatAmount(avgMonthlySpend)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Per Month Spend</p>
            </div>

            {/* Transactions */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Hash size={14} className="text-blue-500" />
                <span className="text-[10px] md:text-xs font-medium text-blue-600 uppercase tracking-wide">Transactions</span>
              </div>
              <p className="text-lg md:text-2xl font-semibold text-slate-900">{totalTransactions}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Total Count</p>
            </div>

            {/* Avg Income */}
            <div className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-amber-500" />
                <span className="text-[10px] md:text-xs font-medium text-amber-600 uppercase tracking-wide">Avg. Income</span>
              </div>
              <p className="text-lg md:text-2xl font-semibold text-slate-900">{formatAmount(avgMonthlyIncome)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Per Month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Monthly Table + Top Categories */}
      <div className="px-4 md:px-8 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* Monthly Breakdown Table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Monthly Breakdown</h3>
            </div>

            {/* Table Header */}
            <div className="hidden md:grid grid-cols-5 gap-4 px-5 py-3 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <div>Month</div>
              <div className="text-right">Income</div>
              <div className="text-right">Expenses</div>
              <div className="text-right">Net</div>
              <div className="text-right">Transactions</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100 max-h-[400px] md:max-h-[500px] overflow-y-auto">
              {monthlyData.map((row, idx) => (
                <div key={idx} className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4 px-4 md:px-5 py-3 md:py-4 hover:bg-slate-50 transition-colors">
                  <div className="col-span-3 md:col-span-1">
                    <p className="font-medium text-slate-900 text-sm">{row.fullMonth}</p>
                    <p className="text-[10px] text-slate-400 md:hidden">
                      {row.txCount} transactions
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-slate-400 md:hidden mb-0.5">Income</p>
                    <p className={`text-sm font-medium ${row.income > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                      {row.income > 0 ? `+£${row.income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-slate-400 md:hidden mb-0.5">Expenses</p>
                    <p className={`text-sm font-medium ${row.expense > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                      {row.expense > 0 ? `£${row.expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-slate-400 md:hidden mb-0.5">Net</p>
                    <p className={`text-sm font-semibold ${row.net > 0 ? 'text-emerald-600' : row.net < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                      {row.income > 0 || row.expense > 0 ? (row.net >= 0 ? '+' : '') + `£${row.net.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                    </p>
                  </div>
                  <div className="hidden md:block text-right">
                    <p className="text-sm text-slate-500">{row.txCount > 0 ? row.txCount : '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Categories - Donut Chart Style */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Top Categories</h3>
            </div>

            {/* Donut Visual */}
            <div className="p-4 md:p-5 flex justify-center">
              <div className="relative w-32 h-32 md:w-40 md:h-40">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {donutData.length > 0 ? (
                    donutData.reduce((acc, cat, idx) => {
                      const percentage = (cat.amount / donutTotal) * 100;
                      const offset = acc.offset;
                      acc.segments.push(
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={cat.color}
                          strokeWidth="12"
                          strokeDasharray={`${percentage * 2.51} ${251 - percentage * 2.51}`}
                          strokeDashoffset={-offset * 2.51}
                          className="transition-all duration-500"
                        />
                      );
                      acc.offset += percentage;
                      return acc;
                    }, { segments: [] as JSX.Element[], offset: 0 }).segments
                  ) : (
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg md:text-xl font-semibold text-slate-900">{formatAmount(totalExpense)}</p>
                    <p className="text-[10px] text-slate-400">Total</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Category List */}
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-3">
              {topExpenseCategories.slice(0, 5).map((cat, idx) => {
                const percentage = totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(0) : '0';
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{cat.name}</p>
                        <p className="text-[10px] text-slate-400">{percentage}% of expenses</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                      <p className="text-[10px] text-slate-400">{cat.count} {cat.count === 1 ? 'transaction' : 'transactions'}</p>
                    </div>
                  </div>
                );
              })}
              {topExpenseCategories.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No expenses recorded</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Cards: Top Expenses & Top Income */}
      <div className="px-4 md:px-8 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

          {/* Highest Expenses */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Highest Expenses</h3>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">TOP 5</span>
            </div>

            {/* Header */}
            <div className="grid grid-cols-3 gap-4 px-4 md:px-5 py-2 bg-slate-50 text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <div>Category</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Share</div>
            </div>

            <div className="divide-y divide-slate-100">
              {topExpenseCategories.map((cat, idx) => {
                const percentage = totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} className="grid grid-cols-3 gap-4 px-4 md:px-5 py-3 md:py-4 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{cat.name}</p>
                      <p className="text-[10px] text-slate-400">{cat.count} transactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-rose-600">{percentage}%</p>
                    </div>
                  </div>
                );
              })}
              {topExpenseCategories.length === 0 && (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">No expenses recorded</div>
              )}
            </div>
          </div>

          {/* Top Income Sources */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Income Sources</h3>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">TOP 5</span>
            </div>

            {/* Header */}
            <div className="grid grid-cols-3 gap-4 px-4 md:px-5 py-2 bg-slate-50 text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <div>Category</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Share</div>
            </div>

            <div className="divide-y divide-slate-100">
              {topIncomeCategories.map((cat, idx) => {
                const percentage = totalIncome > 0 ? ((cat.amount / totalIncome) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} className="grid grid-cols-3 gap-4 px-4 md:px-5 py-3 md:py-4 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{cat.name}</p>
                      <p className="text-[10px] text-slate-400">{cat.count} transactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-600">+£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-600">{percentage}%</p>
                    </div>
                  </div>
                );
              })}
              {topIncomeCategories.length === 0 && (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">No income recorded</div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default YearlySummary;
