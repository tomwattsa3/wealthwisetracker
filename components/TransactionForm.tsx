
import React, { useState, useEffect } from 'react';
import { Plus, X, Calendar, PoundSterling, Type, Tag, EyeOff, Building } from 'lucide-react';
import { Transaction, TransactionType, Category, Bank } from '../types';

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  banks: Bank[];
}

const TransactionForm: React.FC<TransactionFormProps> = ({ onAddTransaction, isOpen, onClose, categories, banks }) => {
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>(banks.length > 0 ? banks[0].name : '');
  const [excluded, setExcluded] = useState(false);

  // Use the passed categories prop to filter options
  // Allow 'excluded' category to appear for both INCOME and EXPENSE types
  const availableCategories = categories.filter(c => c.type === type || c.id === 'excluded');
  const activeCategory = availableCategories.find(c => c.id === selectedCategoryId);

  // Sync selected bank if banks list changes
  useEffect(() => {
    if (!selectedBank && banks.length > 0) {
        setSelectedBank(banks[0].name);
    }
  }, [banks, selectedBank]);

  useEffect(() => {
    if (availableCategories.length > 0) {
      // If current selected category is not in the new type list, reset it
      if (!selectedCategoryId || !availableCategories.find(c => c.id === selectedCategoryId)) {
          setSelectedCategoryId(availableCategories[0].id);
          setSelectedSubcategory(availableCategories[0].subcategories[0]);
      }
    } else {
        setSelectedCategoryId('');
        setSelectedSubcategory('');
    }
  }, [type, availableCategories, selectedCategoryId]);

  useEffect(() => {
    if (activeCategory && activeCategory.subcategories.length > 0) {
        // Only reset subcategory if the current one isn't valid for this category
        if (!activeCategory.subcategories.includes(selectedSubcategory)) {
            setSelectedSubcategory(activeCategory.subcategories[0]);
        }
    }
  }, [selectedCategoryId, activeCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !selectedCategoryId || !activeCategory) return;

    onAddTransaction({
      date,
      amount: parseFloat(amount),
      type,
      categoryId: selectedCategoryId,
      categoryName: activeCategory.name,
      subcategoryName: selectedSubcategory,
      description,
      excluded,
      bankName: selectedBank
    });

    setAmount('');
    setDescription('');
    setExcluded(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in slide-in-from-bottom-10 fade-in border border-slate-100">
        <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">New Transaction</h2>
            <p className="text-slate-500 text-xs mt-1 font-medium">Log your income or expense</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Type Toggle */}
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setType('EXPENSE')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                type === 'EXPENSE' ? 'bg-white text-rose-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('INCOME')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                type === 'INCOME' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Income
            </button>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Amount</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-600 transition-colors">
                <PoundSterling size={20} />
              </div>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 rounded-xl text-xl font-bold text-slate-900 outline-none transition-all placeholder:text-slate-300"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Date</label>
               <div className="relative">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Calendar size={16} />
                 </div>
                 <input
                   type="date"
                   required
                   value={date}
                   onChange={(e) => setDate(e.target.value)}
                   className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                 />
               </div>
             </div>
             <div>
               <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Bank / Account</label>
               <div className="relative">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Building size={16} />
                 </div>
                 <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 appearance-none"
                  >
                    {banks.map(bank => (
                      <option key={bank.id} value={bank.name}>{bank.name}</option>
                    ))}
                  </select>
               </div>
             </div>
          </div>

          <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Category</label>
             <select
                 value={selectedCategoryId}
                 onChange={(e) => setSelectedCategoryId(e.target.value)}
                 className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 appearance-none"
               >
                 {availableCategories.map((cat) => (
                   <option key={cat.id} value={cat.id}>{cat.name}</option>
                 ))}
               </select>
          </div>

          <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Subcategory</label>
             <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                   <Tag size={16} />
                </div>
                <select
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 appearance-none"
                  disabled={!activeCategory}
                >
                  {activeCategory?.subcategories.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
             </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider">Description</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                 <Type size={16} />
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-300"
                placeholder="What was this for?"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer" onClick={() => setExcluded(!excluded)}>
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${excluded ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300'}`}>
              {excluded && <EyeOff size={12} />}
            </div>
            <label className="text-xs font-bold text-slate-600 cursor-pointer select-none">Exclude from totals</label>
          </div>

          <button
            type="submit"
            className="w-full mt-4 flex items-center justify-center gap-2 bg-[#635bff] hover:bg-[#5851e3] text-white py-3.5 rounded-xl font-bold shadow-md shadow-indigo-200 transition-all active:scale-95 border border-transparent"
          >
            <Plus size={18} />
            Add Transaction
          </button>
        </form>
      </div>
    </div>
  );
};

export default TransactionForm;
