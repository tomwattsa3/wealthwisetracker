
import React, { useState, useEffect, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { Transaction, FinancialSummary, Category, Bank } from './types';
import { INITIAL_CATEGORIES, INITIAL_BANKS } from './constants';
import { supabase } from './supabaseClient';
import LoginPage from './components/LoginPage';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import StatsCard from './components/StatsCard';
import DashboardDateFilter, { DateRange } from './components/DashboardDateFilter';
import CategoryTrendWidget from './components/CategoryTrendWidget';
import CategoryManager from './components/CategoryManager';
import BankFeedUpload from './components/BankFeedUpload';
import YearlySummary from './components/YearlySummary';
import SettingsManager from './components/SettingsManager';
import {
  LayoutDashboard, Plus, Home, ListFilter, Search,
  ChevronLeft, ChevronRight, Filter, EyeOff,
  Car, Plane, Smartphone, Coffee, ShoppingBag, PoundSterling, Activity, X,
  ArrowUpDown, FolderCog, CalendarRange, Building, ArrowRightLeft, Settings,
  RotateCcw, Loader2, LogOut
} from 'lucide-react';

// Helper for category icons
const getCategoryIcon = (categoryId: string) => {
    switch(categoryId) {
        case 'apt': return <Home size={16} />;
        case 'car': return <Car size={16} />;
        case 'travel': return <Plane size={16} />;
        case 'personal': return <Smartphone size={16} />;
        case 'food': return <Coffee size={16} />;
        case 'groceries': return <ShoppingBag size={16} />;
        case 'income_salary': return <PoundSterling size={16} />;
        default: return <Activity size={16} />;
    }
};

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Logout handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // State Initialization
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
      return localStorage.getItem('webhookUrl') || '';
  });

  useEffect(() => {
      if (webhookUrl) {
          localStorage.setItem('webhookUrl', webhookUrl);
      } else {
          localStorage.removeItem('webhookUrl');
      }
  }, [webhookUrl]);

  // Date Filter State
  const [dateRange, setDateRange] = useState<DateRange>(() => {
      // Default to "This Year"
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
          label: 'This Year'
      };
  });

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'categories' | 'yearly' | 'settings'>(() => {
    const saved = localStorage.getItem('activeTab');
    if (saved && ['home', 'history', 'categories', 'yearly', 'settings'].includes(saved)) {
      return saved as 'home' | 'history' | 'categories' | 'yearly' | 'settings';
    }
    return 'home';
  });

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sidebar State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Filter States
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'INCOME' | 'EXPENSE'>('all');
  const [filterBank, setFilterBank] = useState<string>('all');

  // Breakdown View Mode (Category vs Subcategory)
  const [breakdownViewMode, setBreakdownViewMode] = useState<'category' | 'subcategory'>('category');

  // Widget Configuration State
  const [widgetCategoryIds, setWidgetCategoryIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('widgetCategoryIds');
    return saved ? JSON.parse(saved) : ['groceries', 'personal', 'car', 'income_salary', 'travel', 'apt', 'food'];
  });

  // Persist desktop widget selection
  useEffect(() => {
    localStorage.setItem('widgetCategoryIds', JSON.stringify(widgetCategoryIds));
  }, [widgetCategoryIds]);

  const handleAddDesktopWidget = () => {
    const allCats = [...expenseCategories, ...incomeCategories];
    const unusedCat = allCats.find(c => !widgetCategoryIds.includes(c.id));
    if (unusedCat) {
      setWidgetCategoryIds([...widgetCategoryIds, unusedCat.id]);
    } else if (allCats.length > 0) {
      setWidgetCategoryIds([...widgetCategoryIds, allCats[0].id]);
    }
  };

  // Widget deletion confirmation modal
  const [widgetToDelete, setWidgetToDelete] = useState<{ type: 'desktop' | 'mobile', index: number } | null>(null);

  const handleRemoveDesktopWidget = (index: number) => {
    setWidgetToDelete({ type: 'desktop', index });
  };

  const handleRemoveMobileCardWithConfirm = (index: number) => {
    setWidgetToDelete({ type: 'mobile', index });
  };

  const confirmWidgetDelete = () => {
    if (!widgetToDelete) return;

    if (widgetToDelete.type === 'desktop' && widgetCategoryIds.length > 1) {
      setWidgetCategoryIds(widgetCategoryIds.filter((_, i) => i !== widgetToDelete.index));
    } else if (widgetToDelete.type === 'mobile' && mobileCategoryIds.length > 1) {
      setMobileCategoryIds(mobileCategoryIds.filter((_, i) => i !== widgetToDelete.index));
    }
    setWidgetToDelete(null);
  };

  const cancelWidgetDelete = () => {
    setWidgetToDelete(null);
  };

  // Mobile Category Cards State
  const [mobileCategoryIds, setMobileCategoryIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('mobileCategoryIds');
    return saved ? JSON.parse(saved) : ['groceries', 'personal', 'car', 'food'];
  });

  // Persist mobile category selection
  useEffect(() => {
    localStorage.setItem('mobileCategoryIds', JSON.stringify(mobileCategoryIds));
  }, [mobileCategoryIds]);

  // Daily Average Card State - selected categories for calculation
  const [dailyAvgCategories, setDailyAvgCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('dailyAvgCategories');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist daily average category selection
  useEffect(() => {
    localStorage.setItem('dailyAvgCategories', JSON.stringify(dailyAvgCategories));
  }, [dailyAvgCategories]);

  const toggleDailyAvgCategory = (catId: string) => {
    setDailyAvgCategories(prev => {
      if (prev.includes(catId)) {
        return prev.filter(id => id !== catId);
      } else if (prev.length < 10) {
        return [...prev, catId];
      }
      return prev; // Max 10 categories
    });
  };

  const handleMobileCategoryChange = (index: number, newId: string) => {
    const newIds = [...mobileCategoryIds];
    newIds[index] = newId;
    setMobileCategoryIds(newIds);
  };

  const handleAddMobileCard = () => {
    // Find first category not already in the list
    const unusedCat = expenseCategories.find(c => !mobileCategoryIds.includes(c.id));
    if (unusedCat) {
      setMobileCategoryIds([...mobileCategoryIds, unusedCat.id]);
    } else if (expenseCategories.length > 0) {
      // If all used, just add the first one
      setMobileCategoryIds([...mobileCategoryIds, expenseCategories[0].id]);
    }
  };

  const handleRemoveMobileCard = (index: number) => {
    if (mobileCategoryIds.length > 1) {
      setMobileCategoryIds(mobileCategoryIds.filter((_, i) => i !== index));
    }
  };
  
  // --- SUPABASE DATA FETCHING ---
  const fetchData = async () => {
    try {
      setLoading(true);

      // Use local constants for banks (no DB table)
      setBanks(INITIAL_BANKS);

      // Fetch Categories from Supabase (with fallback)
      let activeCategories = INITIAL_CATEGORIES;
      try {
        console.log('Fetching categories...');
        const { data: catData, error: catError } = await supabase.from('Categories').select('*');
        console.log('Categories response:', { data: catData, error: catError });
        if (!catError && catData && catData.length > 0) {
          activeCategories = catData.map(c => ({
            id: c.id,
            name: c.name,
            subcategories: c.subcategories || [],
            type: c.type as 'INCOME' | 'EXPENSE',
            color: c.color || '#94a3b8'
          }));
          console.log('Loaded categories from Supabase:', activeCategories);
        } else {
          console.log('Using default categories');
        }
      } catch (catErr) {
        console.log('Categories table error, using defaults:', catErr);
      }
      setCategories(activeCategories);

      // Fetch Transactions from Supabase
      console.log('Fetching transactions...');
      const { data: txData, error: txError } = await supabase.from('Transactions').select('*');
      console.log('Transactions response:', { data: txData, error: txError, count: txData?.length });
      if (txError) {
        console.error('Transaction fetch error:', txError);
        throw txError;
      }

      // Map DB columns to app's expected format
      const mappedTxs: Transaction[] = (txData || []).map(t => {
          // Parse money columns - ensure they're numbers, handle null/undefined/string
          const moneyInGBP = Number(t['Money In - GBP']) || 0;
          const moneyOutGBP = Number(t['Money Out - GBP']) || 0;
          const moneyInAED = Number(t['Money In - AED']) || 0;
          const moneyOutAED = Number(t['Money Out - AED']) || 0;

          // Debug: log raw values from Supabase
          console.log('Transaction ID:', t.id, 'Raw values:', {
            'Money In - GBP': t['Money In - GBP'],
            'Money Out - GBP': t['Money Out - GBP'],
            parsed: { moneyInGBP, moneyOutGBP }
          });

          // Determine type based on which column has a value
          // If Money In > 0, it's income. If Money Out > 0, it's expense.
          const isIncome = moneyInGBP > 0;
          const isExpense = moneyOutGBP > 0;
          const type: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';
          const amount = isIncome ? moneyInGBP : moneyOutGBP;
          const originalAmount = isIncome ? moneyInAED : moneyOutAED;

          // Find categoryId from category name
          const categoryName = t['Catagory'] || '';
          const matchedCategory = activeCategories.find(c =>
            c.name.toLowerCase() === categoryName.toLowerCase()
          );
          const categoryId = matchedCategory?.id || '';

          return {
            id: String(t.id),
            date: t['Transaction Date'] || new Date().toISOString().split('T')[0],
            amount: Number(amount) || 0,
            originalAmount: originalAmount > 0 ? Number(originalAmount) : undefined,
            originalCurrency: originalAmount > 0 ? 'AED' : undefined,
            type,
            categoryId,
            categoryName,
            subcategoryName: t['Sub-Category'] || '',
            description: t['Description'] || '',
            notes: t['Note'] || '',
            excluded: categoryId === 'excluded',
            bankName: t['Bank Account'] || ''
          };
      });

      console.log('Mapped transactions:', mappedTxs.length, mappedTxs);
      setTransactions(mappedTxs);

    } catch (error) {
      console.error('Error fetching data from Supabase:', error);
      setCategories(INITIAL_CATEGORIES);
      setBanks(INITIAL_BANKS);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('App mounted, calling fetchData...');
    fetchData();
  }, []);

  // --- HANDLERS (UPDATED FOR SUPABASE) ---

  const handleAddCategory = async (newCat: Category) => {
    console.log('Adding category:', newCat);
    setCategories(prev => [...prev, newCat]);
    const { data, error } = await supabase.from('Categories').insert({
      id: newCat.id,
      name: newCat.name,
      subcategories: newCat.subcategories,
      type: newCat.type,
      color: newCat.color
    }).select();
    console.log('Category insert result:', { data, error });
  };

  const handleAddSubcategory = async (catId: string, sub: string) => {
    const categoryToUpdate = categories.find(c => c.id === catId);
    if (!categoryToUpdate) return;

    if (!categoryToUpdate.subcategories.includes(sub)) {
        const updatedSubs = [...categoryToUpdate.subcategories, sub];
        console.log('Adding subcategory:', { catId, sub, updatedSubs });
        setCategories(prev => prev.map(c => c.id === catId ? { ...c, subcategories: updatedSubs } : c));
        const { data, error } = await supabase.from('Categories').update({ subcategories: updatedSubs }).eq('id', catId).select();
        console.log('Subcategory update result:', { data, error });
    }
  };

  const handleDeleteSubcategory = async (catId: string, sub: string) => {
    const categoryToUpdate = categories.find(c => c.id === catId);
    if (!categoryToUpdate) return;

    const updatedSubs = categoryToUpdate.subcategories.filter(s => s !== sub);
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, subcategories: updatedSubs } : c));
    await supabase.from('Categories').update({ subcategories: updatedSubs }).eq('id', catId);
  };

  const handleDeleteCategory = async (catId: string) => {
    if (catId === 'excluded') return;
    setCategories(prev => prev.filter(c => c.id !== catId));
    await supabase.from('Categories').delete().eq('id', catId);
  };

  const handleUpdateCategory = async (catId: string, updates: { name?: string; color?: string }) => {
    if (catId === 'excluded') return;

    // Optimistic update
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, ...updates } : c
    ));

    // Update in Supabase
    const { error } = await supabase.from('Categories').update(updates).eq('id', catId);
    if (error) {
      console.error('Failed to update category:', error);
    }
  };

  const handleAddBank = (newBank: Bank) => {
    // Local only - no banks table in DB
    setBanks(prev => [...prev, newBank]);
  };

  const handleDeleteBank = (id: string) => {
    setBanks(prev => prev.filter(b => b.id !== id));
  };

  const handleResetFilters = () => {
    setFilterCategory('all');
    setFilterSubcategory('all');
    setFilterType('all');
    setFilterBank('all');
    setBreakdownViewMode('category');
  }

  const handleWidgetCategoryChange = (index: number, newId: string) => {
    const newIds = [...widgetCategoryIds];
    newIds[index] = newId;
    setWidgetCategoryIds(newIds);
  }

  const addTransaction = async (newTx: Omit<Transaction, 'id'>) => {
    const tempId = crypto.randomUUID();
    const txWithId = { ...newTx, id: tempId };

    // Optimistic update
    setTransactions(prev => [txWithId, ...prev]);

    try {
      // DB - Map to your Supabase schema
      const isIncome = newTx.type === 'INCOME';
      const dbPayload = {
          'Transaction Date': newTx.date,
          'Description': newTx.description,
          'Catagory': newTx.categoryName,
          'Sub-Category': newTx.subcategoryName,
          'Money Out - GBP': isIncome ? null : newTx.amount,
          'Money In - GBP': isIncome ? newTx.amount : null,
          'Money Out - AED': isIncome ? null : (newTx.originalAmount || null),
          'Money In - AED': isIncome ? (newTx.originalAmount || null) : null,
          'Bank Account': newTx.bankName,
          'Note': newTx.notes || null
      };

      console.log('Adding transaction to Supabase:', dbPayload);
      const { data, error } = await supabase.from('Transactions').insert(dbPayload).select();

      if (error) {
        console.error('Supabase insert error:', error.message);
        // Remove optimistic update on error
        setTransactions(prev => prev.filter(t => t.id !== tempId));
        alert('Failed to add transaction: ' + error.message);
      } else if (data && data[0]) {
        // Update with real Supabase ID
        setTransactions(prev => prev.map(t => t.id === tempId ? { ...t, id: String(data[0].id) } : t));
        console.log('Transaction added with ID:', data[0].id);
      }
    } catch (err) {
      console.error('Add transaction exception:', err);
      setTransactions(prev => prev.filter(t => t.id !== tempId));
    }
  };

  const handleImportTransactions = async (imported: Omit<Transaction, 'id'>[]) => {
      // Map all to your Supabase schema
      const dbPayloads = imported.map(t => {
          const isIncome = t.type === 'INCOME';
          return {
            'Transaction Date': t.date,
            'Description': t.description,
            'Catagory': t.categoryName,
            'Sub-Category': t.subcategoryName,
            'Money Out - GBP': isIncome ? null : t.amount,
            'Money In - GBP': isIncome ? t.amount : null,
            'Money Out - AED': isIncome ? null : (t.originalAmount || null),
            'Money In - AED': isIncome ? (t.originalAmount || null) : null,
            'Bank Account': t.bankName,
            'Note': t.notes || null
          };
      });

      console.log('Importing transactions to Supabase:', dbPayloads.length);
      const { data, error } = await supabase.from('Transactions').insert(dbPayloads).select();

      if (error) {
        console.error('Supabase import error:', error.message);
        alert('Failed to import transactions: ' + error.message);
        return;
      }

      if (data) {
          const newTxs: Transaction[] = data.map(t => {
            const moneyInGBP = t['Money In - GBP'] || 0;
            const moneyOutGBP = t['Money Out - GBP'] || 0;
            const moneyInAED = t['Money In - AED'] || 0;
            const moneyOutAED = t['Money Out - AED'] || 0;
            const isIncome = moneyInGBP > 0 || moneyInAED > 0;

            return {
              id: String(t.id),
              date: t['Transaction Date'] || new Date().toISOString().split('T')[0],
              amount: isIncome ? Number(moneyInGBP) : Number(moneyOutGBP),
              originalAmount: isIncome ? (moneyInAED > 0 ? Number(moneyInAED) : undefined) : (moneyOutAED > 0 ? Number(moneyOutAED) : undefined),
              originalCurrency: (moneyInAED > 0 || moneyOutAED > 0) ? 'AED' : undefined,
              type: isIncome ? 'INCOME' as const : 'EXPENSE' as const,
              categoryId: '',
              categoryName: t['Catagory'] || '',
              subcategoryName: t['Sub-Category'] || '',
              description: t['Description'] || '',
              notes: t['Note'] || '',
              excluded: false,
              bankName: t['Bank Account'] || ''
            };
          });
          setTransactions(prev => [...newTxs, ...prev]);
      }
  };

  const deleteTransaction = async (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    const numericId = parseInt(id, 10);
    const { error } = await supabase.from('Transactions').delete().eq('id', numericId);
    if (error) {
      console.error('Supabase delete error:', error);
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    console.log('=== UPDATE TRANSACTION ===');
    console.log('ID:', id, 'Updates:', updates);

    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

    try {
      const numericId = parseInt(id, 10);

      // Build update object - only include fields that are being updated
      const dbUpdates: Record<string, any> = {};

      if (updates.description !== undefined) {
        dbUpdates['Description'] = updates.description;
      }
      if (updates.categoryName !== undefined) {
        dbUpdates['Catagory'] = updates.categoryName;
      }
      if (updates.subcategoryName !== undefined) {
        dbUpdates['Sub-Category'] = updates.subcategoryName;
      }
      if (updates.notes !== undefined) {
        dbUpdates['Note'] = updates.notes;
        console.log('Adding Note to update:', updates.notes);
      }

      console.log('DB Updates:', dbUpdates);
      console.log('Numeric ID:', numericId);

      if (Object.keys(dbUpdates).length > 0) {
        const { data, error } = await supabase
          .from('Transactions')
          .update(dbUpdates)
          .eq('id', numericId)
          .select();

        console.log('Supabase response - Data:', data, 'Error:', error);

        if (error) {
          console.error('Update failed:', error);
          alert('Failed to save: ' + error.message);
        } else {
          console.log('Update successful!');
        }
      }
    } catch (err) {
      console.error('Exception:', err);
      alert('Failed to save transaction');
    }
  };

  // 1. Base Filter: By Date Range (Used for Dashboard KPI Summary)
  const dateFilteredTransactions = useMemo(() => {
     return transactions.filter(t => {
      return t.date >= dateRange.start && t.date <= dateRange.end;
     });
  }, [transactions, dateRange]);

  // 2. Date-Filtered Active Status (For KPI Summary Calculations)
  const activeTransactions = useMemo(() => {
    return dateFilteredTransactions.filter(t => !t.excluded && t.categoryId !== 'excluded');
  }, [dateFilteredTransactions]);

  // 3. Global Active Status (For Breakdown & Widgets - Pulls ALL history)
  const globalActiveTransactions = useMemo(() => {
    return transactions.filter(t => !t.excluded && t.categoryId !== 'excluded');
  }, [transactions]);

  // 4. Global Excluded Status
  const excludedTransactions = useMemo(() => {
    return transactions.filter(t => t.excluded || t.categoryId === 'excluded');
  }, [transactions]);

  // 5. Search & Filter Logic (For Transaction List - Uses date-filtered transactions)
  // Excluded transactions ARE shown in the list but not counted in totals
  const filteredTransactions = useMemo(() => {
    // Use dateFilteredTransactions to respect the date selector
    const sourceData = dateFilteredTransactions;

    return sourceData.filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterBank !== 'all' && t.bankName !== filterBank) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matches =
          t.description.toLowerCase().includes(query) ||
          t.amount.toString().includes(query) ||
          t.date.includes(query) ||
          t.categoryName.toLowerCase().includes(query) ||
          (t.notes && t.notes.toLowerCase().includes(query)) ||
          t.subcategoryName.toLowerCase().includes(query) ||
          (t.bankName && t.bankName.toLowerCase().includes(query));
        if (!matches) return false;
      }

      if (filterCategory !== 'all' && t.categoryId !== filterCategory) return false;
      if (filterSubcategory !== 'all' && t.subcategoryName !== filterSubcategory) return false;

      return true;
    }).sort((a, b) => {
      // Primary sort by date (newest first)
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Secondary sort by ID to maintain stable order for same-date transactions
      return a.id.localeCompare(b.id);
    });
  }, [dateFilteredTransactions, searchQuery, filterCategory, filterSubcategory, filterType, filterBank]);

  // Check if any specific filters are active (not including date filter)
  const hasActiveFilters = filterType !== 'all' || filterBank !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || searchQuery.trim() !== '';

  // Calculate total for filtered view (History Tab Total) - only shows value when filters are active
  const filteredTotal = useMemo(() => {
    // Return 0 if no filters are active
    if (!hasActiveFilters) return 0;

    return filteredTransactions
      .filter(t => !t.excluded && t.categoryId !== 'excluded')
      .reduce((acc, t) => {
        return t.type === 'INCOME' ? acc + t.amount : acc - t.amount;
      }, 0);
  }, [filteredTransactions, hasActiveFilters]);

  // KPI Summary (Respects Date Filter)
  const summary = useMemo<FinancialSummary>(() => {
    const incomeTransactions = activeTransactions.filter(t => t.type === 'INCOME');
    const expenseTransactions = activeTransactions.filter(t => t.type === 'EXPENSE');

    console.log('=== SUMMARY CALCULATION ===');
    console.log('Active transactions:', activeTransactions.length);
    console.log('Income transactions:', incomeTransactions.length, incomeTransactions);
    console.log('Expense transactions:', expenseTransactions.length);

    return activeTransactions.reduce(
      (acc, curr) => {
        if (curr.type === 'INCOME') {
          acc.totalIncome += curr.amount;
          acc.balance += curr.amount;
        } else {
          acc.totalExpense += curr.amount;
          acc.balance -= curr.amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );
  }, [activeTransactions]);

  // Summary for Breakdown Percentages (respects date filter)
  const globalSummary = useMemo<FinancialSummary>(() => {
    return activeTransactions.reduce(
      (acc, curr) => {
        if (curr.type === 'INCOME') {
          acc.totalIncome += curr.amount;
          acc.balance += curr.amount;
        } else {
          acc.totalExpense += curr.amount;
          acc.balance -= curr.amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );
  }, [activeTransactions]);

  // Daily Average Calculation - uses the same filters as transaction log including type filter
  const dailyAverageData = useMemo(() => {
    // Filter transactions based on type filter selection
    // If 'all' or 'EXPENSE' selected, show expenses. If 'INCOME' selected, show income.
    const targetType = filterType === 'INCOME' ? 'INCOME' : 'EXPENSE';

    const selectedTransactions = filteredTransactions.filter(t =>
      t.type === targetType &&
      !t.excluded &&
      t.categoryId !== 'excluded'
    );

    const totalAmount = selectedTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Calculate number of days in the selected date range
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const dailyAverage = totalAmount / daysDiff;

    return {
      totalSpend: totalAmount,
      dailyAverage,
      daysInRange: daysDiff,
      transactionCount: selectedTransactions.length,
      isIncome: targetType === 'INCOME'
    };
  }, [filteredTransactions, dateRange, filterType]);

  // Main Category Breakdown (respects date filter)
  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => {
      const catTransactions = activeTransactions.filter(t => t.categoryId === cat.id);
      const total = catTransactions.reduce((sum, t) => sum + t.amount, 0);
      return { category: cat, transactions: catTransactions, total };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  }, [activeTransactions, categories]);

  // Subcategory Breakdown (respects date filter)
  const subcategoryBreakdown = useMemo(() => {
    if (filterCategory === 'all') return [];

    const activeCat = categories.find(c => c.id === filterCategory);
    if (!activeCat) return [];

    const groups: Record<string, number> = {};

    activeTransactions.forEach(t => {
      if (t.type === 'EXPENSE' && t.categoryId === filterCategory) {
        groups[t.subcategoryName] = (groups[t.subcategoryName] || 0) + t.amount;
      }
    });

    return Object.entries(groups).map(([name, total]) => ({
      name,
      total,
      color: activeCat.color,
      parentId: activeCat.id
    })).sort((a, b) => b.total - a.total);
  }, [activeTransactions, filterCategory, categories]);

  // All Subcategories Breakdown (respects date filter)
  const allSubcategoryBreakdown = useMemo(() => {
     const groups: Record<string, { total: number, parentId: string, color: string }> = {};
     activeTransactions.forEach(t => {
        if (t.type === 'EXPENSE') {
            // Group by subcategory name
            if (!groups[t.subcategoryName]) {
                const parent = categories.find(c => c.id === t.categoryId);
                groups[t.subcategoryName] = {
                    total: 0,
                    parentId: t.categoryId,
                    color: parent?.color || '#94a3b8'
                };
            }
            groups[t.subcategoryName].total += t.amount;
        }
     });
     return Object.entries(groups).map(([name, data]) => ({
         name,
         total: data.total,
         color: data.color,
         parentId: data.parentId,
     })).sort((a, b) => b.total - a.total);
  }, [activeTransactions, categories]);

  // Derive available banks for filter (Configured Banks + Historical Banks)
  const availableBanks = useMemo(() => {
      const txBanks = new Set(transactions.map(t => t.bankName).filter(Boolean) as string[]);
      const configuredBanks = banks.map(b => b.name);
      
      const combined = new Set([...configuredBanks, ...txBanks]);
      return Array.from(combined).sort();
  }, [transactions, banks]);

  // Categories available for filter dropdown (Dynamic)
  const expenseCategories = categories.filter(c => c.type === 'EXPENSE');
  const incomeCategories = categories.filter(c => c.type === 'INCOME');
  const allCategories = categories;
  
  // Subcategories available: either specific to category, OR all unique ones if category is 'all'
  const availableSubcategories = useMemo(() => {
    if (filterCategory !== 'all') {
        return categories.find(c => c.id === filterCategory)?.subcategories || [];
    }
    // All unique subcategories
    const subs = new Set<string>();
    categories.filter(c => c.type === 'EXPENSE').forEach(c => {
        c.subcategories.forEach(s => subs.add(s));
    });
    return Array.from(subs).sort();
  }, [categories, filterCategory]);

  // Auth loading state
  if (authLoading) {
    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 flex-col gap-3">
             <Loader2 size={32} className="animate-spin text-slate-400" />
             <p className="text-slate-500 font-medium text-sm">Checking authentication...</p>
        </div>
    );
  }

  // Show login if not authenticated
  if (!session) {
    return <LoginPage />;
  }

  // Data loading state
  if (loading) {
    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 flex-col gap-3">
             <Loader2 size={32} className="animate-spin text-slate-400" />
             <p className="text-slate-500 font-medium text-sm">Loading financial data...</p>
        </div>
    );
  }

  return (
    <div className="bg-slate-50 h-screen font-['Poppins'] text-slate-900 overflow-hidden">
      
      {/* App Wrapper - Updated sidebar gap to md:gap-0 */}
      <div className="max-w-[1920px] mx-auto h-full flex flex-col md:flex-row md:gap-0">
        
        {/* Collapsible Sidebar - Simplified Styles */}
        <nav
          className={`
            fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 z-50 pb-2 pt-1
            md:relative md:border-r md:border-t-0 md:flex-col md:h-full md:p-4 md:pb-4 md:pt-4 md:justify-start
            transition-all duration-300 ease-in-out
            ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}
          `}
        >
           {/* Desktop Toggle */}
           <button 
             onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
             className="hidden md:flex absolute -right-3 top-8 bg-white text-slate-400 p-1.5 rounded-full border border-slate-200 hover:text-slate-900 transition-all z-50 shadow-sm"
           >
             {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
           </button>

           {/* Logo */}
           <div className={`hidden md:flex items-center gap-3 mb-10 px-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}>
             <div className="bg-slate-900 p-2 rounded-xl shadow-sm shrink-0">
               <LayoutDashboard className="text-white" size={18} />
             </div>
             {!isSidebarCollapsed && (
                <div className="animate-in fade-in duration-300">
                   <h1 className="text-base font-bold tracking-tight text-slate-900">WealthWise</h1>
                </div>
             )}
           </div>

           <div className="flex justify-around items-center px-2 md:flex-col md:h-auto md:gap-1 md:items-stretch md:px-0 overflow-x-auto md:overflow-x-visible no-scrollbar">
             {[
               { id: 'home', icon: Home, label: 'Dashboard', mobileLabel: 'Home', mobileOnly: true },
               { id: 'history', icon: ArrowRightLeft, label: 'Transactions', mobileLabel: 'Trans', mobileOnly: true },
               { id: 'yearly', icon: CalendarRange, label: 'Yearly', mobileLabel: 'Yearly', mobileOnly: true },
               { id: 'categories', icon: FolderCog, label: 'Categories', mobileLabel: 'Cats', mobileOnly: true },
               { id: 'settings', icon: Settings, label: 'Settings', mobileLabel: 'Settings', mobileOnly: false }
             ].map((item) => (
               <button
                 key={item.id}
                 onClick={() => setActiveTab(item.id as any)}
                 className={`
                   flex flex-col md:flex-row md:gap-3 p-1.5 md:p-2.5 items-center justify-center rounded-lg md:rounded-xl transition-all duration-200 group relative flex-shrink-0
                   ${activeTab === item.id
                     ? 'text-slate-900 bg-slate-100 font-semibold'
                     : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                   ${!isSidebarCollapsed ? 'md:justify-start md:px-3' : ''}
                   ${!item.mobileOnly ? 'hidden md:flex' : ''}
                 `}
               >
                 <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                 {/* Mobile label */}
                 <span className="text-[9px] mt-0.5 md:hidden">{item.mobileLabel}</span>
                 {/* Desktop label */}
                 {!isSidebarCollapsed && <span className="text-sm hidden md:block">{item.id === 'yearly' ? 'Yearly Summary' : item.label}</span>}

                 {/* Tooltip for collapsed state */}
                 {isSidebarCollapsed && (
                   <span className="absolute left-14 bg-slate-900 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-slate-700 pointer-events-none hidden md:block shadow-lg">
                     {item.id === 'yearly' ? 'Yearly Summary' : item.label}
                   </span>
                 )}
               </button>
             ))}

           </div>
           
           {/* Desktop Add Button */}
           <div className="hidden md:block mt-8">
             <button
                onClick={() => setIsModalOpen(true)}
                className={`
                  w-full bg-slate-900 text-white py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 hover:bg-slate-800
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                <Plus size={18} />
                {!isSidebarCollapsed && <span className="text-sm">Add New</span>}
              </button>
           </div>

           {/* Logout Button - Desktop */}
           <div className="hidden md:block mt-auto pt-4 border-t border-slate-100">
             <button
                onClick={handleLogout}
                className={`
                  w-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                <LogOut size={18} />
                {!isSidebarCollapsed && <span className="text-sm">Logout</span>}
              </button>
           </div>
        </nav>

        {/* Main Content Area - Updated padding */}
        <main className="flex-1 h-full overflow-y-auto bg-slate-50 p-2 pb-24 md:px-8 md:py-6 max-w-[100vw]">
          
          {/* Top Bar with Filter & Search (Hidden in Cat/Yearly View) */}
          {activeTab !== 'categories' && activeTab !== 'yearly' && activeTab !== 'settings' && (
            <div className="flex flex-col gap-4 mb-6 md:mb-8">
                
                {/* Mobile Dashboard Headline */}
                <div className="md:hidden pt-2 flex justify-between items-center">
                   <h1 className="text-2xl font-bold text-slate-900">
                     {activeTab === 'home' ? 'Dashboard' : 'Transactions'}
                   </h1>
                   <div className="flex items-center gap-2">
                     <button
                       onClick={() => window.location.reload()}
                       className="p-2 bg-white border border-slate-200 rounded-full text-slate-500 shadow-sm active:scale-95 transition-transform"
                     >
                       <RotateCcw size={18} />
                     </button>
                     <button
                       onClick={handleLogout}
                       className="p-2 bg-white border border-slate-200 rounded-full text-slate-500 hover:text-rose-600 hover:border-rose-200 shadow-sm active:scale-95 transition-all"
                       title="Logout"
                     >
                       <LogOut size={18} />
                     </button>
                   </div>
                </div>

                {/* Mobile Header */}
                <div className="flex md:hidden items-center gap-3 w-full px-1">
                    {activeTab === 'history' && (
                        <div className="relative flex-1 group">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                <Search size={16} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-sm placeholder:text-slate-400"
                            />
                        </div>
                    )}
                    <div className={activeTab === 'history' ? "w-[45%]" : "w-full"}>
                        <DashboardDateFilter range={dateRange} onRangeChange={setDateRange} />
                    </div>
                </div>

                <div className="hidden md:flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                        {activeTab === 'home' && 'Dashboard'}
                        {activeTab === 'history' && 'Transactions'}
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">
                        Manage your finances with confidence.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
                    {/* Global Search - Only show in history tab */}
                    {activeTab === 'history' && (
                        <div className="relative group w-full sm:w-auto">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                            <Search size={16} />
                            </div>
                            <input
                            type="text"
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-sm placeholder:text-slate-400"
                            />
                        </div>
                    )}
                    
                    {/* Desktop Date Filter */}
                    <div className="hidden md:block">
                        <DashboardDateFilter range={dateRange} onRangeChange={setDateRange} />
                    </div>

                    {/* Refresh Button */}
                    <button
                      onClick={() => window.location.reload()}
                      className="hidden md:flex p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm active:scale-95 items-center justify-center h-[38px] w-[38px]"
                      title="Refresh Application"
                    >
                      <RotateCcw size={16} />
                    </button>

                    {/* Logout Button */}
                    <button
                      onClick={handleLogout}
                      className="hidden md:flex p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all shadow-sm active:scale-95 items-center justify-center h-[38px] w-[38px]"
                      title="Logout"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </div>
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {activeTab === 'home' && (
            <div className="space-y-3 sm:space-y-6 animate-in fade-in duration-500">

              {/* Row 1: KPI Cards - Minimal Style - Always 3 columns, compact on mobile */}
              <div className="pl-2 sm:pl-0">
                <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
                   <div className="h-16 sm:h-28">
                     <StatsCard label="Income" amount={summary.totalIncome} type="INCOME" filled />
                   </div>
                   <div className="h-16 sm:h-28">
                     <StatsCard label="Expenses" amount={summary.totalExpense} type="EXPENSE" filled />
                   </div>
                   <div className="h-16 sm:h-28">
                     <StatsCard label="Balance" amount={summary.balance} type="BALANCE" filled />
                   </div>
                </div>
              </div>

              {/* Mobile: Configurable Category Cards */}
              <div className="md:hidden px-2 space-y-2">
                {/* Fixed Income Card */}
                {(() => {
                  const incomeCat = incomeCategories[0];
                  if (!incomeCat) return null;

                  const incomeTransactions = activeTransactions.filter(t => t.type === 'INCOME');
                  const incomeTotal = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

                  // Group transactions by description
                  const groupedIncome = new Map<string, { description: string; subcategoryName: string; amount: number; count: number }>();
                  incomeTransactions.forEach(t => {
                    const key = t.description || 'Unknown';
                    const existing = groupedIncome.get(key);
                    if (existing) {
                      existing.amount += t.amount;
                      existing.count += 1;
                    } else {
                      groupedIncome.set(key, { description: key, subcategoryName: t.subcategoryName, amount: t.amount, count: 1 });
                    }
                  });
                  const topIncomeGrouped = Array.from(groupedIncome.values())
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 6);

                  return (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div
                        className="flex items-center justify-between px-2 py-1.5"
                        style={{ backgroundColor: '#10b981' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <PoundSterling size={12} className="text-white/80" />
                          <span className="text-[10px] font-bold text-white">Income</span>
                        </div>
                        <span className="text-[11px] font-bold text-white/90 font-mono">£{incomeTotal.toLocaleString()}</span>
                      </div>
                      <div className="max-h-[192px] overflow-y-auto">
                        {topIncomeGrouped.map((g, idx) => (
                          <div key={g.description} className={`grid grid-cols-[1fr_1fr_75px] items-center h-8 text-xs border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}>
                            <div className="flex items-center justify-between px-2.5 border-r border-slate-100 min-w-0">
                              <span className="truncate text-slate-600">{g.description}</span>
                              {g.count > 1 && (
                                <span className="shrink-0 bg-slate-200 text-slate-500 text-[8px] font-bold px-1 py-0.5 rounded ml-1">x{g.count}</span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-400 px-2 border-r border-slate-100 truncate">{g.subcategoryName}</span>
                            <span className="font-mono font-semibold text-emerald-600 px-2 text-right">£{g.amount.toLocaleString()}</span>
                          </div>
                        ))}
                        {topIncomeGrouped.length === 0 && (
                          <div className="py-3 text-center text-slate-400 text-xs">No income</div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Configurable Expense Cards */}
                {mobileCategoryIds.map((catId, index) => {
                  const cat = expenseCategories.find(c => c.id === catId);
                  if (!cat) return null;

                  const catTransactions = activeTransactions.filter(t => t.categoryId === cat.id);
                  const catTotal = catTransactions.reduce((sum, t) => sum + t.amount, 0);

                  // Group transactions by description
                  const groupedTransactions = new Map<string, { description: string; subcategoryName: string; amount: number; count: number }>();
                  catTransactions.forEach(t => {
                    const key = t.description || 'Unknown';
                    const existing = groupedTransactions.get(key);
                    if (existing) {
                      existing.amount += t.amount;
                      existing.count += 1;
                    } else {
                      groupedTransactions.set(key, { description: key, subcategoryName: t.subcategoryName, amount: t.amount, count: 1 });
                    }
                  });
                  const topGrouped = Array.from(groupedTransactions.values())
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 6);

                  return (
                    <div key={`mobile-${index}-${catId}`} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      {/* Category Header with Selector */}
                      <div
                        className="flex items-center justify-between px-3 py-2"
                        style={{ backgroundColor: cat.color }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                          <select
                            value={catId}
                            onChange={(e) => handleMobileCategoryChange(index, e.target.value)}
                            className="bg-white/20 text-white text-xs font-bold rounded-lg px-2.5 py-1 outline-none border-0 cursor-pointer appearance-none flex-1 min-w-0"
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                          >
                            {expenseCategories.map(c => (
                              <option key={c.id} value={c.id} className="text-slate-900 bg-white">{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-white/90 font-mono">£{catTotal.toLocaleString()}</span>
                          {mobileCategoryIds.length > 1 && (
                            <button
                              onClick={() => handleRemoveMobileCardWithConfirm(index)}
                              className="w-5 h-5 flex items-center justify-center bg-white/20 rounded text-white hover:bg-white/30 text-xs font-bold"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Top Transactions - Grouped */}
                      <div className="max-h-[192px] overflow-y-auto">
                        {topGrouped.map((g, idx) => (
                          <div key={g.description} className={`grid grid-cols-[1fr_1fr_75px] items-center h-8 text-xs border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}>
                            <div className="flex items-center justify-between px-2.5 border-r border-slate-100 min-w-0">
                              <span className="truncate text-slate-600">{g.description}</span>
                              {g.count > 1 && (
                                <span className="shrink-0 bg-slate-200 text-slate-500 text-[8px] font-bold px-1 py-0.5 rounded ml-1">x{g.count}</span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-400 px-2 border-r border-slate-100 truncate">{g.subcategoryName}</span>
                            <span className="font-mono font-semibold text-slate-700 px-2 text-right">£{g.amount.toLocaleString()}</span>
                          </div>
                        ))}
                        {topGrouped.length === 0 && (
                          <div className="py-3 text-center text-slate-400 text-xs">No transactions</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add Card Button */}
                <button
                  onClick={handleAddMobileCard}
                  className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-[11px] font-bold hover:border-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus size={14} />
                  Add Category Card
                </button>
              </div>

              {/* Row 2: Top 4 Transaction Widgets - Hidden on mobile */}
              <div className="hidden md:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                 {widgetCategoryIds.slice(0, 4).map((catId, index) => {
                      const isIncomeWidget = index === 3;
                      return (
                        <div key={`top-${index}-${catId}`} className="relative group">
                          {widgetCategoryIds.length > 1 && (
                            <button
                              onClick={() => handleRemoveDesktopWidget(index)}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 hover:bg-rose-500 hover:border-rose-500 text-slate-400 hover:text-white rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-md z-50 opacity-0 group-hover:opacity-100"
                              title="Remove widget"
                            >
                              ×
                            </button>
                          )}
                          <CategoryTrendWidget
                              categoryId={catId}
                              onCategoryChange={(newId) => handleWidgetCategoryChange(index, newId)}
                              allCategories={isIncomeWidget ? incomeCategories : expenseCategories}
                              transactions={activeTransactions}
                          />
                        </div>
                      );
                 })}
              </div>

              {/* Row 3: Summary + Remaining Widgets */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 px-2 sm:px-0">

                 {/* Remaining Widgets - Left Side - Hidden on mobile */}
                <div className="hidden lg:flex lg:col-span-8 xl:col-span-9 flex-col gap-6">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {widgetCategoryIds.slice(4).map((catId, index) => (
                      <div key={`bottom-${index + 4}-${catId}`} className="relative group">
                        {widgetCategoryIds.length > 1 && (
                          <button
                            onClick={() => handleRemoveDesktopWidget(index + 4)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 hover:bg-rose-500 hover:border-rose-500 text-slate-400 hover:text-white rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-md z-50 opacity-0 group-hover:opacity-100"
                            title="Remove widget"
                          >
                            ×
                          </button>
                        )}
                        <CategoryTrendWidget
                          categoryId={catId}
                          onCategoryChange={(newId) => handleWidgetCategoryChange(index + 4, newId)}
                          allCategories={expenseCategories}
                          transactions={activeTransactions}
                        />
                      </div>
                    ))}
                    {/* Add Widget Button */}
                    <button
                      onClick={handleAddDesktopWidget}
                      className="h-full min-h-[200px] border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors flex flex-col items-center justify-center gap-2"
                    >
                      <Plus size={24} />
                      <span className="text-sm font-semibold">Add Widget</span>
                    </button>
                  </div>
                </div>

                {/* Summary Card - Full width on mobile */}
                <div className="col-span-1 lg:col-span-4 xl:col-span-3 flex flex-col h-full">
                  <div className="bg-white p-0 rounded-xl sm:rounded-2xl border border-slate-200 flex flex-col shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] h-full min-h-[300px] sm:min-h-[500px] overflow-hidden">

                    {/* Header - Compact on mobile */}
                    <div className="flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 border-b border-slate-50 flex-shrink-0 bg-white">
                       <div className="flex justify-between items-center">
                           {/* View Mode Toggle */}
                           {filterCategory === 'all' && filterSubcategory === 'all' ? (
                               <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                   <button
                                      onClick={() => setBreakdownViewMode('category')}
                                      className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-bold rounded-md transition-all ${breakdownViewMode === 'category' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                   >
                                       Categories
                                   </button>
                                   <button
                                      onClick={() => setBreakdownViewMode('subcategory')}
                                      className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-bold rounded-md transition-all ${breakdownViewMode === 'subcategory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                   >
                                       Subcategories
                                   </button>
                               </div>
                           ) : (
                               <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                                 {filterCategory !== 'all' ? 'Breakdown' : 'Filtered'}
                               </h3>
                           )}

                           {(filterCategory !== 'all' || filterSubcategory !== 'all') && (
                              <button
                                  onClick={handleResetFilters}
                                  className="text-[9px] sm:text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full hover:bg-rose-100 transition-colors"
                              >
                                  Reset
                              </button>
                          )}
                       </div>

                       <div className="flex gap-2">
                          <select
                              value={filterCategory}
                              onChange={(e) => {
                                  setFilterCategory(e.target.value);
                                  setFilterSubcategory('all');
                              }}
                              className="flex-1 bg-slate-50 border border-slate-100 text-slate-700 text-[10px] sm:text-xs font-bold rounded-lg focus:border-slate-300 focus:ring-1 focus:ring-slate-200 block px-2 sm:px-3 py-1.5 sm:py-2 outline-none hover:bg-slate-100 transition-colors cursor-pointer appearance-none"
                          >
                              <option value="all">Category: All</option>
                              {expenseCategories.map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                          </select>

                          <select
                              value={filterSubcategory}
                              onChange={(e) => setFilterSubcategory(e.target.value)}
                              className="flex-1 bg-slate-50 border border-slate-100 text-slate-700 text-[10px] sm:text-xs font-bold rounded-lg focus:border-slate-300 focus:ring-1 focus:ring-slate-200 block px-2 sm:px-3 py-1.5 sm:py-2 outline-none hover:bg-slate-100 transition-colors cursor-pointer appearance-none"
                          >
                              <option value="all">Sub: All</option>
                              {availableSubcategories.map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                              ))}
                          </select>
                       </div>
                    </div>

                    {/* Expandable Category List & Total */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-2 sm:p-4">
                        <div className="space-y-2 sm:space-y-4">
                            {(() => {
                                let displayData: { name?: string; category?: Category; total: number; color?: string; parentId?: string }[] = [];
                                let listType: 'category' | 'subcategory' = 'category';

                                if (filterCategory !== 'all') {
                                    displayData = subcategoryBreakdown;
                                    listType = 'subcategory';
                                } else if (filterSubcategory !== 'all') {
                                    displayData = allSubcategoryBreakdown.filter(i => i.name === filterSubcategory);
                                    listType = 'subcategory';
                                } else if (breakdownViewMode === 'subcategory') {
                                    displayData = allSubcategoryBreakdown;
                                    listType = 'subcategory';
                                } else {
                                    displayData = categoryBreakdown.filter(c => c.category.type === 'EXPENSE');
                                    listType = 'category';
                                }

                                if (displayData.length === 0) {
                                    return <div className="flex items-center justify-center h-16 sm:h-20 text-slate-400 text-[10px] sm:text-xs">No expenses found</div>;
                                }

                                return displayData.map((item: any) => {
                                    const percentage = globalSummary.totalExpense > 0 ? ((item.total / globalSummary.totalExpense) * 100).toFixed(1) : '0';
                                    const label = listType === 'category' ? item.category.name : item.name;
                                    const color = listType === 'category' ? item.category.color : item.color;
                                    const iconId = listType === 'category' ? item.category.id : item.parentId;

                                    return (
                                        <div key={label} className="group">
                                        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-1.5">
                                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-slate-100 transition-colors">
                                                {getCategoryIcon(iconId)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-0.5 sm:mb-1">
                                                    <span className="text-[11px] sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors truncate">{label}</span>
                                                    <span className="text-[9px] sm:text-xs font-medium text-slate-500">({percentage}%)</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                                    <div
                                                    className="h-full rounded-full transition-all duration-500 ease-out opacity-80"
                                                    style={{
                                                        width: `${percentage}%`,
                                                        backgroundColor: color || '#94a3b8'
                                                    }}
                                                    ></div>
                                                </div>
                                                <div className="text-right mt-0.5">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-900 font-mono">£{item.total.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Total Display */}
                        <div className="pt-3 sm:pt-6 mt-2 sm:mt-4 border-t border-slate-100 flex-shrink-0">
                            <div className="flex flex-col gap-0.5 sm:gap-1">
                                <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider">Total Expenses</span>
                                <span className="text-xl sm:text-3xl font-bold text-slate-900 font-mono">£{globalSummary.totalExpense.toLocaleString()}</span>
                            </div>
                        </div>

                         {/* Excluded Transactions */}
                        {excludedTransactions.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-dashed border-slate-100">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <div className="flex items-center gap-2">
                                        <EyeOff size={10} className="text-slate-300" />
                                        <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Excluded ({excludedTransactions.length})</h4>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 font-mono">
                                        £{excludedTransactions.reduce((sum, t) => sum + t.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="rounded-lg overflow-hidden border border-slate-100 bg-slate-50/30 flex flex-col max-h-48 overflow-y-auto custom-scrollbar">
                                    {excludedTransactions.map(t => (
                                        <div key={t.id} className="bg-white px-3 py-2 flex justify-between items-start border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                                                <span className="text-xs font-semibold text-slate-600 truncate">{t.description}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-[9px] text-slate-400">{t.date}</span>
                                                    {t.subcategoryName && (
                                                        <>
                                                            <span className="text-slate-300">•</span>
                                                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">{t.subcategoryName}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-500 font-mono whitespace-nowrap">
                                                £{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* YEARLY VIEW */}
          {activeTab === 'yearly' && (
             <div className="h-full">
                <YearlySummary transactions={transactions} categories={categories} />
             </div>
          )}
          
           {/* CATEGORIES VIEW */}
           {activeTab === 'categories' && (
             <div className="h-full">
                 <CategoryManager
                    categories={categories}
                    onAddCategory={handleAddCategory}
                    onUpdateCategory={handleUpdateCategory}
                    onAddSubcategory={handleAddSubcategory}
                    onDeleteSubcategory={handleDeleteSubcategory}
                    onDeleteCategory={handleDeleteCategory}
                 />
             </div>
          )}

           {/* SETTINGS VIEW */}
           {activeTab === 'settings' && (
             <div className="h-full">
                 <SettingsManager
                    webhookUrl={webhookUrl}
                    onWebhookChange={setWebhookUrl}
                    banks={banks}
                    onAddBank={handleAddBank}
                    onDeleteBank={handleDeleteBank}
                    onLogout={handleLogout}
                 />
             </div>
          )}

          {/* HISTORY VIEW */}
          {activeTab === 'history' && (
            <div className="flex flex-col space-y-4 sm:space-y-6 px-2 sm:px-0">
               {/* Hidden on mobile/tablet, visible on desktop only */}
               <div className="hidden lg:block">
                 <BankFeedUpload
                    onImport={handleImportTransactions}
                    webhookUrl={webhookUrl}
                    banks={banks}
                 />
               </div>

              {/* Daily Average Card - Desktop */}
              <div className="hidden md:block">
                <div className={`rounded-2xl border shadow-sm p-5 ${dailyAverageData.isIncome ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="grid grid-cols-5 gap-8">
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${dailyAverageData.isIncome ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Daily Avg
                        </p>
                        <p className={`text-xl font-bold font-mono ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-900'}`}>
                          £{dailyAverageData.dailyAverage.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${dailyAverageData.isIncome ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Total {dailyAverageData.isIncome ? 'Income' : 'Spend'}
                        </p>
                        <p className={`text-xl font-bold font-mono ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-900'}`}>
                          £{dailyAverageData.totalSpend.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${dailyAverageData.isIncome ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Avg Transaction
                        </p>
                        <p className={`text-xl font-bold font-mono ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-900'}`}>
                          £{dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalSpend / dailyAverageData.transactionCount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${dailyAverageData.isIncome ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Days
                        </p>
                        <p className={`text-xl font-bold ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {dailyAverageData.daysInRange}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${dailyAverageData.isIncome ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Transactions
                        </p>
                        <p className={`text-xl font-bold ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {dailyAverageData.transactionCount}
                        </p>
                      </div>
                    </div>
                    {filterCategory !== 'all' && (
                      <div className="ml-6">
                        <span className="text-xs text-slate-400 block mb-1">Filtered by</span>
                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: categories.find(c => c.id === filterCategory)?.color || '#64748b' }}>
                          {categories.find(c => c.id === filterCategory)?.name || 'Category'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily Average Card - Mobile */}
              <div className={`md:hidden rounded-xl overflow-hidden text-white ${dailyAverageData.isIncome ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-slate-800 to-slate-900'}`}>
                {/* White Header */}
                <div className="bg-white px-4 py-2">
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${dailyAverageData.isIncome ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {dailyAverageData.isIncome ? 'Income Averages' : 'Expense Averages'}
                  </h3>
                </div>
                {/* Stats */}
                <div className="p-4">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-white/60 text-[9px] font-semibold uppercase">Daily Avg</p>
                      <p className="text-base font-bold font-mono mt-1">£{dailyAverageData.dailyAverage.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-[9px] font-semibold uppercase">Avg Trans</p>
                      <p className="text-base font-bold font-mono mt-1">£{dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalSpend / dailyAverageData.transactionCount).toLocaleString('en-GB', { maximumFractionDigits: 0 }) : '0'}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-[9px] font-semibold uppercase">Days</p>
                      <p className="text-base font-bold mt-1">{dailyAverageData.daysInRange}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-[9px] font-semibold uppercase">Transactions</p>
                      <p className="text-base font-bold mt-1">{dailyAverageData.transactionCount}</p>
                    </div>
                  </div>
                  {filterCategory !== 'all' && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <span className="text-[10px] text-white/60">Filtered by:</span>
                      <span className="ml-2 px-2 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: categories.find(c => c.id === filterCategory)?.color || '#64748b' }}>
                        {categories.find(c => c.id === filterCategory)?.name || 'Category'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-2 sm:p-3 animate-in fade-in shadow-sm min-h-[500px] sm:min-h-[600px] flex flex-col flex-1">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-3 sm:mb-6 gap-2 sm:gap-4 border-b border-slate-100 pb-3 sm:pb-6">
                  <div className="flex items-center gap-2">
                      <div className="p-1.5 sm:p-2 bg-slate-100 rounded-lg text-slate-700">
                          <ListFilter size={16} className="sm:w-5 sm:h-5" />
                      </div>
                      <div>
                          <h3 className="font-bold text-slate-800 text-sm sm:text-lg">Transaction Log</h3>
                          <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">{filteredTransactions.length} records found</p>
                      </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full lg:w-auto">
                      {/* Bank Filter */}
                      <div className="relative">
                          <select
                              value={filterBank}
                              onChange={(e) => setFilterBank(e.target.value)}
                              className="appearance-none pl-2 sm:pl-3 pr-6 sm:pr-8 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                              <option value="all">Bank: All</option>
                              {availableBanks.map(bank => (
                                  <option key={bank} value={bank}>{bank}</option>
                              ))}
                          </select>
                          <Building size={10} className="sm:w-3 sm:h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Type Filter */}
                      <div className="relative">
                          <select
                              value={filterType}
                              onChange={(e) => setFilterType(e.target.value as any)}
                              className="appearance-none pl-2 sm:pl-3 pr-6 sm:pr-8 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                              <option value="all">Type: All</option>
                              <option value="INCOME">Income</option>
                              <option value="EXPENSE">Expense</option>
                          </select>
                          <ArrowUpDown size={10} className="sm:w-3 sm:h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Category Filter */}
                      <div className="relative">
                          <select
                              value={filterCategory}
                              onChange={(e) => {
                                  setFilterCategory(e.target.value);
                                  setFilterSubcategory('all');
                              }}
                              className="appearance-none pl-2 sm:pl-3 pr-6 sm:pr-8 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                              <option value="all">Category: All</option>
                              {allCategories.map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                          </select>
                          <Filter size={10} className="sm:w-3 sm:h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Subcategory Filter - Hide on mobile */}
                      <div className="relative hidden sm:block">
                          <select
                              value={filterSubcategory}
                              onChange={(e) => setFilterSubcategory(e.target.value)}
                              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                              <option value="all">Subcategory: All</option>
                              {availableSubcategories.map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                              ))}
                          </select>
                          <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Reset Button */}
                      {(filterCategory !== 'all' || filterSubcategory !== 'all' || filterType !== 'all' || filterBank !== 'all') && (
                          <button
                              onClick={handleResetFilters}
                              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                          >
                              <X size={10} className="sm:w-3 sm:h-3" />
                              Reset
                          </button>
                      )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  {/* Total Amount Header Row */}
                  {filteredTransactions.length > 0 && (
                    <div className="flex items-center justify-end px-2 py-2 mb-1 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Total:</span>
                        <span className={`text-lg font-bold font-mono ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {filteredTotal >= 0 ? '+' : ''}£{Math.abs(filteredTotal).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                  <TransactionList
                      transactions={filteredTransactions}
                      categories={categories}
                      onUpdate={updateTransaction}
                      onDelete={deleteTransaction}
                    />
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      <TransactionForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddTransaction={addTransaction}
        categories={categories}
        banks={banks}
      />

      {/* Widget Delete Confirmation Modal */}
      {widgetToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-rose-100 rounded-full mx-auto mb-4">
              <X className="text-rose-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Remove Widget?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Are you sure you want to remove this category card from your dashboard?
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelWidgetDelete}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmWidgetDelete}
                className="flex-1 px-4 py-2.5 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
