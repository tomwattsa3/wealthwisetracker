
import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ChevronRight, GripVertical, X } from 'lucide-react';
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

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const now = new Date();
  const [rangeStart, setRangeStart] = useState(() => localStorage.getItem('breakdownRangeStart') || `${now.getFullYear()}-01`);
  const [rangeEnd, setRangeEnd] = useState(() => localStorage.getItem('breakdownRangeEnd') || monthInputValue(now));
  const [rangeLabel, setRangeLabel] = useState<'Last Month' | 'YTD' | 'This Year' | 'Custom'>(() => {
    const saved = localStorage.getItem('breakdownRangeLabel');
    return saved === 'Last Month' || saved === 'YTD' || saved === 'This Year' || saved === 'Custom' ? saved : 'YTD';
  });
  useEffect(() => {
    localStorage.setItem('breakdownRangeStart', rangeStart);
    localStorage.setItem('breakdownRangeEnd', rangeEnd);
    localStorage.setItem('breakdownRangeLabel', rangeLabel);
  }, [rangeStart, rangeEnd, rangeLabel]);

  // Custom row order — persisted, category id order within each section (income/expense)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('breakdownCategoryOrder');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('breakdownCategoryOrder', JSON.stringify(categoryOrder));
  }, [categoryOrder]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Tapping a category's month cell opens a modal listing the transactions behind that number
  const [detailModal, setDetailModal] = useState<{
    categoryId: string;
    categoryName: string;
    subcategoryName?: string;
    year: number;
    monthIndex: number;
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

  // Measured (not guessed) height of the Net row, so the Total Expenses row above it can be
  // positioned with an exact `bottom` offset — no gap for scrolled rows to show through, and no
  // reliance on `position: sticky` working on <tfoot> (unreliable on Safari/iOS).
  const netRowRef = useRef<HTMLTableRowElement>(null);
  const [netRowHeight, setNetRowHeight] = useState(0);
  useLayoutEffect(() => {
    const el = netRowRef.current;
    if (!el) return;
    const update = () => setNetRowHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const presets: { label: 'Last Month' | 'YTD' | 'This Year'; getRange: () => { start: string; end: string } }[] = [
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

  const detailModalTransactions = useMemo(() => {
    if (!detailModal) return [];
    const list = activeTransactions.filter(t => {
      if (t.categoryId !== detailModal.categoryId) return false;
      if (detailModal.subcategoryName && (t.subcategoryName || 'Other') !== detailModal.subcategoryName) return false;
      const d = new Date(t.date);
      return d.getFullYear() === detailModal.year && d.getMonth() === detailModal.monthIndex;
    });
    if (detailSortBy === 'amount') {
      return list.sort((a, b) => {
        const amtA = Math.abs(currency === 'GBP' ? a.amountGBP : a.amountAED);
        const amtB = Math.abs(currency === 'GBP' ? b.amountGBP : b.amountAED);
        return amtB - amtA;
      });
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailModal, activeTransactions, detailSortBy, currency]);

  const detailModalTotal = useMemo(
    () => detailModalTransactions.reduce((sum, t) => sum + Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED), 0),
    [detailModalTransactions, currency]
  );

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
  const monthTotal = (cats: Category[], monthKey: string) => cats.reduce((sum, c) => sum + getCell(c.id, monthKey), 0);

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

  const incomeCategories = useMemo(
    () => sortByOrder(categories.filter(c => c.type === 'INCOME' && catHasData(c.id))),
    [categories, grid, monthCols, categoryOrder]
  );
  const expenseCategories = useMemo(
    () => sortByOrder(categories.filter(c => c.type === 'EXPENSE' && catHasData(c.id))),
    [categories, grid, monthCols, categoryOrder]
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

    return (
      <>
        <tr
          data-cat-row={cat.id}
          className={`border-b border-slate-100 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-700/60 ${rowBg(rowIndex)} ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-[#635bff]' : ''}`}
        >
          <td className={`sticky left-0 z-10 px-1.5 md:px-2 py-2.5 md:py-[12.5px] border-r border-slate-200 dark:border-neutral-700 ${rowBg(rowIndex)}`}>
            <div className="flex items-center gap-1">
              <button
                onPointerDown={handleGripPointerDown(cat.id, allVisibleCatIds)}
                className="text-slate-300 dark:text-neutral-600 hover:text-slate-500 dark:hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5"
                title="Drag to reorder"
              >
                <GripVertical size={13} />
              </button>
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
            </div>
          </td>
          {monthCols.map(m => {
            const amt = getCell(cat.id, m.key);
            return (
              <td
                key={m.key}
                onClick={() => amt !== 0 && setDetailModal({ categoryId: cat.id, categoryName: cat.name, year: m.year, monthIndex: m.monthIndex, isExpense })}
                className={`px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-center tabular-nums border-l border-slate-100 dark:border-neutral-700/60 ${amountClass} ${amt !== 0 ? 'cursor-pointer hover:underline' : ''}`}
              >
                {amt !== 0 ? formatAmount(sign * amt) : <span className="text-slate-300 dark:text-neutral-600">–</span>}
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
                {monthCols.map(m => {
                  const amt = getSubCell(cat.id, subName, m.key);
                  return (
                    <td
                      key={m.key}
                      onClick={() => amt !== 0 && setDetailModal({ categoryId: cat.id, categoryName: cat.name, subcategoryName: subName, year: m.year, monthIndex: m.monthIndex, isExpense })}
                      className={`px-1.5 md:px-3 py-[7.5px] md:py-2.5 text-center tabular-nums border-l border-slate-100 dark:border-neutral-700/60 text-slate-500 dark:text-neutral-500 ${amt !== 0 ? 'cursor-pointer hover:underline' : ''}`}
                    >
                      {amt !== 0 ? formatAmount(sign * amt) : <span className="text-slate-300 dark:text-neutral-600">–</span>}
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
    <div className="pb-8 md:pb-4 space-y-2 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-3">
        <div className="flex items-center justify-between gap-2 md:block">
          <div>
            <h1 className="text-sm md:text-2xl font-bold text-slate-900 dark:text-neutral-200">Breakdown</h1>
            <p className="hidden md:block text-xs text-slate-400 dark:text-neutral-500 mt-1">Every category, month by month · drag the grip to reorder</p>
          </div>
          {/* Mobile-only: date selector next to the headline */}
          <div className="md:hidden flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1 shrink-0">
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
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            layoutId="breakdownPresetPill"
            options={presets.map(p => ({ id: p.label, label: p.label }))}
            value={rangeLabel === 'Custom' ? '' : rangeLabel}
            onChange={(id) => {
              const preset = presets.find(p => p.label === id);
              if (preset) applyPreset(preset);
            }}
          />
          {/* Desktop-only: date selector in its original spot */}
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
          <div className="hidden md:flex">
            <SegmentedControl
              layoutId="breakdownCurrencyPill"
              options={[{ id: 'GBP', label: '£' }, { id: 'AED', label: 'AED' }]}
              value={currency}
              onChange={(id) => setCurrency(id as 'GBP' | 'AED')}
            />
          </div>
        </div>
      </div>

      {monthCols.length === 0 ? (
        <div className="-mx-3 md:mx-0 bg-white dark:bg-neutral-800 rounded-none md:rounded-2xl border-y md:border border-slate-200 dark:border-neutral-700 p-10 text-center text-slate-400 dark:text-neutral-500 text-sm">
          No transactions in this range
        </div>
      ) : (
        <div
          key={`${rangeStart}_${rangeEnd}_${currency}`}
          className="-mx-3 md:mx-0 bg-white dark:bg-neutral-800 rounded-none md:rounded-2xl border-y md:border border-slate-200 dark:border-neutral-700 overflow-hidden"
          style={{ animation: 'breakdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <style>{`@keyframes breakdownFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div data-no-pull-refresh className="overflow-auto custom-scrollbar max-h-[75vh]">
            <table
              className="border-collapse text-[10px] md:text-[13px] w-full transition-[width] duration-300"
              style={{ tableLayout: 'fixed', minWidth: `${categoryColWidth + monthCols.length * 64}px`, transition: 'min-width 0.05s linear' }}
            >
              <colgroup>
                <col style={{ width: `${categoryColWidth}px` }} />
                {monthCols.map(m => <col key={m.key} />)}
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
                  {monthCols.map(m => (
                    <th
                      key={m.key}
                      className="sticky top-0 z-30 px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-left font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap border-b border-l bg-slate-50 dark:bg-neutral-700 border-slate-200 dark:border-neutral-700"
                    >
                      {MONTHS[m.monthIndex]} '{String(m.year).slice(2)}
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
                  {monthCols.map(m => (
                    <td key={m.key} className="px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-center tabular-nums font-bold border-l border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                      {formatAmount(monthTotal(incomeCategories, m.key))}
                    </td>
                  ))}
                </tr>

                {/* spacer */}
                <tr><td colSpan={monthCols.length + 1} className="h-3 bg-white dark:bg-neutral-800" /></tr>

                {/* Expense rows */}
                {expenseCategories.map(cat => (
                  <CategorySection key={cat.id} cat={cat} isExpense={true} zebraRef={expenseZebra} />
                ))}

                {/* Total Expenses — positioned exactly `netRowHeight` px above the bottom, measured
                    from the actual Net row below (not guessed), so no gap ever opens up between
                    them for scrolled rows to show through. Sticky lives on the <td> cells directly
                    since position:sticky on <tfoot>/<tr> is unreliable on Safari/iOS. */}
                <tr className="bg-slate-50 dark:bg-neutral-700 border-b border-slate-200 dark:border-neutral-700">
                  <td
                    className="sticky left-0 z-[25] bg-slate-50 dark:bg-neutral-700 px-2 md:px-4 py-2.5 md:py-[12.5px] font-bold text-slate-900 dark:text-neutral-200 border-r border-slate-200 dark:border-neutral-700 whitespace-nowrap"
                    style={{ bottom: netRowHeight }}
                  >
                    Total Expenses
                  </td>
                  {monthCols.map(m => (
                    <td
                      key={m.key}
                      className="sticky z-[15] bg-slate-50 dark:bg-neutral-700 px-1.5 md:px-3 py-2.5 md:py-[12.5px] text-center tabular-nums font-bold border-l border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-neutral-300"
                      style={{ bottom: netRowHeight }}
                    >
                      {formatAmount(-monthTotal(expenseCategories, m.key))}
                    </td>
                  ))}
                </tr>

                {/* Net — sticky to the actual bottom of the screen */}
                <tr ref={netRowRef} className="bg-[#635bff]">
                  <td className="sticky left-0 bottom-0 z-30 bg-[#635bff] px-2 md:px-4 py-[12.5px] md:py-[15px] font-bold text-white border-r border-[#5348e0] whitespace-nowrap shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
                    Net
                  </td>
                  {monthCols.map(m => {
                    const net = monthTotal(incomeCategories, m.key) - monthTotal(expenseCategories, m.key);
                    return (
                      <td key={m.key} className="sticky bottom-0 z-20 bg-[#635bff] px-1.5 md:px-3 py-[12.5px] md:py-[15px] text-center tabular-nums font-bold border-l border-white/10 text-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
                        {formatAmount(net)}
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
          the top of the screen, covering ~75% of it, with the close button at the bottom. Drag it
          up (or flick it up) to dismiss, like a native sheet. */}
      <AnimatePresence>
      {detailModal && (
        <div className="fixed inset-0 z-[100] md:flex md:items-center md:justify-center md:p-4">
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={closeDetailModal}
          />
          <motion.div
            className="relative bg-white dark:bg-neutral-800 rounded-b-2xl md:rounded-2xl shadow-2xl w-full h-[75vh] md:w-[620px] md:h-[520px] md:max-h-[80vh] flex flex-col border-b border-x md:border border-slate-100 dark:border-neutral-700"
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
            <div className="order-1 px-5 py-4 border-b border-slate-100 dark:border-neutral-700 shrink-0 flex items-center justify-between gap-2">
              <div
                onPointerDown={(e) => detailModalDragControls.start(e)}
                className="min-w-0 touch-none cursor-grab active:cursor-grabbing"
              >
                <h3 className="text-sm md:text-lg font-bold text-slate-900 dark:text-neutral-200 truncate">
                  {detailModal.categoryName}{detailModal.subcategoryName ? ` · ${detailModal.subcategoryName}` : ''}
                </h3>
                <p className="text-xs md:text-sm text-slate-400 dark:text-neutral-500 mt-0.5">{MONTHS[detailModal.monthIndex]} {detailModal.year}</p>
              </div>
              <SegmentedControl
                layoutId="breakdownDetailSortPill"
                options={[{ id: 'date', label: 'Date' }, { id: 'amount', label: 'Amount' }]}
                value={detailSortBy}
                onChange={(id) => setDetailSortBy(id as 'date' | 'amount')}
                optionClassName="md:px-2.5 text-[9px] md:text-[11px]"
              />
            </div>
            <div className="order-3 md:order-2 flex-1 overflow-y-auto custom-scrollbar">
              {detailModalTransactions.length > 0 ? (
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
                    <span className={`shrink-0 font-bold tabular-nums whitespace-nowrap ${detailModal.isExpense ? 'text-slate-800 dark:text-neutral-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatAmount((detailModal.isExpense ? -1 : 1) * Math.abs(currency === 'GBP' ? t.amountGBP : t.amountAED))}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-slate-400 dark:text-neutral-500 text-xs md:text-sm">No transactions</div>
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
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default BreakdownTab;
