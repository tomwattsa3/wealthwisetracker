import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useInstall, promptInstall } from '../lib/install';
import { buzz } from '../lib/haptics';

// Home-screen prompt on phones: a real Install button on Android, the Add to Home Screen hint on
// iPhone Safari. Hidden once installed, or after "Not now" on this device.
const DISMISS_KEY = 'installCardDismissed';

const InstallCard: React.FC = () => {
  const install = useInstall();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  if (!install || dismissed) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* not saved */ } };

  return (
    <div className="relative rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-4 pr-11">
      <button onClick={dismiss} aria-label="Not now" className="absolute top-1.5 right-1.5 w-10 h-10 rounded-xl flex items-center justify-center text-indigo-400"><X size={16} /></button>
      <div className="flex gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center">{install === 'android' ? <Download size={18} /> : <Share size={18} />}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-indigo-900 dark:text-indigo-100">Install WealthWise</p>
          {install === 'android' ? (
            <>
              <p className="text-[13px] text-indigo-800/80 dark:text-indigo-200/80">Opens full screen from your home screen, like an app.</p>
              <div className="mt-2.5 flex gap-2">
                <button onClick={async () => { if (await promptInstall()) buzz(); }} className="min-h-[40px] px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Install</button>
                <button onClick={dismiss} className="min-h-[40px] px-3 rounded-xl text-sm font-medium text-indigo-700 dark:text-indigo-300">Not now</button>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-indigo-800/80 dark:text-indigo-200/80">
              Tap <Share size={13} className="inline -mt-0.5" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallCard;
