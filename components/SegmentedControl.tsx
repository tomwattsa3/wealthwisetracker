
import React from 'react';
import { motion } from 'framer-motion';
import { DURATION, EASE_OUT } from '../lib/motion';

interface SegmentedControlOption {
  id: string;
  label: React.ReactNode;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (id: string) => void;
  /** Unique per on-screen instance — lets each control's pill animate independently instead of
   * trying to morph into a different control's pill elsewhere on the page. */
  layoutId: string;
  className?: string;
  optionClassName?: string;
  activeTextClassName?: string;
  inactiveTextClassName?: string;
  /** Background (+ any other styling) of the sliding active pill — defaults to a plain white/dark
   * card. Override for controls where that reads as too low-contrast against the track (e.g. a
   * solid accent color), pairing it with a lighter `activeTextClassName`. */
  pillClassName?: string;
}

// Shared "pill behind the active option" control — replaces the instant className-swap pattern
// that was duplicated across ~8 date-range/currency/sort toggles throughout the app. The active
// pill now slides to whichever option is selected instead of each button flashing its own bg.
const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  layoutId,
  className,
  optionClassName,
  activeTextClassName = 'text-slate-900 dark:text-neutral-200',
  inactiveTextClassName = 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300',
  pillClassName = 'bg-white dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-600/80',
}) => {
  return (
    <div className={`flex bg-slate-100 dark:bg-neutral-700 p-0.5 rounded-lg shrink-0 ${className || ''}`}>
      {options.map(opt => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{ WebkitTapHighlightColor: 'transparent' }}
            className={`relative px-2.5 py-1 text-[10px] font-semibold rounded-md whitespace-nowrap transition-colors active:scale-95 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#635bff]/40 ${isActive ? activeTextClassName : inactiveTextClassName} ${optionClassName || ''}`}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={`absolute inset-0 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] -z-10 ${pillClassName}`}
                transition={{ duration: DURATION.press, ease: EASE_OUT }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
