import React from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

// The phone Search pill (Home, Income, Category Sheets). It grows into the search bubble and
// back (shared layoutId). While search is open its spot is kept empty so the header doesn't
// shift; data-search-pill marks that spot so the bubble knows where to shrink back to.
const SearchPill: React.FC<{ onSearch: () => void; searchOpen?: boolean; className?: string }> = ({ onSearch, searchOpen, className = '' }) => (
  <div className={`w-[104px] h-8 ${className}`} data-search-pill>
    {!searchOpen && (
      <motion.button
        layoutId="homeSearch"
        onClick={onSearch}
        aria-label="Search"
        style={{ borderRadius: 16 }}
        transition={{ layout: { type: 'spring', stiffness: 400, damping: 36, mass: 0.9 } }}
        className="w-full h-full px-3 flex items-center justify-center gap-1.5 bg-slate-400/[0.14] dark:bg-neutral-700/60 text-slate-500 dark:text-neutral-400"
      >
        <motion.span className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.18 } }}>
          <Search size={14} strokeWidth={2.2} className="shrink-0" />
          <span className="text-[12.5px] truncate">Search</span>
        </motion.span>
      </motion.button>
    )}
  </div>
);

export default SearchPill;
