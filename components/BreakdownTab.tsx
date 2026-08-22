
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ChevronRight, ChevronDown, GripVertical, SlidersHorizontal, X } from 'lucide-react';
import { Transaction, Category } from '../types';
import SegmentedControl from './SegmentedControl';
import { MODAL_TRANSITION, SHEET_TRANSITION } from '../lib/motion';

interface BreakdownTabProps {
  transactions: Transaction[];
  categories: Category[];
  getCategoryEmoji: (categoryId: string) => string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const BreakdownTab: React.FC<BreakdownTabProps> = ({ transactions, categories, getCategoryEmoji }) => {
  // Currency and date-range selections are persisted to localStorage (same mechanism already
  // used below for category order/width) so a page refresh doesn't reset them back to defaults.
  const [currency, setCurrency] = useState<'GBP' | 'AED'>(() => {
    const saved = localStorage.getItem('breakdownCurrency');
    return saved === 'AED' ? 'AED' : 'GBP';
  });
  useEffect(() => {
    localStorage.setItem('breakdownCurrency', currency);
  }, [currency]);

  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>(() => {
    const saved = localStorage.getItem('breakdownViewMode');
    return saved === 'yearly' ? 'yearly' : 'monthly';
  });
  useEffect(() => {
    localStorage.setItem('breakdownViewMode', viewMode);
  }, [viewMode]);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const now = new Date();
  const [rangeStart, setRangeStart] = useState(() => localStorage.getItem('breakdownRangeStart') || `${now.getFullYear()}-01`);
  const [rangeEnd, setRangeEnd] = useState(() => localStorage.getItem('breakdownRangeEnd') || monthInputValue(now));
  const [rangeLabel, setRangeLabel] = useState<'MTD' | 'Last Month' | 'YTD' | 'This Year' | 'Custom'>(() => {
    const saved = localStorage.getItem('breakdownRangeLabel');
    return saved === 'MTD' || saved === 'Last Month' || saved === 'YTD' || saved === 'This Year' || saved === 'Custom' ? saved : 'YTD';
  });
  useEffect(() => {
    localStorage.setItem('breakdownRangeStart', rangeStart);
    localStorage.setItem('breakdownRangeEnd', rangeEnd);
    localStorage.setItem('breakdownRangeLabel', rangeLabel);
  }, [rangeStart, rangeEnd, rangeLabel]);

  // Custom row order — persisted, category id order within each section (income/expense). Until
  // the user actually drags a row (saving their own order to localStorage), default to leading
  // with Housing/Groceries/Food/Transport — sortByOrder puts unlisted categories after these in
  // their existing relative order, so this only pins those four to the front rather than
  // dictating the whole list.
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('breakdownCategoryOrder');
      if (saved) return JSON.parse(saved);
    } catch {
      // fall through to default below
    }
    const defaultFirst = ['Housing', 'Groceries', 'Food', 'Transport'];
    return defaultFirst
      .map(name => categories.find(c => c.name === name)?.id)
      .filter((id): id is string => !!id);
  });
  useEffect(() => {
    localStorage.setItem('breakdownCategoryOrder', JSON.stringify(categoryOrder));
  }, [categoryOrder]);

  // 'custom' = drag-to-reorder order above; 'amount' = highest total spend (over the current
  // date range) first, recomputed live as the range/currency/categories change.
  const [sortMode, setSortMode] = useState<'custom' | 'amount'>(() => {
    const saved = localStorage.getItem('breakdownSortMode');
    return saved === 'amount' ? 'amount' : 'custom';
  });
  useEffect(() => {
    localStorage.setItem('breakdownSortMode', sortMode);
  }, [sortMode]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // View/Sort/Currency live behind one "Filters" button instead of as three permanently-visible
  // pill rows — they change far less often than the date range, so keeping them tucked away is
  // more compact without losing anything (Tailwind UI's dropdown-menu pattern, applied here with
  // plain state instead of headlessui since that isn't a project dependency).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersMenuRef.current && !filtersMenuRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtersOpen]);

  // Tapping a category's cell opens a modal listing the transactions behind that number.
  // monthIndex is omitted in yearly view, meaning "every month of `year`".
  const [detailModal, setDetailModal] = useState<{
    categoryId: string;
    categoryName: string;
    subcategoryName?: string;
    year: number;
    monthIndex?: number;
    isExpense: boolean;
  } | null>(null);
  const [detailSortBy, setDetailSortBy] = useState<'date' | 'amount'>('date');

  // AnimatePresence (below, where the modal renders) plays the exit animation automatically
  // before this actually unmounts the modal — no manual setTimeout/closing-state dance needed.
  const closeDetailModal = () => setDetailModal(null);

  // Drag-to-dismiss is restricted to the header (via dragListener={false} + this controls
  // object) rather than the whole modal panel, so swiping through the transaction list below
  // scrolls it normally instead of fighting with the dismiss gesture.
  const detailModalDragControls = useDragControls();

  const [categoryColWidth, setCategoryColWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('breakdownCategoryColWidth');
      return saved ? parseInt(saved, 10) : 160;
    } catch {
      return 160;
    }
  });
  useEffect(() => {
    localStorage.setItem('breakdownCategoryColWidth', String(categoryColWidth));
  }, [categoryColWidth]);

  // Total Expenses/Net live in their own compact footer below the scrolling table now (not
  // sticky inside it), so there's no longer a need to measure Net's height to offset Total
  // Expenses above it — they're just two plain stacked rows.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const syncFooterScroll = () => {
    if (tableScrollRef.current && footerScrollRef.current) {
      footerScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };

  // While the detail modal is open, lock the table's own scroll container — otherwise a scroll
  // gesture inside the modal can "leak" through to the table underneath once the modal's own
  // list hits its scroll boundary (rubber-banding on iOS especially), visibly dragging the
  // background table around behind the modal.
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el || !detailModal) return;
    const prevOverflow = el.style.overflow;
    el.style.overflow = 'hidden';
    // Restoring overflow on a large table forces the browser to recompute its layout/scrollbars
    // — doing that synchronously in the same commit as closeDetailModal() competes with the
    // very first frame of the modal's slide-up exit animation and visibly stalls it. Deferring
    // one frame lets that first frame paint before the table's layout gets touched.
    return () => { requestAnimationFrame(() => { el.style.overflow = prevOverflow; }); };
  }, [detailModal]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = categoryColWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setCategoryColWidth(Math.min(360, Math.max(120, startWidth + delta)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const presets: { label: 'MTD' | 'Last Month' | 'YTD' | 'This Year'; getRange: () => { start: string; end: string } }[] = [
    {
      label: 'MTD',
      getRange: () => {
        const v = monthInputValue(now);
        return { start: v, end: v };
      }
    },
    {
      label: 'Last Month',
      getRange: () => {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const v = monthInputValue(d);
        return { start: v, end: v };
      }
    },
    { label: 'YTD', getRange: () => ({ start: `${now.getFullYear()}-01`, end: monthInputValue(now) }) },
    { label: 'This Year', getRange: () => ({ start: `${now.getFullYear()}-01`, end: `${now.getFullYear()}-12` }) },
  ];

  const applyPreset = (preset: typeof presets[number]) => {
    const { start, end } = preset.getRange();
    setRangeStart(start);
    setRangeEnd(end);
    setRangeLabel(preset.label);
  };

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  // Move `draggedId` to sit where `targetId` currently is (same-type only — income stays with income, expense with expense)
  const moveCategory = (draggedId: string, targetId: string, allCatIds: string[]) => {
    const draggedCat = categories.find(c => c.id === draggedId);
    const targetCat = categories.find(c => c.id === targetId);
    if (!draggedCat || !targetCat || draggedCat.type !== targetCat.type) return;

    setCategoryOrder(prev => {
      const base = [...prev];
      allCatIds.forEach(id => { if (!base.includes(id)) base.push(id); });

      const draggedIdx = base.indexOf(draggedId);
      if (draggedIdx === -1) return base;
      base.splice(draggedIdx, 1);
      const insertIdx = base.indexOf(targetId);
      base.splice(insertIdx === -1 ? base.length : insertIdx, 0, draggedId);
      return base;
    });
  };

  const handleGripPointerDown = (catId: string, allCatIds: string[]) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(catId);

    const handleMove = (moveEvent: PointerEvent) => {
      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const rowEl = el?.closest('[data-cat-row]') as HTMLElement | null;
      setDragOverId(rowEl?.dataset.catRow || null);
    };

    const handleUp = (upEvent: PointerEvent) => {
      const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const rowEl = el?.closest('[data-cat-row]') as HTMLElement | null;
      const overId = rowEl?.dataset.catRow;
      if (overId && overId !== catId) {
        moveCategory(catId, overId, allCatIds);
      }
      setDraggingId(null);
      setDragOverId(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const formatAmount = (amount: number) => {
    const symbol = currency === 'GBP' ? '£' : 'AED ';
    const formatted = Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
  };

  // Whole-pound version for the main grid — the exact cents rarely matter at a glance across a
  // whole month, and the shorter string is what actually fixes rows going uneven: a wide
  // "-£2,720.12" wraps onto two lines in a narrow column while its neighbours don't, making that
  // row visibly taller than the rest.
  const formatAmountRounded = (amount: number) => {
    const symbol = currency === 'GBP' ? '£' : 'AED ';
    const formatted = Math.round(Math.abs(amount)).toLocaleString('en-GB');
    return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
  };

  // Native <input type="month"> always renders the full month name (browser-controlled, not
  // stylable), so this formats a compact "Jan '26" label shown on top of a transparent input —
  // clicking/tapping still opens the native month picker underneath.
  const formatMonthShort = (value: string) => {
    if (!value) return '';
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return '';
    return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
  };

  const activeTransactions = useMemo(
    () => transactions.filter(t => !t.excluded && t.categoryId !== 'excluded'),
    [transactions]
  );

  // Every transaction for the modal's category+period, regardless of subcategory — the source
  // list the subcategory dropdown's options are built from, and that `modalSubFilter` narrows.
  const detailModalCategoryTransactions = useMemo(() => {
    if (!detailModal) return [];
    return activeTransactions.filter(t => {
      if (t.categoryId !== detailModal.categoryId) return false;
      const d = new Date(t.date);
      if (d.getFullYear() !== detailModal.year) return false;
      if (detailModal.monthIndex !== undefined && d.getMonth() !== detailModal.monthIndex) return false;
      return true;
    });
  }, [detailModal, activeTransactions]);

  const detailModalSubcategories = useMemo(() => {
    const names: string[] = [];
    detailModalCategoryTransactions.forEach(t => {
      const name = t.subcategoryName || 'Other';
      if (!names.includes(name)) names.push(name);
    });
    return names.sort((a, b) => a.localeCompare(b));
  }, [detailModalCategoryTransactions]);

  // Which subcategory the list is narrowed to — defaults to whichever the user tapped into
  // (a subcategory row vs. the category row), but is then freely changeable via the dropdown.
  const [modalSubFilter, setModalSubFilter] = useState<string>('all');
  const [summarise, setSummarise] = useState(false);
  useEffect(() => {
    setModalSubFilter(detailModal?.subcategoryName || 'all');
    setSummarise(false);
  }, [detailModal]);

  const detailModalTransactions = useMemo(() => {
    const list = detailModalCategoryTransactions.filter(t => {
      if (modalSubFilter === 'all') return true;
      return (t.subcategoryName || 'Other') === modalSubFilter;
    });
    if (detailSortBy === 'amount') {
      return list.sort((a, b) => {
        const amtA = Math.abs(currency === 'GBP' ? a.amountGBP : a.amountAED);
        const amtB = Math.abs(currency === 'GBP' ? b.amountGBP : b.amountAED);
        return amtB - amtA;
      });
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailModalCategoryTransactions, modalSubFilter, detailSortBy, currency]);

  const detailModalTotal = useMemo(
    () => detailModalTransactions.reduce((sum, t) => sum + Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED), 0),
    [detailModalTransactions, currency]
  );

  // "Summarise" collapses repeated payments to the same merchant (e.g. 5 Careem trips) into one
  // row with a combined total, grouped by description since that's the closest thing to a
  // merchant name on a transaction.
  interface GroupedRow { key: string; description: string; count: number; total: number; subcategoryName?: string; latestDate: string; }
  const detailModalGrouped = useMemo(() => {
    const map = new Map<string, GroupedRow>();
    detailModalTransactions.forEach(t => {
      const desc = t.description || 'Unknown';
      const amt = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
      const existing = map.get(desc);
      if (existing) {
        existing.count += 1;
        existing.total += amt;
        if (existing.subcategoryName !== (t.subcategoryName || undefined)) existing.subcategoryName = undefined;
        if (t.date > existing.latestDate) existing.latestDate = t.date;
      } else {
        map.set(desc, { key: desc, description: desc, count: 1, total: amt, subcategoryName: t.subcategoryName, latestDate: t.date });
      }
    });
    const list = Array.from(map.values());
    if (detailSortBy === 'amount') return list.sort((a, b) => b.total - a.total);
    return list.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  }, [detailModalTransactions, detailSortBy, currency]);

  // Every month in the selected range, oldest first (Jan on the left) — includes months with no data
  const monthCols = useMemo(() => {
    const [startYear, startMonth] = rangeStart.split('-').map(Number);
    const [endYear, endMonth] = rangeEnd.split('-').map(Number);
    const cols: { key: string; monthValue: string; year: number; monthIndex: number }[] = [];
    let y = startYear, m = startMonth - 1;
    while (y < endYear || (y === endYear && m <= endMonth - 1)) {
      cols.push({ key: `${y}-${m}`, monthValue: monthInputValue(new Date(y, m, 1)), year: y, monthIndex: m });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return cols;
  }, [rangeStart, rangeEnd]);

  // The grid's columns — either one per month, or (in yearly view) one per year, each aggregating
  // every month of that year in the selected range. Everything downstream (headers, cells, totals)
  // reads from `cols` and sums a column's `monthKeys`, so switching view mode never touches the
  // underlying per-month data.
  interface ColDef { key: string; label: string; year: number; monthIndex?: number; monthKeys: string[] }

  const monthColDefs: ColDef[] = useMemo(
    () => monthCols.map(m => ({
      key: m.key,
      label: `${MONTHS[m.monthIndex]} '${String(m.year).slice(2)}`,
      year: m.year,
      monthIndex: m.monthIndex,
      monthKeys: [m.key],
    })),
    [monthCols]
  );

  const yearColDefs: ColDef[] = useMemo(() => {
    const years: number[] = [];
    monthCols.forEach(m => { if (!years.includes(m.year)) years.push(m.year); });
    return years.map(year => ({
      key: `y-${year}`,
      label: String(year),
      year,
      monthKeys: monthCols.filter(m => m.year === year).map(m => m.key),
    }));
  }, [monthCols]);

  const cols = viewMode === 'yearly' ? yearColDefs : monthColDefs;

  // categoryId -> monthKey -> amount
  // Uses Math.abs because stored amountGBP/amountAED is supposed to always be a positive
  // magnitude (sign comes from the category's income/expense type at render time), but a
  // handful of rows have crept in with a negative value already baked in (e.g. a bad
  // import/edit) — without the abs(), one of those silently cancels out other transactions
  // in the same category+month cell instead of adding to the total.
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    activeTransactions.forEach(t => {
      const d = new Date(t.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const amount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
      if (!map.has(t.categoryId)) map.set(t.categoryId, new Map());
      const catMap = map.get(t.categoryId)!;
      catMap.set(monthKey, (catMap.get(monthKey) || 0) + amount);
    });
    return map;
  }, [activeTransactions, currency]);

  // "categoryId::subcategoryName" -> monthKey -> amount
  const subGrid = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    activeTransactions.forEach(t => {
      const subKey = `${t.categoryId}::${t.subcategoryName || 'Other'}`;
      const d = new Date(t.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const amount = Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED);
      if (!map.has(subKey)) map.set(subKey, new Map());
      const catMap = map.get(subKey)!;
      catMap.set(monthKey, (catMap.get(monthKey) || 0) + amount);
    });
    return map;
  }, [activeTransactions, currency]);

  // Which subcategories actually have data, per category
  const subcategoriesByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    activeTransactions.forEach(t => {
      const subName = t.subcategoryName || 'Other';
      if (!map.has(t.categoryId)) map.set(t.categoryId, []);
      const list = map.get(t.categoryId)!;
      if (!list.includes(subName)) list.push(subName);
    });
    return map;
  }, [activeTransactions]);

  const getCell = (catId: string, monthKey: string) => grid.get(catId)?.get(monthKey) || 0;
  const getSubCell = (catId: string, subName: string, monthKey: string) => subGrid.get(`${catId}::${subName}`)?.get(monthKey) || 0;
  const catHasData = (catId: string) => monthCols.some(m => getCell(catId, m.key) !== 0);
  const getColCell = (catId: string, col: ColDef) => col.monthKeys.reduce((sum, mk) => sum + getCell(catId, mk), 0);
  const getSubColCell = (catId: string, subName: string, col: ColDef) => col.monthKeys.reduce((sum, mk) => sum + getSubCell(catId, subName, mk), 0);
  const colTotal = (cats: Category[], col: ColDef) => cats.reduce((sum, c) => sum + getColCell(c.id, col), 0);

  const sortByOrder = (cats: Category[]) => {
    return [...cats].sort((a, b) => {
      const ia = categoryOrder.indexOf(a.id);
      const ib = categoryOrder.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  };

  // Total across every month in the current range (not just the visible cols, so this stays
  // stable whether you're looking at the Monthly or Yearly view).
  const categoryTotal = (catId: string) => monthCols.reduce((sum, m) => sum + getCell(catId, m.key), 0);

  const sortCategories = (cats: Category[]) => {
    if (sortMode === 'amount') {
      return [...cats].sort((a, b) => categoryTotal(b.id) - categoryTotal(a.id));
    }
    return sortByOrder(cats);
  };

  const incomeCategories = useMemo(
    () => sortCategories(categories.filter(c => c.type === 'INCOME' && catHasData(c.id))),
    [categories, grid, monthCols, categoryOrder, sortMode]
  );
  const expenseCategories = useMemo(
    () => sortCategories(categories.filter(c => c.type === 'EXPENSE' && catHasData(c.id))),
    [categories, grid, monthCols, categoryOrder, sortMode]
  );
  const allVisibleCatIds = useMemo(
    () => [...incomeCategories, ...expenseCategories].map(c => c.id),
    [incomeCategories, expenseCategories]
  );

  // Renders a category row plus its expanded subcategory rows, tracking a running zebra index
  const CategorySection: React.FC<{ cat: Category; isExpense: boolean; zebraRef: { i: number } }> = ({ cat, isExpense, zebraRef }) => {
    const isExpanded = expandedCats.has(cat.id);
    const subNames = subcategoriesByCategory.get(cat.id) || [];
    const sign = isExpense ? -1 : 1;
    const amountClass = isExpense ? 'text-slate-800 dark:text-neutral-300' : 'text-emerald-700 dark:text-emerald-400';

    const rowBg = (i: number) => (i % 2 === 1 ? 'bg-slate-50 dark:bg-neutral-700' : 'bg-white dark:bg-neutral-800');

    const rowIndex = zebraRef.i++;
    const isDragging = draggingId === cat.id;
    const isDragOver = dragOverId === cat.id && draggingId !== cat.id;

    // Marks whichever cell the open detail modal was opened from, so it's still visible which
    // one you're looking at — a light dashed outline rather than a solid border/background so it
    // doesn't compete with the sticky/zebra-striping already going on in this table.
    const isActiveCell = (subName: string | undefined, col: ColDef) =>
      detailModal !== null &&
      detailModal.categoryId === cat.id &&
      detailModal.subcategoryName === subName &&
      detailModal.year === col.year &&
      detailModal.monthIndex === col.monthIndex;

    return (
      <>
        <tr
          data-cat-row={cat.id}
          className={`border-b border-slate-100 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-700/60 ${rowBg(rowIndex)} ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-[#635bff]' : ''}`}
        >
          <td className={`sticky left-0 z-10 px-1.5 md:px-2 py-2.5 md:py-[12.5px] border-r border-slate-200 dark:border-neutral-700 ${rowBg(rowIndex)}`}>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => toggleCat(cat.id)}>
                <ChevronRight size={12} className={`text-slate-400 dark:text-neutral-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''} ${subNames.length === 0 ? 'opacity-0' : ''}`} />
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] shrink-0"
                  style={{ backgroundColor: `${cat.color || '#94a3b8'}1A` }}
                >
                  {getCategoryEmoji(cat.id)}
                </span>
                <span className="font-medium text-slate-700 dark:text-neutral-300 whitespace-nowrap">{cat.name}</span>
              </div>
              <button
                onPointerDown={sortMode === 'custom' ? handleGripPointerDown(cat.id, allVisibleCatIds) : undefined}
                disabled={sortMode !== 'custom'}
                className={`text-slate-300 dark:text-neutral-600 shrink-0 p-0.5 ${sortMode === 'custom' ? 'hover:text-slate-500 dark:hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none' : 'opacity-0 pointer-events-none'}`}
                title="Drag to reorder"
              >
                <GripVertical size={13} />
              </button>
            </div>
          </td>
          {cols.map(col => {
            const amt = getColCell(cat.id, col);
            return (
              <td
                key={col.key}
                onClick={() => amt !== 0 && setDetailModal({ categoryId: cat.id, categoryName: cat.name, year: col.year, monthIndex: col.monthIndex, isExpense })}
                className={`px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-center tabular-nums font-numeric whitespace-nowrap border-l border-slate-100 dark:border-neutral-700/60 ${amountClass} ${amt !== 0 ? 'cursor-pointer hover:underline' : ''} ${isActiveCell(undefined, col) ? 'outline outline-2 outline-dashed outline-slate-400 dark:outline-neutral-300 outline-offset-[-2px]' : ''}`}
              >
                {amt !== 0 ? formatAmountRounded(sign * amt) : <span className="text-slate-300 dark:text-neutral-600">–</span>}
              </td>
            );
          })}
        </tr>
        <AnimatePresence initial={false}>
          {isExpanded && subNames.map(subName => {
            const subRowIndex = zebraRef.i++;
            return (
              <motion.tr
                key={`${cat.id}-${subName}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MODAL_TRANSITION}
                className={`border-b border-slate-100 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-700/60 ${rowBg(subRowIndex)}`}
              >
                <td className={`sticky left-0 z-10 pl-6 md:pl-11 pr-2 md:pr-4 py-[7.5px] md:py-2.5 border-r border-slate-200 dark:border-neutral-700 ${rowBg(subRowIndex)}`}>
                  <span className="text-slate-500 dark:text-neutral-500 whitespace-nowrap">{subName}</span>
                </td>
                {cols.map(col => {
                  const amt = getSubColCell(cat.id, subName, col);
                  return (
                    <td
                      key={col.key}
                      onClick={() => amt !== 0 && setDetailModal({ categoryId: cat.id, categoryName: cat.name, subcategoryName: subName, year: col.year, monthIndex: col.monthIndex, isExpense })}
                      className={`px-1.5 md:px-3 py-[7.5px] md:py-2.5 text-center tabular-nums font-numeric whitespace-nowrap border-l border-slate-100 dark:border-neutral-700/60 text-slate-500 dark:text-neutral-500 ${amt !== 0 ? 'cursor-pointer hover:underline' : ''} ${isActiveCell(subName, col) ? 'outline outline-2 outline-dashed outline-slate-400 dark:outline-neutral-300 outline-offset-[-2px]' : ''}`}
                    >
                      {amt !== 0 ? formatAmountRounded(sign * amt) : <span className="text-slate-300 dark:text-neutral-600">–</span>}
                    </td>
                  );
                })}
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </>
    );
  };

  const incomeZebra = { i: 0 };
  const expenseZebra = { i: 0 };

  return (
    <div className="h-full flex flex-col pb-8 md:pb-4 space-y-2.5 md:space-y-4">
      {/* Header */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-3.5">
        <div className="relative flex items-center gap-2 md:block">
          <div className="shrink-0">
            <h1 className="text-sm md:text-2xl font-bold text-slate-900 dark:text-neutral-200">Breakdown</h1>
            <p className="hidden md:block text-xs text-slate-400 dark:text-neutral-500 mt-1">Every category, month by month · drag the grip to reorder</p>
          </div>
          {/* Mobile-only: date selector — absolutely centered on the row itself (not just the
              space left over after the title), since the title's width shouldn't shift where
              this appears. */}
          <div className="md:hidden absolute left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1 shrink-0">
              <div className="relative">
                <span className="pointer-events-none text-[10px] font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{formatMonthShort(rangeStart)}</span>
                <input
                  type="month"
                  value={rangeStart}
                  onChange={(e) => { setRangeStart(e.target.value); setRangeLabel('Custom'); }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </div>
              <span className="text-slate-300 dark:text-neutral-600 text-xs">–</span>
              <div className="relative">
                <span className="pointer-events-none text-[10px] font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{formatMonthShort(rangeEnd)}</span>
                <input
                  type="month"
                  value={rangeEnd}
                  onChange={(e) => { setRangeEnd(e.target.value); setRangeLabel('Custom'); }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
          <SegmentedControl
            layoutId="breakdownPresetPill"
            options={presets.map(p => ({ id: p.label, label: p.label }))}
            value={rangeLabel === 'Custom' ? '' : rangeLabel}
            onChange={(id) => {
              const preset = presets.find(p => p.label === id);
              if (preset) applyPreset(preset);
            }}
          />
          {/* Desktop-only: date selector, inline with the presets */}
          <div className="hidden md:flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1">
            <div className="relative">
              <span className="pointer-events-none text-[11px] font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{formatMonthShort(rangeStart)}</span>
              <input
                type="month"
                value={rangeStart}
                onChange={(e) => { setRangeStart(e.target.value); setRangeLabel('Custom'); }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
            </div>
            <span className="text-slate-300 dark:text-neutral-600 text-xs">–</span>
            <div className="relative">
              <span className="pointer-events-none text-[11px] font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{formatMonthShort(rangeEnd)}</span>
              <input
                type="month"
                value={rangeEnd}
                onChange={(e) => { setRangeEnd(e.target.value); setRangeLabel('Custom'); }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
            </div>
          </div>

          {/* View / Sort / Currency — tucked behind one Filters button instead of three
              always-visible pill rows, since these change far less often than the date range. */}
          <div className="relative shrink-0" ref={filtersMenuRef}>
            <button
              type="button"
              onClick={() => setFiltersOpen(o => !o)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${filtersOpen || viewMode === 'yearly' || sortMode === 'amount' ? 'bg-[#635bff] text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-600'}`}
            >
              <SlidersHorizontal size={12} />
              Filters
              <ChevronDown size={12} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>
            {filtersOpen && (
              <div className="absolute right-0 z-[60] mt-1 w-52 divide-y divide-slate-100 dark:divide-neutral-700 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-xl shadow-lg p-3 space-y-3">
                <div>
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">View</p>
                  <SegmentedControl
                    layoutId="breakdownViewModePill"
                    className="w-full"
                    optionClassName="flex-1"
                    options={[{ id: 'monthly', label: 'Monthly' }, { id: 'yearly', label: 'Yearly' }]}
                    value={viewMode}
                    onChange={(id) => setViewMode(id as 'monthly' | 'yearly')}
                  />
                </div>
                <div className="pt-3">
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">Sort</p>
                  <SegmentedControl
                    layoutId="breakdownSortModePill"
                    className="w-full"
                    optionClassName="flex-1"
                    options={[{ id: 'custom', label: 'Custom' }, { id: 'amount', label: 'Most Spent' }]}
                    value={sortMode}
                    onChange={(id) => setSortMode(id as 'custom' | 'amount')}
                  />
                </div>
                <div className="pt-3">
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">Currency</p>
                  <SegmentedControl
                    layoutId="breakdownCurrencyPill"
                    className="w-full"
                    optionClassName="flex-1"
                    options={[{ id: 'GBP', label: '£' }, { id: 'AED', label: 'AED' }]}
                    value={currency}
                    onChange={(id) => setCurrency(id as 'GBP' | 'AED')}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {monthCols.length === 0 ? (
        <div className="-mx-3 md:mx-0 bg-white dark:bg-neutral-800 rounded-none md:rounded-2xl border-y md:border border-slate-200 dark:border-neutral-700 p-10 text-center text-slate-400 dark:text-neutral-500 text-sm">
          No transactions in this range
        </div>
      ) : (
        <div
          key={`${rangeStart}_${rangeEnd}_${currency}_${viewMode}`}
          className="flex-1 min-h-0 flex flex-col -mx-3 md:mx-0 bg-white dark:bg-neutral-800 rounded-none md:rounded-2xl border-y md:border border-slate-200 dark:border-neutral-700 overflow-hidden"
          style={{ animation: 'breakdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <style>{`@keyframes breakdownFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div data-no-pull-refresh ref={tableScrollRef} onScroll={syncFooterScroll} className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table
              className="border-collapse text-[10px] md:text-[13px] w-full transition-[width] duration-300"
              style={{ tableLayout: 'fixed', minWidth: `${categoryColWidth + cols.length * 76}px`, transition: 'min-width 0.05s linear' }}
            >
              <colgroup>
                <col style={{ width: `${categoryColWidth}px` }} />
                {cols.map(col => <col key={col.key} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="relative sticky top-0 left-0 z-40 bg-slate-50 dark:bg-neutral-700 text-left px-2 md:px-4 py-2.5 md:py-[12.5px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap border-b border-r border-slate-200 dark:border-neutral-700">
                    Category
                    <div
                      onPointerDown={handleResizePointerDown}
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none flex items-center justify-center group"
                      title="Drag to resize"
                    >
                      <div className="w-0.5 h-4 rounded-full bg-slate-300 dark:bg-neutral-600 group-hover:bg-[#635bff] group-hover:h-full transition-all" />
                    </div>
                  </th>
                  {cols.map(col => (
                    <th
                      key={col.key}
                      className="sticky top-0 z-30 px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-left font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap border-b border-l bg-slate-50 dark:bg-neutral-700 border-slate-200 dark:border-neutral-700"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Income rows */}
                {incomeCategories.map(cat => (
                  <CategorySection key={cat.id} cat={cat} isExpense={false} zebraRef={incomeZebra} />
                ))}

                {/* Total Income */}
                <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-slate-200 dark:border-neutral-700">
                  <td className="sticky left-0 z-10 bg-emerald-50 dark:bg-emerald-950 px-2 md:px-4 py-2.5 md:py-[12.5px] font-bold text-slate-900 dark:text-neutral-200 border-r border-slate-200 dark:border-neutral-700 whitespace-nowrap">
                    Total Income
                  </td>
                  {cols.map(col => (
                    <td key={col.key} className="px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-center tabular-nums font-numeric font-bold whitespace-nowrap border-l border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                      {formatAmountRounded(colTotal(incomeCategories, col))}
                    </td>
                  ))}
                </tr>

                {/* spacer */}
                <tr><td colSpan={cols.length + 1} className="h-3 bg-white dark:bg-neutral-800" /></tr>

                {/* Expense rows */}
                {expenseCategories.map(cat => (
                  <CategorySection key={cat.id} cat={cat} isExpense={true} zebraRef={expenseZebra} />
                ))}

              </tbody>
            </table>
          </div>

          {/* Total Expenses / Net — a compact footer pinned below the scrolling table (not
              inside it), so it always sits just above the space that clears the bottom nav
              instead of eating into the rows you can see. Its own horizontal scroll is kept in
              sync with the main table's via syncFooterScroll so the columns stay lined up; it's
              a real <table> with matching colgroup widths (not divs) so those widths compute
              identically to the main table's auto-distributed columns. */}
          <div ref={footerScrollRef} className="shrink-0 mt-2 overflow-x-auto hide-scrollbar border-t border-slate-200 dark:border-neutral-700">
            <table
              className="border-collapse text-[10px] md:text-[13px] w-full"
              style={{ tableLayout: 'fixed', minWidth: `${categoryColWidth + cols.length * 76}px` }}
            >
              <colgroup>
                <col style={{ width: `${categoryColWidth}px` }} />
                {cols.map(col => <col key={col.key} />)}
              </colgroup>
              <tbody>
                <tr className="bg-slate-50 dark:bg-neutral-700 border-b border-slate-200 dark:border-neutral-700">
                  <td className="sticky left-0 z-10 bg-slate-50 dark:bg-neutral-700 px-2 md:px-4 py-[6.6px] font-bold text-[10px] md:text-xs text-slate-900 dark:text-neutral-200 border-r border-slate-200 dark:border-neutral-700 whitespace-nowrap">
                    Total Expenses
                  </td>
                  {cols.map(col => (
                    <td
                      key={col.key}
                      className="px-1.5 md:px-3 py-[6.6px] text-center tabular-nums font-numeric font-bold whitespace-nowrap text-[10px] md:text-xs border-l border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-neutral-300"
                    >
                      {formatAmountRounded(-colTotal(expenseCategories, col))}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#635bff]">
                  <td className="sticky left-0 z-10 bg-[#635bff] px-2 md:px-4 py-[6.6px] font-bold text-[10px] md:text-xs text-white border-r border-[#5348e0] whitespace-nowrap">
                    Net
                  </td>
                  {cols.map(col => {
                    const net = colTotal(incomeCategories, col) - colTotal(expenseCategories, col);
                    return (
                      <td key={col.key} className="px-1.5 md:px-3 py-[6.6px] text-center tabular-nums font-numeric font-bold whitespace-nowrap text-[10px] md:text-xs border-l border-white/10 text-white">
                        {formatAmountRounded(net)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction detail modal — opened by tapping a category's month cell. Slides down from
          the top of the screen, covering ~75% of it. Close via the backdrop, the X button, or by
          dragging/flicking the header upward. Uses dvh (not vh) for sizing — on iOS Safari, vh is
          based on the largest possible viewport and doesn't update as the address bar collapses
          mid-animation, which was the likely source of a visible glitch right at the top edge. */}
      <AnimatePresence>
      {detailModal && (
        // exit={{ pointerEvents: 'none' }} makes this whole overlay (including the draggable
        // panel below) stop intercepting touches the instant it starts closing, not just once
        // AnimatePresence finishes unmounting it — on iOS Safari the exit-complete callback that
        // normally does that unmount can occasionally never fire, which otherwise leaves an
        // invisible full-screen layer eating every subsequent tap until the page is reloaded.
        <motion.div
          className="fixed inset-0 z-[100] md:flex md:items-center md:justify-center md:p-4"
          initial={{ pointerEvents: 'auto' }}
          animate={{ pointerEvents: 'auto' }}
          exit={{ pointerEvents: 'none' }}
        >
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={closeDetailModal}
          />
          <motion.div
            className="relative bg-white dark:bg-neutral-800 rounded-b-2xl md:rounded-2xl shadow-2xl w-full h-[75dvh] md:w-[620px] md:h-[520px] md:max-h-[80dvh] flex flex-col border-b border-x md:border border-slate-100 dark:border-neutral-700"
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={SHEET_TRANSITION}
            drag="y"
            dragListener={false}
            dragControls={detailModalDragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.5, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -80 || info.velocity.y < -600) {
                closeDetailModal();
              }
            }}
          >
            <div className="order-1 px-5 py-4 border-b border-slate-100 dark:border-neutral-700 shrink-0 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div
                  onPointerDown={(e) => detailModalDragControls.start(e)}
                  className="min-w-0 touch-none cursor-grab active:cursor-grabbing"
                >
                  <h3 className="text-sm md:text-lg font-bold text-slate-900 dark:text-neutral-200 truncate">
                    {detailModal.categoryName}{modalSubFilter !== 'all' ? ` · ${modalSubFilter}` : ''}
                  </h3>
                  <p className="text-xs md:text-sm text-slate-400 dark:text-neutral-500 mt-0.5">{detailModal.monthIndex !== undefined ? `${MONTHS[detailModal.monthIndex]} ${detailModal.year}` : detailModal.year}</p>
                </div>
                <SegmentedControl
                  layoutId="breakdownDetailSortPill"
                  options={[{ id: 'date', label: 'Date' }, { id: 'amount', label: 'Amount' }]}
                  value={detailSortBy}
                  onChange={(id) => setDetailSortBy(id as 'date' | 'amount')}
                  activeTextClassName="text-[#635bff] dark:text-[#8b85ff]"
                  inactiveTextClassName="text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300"
                  optionClassName="md:px-2.5 text-[9px] md:text-[11px]"
                />
              </div>
              {(detailModalSubcategories.length > 1 || detailModalTransactions.length > 1) && (
                <div className="flex items-center gap-2">
                  {detailModalSubcategories.length > 1 && (
                    <select
                      value={modalSubFilter}
                      onChange={(e) => setModalSubFilter(e.target.value)}
                      className="flex-1 min-w-0 text-[11px] md:text-xs font-semibold bg-slate-100 dark:bg-neutral-700 text-slate-700 dark:text-neutral-300 rounded-lg px-2.5 py-1.5 outline-none border-none cursor-pointer"
                    >
                      <option value="all">All subcategories</option>
                      {detailModalSubcategories.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                  {detailModalTransactions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSummarise(s => !s)}
                      className={`shrink-0 text-[11px] md:text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors active:scale-95 ${summarise ? 'bg-[#635bff] text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-700 dark:text-neutral-300'}`}
                    >
                      Summarise
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="order-3 md:order-2 flex-1 overflow-y-auto custom-scrollbar">
              {detailModalTransactions.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-neutral-500 text-xs md:text-sm">No transactions</div>
              ) : summarise ? (
                detailModalGrouped.map(g => (
                  <div key={g.key} className="flex items-center gap-2.5 md:gap-3 px-5 py-3.5 md:py-2.5 border-b border-slate-100 dark:border-neutral-700 last:border-b-0 text-[10px] md:text-sm">
                    <span className="flex-1 min-w-0 truncate font-medium text-slate-700 dark:text-neutral-300">{g.description}</span>
                    {g.subcategoryName && (
                      <span className="shrink-0 max-w-[70px] md:max-w-[100px] truncate px-1.5 py-px bg-slate-100 dark:bg-neutral-700 rounded-full text-[7px] md:text-[10px] font-medium text-slate-500 dark:text-neutral-500 leading-tight">
                        {g.subcategoryName}
                      </span>
                    )}
                    <span className="shrink-0 px-1.5 py-px bg-slate-100 dark:bg-neutral-700 rounded-full text-[7px] md:text-[10px] font-medium text-slate-500 dark:text-neutral-500 leading-tight">
                      ×{g.count}
                    </span>
                    <span className={`shrink-0 font-bold tabular-nums font-numeric whitespace-nowrap ${detailModal.isExpense ? 'text-slate-800 dark:text-neutral-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatAmount((detailModal.isExpense ? -1 : 1) * g.total)}
                    </span>
                  </div>
                ))
              ) : (
                detailModalTransactions.map(t => (
                  <div key={t.id} className="flex items-center gap-2.5 md:gap-3 px-5 py-3.5 md:py-2.5 border-b border-slate-100 dark:border-neutral-700 last:border-b-0 text-[10px] md:text-sm">
                    <span className="shrink-0 whitespace-nowrap text-[7px] md:text-sm text-slate-400 dark:text-neutral-500">{t.date}</span>
                    <span className="flex-1 min-w-0 truncate font-medium text-slate-700 dark:text-neutral-300">{t.description || 'Unknown'}</span>
                    {/* Mobile: subcategory only — the category is already shown at the top of the modal */}
                    <span className="md:hidden shrink-0 w-[70px] mr-2.5 text-left truncate">
                      {t.subcategoryName && (
                        <span className="px-1.5 py-px bg-slate-100 dark:bg-neutral-700 rounded-full text-[7px] font-medium text-slate-500 dark:text-neutral-500 leading-tight">
                          {t.subcategoryName}
                        </span>
                      )}
                    </span>
                    <span className="hidden md:block shrink-0 max-w-[120px] truncate text-slate-400 dark:text-neutral-500">
                      {detailModal.categoryName}{t.subcategoryName ? `/${t.subcategoryName}` : ''}
                    </span>
                    <span className={`shrink-0 font-bold tabular-nums font-numeric whitespace-nowrap ${detailModal.isExpense ? 'text-slate-800 dark:text-neutral-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatAmount((detailModal.isExpense ? -1 : 1) * Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED))}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="order-2 md:order-3 px-5 py-3 border-b md:border-t md:border-b-0 border-slate-100 dark:border-neutral-700 flex items-center justify-between bg-slate-50 dark:bg-neutral-900/40 shrink-0">
              <span className="text-xs md:text-sm font-semibold text-slate-500 dark:text-neutral-400">Total</span>
              <span className="text-sm md:text-base font-bold text-slate-900 dark:text-neutral-200">
                {formatAmount((detailModal.isExpense ? -1 : 1) * detailModalTotal)}
              </span>
            </div>
            {/* Close button at the bottom */}
            <div className="order-4 px-5 py-3 border-t border-slate-100 dark:border-neutral-700 flex justify-center shrink-0">
              <button
                onClick={closeDetailModal}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-neutral-700 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:bg-slate-200 dark:hover:bg-neutral-600 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default BreakdownTab;
