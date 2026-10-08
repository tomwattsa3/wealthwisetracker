
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { DURATION, EASE_OUT, STAGGER_CONTAINER, STAGGER_ITEM } from './lib/motion';
import { Session } from '@supabase/supabase-js';
import { Transaction, FinancialSummary, Category, Bank, MerchantMapping } from './types';
import { INITIAL_CATEGORIES, INITIAL_BANKS } from './constants';
import { supabase } from './supabaseClient';
import LoginPage from './components/LoginPage';
import TransactionForm from './components/TransactionForm';
import TransactionsView from './components/TransactionsView';
import SpendingPatterns from './components/SpendingPatterns';
import MobileHome from './components/MobileHome';
import CategorySheets from './components/CategorySheets';
import StatsCard from './components/StatsCard';
import DashboardDateFilter, { DateRange } from './components/DashboardDateFilter';
import CategoryTrendWidget from './components/CategoryTrendWidget';
import AllocationSidebar from './components/AllocationSidebar';
import CategoryManager from './components/CategoryManager';
import ImportCsvModal from './components/ImportCsvModal';
import { usePrivacy } from './lib/privacy';
import BlurStrengthSlider from './components/BlurStrengthSlider';
import { TxActionsContext } from './components/TxDetail';
import MoreSheet from './components/MoreSheet';
import SettingsManager from './components/SettingsManager';
import BreakdownTab from './components/BreakdownTab';
import RecurringPayments from './components/RecurringPayments';
import DashboardSkeleton from './components/DashboardSkeleton';
import SegmentedControl from './components/SegmentedControl';
import {
  LayoutDashboard, Plus, Home,
  ChevronLeft, ChevronRight, EyeOff, TrendingUp,
  Car, Plane, Smartphone, Coffee, ShoppingBag, PoundSterling, Activity, X,
  FolderCog, CalendarRange, LayoutGrid, ArrowRightLeft, Settings,
  RotateCcw, Loader2, LogOut, Sparkles, Sun, Moon, Table, Repeat, Eye, MoreHorizontal
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

// Ordered keyword → emoji lookup, checked most-specific-first, for auto-picking a fitting
// emoji from a category's name (the way a model would infer one) when no emoji is set.
const CATEGORY_EMOJI_KEYWORDS: [string[], string][] = [
    [['food delivery', 'delivery'], '🛵'],
    [['coffee', 'cafe', 'caffe'], '☕'],
    [['restaurant', 'dining', 'meal', 'eating out', 'takeaway', 'take-away'], '🍽️'],
    [['grocery', 'groceries', 'supermarket'], '🛒'],
    [['food'], '🍔'],
    [['rent', 'mortgage', 'housing', 'home'], '🏠'],
    [['electric', 'utility', 'utilities', 'dewa'], '💡'],
    [['water', 'gas bill'], '🚰'],
    [['wifi', 'internet', 'broadband'], '📶'],
    [['phone', 'mobile'], '📱'],
    [['fuel', 'petrol', 'gas station', 'enoc', 'adnoc'], '⛽'],
    [['parking'], '🅿️'],
    [['taxi', 'uber', 'careem', 'rideshare', 'ride share', 'cab'], '🚕'],
    [['train', 'metro', 'subway', 'bus', 'transit'], '🚆'],
    [['car', 'vehicle', 'auto'], '🚗'],
    [['transport', 'transportation'], '🚌'],
    [['flight', 'airfare', 'airline'], '✈️'],
    [['hotel', 'accommodation'], '🏨'],
    [['vacation', 'holiday', 'trip'], '🧳'],
    [['travel'], '✈️'],
    [['subscription', 'streaming', 'netflix', 'spotify'], '📺'],
    [['software', 'saas', 'app', 'apps'], '💻'],
    [['work', 'business', 'office'], '💼'],
    [['salary', 'wage', 'payroll'], '💰'],
    [['freelance', 'contract'], '🧑‍💻'],
    [['income'], '💰'],
    [['invest', 'investment', 'stock', 'stocks'], '📈'],
    [['saving', 'savings'], '🏦'],
    [['debt', 'loan', 'credit card', 'repayment'], '💳'],
    [['insurance'], '🛡️'],
    [['medical', 'doctor', 'hospital', 'clinic', 'dentist'], '🏥'],
    [['pharmacy', 'medicine', 'health'], '💊'],
    [['gym', 'fitness', 'workout'], '🏋️'],
    [['wellness', 'spa', 'massage'], '🧖'],
    [['beauty', 'haircut', 'salon', 'barber'], '💇'],
    [['pet', 'dog', 'cat', 'vet'], '🐶'],
    [['kid', 'kids', 'child', 'children', 'baby'], '👶'],
    [['education', 'school', 'course', 'tuition', 'learning'], '🎓'],
    [['book', 'books'], '📚'],
    [['gift', 'present'], '🎁'],
    [['charity', 'donation'], '❤️'],
    [['movie', 'cinema', 'film'], '🎬'],
    [['game', 'gaming'], '🎮'],
    [['music'], '🎵'],
    [['tax', 'vat'], '🧾'],
    [['bank fee', 'bank charge', 'fee'], '🏦'],
    [['clothes', 'clothing', 'fashion', 'apparel'], '👕'],
    [['shopping'], '🛍️'],
    [['transfer'], '🔁'],
    [['exclude'], '🚫'],
    [['day to day', 'daily spending', 'everyday'], '🧾'],
    [['random', 'misc', 'miscellaneous'], '📦'],
    [['personal'], '👤'],
];

// Auto-pick a fitting emoji from a category name when nothing has been explicitly set,
// similar to how a model would infer an emoji for a topic.
const guessCategoryEmoji = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    for (const [keywords, emoji] of CATEGORY_EMOJI_KEYWORDS) {
        if (keywords.some(k => lower.includes(k))) return emoji;
    }
    return undefined;
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
      // Default to "YTD"
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return {
          start: start.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
          label: 'YTD'
      };
  });

  // Currency State
  const [currency, setCurrency] = useState<'GBP' | 'AED'>('GBP');

  // Dark Mode State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Mobile custom date picker state
  const [showMobileCustomDates, setShowMobileCustomDates] = useState(false);
  const [mobileCustomStart, setMobileCustomStart] = useState('');
  const [mobileCustomEnd, setMobileCustomEnd] = useState('');

  // Loan repayment card filter state
  const [repaymentCatId, setRepaymentCatId] = useState<string>('');
  const [repaymentSubcat, setRepaymentSubcat] = useState<string>('all');

  // Pull-to-refresh state. The drag itself is driven imperatively via refs (setIndicator) rather
  // than React state: App is one very large component, and re-rendering it on every touchmove —
  // or on every plain tap at scrollTop 0 — was blocking the main thread long enough on iPhone
  // that taps felt unresponsive. Only the refreshing spinner goes through state.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  const pullIconRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 70;
  // Finger travel ignored before a pull engages, so taps and small jitters never count as a pull
  const PULL_DEADZONE = 10;

  // The indicator is a small floating bubble that drops down from the top as you pull; the page
  // itself stays still.
  const setIndicator = (distance: number, animate: boolean) => {
    pullDistanceRef.current = distance;
    const el = pullIndicatorRef.current;
    const icon = pullIconRef.current;
    if (!el || !icon) return;
    const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transition = animate ? `transform 0.3s ${ease}, opacity 0.2s ease` : 'none';
    el.style.transform = `translate(-50%, ${distance - 48}px) scale(${0.6 + 0.4 * Math.min(distance / PULL_THRESHOLD, 1)})`;
    el.style.opacity = distance > 10 || isRefreshingRef.current ? '1' : '0';
    icon.style.transition = animate ? 'transform 0.3s ease-out' : 'none';
    icon.style.transform = `rotate(${isRefreshingRef.current ? 0 : Math.min(distance / PULL_THRESHOLD, 1) * 270}deg)`;
    icon.style.color = distance >= PULL_THRESHOLD ? '#4f46e5' : '#94a3b8';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRefreshingRef.current) return;
    // Only touches on the page itself. React also passes up touches from sheets and pop-ups
    // (they're portals, drawn over the page), and pulling a sheet down must never refresh.
    if (!mainRef.current?.contains(e.target as Node) || document.documentElement.classList.contains('sheet-open')) return;
    // Skip pull-to-refresh for touches starting inside a nested scroll container (e.g. the
    // Breakdown table) — those scroll independently of <main>, so main.scrollTop stays at 0
    // even while the user is actively scrolling/tapping inside them, which was causing every
    // touch there to be misread as a pull-to-refresh drag.
    if ((e.target as HTMLElement).closest('[data-no-pull-refresh]')) return;
    // Tabs that scroll inside their own container (Transactions): only pull when it's at the top.
    const scroller = (e.target as HTMLElement).closest('[data-scroll-root]');
    if (scroller && scroller.scrollTop > 0) return;
    if (mainRef.current && mainRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRefreshingRef.current || !isPulling.current) return;
    if (!mainRef.current || mainRef.current.scrollTop > 0) {
      isPulling.current = false;
      if (pullDistanceRef.current > 0) setIndicator(0, false);
      return;
    }
    const diff = e.touches[0].clientY - touchStartY.current - PULL_DEADZONE;
    if (diff > 0) {
      // Elastic: follows the finger at first, then slows (refreshes after a ~150px pull)
      setIndicator(130 * (1 - Math.exp(-diff / 200)), false);
    } else if (pullDistanceRef.current > 0) {
      setIndicator(0, false);
    }
  };

  const handleTouchEnd = async () => {
    if (isRefreshingRef.current || !isPulling.current) return;
    isPulling.current = false;
    if (pullDistanceRef.current === 0) return; // plain tap — nothing to do
    if (pullDistanceRef.current >= PULL_THRESHOLD) {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      setIndicator(PULL_THRESHOLD, true);
      try {
        await fetchData();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    }
    setIndicator(0, true);
  };

  // Get transaction amount based on selected currency
  const getAmount = (t: Transaction) => {
    return Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
  };

  // Currency formatter helper
  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `£${formatted}` : `AED ${formatted}`;
  };

  // 'home' is the Dashboard (spending patterns); 'sheets' is Category Sheets, the per-category
  // merchant cards that used to be the dashboard.
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'categories' | 'sheets' | 'breakdown' | 'recurring' | 'settings'>(() => {
    const saved = localStorage.getItem('activeTab');
    // 'yearly' was the old Analytics tab, now the Dashboard.
    if (saved === 'yearly') return 'home';
    if (saved && ['home', 'history', 'categories', 'sheets', 'breakdown', 'recurring', 'settings'].includes(saved)) {
      return saved as 'home' | 'history' | 'categories' | 'sheets' | 'breakdown' | 'recurring' | 'settings';
    }
    return 'home';
  });

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Scroll position per tab — without this, <main> keeps whatever scrollTop it had from the
  // previous tab instead of resetting (or restoring the new tab's own remembered position),
  // since <main> itself never unmounts across tab switches. Restoration happens via a callback
  // ref (below, on the tab content's motion.div) rather than a useEffect keyed on activeTab,
  // because a callback ref fires exactly when React actually creates the new tab's DOM node —
  // a plain effect keyed on activeTab can fire a render early relative to that, before real
  // content (and therefore real scrollable height) exists.
  const scrollPositions = useRef<Record<string, number>>({});
  // Phones get a simpler one-screen Home; tablets and desktops keep the full Dashboard.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsPhone(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const handleTabChange = useCallback((newTab: typeof activeTab) => {
    if (mainRef.current) {
      scrollPositions.current[activeTab] = mainRef.current.scrollTop;
    }
    setActiveTab(newTab);
  }, [activeTab]);
  const restoreScrollOnMount = useCallback((el: HTMLDivElement | null) => {
    if (el && mainRef.current) {
      mainRef.current.scrollTop = scrollPositions.current[activeTab] ?? 0;
    }
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

  const getCategoryEmoji = (categoryId: string): string => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.emoji
      || DEFAULT_CATEGORY_EMOJIS[categoryId]
      || (cat?.name && guessCategoryEmoji(cat.name))
      || '📊';
  };

  const handleEmojiChange = async (categoryId: string, emoji: string) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, emoji } : c));
    const { error } = await supabase.from('Categories').update({ emoji }).eq('id', categoryId);
    if (error) console.error('Failed to update category emoji:', error);
  };

  // Re-guesses every category's emoji from its name and overwrites whatever's currently stored
  // (including ones that were already manually set) — for when the existing set has drifted from
  // what the names actually say, rather than fixing them one at a time.
  const reapplyAllCategoryEmojis = async () => {
    const updates = categories.map(c => ({ id: c.id, emoji: guessCategoryEmoji(c.name) || DEFAULT_CATEGORY_EMOJIS[c.id] || '📊' }));
    setCategories(prev => prev.map(c => {
      const match = updates.find(u => u.id === c.id);
      return match ? { ...c, emoji: match.emoji } : c;
    }));
    await Promise.all(updates.map(u => supabase.from('Categories').update({ emoji: u.emoji }).eq('id', u.id)));
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
    setMobileSubFilters(prev => ({ ...prev, [index]: 'all' }));
  };

  // Per-card subcategory filter for mobile expense cards, keyed by card index
  const [mobileSubFilters, setMobileSubFilters] = useState<Record<number, string>>({});

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
            color: c.color || '#94a3b8',
            emoji: c.emoji || undefined
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

          // Store both currency amounts with conversion fallback. Math.abs guards against a row
          // whose stored Money In/Out value is negative (e.g. a bad manual edit) — amountGBP/
          // amountAED are supposed to always be a positive magnitude everywhere downstream, with
          // `type` (INCOME/EXPENSE) carrying the direction, not the sign of the number itself.
          let amountGBP = Math.abs(isIncome ? moneyInGBP : moneyOutGBP);
          let amountAED = Math.abs(isIncome ? moneyInAED : moneyOutAED);

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
    if (!session) return;
    console.log('Session ready, calling fetchData...');
    fetchData();
    // Only re-run when the logged-in user actually changes (login/logout), not on every
    // token refresh — Supabase auto-refreshes the session (and fires a new session object)
    // whenever the tab regains focus, which was re-triggering a full data reload each time.
  }, [session?.user?.id]);

  // --- HANDLERS (UPDATED FOR SUPABASE) ---

  const handleAddCategory = async (newCat: Category) => {
    console.log('Adding category:', newCat);
    setCategories(prev => [...prev, newCat]);
    const { data, error } = await supabase.from('Categories').insert({
      id: newCat.id,
      name: newCat.name,
      subcategories: newCat.subcategories,
      type: newCat.type,
      color: newCat.color,
      user_id: session?.user?.id
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

  const handleRenameSubcategory = async (catId: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    const categoryToUpdate = categories.find(c => c.id === catId);
    if (!categoryToUpdate || !trimmed || trimmed === oldName) return;
    if (categoryToUpdate.subcategories.includes(trimmed)) return; // would collide with an existing one

    const updatedSubs = categoryToUpdate.subcategories.map(s => s === oldName ? trimmed : s);
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, subcategories: updatedSubs } : c));
    const { error } = await supabase.from('Categories').update({ subcategories: updatedSubs }).eq('id', catId);
    if (error) console.error('Failed to rename subcategory:', error);

    // Same reasoning as the category-name fix: transactions carry their own stored subcategory
    // name rather than an ID, so leaving them as-is would make them fall out of sync with the
    // category's own subcategory list (they'd stop matching the "All Subcategories" filter, the
    // Breakdown/Analytics subcategory breakdowns, etc.) even though the totals wouldn't be lost.
    setTransactions(prev => prev.map(t =>
      (t.categoryId === catId && t.subcategoryName === oldName) ? { ...t, subcategoryName: trimmed } : t
    ));
    const { error: txError } = await supabase
      .from('Transactions')
      .update({ 'Sub-Category': trimmed })
      .ilike('Catagory', categoryToUpdate.name)
      .ilike('Sub-Category', oldName);
    if (txError) console.error('Failed to rename subcategory on existing transactions:', txError);
  };

  // reassignToCategoryId: when provided, every transaction currently under the deleted category
  // is moved onto it first (both locally and in Supabase) instead of being left to silently fall
  // out of categorization — since (as with rename) transactions are linked by matching their
  // stored name string against the categories list, not by a real foreign key, deleting the
  // category out from under them with nothing else would otherwise orphan them.
  const handleDeleteCategory = async (catId: string, reassignToCategoryId?: string | null) => {
    if (catId === 'excluded') return;
    const categoryToDelete = categories.find(c => c.id === catId);
    if (!categoryToDelete) return;

    if (reassignToCategoryId) {
      const targetCategory = categories.find(c => c.id === reassignToCategoryId);
      if (targetCategory) {
        setTransactions(prev => prev.map(t =>
          t.categoryId === catId ? { ...t, categoryId: reassignToCategoryId, categoryName: targetCategory.name, subcategoryName: '' } : t
        ));
        const { error: txError } = await supabase
          .from('Transactions')
          .update({ 'Catagory': targetCategory.name, 'Sub-Category': '' })
          .ilike('Catagory', categoryToDelete.name);
        if (txError) console.error('Failed to reassign transactions before deleting category:', txError);
      }
    }

    setCategories(prev => prev.filter(c => c.id !== catId));
    await supabase.from('Categories').delete().eq('id', catId);
  };

  const handleUpdateCategory = async (catId: string, updates: { name?: string; color?: string }) => {
    if (catId === 'excluded') return;

    const oldCategory = categories.find(c => c.id === catId);

    // Optimistic update
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, ...updates } : c
    ));

    // Update in Supabase
    const { error } = await supabase.from('Categories').update(updates).eq('id', catId);
    if (error) {
      console.error('Failed to update category:', error);
    }

    // There's no real categoryId column on Transactions — fetchData links each row to a category
    // by matching its stored 'Catagory' name string against categories.name at load time. A rename
    // with nothing else would silently orphan every transaction under the old name into
    // "uncategorized" on the next refresh, so every transaction currently tagged with the old
    // name gets renamed the same way, both locally and in Supabase.
    if (updates.name && oldCategory && updates.name !== oldCategory.name) {
      const newName = updates.name;
      const oldName = oldCategory.name;
      setTransactions(prev => prev.map(t => t.categoryId === catId ? { ...t, categoryName: newName } : t));
      const { error: txError } = await supabase
        .from('Transactions')
        .update({ 'Catagory': newName })
        .ilike('Catagory', oldName);
      if (txError) {
        console.error('Failed to rename category on existing transactions:', txError);
      }
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
          'Note': newTx.notes || null,
          user_id: session?.user?.id
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

    // Optimistic: show the imported transactions and close the review modal immediately,
    // instead of waiting on the network round-trip. The temp (pending-*) ids get swapped for
    // real ones once the insert resolves, or rolled back entirely if it fails.
    const optimisticTxs = pendingImportTransactions;
    setTransactions(prev => [...optimisticTxs, ...prev]);
    setPendingImportTransactions([]);
    setImportReviewOpen(false);
    setSavingImport(false);

    // Map to Supabase schema
    const dbPayloads = optimisticTxs.map(t => {
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
        'Note': t.notes || null,
        user_id: session?.user?.id
      };
    });

    console.log('Saving transactions to Supabase:', dbPayloads.length);
    const { data, error } = await supabase.from('Transactions').insert(dbPayloads).select();

    if (error) {
      console.error('Supabase import error:', error.message);
      alert('Failed to save transactions: ' + error.message);
      // Roll back the optimistic rows and restore the review modal so the user can retry
      const optimisticIds = new Set(optimisticTxs.map(t => t.id));
      setTransactions(prev => prev.filter(t => !optimisticIds.has(t.id)));
      setPendingImportTransactions(optimisticTxs);
      setImportReviewOpen(true);
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

      // Swap the optimistic (temp-id) rows for the real saved ones, matched by insert order
      setTransactions(prev => prev.map(t => {
        const idx = optimisticTxs.findIndex(p => p.id === t.id);
        return idx !== -1 && savedTxs[idx] ? savedTxs[idx] : t;
      }));

      // Save merchant mappings for categorized transactions
      for (const t of savedTxs) {
        if (t.categoryId && t.categoryId !== 'excluded' && t.categoryName) {
          saveMerchantMapping(t.description, t.categoryId, t.categoryName, t.subcategoryName || '');
        }
      }

      console.log('Saved', savedTxs.length, 'transactions');
    }
  };

  const [importOpen, setImportOpen] = useState(false);
  const [hideAmounts, toggleHideAmounts] = usePrivacy();
  const [moreOpen, setMoreOpen] = useState(false);
  // A Dashboard quick link asking Transactions to open on its review list or mixed categories.
  const [txStart, setTxStart] = useState<'review' | 'mixed' | null>(null);
  // "Open in Transactions" from a payment's pop-up: Transactions opens with it selected.
  const [txSelect, setTxSelect] = useState<string | null>(null);
  // Home-screen shortcuts (manifest.json) open a tab or action via ?tab=… / ?action=import.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const action = params.get('action');
    if (tab && ['home', 'history', 'categories', 'sheets', 'breakdown', 'recurring', 'settings'].includes(tab)) setActiveTab(tab as typeof activeTab);
    if (action === 'import') setImportOpen(true);
    if (tab || action) window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Months for Breakdown to open on (from Home's "Full breakdown"), cleared once it's applied.
  const [breakdownJump, setBreakdownJump] = useState<{ start: string; end: string } | null>(null);

  // Same fields as updateTransaction, applied to many rows in one request (used by "Remember"
  // to re-file every earlier payment at a merchant).
  const updateTransactionsBulk = async (ids: string[], updates: Partial<Transaction>) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setTransactions(prev => prev.map(t => idSet.has(t.id) ? { ...t, ...updates } : t));
    const dbUpdates: Record<string, any> = {};
    if (updates.categoryName !== undefined) dbUpdates['Catagory'] = updates.categoryName;
    if (updates.subcategoryName !== undefined) dbUpdates['Sub-Category'] = updates.subcategoryName;
    if (Object.keys(dbUpdates).length === 0) return;
    const numericIds = ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    const { error } = await supabase.from('Transactions').update(dbUpdates).in('id', numericIds);
    if (error) {
      console.error('Bulk update failed:', error);
      alert('Failed to save: ' + error.message);
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
            updated_at: new Date().toISOString(),
            user_id: session?.user?.id
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

  // "Remember for <merchant>": file future imports from this merchant straight away, instead of
  // waiting for MAPPING_THRESHOLD matching categorisations.
  const rememberMerchant = async (merchantPattern: string, categoryId: string, categoryName: string, subcategoryName: string) => {
    if (!merchantPattern || !categoryId) return;
    const existing = merchantMappings.find(m => m.merchant_pattern.toLowerCase() === merchantPattern.toLowerCase());
    const count = Math.max(MAPPING_THRESHOLD, existing && existing.category_id === categoryId && existing.subcategory_name === subcategoryName ? existing.count || 0 : 0);
    const pattern = existing?.merchant_pattern || merchantPattern;
    const { error } = await supabase
      .from('merchant_mappings')
      .upsert(
        { merchant_pattern: pattern, category_id: categoryId, category_name: categoryName, subcategory_name: subcategoryName, count, updated_at: new Date().toISOString(), user_id: session?.user?.id },
        { onConflict: 'merchant_pattern' }
      );
    if (error) {
      console.error('Failed to remember merchant:', error);
      return;
    }
    setMerchantMappings(prev => {
      const rest = prev.filter(m => m.merchant_pattern.toLowerCase() !== pattern.toLowerCase());
      return [...rest, { ...(existing || {}), merchant_pattern: pattern, category_id: categoryId, category_name: categoryName, subcategory_name: subcategoryName, count }];
    });
  };

  // Backfill merchant mappings from existing categorized transactions
  const previewBackfill = () => {
    const categorized = transactions.filter(t => t.categoryId && t.categoryId !== '' && t.categoryId !== 'excluded' && t.description);

    const descMap = new Map<string, { categoryId: string; categoryName: string; subcategoryName: string; count: number }[]>();

    categorized.forEach(t => {
      const key = t.description.toLowerCase();
      if (!descMap.has(key)) descMap.set(key, []);
      const entries = descMap.get(key)!;
      const existing = entries.find(e => e.categoryId === t.categoryId && e.subcategoryName === (t.subcategoryName || ''));
      if (existing) {
        existing.count++;
      } else {
        entries.push({ categoryId: t.categoryId, categoryName: t.categoryName, subcategoryName: t.subcategoryName || '', count: 1 });
      }
    });

    const mappings: { merchant_pattern: string; category_id: string; category_name: string; subcategory_name: string; count: number }[] = [];

    descMap.forEach((entries, key) => {
      const best = entries.sort((a, b) => b.count - a.count)[0];
      const originalDesc = categorized.find(t => t.description.toLowerCase() === key)?.description || key;
      mappings.push({
        merchant_pattern: originalDesc,
        category_id: best.categoryId,
        category_name: best.categoryName,
        subcategory_name: best.subcategoryName,
        count: best.count,
      });
    });

    return mappings;
  };

  const executeBackfill = async (mappingsToSave: { merchant_pattern: string; category_id: string; category_name: string; subcategory_name: string; count: number }[]) => {
    for (const mapping of mappingsToSave) {
      const { error } = await supabase
        .from('merchant_mappings')
        .upsert(
          { ...mapping, updated_at: new Date().toISOString(), user_id: session?.user?.id },
          { onConflict: 'merchant_pattern' }
        );
      if (error) {
        console.error('Failed to save mapping:', mapping.merchant_pattern, error);
      }
    }

    // Reload mappings
    const { data: mappingData } = await supabase.from('merchant_mappings').select('*');
    if (mappingData) {
      setMerchantMappings(mappingData.map(m => ({
        id: m.id,
        merchant_pattern: m.merchant_pattern,
        category_id: m.category_id,
        category_name: m.category_name,
        subcategory_name: m.subcategory_name,
        count: m.count || 1,
      })));
    }
  };

  const deleteMerchantMapping = async (pattern: string) => {
    await supabase.from('merchant_mappings').delete().eq('merchant_pattern', pattern);
    setMerchantMappings(prev => prev.filter(m => m.merchant_pattern !== pattern));
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

  // KPI Summary (Respects Date Filter and Currency)
  // Math.abs guards against rows whose stored amountGBP/amountAED is negative (should always be
  // a positive magnitude, with type determining direction) — without it, one bad row silently
  // cancels out other transactions in the same total instead of adding to it.
  const summary = useMemo<FinancialSummary>(() => {
    return activeTransactions.reduce(
      (acc, curr) => {
        const amount = Math.abs(currency === 'GBP' ? curr.amountGBP : curr.amountAED);
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
        const amount = Math.abs(currency === 'GBP' ? curr.amountAED : curr.amountGBP);
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
        const amount = Math.abs(currency === 'GBP' ? curr.amountGBP : curr.amountAED);
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

  // Main Category Breakdown (respects date filter and currency)
  const categoryBreakdown = useMemo(() => {
    return categories.map(cat => {
      const catTransactions = activeTransactions.filter(t => t.categoryId === cat.id);
      const total = catTransactions.reduce((sum, t) => sum + (Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED)), 0);
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
        const amount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
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
            const amount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
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

  // Most recent transaction date per bank, across ALL transactions (ignores the date/other filters)
  // so it's clear where each bank's data currently ends and what still needs importing.
  const latestByBank = useMemo(() => {
      const byBank = new Map<string, { name: string; date: string; count: number }>();
      for (const t of transactions) {
          const name = t.bankName?.trim();
          if (!name || !t.date) continue;
          const key = name.toLowerCase();
          const existing = byBank.get(key);
          if (!existing) byBank.set(key, { name, date: t.date, count: 1 });
          else {
              existing.count++;
              if (t.date > existing.date) existing.date = t.date;
          }
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Array.from(byBank.values())
          .map(b => {
              const d = new Date(`${b.date}T00:00:00`);
              const daysAgo = isNaN(d.getTime()) ? null : Math.round((today.getTime() - d.getTime()) / 86400000);
              const bank = banks.find(x => x.name.trim().toLowerCase() === b.name.toLowerCase());
              const dateLabel = isNaN(d.getTime()) ? b.date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              const agoLabel = daysAgo === null ? '' : daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
              return { ...b, daysAgo, dateLabel, agoLabel, stale: daysAgo !== null && daysAgo > 30, icon: bank?.icon || b.name.slice(0, 2).toUpperCase() };
          })
          .sort((a, b) => a.date.localeCompare(b.date)); // stalest first
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

  // Data loading state — a skeleton shaped like the real dashboard instead of a blank
  // spinner-only screen, so there's no layout jump once the real content pops in.
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Shared mobile date-range presets — used by both the Home and Transactions mobile timeframe
  // selectors, which were previously two copy-pasted implementations of the same thing.
  const mobileHistoryPresets = [
    { label: 'MTD', fullLabel: 'This Month', getValue: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    }},
    { label: 'Last Wk', fullLabel: 'Last Week', getValue: () => {
      const now = new Date();
      const dow = (now.getDay() + 6) % 7; // Mon=0, Sun=6
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - ((dow + 1) % 7));
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      return { start: lastMonday, end: lastSunday };
    }},
    { label: 'Last Mo', fullLabel: 'Last Month', getValue: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
    }},
    { label: 'YTD', fullLabel: 'YTD', getValue: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    }},
  ];

  return (
    // 100dvh (not 100vh, which on iPhone is taller than what's visible) plus padding for the
    // status bar: iOS Safari draws the page behind its blurred status bar, and since the app
    // scrolls inside <main> rather than the page, the top of every tab otherwise sat under it,
    // out of reach. viewport-fit=cover (index.html) is what makes the safe-area insets non-zero.
    // MotionConfig: animations calm down for anyone with "Reduce motion" turned on.
    <MotionConfig reducedMotion="user">
    <TxActionsContext.Provider value={{
      transactions,
      banks,
      getCategoryEmoji,
      onUpdate: updateTransaction,
      onOpenInTransactions: (t) => {
        // Show that payment's month with no other filters, then open it.
        const y = Number(t.date.slice(0, 4)), m = Number(t.date.slice(5, 7));
        const end = new Date(y, m, 0).getDate();
        handleResetFilters();
        setSearchQuery('');
        setDateRange({ start: `${t.date.slice(0, 7)}-01`, end: `${t.date.slice(0, 7)}-${String(end).padStart(2, '0')}`, label: 'Custom Range' });
        setTxSelect(t.id);
        handleTabChange('history');
      },
    }}>
    <div
      className="bg-slate-50 dark:bg-neutral-900 h-[100dvh] font-['Poppins'] text-slate-900 dark:text-neutral-200 overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      
      {/* App Wrapper - Updated sidebar gap to md:gap-0 */}
      <div className="max-w-[1920px] mx-auto h-full flex flex-col md:flex-row md:gap-0">
        
        {/* Collapsible Sidebar - Simplified Styles */}
        <nav
          className={`
            fixed bottom-0 left-0 w-full bg-white dark:bg-neutral-800 border-t border-slate-100 dark:border-neutral-700 z-50 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3
            md:relative md:flex md:border-r md:border-t-0 md:flex-col md:h-full md:p-4 md:pb-4 md:pt-4 md:justify-start
            transition-all duration-300 ease-in-out
            ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}
          `}
        >
           {/* Desktop Toggle */}
           <button 
             onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
             className="hidden md:flex absolute -right-3 top-8 bg-white dark:bg-neutral-700 text-slate-400 p-1.5 rounded-full border border-slate-200 dark:border-neutral-600 hover:text-slate-900 dark:hover:text-neutral-200 transition-all z-50 shadow-sm"
           >
             {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
           </button>

           {/* Logo */}
           <div className={`hidden md:flex items-center gap-3 mb-10 px-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}>
             <div className="bg-slate-900 dark:bg-neutral-600 p-2 rounded-xl shadow-sm shrink-0">
               <LayoutDashboard className="text-white" size={18} />
             </div>
             {!isSidebarCollapsed && (
                <div className="animate-in fade-in duration-300">
                   <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-neutral-200">WealthWise</h1>
                </div>
             )}
           </div>

           <div className="flex justify-around items-center px-2 md:flex-col md:h-auto md:gap-1 md:items-stretch md:px-0 overflow-x-auto md:overflow-x-visible no-scrollbar">
             {[
               { id: 'home', icon: Home, label: 'Dashboard', mobileLabel: 'Home', mobileOnly: true },
               { id: 'breakdown', icon: Table, label: 'Breakdown', mobileLabel: 'Breakdown', mobileOnly: true },
               { id: 'sheets', icon: LayoutGrid, label: 'Category Sheets', mobileLabel: 'Sheets', mobileOnly: true },
               { id: 'history', icon: ArrowRightLeft, label: 'Transactions', mobileLabel: 'Trans', mobileOnly: true },
               { id: 'categories', icon: FolderCog, label: 'Categories', mobileLabel: 'Cats', mobileOnly: false },
               { id: 'recurring', icon: Repeat, label: 'Recurring', mobileLabel: 'Recurring', mobileOnly: false },
               { id: 'settings', icon: Settings, label: 'Settings', mobileLabel: 'Settings', mobileOnly: false }
             ].map((item) => (
               <button
                 key={item.id}
                 onClick={() => handleTabChange(item.id as any)}
                 className={`
                   flex flex-col md:flex-row md:gap-3 p-1.5 md:p-2.5 min-h-[48px] min-w-[56px] md:min-h-0 md:min-w-0 items-center justify-center rounded-lg md:rounded-xl transition-colors duration-150 active:scale-95 group relative flex-shrink-0
                   ${activeTab === item.id
                     ? 'text-slate-900 dark:text-neutral-200 font-semibold'
                     : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-700'}
                   ${!isSidebarCollapsed ? 'md:justify-start md:px-3' : ''}
                   ${!item.mobileOnly ? 'hidden md:flex' : ''}
                 `}
               >
                 {activeTab === item.id && (
                   <motion.div
                     layoutId="activeNavPill"
                     className="absolute inset-0 bg-slate-100 dark:bg-neutral-700 rounded-lg md:rounded-xl -z-10"
                     transition={{ duration: DURATION.page, ease: EASE_OUT }}
                   />
                 )}
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
             {/* Phones: everything that doesn't fit in the bar lives under More */}
             <button
               onClick={() => setMoreOpen(true)}
               aria-haspopup="dialog"
               aria-expanded={moreOpen}
               className={`md:hidden flex flex-col p-1.5 min-h-[48px] min-w-[56px] items-center justify-center rounded-lg transition-colors duration-150 active:scale-95 relative flex-shrink-0 ${moreOpen || ['categories', 'recurring', 'settings'].includes(activeTab) ? 'text-slate-900 dark:text-neutral-200 font-semibold' : 'text-slate-500 dark:text-neutral-500'}`}
             >
               {['categories', 'recurring', 'settings'].includes(activeTab) && (
                 <span className="absolute inset-0 bg-slate-100 dark:bg-neutral-700 rounded-lg -z-10" />
               )}
               <MoreHorizontal size={18} strokeWidth={moreOpen ? 2.5 : 2} />
               <span className="text-[9px] mt-0.5">More</span>
             </button>
           </div>

           {/* Desktop Add Button */}
           <div className="hidden md:block mt-8">
             <button
                onClick={() => setIsModalOpen(true)}
                className={`
                  w-full bg-slate-900 dark:bg-[#635bff] text-white py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-[#5348e0]
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                <Plus size={18} />
                {!isSidebarCollapsed && <span className="text-sm">Add New</span>}
              </button>
           </div>

           {/* Hide amounts - Desktop */}
           <div className="hidden md:block mt-auto pt-4 border-t border-slate-100 dark:border-neutral-700">
             <button
                onClick={toggleHideAmounts}
                aria-pressed={hideAmounts}
                data-amt-skip
                className={`
                  w-full py-2.5 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 group relative
                  ${hideAmounts ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-700'}
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                {hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />}
                {!isSidebarCollapsed && <span className="text-sm">{hideAmounts ? 'Show amounts' : 'Hide amounts'}</span>}
              </button>
              {hideAmounts && !isSidebarCollapsed && (
                <div className="px-2 pt-3 pb-1">
                  <BlurStrengthSlider compact />
                </div>
              )}
           </div>

           {/* Dark Mode Toggle - Desktop */}
           <div className="hidden md:block pt-2">
             <button
                onClick={() => setDarkMode(!darkMode)}
                className={`
                  w-full text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-700 py-2.5 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 group relative
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={darkMode ? 'sun' : 'moon'}
                    initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                    transition={{ duration: DURATION.press, ease: EASE_OUT }}
                    className="flex"
                  >
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </motion.span>
                </AnimatePresence>
                {!isSidebarCollapsed && <span className="text-sm">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
                {isSidebarCollapsed && (
                  <span className="absolute left-14 bg-slate-900 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-slate-700 pointer-events-none hidden md:block shadow-lg">
                    {darkMode ? 'Light Mode' : 'Dark Mode'}
                  </span>
                )}
              </button>
           </div>

           {/* Logout Button - Desktop */}
           <div className="hidden md:block pt-2">
             <button
                onClick={handleLogout}
                className={`
                  w-full text-slate-500 dark:text-neutral-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2
                  ${isSidebarCollapsed ? 'px-0' : 'px-4'}
                `}
              >
                <LogOut size={18} />
                {!isSidebarCollapsed && <span className="text-sm">Logout</span>}
              </button>
           </div>
        </nav>

        {/* Main Content Area - Updated padding */}
        <main
          ref={mainRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`flex-1 h-full bg-slate-100 dark:bg-neutral-900 p-3 pb-24 md:px-8 md:py-6 max-w-[100vw] overscroll-y-none ${activeTab === 'history' || activeTab === 'breakdown' ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          {/* Pull-to-refresh bubble (floats over the page, which stays put) */}
          <div
            ref={pullIndicatorRef}
            aria-hidden
            className="md:hidden fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[60] w-10 h-10 rounded-full bg-white dark:bg-neutral-800 shadow-lg ring-1 ring-black/5 flex items-center justify-center pointer-events-none"
            style={{ opacity: 0, transform: 'translate(-50%, -48px)' }}
          >
            <div ref={pullIconRef} className="flex items-center justify-center">
              {isRefreshing ? (
                <Loader2 size={20} className="text-indigo-600 animate-spin" />
              ) : (
                <RotateCcw size={18} style={{ transition: 'color 0.15s ease' }} />
              )}
            </div>
          </div>

          {/* Top Bar with Filter & Search (Hidden in Cat/Yearly View) */}
          {activeTab !== 'categories' && activeTab !== 'home' && activeTab !== 'sheets' && activeTab !== 'breakdown' && activeTab !== 'settings' && activeTab !== 'history' && (
            <div className="flex flex-col gap-2 mb-1 md:gap-4 md:mb-8">

                {/* Mobile Dashboard Headline */}
                <div className="md:hidden pt-1 flex justify-between items-center">
                   <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-200">
                     Transactions
                   </h1>
                   <div className="flex items-center gap-2">
                     <button
                       onClick={handleLogout}
                       className="p-2 bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-full text-slate-500 dark:text-neutral-500 hover:text-rose-600 hover:border-rose-200 shadow-sm active:scale-95 transition-all"
                       title="Logout"
                     >
                       <LogOut size={18} />
                     </button>
                   </div>
                </div>

                {/* Mobile Header */}
                <div className="flex flex-col md:hidden gap-2 w-full px-1">
                    <DashboardDateFilter range={dateRange} onRangeChange={setDateRange} />
                </div>

                <div className="hidden md:flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-neutral-200 tracking-tight">
                    </h2>
                    <p className="text-slate-500 dark:text-neutral-500 text-sm mt-1 font-medium">
                        Manage your finances with confidence.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
                    {/* Desktop Date Filter */}
                    <div className="hidden md:flex items-center gap-2">
                      <SegmentedControl
                        layoutId="historyDesktopDatePresetPill"
                        optionClassName="md:px-3 md:py-1.5 md:text-xs"
                        options={[
                          ...mobileHistoryPresets.map(p => ({ id: p.fullLabel, label: p.fullLabel })),
                          { id: 'Custom Range', label: 'Custom' },
                        ]}
                        value={showMobileCustomDates ? 'Custom Range' : dateRange.label}
                        onChange={(id) => {
                          if (id === 'Custom Range') { setShowMobileCustomDates(!showMobileCustomDates); return; }
                          const preset = mobileHistoryPresets.find(p => p.fullLabel === id);
                          if (!preset) return;
                          const { start, end } = preset.getValue();
                          setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], label: preset.fullLabel });
                          setShowMobileCustomDates(false);
                        }}
                      />
                      {showMobileCustomDates && (
                        <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 rounded-lg border border-slate-200 dark:border-neutral-600 px-2.5 py-1.5">
                          <input
                            type="date"
                            value={mobileCustomStart}
                            onChange={(e) => setMobileCustomStart(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                          />
                          <span className="text-slate-300 text-xs font-bold">–</span>
                          <input
                            type="date"
                            value={mobileCustomEnd}
                            onChange={(e) => setMobileCustomEnd(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-[#635bff]"
                          />
                          <button
                            onClick={() => {
                              if (mobileCustomStart && mobileCustomEnd) {
                                setDateRange({ start: mobileCustomStart, end: mobileCustomEnd, label: 'Custom Range' });
                                setShowMobileCustomDates(false);
                              }
                            }}
                            disabled={!mobileCustomStart || !mobileCustomEnd}
                            className="px-3 py-1 bg-slate-900 text-white rounded-md text-xs font-bold disabled:opacity-40"
                          >
                            Go
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Logout Button */}
                    <button
                      onClick={handleLogout}
                      className="hidden md:flex p-2 bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-500 dark:text-neutral-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950 transition-all shadow-sm active:scale-95 items-center justify-center h-[38px] w-[38px]"
                      title="Logout"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </div>
            </div>
          )}

          {/* mode="popLayout", not "wait": with "wait" the incoming tab doesn't mount until the
              outgoing one's exit animation reports complete, and on iOS Safari that completion
              callback can occasionally never fire — which would make tapping nav items appear to
              do nothing, since the new tab is stuck waiting behind a phantom exit. popLayout still
              mounts the new tab immediately (no dependency on the old one finishing) while pulling
              the exiting tab out of layout flow so the two don't visually stack on top of each
              other in the meantime. */}
          <AnimatePresence mode="popLayout">
          <motion.div
            key={activeTab}
            ref={restoreScrollOnMount}
            className="h-full"
            initial={{ opacity: 0, y: isPhone ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isPhone ? 0 : -8 }}
            transition={{ duration: isPhone ? 0.16 : DURATION.page, ease: EASE_OUT }}
          >
          {/* DASHBOARD VIEW */}
          {/* CATEGORY SHEETS */}
          {activeTab === 'sheets' && (
             <div>
                <CategorySheets
                  transactions={transactions}
                  currency={currency}
                  getCategoryEmoji={getCategoryEmoji}
                  onViewTransactions={(categoryId, subcategory, start, end) => {
                    setFilterCategory(categoryId);
                    setFilterSubcategory(subcategory ?? 'all');
                    setDateRange({ start, end, label: 'Custom Range' });
                    handleTabChange('history');
                  }}
                />
             </div>
          )}

          {/* DASHBOARD: spending patterns */}
          {activeTab === 'home' && (
             <div>
                {isPhone ? (
                  <MobileHome
                    transactions={transactions}
                    currency={currency}
                    getCategoryEmoji={getCategoryEmoji}
                    onOpenBreakdown={(start, end) => {
                      setBreakdownJump({ start, end });
                      handleTabChange('breakdown');
                    }}
                    onImport={() => setImportOpen(true)}
                    onViewTransactions={(categoryId, subcategory, start, end) => {
                      setFilterCategory(categoryId);
                      setFilterSubcategory(subcategory ?? 'all');
                      setDateRange({ start, end, label: 'Custom Range' });
                      handleTabChange('history');
                    }}
                  />
                ) : (
                  <SpendingPatterns
                    transactions={transactions}
                    categories={categories}
                    currency={currency}
                    getCategoryEmoji={getCategoryEmoji}
                    onViewTransactions={(categoryId, subcategory, start, end) => {
                      setFilterCategory(categoryId);
                      setFilterSubcategory(subcategory ?? 'all');
                      setDateRange({ start, end, label: 'Custom Range' });
                      handleTabChange('history');
                    }}
                    lastImport={latestByBank[0] ? `${latestByBank[0].dateLabel.replace(/ \d{4}$/, '')} · ${latestByBank[0].name}` : ''}
                    onImport={() => setImportOpen(true)}
                    onOpenTransactions={(view) => { setTxStart(view); handleTabChange('history'); }}
                  />
                )}
             </div>
          )}

          {/* BREAKDOWN VIEW */}
          {activeTab === 'breakdown' && (
             <div className="h-full">
                <BreakdownTab
                  transactions={transactions}
                  categories={categories}
                  getCategoryEmoji={getCategoryEmoji}
                  jumpTo={breakdownJump}
                  onJumpApplied={() => setBreakdownJump(null)}
                  onViewTransactions={(categoryId, subcategory, start, end) => {
                    setFilterCategory(categoryId);
                    setFilterSubcategory(subcategory ?? 'all');
                    setDateRange({ start, end, label: 'Custom Range' });
                    handleTabChange('history');
                  }}
                />
             </div>
          )}

           {/* CATEGORIES VIEW */}
           {activeTab === 'categories' && (
             <div className="h-full">
                 <CategoryManager
                    categories={categories}
                    transactions={transactions}
                    onAddCategory={handleAddCategory}
                    onUpdateCategory={handleUpdateCategory}
                    onAddSubcategory={handleAddSubcategory}
                    onDeleteSubcategory={handleDeleteSubcategory}
                    onRenameSubcategory={handleRenameSubcategory}
                    onDeleteCategory={handleDeleteCategory}
                    onUpdateTransaction={updateTransaction}
                    getCategoryEmoji={getCategoryEmoji}
                    onEmojiChange={handleEmojiChange}
                    onReapplyAllEmojis={reapplyAllCategoryEmojis}
                 />
             </div>
          )}

           {/* RECURRING PAYMENTS VIEW */}
           {activeTab === 'recurring' && (
             <div className="h-full">
                 <RecurringPayments transactions={transactions} categories={categories} />
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
                    darkMode={darkMode}
                    onToggleDarkMode={setDarkMode}
                    merchantMemory={{
                      totalCount: merchantMappings.length,
                      readyCount: merchantMappings.filter(m => (m.count || 0) >= MAPPING_THRESHOLD).length,
                      mappings: merchantMappings,
                      onPreviewBackfill: previewBackfill,
                      onExecuteBackfill: executeBackfill,
                      onDeleteMapping: deleteMerchantMapping,
                    }}
                 />
             </div>
          )}

          {/* TRANSACTIONS VIEW */}
          {activeTab === 'history' && (
            <TransactionsView
              transactions={filteredTransactions}
              periodTransactions={dateFilteredTransactions}
              allTransactions={transactions}
              categories={categories}
              getCategoryEmoji={getCategoryEmoji}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              dateRange={dateRange}
              onDateRange={setDateRange}
              availableBanks={availableBanks}
              filterBank={filterBank}
              onFilterBank={setFilterBank}
              filterType={filterType}
              onFilterType={setFilterType}
              filterCategory={filterCategory}
              onFilterCategory={setFilterCategory}
              filterSubcategory={filterSubcategory}
              onFilterSubcategory={setFilterSubcategory}
              filterRecentlyAdded={filterRecentlyAdded}
              onFilterRecentlyAdded={setFilterRecentlyAdded}
              onResetFilters={handleResetFilters}
              latestByBank={latestByBank}
              onOpenImport={() => setImportOpen(true)}
              onUpdate={updateTransaction}
              onBulkUpdate={updateTransactionsBulk}
              onDelete={deleteTransaction}
              onRemember={rememberMerchant}
              onApplyMemory={applyMerchantMemory}
              applyingMemory={applyingMemory}
              onLogout={handleLogout}
              startWith={txStart}
              onStarted={() => setTxStart(null)}
              selectOnStart={txSelect}
              onSelected={() => setTxSelect(null)}
            />
          )}
          </motion.div>
          </AnimatePresence>

        </main>
      </div>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        activeTab={activeTab}
        onNavigate={(tab) => handleTabChange(tab)}
        onAddTransaction={() => setIsModalOpen(true)}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(!darkMode)}
        onLogout={handleLogout}
      />

      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        banks={banks}
        latestByBank={latestByBank}
        merchantMappings={merchantMappings}
        existing={transactions}
        webhookUrl={webhookUrl}
        onImport={handleImportTransactions}
      />

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

                          {/* Merchant/Description, with an optional note saved alongside it */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate" title={t.description}>{t.description}</p>
                            <input
                              type="text"
                              value={t.notes || ''}
                              onChange={(e) => updatePendingTransaction(t.id, { notes: e.target.value })}
                              placeholder="＋ Add a note"
                              aria-label={`Note for ${t.description}`}
                              className="mt-1 w-full max-w-[320px] h-7 px-2 rounded-md border border-dashed border-slate-300 focus:border-indigo-400 focus:border-solid bg-transparent text-xs text-slate-700 placeholder:text-indigo-500/80 outline-none"
                            />
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
    </TxActionsContext.Provider>
    </MotionConfig>
  );
};

export default App;
