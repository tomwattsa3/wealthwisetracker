import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthFilterProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const MonthFilter: React.FC<MonthFilterProps> = ({ currentDate, onDateChange }) => {
  const handlePrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onDateChange(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onDateChange(newDate);
  };

  return (
    <div className="flex items-center bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-lg p-1 shadow-sm">
      <button 
        onClick={handlePrevMonth}
        className="p-1.5 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded-md text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-neutral-200 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      
      <div className="flex items-center gap-2 px-3 min-w-[140px] justify-center font-medium text-slate-700 dark:text-neutral-400 text-sm">
        <Calendar size={14} className="text-violet-600" />
        <span className="uppercase tracking-wide text-xs font-bold">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      <button 
        onClick={handleNextMonth}
        className="p-1.5 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded-md text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-neutral-200 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export default MonthFilter;