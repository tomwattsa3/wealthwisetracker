import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
}

interface DashboardDateFilterProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: 'This Month', getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start, end };
  }},
  { label: 'Last Month', getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end };
  }},
  { label: 'Last 30 Days', getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      return { start, end };
  }},
  { label: 'This Year', getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { start, end };
  }},
];

const DashboardDateFilter: React.FC<DashboardDateFilterProps> = ({ range, onRangeChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Custom Date State
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    const { start, end } = preset.getValue();
    onRangeChange({
      start: formatDate(start),
      end: formatDate(end),
      label: preset.label
    });
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onRangeChange({
        start: customStart,
        end: customEnd,
        label: 'Custom Range'
      });
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button - Bubble Style */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-[#635bff] hover:ring-1 hover:ring-[#635bff]/10 rounded-lg px-3 py-2.5 shadow-sm transition-all group"
      >
        <Calendar size={14} className="text-slate-400 group-hover:text-[#635bff] transition-colors shrink-0" />
        <span className="text-xs font-bold text-slate-700 whitespace-nowrap truncate max-w-[100px] md:max-w-none">
            {range.label}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed md:absolute left-1/2 md:left-0 -translate-x-1/2 md:translate-x-0 top-20 md:top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 z-[100] animate-in fade-in slide-in-from-top-2 overflow-hidden">
           <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-50 bg-slate-50/50">
              {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg text-left transition-colors ${range.label === preset.label ? 'bg-[#635bff] text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}
                  >
                    {preset.label}
                  </button>
              ))}
           </div>
           
           <div className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custom Range</p>
              <div className="flex items-center gap-2 mb-3">
                 <input 
                   type="date" 
                   value={customStart}
                   onChange={(e) => setCustomStart(e.target.value)}
                   className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-[#635bff]"
                 />
                 <span className="text-slate-300 font-bold">-</span>
                 <input 
                   type="date" 
                   value={customEnd}
                   onChange={(e) => setCustomEnd(e.target.value)}
                   className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-[#635bff]"
                 />
              </div>
              <button 
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
                className="w-full bg-slate-900 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
              >
                Apply Range
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DashboardDateFilter;