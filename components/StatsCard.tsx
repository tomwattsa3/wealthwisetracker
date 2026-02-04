
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

  let icon = <Wallet size={18} className="text-slate-400" />;
  let amountColor = "text-slate-900";

  // Configuration for different types
  if (type === 'INCOME') {
      icon = <TrendingUp size={18} className="text-emerald-500" />;
  } else if (type === 'EXPENSE') {
      icon = <TrendingDown size={18} className="text-rose-500" />;
  } else if (type === 'BALANCE') {
      icon = <Scale size={18} className="text-violet-500" />;
  }

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] h-full flex flex-col justify-center transition-all duration-200 hover:shadow-md group">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-0.5 w-full">
            <div className="flex items-center gap-2">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{label}</p>
                <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                    <span className={`w-1 h-1 rounded-full ${type === 'INCOME' ? 'bg-emerald-500' : type === 'EXPENSE' ? 'bg-rose-500' : 'bg-violet-500'}`}></span>
                    <span className="text-[9px] font-bold text-slate-400 leading-none">{type === 'BALANCE' ? 'Current Net' : 'This Month'}</span>
                </div>
            </div>
            
            <div className="flex items-baseline gap-0.5 mt-1">
                <span className={`text-lg font-bold ${amountColor}`}>£</span>
                <h3 className={`text-2xl font-bold tracking-tight font-mono ${amountColor}`}>{formattedAmount}</h3>
            </div>
        </div>
        <div className="p-1.5 bg-slate-50 rounded-lg group-hover:scale-110 transition-transform duration-200 shrink-0">
            {icon}
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
