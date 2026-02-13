
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

  const altCurrencyLabel = currency === 'GBP' ? 'AED' : '£';
  const formatAlt = (val: number) => {
    const f = val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'GBP' ? `AED ${f}` : `£${f}`;
  };

  // --- KPI Revenue variant ---
  if (variant === 'kpi-revenue') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📈</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Income</span>
          </div>
          {percentChange !== undefined && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${percentChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-3xl font-bold text-slate-900">{currencyDisplay}</p>
        {amountAlt !== undefined && (
          <p className="text-[11px] font-medium text-slate-400 mt-1">{formatAlt(amountAlt)}</p>
        )}
      </div>
    );
  }

  // --- KPI Expense variant ---
  if (variant === 'kpi-expense') {
    const rev = revenueAmount ?? 0;
    const spendPct = rev > 0 ? (amount / rev) * 100 : 0;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📉</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expenses</span>
          </div>
          <div className="flex items-center gap-1.5">
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
        <p className="text-3xl font-bold text-slate-900">{currencyDisplay}</p>
        {amountAlt !== undefined && (
          <p className="text-[11px] font-medium text-slate-400 mt-1">{formatAlt(amountAlt)}</p>
        )}
      </div>
    );
  }

  // --- KPI Net Saved variant ---
  if (variant === 'kpi-profitability') {
    const rev = revenueAmount ?? 0;
    const exp = expenseAmount ?? 0;
    const netSaved = rev - exp;
    const revAlt = revenueAmountAlt ?? 0;
    const expAlt = expenseAmountAlt ?? 0;
    const netSavedAlt = revAlt - expAlt;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">💰</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Saved</span>
          </div>
          {rev > 0 && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${netSaved >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {((netSaved / rev) * 100).toFixed(1)}% of income
            </span>
          )}
        </div>
        <p className={`text-3xl font-bold ${netSaved >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatVal(netSaved)}</p>
        {(revenueAmountAlt !== undefined || expenseAmountAlt !== undefined) && (
          <p className="text-[11px] font-medium text-slate-400 mt-1">{formatAlt(netSavedAlt)}</p>
        )}
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
