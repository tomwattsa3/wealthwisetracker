
import React, { useState, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { EyeOff, Eye, FileSpreadsheet, Save, AlertTriangle, Check, Trash2 } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
}

interface TransactionRowProps {
    t: Transaction;
    categories: Category[];
    onUpdate: (id: string, updates: Partial<Transaction>) => void;
    onDelete: (id: string) => void;
    onExclude: (id: string) => void;
    gridTemplate: string;
    index: number;
}

const DeleteConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Delete Transaction?</h3>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            This will permanently delete this transaction. This action cannot be undone.
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95"
                        >
                            Yes, Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ExcludeConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    isCurrentlyExcluded
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isCurrentlyExcluded: boolean;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isCurrentlyExcluded ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {isCurrentlyExcluded ? <Eye size={24} /> : <EyeOff size={24} />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">
                            {isCurrentlyExcluded ? 'Include Transaction?' : 'Exclude Transaction?'}
                        </h3>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            {isCurrentlyExcluded
                                ? 'This will include the transaction back in your totals and reports.'
                                : 'This will exclude the transaction from your totals and reports. You can include it again later.'}
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 ${isCurrentlyExcluded ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'}`}
                        >
                            {isCurrentlyExcluded ? 'Yes, Include' : 'Yes, Exclude'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TransactionRow: React.FC<TransactionRowProps> = ({
    t,
    categories,
    onUpdate,
    onDelete,
    onExclude,
    gridTemplate,
    index
}) => {
    // Local state for editing fields
    const [description, setDescription] = useState(t.description);
    const [notes, setNotes] = useState(t.notes || '');
    const [categoryId, setCategoryId] = useState(t.categoryId);
    const [subcategoryName, setSubcategoryName] = useState(t.subcategoryName);
    
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

    // Derived state for the UI based on local selections
    const currentCategory = categories.find(c => c.id === categoryId);
    const subcategories = currentCategory ? currentCategory.subcategories : [];
    // Use current category type for preview, fallback to transaction type (defaults correctly for uncategorized imports)
    const displayType = currentCategory ? currentCategory.type : t.type;

    // Check if local state differs from props (unsaved changes)
    const isDirty =
        description !== t.description ||
        notes !== (t.notes || '') ||
        categoryId !== t.categoryId ||
        subcategoryName !== t.subcategoryName;

    // Only sync from props when the transaction ID changes (different transaction)
    // This prevents resetting user edits while they're working
    useEffect(() => {
        setDescription(t.description);
        setNotes(t.notes || '');
        setCategoryId(t.categoryId);
        setSubcategoryName(t.subcategoryName);
    }, [t.id]); // Only re-sync when transaction ID changes

    const handleManualSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDirty) {
            const updates: Partial<Transaction> = {
                description,
                notes,
                categoryId,
                subcategoryName
            };

            // If category changed, we need to update categoryName and type derived fields
            if (currentCategory) {
                updates.categoryName = currentCategory.name;
                updates.type = currentCategory.type;
            } else if (categoryId === '') {
                updates.categoryName = '';
                // Type remains what it was originally if uncategorized
            }

            onUpdate(t.id, updates);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleCategoryChange = (newCatId: string) => {
        const cat = categories.find(c => c.id === newCatId);

        // Update local state
        setCategoryId(newCatId);

        // Determine new subcategory
        let newSubcategory = '';
        if (cat && cat.subcategories.length > 0) {
            newSubcategory = cat.subcategories[0];
        }
        setSubcategoryName(newSubcategory);

        // Auto-save category change immediately to prevent loss
        const updates: Partial<Transaction> = {
            categoryId: newCatId,
            categoryName: cat ? cat.name : '',
            subcategoryName: newSubcategory,
            type: cat ? cat.type : t.type
        };
        onUpdate(t.id, updates);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    const handleSubcategoryChange = (newSubcategory: string) => {
        setSubcategoryName(newSubcategory);

        // Auto-save subcategory change immediately
        onUpdate(t.id, { subcategoryName: newSubcategory });
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    // Check if transaction is excluded
    const isExcluded = t.excluded || t.categoryId === 'excluded';

    // Check if the category was deleted (categoryId exists but not found in categories)
    const isCategoryMissing = t.categoryId !== '' && t.categoryId !== 'excluded' && !categories.find(c => c.id === t.categoryId);

    // Determine row styling - Alternating white and grey with more contrast
    const isEven = index % 2 === 0;
    const rowBackground = isExcluded
        ? 'bg-slate-300/80 opacity-60'
        : isCategoryMissing
            ? 'bg-amber-50 border-amber-300'
            : isDirty
                ? 'bg-indigo-50/60'
                : (isEven ? 'bg-white' : 'bg-slate-200');

    // Common cell styles for the "sheet" look - More spacious padding
    const cellClass = "h-full flex flex-col justify-center px-4 py-3 border-r border-slate-200/60 last:border-r-0";

    return (
        <>
            {/* Mobile Row */}
            <div className={`md:hidden grid grid-cols-[1fr_1fr_75px] items-center h-9 text-xs border-b border-slate-100 ${isCategoryMissing ? 'bg-amber-50 border-l-4 border-l-amber-400' : index % 2 === 0 ? 'bg-white' : 'bg-slate-100'} ${isExcluded ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-1.5 px-2 border-r border-slate-100 min-w-0">
                    {isCategoryMissing ? (
                        <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    ) : (
                        <span className={`w-1.5 h-4 rounded-sm shrink-0 ${isExcluded ? 'bg-slate-300' : displayType === 'INCOME' ? 'bg-emerald-500' : 'bg-rose-400'}`}></span>
                    )}
                    <span className="truncate text-slate-700 font-medium">{t.description || 'No merchant'}</span>
                </div>
                <span className={`pl-3 pr-2 text-[9px] border-r border-slate-100 truncate ${isCategoryMissing ? 'text-amber-600 font-bold' : 'text-slate-500 font-medium'}`}>
                    {isCategoryMissing ? 'Category Deleted!' : (t.categoryName || '-')}
                </span>
                <span className={`px-2 text-right font-mono font-semibold ${isExcluded ? 'text-slate-400' : displayType === 'INCOME' ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {displayType === 'EXPENSE' ? '-' : ''}£{t.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                </span>
            </div>

            {/* Desktop Grid View */}
            <div className={`hidden md:grid ${gridTemplate} gap-0 items-center text-sm group transition-all border rounded-lg mb-1.5 shadow-sm hover:shadow-md overflow-hidden ${isExcluded ? 'border-slate-200 ring-1 ring-slate-100' : 'border-slate-300 ring-1 ring-slate-200 hover:border-slate-400'} ${rowBackground}`}>
                {/* 1. Date - Read Only - Smaller Font */}
                <div className={`${cellClass} pl-3`}>
                    <span className="font-semibold text-xs text-slate-500 whitespace-nowrap">{t.date}</span>
                </div>

                {/* 2. Description (Merchant) - Smaller Font + Bank Name */}
                <div className="h-full flex flex-col justify-center px-2 py-3 border-r border-slate-200/60 min-w-0">
                     <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`font-semibold bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 text-sm ${isDirty ? 'text-indigo-900' : 'text-slate-800 focus:text-[#635bff]'}`}
                        placeholder="Merchant"
                    />
                     {t.bankName && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate flex items-center gap-1 mt-0.5">
                            <span className={`w-1 h-1 rounded-full ${displayType === 'INCOME' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                            {t.bankName}
                        </span>
                    )}
                </div>

                {/* 3. Category - Editable */}
                <div className="h-full flex flex-col justify-center px-9 py-3 border-r border-slate-200/60">
                     {isCategoryMissing && (
                        <div className="flex items-center gap-1 mb-1">
                            <AlertTriangle size={12} className="text-amber-500" />
                            <span className="text-[9px] font-bold text-amber-600">Category Deleted!</span>
                        </div>
                     )}
                     <select
                        value={isCategoryMissing ? '' : categoryId}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className={`w-full bg-transparent border border-transparent hover:border-slate-300 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#635bff] focus:ring-1 focus:ring-[#635bff]/20 cursor-pointer ${isCategoryMissing ? 'text-amber-700 bg-amber-100 border-amber-300' : isDirty ? 'text-indigo-700 bg-indigo-50/50' : categoryId === '' ? 'text-rose-500 bg-rose-50 border-rose-200 animate-pulse' : 'text-slate-600 bg-transparent border-slate-100'}`}
                     >
                        <option value="">{isCategoryMissing ? `Select New Category` : 'Category'}</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                     </select>
                </div>

                {/* 4. Subcategory - Editable */}
                <div className="h-full flex flex-col justify-center px-9 py-3 border-r border-slate-200/60">
                     <select
                        value={subcategoryName}
                        onChange={(e) => handleSubcategoryChange(e.target.value)}
                        disabled={!categoryId}
                        className={`w-full bg-transparent border border-transparent hover:border-slate-300 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-tight outline-none focus:border-[#635bff] focus:ring-1 focus:ring-[#635bff]/20 cursor-pointer ${!categoryId ? 'opacity-50 cursor-not-allowed' : isDirty ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 bg-transparent border-slate-100'}`}
                     >
                        {!categoryId && <option value="">--</option>}
                        {subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                     </select>
                </div>

                {/* 5. Amount */}
                <div className="h-full flex flex-col justify-center px-9 py-3 border-r border-slate-200/60">
                    <div className="flex flex-col justify-center w-full h-full">
                        <div className="flex items-center justify-end gap-3 w-full">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-[4px] uppercase tracking-wide border border-opacity-60 shrink-0 ${
                                isExcluded ? 'bg-slate-100 text-slate-400 border-slate-200' : displayType === 'INCOME' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                            }`}>
                                {isExcluded ? 'EXCLUDED' : displayType === 'INCOME' ? 'INCOME' : 'EXPENSE'}
                            </span>
                            <div className="flex items-center">
                                 <span className={`text-sm font-bold select-none ${isExcluded ? 'text-slate-400' : displayType === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>£</span>
                                 <span className={`font-mono font-bold text-sm text-right ${isExcluded ? 'text-slate-400 line-through' : displayType === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                    {displayType === 'EXPENSE' ? '-' : ''}{t.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                        {t.originalCurrency && t.originalCurrency !== 'GBP' && t.originalAmount && (
                             <div className="flex justify-end mt-0.5">
                                <span className="text-[9px] text-slate-400 font-mono font-medium">
                                    {t.originalCurrency} {t.originalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                             </div>
                        )}
                    </div>
                </div>

                 {/* 6. Note - Editable */}
                 <div className={`${cellClass} min-w-0`}>
                     <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`italic bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 text-xs ${isDirty ? 'text-indigo-600' : 'text-slate-500 focus:text-[#635bff]'}`}
                        placeholder="Note..."
                    />
                </div>

                {/* 7. Action */}
                <div className="h-full flex flex-row items-center justify-center px-2 py-2 border-r border-slate-200/60 last:border-r-0 gap-1">
                    <button
                        onClick={handleManualSave}
                        disabled={!isDirty && saveStatus !== 'success'}
                        className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center ${saveStatus === 'success' ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200' : isDirty ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 active:scale-95' : 'text-slate-300'}`}
                        title={saveStatus === 'success' ? "Saved successfully" : isDirty ? "Save changes" : "No changes"}
                    >
                        {saveStatus === 'success' ? <Check size={14} strokeWidth={3} /> : <Save size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onExclude(t.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${isExcluded ? 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                        title={isExcluded ? "Include Transaction" : "Exclude Transaction"}
                    >
                        {isExcluded ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Transaction"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </>
    );
};

const TransactionList: React.FC<TransactionListProps> = ({ transactions, categories, onUpdate, onDelete }) => {
  // Desktop Grid Template: Date | Merchant | Category | Subcategory | Amount | Note | Action
  const gridTemplate = "grid-cols-[95px_1fr_180px_200px_220px_1fr_90px]";
  // Mobile Grid Template: simplified
  const mobileGridTemplate = "grid-cols-[1fr_auto_auto]";

  // State for tracking which transaction is pending delete
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  // State for tracking which transaction is pending exclude/include toggle
  const [transactionToToggle, setTransactionToToggle] = useState<string | null>(null);

  const handleDeleteRequest = (id: string) => {
      setTransactionToDelete(id);
  };

  const handleConfirmDelete = () => {
      if (transactionToDelete) {
          onDelete(transactionToDelete);
          setTransactionToDelete(null);
      }
  };

  const handleExcludeRequest = (id: string) => {
      setTransactionToToggle(id);
  };

  const handleConfirmToggle = () => {
      if (transactionToToggle) {
          const transaction = transactions.find(t => t.id === transactionToToggle);
          if (transaction) {
              const isCurrentlyExcluded = transaction.excluded || transaction.categoryId === 'excluded';
              console.log('Toggle exclude - Current state:', {
                  id: transaction.id,
                  excluded: transaction.excluded,
                  categoryId: transaction.categoryId,
                  isCurrentlyExcluded
              });
              // Toggle: if excluded, set categoryId to empty; if not excluded, set to 'excluded'
              const newState = {
                  categoryId: isCurrentlyExcluded ? '' : 'excluded',
                  categoryName: isCurrentlyExcluded ? '' : 'Excluded',
                  excluded: !isCurrentlyExcluded
              };
              console.log('Setting new state:', newState);
              onUpdate(transactionToToggle, newState);
          }
          setTransactionToToggle(null);
      }
  };

  const transactionBeingToggled = transactions.find(t => t.id === transactionToToggle);
  const isCurrentlyExcluded = transactionBeingToggled ? (transactionBeingToggled.excluded || transactionBeingToggled.categoryId === 'excluded') : false;

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-slate-200 rounded-xl bg-slate-50/50">
        <div className="bg-slate-100 p-4 rounded-full mb-3">
          <FileSpreadsheet size={24} className="opacity-50" />
        </div>
        <p className="text-sm font-medium">No transactions found</p>
      </div>
    );
  }

  return (
    <>
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
        {/* Desktop Header - Hidden on mobile */}
        <div className={`hidden md:grid ${gridTemplate} gap-0 px-0 py-2 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2`}>
            <div className="pl-3 border-r border-slate-200/50">Date</div>
            <div className="pl-2 border-r border-slate-200/50">Merchant</div>
            <div className="pl-2 border-r border-slate-200/50">Category</div>
            <div className="pl-2 border-r border-slate-200/50">Subcategory</div>
            <div className="text-right pr-3 border-r border-slate-200/50">Amount</div>
            <div className="pl-2 border-r border-slate-200/50">Note</div>
            <div className="text-center">Action</div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden grid grid-cols-[1fr_1fr_75px] items-center h-6 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200 bg-slate-50">
            <span className="px-2 border-r border-slate-200">Merchant</span>
            <span className="pl-3 pr-2 border-r border-slate-200">Category</span>
            <span className="px-2 text-right">Amount</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {transactions.map((t, index) => (
                <TransactionRow
                    key={t.id}
                    t={t}
                    categories={categories}
                    onUpdate={onUpdate}
                    onDelete={handleDeleteRequest}
                    onExclude={handleExcludeRequest}
                    gridTemplate={gridTemplate}
                    index={index}
                />
            ))}
        </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
            isOpen={!!transactionToDelete}
            onClose={() => setTransactionToDelete(null)}
            onConfirm={handleConfirmDelete}
        />

        {/* Exclude Confirmation Modal */}
        <ExcludeConfirmationModal
            isOpen={!!transactionToToggle}
            onClose={() => setTransactionToToggle(null)}
            onConfirm={handleConfirmToggle}
            isCurrentlyExcluded={isCurrentlyExcluded}
        />
    </>
  );
};

export default TransactionList;
