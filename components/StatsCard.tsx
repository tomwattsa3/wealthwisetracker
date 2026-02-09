
import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Scale, Landmark } from 'lucide-react';

interface StatsCardProps {
  label: string;
  amount: number;
  type: 'BALANCE' | 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'NET_WORTH' | 'DEBT' | 'ASSETS';
  filled?: boolean;
  subtitle?: string;
  currency?: 'GBP' | 'AED';
}

const StatsCard: React.FC<StatsCardProps> = ({ label, amount, type, subtitle, currency = 'GBP' }) => {
  const formattedAmount = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currencyDisplay = currency === 'GBP' ? `£${formattedAmount}` : `AED ${formattedAmount}`;

  // Mercury Bank style - muted icons and subtle colors
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
      <p className="text-base md:text-xl font-semibold text-slate-900 mb-0.5 md:mb-1">
        {currencyDisplay}
      </p>

      {/* Subtitle */}
      <p className="text-[9px] md:text-xs text-slate-400">{getSubtitle()}</p>
    </div>
  );
};

export default StatsCard;
