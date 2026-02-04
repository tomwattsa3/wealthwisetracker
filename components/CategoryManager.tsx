
import React, { useState, useEffect, useMemo } from 'react';
import { Category, TransactionType } from '../types';
import { Plus, Tag, FolderPlus, X, Check, Trash2, Search, ChevronRight, Layers, AlertTriangle } from 'lucide-react';

interface CategoryManagerProps {
  categories: Category[];
  onAddCategory: (category: Category) => void;
  onAddSubcategory: (categoryId: string, subcategory: string) => void;
  onDeleteSubcategory: (categoryId: string, subcategory: string) => void;
  onDeleteCategory: (categoryId: string) => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#8b5cf6', 
  '#06b6d4', '#ec4899', '#10b981', '#3b82f6', 
  '#6366f1', '#64748b', '#84cc16', '#14b8a6'
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
                        <h3 className="text-lg font-bold text-slate-900">Delete Category?</h3>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            Are you sure you want to delete <span className="font-bold text-slate-900">{categoryName}</span>? 
                            This action cannot be undone.
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
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CategoryManager: React.FC<CategoryManagerProps> = ({ 
  categories, 
  onAddCategory, 
  onAddSubcategory, 
  onDeleteSubcategory,
  onDeleteCategory
}) => {
  // Selection State
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New Category State
  const [isCreating, setIsCreating] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('EXPENSE');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  // New Subcategory State
  const [newSubcatName, setNewSubcatName] = useState('');

  // Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Handler for opening delete confirmation
  const handleDeleteClick = () => {
    if (selectedCategoryId && selectedCategoryId !== 'excluded') {
       setShowDeleteConfirm(true);
    }
  };

  // Handler for confirming delete
  const handleConfirmDelete = () => {
    if (selectedCategoryId && selectedCategoryId !== 'excluded') {
       onDeleteCategory(selectedCategoryId);
       setShowDeleteConfirm(false);
       setSelectedCategoryId(null); // Deselect after delete
    }
  };

  // Helper to render a category row
  const renderCategoryRow = (cat: Category) => (
    <button
      key={cat.id}
      onClick={() => setSelectedCategoryId(cat.id)}
      className={`w-full flex items-center justify-between p-4 rounded-xl transition-all border group ${
        selectedCategoryId === cat.id 
          ? 'bg-violet-50 border-violet-200 shadow-sm ring-1 ring-violet-200' 
          : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100'
      }`}
    >
       <div className="flex items-center gap-4">
          <div className="w-4 h-4 rounded-full ring-2 ring-offset-2 ring-offset-white shadow-sm" style={{ backgroundColor: cat.color, '--tw-ring-color': cat.color } as any}></div>
          <div className="text-left">
             <p className={`text-base font-bold ${selectedCategoryId === cat.id ? 'text-violet-900' : 'text-slate-800'}`}>{cat.name}</p>
             <p className="text-xs text-slate-400 font-medium mt-0.5">{cat.subcategories.length} subcategories</p>
          </div>
       </div>
       
       <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${
             cat.type === 'INCOME' 
               ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
               : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}>
            {cat.type === 'INCOME' ? 'Income' : 'Expense'}
          </span>
          {selectedCategoryId === cat.id && <ChevronRight size={18} className="text-violet-500" />}
       </div>
    </button>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-[calc(100vh-140px)] min-h-[600px] gap-6 animate-in fade-in">
      
      {/* Left Panel: Category List - Now 50% width, with "Bigger" items */}
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full">
        
        {/* Header */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 space-y-3">
           <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                <Layers className="text-violet-600" size={20} />
                Categories
              </h2>
              <button 
                onClick={() => setIsCreating(true)}
                className="p-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                title="Add Category"
              >
                <Plus size={18} />
              </button>
           </div>
           
           {/* Search */}
           <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search categories..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none"
              />
           </div>
        </div>

        {/* List - Spacious Items (Bigger) grouped by Income / Expense / Excluded */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
           
           {/* Income Section */}
           {groupedCategories.income.length > 0 && (
             <div className="space-y-2">
               <h3 className="px-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Income Sources</h3>
               {groupedCategories.income.map(renderCategoryRow)}
             </div>
           )}

           {/* Expense Section */}
           {groupedCategories.expense.length > 0 && (
             <div className="space-y-2">
               <h3 className="px-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Expenses</h3>
               {groupedCategories.expense.map(renderCategoryRow)}
             </div>
           )}

           {/* Excluded Section */}
           {groupedCategories.excluded.length > 0 && (
             <div className="space-y-2">
               <h3 className="px-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Excluded</h3>
               {groupedCategories.excluded.map(renderCategoryRow)}
             </div>
           )}

           {filteredCategories.length === 0 && (
             <div className="p-8 text-center text-slate-400">
               <p className="text-sm">No categories found.</p>
             </div>
           )}
        </div>
      </div>

      {/* Right Panel: Subcategories - Now 50% width, with "Smaller" items */}
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full relative">
         {selectedCategory ? (
           <>
              {/* Header */}
              <div className="p-3 border-b border-slate-100 flex justify-between items-start bg-slate-50/30">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                       <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: selectedCategory.color }}></div>
                       <h2 className="text-xl font-bold text-slate-900">{selectedCategory.name}</h2>
                    </div>
                    <p className="text-slate-500 text-xs font-medium">Manage subcategories</p>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${
                        selectedCategory.type === 'INCOME' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                     }`}>
                        {selectedCategory.type}
                     </span>
                     {selectedCategory.id !== 'excluded' && (
                        <button 
                            onClick={handleDeleteClick}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete Category"
                        >
                            <Trash2 size={16} />
                        </button>
                     )}
                 </div>
              </div>

              {/* Subcategory List - Compact Items (Smaller) */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                 <div className="grid grid-cols-1 gap-2">
                    {selectedCategory.subcategories.map(sub => (
                       <div key={sub} className="group flex items-center justify-between p-2.5 bg-white border border-slate-100 rounded-lg hover:border-violet-200 hover:shadow-sm transition-all">
                          <div className="flex items-center gap-3">
                             <div className="p-1.5 bg-slate-50 rounded text-slate-400 group-hover:text-violet-500 transition-colors">
                                <Tag size={14} />
                             </div>
                             <span className="font-medium text-sm text-slate-700 group-hover:text-slate-900">{sub}</span>
                          </div>
                          
                          <button 
                            onClick={() => onDeleteSubcategory(selectedCategory.id, sub)}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Subcategory"
                          >
                             <Trash2 size={14} />
                          </button>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Footer: Add Subcategory */}
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                 <form onSubmit={handleAddSubcategory} className="flex gap-2">
                    <input 
                      type="text" 
                      value={newSubcatName}
                      onChange={(e) => setNewSubcatName(e.target.value)}
                      placeholder="New subcategory..."
                      className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all"
                    />
                    <button 
                      type="submit"
                      disabled={!newSubcatName.trim()}
                      className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200 flex items-center gap-2 text-sm"
                    >
                       <Plus size={16} />
                       <span className="hidden sm:inline">Add</span>
                    </button>
                 </form>
              </div>
           </>
         ) : (
           <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <FolderPlus size={48} className="mb-4 opacity-20" />
              <p className="font-medium text-sm">Select a category</p>
           </div>
         )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteCategoryModal 
         isOpen={showDeleteConfirm} 
         onClose={() => setShowDeleteConfirm(false)}
         onConfirm={handleConfirmDelete}
         categoryName={selectedCategory?.name || ''}
      />

      {/* Create Category Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCreating(false)}></div>
           <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-lg font-bold text-slate-800">Create New Category</h3>
                 <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                 </button>
              </div>
              
              <form onSubmit={handleCreateCategory} className="p-6 space-y-6">
                 <div className="space-y-4">
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Category Name</label>
                       <input 
                         autoFocus
                         type="text" 
                         value={newCatName}
                         onChange={(e) => setNewCatName(e.target.value)}
                         placeholder="e.g. Entertainment"
                         className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all"
                       />
                    </div>

                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Transaction Type</label>
                       <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setNewCatType('EXPENSE')}
                            className={`py-3 rounded-xl text-sm font-bold border transition-all ${newCatType === 'EXPENSE' ? 'bg-rose-50 border-rose-200 text-rose-700 ring-2 ring-rose-500/20' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                             Expense
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewCatType('INCOME')}
                            className={`py-3 rounded-xl text-sm font-bold border transition-all ${newCatType === 'INCOME' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                             Income
                          </button>
                       </div>
                    </div>

                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Color Tag</label>
                       <div className="flex flex-wrap gap-3">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewCatColor(c)}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${newCatColor === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            >
                               {newCatColor === c && <Check size={16} className="text-white drop-shadow-md" />}
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="pt-2">
                    <button 
                      type="submit"
                      disabled={!newCatName.trim()}
                      className="w-full py-3.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 shadow-lg shadow-violet-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                    >
                       Create Category
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;
