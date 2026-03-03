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
    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
      <button 
        onClick={handlePrevMonth}
        className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      
      <div className="flex items-center gap-2 px-3 min-w-[140px] justify-center font-medium text-slate-700 dark:text-slate-300 text-sm">
        <Calendar size={14} className="text-violet-600" />
        <span className="uppercase tracking-wide text-xs font-bold">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      <button 
        onClick={handleNextMonth}
        className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export default MonthFilter;