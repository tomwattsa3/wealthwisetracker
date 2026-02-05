
import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types';
import { ChevronDown, ChevronRight, Download, TrendingUp, Calendar, TrendingDown } from 'lucide-react';

interface YearlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const YearlySummary: React.FC<YearlySummaryProps> = ({ transactions, categories }) => {
  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    const sorted = Array.from(years).sort((a: number, b: number) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  }, [transactions]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0]);

  // Track expanded rows for desktop table
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Track expanded months for mobile view
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  const toggleCategory = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
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

  // Filter Data for Selected Year (All Types)
  const yearlyTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === selectedYear && !t.excluded;
    });
  }, [transactions, selectedYear]);

  // Data for Monthly Totals
  const monthlyTotals = useMemo(() => {
    const data = MONTHS.map(m => ({ name: m, Income: 0, Expense: 0 }));

    yearlyTransactions.forEach(t => {
      const monthIndex = new Date(t.date).getMonth();
      if (t.type === 'INCOME') {
        data[monthIndex].Income += t.amount;
      } else {
        data[monthIndex].Expense += t.amount;
      }
    });

    return data;
  }, [yearlyTransactions]);

  // Monthly category breakdown for mobile view
  const monthlyCategoryBreakdown = useMemo(() => {
    return MONTHS.map((_, monthIndex) => {
      const monthTransactions = yearlyTransactions.filter(t => new Date(t.date).getMonth() === monthIndex);

      // Group by category for expenses
      const expenseByCategory: { [key: string]: { name: string; color: string; amount: number } } = {};
      const incomeByCategory: { [key: string]: { name: string; color: string; amount: number } } = {};

      monthTransactions.forEach(t => {
        const cat = categories.find(c => c.id === t.categoryId || c.name === t.categoryName);
        const catName = cat?.name || t.categoryName || 'Uncategorized';
        const catColor = cat?.color || '#94a3b8';
        const catId = cat?.id || catName;

        if (t.type === 'EXPENSE') {
          if (!expenseByCategory[catId]) {
            expenseByCategory[catId] = { name: catName, color: catColor, amount: 0 };
          }
          expenseByCategory[catId].amount += t.amount;
        } else {
          if (!incomeByCategory[catId]) {
            incomeByCategory[catId] = { name: catName, color: catColor, amount: 0 };
          }
          incomeByCategory[catId].amount += t.amount;
        }
      });

      // Sort by amount descending
      const expenses = Object.values(expenseByCategory).sort((a, b) => b.amount - a.amount);
      const income = Object.values(incomeByCategory).sort((a, b) => b.amount - a.amount);

      return { expenses, income };
    });
  }, [yearlyTransactions, categories]);

  // Helper to build hierarchical data for desktop
  const buildHierarchicalData = (type: 'INCOME' | 'EXPENSE') => {
    const relevantCats = categories.filter(c => c.type === type);
    const relevantTx = yearlyTransactions.filter(t => t.type === type);

    return relevantCats.map(cat => {
        const catTransactions = relevantTx.filter(t =>
          t.categoryId === cat.id || t.categoryName === cat.name
        );
        const monthlyTotals = new Array(12).fill(0);
        let yearTotal = 0;

        catTransactions.forEach(t => {
             const monthIndex = new Date(t.date).getMonth();
             monthlyTotals[monthIndex] += t.amount;
             yearTotal += t.amount;
        });

        const txSubcats = new Set(catTransactions.map(t => t.subcategoryName).filter(Boolean));

        const children = Array.from(txSubcats).map(subName => {
            const subTransactions = catTransactions.filter(t => t.subcategoryName === subName);
            const subMonthly = new Array(12).fill(0);
            let subTotal = 0;

            subTransactions.forEach(t => {
                 const monthIndex = new Date(t.date).getMonth();
                 subMonthly[monthIndex] += t.amount;
                 subTotal += t.amount;
            });

            return {
                id: `${cat.id}-${subName}`,
                name: subName,
                monthlyTotals: subMonthly,
                yearTotal: subTotal
            };
        }).sort((a, b) => b.yearTotal - a.yearTotal);

        return {
            ...cat,
            monthlyTotals,
            yearTotal,
            children
        };
    }).filter(cat => cat.yearTotal > 0).sort((a, b) => b.yearTotal - a.yearTotal);
  };

  const hierarchicalIncomeData = useMemo(() => buildHierarchicalData('INCOME'), [yearlyTransactions, categories]);
  const hierarchicalExpenseData = useMemo(() => buildHierarchicalData('EXPENSE'), [yearlyTransactions, categories]);

  const flattenRows = (data: any[]) => {
    const rows: any[] = [];
    data.forEach(cat => {
        rows.push({ type: 'parent', data: cat });
        if (expandedCategories.has(cat.id)) {
            cat.children.forEach((sub: any) => {
                rows.push({ type: 'child', parentId: cat.id, parentColor: cat.color, data: sub });
            });
        }
    });
    return rows;
  };

  const flatIncomeRows = useMemo(() => flattenRows(hierarchicalIncomeData), [hierarchicalIncomeData, expandedCategories]);
  const flatExpenseRows = useMemo(() => flattenRows(hierarchicalExpenseData), [hierarchicalExpenseData, expandedCategories]);

  // Totals for KPIs
  const totalIncomeYear = yearlyTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenseYear = yearlyTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
  const netTotal = totalIncomeYear - totalExpenseYear;

  // Mobile Monthly View
  const renderMobileMonthlyView = () => (
    <div className="md:hidden bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-slate-50 border-slate-100">
        <h3 className="font-bold text-sm text-slate-800">Monthly Breakdown</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Tap a month to see spending by category</p>
      </div>

      {/* Month Cards */}
      <div className="divide-y divide-slate-100">
        {MONTHS.map((month, idx) => {
          const isExpanded = expandedMonths.has(idx);
          const monthData = monthlyTotals[idx];
          const hasData = monthData.Income > 0 || monthData.Expense > 0;
          const netMonth = monthData.Income - monthData.Expense;
          const breakdown = monthlyCategoryBreakdown[idx];

          return (
            <div key={month} className="bg-white">
              {/* Month Row */}
              <button
                onClick={() => hasData && toggleMonth(idx)}
                className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${hasData ? 'hover:bg-slate-50' : 'opacity-50'}`}
                disabled={!hasData}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                    hasData
                      ? netMonth >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {month}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-sm">{FULL_MONTHS[idx]}</p>
                    {hasData && (
                      <p className={`text-[10px] font-medium ${netMonth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        Net: {netMonth >= 0 ? '+' : ''}£{netMonth.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasData ? (
                    <>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-slate-800">
                          £{monthData.Expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-slate-400">spent</p>
                      </div>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">No data</span>
                  )}
                </div>
              </button>

              {/* Expanded Category Breakdown */}
              {isExpanded && hasData && (
                <div className="px-4 pb-4 bg-slate-50">
                  {/* Summary Row */}
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                      <p className="text-[9px] font-bold text-emerald-600 uppercase">Income</p>
                      <p className="text-sm font-bold font-mono text-emerald-700">
                        £{monthData.Income.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="flex-1 bg-rose-50 rounded-lg p-2 border border-rose-100">
                      <p className="text-[9px] font-bold text-rose-600 uppercase">Expenses</p>
                      <p className="text-sm font-bold font-mono text-rose-700">
                        £{monthData.Expense.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  {/* Top Expense Categories */}
                  {breakdown.expenses.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Top Spending Categories</p>
                      <div className="space-y-1.5">
                        {breakdown.expenses.slice(0, 5).map((cat, catIdx) => {
                          const percentage = monthData.Expense > 0 ? ((cat.amount / monthData.Expense) * 100).toFixed(0) : '0';
                          return (
                            <div key={catIdx} className="bg-white rounded-lg p-2.5 border border-slate-100">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }}></div>
                                  <span className="text-xs font-semibold text-slate-700">{cat.name}</span>
                                </div>
                                <span className="text-xs font-bold font-mono text-slate-800">
                                  £{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              {/* Progress bar */}
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                                ></div>
                              </div>
                              <p className="text-[9px] text-slate-400 mt-1">{percentage}% of monthly spend</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Income Categories */}
                  {breakdown.income.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Income Sources</p>
                      <div className="space-y-1">
                        {breakdown.income.slice(0, 3).map((cat, catIdx) => (
                          <div key={catIdx} className="flex items-center justify-between py-1.5 px-2 bg-white rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }}></div>
                              <span className="text-xs text-slate-600">{cat.name}</span>
                            </div>
                            <span className="text-xs font-bold font-mono text-emerald-600">
                              +£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Desktop Table View
  const renderDesktopTable = (title: string, flatData: any[], totalLineDataKey: 'Income' | 'Expense', grandTotal: number) => (
    <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-6">
         <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
            <h3 className="font-bold text-slate-800 text-base">
                {title}
            </h3>
            <button className="text-xs font-bold text-[#635bff] flex items-center gap-1 hover:underline">
               <Download size={14} /> Export
            </button>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
               <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-wider">
                     <th className="px-3.5 py-3 text-left sticky left-0 bg-slate-100 border-b border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] min-w-[200px] z-20">
                         Category
                     </th>
                     {MONTHS.map(m => (
                        <th key={m} className="px-3.5 py-3 text-right border-b border-r border-slate-300 last:border-r-0 min-w-[85px]">
                            {m}
                        </th>
                     ))}
                     <th className="px-3.5 py-3 text-right bg-slate-200 text-slate-800 font-extrabold border-b border-l border-slate-300 min-w-[110px]">
                         Total
                     </th>
                  </tr>
               </thead>
               <tbody className="text-xs">
                  {flatData.map((rowObj, index) => {
                     const isEven = index % 2 === 0;
                     const rowBg = isEven ? 'bg-white' : 'bg-slate-100';
                     const { type, data } = rowObj;
                     const isExpanded = type === 'parent' && expandedCategories.has(data.id);
                     const hasChildren = type === 'parent' && data.children && data.children.length > 0;

                     return (
                        <tr key={type === 'parent' ? data.id : data.id} className={`${rowBg} hover:bg-blue-50/50 transition-colors group`}>
                            <td className={`px-3.5 py-2.5 font-semibold text-slate-800 sticky left-0 border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10 ${rowBg} group-hover:bg-blue-50/50`}>
                                <div className={`flex items-center ${type === 'child' ? 'pl-7' : ''}`}>
                                    {type === 'parent' && (
                                        <button
                                            onClick={() => toggleCategory(data.id)}
                                            disabled={!hasChildren}
                                            className={`mr-2 p-1 rounded-md transition-colors ${!hasChildren ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 bg-slate-100'}`}
                                        >
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-600"/> : <ChevronRight size={16} className="text-slate-500"/>}
                                        </button>
                                    )}
                                    <div className="flex items-center gap-2">
                                        {type === 'parent' ? (
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: data.color }}></div>
                                        ) : (
                                             <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400"></div>
                                        )}
                                        <span
                                            className={`truncate max-w-[150px] ${
                                                type === 'child'
                                                    ? 'text-sm text-slate-500 font-bold'
                                                    : 'text-sm font-bold text-slate-900'
                                            }`}
                                            title={data.name}
                                        >
                                            {data.name}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            {data.monthlyTotals.map((amount: number, idx: number) => (
                                <td key={idx} className={`px-3.5 py-2.5 font-mono border-r border-slate-200 last:border-r-0 text-right ${
                                    amount === 0 ? 'text-slate-300'
                                    : type === 'child' ? 'text-slate-500 font-semibold'
                                    : 'text-slate-800'
                                }`}>
                                    <span className={totalLineDataKey === 'Income' && amount > 0 ? 'font-bold text-emerald-600' : ''}>
                                      {amount > 0 ? `£${amount.toLocaleString()}` : '-'}
                                    </span>
                                </td>
                            ))}
                            <td className={`px-3.5 py-2.5 font-bold font-mono text-right border-l border-slate-300 ${isEven ? 'bg-slate-50/50' : 'bg-slate-100/50'} group-hover:bg-blue-100/50 ${type === 'child' ? 'text-slate-600' : 'text-slate-900'}`}>
                                <span className={totalLineDataKey === 'Income' ? 'text-emerald-700' : ''}>
                                  £{data.yearTotal.toLocaleString()}
                                </span>
                            </td>
                        </tr>
                     );
                  })}
                  <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-900">
                     <td className="px-3.5 py-4 sticky left-0 bg-slate-800 border-r border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10 text-xs">
                        Total
                     </td>
                     {MONTHS.map((_, idx) => {
                        const monthTotal = monthlyTotals[idx][totalLineDataKey];
                        return (
                           <td key={idx} className="px-3.5 py-4 font-mono text-sm text-slate-200 text-right border-r border-slate-700 last:border-r-0">
                              <span className={totalLineDataKey === 'Income' && monthTotal > 0 ? 'font-extrabold text-emerald-400' : ''}>
                                {monthTotal > 0 ? `£${monthTotal.toLocaleString()}` : '-'}
                              </span>
                           </td>
                        );
                     })}
                     <td className="px-3.5 py-4 font-extrabold font-mono text-base text-emerald-400 text-right bg-slate-900 border-l border-slate-700">
                        £{grandTotal.toLocaleString()}
                     </td>
                  </tr>
               </tbody>
            </table>
         </div>
    </div>
  );

  return (
    <div className="space-y-3 md:space-y-6 animate-in fade-in pb-10 px-2 md:px-0">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4">
         <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Yearly Summary</h2>
            <p className="text-slate-500 text-xs md:text-sm mt-0.5 md:mt-1">Cash flow for {selectedYear}</p>
         </div>
      </div>

      {/* Mobile: Stacked KPI Cards */}
      <div className="md:hidden space-y-2">
        {/* Year Selector */}
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 shadow-sm relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Year</p>
              <span className="text-2xl font-bold font-mono text-slate-900">{selectedYear}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white rounded-lg text-slate-500 shadow-sm"><Calendar size={18} /></div>
              <ChevronDown size={18} className="text-slate-400" />
            </div>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
             {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Income & Expense Cards Side by Side */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-[10px] font-bold uppercase">Income</p>
              <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600"><TrendingUp size={14} /></div>
            </div>
            <h3 className="text-lg font-bold font-mono text-emerald-600">£{totalIncomeYear.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</h3>
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-[10px] font-bold uppercase">Expenses</p>
              <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600"><TrendingDown size={14} /></div>
            </div>
            <h3 className="text-lg font-bold font-mono text-rose-600">£{totalExpenseYear.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</h3>
          </div>
        </div>

        {/* Net Balance Card */}
        <div className={`p-4 rounded-xl border shadow-sm ${netTotal >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Net Balance</p>
              <h3 className={`text-xl font-bold font-mono ${netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {netTotal >= 0 ? '+' : '-'}£{Math.abs(netTotal).toLocaleString('en-GB', { maximumFractionDigits: 0 })}
              </h3>
            </div>
            <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${netTotal >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {netTotal >= 0 ? 'Surplus' : 'Deficit'}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Side by Side KPI Cards */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-6">
         <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center min-w-[200px] relative group hover:border-[#635bff] transition-colors cursor-pointer">
            <div className="flex items-center justify-between gap-2 mb-1">
                 <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Year</p>
                 <div className="p-1.5 bg-white rounded-lg text-slate-500 group-hover:text-[#635bff] group-hover:bg-[#635bff]/10 transition-colors shadow-sm"><Calendar size={16} /></div>
             </div>
            <div className="flex items-center justify-between">
                <span className="text-3xl font-bold font-mono text-slate-900">{selectedYear}</span>
                <ChevronDown size={20} className="text-slate-500 group-hover:text-[#635bff] transition-colors" />
            </div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
               {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
         </div>

         <div className="bg-white p-6 rounded-2xl border border-emerald-200/60 shadow-[0_0_20px_rgba(16,185,129,0.15)] flex flex-col justify-center flex-1">
             <div className="flex items-center justify-between gap-2 mb-1">
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Income</p>
                 <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 shrink-0"><TrendingUp size={16} /></div>
             </div>
             <h3 className="text-3xl font-bold font-mono text-emerald-600">£{totalIncomeYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
         </div>

         <div className="bg-white p-6 rounded-2xl border border-rose-200/60 shadow-[0_0_20px_rgba(244,63,94,0.15)] flex flex-col justify-center flex-1">
             <div className="flex items-center justify-between gap-2 mb-1">
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Expenses</p>
                 <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600 shrink-0"><TrendingDown size={16} /></div>
             </div>
             <h3 className="text-3xl font-bold font-mono text-rose-600">£{totalExpenseYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
         </div>
      </div>

      {/* Mobile Monthly View */}
      {renderMobileMonthlyView()}

      {/* Desktop Table View */}
      {renderDesktopTable('Income Breakdown Matrix', flatIncomeRows, 'Income', totalIncomeYear)}
      {renderDesktopTable('Expense Breakdown Matrix', flatExpenseRows, 'Expense', totalExpenseYear)}

    </div>
  );
};

export default YearlySummary;
