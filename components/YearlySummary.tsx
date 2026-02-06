
import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types';
import { TrendingUp, TrendingDown, PieChart, ChevronRight, Calendar, RefreshCw } from 'lucide-react';

interface YearlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
  onRefresh?: () => void;
}

interface DateRange {
  start: string;
  end: string;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Date presets
const getDatePresets = () => {
  const now = new Date();
  return {
    lastMonth: {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0],
      end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0],
      label: 'Last Month'
    },
    thisYear: {
      start: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
      end: new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0],
      label: 'This Year'
    }
  };
};

const YearlySummary: React.FC<YearlySummaryProps> = ({ transactions, categories, onRefresh }) => {
  const presets = getDatePresets();

  const [dateRange, setDateRange] = useState<DateRange>(presets.thisYear);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const toggleCategory = (key: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedCategories(newSet);
  };

  const toggleMonth = (monthIndex: number) => {
    const newSet = new Set(expandedMonths);
    if (newSet.has(monthIndex)) {
      newSet.delete(monthIndex);
    } else {
      newSet.add(monthIndex);
    }
    setExpandedMonths(newSet);
  };

  // Apply custom date range
  const applyCustomRange = () => {
    if (customStart && customEnd) {
      setDateRange({
        start: customStart,
        end: customEnd,
        label: 'Custom'
      });
      setShowCustom(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (t.excluded) return false;
      const txDate = t.date;
      return txDate >= dateRange.start && txDate <= dateRange.end;
    });
  }, [transactions, dateRange]);

  // Monthly data - group by year-month for date ranges that span multiple years
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { year: number; monthIndex: number; income: number; expense: number; txCount: number }>();

    filteredTransactions.forEach(t => {
      const d = new Date(t.date);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const key = `${year}-${monthIndex}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { year, monthIndex, income: 0, expense: 0, txCount: 0 });
      }

      const entry = monthMap.get(key)!;
      if (t.type === 'INCOME') {
        entry.income += t.amount;
      } else {
        entry.expense += t.amount;
      }
      entry.txCount += 1;
    });

    // Sort by date and return
    return Array.from(monthMap.values())
      .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex)
      .map(entry => ({
        month: MONTHS[entry.monthIndex],
        fullMonth: `${FULL_MONTHS[entry.monthIndex]} ${entry.year}`,
        monthIndex: entry.monthIndex,
        year: entry.year,
        income: entry.income,
        expense: entry.expense,
        net: entry.income - entry.expense,
        txCount: entry.txCount
      }));
  }, [filteredTransactions]);

  // Number of months in the range for average calculations
  const monthsInRange = useMemo(() => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
  }, [dateRange]);

  // Monthly category breakdown for expandable rows - now keyed by year-month
  const monthlyCategoryBreakdown = useMemo(() => {
    return monthlyData.map(row => {
      const monthTransactions = filteredTransactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === row.year && d.getMonth() === row.monthIndex;
      });
      const expenseByCategory: { [key: string]: {
        id: string;
        name: string;
        color: string;
        amount: number;
        count: number;
        subcategories: { name: string; amount: number; count: number }[];
      } } = {};

      monthTransactions.filter(t => t.type === 'EXPENSE').forEach(t => {
        const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
        const catName = cat?.name || t.categoryName || 'Uncategorized';
        const catColor = cat?.color || '#94a3b8';
        const catId = cat?.id || catName;

        if (!expenseByCategory[catId]) {
          expenseByCategory[catId] = { id: catId, name: catName, color: catColor, amount: 0, count: 0, subcategories: [] };
        }
        expenseByCategory[catId].amount += t.amount;
        expenseByCategory[catId].count += 1;

        // Track subcategories
        const subName = t.subcategoryName || 'Other';
        const existingSub = expenseByCategory[catId].subcategories.find(s => s.name === subName);
        if (existingSub) {
          existingSub.amount += t.amount;
          existingSub.count += 1;
        } else {
          expenseByCategory[catId].subcategories.push({ name: subName, amount: t.amount, count: 1 });
        }
      });

      // Sort subcategories by amount
      Object.values(expenseByCategory).forEach(cat => {
        cat.subcategories.sort((a, b) => b.amount - a.amount);
      });

      return Object.values(expenseByCategory).sort((a, b) => b.amount - a.amount);
    });
  }, [filteredTransactions, categories, monthlyData]);

  // Top categories
  const topExpenseCategories = useMemo(() => {
    const expenseTx = filteredTransactions.filter(t => t.type === 'EXPENSE');
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
  }, [filteredTransactions, categories]);

  const topIncomeCategories = useMemo(() => {
    const incomeTx = filteredTransactions.filter(t => t.type === 'INCOME');
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
  }, [filteredTransactions, categories]);

  // KPI calculations
  const totalIncome = filteredTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const totalTransactions = filteredTransactions.length;
  const avgMonthlySpend = totalExpense / monthsInRange;
  const avgMonthlyIncome = totalIncome / monthsInRange;

  // Donut chart data for top categories
  const donutData = topExpenseCategories.slice(0, 4);
  const donutTotal = donutData.reduce((sum, c) => sum + c.amount, 0);

  const formatAmount = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">{dateRange.label}: {new Date(dateRange.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="px-4 md:px-8 pb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 md:p-3 flex items-center justify-center">
          {/* Date Range Selector */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setDateRange(presets.lastMonth)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                dateRange.label === 'Last Month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="md:hidden">Last Mo</span>
              <span className="hidden md:inline">Last Month</span>
            </button>
            <button
              onClick={() => setDateRange(presets.thisYear)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                dateRange.label === 'This Year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="md:hidden">Year</span>
              <span className="hidden md:inline">This Year</span>
            </button>
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all flex items-center gap-0.5 ${
                dateRange.label === 'Custom' || showCustom ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar size={10} className="md:w-3 md:h-3" />
              <span>Custom</span>
            </button>
          </div>
        </div>

        {/* Custom Date Picker */}
        {showCustom && (
          <div className="mt-3 bg-slate-50 rounded-lg p-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">From:</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">To:</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700"
              />
            </div>
            <button
              onClick={applyCustomRange}
              disabled={!customStart || !customEnd}
              className="px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="px-4 md:px-8 pb-4">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {/* Total Income */}
          <div className="bg-white rounded-lg border border-slate-200 p-2.5 md:p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-[9px] md:text-[10px] font-medium text-slate-400 uppercase tracking-wide">Income</span>
            </div>
            <p className="text-base md:text-xl font-semibold text-emerald-600">{formatAmount(totalIncome)}</p>
          </div>

          {/* Total Expenses */}
          <div className="bg-white rounded-lg border border-slate-200 p-2.5 md:p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
              <span className="text-[9px] md:text-[10px] font-medium text-slate-400 uppercase tracking-wide">Expenses</span>
            </div>
            <p className="text-base md:text-xl font-semibold text-slate-900">{formatAmount(totalExpense)}</p>
          </div>

          {/* Avg Monthly Spend */}
          <div className="bg-white rounded-lg border border-slate-200 p-2.5 md:p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <span className="text-[9px] md:text-[10px] font-medium text-slate-400 uppercase tracking-wide">Avg/Mo</span>
            </div>
            <p className="text-base md:text-xl font-semibold text-slate-900">{formatAmount(avgMonthlySpend)}</p>
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
            <div className="divide-y divide-slate-100 max-h-[400px] md:max-h-[600px] overflow-y-auto">
              {monthlyData.map((row, idx) => {
                const isExpanded = expandedMonths.has(idx);
                const categoryBreakdown = monthlyCategoryBreakdown[idx];
                const hasData = row.expense > 0;

                return (
                  <div key={idx}>
                    {/* Month Row - Mobile */}
                    <button
                      onClick={() => hasData && toggleMonth(idx)}
                      className={`md:hidden w-full flex items-center justify-between px-4 py-3 transition-colors text-left ${hasData ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'} ${isExpanded ? 'bg-slate-50' : ''}`}
                      disabled={!hasData}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight size={14} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''} ${!hasData ? 'opacity-0' : ''}`} />
                        <span className="font-medium text-slate-900 text-sm">{row.fullMonth}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${row.income > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                            {row.income > 0 ? `+£${row.income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                          </p>
                          <p className="text-[9px] text-slate-400">Income</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${row.expense > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                            {row.expense > 0 ? `£${row.expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                          </p>
                          <p className="text-[9px] text-slate-400">Expenses</p>
                        </div>
                      </div>
                    </button>

                    {/* Month Row - Desktop */}
                    <button
                      onClick={() => hasData && toggleMonth(idx)}
                      className={`hidden md:grid w-full grid-cols-5 gap-4 px-5 py-4 transition-colors text-left ${hasData ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'} ${isExpanded ? 'bg-slate-50' : ''}`}
                      disabled={!hasData}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight size={14} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''} ${!hasData ? 'opacity-0' : ''}`} />
                        <p className="font-medium text-slate-900 text-sm">{row.fullMonth}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${row.income > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {row.income > 0 ? `+£${row.income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${row.expense > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                          {row.expense > 0 ? `£${row.expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${row.net > 0 ? 'text-emerald-600' : row.net < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                          {row.income > 0 || row.expense > 0 ? (row.net >= 0 ? '+' : '') + `£${row.net.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">{row.txCount > 0 ? row.txCount : '-'}</p>
                      </div>
                    </button>

                    {/* Expanded Category Breakdown */}
                    {isExpanded && hasData && (
                      <div className="bg-slate-50 border-t border-slate-100 px-4 md:px-5 py-3">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-2 ml-6">Expenses by Category</p>
                        <div className="space-y-2 ml-6">
                          {categoryBreakdown.map((cat, catIdx) => {
                            const percentage = row.expense > 0 ? ((cat.amount / row.expense) * 100).toFixed(0) : '0';
                            const catKey = `${idx}-${cat.id}`;
                            const isCatExpanded = expandedCategories.has(catKey);
                            const hasSubcategories = cat.subcategories.length > 1 || (cat.subcategories.length === 1 && cat.subcategories[0].name !== 'Other');

                            return (
                              <div key={catIdx}>
                                <button
                                  onClick={() => hasSubcategories && toggleCategory(catKey)}
                                  className={`w-full flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 ${hasSubcategories ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'} transition-colors`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ChevronRight
                                      size={12}
                                      className={`text-slate-400 transition-transform shrink-0 ${isCatExpanded ? 'rotate-90' : ''} ${!hasSubcategories ? 'opacity-0' : ''}`}
                                    />
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></div>
                                    <span className="text-sm text-slate-700 truncate">{cat.name}</span>
                                    <span className="text-[10px] text-slate-400">({cat.count})</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-sm font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                                    <span className="text-xs text-slate-400 w-10 text-right">{percentage}%</span>
                                  </div>
                                </button>

                                {/* Subcategory Breakdown */}
                                {isCatExpanded && hasSubcategories && (
                                  <div className="ml-6 mt-1 space-y-1">
                                    {cat.subcategories.map((sub, subIdx) => {
                                      const subPercentage = cat.amount > 0 ? ((sub.amount / cat.amount) * 100).toFixed(0) : '0';
                                      return (
                                        <div key={subIdx} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-1.5">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs text-slate-600 truncate">{sub.name}</span>
                                            <span className="text-[9px] text-slate-400">({sub.count})</span>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs font-medium text-slate-700">£{sub.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[10px] text-slate-400 w-8 text-right">{subPercentage}%</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {categoryBreakdown.length === 0 && (
                            <p className="text-sm text-slate-400 py-2">No expenses this month</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Categories - Donut Chart Style */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Top Categories</h3>
            </div>

            {/* Donut Visual */}
            <div className="p-6 md:p-8 flex justify-center">
              <div className="relative w-44 h-44 md:w-56 md:h-56">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {donutData.length > 0 ? (
                    donutData.reduce((acc, cat, idx) => {
                      const percentage = (cat.amount / donutTotal) * 100;
                      const gap = 1.5; // Gap between segments
                      const adjustedPercentage = Math.max(0, percentage - gap);
                      const offset = acc.offset;
                      acc.segments.push(
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke={cat.color}
                          strokeWidth="14"
                          strokeLinecap="round"
                          strokeDasharray={`${adjustedPercentage * 2.39} ${239 - adjustedPercentage * 2.39}`}
                          strokeDashoffset={-(offset + gap / 2) * 2.39}
                          className="transition-all duration-500"
                        />
                      );
                      acc.offset += percentage;
                      return acc;
                    }, { segments: [] as JSX.Element[], offset: 0 }).segments
                  ) : (
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg md:text-2xl font-semibold text-slate-900">{formatAmount(totalExpense)}</p>
                    <p className="text-[10px] md:text-xs text-slate-400">Total Expenses</p>
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
