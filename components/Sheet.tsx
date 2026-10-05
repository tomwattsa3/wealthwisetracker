import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { MODAL_TRANSITION, SHEET_SPRING } from '../lib/motion';
import { useBackClose } from '../lib/backStack';

// The app's bottom sheet on phones. Drag it down from anywhere to close: the sheet follows the
// finger and the scrim fades with it; a quick flick or a long enough pull closes it, otherwise it
// springs back. Inside a scrolling list, pulling down only drags the sheet once the list is at
// the top, so normal scrolling still works. Closes on scrim tap, Escape and the phone's Back
// gesture too.

interface SheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  // Fixed height (e.g. 'h-[86dvh]') or leave empty to size to the content (up to 92dvh).
  heightClass?: string;
  onExitComplete?: () => void;
  zClass?: string;
}

const CLOSE_DISTANCE = 110; // px pulled down
const CLOSE_VELOCITY = 0.55; // px per ms (a flick)

const scrollParentWithin = (from: Element | null, stop: Element) => {
  for (let el = from; el && el !== stop; el = el.parentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
};

const scrollsSideways = (from: Element | null, stop: Element) => {
  for (let el = from; el && el !== stop; el = el.parentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
};

// While any sheet is open the page behind it is frozen, so a swipe on the sheet can't scroll
// the dashboard underneath (phones sometimes hand the gesture to the scroller behind).
// iPhone Safari ignores touch-action on the dimmed backdrop, so a page-wide listener also stops
// any swipe that isn't inside a sheet or pop-up (those handle their own touches).
let openSheets = 0;
const blockOutside = (e: TouchEvent) => {
  if (e.cancelable && !(e.target as Element).closest?.('[role="dialog"], [role="alertdialog"]')) e.preventDefault();
};
const lockPage = () => {
  if (openSheets++ > 0) return;
  document.documentElement.classList.add('sheet-open');
  document.addEventListener('touchmove', blockOutside, { passive: false });
};
const unlockPage = () => {
  if (--openSheets > 0) return;
  document.documentElement.classList.remove('sheet-open');
  document.removeEventListener('touchmove', blockOutside);
};

const SheetPanel: React.FC<Omit<SheetProps, 'open' | 'onExitComplete'>> = ({ onClose, label, children, heightClass, zClass }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const scrimOpacity = useTransform(dragY, v => Math.max(0.15, 1 - v / 500));

  // Kept in a ref so a parent re-render mid-drag doesn't reset the drag.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useBackClose(true, onClose);
  useEffect(() => { lockPage(); return unlockPage; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Touch dragging, done by hand so it can hand over to a list's own scrolling.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let startX = 0, startY = 0, startT = 0, lastY = 0, lastT = 0, velocity = 0;
    let mode: 'idle' | 'native' | 'maybe' | 'drag' | 'scroll' = 'idle';
    let scroller: Element | null = null;
    let sideways = false;

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element;
      if (e.touches.length !== 1 || target.closest('input, textarea, select, [data-no-sheet-drag]')) { mode = 'native'; return; }
      startX = e.touches[0].clientX; startY = lastY = e.touches[0].clientY; startT = lastT = performance.now();
      scroller = scrollParentWithin(target, panel);
      sideways = scrollsSideways(target, panel);
      dragY.stop(); // catch it mid spring-back
      mode = 'maybe';
    };
    const onMove = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'native') return;
      // Nothing in the sheet under the finger can scroll: keep the gesture away from the page.
      if (mode === 'scroll') { if (!scroller && !sideways && e.cancelable) e.preventDefault(); return; }
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const dy = y - startY, dx = x - startX;
      if (mode === 'maybe') {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) {
          // Claim a downward pull from the very first move, before the browser starts a scroll.
          if (!sideways && dy >= 0 && (!scroller || scroller.scrollTop <= 0) && e.cancelable) e.preventDefault();
          return;
        }
        // Sideways swipes (chip rows) and upward / mid-list pulls belong to scrolling.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || (scroller && scroller.scrollTop > 0)) {
          mode = 'scroll';
          if (!scroller && !sideways && e.cancelable) e.preventDefault();
          return;
        }
        mode = 'drag';
      }
      e.preventDefault();
      const now = performance.now();
      velocity = (y - lastY) / Math.max(1, now - lastT);
      lastY = y; lastT = now;
      dragY.set(Math.max(0, dy));
    };
    const onEnd = () => {
      if (mode === 'drag') {
        if (dragY.get() > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) closeRef.current();
        else animate(dragY, 0, SHEET_SPRING);
      }
      mode = 'idle';
    };
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onEnd);
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onEnd);
    };
  }, [dragY]);

  return (
    // exit={{ pointerEvents: 'none' }}: stop catching taps the moment it starts closing (iOS can
    // occasionally skip the exit-complete callback).
    <motion.div className={`fixed inset-0 ${zClass || 'z-[100]'}`} initial={{ pointerEvents: 'auto' }} animate={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MODAL_TRANSITION}>
        <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] touch-none" style={{ opacity: scrimOpacity }} onClick={onClose} />
      </motion.div>
      <motion.div
        className="absolute inset-x-0 bottom-0"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={SHEET_SPRING}
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          style={{ y: dragY }}
          className={`${heightClass || 'max-h-[92dvh]'} bg-white dark:bg-neutral-800 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden overscroll-contain`}
        >
          <div className="shrink-0 flex justify-center pt-2.5 pb-1.5" aria-hidden>
            <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-neutral-600" />
          </div>
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

const Sheet: React.FC<SheetProps> = ({ open, onExitComplete, ...rest }) =>
  createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && <SheetPanel {...rest} />}
    </AnimatePresence>,
    document.body
  );

export default Sheet;
