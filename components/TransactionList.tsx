
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

    // Determine row styling - Clean card style
    const rowBackground = isExcluded
        ? 'bg-slate-100'
        : isCategoryMissing
            ? 'bg-amber-50 !border-amber-400'
            : isDirty
                ? 'bg-indigo-50/60'
                : 'bg-white';

    // Common cell styles for the "sheet" look - More spacious padding
    const cellClass = "h-full flex flex-col justify-center px-4 py-3 border-r border-slate-200/60 last:border-r-0";

    return (
        <>
            {/* Mobile Row */}
            <div className={`md:hidden grid grid-cols-[1fr_1fr_75px] items-center h-9 text-xs rounded-lg border border-slate-400 ${isCategoryMissing ? 'bg-amber-50 border-l-4 border-l-amber-400' : 'bg-white'} ${isExcluded ? 'opacity-40' : ''}`}>
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

            {/* Desktop Grid View - Card style with outline */}
            <div className={`hidden md:grid ${gridTemplate} gap-0 items-center text-sm group transition-colors border border-slate-400 rounded-lg hover:border-slate-500 hover:shadow-sm ${rowBackground} ${isExcluded ? 'opacity-50' : ''}`}>
                {/* 1. Date */}
                <div className="h-full flex items-center px-4 pr-6 py-4 border-r border-slate-200">
                    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">{t.date}</span>
                </div>

                {/* 2. Description (Merchant) */}
                <div className="h-full flex flex-col justify-center px-6 py-4 border-r border-slate-200 min-w-0">
                     <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`font-medium bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 text-sm ${isDirty ? 'text-indigo-700' : 'text-slate-800 focus:text-indigo-600'}`}
                        placeholder="Merchant"
                    />
                     {t.bankName && (
                        <span className="text-[10px] text-slate-400 truncate mt-0.5">
                            {t.bankName}
                        </span>
                    )}
                </div>

                {/* 3. Category */}
                <div className="h-full flex flex-col justify-center px-6 py-4 border-r border-slate-100">
                     {isCategoryMissing && (
                        <div className="flex items-center gap-1 mb-1">
                            <AlertTriangle size={12} className="text-amber-500" />
                            <span className="text-[10px] font-medium text-amber-600">Deleted</span>
                        </div>
                     )}
                     <select
                        value={isCategoryMissing ? '' : categoryId}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className={`w-full bg-transparent text-sm font-medium outline-none cursor-pointer hover:text-indigo-600 transition-colors ${isCategoryMissing ? 'text-amber-600' : isDirty ? 'text-indigo-700' : categoryId === '' ? 'text-rose-500' : 'text-slate-700'}`}
                     >
                        <option value="">Select...</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                     </select>
                </div>

                {/* 4. Subcategory */}
                <div className="h-full flex items-center px-6 py-4 border-r border-slate-100">
                     <select
                        value={subcategoryName}
                        onChange={(e) => handleSubcategoryChange(e.target.value)}
                        disabled={!categoryId}
                        className={`w-full bg-transparent text-sm outline-none cursor-pointer hover:text-indigo-600 transition-colors ${!categoryId ? 'text-slate-300' : isDirty ? 'text-indigo-600' : 'text-slate-500'}`}
                     >
                        {!categoryId && <option value="">--</option>}
                        {subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                     </select>
                </div>

                {/* 5. Amount */}
                <div className="h-full flex items-center justify-end px-6 py-4 border-r border-slate-100">
                    <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded ${
                            isExcluded ? 'bg-slate-100 text-slate-400' : displayType === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                            {isExcluded ? 'EXCL' : displayType === 'INCOME' ? 'IN' : 'OUT'}
                        </span>
                        <span className={`font-mono text-base font-semibold ${isExcluded ? 'text-slate-400 line-through' : displayType === 'INCOME' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {displayType === 'INCOME' ? '+' : '-'}£{t.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                 {/* 6. Note */}
                 <div className="h-full flex items-center px-4 py-4 border-r border-slate-100 min-w-0">
                     <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 text-sm ${isDirty ? 'text-indigo-600' : 'text-slate-400 focus:text-indigo-600'}`}
                        placeholder="Add note..."
                    />
                </div>

                {/* 7. Action */}
                <div className="h-full flex items-center justify-center px-3 py-4 gap-1">
                    <button
                        onClick={handleManualSave}
                        disabled={!isDirty && saveStatus !== 'success'}
                        className={`p-2 rounded-lg transition-all ${saveStatus === 'success' ? 'bg-emerald-100 text-emerald-600' : isDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-slate-300'}`}
                        title={saveStatus === 'success' ? "Saved" : isDirty ? "Save" : "No changes"}
                    >
                        {saveStatus === 'success' ? <Check size={14} strokeWidth={3} /> : <Save size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onExclude(t.id); }}
                        className={`p-2 rounded-lg transition-colors ${isExcluded ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                        title={isExcluded ? "Include" : "Exclude"}
                    >
                        {isExcluded ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete"
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
        {/* Desktop Header - Clean style */}
        <div className={`hidden md:grid ${gridTemplate} gap-0 py-3 bg-slate-50 border-b-2 border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide`}>
            <div className="px-4">Date</div>
            <div className="px-4">Merchant</div>
            <div className="px-6">Category</div>
            <div className="px-6">Subcategory</div>
            <div className="px-6 text-right">Amount</div>
            <div className="px-4">Note</div>
            <div className="px-3 text-center">Actions</div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden grid grid-cols-[1fr_1fr_75px] items-center h-6 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200 bg-slate-50">
            <span className="px-2 border-r border-slate-200">Merchant</span>
            <span className="pl-3 pr-2 border-r border-slate-200">Category</span>
            <span className="px-2 text-right">Amount</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2 py-2">
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
