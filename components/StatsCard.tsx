
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
}

const StatsCard: React.FC<StatsCardProps> = ({ label, amount, type, subtitle, currency = 'GBP', variant = 'default', percentChange, revenueAmount, expenseAmount }) => {
  const formattedAmount = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currencyDisplay = currency === 'GBP' ? `£${formattedAmount}` : `AED ${formattedAmount}`;

  const formatVal = (val: number) => {
    const f = val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `£${f}` : `AED ${f}`;
  };

  // --- KPI Revenue variant ---
  if (variant === 'kpi-revenue') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">↗</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Revenue</span>
        </div>
        <p className="text-3xl font-bold text-slate-900 mb-2">{currencyDisplay}</p>
        {percentChange !== undefined && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${percentChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        )}
      </div>
    );
  }

  // --- KPI Expense variant ---
  if (variant === 'kpi-expense') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">↘</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expenses</span>
        </div>
        <p className="text-3xl font-bold text-slate-900 mb-2">{currencyDisplay}</p>
        {percentChange !== undefined && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${percentChange >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        )}
      </div>
    );
  }

  // --- KPI Profitability variant ---
  if (variant === 'kpi-profitability') {
    const rev = revenueAmount ?? 0;
    const exp = expenseAmount ?? 0;
    const profit = rev - exp;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-sm font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {margin.toFixed(1)}% Margin
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Revenue</span>
            <span className="text-sm font-semibold text-slate-700">{formatVal(rev)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Expenses</span>
            <span className="text-sm font-semibold text-slate-700">{formatVal(exp)}</span>
          </div>
          <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Profit</span>
            <span className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatVal(profit)}</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Default variant (mobile uses this) ---
  const getIcon = () => {
    const iconClass = "text-slate-400";
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
    <div className="bg-white rounded-xl border border-slate-200 p-2.5 md:p-5 h-full flex flex-col justify-between">
      {/* Header with icon and label */}
      <div className="flex items-center gap-1.5 mb-1 md:mb-3">
        {getIcon()}
        <span className="text-[9px] md:text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
      </div>

      {/* Amount */}
      <p className={`${currency === 'AED' ? 'text-sm md:text-lg' : 'text-base md:text-xl'} font-semibold text-slate-900 mb-0.5 md:mb-1`}>
        {currencyDisplay}
      </p>

      {/* Subtitle */}
      <p className="text-[9px] md:text-xs text-slate-400">{getSubtitle()}</p>
    </div>
  );
};

export default StatsCard;
