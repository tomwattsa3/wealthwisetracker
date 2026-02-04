import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { Search, Calendar, Filter, Save, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';

interface DataRefinementToolProps {
  transactions: Transaction[];
  categories: Category[];
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
}

interface EditableTransactionRowProps {
  t: Transaction;
  categories: Category[];
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
}

// Sub-component for individual editable rows to manage local state and prevent excessive re-renders
const EditableTransactionRow: React.FC<EditableTransactionRowProps> = ({ 
  t, 
  categories, 
  onUpdate 
}) => {
  const [description, setDescription] = useState(t.description);
  const [notes, setNotes] = useState(t.notes || '');
  const activeCategoryObj = categories.find(c => c.id === t.categoryId);

  // Sync local state if prop changes (e.g. sorted list)
  useEffect(() => {
    setDescription(t.description);
    setNotes(t.notes || '');
  }, [t.id, t.description, t.notes]);

  const handleBlur = () => {
    if (description !== t.description || notes !== (t.notes || '')) {
      onUpdate(t.id, { description, notes });
    }
  };

  const handleCategoryChange = (newCategoryId: string) => {
    const newCategory = categories.find(c => c.id === newCategoryId);
    if (!newCategory) return;
    const newSubcategory = newCategory.subcategories[0];
    onUpdate(t.id, {
      categoryId: newCategory.id,
      categoryName: newCategory.name,
      subcategoryName: newSubcategory,
      type: newCategory.type
    });
  };

  const handleSubcategoryChange = (newSubcategory: string) => {
    onUpdate(t.id, { subcategoryName: newSubcategory });
  };

  return (
    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center gap-3 hover:shadow-md transition-shadow group">
      
      {/* Date Block */}
      <div className="bg-slate-100 p-2 rounded-lg text-slate-500 font-mono text-[10px] font-bold text-center leading-tight min-w-[50px] shrink-0">
         <div>{new Date(t.date).getDate()}</div>
         <div className="text-[8px] uppercase">{new Date(t.date).toLocaleDateString('en-US', { month: 'short' })}</div>
      </div>

      {/* Inputs Column: Description and Notes */}
      <div className="flex-1 min-w-0 w-full lg:w-auto flex flex-col gap-1">
         <input 
           type="text"
           value={description}
           onChange={(e) => setDescription(e.target.value)}
           onBlur={handleBlur}
           onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
           className="text-sm font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full transition-colors truncate placeholder:text-slate-300"
           placeholder="Statement Descriptor"
         />
         <input 
           type="text"
           value={notes}
           onChange={(e) => setNotes(e.target.value)}
           onBlur={handleBlur}
           onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
           className="text-[11px] text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full transition-colors truncate placeholder:text-slate-300 placeholder:italic"
           placeholder="Add notes..."
         />
      </div>

      {/* Controls & Amount */}
      <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 mt-2 lg:mt-0">
          {/* Category Select */}
          <div className="relative flex-1 lg:w-36">
              <select
                  value={t.categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full pl-2 pr-6 py-1.5 bg-indigo-50/50 border border-indigo-100 hover:border-indigo-300 rounded-md text-xs font-semibold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer appearance-none transition-colors"
              >
                  {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activeCategoryObj?.color }}></div>
              </div>
          </div>

          {/* Subcategory Select */}
          <div className="relative flex-1 lg:w-36">
              <select
                  value={t.subcategoryName}
                  onChange={(e) => handleSubcategoryChange(e.target.value)}
                  className="w-full pl-2 pr-6 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-md text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-500/20 cursor-pointer appearance-none transition-colors"
              >
                  {activeCategoryObj?.subcategories.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                  ))}
              </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Amount */}
          <div className="w-24 text-right pr-2 shrink-0">
              <span className={`text-sm font-bold font-mono ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {t.type === 'INCOME' ? '+' : '-'}£{t.amount.toLocaleString()}
              </span>
          </div>

          {/* Save Indicator */}
          <div className="hidden lg:block w-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Changes saved automatically">
              <CheckCircle2 size={16} />
          </div>
      </div>
    </div>
  );
};

const DataRefinementTool: React.FC<DataRefinementToolProps> = ({ 
  transactions, 
  categories, 
  onUpdateTransaction 
}) => {
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');

  // Filter Logic
  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      // Date Range
      if (t.date < startDate || t.date > endDate) return false;

      // Search (Updated to include notes)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = 
          t.description.toLowerCase().includes(q) || 
          t.amount.toString().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && t.categoryId !== selectedCategory) return false;
      
      // Subcategory Filter
      if (selectedSubcategory !== 'all' && t.subcategoryName !== selectedSubcategory) return false;

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, startDate, endDate, searchQuery, selectedCategory, selectedSubcategory]);

  const availableSubcategoriesForFilter = selectedCategory !== 'all'
    ? categories.find(c => c.id === selectedCategory)?.subcategories || []
    : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full animate-in fade-in">
      
      {/* 1. Control Panel */}
      <div className="p-4 border-b border-slate-200 space-y-4">
        <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Filter size={20} />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-900">Data Refinement</h2>
                <p className="text-xs text-slate-500">Edit transaction details, categorize, and add notes.</p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Date Range */}
            <div className="lg:col-span-2 flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Calendar size={14} />
                    </span>
                    <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex items-center text-slate-400 font-bold">-</div>
                <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Calendar size={14} />
                    </span>
                    <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>

            {/* Category Filter */}
            <div className="relative">
                <select
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubcategory('all'); }}
                    className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                    <option value="all">Filter: All Categories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

             {/* Subcategory Filter */}
             <div className="relative">
                <select
                    value={selectedSubcategory}
                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                    disabled={selectedCategory === 'all'}
                    className={`w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer ${selectedCategory === 'all' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <option value="all">Filter: All Subcats</option>
                    {availableSubcategoriesForFilter.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Search */}
            <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Search size={14} />
                </span>
                <input 
                    type="text" 
                    placeholder="Search desc or notes..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400"
                />
            </div>
        </div>
      </div>

      {/* 2. Editable List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-4">
        {filteredData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm font-medium">No transactions found in this range.</p>
            </div>
        ) : (
            <div className="space-y-2">
                {filteredData.map((t) => (
                    <EditableTransactionRow 
                        key={t.id} 
                        t={t} 
                        categories={categories} 
                        onUpdate={onUpdateTransaction} 
                    />
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default DataRefinementTool;