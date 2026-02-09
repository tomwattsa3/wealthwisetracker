
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

        // Update local state only - requires manual save
        setCategoryId(newCatId);

        // Determine new subcategory
        let newSubcategory = '';
        if (cat && cat.subcategories.length > 0) {
            newSubcategory = cat.subcategories[0];
        }
        setSubcategoryName(newSubcategory);
    };

    const handleSubcategoryChange = (newSubcategory: string) => {
        // Update local state only - requires manual save
        setSubcategoryName(newSubcategory);
    };

    // Check if transaction is excluded
    const isExcluded = t.excluded || t.categoryId === 'excluded';

    // Check if the category was deleted (categoryId exists but not found in categories)
    const isCategoryMissing = t.categoryId !== '' && t.categoryId !== 'excluded' && !categories.find(c => c.id === t.categoryId);

    // Determine row styling - Alternating colors
    const isEven = index % 2 === 0;
    const rowBackground = isExcluded
        ? 'bg-slate-100'
        : isCategoryMissing
            ? 'bg-amber-50 !border-amber-400'
            : isDirty
                ? 'bg-indigo-50/60'
                : isEven
                    ? 'bg-white'
                    : 'bg-slate-50';

    // Common cell styles for the "sheet" look - More spacious padding
    const cellClass = "h-full flex flex-col justify-center px-4 py-3 border-r border-slate-200/60 last:border-r-0";

    return (
        <>
            {/* Mobile Row */}
            <div className={`md:hidden flex items-center px-3 py-2.5 gap-2 border-b border-slate-800 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${isCategoryMissing ? '!bg-amber-50' : ''} ${isExcluded ? 'opacity-40' : ''}`}>
                <span className={`w-6 text-center py-0.5 text-[8px] font-medium rounded shrink-0 ${displayType === 'INCOME' ? 'text-white bg-emerald-500' : 'text-white bg-rose-500'}`}>
                    {displayType === 'INCOME' ? 'IN' : 'OUT'}
                </span>
                <span className="text-xs font-medium text-slate-700 truncate flex-1 min-w-0">{t.description || 'No merchant'}</span>
                <div className="flex flex-col items-end shrink-0">
                    <span className={`text-xs font-medium tabular-nums ${isExcluded ? 'text-slate-400' : 'text-slate-700'}`}>
                        £{(t.amountGBP || t.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {t.bankName === 'Wio Bank' && (t.amountAED || 0) > 0 && (
                        <span className="text-[9px] text-slate-400 tabular-nums">
                            AED {(t.amountAED || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                </div>
            </div>

            {/* Desktop Grid View - Mercury Table Style */}
            <div className={`hidden md:grid ${gridTemplate} items-center py-4 border-b border-slate-800 ${isCategoryMissing ? 'bg-amber-50' : isDirty ? 'bg-indigo-50/30' : 'bg-white'} ${isExcluded ? 'opacity-50' : ''}`}>
                {/* 1. Date */}
                <div className="px-6">
                    <span className="text-sm text-slate-400">{t.date}</span>
                </div>

                {/* 2. Type - Pill Style */}
                <div className="px-6">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded ${displayType === 'INCOME' ? 'text-white bg-emerald-500' : 'text-white bg-rose-500'}`}>
                        {displayType === 'INCOME' ? 'INCOME' : 'EXPENSE'}
                    </span>
                </div>

                {/* 3. Category */}
                <div className="pl-6 pr-4">
                     {isCategoryMissing ? (
                        <div className="flex items-center gap-1">
                            <AlertTriangle size={12} className="text-amber-500" />
                            <span className="text-sm text-amber-600">Deleted</span>
                        </div>
                     ) : (
                         <select
                            value={categoryId}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            className={`w-full bg-transparent text-sm outline-none cursor-pointer transition-colors ${isDirty ? 'text-indigo-600' : categoryId === '' ? 'text-slate-400' : 'text-slate-600 hover:text-slate-900'}`}
                         >
                            <option value="">Select...</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                         </select>
                     )}
                </div>

                {/* 4. Subcategory - Dropdown */}
                <div className="pl-4 pr-6">
                     <select
                        value={subcategoryName}
                        onChange={(e) => handleSubcategoryChange(e.target.value)}
                        disabled={!categoryId}
                        className={`w-full bg-transparent text-sm outline-none cursor-pointer transition-colors ${!categoryId ? 'text-slate-300' : isDirty ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                     >
                        {!categoryId && <option value="">--</option>}
                        {subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                     </select>
                </div>

                {/* 5. Description (Merchant) + Bank */}
                <div className="px-8 min-w-0 border-l border-slate-100">
                     <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`font-medium bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 text-sm ${isDirty ? 'text-indigo-700' : 'text-slate-700 focus:text-indigo-600'}`}
                        placeholder="Merchant"
                    />
                     {t.bankName && (
                        <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                            {t.bankName}
                        </span>
                    )}
                </div>

                {/* 6. GBP Amount */}
                <div className="px-4 text-right">
                    <span className={`text-sm font-medium ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        £{(t.amountGBP || t.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>

                {/* 7. AED Amount - Only show for Wio Bank */}
                <div className="px-4 text-right">
                    <span className={`text-sm font-medium ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                        {t.bankName === 'Wio Bank' && (t.amountAED || 0) > 0
                            ? `AED ${(t.amountAED || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                    </span>
                </div>

                {/* 8. Action */}
                <div className="px-4 flex items-center justify-end gap-1">
                    {isDirty && (
                        <button
                            onClick={handleManualSave}
                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Save"
                        >
                            <Save size={14} />
                        </button>
                    )}
                    {saveStatus === 'success' && (
                        <span className="text-emerald-500"><Check size={14} /></span>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onExclude(t.id); }}
                        className={`p-1 transition-colors ${isExcluded ? 'text-emerald-500' : 'text-slate-300 hover:text-slate-500'}`}
                        title={isExcluded ? "Include" : "Exclude"}
                    >
                        {isExcluded ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                        className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
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
  // Desktop Grid Template: Date | Type | Category | Subcategory | Merchant | GBP | AED | Action
  const gridTemplate = "grid-cols-[95px_85px_150px_150px_1fr_110px_110px_80px]";
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
        <div className="flex flex-col h-full bg-transparent overflow-visible md:overflow-hidden">
        {/* Desktop Header - Mercury Table Style */}
        <div className={`hidden md:grid ${gridTemplate} py-3 border-b border-slate-200 text-[11px] font-medium text-slate-400 uppercase tracking-wider`}>
            <div className="px-6">Date</div>
            <div className="px-6">Type</div>
            <div className="pl-6 pr-4">Category</div>
            <div className="pl-4 pr-6">Subcategory</div>
            <div className="px-8 border-l border-slate-100">Merchant</div>
            <div className="px-4 text-right">GBP</div>
            <div className="px-4 text-right">AED</div>
            <div className="px-4 text-right">Action</div>
        </div>

        {/* Mobile Header - Mercury Style */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-slate-200">
            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Transactions</span>
            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Amount</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2 md:gap-3 py-1 md:py-3 pb-8 md:pb-3 min-h-[350px] md:min-h-[450px]">
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
