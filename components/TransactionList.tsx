
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category } from '../types';
import { EyeOff, Eye, FileSpreadsheet, Save, AlertTriangle, Check, Trash2, ArrowUpDown, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import { DURATION, EASE_OUT } from '../lib/motion';

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
    selected: boolean;
    onToggleSelect: (id: string) => void;
}

const DeleteConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    count = 1
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    count?: number;
}) => {
    return (
        <AnimatedModal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-neutral-200">{count > 1 ? `Delete ${count} Transactions?` : 'Delete Transaction?'}</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 mt-2 leading-relaxed">
                        {count > 1
                            ? `This will permanently delete ${count} transactions. This action cannot be undone.`
                            : 'This will permanently delete this transaction. This action cannot be undone.'}
                    </p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 transition-colors active:scale-95"
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
        </AnimatedModal>
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
    return (
        <AnimatedModal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center text-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isCurrentlyExcluded ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {isCurrentlyExcluded ? <Eye size={24} /> : <EyeOff size={24} />}
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-neutral-200">
                        {isCurrentlyExcluded ? 'Include Transaction?' : 'Exclude Transaction?'}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 mt-2 leading-relaxed">
                        {isCurrentlyExcluded
                            ? 'This will include the transaction back in your totals and reports.'
                            : 'This will exclude the transaction from your totals and reports. You can include it again later.'}
                    </p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 transition-colors active:scale-95"
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
        </AnimatedModal>
    );
};

const BulkCategoryConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    count,
    categoryName,
    subcategoryName
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    count: number;
    categoryName: string;
    subcategoryName?: string;
}) => {
    return (
        <AnimatedModal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-neutral-200">Change category for {count} transactions?</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 mt-2 leading-relaxed">
                        This will overwrite the category{subcategoryName ? ' and subcategory' : ''} on <span className="font-semibold text-slate-700 dark:text-neutral-300">{count}</span> transaction{count > 1 ? 's' : ''} to
                        {' '}<span className="font-semibold text-slate-700 dark:text-neutral-300">{categoryName}{subcategoryName ? ` / ${subcategoryName}` : ''}</span>. Make sure this is really what you want to do — it cannot be undone in bulk.
                    </p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 transition-colors active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all active:scale-95"
                    >
                        Yes, Apply
                    </button>
                </div>
            </div>
        </AnimatedModal>
    );
};

const TransactionRow: React.FC<TransactionRowProps> = ({
    t,
    categories,
    onUpdate,
    onDelete,
    onExclude,
    gridTemplate,
    index,
    selected,
    onToggleSelect
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

    // Determine row styling - semantic states only, no alternating stripe
    const rowBackground = isExcluded
        ? 'bg-slate-100 dark:bg-neutral-700'
        : isCategoryMissing
            ? 'bg-amber-50 dark:bg-amber-950/30'
            : isDirty
                ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                : 'bg-white dark:bg-neutral-800';

    // Common cell styles for the "sheet" look - More spacious padding
    const cellClass = "h-full flex flex-col justify-center px-4 py-3 border-r border-slate-200/60 dark:border-neutral-600/60 last:border-r-0";

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.modal, ease: EASE_OUT, delay: Math.min(index * 0.015, 0.3) }}
        >
            {/* Mobile Row */}
            <div className={`md:hidden grid grid-cols-[1fr_100px_76px] gap-0.5 items-center border-b border-slate-100 dark:border-neutral-700 last:border-b-0 ${isCategoryMissing ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-white dark:bg-neutral-800'} ${isExcluded ? 'opacity-40' : ''}`}>
                <div className="px-3 py-3 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`px-1.5 py-px text-[7px] font-bold rounded-full shrink-0 ${displayType === 'INCOME' ? 'text-white bg-emerald-500' : 'text-white bg-rose-500'}`}>
                            {displayType === 'INCOME' ? 'IN' : 'OUT'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-neutral-400 truncate">{t.description || 'No merchant'}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 dark:text-neutral-500 mt-0.5 block">{t.date}</span>
                </div>
                <div className="py-3 flex flex-col items-end gap-0.5 min-w-0">
                    {t.categoryName && t.categoryName !== 'Excluded' && (
                        <span className="px-1.5 py-px bg-slate-100 dark:bg-neutral-700 rounded-full text-[7px] font-medium text-slate-500 dark:text-neutral-500 whitespace-nowrap truncate max-w-full leading-tight">{t.categoryName}</span>
                    )}
                    {t.subcategoryName && (
                        <span className="text-[8px] italic text-slate-400 dark:text-neutral-500 whitespace-nowrap truncate max-w-full">{t.subcategoryName}</span>
                    )}
                </div>
                <div className="pl-0.5 pr-2 py-3 text-right">
                    <span className={`text-[11px] font-semibold tabular-nums ${isExcluded ? 'text-slate-400 dark:text-neutral-500 line-through' : displayType === 'INCOME' ? 'text-emerald-700' : 'text-slate-800 dark:text-neutral-300'}`}>
                        £{(t.amountGBP || t.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Desktop Grid View */}
            <div className={`hidden md:grid ${gridTemplate} items-center border-b border-slate-100 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700/40 ${rowBackground} ${isExcluded ? 'opacity-50' : ''}`}>
                {/* 1. Date */}
                <div className="px-4 py-3.5">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-neutral-400 whitespace-nowrap">{t.date}</span>
                </div>

                {/* 2. Type - Pill Style */}
                <div className="px-3 py-3.5">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${displayType === 'INCOME' ? 'text-white bg-emerald-500' : 'text-white bg-rose-500'}`}>
                        {displayType === 'INCOME' ? 'IN' : 'OUT'}
                    </span>
                </div>

                {/* 3. Category */}
                <div className="pl-4 pr-3 py-3.5">
                     {isCategoryMissing ? (
                        <div className="flex items-center gap-1">
                            <AlertTriangle size={12} className="text-amber-500" />
                            <span className="text-[11px] text-amber-600">Deleted</span>
                        </div>
                     ) : (
                         <select
                            value={categoryId}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            className={`w-full bg-transparent dark:bg-transparent text-[11px] outline-none cursor-pointer transition-colors ${isDirty ? 'text-indigo-600' : categoryId === '' ? 'text-slate-400 dark:text-neutral-500' : 'text-slate-600 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-200'}`}
                         >
                            <option value="">Select...</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                         </select>
                     )}
                </div>

                {/* 4. Subcategory - Dropdown */}
                <div className="pl-3 pr-4 py-3.5">
                     <select
                        value={subcategoryName}
                        onChange={(e) => handleSubcategoryChange(e.target.value)}
                        disabled={!categoryId}
                        className={`w-full bg-transparent dark:bg-transparent text-[11px] outline-none cursor-pointer transition-colors ${!categoryId ? 'text-slate-300 dark:text-neutral-600' : isDirty ? 'text-indigo-600' : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'}`}
                     >
                        {!categoryId && <option value="">--</option>}
                        {subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                     </select>
                </div>

                {/* 5. Description (Merchant) + Bank */}
                <div className="px-4 py-3.5 min-w-0">
                     <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`font-medium bg-transparent w-full outline-none transition-colors truncate placeholder:text-slate-300 dark:placeholder:text-slate-600 text-[11px] ${isDirty ? 'text-indigo-700' : 'text-slate-700 dark:text-neutral-400 focus:text-indigo-600'}`}
                        placeholder="Merchant"
                    />
                     {t.bankName && (
                        <span className="text-[10px] text-slate-400 dark:text-neutral-500 truncate block mt-0.5">
                            {t.bankName}
                        </span>
                    )}
                </div>

                {/* 6. GBP Amount */}
                <div className="px-2 py-3.5 text-center">
                    <span className={`text-[11px] font-semibold ${isExcluded ? 'text-slate-400 dark:text-neutral-500 line-through' : 'text-slate-800 dark:text-neutral-300'}`}>
                        £{(t.amountGBP || t.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>

                {/* 7. AED Amount - Only show for Wio Bank */}
                <div className="px-2 py-3.5 text-center">
                    <span className={`text-[11px] font-medium ${isExcluded ? 'text-slate-400 dark:text-neutral-500 line-through' : 'text-slate-500 dark:text-neutral-500'}`}>
                        {(t.bankName === 'Wio Bank' || t.bankName === 'Revolut') && (t.amountAED || 0) > 0
                            ? `AED ${(t.amountAED || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                    </span>
                </div>

                {/* 8. Action */}
                <div className="px-3 py-3.5 flex items-center justify-end gap-1.5">
                    {isDirty && (
                        <button
                            onClick={handleManualSave}
                            className="px-2 py-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-md transition-colors flex items-center gap-1"
                            title="Save"
                        >
                            <Save size={12} />
                            <span>Save</span>
                        </button>
                    )}
                    {saveStatus === 'success' && (
                        <span className="text-emerald-500"><Check size={14} /></span>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onExclude(t.id); }}
                        className={`p-1.5 rounded-md transition-colors ${isExcluded ? 'text-white bg-emerald-500 hover:bg-emerald-600' : 'text-amber-600 bg-amber-100 hover:bg-amber-200'}`}
                        title={isExcluded ? "Include" : "Exclude"}
                    >
                        {isExcluded ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                        className="p-1.5 text-rose-600 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                {/* 9. Select */}
                <div className="px-2 py-3.5 flex items-center justify-center">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(t.id)}
                        className="w-3.5 h-3.5 rounded accent-[#635bff] cursor-pointer"
                    />
                </div>
            </div>
        </motion.div>
    );
};

const TransactionList: React.FC<TransactionListProps> = ({ transactions, categories, onUpdate, onDelete }) => {
  // Desktop Grid Template: Date | Type | Category | Subcategory | Merchant | GBP | AED | Action | Select
  const gridTemplate = "grid-cols-[100px_80px_140px_140px_1fr_80px_80px_160px_28px]";
  // Mobile Grid Template: simplified
  const mobileGridTemplate = "grid-cols-[1fr_auto_auto]";

  // Sort state: 'newest' or 'oldest'
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Sorted transactions
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [transactions, sortOrder]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkSubcategoryName, setBulkSubcategoryName] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = sortedTransactions.length > 0 && sortedTransactions.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map(t => t.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkCategoryId('');
    setBulkSubcategoryName('');
  };

  const bulkCategory = categories.find(c => c.id === bulkCategoryId);

  const handleBulkCategoryChange = (newCatId: string) => {
    setBulkCategoryId(newCatId);
    const cat = categories.find(c => c.id === newCatId);
    setBulkSubcategoryName(cat && cat.subcategories.length > 0 ? cat.subcategories[0] : '');
  };

  // Bulk category change is destructive-ish (overwrites categorization on many rows at once),
  // so it goes through a confirmation step rather than applying the moment Apply is clicked.
  const [bulkCategoryApplyPending, setBulkCategoryApplyPending] = useState(false);

  const handleApplyBulkCategory = () => {
    if (!bulkCategoryId || !bulkCategory) return;
    setBulkCategoryApplyPending(true);
  };

  const handleConfirmBulkCategoryApply = () => {
    if (!bulkCategoryId || !bulkCategory) return;
    selectedIds.forEach(id => {
      onUpdate(id, {
        categoryId: bulkCategoryId,
        categoryName: bulkCategory.name,
        subcategoryName: bulkSubcategoryName,
        type: bulkCategory.type
      });
    });
    setBulkCategoryApplyPending(false);
    clearSelection();
  };

  const handleBulkExclude = (exclude: boolean) => {
    selectedIds.forEach(id => {
      onUpdate(id, {
        categoryId: exclude ? 'excluded' : '',
        categoryName: exclude ? 'Excluded' : '',
        excluded: exclude
      });
    });
    clearSelection();
  };

  // State for tracking which transactions are pending delete (single or bulk)
  const [transactionsToDelete, setTransactionsToDelete] = useState<string[]>([]);

  // State for tracking which transaction is pending exclude/include toggle
  const [transactionToToggle, setTransactionToToggle] = useState<string | null>(null);

  const handleDeleteRequest = (id: string) => {
      setTransactionsToDelete([id]);
  };

  const handleBulkDeleteRequest = () => {
      setTransactionsToDelete(Array.from(selectedIds));
  };

  const handleConfirmDelete = () => {
      transactionsToDelete.forEach(id => onDelete(id));
      setTransactionsToDelete([]);
      clearSelection();
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
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-neutral-500 border border-slate-200 dark:border-neutral-600 rounded-xl bg-slate-50/50 dark:bg-neutral-700/50">
        <div className="bg-slate-100 dark:bg-neutral-700 p-4 rounded-full mb-3">
          <FileSpreadsheet size={24} className="opacity-50" />
        </div>
        <p className="text-sm font-medium">No transactions found</p>
      </div>
    );
  }

  return (
    <>
        <div className="flex flex-col h-full bg-transparent overflow-visible md:overflow-hidden">
        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/40 sticky top-0 z-20">
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">{selectedIds.size} selected</span>

                <select
                    value={bulkCategoryId}
                    onChange={(e) => handleBulkCategoryChange(e.target.value)}
                    className="text-[11px] bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-800 rounded-md px-2 py-1 outline-none text-slate-700 dark:text-neutral-300"
                >
                    <option value="">Change category...</option>
                    {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                {bulkCategory && bulkCategory.subcategories.length > 0 && (
                    <select
                        value={bulkSubcategoryName}
                        onChange={(e) => setBulkSubcategoryName(e.target.value)}
                        className="text-[11px] bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-800 rounded-md px-2 py-1 outline-none text-slate-700 dark:text-neutral-300"
                    >
                        {bulkCategory.subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                        ))}
                    </select>
                )}

                <button
                    onClick={handleApplyBulkCategory}
                    disabled={!bulkCategoryId}
                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                    Apply
                </button>

                <div className="w-px h-4 bg-indigo-200 dark:bg-indigo-800 mx-0.5" />

                <button
                    onClick={() => handleBulkExclude(true)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors flex items-center gap-1"
                >
                    <EyeOff size={12} /> Exclude
                </button>
                <button
                    onClick={() => handleBulkExclude(false)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors flex items-center gap-1"
                >
                    <Eye size={12} /> Include
                </button>
                <button
                    onClick={handleBulkDeleteRequest}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors flex items-center gap-1"
                >
                    <Trash2 size={12} /> Delete
                </button>

                <button
                    onClick={clearSelection}
                    className="ml-auto p-1 text-indigo-400 hover:text-indigo-700 rounded-md transition-colors"
                    title="Clear selection"
                >
                    <X size={14} />
                </button>
            </div>
        )}

        {/* Desktop Header */}
        <div className={`hidden md:grid ${gridTemplate} bg-white dark:bg-neutral-800 border-b border-slate-200 dark:border-neutral-700 sticky top-0 z-10`}>
            <button
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              className="px-4 py-2 flex items-center gap-1 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-neutral-300 transition-colors"
            >
              Date
              <ArrowUpDown size={10} />
            </button>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Type</div>
            <div className="pl-4 pr-3 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Category</div>
            <div className="pl-3 pr-4 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Subcategory</div>
            <div className="px-4 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Merchant</div>
            <div className="px-2 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-center">GBP</div>
            <div className="px-2 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-center">AED</div>
            <div className="px-3 py-2 text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-right">Action</div>
            <div className="px-2 py-2 flex items-center justify-center">
                <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-[#635bff] cursor-pointer"
                />
            </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden grid grid-cols-[1fr_100px_76px] gap-0.5 bg-white dark:bg-neutral-800 border-b border-slate-200 dark:border-neutral-700 sticky top-0 z-10">
            <button
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              className="px-3 py-1.5 flex items-center gap-1 text-[8px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-neutral-300 transition-colors"
            >
              Merchant
              <ArrowUpDown size={9} />
            </button>
            <div className="py-1.5 pr-1.5 text-[8px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-right">Category</div>
            <div className="px-2 py-1.5 text-[8px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-right">Amount</div>
        </div>

        {/* Rows */}
        <div data-no-pull-refresh className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-0 py-0 pb-4 md:pb-0 min-h-[350px] md:min-h-[450px]">
            <AnimatePresence initial={false}>
            {sortedTransactions.map((t, index) => (
                <TransactionRow
                    key={t.id}
                    t={t}
                    categories={categories}
                    onUpdate={onUpdate}
                    onDelete={handleDeleteRequest}
                    onExclude={handleExcludeRequest}
                    gridTemplate={gridTemplate}
                    index={index}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={toggleSelect}
                />
            ))}
            </AnimatePresence>
        </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
            isOpen={transactionsToDelete.length > 0}
            onClose={() => setTransactionsToDelete([])}
            onConfirm={handleConfirmDelete}
            count={transactionsToDelete.length}
        />

        {/* Exclude Confirmation Modal */}
        <ExcludeConfirmationModal
            isOpen={!!transactionToToggle}
            onClose={() => setTransactionToToggle(null)}
            onConfirm={handleConfirmToggle}
            isCurrentlyExcluded={isCurrentlyExcluded}
        />

        {/* Bulk Category Change Confirmation Modal */}
        <BulkCategoryConfirmationModal
            isOpen={bulkCategoryApplyPending}
            onClose={() => setBulkCategoryApplyPending(false)}
            onConfirm={handleConfirmBulkCategoryApply}
            count={selectedIds.size}
            categoryName={bulkCategory?.name || ''}
            subcategoryName={bulkSubcategoryName}
        />
    </>
  );
};

export default TransactionList;
