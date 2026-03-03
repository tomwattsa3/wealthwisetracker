import React from 'react';
import { TooltipProps } from 'recharts';

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    const title = label || payload[0].name;
    return (
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-3 rounded-lg shadow-lg border border-slate-100 dark:border-slate-800 text-xs z-50">
        <p className="font-semibold mb-1 text-slate-600 dark:text-slate-400">{title}</p>
        <p className="text-violet-600 font-mono text-sm font-bold">
          £{payload[0].value?.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

export default CustomTooltip;