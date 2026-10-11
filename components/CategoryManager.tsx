
import React, { useState, useEffect, useMemo } from 'react';
import { Category, Transaction, TransactionType, MerchantMapping } from '../types';
import { Plus, Tag, FolderPlus, X, Check, Trash2, Search, ChevronRight, Layers, AlertTriangle, Pencil, Sparkles } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import SafeDeleteModal, { DeleteTarget } from './SafeDeleteModal';

interface CategoryManagerProps {
  categories: Category[];
  transactions?: Transaction[];
  onAddCategory: (category: Category) => void;
  onUpdateCategory: (categoryId: string, updates: { name?: string; color?: string }) => void;
  onAddSubcategory: (categoryId: string, subcategory: string) => void;
  onDeleteSubcategory: (categoryId: string, subcategory: string) => void;
  onRenameSubcategory?: (categoryId: string, oldName: string, newName: string) => void;
  onDeleteCategory: (categoryId: string, reassignToCategoryId?: string | null) => void;
  onUpdateTransaction?: (id: string, updates: Partial<Transaction>) => void;
  getCategoryEmoji?: (categoryId: string) => string;
  onEmojiChange?: (categoryId: string, emoji: string) => void;
  onReapplyAllEmojis?: () => void;
  currency?: 'GBP' | 'AED';
  // Subcategories left out of totals ("categoryId\u0001subcategory"), and switching one on or off
  notCounted?: Set<string>;
  onToggleCounted?: (categoryId: string, subcategory: string, counted: boolean) => void;
  // Remembered places, to show which ones file themselves under a category
  mappings?: MerchantMapping[];
  // "Show the payments" from a delete that's blocked (too many payments use it)
  onShowPayments?: (categoryId: string, subcategory: string | null) => void;
}

const PRESET_COLORS = [
  // Reds & Pinks
  '#ef4444', '#dc2626', '#f43f5e', '#ec4899', '#db2777', '#be185d',
  // Oranges & Yellows
  '#f97316', '#ea580c', '#d97706', '#eab308', '#ca8a04', '#facc15',
  // Greens
  '#10b981', '#059669', '#22c55e', '#16a34a', '#84cc16', '#65a30d',
  // Blues & Cyans
  '#3b82f6', '#2563eb', '#0ea5e9', '#06b6d4', '#0891b2', '#0d9488',
  // Purples & Indigos
  '#8b5cf6', '#7c3aed', '#6366f1', '#4f46e5', '#a855f7', '#9333ea',
  // Neutrals & Browns
  '#64748b', '#475569', '#78716c', '#a8a29e', '#92400e', '#b45309'
];

const DeleteCategoryModal = ({
    isOpen,
    onClose,
    onConfirm,
    categoryName
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    categoryName: string;
}) => {
    return (
        <AnimatedModal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-neutral-200">Delete Category?</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 mt-2 leading-relaxed">
                        Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-neutral-200">{categoryName}</span>?
                        This action cannot be undone.
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
                        Delete
                    </button>
                </div>
            </div>
        </AnimatedModal>
    );
};

// Shown instead of the plain DeleteCategoryModal whenever the category being deleted still has
// transactions under it — lets each one be individually recategorized right here (a per-row
// dropdown, not one bulk "move everything" choice) before the delete is allowed to go through.
// There's no real foreign key linking transactions to categories (they're matched by name at
// load time), so deleting the category out from under them would otherwise silently orphan them.
const RecategorizeModal = ({
    isOpen,
    onClose,
    onDone,
    categoryName,
    excludeCategoryId,
    transactionsToFix,
    categories,
    onUpdateTransaction
}: {
    isOpen: boolean;
    onClose: () => void;
    onDone: () => void;
    categoryName: string;
    excludeCategoryId: string;
    transactionsToFix: Transaction[];
    categories: Category[];
    onUpdateTransaction?: (id: string, updates: Partial<Transaction>) => void;
}) => {
    const [selections, setSelections] = useState<Record<string, { categoryId: string; subcategoryName: string }>>({});
    const [descriptions, setDescriptions] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            setSelections({});
            setDescriptions(Object.fromEntries(transactionsToFix.map(t => [t.id, t.description || ''])));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const allAssigned = transactionsToFix.length > 0 && transactionsToFix.every(t => selections[t.id]?.categoryId);

    const handleCategoryPick = (txId: string, newCategoryId: string) => {
        setSelections(prev => ({ ...prev, [txId]: { categoryId: newCategoryId, subcategoryName: '' } }));
    };
    const handleSubcategoryPick = (txId: string, subcategoryName: string) => {
        setSelections(prev => ({ ...prev, [txId]: { categoryId: prev[txId]?.categoryId || '', subcategoryName } }));
    };

    const handleSave = () => {
        transactionsToFix.forEach(t => {
            const selection = selections[t.id];
            const newCategory = categories.find(c => c.id === selection?.categoryId);
            if (newCategory) {
                onUpdateTransaction?.(t.id, {
                    categoryId: newCategory.id,
                    categoryName: newCategory.name,
                    subcategoryName: selection.subcategoryName || '',
                    description: descriptions[t.id] ?? t.description
                });
            }
        });
        onDone();
    };

    return (
        <AnimatedModal
            isOpen={isOpen}
            onClose={onClose}
            panelClassName="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] p-6 sm:p-7 border border-slate-100 dark:border-neutral-700 flex flex-col"
        >
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                    <AlertTriangle size={20} />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-neutral-200">Recategorize before deleting {categoryName}</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-500 mt-2 mb-4 shrink-0 leading-relaxed">
                Pick a new category (and subcategory, if you like) for each transaction below — {categoryName} deletes once they're all set.
            </p>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 -mx-1 px-1">
                {transactionsToFix.map(t => {
                    const options = categories.filter(c => c.id !== excludeCategoryId && c.id !== 'excluded' && c.type === t.type);
                    const selection = selections[t.id];
                    const pickedCategory = categories.find(c => c.id === selection?.categoryId);
                    const amount = t.amountGBP || t.amount || 0;
                    return (
                        <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 bg-slate-50 dark:bg-neutral-700/50 rounded-xl border border-slate-100 dark:border-neutral-700">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`px-1.5 py-px text-[9px] font-bold rounded-full shrink-0 ${t.type === 'INCOME' ? 'text-white bg-emerald-500' : 'text-white bg-rose-500'}`}>
                                        {t.type === 'INCOME' ? 'IN' : 'OUT'}
                                    </span>
                                    <input
                                        type="text"
                                        value={descriptions[t.id] ?? t.description ?? ''}
                                        onChange={(e) => setDescriptions(prev => ({ ...prev, [t.id]: e.target.value }))}
                                        placeholder="Unknown"
                                        className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-700 dark:text-neutral-300 outline-none border-b border-transparent hover:border-slate-300 focus:border-violet-500 transition-colors"
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] text-slate-400 dark:text-neutral-500">{t.date}</span>
                                    <span className="px-1.5 py-px bg-slate-200 dark:bg-neutral-600 rounded-full text-[10px] font-medium text-slate-500 dark:text-neutral-400 whitespace-nowrap truncate max-w-[140px]">{categoryName}</span>
                                    <span className={`text-xs font-bold tabular-nums ml-auto sm:ml-0 ${t.type === 'INCOME' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-neutral-300'}`}>
                                        £{amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                <select
                                    value={selection?.categoryId || ''}
                                    onChange={(e) => handleCategoryPick(t.id, e.target.value)}
                                    className="w-full sm:w-44 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-300 outline-none focus:border-violet-500 cursor-pointer"
                                >
                                    <option value="">Choose category...</option>
                                    {options.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <select
                                    value={selection?.subcategoryName || ''}
                                    onChange={(e) => handleSubcategoryPick(t.id, e.target.value)}
                                    disabled={!pickedCategory || pickedCategory.subcategories.length === 0}
                                    className="w-full sm:w-40 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-300 outline-none focus:border-violet-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <option value="">No subcategory</option>
                                    {pickedCategory?.subcategories.map(sub => (
                                        <option key={sub} value={sub}>{sub}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-3 w-full mt-4 shrink-0">
                <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl font-bold text-slate-700 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 transition-colors active:scale-95"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={!allAssigned}
                    className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    Save & Delete
                </button>
            </div>
        </AnimatedModal>
    );
};

const DeleteSubcategoryModal = ({
    isOpen,
    onClose,
    onConfirm,
    subcategoryName
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    subcategoryName: string;
}) => {
    return (
        <AnimatedModal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-neutral-200">Delete Subcategory?</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 mt-2 leading-relaxed">
                        Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-neutral-200">{subcategoryName}</span>?
                        This action cannot be undone.
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
                        Delete
                    </button>
                </div>
            </div>
        </AnimatedModal>
    );
};

const EMOJI_OPTIONS = [
  // Home & Living
  '🏠','🏡','🛋️','🧹','🔧','💡','🪴','🏗️',
  // Transport
  '🚗','🚕','⛽','🚌','🚇','🚲','✈️','🛳️',
  // Food & Drink
  '🍔','🍕','🍣','🛒','☕','🍷','🥗','🧁',
  // Shopping & Fashion
  '🛍️','👔','👗','👟','💄','💎','🎁','🛒',
  // Finance & Work
  '💰','💳','🏦','📊','💵','📈','🧾','💼',
  // Health & Fitness
  '🏥','💊','🏋️','🧘','🦷','🩺','❤️','🧠',
  // Entertainment
  '🎮','🎬','🎵','📺','🎭','🎪','🎯','🎲',
  // Education & Tech
  '📱','💻','🎓','📚','📝','🔬','🧪','📡',
  // Family & Pets
  '👶','👨‍👩‍👧','🐶','🐱','🐾','🧸','🍼','🎂',
  // Travel & Nature
  '🌍','🏖️','🏔️','🏨','🗺️','⛺','🌅','🎒',
  // Sports
  '⚽','🎾','⛳','🏊','🎿','🏄','🥊','🏆',
  // Misc
  '🎉','📦','🔑','🪙','⭐','🔔','🏷️','📌',
  // People (dark hair / medium skin)
  '👨🏻‍💼','👨🏻‍💻','👨🏻‍🍳','👨🏻‍🔧','👨🏻‍⚕️','👨🏻‍🎓','👨🏻‍🏫','🧔🏻',
  '🏃🏻‍♂️','🚴🏻‍♂️','💇🏻‍♂️','🙋🏻‍♂️','🤵🏻','🕺🏻','👨🏻‍👦','👨🏻',
];

const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  transactions = [],
  onAddCategory,
  onUpdateCategory,
  onAddSubcategory,
  onDeleteSubcategory,
  onRenameSubcategory,
  onDeleteCategory,
  onUpdateTransaction,
  getCategoryEmoji,
  onEmojiChange,
  onReapplyAllEmojis,
  currency = 'GBP',
  notCounted,
  onToggleCounted,
  mappings = [],
  onShowPayments,
}) => {
  // Selection State
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New Category State
  const [isCreating, setIsCreating] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('EXPENSE');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  // Edit Category State
  const [isEditing, setIsEditing] = useState(false);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('');

  // Inline subcategory rename state — which one (if any) is currently being edited
  const [editingSubcat, setEditingSubcat] = useState<string | null>(null);
  const [editSubcatName, setEditSubcatName] = useState('');

  const startEditingSubcat = (sub: string) => {
    setEditingSubcat(sub);
    setEditSubcatName(sub);
  };
  const saveSubcatRename = () => {
    if (editingSubcat && selectedCategoryId) {
      onRenameSubcategory?.(selectedCategoryId, editingSubcat, editSubcatName);
    }
    setEditingSubcat(null);
  };

  // New Subcategory State
  const [newSubcatName, setNewSubcatName] = useState('');

  // Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Subcategory Delete Confirmation State
  const [subcategoryToDelete, setSubcategoryToDelete] = useState<string | null>(null);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Initialize selection
  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const selectedCategory = useMemo(() => 
    categories.find(c => c.id === selectedCategoryId), 
  [categories, selectedCategoryId]);

  const filteredCategories = useMemo(() => 
    categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
  [categories, searchQuery]);

  // Group categories for display
  const groupedCategories = useMemo(() => {
    return {
      income: filteredCategories.filter(c => c.type === 'INCOME'),
      expense: filteredCategories.filter(c => c.type === 'EXPENSE' && c.id !== 'excluded'),
      excluded: filteredCategories.filter(c => c.id === 'excluded')
    };
  }, [filteredCategories]);

  // How many transactions are currently tagged with the category about to be deleted — a
  // non-zero count blocks the delete until they're recategorized individually.
  const transactionsUnderSelectedCategory = useMemo(() =>
    selectedCategoryId ? transactions.filter(t => t.categoryId === selectedCategoryId) : [],
  [transactions, selectedCategoryId]);

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const id = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newCategory: Category = {
      id,
      name: newCatName,
      type: newCatType,
      color: newCatColor,
      subcategories: ['General']
    };

    onAddCategory(newCategory);
    setNewCatName('');
    setIsCreating(false);
    setSelectedCategoryId(id); // Switch to new category
  };

  const handleAddSubcategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !newSubcatName.trim()) return;
    
    onAddSubcategory(selectedCategoryId, newSubcatName.trim());
    setNewSubcatName('');
  };

  // ---- Careful deletes: warning, type DELETE, hold, then an Undo before anything really happens ----
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pending, setPending] = useState<{ key: string; label: string; timer: number; run: () => void } | null>(null);
  const pendingRef = React.useRef(pending);
  pendingRef.current = pending;
  // Run whatever is still waiting if the page closes (the Undo window simply ends early)
  useEffect(() => () => { const p = pendingRef.current; if (p) { window.clearTimeout(p.timer); p.run(); } }, []);

  const handleDeleteClick = () => {
    const cat = categories.find(c => c.id === selectedCategoryId);
    if (!cat || cat.id === 'excluded') return;
    setDeleteTarget({ kind: 'category', category: cat, payments: transactions.filter(t => t.categoryId === cat.id) });
  };

  const confirmDelete = (moveTo: string | null) => {
    const t = deleteTarget;
    if (!t) return;
    setDeleteTarget(null);
    if (pendingRef.current) { window.clearTimeout(pendingRef.current.timer); pendingRef.current.run(); }
    const [toCat, toSub] = (moveTo || '').split('\u0001');
    const target = categories.find(c => c.id === toCat);
    const name = t.kind === 'category' ? t.category.name : t.subcategory || 'No subcategory';
    const key = t.kind === 'category' ? t.category.id : `${t.category.id}\u0001${t.subcategory}`;
    const run = () => {
      if (target) t.payments.forEach(p => onUpdateTransaction?.(p.id, { categoryId: target.id, categoryName: target.name, subcategoryName: toSub || '' }));
      if (t.kind === 'category') onDeleteCategory(t.category.id, null);
      else onDeleteSubcategory(t.category.id, t.subcategory || '');
      setPending(null);
    };
    if (t.kind === 'category' && selectedCategoryId === t.category.id) { setSelectedCategoryId(null); setPhoneOpen(false); }
    const moved = target && t.payments.length ? ` · ${t.payments.length} ${t.payments.length === 1 ? 'payment' : 'payments'} moved to ${target.name}${toSub ? ` › ${toSub}` : ''}` : '';
    setPending({ key, label: `Deleted ${name}${moved}`, timer: window.setTimeout(run, 8000), run });
  };
  const undoDelete = () => {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    setPending(null);
  };

  // Handler for confirming delete
  const handleConfirmDelete = (reassignToCategoryId?: string | null) => {
    if (selectedCategoryId && selectedCategoryId !== 'excluded') {
       onDeleteCategory(selectedCategoryId, reassignToCategoryId);
       setShowDeleteConfirm(false);
       setSelectedCategoryId(null); // Deselect after delete
    }
  };

  // Handler for opening subcategory delete confirmation
  const handleSubcategoryDeleteClick = (subcategoryName: string) => {
    const cat = categories.find(c => c.id === selectedCategoryId);
    if (!cat) return;
    setDeleteTarget({ kind: 'subcategory', category: cat, subcategory: subcategoryName, payments: transactions.filter(t => t.categoryId === cat.id && (t.subcategoryName || '').trim() === subcategoryName) });
  };

  // Handler for opening edit mode
  const handleEditClick = () => {
    if (selectedCategory && selectedCategory.id !== 'excluded') {
      setEditCatName(selectedCategory.name);
      setEditCatColor(selectedCategory.color);
      setIsEditing(true);
    }
  };

  // Handler for saving edits
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !editCatName.trim()) return;

    onUpdateCategory(selectedCategoryId, {
      name: editCatName.trim(),
      color: editCatColor
    });
    setIsEditing(false);
  };

  // Handler for confirming subcategory delete
  const handleConfirmSubcategoryDelete = () => {
    if (selectedCategoryId && subcategoryToDelete) {
      onDeleteSubcategory(selectedCategoryId, subcategoryToDelete);
      setSubcategoryToDelete(null);
    }
  };

  // ---- This year's numbers for every category and subcategory ----
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [tab, setTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [phoneOpen, setPhoneOpen] = useState(false); // phones: the list, or one category
  const [rowMenu, setRowMenu] = useState<string | null>(null); // phones: subcategory showing Rename / Delete

  const amt = (t: Transaction) => Math.abs((currency === 'GBP' ? t.amountGBP : t.amountAED) || 0);
  const fmt = (v: number) => (currency === 'GBP' ? '£' : 'AED ') + Math.round(v).toLocaleString('en-GB');
  const subKey = (catId: string, sub: string) => `${catId}\u0001${sub}`;
  const isCounted = (catId: string, sub: string) => !notCounted?.has(subKey(catId, sub));

  const stats = useMemo(() => {
    const year = transactions.reduce((y, t) => Math.max(y, Number(t.date?.slice(0, 4)) || 0), 0) || new Date().getFullYear();
    let lastMonth = 0;
    const cats = new Map<string, { total: number; notCounted: number; n: number; months: number[] }>();
    const subs = new Map<string, { total: number; n: number; places: Map<string, number> }>();
    // Every year: how many payments use each category, and when it was last used
    const ever = new Map<string, { n: number; last: string }>();
    transactions.forEach(t => {
      if (!t.categoryId || t.excluded || !t.date) return;
      const e = ever.get(t.categoryId) || { n: 0, last: '' };
      e.n++;
      if (t.date > e.last) e.last = t.date;
      ever.set(t.categoryId, e);
    });
    transactions.forEach(t => {
      if (!t.categoryId || t.excluded || !t.date?.startsWith(String(year))) return;
      const m = Number(t.date.slice(5, 7)) - 1;
      lastMonth = Math.max(lastMonth, m);
      const a = amt(t);
      const sub = (t.subcategoryName || '').trim();
      const c = cats.get(t.categoryId) || { total: 0, notCounted: 0, n: 0, months: Array(12).fill(0) };
      if (isCounted(t.categoryId, sub)) { c.total += a; c.months[m] += a; } else c.notCounted += a;
      c.n++;
      cats.set(t.categoryId, c);
      const s = subs.get(subKey(t.categoryId, sub)) || { total: 0, n: 0, places: new Map() };
      s.total += a; s.n++;
      const p = (t.description || '').trim();
      if (p) s.places.set(p, (s.places.get(p) || 0) + 1);
      subs.set(subKey(t.categoryId, sub), s);
    });
    return { year, lastMonth, cats, subs, ever };
  }, [transactions, currency, notCounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const listed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories
      .filter(c => (tab === 'INCOME' ? c.type === 'INCOME' : c.type !== 'INCOME'))
      .filter(c => pending?.key !== c.id)
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.subcategories.some(s => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.id === 'excluded' ? 1 : b.id === 'excluded' ? -1 : (stats.cats.get(b.id)?.total || 0) - (stats.cats.get(a.id)?.total || 0)));
  }, [categories, tab, searchQuery, stats, pending]);
  const listMax = Math.max(1, ...listed.map(c => stats.cats.get(c.id)?.total || 0));

  const card = 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl';
  const tile = (cat: Category, size: string) => (
    <span className={`${size} shrink-0 flex items-center justify-center`} style={{ background: `${cat.color || '#94A3B8'}1F` }}>
      {getCategoryEmoji ? getCategoryEmoji(cat.id) : '📊'}
    </span>
  );
  const Toggle: React.FC<{ on: boolean; onClick: () => void; label: string; disabled?: boolean }> = ({ on, onClick, label, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={on ? 'Counted in totals' : 'Not counted in totals'}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-neutral-600'}`}
    >
      <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  );

  const renderCategoryRow = (cat: Category) => {
    const s = stats.cats.get(cat.id);
    const on = !isPhone && selectedCategoryId === cat.id;
    return (
      <button
        key={cat.id}
        onClick={() => { setSelectedCategoryId(cat.id); setShowEmojiPicker(false); setEditingSubcat(null); if (isPhone) setPhoneOpen(true); }}
        className={`w-full grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center pl-[11px] pr-3.5 py-2.5 border-b border-slate-100 dark:border-neutral-700/70 border-l-[3px] text-left transition-colors ${on ? 'border-l-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-neutral-700/30'}`}
      >
        {tile(cat, 'w-9 h-9 rounded-[11px] text-[17px]')}
        <span className="min-w-0 flex flex-col gap-1">
          <span className="flex justify-between gap-2 text-[13.5px]">
            <span className="font-semibold text-slate-900 dark:text-neutral-100 truncate">{cat.name}</span>
            <span className="font-bold text-slate-900 dark:text-neutral-100 tabular-nums">{s ? fmt(s.total) : '—'}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="flex-1 h-1 rounded bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded transition-[width] duration-500" style={{ width: `${((s?.total || 0) / listMax) * 100}%`, background: cat.color || '#6366F1' }} /></span>
            <span className="text-[11px] text-slate-400 dark:text-neutral-500 whitespace-nowrap">{cat.subcategories.length} {cat.subcategories.length === 1 ? 'sub' : 'subs'}</span>
          </span>
        </span>
        <ChevronRight size={16} className="text-slate-300 dark:text-neutral-600" />
      </button>
    );
  };

  const listPanel = (
    <div className={`${card} overflow-hidden flex flex-col md:h-full`}>
      <div className="p-3 flex flex-col gap-2.5 shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search categories"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-[10px] bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 text-[16px] md:text-[13px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 outline-none focus:border-indigo-400"
          />
        </div>
        <div role="group" aria-label="Kind" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-[9px]">
          {([['EXPENSE', 'Spending'], ['INCOME', 'Income']] as const).map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex-1 h-7 rounded-[7px] text-[12px] transition-colors ${tab === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border-t border-slate-100 dark:border-neutral-700">
        {listed.map(renderCategoryRow)}
        {listed.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No categories found.</p>}
      </div>
    </div>
  );

  const sel = selectedCategory;
  const selStats = sel ? stats.cats.get(sel.id) : undefined;
  const monthsShown = stats.lastMonth + 1;
  const monthMax = Math.max(1, ...(selStats?.months.slice(0, monthsShown) || [0]));
  const subMax = sel ? Math.max(1, ...sel.subcategories.map(sb => stats.subs.get(subKey(sel.id, sb))?.total || 0)) : 1;
  const places = sel ? mappings.filter(m => m.category_id === sel.id) : [];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  const detailPanel = sel ? (
    <div className={`${card} md:h-full md:overflow-y-auto px-4 md:px-6 py-4 md:py-5`}>
      <div className="flex items-center gap-3 md:gap-3.5">
        <div className="relative">
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Change emoji" className="active:scale-95 transition-transform">
            {tile(sel, 'w-11 h-11 md:w-12 md:h-12 rounded-[14px] text-[22px]')}
          </button>
          {showEmojiPicker && (
            <div className="absolute top-14 left-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-slate-200 dark:border-neutral-600 p-2.5 w-[280px] max-h-[320px] overflow-y-auto">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">Choose emoji</p>
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => { onEmojiChange?.(sel.id, e); setShowEmojiPicker(false); }} className={`w-7 h-7 flex items-center justify-center rounded-lg text-base hover:bg-slate-100 dark:hover:bg-neutral-700 ${e === (getCategoryEmoji ? getCategoryEmoji(sel.id) : '') ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''}`}>{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] md:text-[22px] font-bold text-slate-900 dark:text-neutral-100 truncate">{sel.name}</h2>
          <p className="text-[12px] md:text-[12.5px] text-slate-500 dark:text-neutral-400 truncate">
            {sel.id === 'excluded' ? 'Never counted' : sel.type === 'INCOME' ? 'Income' : 'Spending'} · {sel.subcategories.length} {sel.subcategories.length === 1 ? 'subcategory' : 'subcategories'}
          </p>
        </div>
        {sel.id !== 'excluded' && (
          <button onClick={handleEditClick} className="h-9 px-3 rounded-[10px] border border-slate-200 dark:border-neutral-600 text-[12.5px] font-semibold text-slate-700 dark:text-neutral-200 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-neutral-700/50">
            <span className="w-3 h-3 rounded-full" style={{ background: sel.color }} />Edit
          </button>
        )}
      </div>

      {/* How much the category is used: four even columns (desktop), or a 2 × 2 grid (phones) */}
      {(() => {
        const ever = stats.ever.get(sel.id);
        const lastUsed = ever?.last ? (() => { const d = new Date(`${ever.last.slice(0, 10)}T12:00:00`); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}${d.getFullYear() !== stats.year ? ` ${d.getFullYear()}` : ''}`; })() : 'Never';
        const perMonth = (selStats?.n || 0) / monthsShown;
        const figures: [string, string][] = [
          [`Payments in ${stats.year}`, String(selStats?.n || 0)],
          ['All time', String(ever?.n || 0)],
          ['Last used', lastUsed],
          ['About', perMonth >= 1 ? `${Math.round(perMonth)} a month` : perMonth > 0 ? 'under 1 a month' : '—'],
        ];
        return (
          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-neutral-700/40 grid grid-cols-2 md:flex md:items-end md:py-3">
            {figures.map(([label, value], i) => (
              <div
                key={label}
                className={`min-w-0 px-4 py-2.5 md:py-0 md:flex-1 ${i % 2 ? 'border-l' : ''} ${i > 1 ? 'border-t md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''} border-slate-200 dark:border-neutral-700`}
              >
                <div className="text-[10.5px] text-slate-500 dark:text-neutral-400 whitespace-nowrap">{label}</div>
                <div className={`font-bold leading-tight text-slate-900 dark:text-neutral-100 whitespace-nowrap ${i === 0 ? 'text-[18px] md:text-[20px]' : 'text-[15px] md:text-[16px]'}`}>{value}</div>
              </div>
            ))}
          </div>
        );
      })()}
      {selStats && selStats.notCounted > 0 && (
        <p className="mt-2 text-[11.5px] text-slate-400 dark:text-neutral-500">{fmt(selStats.total)} counted this year · + {fmt(selStats.notCounted)} not counted</p>
      )}

      <div className="mt-5 flex justify-between items-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">Subcategories</span>
        {sel.id !== 'excluded' && onToggleCounted && <span className="text-[11px] text-slate-400 dark:text-neutral-500">Counted in totals</span>}
      </div>
      <div className="mt-1">
        {sel.subcategories.filter(sb => pending?.key !== subKey(sel.id, sb)).map(sub => {
          const s = stats.subs.get(subKey(sel.id, sub));
          const counted = isCounted(sel.id, sub);
          const top = s ? Array.from(s.places.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p) : [];
          if (editingSubcat === sub) {
            return (
              <div key={sub} className="flex items-center gap-2 min-h-[58px] border-t border-slate-100 dark:border-neutral-700">
                <input
                  type="text"
                  value={editSubcatName}
                  onChange={(e) => setEditSubcatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSubcatRename(); if (e.key === 'Escape') setEditingSubcat(null); }}
                  autoFocus
                  className="flex-1 min-w-0 h-9 px-3 rounded-[10px] border border-indigo-300 bg-white dark:bg-neutral-900 text-[16px] md:text-[14px] text-slate-900 dark:text-neutral-100 outline-none"
                />
                <button onClick={saveSubcatRename} className="w-9 h-9 rounded-[10px] bg-indigo-600 text-white flex items-center justify-center" aria-label="Save"><Check size={15} /></button>
                <button onClick={() => setEditingSubcat(null)} className="w-9 h-9 rounded-[10px] bg-slate-100 dark:bg-neutral-700 text-slate-500 flex items-center justify-center" aria-label="Cancel"><X size={15} /></button>
              </div>
            );
          }
          return (
            <div key={sub} className="group flex items-center gap-3 min-h-[58px] py-1.5 border-t border-slate-100 dark:border-neutral-700">
              <span className="flex-1 min-w-0">
                <span className={`block text-[14px] font-medium truncate ${counted ? 'text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>
                  {sub || 'No subcategory'}
                  {!counted && <span className="ml-1.5 align-[1px] inline-flex items-center h-[18px] px-1.5 rounded-full bg-slate-100 dark:bg-neutral-700 text-[10px] font-semibold text-slate-500 dark:text-neutral-400">Not counted</span>}
                </span>
                <span className="block text-[11.5px] text-slate-400 dark:text-neutral-500 truncate">
                  {s ? `${s.n} ${s.n === 1 ? 'payment' : 'payments'}${top.length ? ` · ${top.join(', ')}` : ''}` : `Nothing in ${stats.year}`}
                </span>
              </span>
              {isPhone ? (
                rowMenu === sub ? (
                  <span className="flex items-center gap-1">
                    {onRenameSubcategory && <button onClick={() => { setRowMenu(null); startEditingSubcat(sub); }} className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-neutral-700 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300">Rename</button>}
                    <button onClick={() => { setRowMenu(null); handleSubcategoryDeleteClick(sub); }} className="h-8 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[12px] font-semibold text-rose-600">Delete</button>
                  </span>
                ) : (
                  <button onClick={() => setRowMenu(sub)} aria-label={`More for ${sub}`} className="w-7 h-8 -mx-1 rounded-lg text-slate-400 flex items-center justify-center text-[18px] leading-none">⋯</button>
                )
              ) : (
                <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onRenameSubcategory && <button onClick={() => startEditingSubcat(sub)} title="Rename" className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-neutral-700 flex items-center justify-center"><Pencil size={14} /></button>}
                  <button onClick={() => handleSubcategoryDeleteClick(sub)} title="Delete" className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-neutral-700 flex items-center justify-center"><Trash2 size={14} /></button>
                </span>
              )}
              <span className={`${isPhone && rowMenu === sub ? 'hidden' : ''} w-[72px] md:w-[96px] shrink-0 text-right`}>
                <span className={`block text-[13.5px] font-bold tabular-nums ${counted ? 'text-slate-900 dark:text-neutral-100' : 'text-slate-400 dark:text-neutral-500'}`}>{s ? fmt(s.total) : '—'}</span>
                <span className="block mt-1 h-1 rounded bg-slate-100 dark:bg-neutral-700 overflow-hidden"><span className="block h-full rounded" style={{ width: `${counted && s ? (s.total / subMax) * 100 : 0}%`, background: sel.color }} /></span>
              </span>
              {sel.id !== 'excluded' && onToggleCounted && <Toggle on={counted} label={`Count ${sub} in totals`} onClick={() => onToggleCounted(sel.id, sub, !counted)} />}
            </div>
          );
        })}
      </div>
      <form onSubmit={handleAddSubcategory} className="mt-2.5 flex gap-2">
        <input
          type="text"
          value={newSubcatName}
          onChange={(e) => setNewSubcatName(e.target.value)}
          placeholder="+ New subcategory…"
          className="flex-1 min-w-0 h-10 px-3.5 rounded-xl border border-dashed border-slate-300 dark:border-neutral-600 focus:border-solid focus:border-indigo-400 bg-transparent text-[16px] md:text-[13.5px] text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 outline-none"
        />
        {newSubcatName.trim() && <button type="submit" className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold">Add</button>}
      </form>

      {places.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 dark:border-neutral-700 px-4 py-3">
          <div className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">Remembered places</div>
          <div className="text-[11.5px] text-slate-500 dark:text-neutral-400">
            {places.length} {places.length === 1 ? 'place files itself' : 'places file themselves'} here: {places.slice(0, 4).map(p => p.merchant_pattern).join(', ')}{places.length > 4 ? '…' : ''}
          </div>
        </div>
      )}

      {sel.id !== 'excluded' && (
        <button onClick={handleDeleteClick} className="mt-5 text-[12.5px] font-semibold text-rose-600 hover:text-rose-700">Delete {sel.name}…</button>
      )}
    </div>
  ) : (
    <div className={`${card} md:h-full flex flex-col items-center justify-center p-10 text-slate-400`}>
      <FolderPlus size={36} className="mb-3 opacity-30" />
      <p className="text-sm">Select a category</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 pb-24 md:pb-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Header */}
      {(!isPhone || !phoneOpen) ? (
        <div className="flex items-end justify-between gap-3 px-1 md:px-0">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-neutral-100">Categories</h1>
            <p className="text-xs md:text-[13px] text-slate-500 dark:text-neutral-400 mt-0.5">{categories.length} {categories.length === 1 ? 'category' : 'categories'} · totals for {stats.year}</p>
          </div>
          <div className="flex items-center gap-2">
            {onReapplyAllEmojis && (
              <button
                onClick={() => { if (window.confirm('Re-guess every category\'s emoji from its name? This overwrites any you\'ve set manually.')) onReapplyAllEmojis(); }}
                title="Re-guess emojis from names"
                className="w-9 h-9 md:w-10 md:h-10 rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-slate-500 flex items-center justify-center hover:text-slate-800"
              >
                <Sparkles size={16} />
              </button>
            )}
            <button onClick={() => setIsCreating(true)} className="h-9 md:h-10 px-3.5 md:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold flex items-center gap-1.5">
              <Plus size={15} /> <span className="md:hidden">New</span><span className="hidden md:inline">New category</span>
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setPhoneOpen(false); setShowEmojiPicker(false); }} className="self-start flex items-center gap-1 px-1 text-[14px] font-semibold text-indigo-700 dark:text-indigo-300">
          ‹ Categories
        </button>
      )}

      {isPhone ? (phoneOpen ? detailPanel : listPanel) : (
        <div className="grid grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-4 h-[calc(100vh-180px)] min-h-[520px]">
          {listPanel}
          {detailPanel}
        </div>
      )}

      <SafeDeleteModal
        target={deleteTarget}
        categories={categories}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        getCategoryEmoji={getCategoryEmoji}
        onShowPayments={onShowPayments}
      />

      {/* After a delete: a few seconds to change your mind */}
      {pending && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)_+_92px)] md:bottom-6 z-[150] w-[calc(100%-24px)] max-w-[460px] flex items-center gap-3 rounded-[14px] bg-slate-900 text-white px-4 py-3 shadow-xl">
          <span className="flex-1 text-[13px] leading-snug">{pending.label}</span>
          <button onClick={undoDelete} className="text-[13px] font-semibold text-indigo-300">Undo</button>
        </div>
      )}

      {/* Create Category Modal */}
      <AnimatedModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        panelClassName="relative w-full max-w-sm sm:max-w-lg bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
              <div className="p-3 sm:p-6 border-b border-slate-100 dark:border-neutral-700 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-700/50">
                 <h3 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-neutral-300">Create Category</h3>
                 <button onClick={() => setIsCreating(false)} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600">
                    <X size={18} className="sm:w-5 sm:h-5" />
                 </button>
              </div>

              <form onSubmit={handleCreateCategory} className="p-3 sm:p-6 space-y-4 sm:space-y-6">
                 <div className="space-y-3 sm:space-y-4">
                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1 sm:mb-1.5">Name</label>
                       <input
                         autoFocus
                         type="text"
                         value={newCatName}
                         onChange={(e) => setNewCatName(e.target.value)}
                         placeholder="e.g. Entertainment"
                         className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base text-slate-800 dark:text-neutral-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all"
                       />
                    </div>

                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1 sm:mb-1.5">Type</label>
                       <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <button
                            type="button"
                            onClick={() => setNewCatType('EXPENSE')}
                            className={`py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold border transition-all ${newCatType === 'EXPENSE' ? 'bg-rose-50 border-rose-200 text-rose-700 ring-2 ring-rose-500/20' : 'bg-white dark:bg-neutral-700 border-slate-200 dark:border-neutral-600 text-slate-500 dark:text-neutral-500 hover:bg-slate-50 dark:hover:bg-neutral-700'}`}
                          >
                             Expense
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewCatType('INCOME')}
                            className={`py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold border transition-all ${newCatType === 'INCOME' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-2 ring-emerald-500/20' : 'bg-white dark:bg-neutral-700 border-slate-200 dark:border-neutral-600 text-slate-500 dark:text-neutral-500 hover:bg-slate-50 dark:hover:bg-neutral-700'}`}
                          >
                             Income
                          </button>
                       </div>
                    </div>

                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1.5 sm:mb-2">Color</label>
                       <div className="flex flex-wrap gap-2 sm:gap-3">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewCatColor(c)}
                              className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${newCatColor === c ? 'ring-2 ring-offset-1 sm:ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            >
                               {newCatColor === c && <Check size={12} className="sm:w-4 sm:h-4 text-white drop-shadow-md" />}
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="pt-1 sm:pt-2">
                    <button
                      type="submit"
                      disabled={!newCatName.trim()}
                      className="w-full py-2.5 sm:py-3.5 bg-violet-600 text-white font-bold rounded-lg sm:rounded-xl text-sm sm:text-base hover:bg-violet-700 shadow-lg shadow-violet-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                    >
                       Create
                    </button>
                 </div>
              </form>
      </AnimatedModal>

      {/* Edit Category Modal */}
      <AnimatedModal
        isOpen={isEditing && !!selectedCategory}
        onClose={() => setIsEditing(false)}
        panelClassName="relative w-full max-w-sm sm:max-w-lg bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        {selectedCategory && (
          <>
              <div className="p-3 sm:p-6 border-b border-slate-100 dark:border-neutral-700 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-700/50">
                 <h3 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-neutral-300">Edit Category</h3>
                 <button onClick={() => setIsEditing(false)} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600">
                    <X size={18} className="sm:w-5 sm:h-5" />
                 </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-3 sm:p-6 space-y-4 sm:space-y-6">
                 <div className="space-y-3 sm:space-y-4">
                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1 sm:mb-1.5">Name</label>
                       <input
                         autoFocus
                         type="text"
                         value={editCatName}
                         onChange={(e) => setEditCatName(e.target.value)}
                         placeholder="e.g. Entertainment"
                         className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base text-slate-800 dark:text-neutral-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all"
                       />
                    </div>

                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1 sm:mb-1.5">Type</label>
                       <div className="py-2 sm:py-3 px-3 sm:px-4 bg-slate-50 dark:bg-neutral-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-500 dark:text-neutral-500 border border-slate-200 dark:border-neutral-600">
                          {selectedCategory.type === 'INCOME' ? 'Income' : 'Expense'}
                          <span className="text-slate-400 dark:text-neutral-500 font-medium ml-2">(cannot be changed)</span>
                       </div>
                    </div>

                    <div>
                       <label className="block text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1.5 sm:mb-2">Color</label>
                       <div className="flex flex-wrap gap-2 sm:gap-3">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditCatColor(c)}
                              className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${editCatColor === c ? 'ring-2 ring-offset-1 sm:ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            >
                               {editCatColor === c && <Check size={12} className="sm:w-4 sm:h-4 text-white drop-shadow-md" />}
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="pt-1 sm:pt-2">
                    <button
                      type="submit"
                      disabled={!editCatName.trim()}
                      className="w-full py-2.5 sm:py-3.5 bg-violet-600 text-white font-bold rounded-lg sm:rounded-xl text-sm sm:text-base hover:bg-violet-700 shadow-lg shadow-violet-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                    >
                       Save Changes
                    </button>
                 </div>
              </form>
          </>
        )}
      </AnimatedModal>
    </div>
  );
};

export default CategoryManager;
