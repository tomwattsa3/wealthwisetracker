import React from 'react';
import { useBlurStrength, STRENGTH_MIN, STRENGTH_MAX } from '../lib/privacy';

// Slider for how strongly "Hide amounts" blurs, with a sample amount to judge it by.
const BlurStrengthSlider: React.FC<{ disabled?: boolean; compact?: boolean }> = ({ disabled, compact }) => {
  const [strength, setStrength] = useBlurStrength();
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50' : ''}`}>
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
    </div>
  );
};

export default BlurStrengthSlider;
