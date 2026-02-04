
import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types';
import { ChevronDown, ChevronRight, Download, TrendingUp, Calendar, TrendingDown } from 'lucide-react';

interface YearlySummaryProps {
  transactions: Transaction[];
  categories: Category[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const YearlySummary: React.FC<YearlySummaryProps> = ({ transactions, categories }) => {
  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    const sorted = Array.from(years).sort((a: number, b: number) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  }, [transactions]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0]);
  
  // Track expanded rows for the breakdown table
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedCategories(newSet);
  };

  // Filter Data for Selected Year (All Types)
  const yearlyTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === selectedYear && !t.excluded;
    });
  }, [transactions, selectedYear]);

  // Data for Monthly Totals (Used in Table Footer)
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

  // Helper to build hierarchical data
  const buildHierarchicalData = (type: 'INCOME' | 'EXPENSE') => {
    const relevantCats = categories.filter(c => c.type === type);
    const relevantTx = yearlyTransactions.filter(t => t.type === type);

    return relevantCats.map(cat => {
        // Parent Data
        const catTransactions = relevantTx.filter(t => t.categoryId === cat.id);
        const monthlyTotals = new Array(12).fill(0);
        let yearTotal = 0;
        
        catTransactions.forEach(t => {
             const monthIndex = new Date(t.date).getMonth();
             monthlyTotals[monthIndex] += t.amount;
             yearTotal += t.amount;
        });

        // DYNAMIC SUBCATEGORIES:
        // Detect all subcategories present in transactions for this category to ensure we capture
        // everything, even if the subcategory list in the category definition is out of sync.
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
    }).sort((a, b) => b.yearTotal - a.yearTotal);
  };

  const hierarchicalIncomeData = useMemo(() => buildHierarchicalData('INCOME'), [yearlyTransactions, categories]);
  const hierarchicalExpenseData = useMemo(() => buildHierarchicalData('EXPENSE'), [yearlyTransactions, categories]);

  // Helper to flatten rows
  const flattenRows = (data: any[]) => {
    const rows: any[] = [];
    data.forEach(cat => {
        // Add Parent
        rows.push({ type: 'parent', data: cat });
        
        // Add Children if expanded
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

  // Render Table Helper
  const renderTable = (title: string, flatData: any[], totalLineDataKey: 'Income' | 'Expense', grandTotal: number) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-6">
         <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {title}
            </h3>
            
            <div className="flex items-center gap-2 md:gap-4 self-end md:self-auto">
                <button className="text-xs font-bold text-[#635bff] flex items-center gap-1 hover:underline">
                   <Download size={14} /> Export CSV
                </button>
            </div>
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
                     const rowBg = isEven ? 'bg-white' : 'bg-slate-50';
                     const { type, data } = rowObj;
                     const isExpanded = type === 'parent' && expandedCategories.has(data.id);
                     const hasChildren = type === 'parent' && data.children && data.children.length > 0;

                     return (
                        <tr key={type === 'parent' ? data.id : data.id} className={`${rowBg} hover:bg-blue-50/50 transition-colors group`}>
                            
                            {/* Category Name Column */}
                            <td className={`px-3.5 py-2.5 font-semibold text-slate-800 sticky left-0 border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10 ${rowBg} group-hover:bg-blue-50/50`}>
                                <div className={`flex items-center ${type === 'child' ? 'pl-7' : ''}`}>
                                    {type === 'parent' && (
                                        <button 
                                            onClick={() => toggleCategory(data.id)}
                                            disabled={!hasChildren}
                                            className={`mr-1.5 p-0.5 rounded hover:bg-slate-200 transition-colors ${!hasChildren ? 'opacity-0 pointer-events-none' : ''}`}
                                        >
                                            {isExpanded ? <ChevronDown size={12} className="text-slate-500"/> : <ChevronRight size={12} className="text-slate-400"/>}
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
                                                    ? 'text-slate-500 font-bold' 
                                                    : 'text-sm font-bold text-slate-900'
                                            }`} 
                                            title={data.name}
                                        >
                                            {data.name}
                                        </span>
                                    </div>
                                </div>
                            </td>

                            {/* Monthly Totals with Accounting Format */}
                            {data.monthlyTotals.map((amount: number, idx: number) => (
                                <td key={idx} className={`px-3.5 py-2.5 font-mono border-r border-slate-200 last:border-r-0 ${
                                    amount === 0 ? 'text-slate-300' 
                                    : type === 'child' ? 'text-slate-500 font-semibold' 
                                    : 'text-slate-800'
                                }`}>
                                    <div className="flex justify-between items-center w-full">
                                        <span className="text-slate-300 select-none text-[10px]">£</span>
                                        <span className={totalLineDataKey === 'Income' && amount > 0 ? 'font-bold text-emerald-600' : ''}>
                                          {amount > 0 ? amount.toLocaleString() : '-'}
                                        </span>
                                    </div>
                                </td>
                            ))}

                            {/* Yearly Total with Accounting Format */}
                            <td className={`px-3.5 py-2.5 font-bold font-mono border-l border-slate-300 ${isEven ? 'bg-slate-50/50' : 'bg-slate-100/50'} group-hover:bg-blue-100/50 ${type === 'child' ? 'text-slate-600' : 'text-slate-900'}`}>
                                <div className="flex justify-between items-center w-full">
                                    <span className="text-slate-400/50 select-none font-normal text-[10px]">£</span>
                                    <span className={totalLineDataKey === 'Income' ? 'text-emerald-700' : ''}>
                                      {data.yearTotal.toLocaleString()}
                                    </span>
                                </div>
                            </td>
                        </tr>
                     );
                  })}
                  
                  {/* Totals Row - Distinct Dark Footer */}
                  <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-900">
                     <td className="px-3.5 py-4 sticky left-0 bg-slate-800 border-r border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10 pl-8 text-xs">
                        Monthly Total
                     </td>
                     {MONTHS.map((_, idx) => {
                        const monthTotal = monthlyTotals[idx][totalLineDataKey];
                        return (
                           <td key={idx} className="px-3.5 py-4 font-mono text-sm text-slate-200 border-r border-slate-700 last:border-r-0">
                              <div className="flex justify-between items-center w-full">
                                  <span className="text-slate-600 select-none text-[10px]">£</span>
                                  <span className={totalLineDataKey === 'Income' && monthTotal > 0 ? 'font-extrabold text-emerald-400' : ''}>
                                    {monthTotal > 0 ? monthTotal.toLocaleString() : '-'}
                                  </span>
                              </div>
                           </td>
                        );
                     })}
                     <td className="px-3.5 py-4 font-extrabold font-mono text-base text-emerald-400 bg-slate-900 border-l border-slate-700">
                        <div className="flex justify-between items-center w-full">
                            <span className="text-emerald-400/50 select-none font-normal text-[10px]">£</span>
                            <span>{grandTotal.toLocaleString()}</span>
                        </div>
                     </td>
                  </tr>
               </tbody>
            </table>
         </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Yearly Summary</h2>
            <p className="text-slate-500 text-sm mt-1">Cash flow analysis and categorization for {selectedYear}.</p>
         </div>
      </div>

      {/* Control Row: Year Selector & KPI */}
      <div className="flex flex-col sm:flex-row gap-4">
         
         {/* Year Selector Card - Grey */}
         <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center min-w-[180px] relative group hover:border-[#635bff] transition-colors cursor-pointer">
            <div className="flex justify-between items-start mb-1">
                 <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Select Year</p>
                 <div className="p-1.5 bg-white rounded-lg text-slate-500 group-hover:text-[#635bff] group-hover:bg-[#635bff]/10 transition-colors shadow-sm"><Calendar size={16} /></div>
             </div>
            <div className="flex items-center justify-between mt-1">
                <span className="text-2xl font-bold font-mono text-slate-900">{selectedYear}</span>
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

         {/* Total Income Card - Green Glow */}
         <div className="bg-white p-5 rounded-2xl border border-emerald-200/60 shadow-[0_0_20px_rgba(16,185,129,0.15)] flex flex-col justify-between min-w-[220px]">
             <div className="flex justify-between items-start mb-2 gap-4">
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Income</p>
                 <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 shrink-0"><TrendingUp size={16} /></div>
             </div>
             <h3 className="text-2xl font-bold font-mono text-slate-900">£{totalIncomeYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
         </div>

         {/* Total Expenses Card - Red Glow */}
         <div className="bg-white p-5 rounded-2xl border border-rose-200/60 shadow-[0_0_20px_rgba(244,63,94,0.15)] flex flex-col justify-between min-w-[220px]">
             <div className="flex justify-between items-start mb-2 gap-4">
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Expenses</p>
                 <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600 shrink-0"><TrendingDown size={16} /></div>
             </div>
             <h3 className="text-2xl font-bold font-mono text-slate-900">£{totalExpenseYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
         </div>

      </div>

      {/* INCOME TABLE */}
      {renderTable('Income Breakdown Matrix', flatIncomeRows, 'Income', totalIncomeYear)}

      {/* EXPENSE TABLE */}
      {renderTable('Expense Breakdown Matrix', flatExpenseRows, 'Expense', totalExpenseYear)}

    </div>
  );
};

export default YearlySummary;
