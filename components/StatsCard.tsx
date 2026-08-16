
import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Scale, Landmark } from 'lucide-react';

interface StatsCardProps {
  label: string;
  amount: number;
  type: 'BALANCE' | 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'NET_WORTH' | 'DEBT' | 'ASSETS';
  filled?: boolean;
  subtitle?: string;
  currency?: 'GBP' | 'AED';
  variant?: 'default' | 'kpi-revenue' | 'kpi-expense' | 'kpi-profitability';
  percentChange?: number;
  revenueAmount?: number;
  expenseAmount?: number;
  amountAlt?: number;
  revenueAmountAlt?: number;
  expenseAmountAlt?: number;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, amount, type, subtitle, currency = 'GBP', variant = 'default', percentChange, revenueAmount, expenseAmount, amountAlt, revenueAmountAlt, expenseAmountAlt }) => {
  const formattedAmount = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currencyDisplay = currency === 'GBP' ? `£${formattedAmount}` : `AED ${formattedAmount}`;

  const formatVal = (val: number) => {
    const f = val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `£${f}` : `AED ${f}`;
  };

  // --- KPI Revenue variant ---
  if (variant === 'kpi-revenue') {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between gap-3 h-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-sm shrink-0">📈</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider leading-tight">Income</p>
            <p className="text-lg font-bold text-slate-900 dark:text-neutral-200 truncate leading-tight">{currencyDisplay}</p>
          </div>
        </div>
        {percentChange !== undefined && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${percentChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        )}
      </div>
    );
  }

  // --- KPI Expense variant ---
  if (variant === 'kpi-expense') {
    const rev = revenueAmount ?? 0;
    const spendPct = rev > 0 ? (amount / rev) * 100 : 0;

    return (
      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between gap-3 h-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center text-sm shrink-0">📉</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider leading-tight">Expenses</p>
            <p className="text-lg font-bold text-slate-900 dark:text-neutral-200 truncate leading-tight">{currencyDisplay}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {rev > 0 && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${spendPct > 100 ? 'bg-rose-50 text-rose-600' : spendPct > 80 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {spendPct.toFixed(1)}% of income
            </span>
          )}
          {percentChange !== undefined && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${percentChange >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    );
  }

  // --- KPI Net Saved variant ---
  if (variant === 'kpi-profitability') {
    const rev = revenueAmount ?? 0;
    const exp = expenseAmount ?? 0;
    const netSaved = rev - exp;

    return (
      <div className="bg-[#635bff] rounded-xl px-4 py-3 flex items-center justify-between gap-3 h-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-sm shrink-0">💰</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider leading-tight">Net Saved</p>
            <p className="text-lg font-bold text-white truncate leading-tight">{formatVal(netSaved)}</p>
          </div>
        </div>
        {rev > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white shrink-0">
            {((netSaved / rev) * 100).toFixed(1)}% of income
          </span>
        )}
      </div>
    );
  }

  // --- Default variant (mobile uses this) ---
  const getIcon = () => {
    const iconClass = "text-slate-400 dark:text-neutral-500";
    switch(type) {
      case 'INCOME': return <TrendingUp size={16} className={iconClass} />;
      case 'EXPENSE': return <TrendingDown size={16} className={iconClass} />;
      case 'BALANCE': return <Scale size={16} className={iconClass} />;
      default: return <Wallet size={16} className={iconClass} />;
    }
  };

  const getSubtitle = () => {
    if (subtitle) return subtitle;
    switch(type) {
      case 'INCOME': return 'Total Earnings';
      case 'EXPENSE': return 'Total Spent';
      case 'BALANCE': return 'Net Position';
      default: return '';
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 p-2.5 md:p-5 h-full flex flex-col justify-between">
      {/* Header with icon and label */}
      <div className="flex items-center gap-1.5 mb-1 md:mb-3">
        {getIcon()}
        <span className="text-[9px] md:text-xs font-medium text-slate-400 dark:text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>

      {/* Amount */}
      <p className={`${currency === 'AED' ? 'text-sm md:text-lg' : 'text-base md:text-xl'} font-semibold text-slate-900 dark:text-neutral-200 mb-0.5 md:mb-1`}>
        {currencyDisplay}
      </p>

      {/* Subtitle */}
      <p className="text-[9px] md:text-xs text-slate-400 dark:text-neutral-500">{getSubtitle()}</p>
    </div>
  );
};

export default StatsCard;
