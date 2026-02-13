
import React, { useState, useEffect, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { Transaction, FinancialSummary, Category, Bank, MerchantMapping } from './types';
import { INITIAL_CATEGORIES, INITIAL_BANKS } from './constants';
import { supabase } from './supabaseClient';
import LoginPage from './components/LoginPage';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import StatsCard from './components/StatsCard';
import DashboardDateFilter, { DateRange } from './components/DashboardDateFilter';
import CategoryTrendWidget from './components/CategoryTrendWidget';
import AllocationSidebar from './components/AllocationSidebar';
import CategoryManager from './components/CategoryManager';
import BankFeedUpload from './components/BankFeedUpload';
import YearlySummary from './components/YearlySummary';
import SettingsManager from './components/SettingsManager';
import {
  LayoutDashboard, Plus, Home, ListFilter, Search,
  ChevronLeft, ChevronRight, Filter, EyeOff, TrendingUp,
  Car, Plane, Smartphone, Coffee, ShoppingBag, PoundSterling, Activity, X,
  ArrowUpDown, FolderCog, CalendarRange, Building, ArrowRightLeft, Settings,
  RotateCcw, Loader2, LogOut, Sparkles
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

// Default emojis for categories
const DEFAULT_CATEGORY_EMOJIS: Record<string, string> = {
    apt: '🏠',
    car: '🚗',
    travel: '✈️',
    personal: '🛍️',
    food: '🍔',
    groceries: '🛒',
    income_salary: '💰',
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
  const [merchantMappings, setMerchantMappings] = useState<MerchantMapping[]>([]);
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

  // Currency State
  const [currency, setCurrency] = useState<'GBP' | 'AED'>('GBP');

  // Mobile custom date picker state
  const [showMobileCustomDates, setShowMobileCustomDates] = useState(false);
  const [mobileCustomStart, setMobileCustomStart] = useState('');
  const [mobileCustomEnd, setMobileCustomEnd] = useState('');

  // Get transaction amount based on selected currency
  const getAmount = (t: Transaction) => {
    return currency === 'GBP' ? t.amountGBP : t.amountAED;
  };

  // Currency formatter helper
  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `£${formatted}` : `AED ${formatted}`;
  };

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

  // Import Review Modal State - Pending transactions not yet saved
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [pendingImportTransactions, setPendingImportTransactions] = useState<Transaction[]>([]);
  const [savingImport, setSavingImport] = useState(false);

  // Sidebar State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Filter States
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'INCOME' | 'EXPENSE'>('all');
  const [filterBank, setFilterBank] = useState<string>('all');
  const [filterRecentlyAdded, setFilterRecentlyAdded] = useState<'all' | 'today' | 'week' | 'uncategorized'>('all');

  // Breakdown View Mode (Category vs Subcategory)
  const [breakdownViewMode, setBreakdownViewMode] = useState<'category' | 'subcategory'>('category');

  // Emoji Override State (persisted in localStorage)
  const [emojiOverrides, setEmojiOverrides] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('categoryEmojiOverrides');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('categoryEmojiOverrides', JSON.stringify(emojiOverrides));
  }, [emojiOverrides]);

  const getCategoryEmoji = (categoryId: string): string => {
    return emojiOverrides[categoryId] || DEFAULT_CATEGORY_EMOJIS[categoryId] || '📊';
  };

  const handleEmojiChange = (categoryId: string, emoji: string) => {
    setEmojiOverrides(prev => ({ ...prev, [categoryId]: emoji }));
  };

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
      // Exchange rate: 1 GBP = ~4.6 AED (adjust as needed)
      const GBP_TO_AED_RATE = 4.6;

      const mappedTxs: Transaction[] = (txData || []).map(t => {
          // Parse money columns - ensure they're numbers, handle null/undefined/string
          const moneyInGBP = Number(t['Money In - GBP']) || 0;
          const moneyOutGBP = Number(t['Money Out - GBP']) || 0;
          const moneyInAED = Number(t['Money In - AED']) || 0;
          const moneyOutAED = Number(t['Money Out - AED']) || 0;

          // Debug: log raw values for income transactions
          if (moneyInGBP > 0 || moneyInAED > 0) {
            console.log('Income transaction:', t['Description'], {
              'Raw Money In - GBP': t['Money In - GBP'],
              'Raw Money In - AED': t['Money In - AED'],
              'Parsed GBP': moneyInGBP,
              'Parsed AED': moneyInAED
            });
          }

          // Determine type based on which column has a value
          // If Money In > 0, it's income. If Money Out > 0, it's expense.
          const isIncome = moneyInGBP > 0 || moneyInAED > 0;
          const type: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';

          // Store both currency amounts with conversion fallback
          let amountGBP = isIncome ? moneyInGBP : moneyOutGBP;
          let amountAED = isIncome ? moneyInAED : moneyOutAED;

          // If AED is missing, convert from GBP
          if (amountAED === 0 && amountGBP > 0) {
            console.log('Converting GBP to AED for:', t['Description'], amountGBP, '->', amountGBP * GBP_TO_AED_RATE);
            amountAED = amountGBP * GBP_TO_AED_RATE;
          }
          // If GBP is missing, convert from AED
          if (amountGBP === 0 && amountAED > 0) {
            amountGBP = amountAED / GBP_TO_AED_RATE;
          }

          // Find categoryId from category name
          const categoryName = t['Catagory'] || '';
          const matchedCategory = activeCategories.find(c =>
            c.name.toLowerCase() === categoryName.toLowerCase()
          );
          const categoryId = matchedCategory?.id || '';

          return {
            id: String(t.id),
            date: t['Transaction Date'] || new Date().toISOString().split('T')[0],
            amount: amountGBP, // Default to GBP for backwards compatibility
            amountGBP,
            amountAED,
            originalAmount: amountAED > 0 ? amountAED : undefined,
            originalCurrency: amountAED > 0 ? 'AED' : undefined,
            type,
            categoryId,
            categoryName,
            subcategoryName: t['Sub-Category'] || '',
            description: t['Description'] || '',
            notes: t['Note'] || '',
            excluded: categoryId === 'excluded',
            bankName: t['Bank Account'] || '',
            createdAt: t.created_at || null
          };
      });

      console.log('Mapped transactions:', mappedTxs.length, mappedTxs);
      setTransactions(mappedTxs);

      // Fetch Merchant Mappings from Supabase
      try {
        console.log('Fetching merchant mappings...');
        const { data: mappingData, error: mappingError } = await supabase
          .from('merchant_mappings')
          .select('*');

        if (!mappingError && mappingData) {
          const mappings: MerchantMapping[] = mappingData.map(m => ({
            id: m.id,
            merchant_pattern: m.merchant_pattern,
            category_id: m.category_id,
            category_name: m.category_name,
            subcategory_name: m.subcategory_name,
            count: m.count || 1
          }));
          console.log('Loaded merchant mappings:', mappings.length);
          setMerchantMappings(mappings);
        }
      } catch (mappingErr) {
        console.log('Merchant mappings table not found or error:', mappingErr);
        // Table might not exist yet - that's ok
      }

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
    setFilterRecentlyAdded('all');
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

  // Store imported transactions in pending state (NOT saved to Supabase yet)
  const handleImportTransactions = (imported: Omit<Transaction, 'id'>[]) => {
      // Create pending transactions with temporary IDs
      const pendingTxs: Transaction[] = imported.map((t, index) => {
          const isIncome = t.type === 'INCOME';
          const gbpAmount = t.amountGBP || t.amount || 0;
          const aedAmount = t.amountAED || t.originalAmount || 0;

          // Find categoryId from category name (for auto-categorized ones)
          const matchedCategory = t.categoryName
            ? categories.find(c => c.name.toLowerCase() === t.categoryName.toLowerCase())
            : null;

          return {
            id: `pending-${Date.now()}-${index}`, // Temporary ID
            date: t.date,
            amount: gbpAmount,
            amountGBP: gbpAmount,
            amountAED: aedAmount,
            originalAmount: aedAmount > 0 ? aedAmount : undefined,
            originalCurrency: aedAmount > 0 ? 'AED' : undefined,
            type: isIncome ? 'INCOME' as const : 'EXPENSE' as const,
            categoryId: matchedCategory?.id || t.categoryId || '',
            categoryName: t.categoryName || '',
            subcategoryName: t.subcategoryName || '',
            description: t.description || '',
            notes: t.notes || '',
            excluded: false,
            bankName: t.bankName || '',
            createdAt: new Date().toISOString()
          };
      });

      console.log('Staging transactions for review:', pendingTxs.length);
      setPendingImportTransactions(pendingTxs);
      setImportReviewOpen(true);
  };

  // Update a pending transaction (before saving)
  const updatePendingTransaction = (id: string, updates: Partial<Transaction>) => {
    setPendingImportTransactions(prev =>
      prev.map(t => t.id === id ? { ...t, ...updates } : t)
    );
  };

  // Save all pending transactions to Supabase
  const saveImportedTransactions = async () => {
    if (pendingImportTransactions.length === 0) return;

    setSavingImport(true);

    // Map to Supabase schema
    const dbPayloads = pendingImportTransactions.map(t => {
      const isIncome = t.type === 'INCOME';
      return {
        'Transaction Date': t.date,
        'Description': t.description,
        'Catagory': t.categoryName,
        'Sub-Category': t.subcategoryName,
        'Money Out - GBP': isIncome ? null : t.amountGBP,
        'Money In - GBP': isIncome ? t.amountGBP : null,
        'Money Out - AED': isIncome ? null : t.amountAED,
        'Money In - AED': isIncome ? t.amountAED : null,
        'Bank Account': t.bankName,
        'Note': t.notes || null
      };
    });

    console.log('Saving transactions to Supabase:', dbPayloads.length);
    const { data, error } = await supabase.from('Transactions').insert(dbPayloads).select();

    if (error) {
      console.error('Supabase import error:', error.message);
      alert('Failed to save transactions: ' + error.message);
      setSavingImport(false);
      return;
    }

    if (data) {
      // Map saved data back to Transaction format with real IDs
      const savedTxs: Transaction[] = data.map(t => {
        const moneyInGBP = t['Money In - GBP'] || 0;
        const moneyOutGBP = t['Money Out - GBP'] || 0;
        const moneyInAED = t['Money In - AED'] || 0;
        const moneyOutAED = t['Money Out - AED'] || 0;
        const isIncome = moneyInGBP > 0 || moneyInAED > 0;

        const categoryName = t['Catagory'] || '';
        const matchedCategory = categories.find(c =>
          c.name.toLowerCase() === categoryName.toLowerCase()
        );

        return {
          id: String(t.id),
          date: t['Transaction Date'] || new Date().toISOString().split('T')[0],
          amount: isIncome ? Number(moneyInGBP) : Number(moneyOutGBP),
          amountGBP: isIncome ? Number(moneyInGBP) : Number(moneyOutGBP),
          amountAED: isIncome ? Number(moneyInAED) : Number(moneyOutAED),
          originalAmount: isIncome ? (moneyInAED > 0 ? Number(moneyInAED) : undefined) : (moneyOutAED > 0 ? Number(moneyOutAED) : undefined),
          originalCurrency: (moneyInAED > 0 || moneyOutAED > 0) ? 'AED' : undefined,
          type: isIncome ? 'INCOME' as const : 'EXPENSE' as const,
          categoryId: matchedCategory?.id || '',
          categoryName: categoryName,
          subcategoryName: t['Sub-Category'] || '',
          description: t['Description'] || '',
          notes: t['Note'] || '',
          excluded: false,
          bankName: t['Bank Account'] || '',
          createdAt: t.created_at || new Date().toISOString()
        };
      });

      // Add to main transactions list
      setTransactions(prev => [...savedTxs, ...prev]);

      // Save merchant mappings for categorized transactions
      for (const t of savedTxs) {
        if (t.categoryId && t.categoryId !== 'excluded' && t.categoryName) {
          saveMerchantMapping(t.description, t.categoryId, t.categoryName, t.subcategoryName || '');
        }
      }

      // Close modal and clear pending
      setPendingImportTransactions([]);
      setImportReviewOpen(false);
      console.log('Saved', savedTxs.length, 'transactions');
    }

    setSavingImport(false);
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

          // Save merchant mapping when category is set (skip excluded)
          const transaction = transactions.find(t => t.id === id);
          if (transaction && updates.categoryId && updates.categoryId !== 'excluded' && updates.categoryName !== undefined) {
            saveMerchantMapping(
              transaction.description,
              updates.categoryId,
              updates.categoryName,
              updates.subcategoryName || ''
            );
          }
        }
      }
    } catch (err) {
      console.error('Exception:', err);
      alert('Failed to save transaction');
    }
  };

  // Save merchant mapping to remember categorization (with count threshold)
  const MAPPING_THRESHOLD = 3; // Auto-categorize after 3 consistent categorizations

  const saveMerchantMapping = async (
    merchantPattern: string,
    categoryId: string,
    categoryName: string,
    subcategoryName: string
  ) => {
    if (!merchantPattern || !categoryId) return;

    console.log('Saving merchant mapping:', { merchantPattern, categoryId, categoryName, subcategoryName });

    try {
      // Check if mapping already exists
      const existingMapping = merchantMappings.find(
        m => m.merchant_pattern.toLowerCase() === merchantPattern.toLowerCase()
      );

      let newCount = 1;

      if (existingMapping) {
        // If same category, increment count; if different category, reset to 1
        if (existingMapping.category_id === categoryId && existingMapping.subcategory_name === subcategoryName) {
          newCount = (existingMapping.count || 1) + 1;
          console.log(`Same categorization - incrementing count to ${newCount}`);
        } else {
          newCount = 1;
          console.log('Different categorization - resetting count to 1');
        }
      }

      // Use upsert to update if exists or insert if new
      const { data, error } = await supabase
        .from('merchant_mappings')
        .upsert(
          {
            merchant_pattern: merchantPattern,
            category_id: categoryId,
            category_name: categoryName,
            subcategory_name: subcategoryName,
            count: newCount,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'merchant_pattern' }
        )
        .select();

      if (error) {
        console.error('Failed to save merchant mapping:', error);
      } else {
        console.log('Merchant mapping saved:', data, `count: ${newCount}/${MAPPING_THRESHOLD}`);
        // Update local state
        setMerchantMappings(prev => {
          const existingIdx = prev.findIndex(m => m.merchant_pattern.toLowerCase() === merchantPattern.toLowerCase());
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              category_id: categoryId,
              category_name: categoryName,
              subcategory_name: subcategoryName,
              count: newCount
            };
            return updated;
          }
          return [...prev, {
            merchant_pattern: merchantPattern,
            category_id: categoryId,
            category_name: categoryName,
            subcategory_name: subcategoryName,
            count: newCount
          }];
        });
      }
    } catch (err) {
      console.error('Exception saving merchant mapping:', err);
    }
  };

  // Apply merchant memory to uncategorized transactions
  const [applyingMemory, setApplyingMemory] = useState(false);

  const applyMerchantMemory = async (transactionsToProcess: Transaction[]) => {
    const readyMappings = merchantMappings.filter(m => (m.count || 0) >= MAPPING_THRESHOLD);
    if (readyMappings.length === 0) {
      alert('No merchant mappings are ready yet (need 3+ consistent categorizations).');
      return;
    }

    // Find uncategorized transactions that match ready mappings
    const uncategorized = transactionsToProcess.filter(t => !t.categoryId || t.categoryId === '');
    const toUpdate: { transaction: Transaction; mapping: MerchantMapping }[] = [];

    uncategorized.forEach(t => {
      const mapping = readyMappings.find(m =>
        m.merchant_pattern.toLowerCase() === t.description.toLowerCase()
      );
      if (mapping) {
        toUpdate.push({ transaction: t, mapping });
      }
    });

    if (toUpdate.length === 0) {
      alert('No uncategorized transactions match your learned merchants.');
      return;
    }

    const confirmed = confirm(`Apply merchant memory to ${toUpdate.length} transaction${toUpdate.length > 1 ? 's' : ''}?`);
    if (!confirmed) return;

    setApplyingMemory(true);
    let successCount = 0;

    for (const { transaction, mapping } of toUpdate) {
      try {
        const numericId = parseInt(transaction.id, 10);
        const { error } = await supabase
          .from('Transactions')
          .update({
            'Catagory': mapping.category_name,
            'Sub-Category': mapping.subcategory_name
          })
          .eq('id', numericId);

        if (!error) {
          // Update local state
          setTransactions(prev => prev.map(t =>
            t.id === transaction.id
              ? {
                  ...t,
                  categoryId: mapping.category_id,
                  categoryName: mapping.category_name,
                  subcategoryName: mapping.subcategory_name,
                  notes: (t.notes ? t.notes + ' ' : '') + '✨ Auto-categorized'
                }
              : t
          ));
          successCount++;
        }
      } catch (err) {
        console.error('Failed to update transaction:', transaction.id, err);
      }
    }

    setApplyingMemory(false);
    alert(`Successfully categorized ${successCount} of ${toUpdate.length} transactions.`);
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

    // Calculate date thresholds for recently added filter
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    return sourceData.filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterBank !== 'all' && (!t.bankName || t.bankName.trim().toLowerCase() !== filterBank.trim().toLowerCase())) return false;

      // Recently Added filter
      if (filterRecentlyAdded !== 'all') {
        if (filterRecentlyAdded === 'uncategorized') {
          if (t.categoryId && t.categoryId !== '') return false;
        } else if (filterRecentlyAdded === 'today') {
          if (!t.createdAt || t.createdAt < todayStart) return false;
        } else if (filterRecentlyAdded === 'week') {
          if (!t.createdAt || t.createdAt < weekAgo) return false;
        }
      }

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
      // If filtering by recently added, sort by createdAt first
      if (filterRecentlyAdded !== 'all' && filterRecentlyAdded !== 'uncategorized') {
        const createdDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (createdDiff !== 0) return createdDiff;
      }
      // Primary sort by date (newest first)
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Secondary sort by ID to maintain stable order for same-date transactions
      return a.id.localeCompare(b.id);
    });
  }, [dateFilteredTransactions, searchQuery, filterCategory, filterSubcategory, filterType, filterBank, filterRecentlyAdded]);

  // Check if any specific filters are active (not including date filter)
  const hasActiveFilters = filterType !== 'all' || filterBank !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || filterRecentlyAdded !== 'all' || searchQuery.trim() !== '';

  // Calculate total for filtered view (History Tab Total) - only shows value when filters are active
  const filteredTotal = useMemo(() => {
    // Return 0 if no filters are active
    if (!hasActiveFilters) return 0;

    return filteredTransactions
      .filter(t => !t.excluded && t.categoryId !== 'excluded')
      .reduce((acc, t) => {
        const amount = currency === 'GBP' ? t.amountGBP : t.amountAED;
        return t.type === 'INCOME' ? acc + amount : acc - amount;
      }, 0);
  }, [filteredTransactions, hasActiveFilters, currency]);

  // KPI Summary (Respects Date Filter and Currency)
  const summary = useMemo<FinancialSummary>(() => {
    return activeTransactions.reduce(
      (acc, curr) => {
        const amount = currency === 'GBP' ? curr.amountGBP : curr.amountAED;
        if (curr.type === 'INCOME') {
          acc.totalIncome += amount;
          acc.balance += amount;
        } else {
          acc.totalExpense += amount;
          acc.balance -= amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );
  }, [activeTransactions, currency]);

  // Alternate currency summary (for showing AED under GBP or vice versa)
  const summaryAlt = useMemo(() => {
    return activeTransactions.reduce(
      (acc, curr) => {
        const amount = currency === 'GBP' ? curr.amountAED : curr.amountGBP;
        if (curr.type === 'INCOME') {
          acc.totalIncome += amount;
          acc.balance += amount;
        } else {
          acc.totalExpense += amount;
          acc.balance -= amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );
  }, [activeTransactions, currency]);

  // Summary for Breakdown Percentages (respects date filter and currency)
  const globalSummary = useMemo<FinancialSummary>(() => {
    return activeTransactions.reduce(
      (acc, curr) => {
        const amount = currency === 'GBP' ? curr.amountGBP : curr.amountAED;
        if (curr.type === 'INCOME') {
          acc.totalIncome += amount;
          acc.balance += amount;
        } else {
          acc.totalExpense += amount;
          acc.balance -= amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );
  }, [activeTransactions, currency]);

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

    const totalGBP = selectedTransactions.reduce((sum, t) => sum + t.amountGBP, 0);
    const totalAED = selectedTransactions.reduce((sum, t) => sum + t.amountAED, 0);
    const totalAmount = currency === 'GBP' ? totalGBP : totalAED;

    // Calculate number of days in the selected date range
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const dailyAverage = totalAmount / daysDiff;

    return {
      totalSpend: totalAmount,
      totalGBP,
      totalAED,
      dailyAverage,
      daysInRange: daysDiff,
      transactionCount: selectedTransactions.length,
      isIncome: targetType === 'INCOME'
    };
  }, [filteredTransactions, dateRange, filterType, currency]);

  // Main Category Breakdown (respects date filter and currency)
  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => {
      const catTransactions = activeTransactions.filter(t => t.categoryId === cat.id);
      const total = catTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);
      return { category: cat, transactions: catTransactions, total };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  }, [activeTransactions, categories, currency]);

  // Subcategory Breakdown (respects date filter and currency)
  const subcategoryBreakdown = useMemo(() => {
    if (filterCategory === 'all') return [];

    const activeCat = categories.find(c => c.id === filterCategory);
    if (!activeCat) return [];

    const groups: Record<string, number> = {};

    activeTransactions.forEach(t => {
      if (t.type === 'EXPENSE' && t.categoryId === filterCategory) {
        const amount = currency === 'GBP' ? t.amountGBP : t.amountAED;
        groups[t.subcategoryName] = (groups[t.subcategoryName] || 0) + amount;
      }
    });

    return Object.entries(groups).map(([name, total]) => ({
      name,
      total,
      color: activeCat.color,
      parentId: activeCat.id
    })).sort((a, b) => b.total - a.total);
  }, [activeTransactions, filterCategory, categories, currency]);

  // All Subcategories Breakdown (respects date filter and currency)
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
            const amount = currency === 'GBP' ? t.amountGBP : t.amountAED;
            groups[t.subcategoryName].total += amount;
        }
     });
     return Object.entries(groups).map(([name, data]) => ({
         name,
         total: data.total,
         color: data.color,
         parentId: data.parentId,
     })).sort((a, b) => b.total - a.total);
  }, [activeTransactions, categories, currency]);

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
            fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 z-50 pb-4 pt-3
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
               { id: 'yearly', icon: CalendarRange, label: 'Analytics', mobileLabel: 'Analytics', mobileOnly: true },
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
                 {!isSidebarCollapsed && <span className="text-sm hidden md:block">{item.label}</span>}

                 {/* Tooltip for collapsed state */}
                 {isSidebarCollapsed && (
                   <span className="absolute left-14 bg-slate-900 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-slate-700 pointer-events-none hidden md:block shadow-lg">
                     {item.label}
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
        <main className={`flex-1 h-full bg-slate-100 p-2 pb-24 md:px-8 md:py-6 max-w-[100vw] ${activeTab === 'history' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          
          {/* Top Bar with Filter & Search (Hidden in Cat/Yearly View) */}
          {activeTab !== 'categories' && activeTab !== 'yearly' && activeTab !== 'settings' && (
            <div className="flex flex-col gap-4 mb-2 md:mb-8">
                
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

                {/* Mobile Header - Hidden on home tab */}
                {activeTab !== 'home' && (
                <div className="flex flex-col md:hidden gap-2 w-full px-1">
                    {activeTab === 'history' ? (
                      <>
                        {/* Timeframe Selector - same style as dashboard */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex bg-slate-100 p-0.5 rounded-lg overflow-x-auto hide-scrollbar">
                            {[
                              { label: 'MTD', fullLabel: 'This Month', getValue: () => {
                                const now = new Date();
                                return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
                              }},
                              { label: 'Last Wk', fullLabel: 'Last Week', getValue: () => {
                                const now = new Date();
                                const dayOfWeek = now.getDay();
                                const lastMonday = new Date(now);
                                lastMonday.setDate(now.getDate() - dayOfWeek - 6);
                                const lastSunday = new Date(lastMonday);
                                lastSunday.setDate(lastMonday.getDate() + 6);
                                return { start: lastMonday, end: lastSunday };
                              }},
                              { label: 'Last Mo', fullLabel: 'Last Month', getValue: () => {
                                const now = new Date();
                                return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
                              }},
                              { label: 'Year', fullLabel: 'This Year', getValue: () => {
                                const now = new Date();
                                return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
                              }},
                            ].map((preset) => {
                              const isActive = dateRange.label === preset.fullLabel;
                              return (
                                <button
                                  key={preset.fullLabel}
                                  onClick={() => {
                                    const { start, end } = preset.getValue();
                                    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], label: preset.fullLabel });
                                    setShowMobileCustomDates(false);
                                  }}
                                  className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${isActive && !showMobileCustomDates ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => setShowMobileCustomDates(!showMobileCustomDates)}
                              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${showMobileCustomDates || dateRange.label === 'Custom Range' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              Custom
                            </button>
                          </div>
                        </div>
                        {/* Custom Date Range Picker */}
                        {showMobileCustomDates && (
                          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2.5">
                            <input
                              type="date"
                              value={mobileCustomStart}
                              onChange={(e) => setMobileCustomStart(e.target.value)}
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                            />
                            <span className="text-slate-300 text-xs font-bold">–</span>
                            <input
                              type="date"
                              value={mobileCustomEnd}
                              onChange={(e) => setMobileCustomEnd(e.target.value)}
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                            />
                            <button
                              onClick={() => {
                                if (mobileCustomStart && mobileCustomEnd) {
                                  setDateRange({ start: mobileCustomStart, end: mobileCustomEnd, label: 'Custom Range' });
                                  setShowMobileCustomDates(false);
                                }
                              }}
                              disabled={!mobileCustomStart || !mobileCustomEnd}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 shrink-0"
                            >
                              Go
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <DashboardDateFilter range={dateRange} onRangeChange={setDateRange} />
                    )}
                </div>
                )}

                <div className="hidden md:flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                        {activeTab === 'home' && 'Overview'}
                        {activeTab === 'history' && 'Transactions'}
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">
                        Manage your finances with confidence.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
                    {/* Global Search - Only show in history tab */}
                    {activeTab === 'history' && (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative group flex-1 sm:flex-none">
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
                            {/* Apply Merchant Memory Button - Always visible */}
                            <button
                              onClick={() => applyMerchantMemory(filteredTransactions)}
                              disabled={applyingMemory}
                              className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-violet-700 text-sm font-medium hover:bg-violet-100 hover:border-violet-300 transition-all shadow-sm disabled:opacity-50"
                              title="Apply learned categorizations to uncategorized transactions"
                            >
                              <Sparkles size={14} />
                              <span>{applyingMemory ? 'Applying...' : 'Apply Memory'}</span>
                            </button>
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
            <div className="animate-in fade-in duration-500">

              {/* ===== MOBILE DASHBOARD (fintech SaaS style) ===== */}
              <div className="md:hidden space-y-4 px-2 sm:px-0">
                {/* Timeframe & Currency Switchers */}
                <div className="flex items-center justify-between gap-2">
                  {/* Timeframe Selector */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg overflow-x-auto hide-scrollbar">
                    {[
                      { label: 'MTD', fullLabel: 'This Month', getValue: () => {
                        const now = new Date();
                        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
                      }},
                      { label: 'Last Wk', fullLabel: 'Last Week', getValue: () => {
                        const now = new Date();
                        const dayOfWeek = now.getDay();
                        const lastMonday = new Date(now);
                        lastMonday.setDate(now.getDate() - dayOfWeek - 6);
                        const lastSunday = new Date(lastMonday);
                        lastSunday.setDate(lastMonday.getDate() + 6);
                        return { start: lastMonday, end: lastSunday };
                      }},
                      { label: 'Last Mo', fullLabel: 'Last Month', getValue: () => {
                        const now = new Date();
                        return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
                      }},
                      { label: 'Year', fullLabel: 'This Year', getValue: () => {
                        const now = new Date();
                        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
                      }},
                    ].map((preset) => {
                      const isActive = dateRange.label === preset.fullLabel;
                      return (
                        <button
                          key={preset.fullLabel}
                          onClick={() => {
                            const { start, end } = preset.getValue();
                            setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], label: preset.fullLabel });
                            setShowMobileCustomDates(false);
                          }}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${isActive && !showMobileCustomDates ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setShowMobileCustomDates(!showMobileCustomDates)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${showMobileCustomDates || dateRange.label === 'Custom Range' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Custom
                    </button>
                  </div>
                  {/* Currency Switcher */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg shrink-0">
                    <button
                      onClick={() => setCurrency('GBP')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${currency === 'GBP' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      £
                    </button>
                    <button
                      onClick={() => setCurrency('AED')}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${currency === 'AED' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      AED
                    </button>
                  </div>
                </div>

                {/* Custom Date Range Picker */}
                {showMobileCustomDates && (
                  <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2.5">
                    <input
                      type="date"
                      value={mobileCustomStart}
                      onChange={(e) => setMobileCustomStart(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                    />
                    <span className="text-slate-300 text-xs font-bold">–</span>
                    <input
                      type="date"
                      value={mobileCustomEnd}
                      onChange={(e) => setMobileCustomEnd(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                    />
                    <button
                      onClick={() => {
                        if (mobileCustomStart && mobileCustomEnd) {
                          setDateRange({ start: mobileCustomStart, end: mobileCustomEnd, label: 'Custom Range' });
                          setShowMobileCustomDates(false);
                        }
                      }}
                      disabled={!mobileCustomStart || !mobileCustomEnd}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 shrink-0"
                    >
                      Go
                    </button>
                  </div>
                )}

                {/* Mobile KPI Cards */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">↗</span>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">Income</span>
                    </div>
                    <p className="text-base font-bold text-emerald-600">{formatCurrency(summary.totalIncome)}</p>
                    <p className="text-[9px] font-medium text-slate-400 mt-0.5">
                      {currency === 'GBP' ? `AED ${summaryAlt.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `£${summaryAlt.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">↘</span>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">Expenses</span>
                    </div>
                    <p className="text-base font-bold text-slate-900">{formatCurrency(summary.totalExpense)}</p>
                    <p className="text-[9px] font-medium text-slate-400 mt-0.5">
                      {currency === 'GBP' ? `AED ${summaryAlt.totalExpense.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `£${summaryAlt.totalExpense.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">💰</span>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">Saved</span>
                    </div>
                    <p className={`text-base font-bold ${summary.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(summary.balance)}</p>
                    <p className="text-[9px] font-medium text-slate-400 mt-0.5">
                      {currency === 'GBP' ? `AED ${summaryAlt.balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `£${summaryAlt.balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                </div>

                {/* Income Card */}
                {(() => {
                  const incomeCat = incomeCategories[0];
                  if (!incomeCat) return null;

                  const incomeTransactions = activeTransactions.filter(t => t.type === 'INCOME');
                  const incomeTotal = incomeTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);
                  const incomeTotalAlt = incomeTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountAED : t.amountGBP), 0);

                  const groupedIncome = new Map<string, { description: string; subcategoryName: string; amount: number; count: number }>();
                  incomeTransactions.forEach(t => {
                    const key = t.description || 'Unknown';
                    const txAmount = currency === 'GBP' ? t.amountGBP : t.amountAED;
                    const existing = groupedIncome.get(key);
                    if (existing) {
                      existing.amount += txAmount;
                      existing.count += 1;
                    } else {
                      groupedIncome.set(key, { description: key, subcategoryName: t.subcategoryName, amount: txAmount, count: 1 });
                    }
                  });
                  const topIncomeGrouped = Array.from(groupedIncome.values())
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 6);

                  return (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">💰</span>
                            <span className="text-xs font-bold text-slate-900">Income</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-900">{formatCurrency(incomeTotal)}</span>
                            <p className="text-[9px] font-medium text-slate-400">{currency === 'GBP' ? `AED ${incomeTotalAlt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `£${incomeTotalAlt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-slate-400">📋 INCOME SHEET</span>
                        </div>
                      </div>
                      <div>
                        <div className="grid grid-cols-[1fr_28px_72px] bg-slate-100 border-b border-dashed border-slate-200/80 sticky top-0 z-10">
                          <div className="px-3 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Merchant</div>
                          <div className="px-1 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-dashed border-slate-200/80">Qty</div>
                          <div className="px-2 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto">
                          {topIncomeGrouped.map((g, idx) => (
                            <div key={g.description} className={`grid grid-cols-[1fr_28px_72px] items-center border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                              <div className="px-3 py-2.5 border-r border-dashed border-slate-200/80 flex items-center justify-between gap-1 min-w-0">
                                <span className="text-[11px] font-medium text-slate-700 truncate">{g.description}</span>
                                {g.subcategoryName && (
                                  <span className="px-1.5 py-px bg-slate-50 border border-slate-200 rounded-md text-[7px] font-medium text-slate-500 shrink-0 leading-tight">{g.subcategoryName}</span>
                                )}
                              </div>
                              <div className="px-1 py-2.5 text-center border-r border-dashed border-slate-200/80">
                                <span className="text-[10px] text-slate-400">{g.count > 1 ? g.count : ''}</span>
                              </div>
                              <div className="px-2 py-2.5 text-right">
                                <span className="text-[11px] font-semibold text-emerald-700">{formatCurrency(g.amount)}</span>
                              </div>
                            </div>
                          ))}
                          {topIncomeGrouped.length === 0 && (
                            <div className="py-4 text-center text-slate-400 text-xs">No income</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Expense Category Cards */}
                {mobileCategoryIds.map((catId, index) => {
                  const cat = expenseCategories.find(c => c.id === catId);
                  if (!cat) return null;

                  const catTransactions = activeTransactions.filter(t => t.categoryId === cat.id);
                  const catTotal = catTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);
                  const catTotalAlt = catTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountAED : t.amountGBP), 0);

                  const groupedTransactions = new Map<string, { description: string; subcategoryName: string; amount: number; count: number }>();
                  catTransactions.forEach(t => {
                    const key = t.description || 'Unknown';
                    const txAmount = currency === 'GBP' ? t.amountGBP : t.amountAED;
                    const existing = groupedTransactions.get(key);
                    if (existing) {
                      existing.amount += txAmount;
                      existing.count += 1;
                    } else {
                      groupedTransactions.set(key, { description: key, subcategoryName: t.subcategoryName, amount: txAmount, count: 1 });
                    }
                  });
                  const topGrouped = Array.from(groupedTransactions.values())
                    .sort((a, b) => b.amount - a.amount);

                  return (
                    <div key={`mobile-${index}-${catId}`} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-3">
                            <span className="text-base">{getCategoryEmoji(catId)}</span>
                            <div className="relative flex-1 min-w-0">
                              <span className="text-xs font-bold text-slate-900">{cat.name}</span>
                              <select
                                value={catId}
                                onChange={(e) => handleMobileCategoryChange(index, e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              >
                                {expenseCategories.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900">{formatCurrency(catTotal)}</span>
                              <p className="text-[9px] font-medium text-slate-400">{currency === 'GBP' ? `AED ${catTotalAlt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `£${catTotalAlt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                            </div>
                            {mobileCategoryIds.length > 1 && (
                              <button
                                onClick={() => handleRemoveMobileCardWithConfirm(index)}
                                className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-slate-500 text-xs"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-slate-400">📋 EXPENSE SHEET</span>
                        </div>
                      </div>

                      <div>
                        <div className="grid grid-cols-[1fr_28px_72px] bg-slate-100 border-b border-dashed border-slate-200/80 sticky top-0 z-10">
                          <div className="px-3 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Merchant</div>
                          <div className="px-1 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider text-center border-r border-dashed border-slate-200/80">Qty</div>
                          <div className="px-2 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto">
                          {topGrouped.map((g, idx) => (
                            <div key={g.description} className={`grid grid-cols-[1fr_28px_72px] items-center border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                              <div className="px-3 py-2.5 border-r border-dashed border-slate-200/80 flex items-center justify-between gap-1 min-w-0">
                                <span className="text-[11px] font-medium text-slate-700 truncate">{g.description}</span>
                                {g.subcategoryName && (
                                  <span className="px-1.5 py-px bg-slate-50 border border-slate-200 rounded-md text-[7px] font-medium text-slate-500 shrink-0 leading-tight">{g.subcategoryName}</span>
                                )}
                              </div>
                              <div className="px-1 py-2.5 text-center border-r border-dashed border-slate-200/80">
                                <span className="text-[10px] text-slate-400">{g.count > 1 ? g.count : ''}</span>
                              </div>
                              <div className="px-2 py-2.5 text-right">
                                <span className="text-[11px] font-semibold text-slate-800">{formatCurrency(g.amount)}</span>
                              </div>
                            </div>
                          ))}
                          {topGrouped.length === 0 && (
                            <div className="py-4 text-center text-slate-400 text-xs">No transactions</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={handleAddMobileCard}
                  className="w-full py-3 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-medium hover:border-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  Add Category Card
                </button>

                {/* Spend by Category */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 overflow-hidden">
                  <div className="flex flex-col gap-3 mb-3 flex-shrink-0">
                     <div className="flex justify-between items-center">
                         {filterCategory === 'all' && filterSubcategory === 'all' ? (
                             <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                 <button
                                    onClick={() => setBreakdownViewMode('category')}
                                    className={`px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all ${breakdownViewMode === 'category' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                 >
                                     Categories
                                 </button>
                                 <button
                                    onClick={() => setBreakdownViewMode('subcategory')}
                                    className={`px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all ${breakdownViewMode === 'subcategory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                 >
                                     Subcategories
                                 </button>
                             </div>
                         ) : (
                             <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                               {filterCategory !== 'all' ? 'Breakdown' : 'Filtered'}
                             </h3>
                         )}
                         {(filterCategory !== 'all' || filterSubcategory !== 'all') && (
                            <button onClick={handleResetFilters} className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">Reset</button>
                        )}
                     </div>
                     <div className="flex gap-2">
                        <select
                            value={filterCategory}
                            onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory('all'); }}
                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium rounded-lg px-2.5 py-2 outline-none cursor-pointer"
                        >
                            <option value="all">Category: All</option>
                            {expenseCategories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                        </select>
                        <select
                            value={filterSubcategory}
                            onChange={(e) => setFilterSubcategory(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium rounded-lg px-2.5 py-2 outline-none cursor-pointer"
                        >
                            <option value="all">Sub: All</option>
                            {availableSubcategories.map(sub => (<option key={sub} value={sub}>{sub}</option>))}
                        </select>
                     </div>
                  </div>
                  <div className="space-y-4">
                      {(() => {
                          let displayData: { name?: string; category?: Category; total: number; color?: string; parentId?: string }[] = [];
                          let listType: 'category' | 'subcategory' = 'category';
                          if (filterCategory !== 'all') { displayData = subcategoryBreakdown; listType = 'subcategory'; }
                          else if (filterSubcategory !== 'all') { displayData = allSubcategoryBreakdown.filter(i => i.name === filterSubcategory); listType = 'subcategory'; }
                          else if (breakdownViewMode === 'subcategory') { displayData = allSubcategoryBreakdown; listType = 'subcategory'; }
                          else { displayData = categoryBreakdown.filter(c => c.category.type === 'EXPENSE'); listType = 'category'; }

                          if (displayData.length === 0) return <div className="flex items-center justify-center h-20 text-slate-400 text-xs">No expenses found</div>;

                          return displayData.map((item: any) => {
                              const percentage = globalSummary.totalExpense > 0 ? ((item.total / globalSummary.totalExpense) * 100) : 0;
                              const label = listType === 'category' ? item.category.name : item.name;
                              const color = listType === 'category' ? item.category.color : item.color;
                              const catId = listType === 'category' ? item.category.id : item.parentId;
                              const txCount = item.transactions ? item.transactions.length : 0;
                              return (
                                  <div key={label} className="py-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm">{getCategoryEmoji(catId || '')}</span>
                                        <span className="text-xs font-medium text-slate-700">{label}</span>
                                        {txCount > 0 && <span className="text-[9px] text-slate-400 font-medium">{txCount}</span>}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400">{percentage.toFixed(1)}%</span>
                                        <span className="text-xs font-semibold text-slate-900">{formatCurrency(item.total)}</span>
                                      </div>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${percentage}%`, backgroundColor: color || '#94a3b8' }} />
                                    </div>
                                  </div>
                              );
                          });
                      })()}
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Expenses</span>
                          <span className="text-base font-bold text-slate-900">{formatCurrency(globalSummary.totalExpense)}</span>
                      </div>
                  </div>
                </div>

                {/* Excluded Transactions */}
                {excludedTransactions.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">🚫</span>
                          <span className="text-xs font-bold text-slate-900">Excluded</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400">
                          {formatCurrency(excludedTransactions.reduce((sum, t) => sum + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-slate-400">{excludedTransactions.length} transactions</span>
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      <div className="grid grid-cols-[1fr_72px] bg-slate-100 border-b border-dashed border-slate-200/80 sticky top-0 z-10">
                        <div className="px-3 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider border-r border-dashed border-slate-200/80">Merchant</div>
                        <div className="px-2 py-1.5 text-[8px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</div>
                      </div>
                      {excludedTransactions.map((t, idx) => (
                        <div key={t.id} className={`grid grid-cols-[1fr_72px] items-center border-b border-dashed border-slate-200/80 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                          <div className="px-3 py-2.5 min-w-0 border-r border-dashed border-slate-200/80">
                            <span className="text-[11px] font-medium text-slate-500 truncate block">{t.description}</span>
                            <span className="text-[9px] text-slate-400">{t.date}</span>
                          </div>
                          <div className="px-2 py-2.5 text-right">
                            <span className="text-[11px] font-semibold text-slate-400">{formatCurrency(currency === 'GBP' ? t.amountGBP : t.amountAED)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ===== DESKTOP DASHBOARD (new fintech SaaS layout) ===== */}
              <div className="hidden md:block space-y-6">

                {/* Desktop KPI Row */}
                <div className="grid grid-cols-3 gap-4">
                  <StatsCard
                    label="Income"
                    amount={summary.totalIncome}
                    type="INCOME"
                    currency={currency}
                    variant="kpi-revenue"
                    amountAlt={summaryAlt.totalIncome}
                    percentChange={(() => {
                      // Simple period-over-period: compare current range to same-length prior range
                      const start = new Date(dateRange.start);
                      const end = new Date(dateRange.end);
                      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                      const priorStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
                      const priorEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
                      const priorIncome = transactions
                        .filter(t => !t.excluded && t.categoryId !== 'excluded' && t.type === 'INCOME' && t.date >= priorStart.toISOString().split('T')[0] && t.date <= priorEnd.toISOString().split('T')[0])
                        .reduce((s, t) => s + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);
                      return priorIncome > 0 ? ((summary.totalIncome - priorIncome) / priorIncome) * 100 : 0;
                    })()}
                  />
                  <StatsCard
                    label="Expenses"
                    amount={summary.totalExpense}
                    type="EXPENSE"
                    currency={currency}
                    variant="kpi-expense"
                    revenueAmount={summary.totalIncome}
                    amountAlt={summaryAlt.totalExpense}
                    percentChange={(() => {
                      const start = new Date(dateRange.start);
                      const end = new Date(dateRange.end);
                      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                      const priorStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
                      const priorEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
                      const priorExpense = transactions
                        .filter(t => !t.excluded && t.categoryId !== 'excluded' && t.type === 'EXPENSE' && t.date >= priorStart.toISOString().split('T')[0] && t.date <= priorEnd.toISOString().split('T')[0])
                        .reduce((s, t) => s + (currency === 'GBP' ? t.amountGBP : t.amountAED), 0);
                      return priorExpense > 0 ? ((summary.totalExpense - priorExpense) / priorExpense) * 100 : 0;
                    })()}
                  />
                  <StatsCard
                    label="Profitability"
                    amount={summary.balance}
                    type="BALANCE"
                    currency={currency}
                    variant="kpi-profitability"
                    revenueAmount={summary.totalIncome}
                    expenseAmount={summary.totalExpense}
                    revenueAmountAlt={summaryAlt.totalIncome}
                    expenseAmountAlt={summaryAlt.totalExpense}
                  />
                </div>

                {/* Section Title */}
                <h3 className="text-xl font-bold text-slate-900">Top Expense Categories</h3>

                {/* Main Content: Category Cards (left) + Allocation Sidebar (right) */}
                <div className="grid grid-cols-12 gap-6 items-start">

                  {/* Left: Category Cards */}
                  <div className="col-span-12 xl:col-span-9">
                    <div className="grid xl:grid-cols-3 lg:grid-cols-2 gap-5">
                      {widgetCategoryIds.map((catId, index) => (
                        <div key={`desktop-${index}-${catId}`} className="relative group">
                          {widgetCategoryIds.length > 1 && (
                            <button
                              onClick={() => handleRemoveDesktopWidget(index)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-slate-200 hover:bg-rose-500 hover:border-rose-500 text-slate-400 hover:text-white rounded-full flex items-center justify-center text-xs font-medium transition-all shadow-sm z-50 opacity-0 group-hover:opacity-100"
                              title="Remove widget"
                            >
                              ×
                            </button>
                          )}
                          <CategoryTrendWidget
                            categoryId={catId}
                            onCategoryChange={(newId) => handleWidgetCategoryChange(index, newId)}
                            allCategories={[...expenseCategories, ...incomeCategories]}
                            transactions={activeTransactions}
                            currency={currency}
                            variant="expense-sheet"
                            getCategoryEmoji={getCategoryEmoji}
                            onEmojiChange={handleEmojiChange}
                          />
                        </div>
                      ))}
                      {/* Add Widget Button */}
                      <button
                        onClick={handleAddDesktopWidget}
                        className="h-full min-h-[200px] border border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors flex flex-col items-center justify-center gap-2"
                      >
                        <Plus size={20} />
                        <span className="text-xs font-medium">Add Widget</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Allocation Sidebar */}
                  <div className="col-span-12 xl:col-span-3">
                    <AllocationSidebar
                      categoryBreakdown={categoryBreakdown}
                      totalExpenses={globalSummary.totalExpense}
                      formatCurrency={formatCurrency}
                      getCategoryEmoji={getCategoryEmoji}
                      incomeTransactions={activeTransactions.filter(t => t.type === 'INCOME')}
                      excludedTransactions={dateFilteredTransactions.filter(t => t.excluded || t.categoryId === 'excluded')}
                      currency={currency}
                    />
                  </div>

                </div>
              </div>

            </div>
          )}
          
          {/* YEARLY VIEW */}
          {activeTab === 'yearly' && (
             <div className="h-full">
                <YearlySummary transactions={transactions} categories={categories} onRefresh={fetchData} getCategoryEmoji={getCategoryEmoji} />
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
                    getCategoryEmoji={getCategoryEmoji}
                    onEmojiChange={handleEmojiChange}
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
            <div className="h-full overflow-y-auto flex flex-col space-y-2 sm:space-y-4 px-2 sm:px-0 pb-32">
               {/* Hidden on mobile/tablet, visible on desktop only */}
               <div className="hidden lg:block">
                 <BankFeedUpload
                    onImport={handleImportTransactions}
                    webhookUrl={webhookUrl}
                    banks={banks}
                    merchantMappings={merchantMappings}
                 />
               </div>

              {/* Summary Cards - Desktop */}
              <div className="hidden md:grid md:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col items-center">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Total</span>
                  <span className="text-base font-bold text-slate-900">£{dailyAverageData.totalGBP.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-[11px] font-medium text-slate-400 mt-0.5">AED {dailyAverageData.totalAED.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col items-center">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Avg/Trans</span>
                  <span className="text-base font-bold text-slate-900">£{dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalGBP / dailyAverageData.transactionCount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                  <span className="text-[11px] font-medium text-slate-400 mt-0.5">AED {dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalAED / dailyAverageData.transactionCount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col items-center">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Trans</span>
                  <span className="text-base font-bold text-slate-900">{dailyAverageData.transactionCount}</span>
                </div>
              </div>

              {/* Summary Cards - Mobile */}
              <div className="md:hidden grid grid-cols-3 gap-2">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2.5 flex flex-col items-center">
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Total</span>
                  <span className="text-sm font-bold text-slate-900">£{dailyAverageData.totalGBP.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-[10px] font-medium text-slate-400 mt-0.5">AED {dailyAverageData.totalAED.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2.5 flex flex-col items-center">
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Avg/Trans</span>
                  <span className="text-sm font-bold text-slate-900">£{dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalGBP / dailyAverageData.transactionCount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                  <span className="text-[10px] font-medium text-slate-400 mt-0.5">AED {dailyAverageData.transactionCount > 0 ? (dailyAverageData.totalAED / dailyAverageData.transactionCount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2.5 flex flex-col items-center">
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Trans</span>
                  <span className="text-sm font-bold text-slate-900">{dailyAverageData.transactionCount}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-2 sm:p-3 animate-in fade-in shadow-sm flex flex-col flex-1 min-h-[500px] md:min-h-[600px] overflow-visible md:overflow-hidden">
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

                      {/* Subcategory Filter */}
                      <div className="relative">
                          <select
                              value={filterSubcategory}
                              onChange={(e) => setFilterSubcategory(e.target.value)}
                              className="appearance-none pl-2 sm:pl-3 pr-6 sm:pr-8 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                              <option value="all">Sub: All</option>
                              {availableSubcategories.map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                              ))}
                          </select>
                          <Filter size={10} className="sm:w-3 sm:h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Recently Added Filter */}
                      <div className="relative">
                          <select
                              value={filterRecentlyAdded}
                              onChange={(e) => setFilterRecentlyAdded(e.target.value as 'all' | 'today' | 'week' | 'uncategorized')}
                              className="appearance-none pl-2 sm:pl-3 pr-6 sm:pr-8 py-1.5 sm:py-2 bg-violet-50 border border-violet-200 rounded-lg text-[10px] sm:text-xs font-bold text-violet-700 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 cursor-pointer hover:bg-violet-100 transition-colors"
                          >
                              <option value="all">Added: All</option>
                              <option value="today">Added Today</option>
                              <option value="week">Added This Week</option>
                              <option value="uncategorized">Uncategorized</option>
                          </select>
                          <Sparkles size={10} className="sm:w-3 sm:h-3 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
                      </div>

                      {/* Reset Button */}
                      {(filterCategory !== 'all' || filterSubcategory !== 'all' || filterType !== 'all' || filterBank !== 'all' || filterRecentlyAdded !== 'all') && (
                          <button
                              onClick={handleResetFilters}
                              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                          >
                              <X size={10} className="sm:w-3 sm:h-3" />
                              Reset
                          </button>
                      )}
                  </div>

                  {/* Mobile Search Bar */}
                  <div className="md:hidden mt-2">
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                        <Search size={14} />
                      </div>
                      <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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

      {/* Import Review Modal */}
      {importReviewOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[75vw] h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Sparkles className="text-violet-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Review Imported Transactions</h2>
                  <p className="text-sm text-slate-500">
                    {pendingImportTransactions.length} transactions • Categorize before saving
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Discard imported transactions without saving?')) {
                    setPendingImportTransactions([]);
                    setImportReviewOpen(false);
                  }
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <button
                onClick={() => {
                  // Apply merchant memory to pending transactions
                  const readyMappings = merchantMappings.filter(m => (m.count || 0) >= MAPPING_THRESHOLD);
                  let applied = 0;
                  setPendingImportTransactions(prev => prev.map(t => {
                    if (t.categoryId) return t; // Already categorized
                    const mapping = readyMappings.find(m =>
                      m.merchant_pattern.toLowerCase() === t.description.toLowerCase()
                    );
                    if (mapping) {
                      applied++;
                      return {
                        ...t,
                        categoryId: mapping.category_id,
                        categoryName: mapping.category_name,
                        subcategoryName: mapping.subcategory_name
                      };
                    }
                    return t;
                  }));
                  if (applied > 0) {
                    alert(`Applied memory to ${applied} transactions`);
                  } else {
                    alert('No matching merchants found in memory');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 border border-violet-200 rounded-lg text-violet-700 text-sm font-medium hover:bg-violet-200 transition-colors"
              >
                <Sparkles size={14} />
                Apply Memory
              </button>
              <span className="text-xs text-slate-400">
                {pendingImportTransactions.filter(t => !t.categoryId || t.categoryId === '').length} uncategorized
              </span>
            </div>

            {/* Transaction List */}
            {/* Header Row */}
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-[75px] text-[10px] font-bold text-slate-500 uppercase">Date</div>
                <div className="w-[70px] text-[10px] font-bold text-slate-500 uppercase">Bank</div>
                <div className="flex-1 text-[10px] font-bold text-slate-500 uppercase">Merchant</div>
                <div className="w-[85px] text-[10px] font-bold text-slate-500 uppercase text-right">GBP</div>
                <div className="w-[85px] text-[10px] font-bold text-slate-500 uppercase text-right">AED</div>
                <div className="w-[120px] text-[10px] font-bold text-slate-500 uppercase">Category</div>
                <div className="w-[120px] text-[10px] font-bold text-slate-500 uppercase">Subcategory</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="divide-y divide-slate-100">
                {pendingImportTransactions.map(t => {
                    const currentCategory = categories.find(c => c.id === t.categoryId);
                    return (
                      <div key={t.id} className={`px-3 py-2.5 hover:bg-slate-50 transition-colors ${!t.categoryId ? 'bg-amber-50/50' : ''}`}>
                        <div className="flex items-center gap-2">
                          {/* Date */}
                          <div className="w-[75px] shrink-0">
                            <p className="text-sm font-medium text-slate-700">{t.date}</p>
                          </div>

                          {/* Bank */}
                          <div className="w-[70px] shrink-0">
                            <p className="text-xs text-slate-600 truncate" title={t.bankName}>{t.bankName}</p>
                          </div>

                          {/* Merchant/Description */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate" title={t.description}>{t.description}</p>
                          </div>

                          {/* GBP Amount */}
                          <div className="w-[85px] shrink-0 text-right">
                            <p className={`font-bold font-mono text-sm ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                              £{t.amountGBP.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>

                          {/* AED Amount */}
                          <div className="w-[85px] shrink-0 text-right">
                            <p className={`font-bold font-mono text-sm ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {t.amountAED.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>

                          {/* Category */}
                          <div className="w-[120px] shrink-0">
                            <select
                              value={t.categoryId}
                              onChange={(e) => {
                                const cat = categories.find(c => c.id === e.target.value);
                                const firstSub = cat?.subcategories[0] || '';
                                updatePendingTransaction(t.id, {
                                  categoryId: e.target.value,
                                  categoryName: cat?.name || '',
                                  subcategoryName: firstSub
                                });
                              }}
                              className={`w-full px-2 py-1 text-xs font-medium rounded border outline-none cursor-pointer ${
                                t.categoryId ? 'bg-white border-slate-300' : 'bg-amber-100 border-amber-300 text-amber-700'
                              }`}
                            >
                              <option value="">Select...</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Subcategory */}
                          <div className="w-[120px] shrink-0">
                            <select
                              value={t.subcategoryName}
                              onChange={(e) => updatePendingTransaction(t.id, { subcategoryName: e.target.value })}
                              disabled={!currentCategory || currentCategory.subcategories.length === 0}
                              className={`w-full px-2 py-1 text-xs font-medium rounded border outline-none cursor-pointer ${
                                !currentCategory || currentCategory.subcategories.length === 0
                                  ? 'bg-slate-100 border-slate-200 text-slate-400'
                                  : 'bg-white border-slate-300'
                              }`}
                            >
                              <option value="">Select...</option>
                              {currentCategory?.subcategories.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
              <p className="text-sm text-slate-500">
                {pendingImportTransactions.filter(t => !t.categoryId).length > 0
                  ? `${pendingImportTransactions.filter(t => !t.categoryId).length} transactions still need categorizing`
                  : 'All transactions categorized!'
                }
              </p>
              <button
                onClick={saveImportedTransactions}
                disabled={savingImport}
                className="px-6 py-2.5 bg-[#635bff] text-white font-semibold rounded-xl hover:bg-[#5851e3] transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {savingImport ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
