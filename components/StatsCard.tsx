
import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Scale, Landmark } from 'lucide-react';

interface StatsCardProps {
  label: string;
  amount: number;
  type: 'BALANCE' | 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'NET_WORTH' | 'DEBT' | 'ASSETS';
  filled?: boolean;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, amount, type }) => {
  const formattedAmount = amount.toLocaleString('en-GB', { maximumFractionDigits: 0 });

  let amountColor = "text-slate-900";

  // Get icon color class
  const iconColorClass = type === 'INCOME' ? 'text-emerald-500' : type === 'EXPENSE' ? 'text-rose-500' : 'text-violet-500';
  const dotColorClass = type === 'INCOME' ? 'bg-emerald-500' : type === 'EXPENSE' ? 'bg-rose-500' : 'bg-violet-500';

  return (
    <div className="bg-white p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] h-full flex flex-col justify-center transition-all duration-200 hover:shadow-md group">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-0.5 w-full min-w-0">
            <div className="flex items-center gap-1 sm:gap-2">
                <p className="text-slate-400 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider truncate">{label}</p>
                {/* Hide badge on mobile */}
                <div className="hidden sm:flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                    <span className={`w-1 h-1 rounded-full ${dotColorClass}`}></span>
                    <span className="text-[9px] font-bold text-slate-400 leading-none">{type === 'BALANCE' ? 'Current Net' : 'This Month'}</span>
                </div>
            </div>

            <div className="flex items-baseline gap-0.5 mt-0.5 sm:mt-1">
                <span className={`text-sm sm:text-lg font-bold ${amountColor}`}>£</span>
                <h3 className={`text-base sm:text-2xl font-bold tracking-tight font-mono ${amountColor} truncate`}>{formattedAmount}</h3>
            </div>
        </div>
        {/* Hide icon on mobile to save space */}
        <div className="hidden sm:block p-1.5 bg-slate-50 rounded-lg group-hover:scale-110 transition-transform duration-200 shrink-0">
            {type === 'INCOME' && <TrendingUp size={18} className={iconColorClass} />}
            {type === 'EXPENSE' && <TrendingDown size={18} className={iconColorClass} />}
            {type === 'BALANCE' && <Scale size={18} className={iconColorClass} />}
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
