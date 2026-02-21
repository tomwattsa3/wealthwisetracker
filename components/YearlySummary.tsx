
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { TrendingUp, TrendingDown, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

interface YearlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
  onRefresh?: () => void;
  getCategoryEmoji?: (categoryId: string) => string;
}

interface DateRange {
  start: string;
  end: string;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Format date as YYYY-MM-DD without timezone issues
const formatDateLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDatePresets = () => {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - ((dow + 1) % 7)); // Most recent Sunday (today if Sunday)
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);

  return {
    thisMonth: {
      start: formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: formatDateLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      label: 'This Month'
    },
    lastWeek: {
      start: formatDateLocal(lastMonday),
      end: formatDateLocal(lastSunday),
      label: 'Last Week'
    },
    lastMonth: {
      start: formatDateLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
      label: 'Last Month'
    },
    thisYear: {
      start: formatDateLocal(new Date(now.getFullYear(), 0, 1)),
      end: formatDateLocal(now),
      label: 'YTD'
    }
  };
};

const YearlySummary: React.FC<YearlySummaryProps> = ({ transactions, categories, onRefresh, getCategoryEmoji }) => {
  const presets = getDatePresets();

  const [dateRange, setDateRange] = useState<DateRange>(presets.thisYear);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartCategoryFilter, setChartCategoryFilter] = useState<string>('all');
  const [chartSubcategoryFilter, setChartSubcategoryFilter] = useState<string>('all');

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
      if (t.excluded || t.categoryId === 'excluded') return false;
      const txDate = t.date;
      return txDate >= dateRange.start && txDate <= dateRange.end;
    });
  }, [transactions, dateRange]);

  // Monthly data
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

  const completedMonthsInRange = useMemo(() => {
    const start = new Date(dateRange.start);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const rangeEnd = new Date(dateRange.end);
    const lastCompletedMonth = new Date(currentYear, currentMonth, 0);

    const effectiveEnd = rangeEnd < lastCompletedMonth ? rangeEnd : lastCompletedMonth;

    if (effectiveEnd < start) {
      return 1;
    }

    const months = (effectiveEnd.getFullYear() - start.getFullYear()) * 12 + (effectiveEnd.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
  }, [dateRange]);

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

        const subName = t.subcategoryName || 'Other';
        const existingSub = expenseByCategory[catId].subcategories.find(s => s.name === subName);
        if (existingSub) {
          existingSub.amount += t.amount;
          existingSub.count += 1;
        } else {
          expenseByCategory[catId].subcategories.push({ name: subName, amount: t.amount, count: 1 });
        }
      });

      Object.values(expenseByCategory).forEach(cat => {
        cat.subcategories.sort((a, b) => b.amount - a.amount);
      });

      return Object.values(expenseByCategory).sort((a, b) => b.amount - a.amount);
    });
  }, [filteredTransactions, categories, monthlyData]);

  const topExpenseCategories = useMemo(() => {
    const expenseTx = filteredTransactions.filter(t => t.type === 'EXPENSE');
    const byCategory: { [key: string]: { id: string; name: string; color: string; amount: number; count: number } } = {};

    expenseTx.forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
      const catName = cat?.name || t.categoryName || 'Uncategorized';
      const catColor = cat?.color || '#94a3b8';
      const catId = cat?.id || catName;

      if (!byCategory[catId]) {
        byCategory[catId] = { id: catId, name: catName, color: catColor, amount: 0, count: 0 };
      }
      byCategory[catId].amount += t.amount;
      byCategory[catId].count += 1;
    });

    return Object.values(byCategory).sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, categories]);

  const topIncomeCategories = useMemo(() => {
    const incomeTx = filteredTransactions.filter(t => t.type === 'INCOME');
    const byCategory: { [key: string]: { id: string; name: string; color: string; amount: number; count: number } } = {};

    incomeTx.forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
      const catName = cat?.name || t.categoryName || 'Uncategorized';
      const catColor = cat?.color || '#10b981';
      const catId = cat?.id || catName;

      if (!byCategory[catId]) {
        byCategory[catId] = { id: catId, name: catName, color: catColor, amount: 0, count: 0 };
      }
      byCategory[catId].amount += t.amount;
      byCategory[catId].count += 1;
    });

    return Object.values(byCategory).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [filteredTransactions, categories]);

  // Category + subcategory options for chart filter
  const expenseCategoryOptions = useMemo(() => {
    const catMap = new Map<string, { id: string; name: string; subs: Map<string, string> }>();
    filteredTransactions
      .filter(t => t.type === 'EXPENSE')
      .forEach(t => {
        const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
        const id = cat?.id || t.categoryId || 'uncategorized';
        const name = cat?.name || t.categoryName || 'Uncategorized';
        if (!catMap.has(id)) catMap.set(id, { id, name, subs: new Map() });
        if (t.subcategoryName) {
          catMap.get(id)!.subs.set(t.subcategoryName, t.subcategoryName);
        }
      });
    return Array.from(catMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => ({
        id: c.id,
        name: c.name,
        subcategories: Array.from(c.subs.values()).sort(),
      }));
  }, [filteredTransactions, categories]);

  // Spending trend chart data
  const rangeDays = useMemo(() => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [dateRange]);

  const isLongRange = rangeDays > 45;

  // Determine which granularity options to show
  const granularityOptions = useMemo(() => {
    if (isLongRange) return ['monthly', 'weekly'] as const;
    return ['daily', 'weekly'] as const;
  }, [isLongRange]);

  // Reset granularity to default when range type changes
  useEffect(() => {
    setChartGranularity(isLongRange ? 'monthly' : 'daily');
  }, [isLongRange]);

  const chartData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => {
      if (t.type !== 'EXPENSE') return false;
      if (chartCategoryFilter === 'all') return true;
      const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
      const catId = cat?.id || t.categoryId;
      if (catId !== chartCategoryFilter) return false;
      if (chartSubcategoryFilter !== 'all' && t.subcategoryName !== chartSubcategoryFilter) return false;
      return true;
    });

    if (chartGranularity === 'daily') {
      // Daily aggregation
      const dayMap = new Map<string, { amount: number; amountAED: number }>();
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dayMap.set(formatDateLocal(d), { amount: 0, amountAED: 0 });
      }
      expenses.forEach(t => {
        const existing = dayMap.get(t.date);
        if (existing) {
          existing.amount += t.amount;
          existing.amountAED += (t.amountAED || 0);
        }
      });
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return Array.from(dayMap.entries()).map(([date, data]) => {
        const d = new Date(date);
        return {
          label: `${DAYS[d.getDay()]} ${d.getDate()}`,
          amount: Math.round(data.amount * 100) / 100,
          amountAED: Math.round(data.amountAED * 100) / 100,
        };
      });
    }

    if (chartGranularity === 'weekly') {
      // Weekly aggregation (Mon-Sun), sorted/labelled by week end (Sunday)
      const weekMap = new Map<string, { sortKey: string; label: string; amount: number; amountAED: number }>();
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      const dow = (start.getDay() + 6) % 7;
      const firstMonday = new Date(start);
      firstMonday.setDate(start.getDate() - dow);

      for (let mon = new Date(firstMonday); mon <= end; mon.setDate(mon.getDate() + 7)) {
        const weekKey = formatDateLocal(mon);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        weekMap.set(weekKey, {
          sortKey: formatDateLocal(sun),
          label: `${sun.getDate()} ${MONTHS[sun.getMonth()]}`,
          amount: 0,
          amountAED: 0,
        });
      }

      expenses.forEach(t => {
        const d = new Date(t.date);
        const dDow = (d.getDay() + 6) % 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dDow);
        const key = formatDateLocal(monday);
        const entry = weekMap.get(key);
        if (entry) {
          entry.amount += t.amount;
          entry.amountAED += (t.amountAED || 0);
        }
      });

      return Array.from(weekMap.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(w => ({
          label: w.label,
          amount: Math.round(w.amount * 100) / 100,
          amountAED: Math.round(w.amountAED * 100) / 100,
        }));
    }

    // Monthly aggregation
    return monthlyData.map(m => {
      const monthExpenses = expenses.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === m.year && d.getMonth() === m.monthIndex;
      });
      const monthAmount = monthExpenses.reduce((sum, t) => sum + t.amount, 0);
      const monthAmountAED = monthExpenses.reduce((sum, t) => sum + (t.amountAED || 0), 0);
      return {
        label: m.month,
        amount: Math.round(monthAmount * 100) / 100,
        amountAED: Math.round(monthAmountAED * 100) / 100,
      };
    });
  }, [filteredTransactions, dateRange, chartGranularity, monthlyData, chartCategoryFilter, chartSubcategoryFilter, categories]);

  // KPI calculations
  const totalIncome = filteredTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const totalIncomeAED = filteredTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + (t.amountAED || 0), 0);
  const totalExpenseAED = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + (t.amountAED || 0), 0);
  const netBalanceAED = totalIncomeAED - totalExpenseAED;
  const totalTransactions = filteredTransactions.length;
  const avgMonthlySpend = totalExpense / completedMonthsInRange;
  const avgMonthlyIncome = totalIncome / completedMonthsInRange;

  const formatAmount = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const formatAED = (amount: number) => {
    return `AED ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">{dateRange.label}: {new Date(dateRange.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – {new Date(dateRange.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm text-slate-400 hover:text-slate-700 transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-2">
        <div className="flex bg-slate-100 p-0.5 rounded-lg overflow-x-auto hide-scrollbar">
          {[
            { label: 'MTD', preset: presets.thisMonth },
            { label: 'Last Wk', preset: presets.lastWeek },
            { label: 'Last Mo', preset: presets.lastMonth },
            { label: 'YTD', preset: presets.thisYear },
          ].map((item) => (
            <button
              key={item.preset.label}
              onClick={() => { setDateRange(item.preset); setShowCustom(false); }}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${dateRange.label === item.preset.label && !showCustom ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${showCustom || dateRange.label === 'Custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
          />
          <span className="text-slate-300 text-xs font-bold">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
          />
          <button
            onClick={applyCustomRange}
            disabled={!customStart || !customEnd}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 shrink-0"
          >
            Go
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-2.5 md:gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-5">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <span className="text-sm md:text-base">📈</span>
            <span className="text-[8px] md:text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Income</span>
          </div>
          <p className="text-base md:text-3xl font-bold text-emerald-600">{formatAmount(totalIncome)}</p>
          <div className="flex flex-col md:flex-row md:items-center md:gap-2 mt-0.5 md:mt-1.5">
            <p className="text-[8px] md:text-xs font-medium text-slate-400 md:text-slate-500">{formatAED(totalIncomeAED)}</p>
            <span className="hidden md:inline text-slate-300">·</span>
            <p className="text-[7px] md:text-xs text-slate-300 md:text-slate-500 mt-0.5 md:mt-0">Avg {formatAmount(avgMonthlyIncome)}/mo</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-5">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <span className="text-sm md:text-base">📉</span>
            <span className="text-[8px] md:text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expenses</span>
          </div>
          <p className="text-base md:text-3xl font-bold text-slate-900">{formatAmount(totalExpense)}</p>
          <div className="flex flex-col md:flex-row md:items-center md:gap-2 mt-0.5 md:mt-1.5">
            <p className="text-[8px] md:text-xs font-medium text-slate-400 md:text-slate-500">{formatAED(totalExpenseAED)}</p>
            <span className="hidden md:inline text-slate-300">·</span>
            <p className="text-[7px] md:text-xs text-slate-300 md:text-slate-500 mt-0.5 md:mt-0">Avg {formatAmount(avgMonthlySpend)}/mo</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-5">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <span className="text-sm md:text-base">💰</span>
            <span className="text-[8px] md:text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Saved</span>
          </div>
          <p className={`text-base md:text-3xl font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatAmount(netBalance)}</p>
          <div className="flex flex-col md:flex-row md:items-center md:gap-2 mt-0.5 md:mt-1.5">
            <p className="text-[8px] md:text-xs font-medium text-slate-400 md:text-slate-500">{formatAED(netBalanceAED)}</p>
            <span className="hidden md:inline text-slate-300">·</span>
            <p className="text-[7px] md:text-xs text-slate-300 md:text-slate-500 mt-0.5 md:mt-0">{totalTransactions} transactions</p>
          </div>
        </div>
      </div>

      {/* Spending Trend + Top Categories + Monthly Breakdown */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* Left Column: Chart + Monthly Breakdown */}
        <div className="w-full lg:w-2/3 flex flex-col gap-5">

        {/* Spending Trend Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 flex items-center gap-2 md:gap-3">
            <h3 className="text-xs md:text-sm font-bold text-slate-900 shrink-0 leading-tight md:whitespace-nowrap text-left">Spending<br className="md:hidden" /> Trend</h3>
            <div className="flex items-center gap-1.5 md:gap-2 flex-1 justify-end flex-wrap">
              <div className="relative">
                <select
                  value={chartCategoryFilter}
                  onChange={(e) => { setChartCategoryFilter(e.target.value); setChartSubcategoryFilter('all'); }}
                  className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-7 py-1 text-[10px] font-semibold text-slate-600 outline-none focus:border-[#635bff] cursor-pointer max-w-[140px] truncate"
                >
                  <option value="all">All Categories</option>
                  {expenseCategoryOptions.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {chartCategoryFilter !== 'all' && (() => {
                const selectedCat = expenseCategoryOptions.find(c => c.id === chartCategoryFilter);
                return selectedCat && selectedCat.subcategories.length > 0 ? (
                  <div className="relative">
                    <select
                      value={chartSubcategoryFilter}
                      onChange={(e) => setChartSubcategoryFilter(e.target.value)}
                      className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-7 py-1 text-[10px] font-semibold text-slate-600 outline-none focus:border-[#635bff] cursor-pointer max-w-[140px] truncate"
                    >
                      <option value="all">All Subcategories</option>
                      {selectedCat.subcategories.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                ) : null;
              })()}
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              {granularityOptions.map(g => (
                <button
                  key={g}
                  onClick={() => setChartGranularity(g)}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all capitalize ${chartGranularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {g}
                </button>
              ))}
            </div>
            </div>{/* end flex controls wrapper */}
          </div>
          <div className="px-2 md:px-5 pt-4 pb-1">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval={chartData.length > 15 ? Math.floor(chartData.length / 8) : 0}
                    angle={chartData.length > 12 ? -45 : 0}
                    textAnchor={chartData.length > 12 ? 'end' : 'middle'}
                    height={chartData.length > 12 ? 50 : 30}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `£${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    width={45}
                  />
                  <Tooltip
                    cursor={{ stroke: '#635bff', strokeWidth: 1, strokeDasharray: '4 4' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as { amount: number; amountAED: number };
                        return (
                          <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
                            <p className="font-medium text-slate-300 text-[10px] mb-1">{label}</p>
                            <p className="font-mono text-sm font-bold">
                              £{data.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                              AED {data.amountAED.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="amount"
                    stroke="#635bff"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#635bff', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#635bff', stroke: '#fff', strokeWidth: 2 }}
                  >
                    {chartData.length <= 20 && (
                      <LabelList
                        dataKey="amount"
                        position="top"
                        offset={10}
                        style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}
                        formatter={(v: number) => `£${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
                      />
                    )}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-xs text-slate-400">No spending data</div>
            )}
          </div>
        </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Monthly Breakdown</h3>
          </div>

          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-5 bg-slate-50/80 border-b border-dashed border-slate-200/80 sticky top-0">
            <div className="px-4 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Month</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right border-r border-dashed border-slate-200/80">Income</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right border-r border-dashed border-slate-200/80">Expenses</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right border-r border-dashed border-slate-200/80">Net</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right">Trans</div>
          </div>

          {/* Table Rows */}
          <div className="max-h-[400px] md:max-h-[600px] overflow-y-auto custom-scrollbar">
            {monthlyData.map((row, idx) => {
              const isExpanded = expandedMonths.has(idx);
              const categoryBreakdown = monthlyCategoryBreakdown[idx];
              const hasData = row.expense > 0;

              return (
                <div key={idx}>
                  {/* Month Row - Mobile */}
                  <button
                    onClick={() => hasData && toggleMonth(idx)}
                    className={`md:hidden w-full flex items-center justify-between px-3 py-3 transition-colors text-left border-b border-dashed border-slate-200/80 ${hasData ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'} ${isExpanded ? 'bg-slate-50' : idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}
                    disabled={!hasData}
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronRight size={12} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''} ${!hasData ? 'opacity-0' : ''}`} />
                      <span className="font-medium text-slate-900 text-xs">{row.fullMonth}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${row.income > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {row.income > 0 ? `+£${row.income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${row.expense > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                          {row.expense > 0 ? `£${row.expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Month Row - Desktop */}
                  <button
                    onClick={() => hasData && toggleMonth(idx)}
                    className={`hidden md:grid w-full grid-cols-5 transition-colors text-left border-b border-dashed border-slate-200/80 ${hasData ? 'hover:bg-slate-50/80 cursor-pointer' : 'cursor-default'} ${isExpanded ? 'bg-slate-50' : idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}
                    disabled={!hasData}
                  >
                    <div className="flex items-center gap-2 px-4 py-3.5 border-r border-dashed border-slate-200/80">
                      <ChevronRight size={12} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''} ${!hasData ? 'opacity-0' : ''}`} />
                      <p className="font-medium text-slate-900 text-[11px]">{row.fullMonth}</p>
                    </div>
                    <div className="px-3 py-3.5 text-right border-r border-dashed border-slate-200/80">
                      <p className={`text-[11px] font-semibold ${row.income > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {row.income > 0 ? `+£${row.income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                      </p>
                    </div>
                    <div className="px-3 py-3.5 text-right border-r border-dashed border-slate-200/80">
                      <p className={`text-[11px] font-semibold ${row.expense > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                        {row.expense > 0 ? `£${row.expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                      </p>
                    </div>
                    <div className="px-3 py-3.5 text-right border-r border-dashed border-slate-200/80">
                      <p className={`text-[11px] font-semibold ${row.net > 0 ? 'text-emerald-600' : row.net < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                        {row.income > 0 || row.expense > 0 ? (row.net >= 0 ? '+' : '') + `£${row.net.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'}
                      </p>
                    </div>
                    <div className="px-3 py-3.5 text-right">
                      <p className="text-[11px] text-slate-400">{row.txCount > 0 ? row.txCount : '-'}</p>
                    </div>
                  </button>

                  {/* Expanded Category Breakdown */}
                  {isExpanded && hasData && (
                    <div className="bg-slate-50/80 border-b border-dashed border-slate-200/80 px-2 md:px-6 py-3">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 ml-1 md:ml-5">Expenses by Category</p>
                      <div className="space-y-2 ml-1 md:ml-5">
                        {categoryBreakdown.map((cat, catIdx) => {
                          const percentage = row.expense > 0 ? ((cat.amount / row.expense) * 100).toFixed(0) : '0';
                          const catKey = `${idx}-${cat.id}`;
                          const isCatExpanded = expandedCategories.has(catKey);
                          const hasSubcategories = cat.subcategories.length > 1 || (cat.subcategories.length === 1 && cat.subcategories[0].name !== 'Other');

                          return (
                            <div key={catIdx}>
                              <button
                                onClick={() => hasSubcategories && toggleCategory(catKey)}
                                className={`w-full flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-slate-100 shadow-sm ${hasSubcategories ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'} transition-colors`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <ChevronRight
                                    size={10}
                                    className={`text-slate-400 transition-transform shrink-0 ${isCatExpanded ? 'rotate-90' : ''} ${!hasSubcategories ? 'opacity-0' : ''}`}
                                  />
                                  <span className="text-sm shrink-0">{getCategoryEmoji ? getCategoryEmoji(cat.id) : '📊'}</span>
                                  <span className="text-[11px] font-medium text-slate-700 truncate">{cat.name}</span>
                                  <span className="text-[9px] text-slate-400">({cat.count})</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                                  <span className="text-[10px] text-slate-400 w-8 text-right">{percentage}%</span>
                                </div>
                              </button>

                              {isCatExpanded && hasSubcategories && (
                                <div className="ml-5 mt-2 space-y-1.5">
                                  {cat.subcategories.map((sub, subIdx) => {
                                    const subPercentage = cat.amount > 0 ? ((sub.amount / cat.amount) * 100).toFixed(0) : '0';
                                    return (
                                      <div key={subIdx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="text-[10px] text-slate-600 truncate">{sub.name}</span>
                                          <span className="text-[8px] text-slate-400">({sub.count})</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[10px] font-semibold text-slate-700">£{sub.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                                          <span className="text-[9px] text-slate-400 w-7 text-right">{subPercentage}%</span>
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
                          <p className="text-xs text-slate-400 py-2">No expenses this month</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>{/* end left column */}

        {/* Right Column: Top Categories */}
        <div className="w-full lg:w-1/3 lg:sticky lg:top-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Top Categories</h3>
          </div>

          {/* Total */}
          <div className="px-5 pt-4 pb-4 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Total Spend</p>
            <p className="text-xl font-bold text-slate-900">{formatAmount(totalExpense)}</p>
            <p className="text-xs text-slate-400 font-medium">{formatAED(totalExpenseAED)}</p>
          </div>

          {/* Category List */}
          <div className="px-5 py-4 space-y-3 flex-1">
            {topExpenseCategories.slice(0, 8).map((cat, idx) => {
              const percentage = totalExpense > 0 ? ((cat.amount / totalExpense) * 100) : 0;
              return (
                <div key={idx} className="py-0.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">{getCategoryEmoji ? getCategoryEmoji(cat.id) : '📊'}</span>
                      <span className="text-xs font-medium text-slate-700 truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400">{percentage.toFixed(1)}%</span>
                      <span className="text-xs font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${percentage}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              );
            })}
            {topExpenseCategories.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No expenses recorded</p>
            )}
          </div>
        </div>
        </div>{/* end right column */}

      </div>{/* end flex container */}

      {/* Highest Expenses + Income Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Highest Expenses */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Highest Expenses</h3>
            <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">TOP 5</span>
          </div>

          <div className="hidden md:grid grid-cols-3 bg-slate-50/80 border-b border-dashed border-slate-200/80">
            <div className="px-4 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Category</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right border-r border-dashed border-slate-200/80">Amount</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right">Share</div>
          </div>

          <div>
            {topExpenseCategories.map((cat, idx) => {
              const percentage = totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(1) : '0';
              return (
                <div key={idx} className={`grid grid-cols-3 border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <div className="px-4 py-3.5 min-w-0 border-r border-dashed border-slate-200/80 flex items-center gap-2">
                    <span className="text-sm shrink-0">{getCategoryEmoji ? getCategoryEmoji(cat.id) : '📊'}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-[11px] truncate">{cat.name}</p>
                      <p className="text-[9px] text-slate-400">{cat.count} trans</p>
                    </div>
                  </div>
                  <div className="px-3 py-3.5 text-right border-r border-dashed border-slate-200/80">
                    <p className="text-[11px] font-semibold text-slate-900">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="px-3 py-3.5 text-right">
                    <p className="text-[11px] font-semibold text-rose-600">{percentage}%</p>
                  </div>
                </div>
              );
            })}
            {topExpenseCategories.length === 0 && (
              <div className="px-4 py-6 text-center text-slate-400 text-xs">No expenses recorded</div>
            )}
          </div>
        </div>

        {/* Top Income Sources */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Income Sources</h3>
            <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">TOP 5</span>
          </div>

          <div className="hidden md:grid grid-cols-3 bg-slate-50/80 border-b border-dashed border-slate-200/80">
            <div className="px-4 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Category</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right border-r border-dashed border-slate-200/80">Amount</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-right">Share</div>
          </div>

          <div>
            {topIncomeCategories.map((cat, idx) => {
              const percentage = totalIncome > 0 ? ((cat.amount / totalIncome) * 100).toFixed(1) : '0';
              return (
                <div key={idx} className={`grid grid-cols-3 border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <div className="px-4 py-3.5 min-w-0 border-r border-dashed border-slate-200/80 flex items-center gap-2">
                    <span className="text-sm shrink-0">{getCategoryEmoji ? getCategoryEmoji(cat.id) : '💰'}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-[11px] truncate">{cat.name}</p>
                      <p className="text-[9px] text-slate-400">{cat.count} trans</p>
                    </div>
                  </div>
                  <div className="px-3 py-3.5 text-right border-r border-dashed border-slate-200/80">
                    <p className="text-[11px] font-semibold text-emerald-600">+£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="px-3 py-3.5 text-right">
                    <p className="text-[11px] font-semibold text-emerald-600">{percentage}%</p>
                  </div>
                </div>
              );
            })}
            {topIncomeCategories.length === 0 && (
              <div className="px-4 py-6 text-center text-slate-400 text-xs">No income recorded</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default YearlySummary;
