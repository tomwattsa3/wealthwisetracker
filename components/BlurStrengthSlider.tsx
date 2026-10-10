import React from 'react';
import { useBlurStrength, usePrivacyStyle, STRENGTH_MIN, STRENGTH_MAX } from '../lib/privacy';

// How "Hide amounts" hides: X's (£XX,XXX.XX) or a blur, and for the blur how strong it is,
// with a sample amount to judge it by.
const BlurStrengthSlider: React.FC<{ disabled?: boolean; compact?: boolean }> = ({ disabled, compact }) => {
  const [strength, setStrength] = useBlurStrength();
  const [style, setStyle] = usePrivacyStyle();
  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-600 dark:text-neutral-300">Style</span>
        <div role="group" aria-label="Hide style" className="flex p-[2px] bg-slate-100 dark:bg-neutral-700/60 rounded-[8px]">
          {([['x', 'XX'], ['blur', 'Blur']] as const).map(([id, l]) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => setStyle(id)}
              aria-pressed={style === id}
              className={`h-6 px-2.5 rounded-[6px] text-[11px] transition-colors ${style === id ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {style === 'blur' && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-neutral-300">Blur strength</span>
            <span className="tabular-nums text-slate-500 dark:text-neutral-400" data-amt-skip>{Math.round(strength * 100)}%</span>
          </div>
          <input
            type="range"
            min={STRENGTH_MIN}
            max={STRENGTH_MAX}
            step={0.05}
            value={strength}
            disabled={disabled}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            aria-label="Blur strength"
            className="w-full accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-neutral-500">
            <span>Softer</span>
            {!compact && <span className="text-base font-bold text-slate-900 dark:text-neutral-100">£1,234.56</span>}
            <span>Stronger</span>
          </div>
        </>
      )}
    </div>
  );
};

export default BlurStrengthSlider;
