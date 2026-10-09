import React from 'react';
import { FolderCog, Repeat, Settings, Eye, EyeOff, Moon, Sun, Download, Share, LogOut, Plus, ChevronRight } from 'lucide-react';
import Sheet from './Sheet';
import BlurStrengthSlider from './BlurStrengthSlider';
import { usePrivacy } from '../lib/privacy';
import { useInstall, promptInstall } from '../lib/install';
import { buzz } from '../lib/haptics';

// Phones: the "More" tab — the pages that don't fit in the bottom bar, plus app settings.
interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  onNavigate: (tab: 'income' | 'categories' | 'recurring' | 'settings') => void;
  onAddTransaction: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onLogout: () => void;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; detail?: React.ReactNode; on?: boolean; danger?: boolean; onClick: () => void }> = ({ icon, label, detail, on, danger, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full min-h-[52px] flex items-center gap-3.5 px-5 text-left active:bg-slate-50 dark:active:bg-neutral-700/50 ${on ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : ''}`}
  >
    <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${danger ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50' : 'bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-300'}`}>{icon}</span>
    <span className={`flex-1 text-[15px] font-medium ${danger ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-neutral-100'}`}>{label}</span>
    {detail ?? <ChevronRight size={17} className="text-slate-300 dark:text-neutral-600" />}
  </button>
);

const Toggle: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-neutral-600'}`}>
    <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
  </span>
);

const MoreSheet: React.FC<MoreSheetProps> = ({ open, onClose, activeTab, onNavigate, onAddTransaction, darkMode, onToggleDark, onLogout }) => {
  const [hideAmounts, toggleHideAmounts] = usePrivacy();
  const install = useInstall();
  const go = (tab: 'income' | 'categories' | 'recurring' | 'settings') => { onNavigate(tab); onClose(); };

  return (
    <Sheet open={open} onClose={onClose} label="More">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="px-5 pt-1 pb-2 text-lg font-bold text-slate-900 dark:text-neutral-100">More</p>
        <Row icon={<Plus size={18} />} label="Add a transaction" onClick={() => { onClose(); onAddTransaction(); }} />
        <Row icon={<FolderCog size={18} />} label="Categories" on={activeTab === 'categories'} onClick={() => go('categories')} />
        <Row icon={<Repeat size={18} />} label="Recurring" on={activeTab === 'recurring'} onClick={() => go('recurring')} />
        <Row icon={<Settings size={18} />} label="Settings" on={activeTab === 'settings'} onClick={() => go('settings')} />

        <div className="mx-5 my-2 border-t border-slate-100 dark:border-neutral-700" />
        <Row icon={hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />} label="Hide amounts" detail={<Toggle on={hideAmounts} />} onClick={toggleHideAmounts} />
        {hideAmounts && <div className="px-5 pb-3" data-no-sheet-drag><BlurStrengthSlider /></div>}
        <Row icon={darkMode ? <Sun size={18} /> : <Moon size={18} />} label="Dark mode" detail={<Toggle on={darkMode} />} onClick={onToggleDark} />
        {install === 'android' && (
          <Row icon={<Download size={18} />} label="Install app" detail={<span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Install</span>} onClick={async () => { if (await promptInstall()) buzz(); }} />
        )}
        {install === 'ios' && (
          <div className="mx-5 my-1.5 flex gap-3 items-center rounded-2xl bg-slate-50 dark:bg-neutral-700/50 px-4 py-3">
            <Share size={18} className="shrink-0 text-indigo-600 dark:text-indigo-300" />
            <span className="text-[13px] text-slate-700 dark:text-neutral-200">Install the app: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
          </div>
        )}

        <div className="mx-5 my-2 border-t border-slate-100 dark:border-neutral-700" />
        <Row icon={<LogOut size={18} />} label="Log out" danger detail={<span />} onClick={() => { onClose(); onLogout(); }} />
      </div>
    </Sheet>
  );
};

export default MoreSheet;
