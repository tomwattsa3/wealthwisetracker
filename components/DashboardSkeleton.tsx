
import React from 'react';

const Block: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-neutral-700 rounded-xl ${className || ''}`} />
);

// Roughly mirrors the Home dashboard's shape (title, 3 KPI cards, a row of larger cards) so
// there's no layout jump when real content pops in — shown while the initial data fetch is in
// flight instead of a blank screen with just a spinner in the middle.
const DashboardSkeleton: React.FC = () => {
  return (
    <div className="h-screen w-full bg-slate-50 dark:bg-neutral-900 p-4 md:p-8 space-y-4 md:space-y-6 overflow-hidden">
      <div className="space-y-2">
        <Block className="h-6 w-40" />
        <Block className="h-3 w-56" />
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Block className="h-16 md:h-24" />
        <Block className="h-16 md:h-24" />
        <Block className="h-16 md:h-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
        <Block className="h-40 md:h-64" />
        <Block className="hidden md:block h-64" />
        <Block className="hidden md:block h-64" />
      </div>
      <div className="space-y-2 md:hidden">
        <Block className="h-32" />
        <Block className="h-32" />
      </div>
    </div>
  );
};

export default DashboardSkeleton;
