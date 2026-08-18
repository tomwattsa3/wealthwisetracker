
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MODAL_TRANSITION } from '../lib/motion';

interface AnimatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
  /** Override the wrapper's alignment, e.g. "items-end sm:items-center" for a bottom-sheet-on-mobile look. */
  wrapperClassName?: string;
}

// Drop-in replacement for the "fixed inset-0 ... animate-in zoom-in-95" modal pattern used
// throughout the app — that pattern's animate-in/zoom-in-95 classes are dead no-ops (the
// tailwindcss-animate plugin they rely on isn't loaded here), so those modals were actually
// snapping open/closed instantly. AnimatePresence lets the exit animation play before the modal
// actually unmounts, which plain conditional rendering can't do on its own.
const AnimatedModal: React.FC<AnimatedModalProps> = ({ isOpen, onClose, children, panelClassName, wrapperClassName }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        // The wrapper carries its own exit={{ pointerEvents: 'none' }} — Framer Motion applies
        // non-numeric style values like this instantly, at the *start* of the exit transition,
        // not when it finishes. That matters because AnimatePresence keeps this full-screen
        // overlay mounted for the whole exit animation, and on iOS Safari specifically, the
        // exit-complete callback that would normally unmount it can occasionally never fire —
        // leaving an invisible click-eating layer over the entire app until reload. Setting
        // pointer-events to none the moment the close starts means a stuck exit can never block
        // input, regardless of whether the fade-out visual itself ever finishes.
        <motion.div
          className={`fixed inset-0 z-[100] flex justify-center p-4 ${wrapperClassName || 'items-center'}`}
          initial={{ pointerEvents: 'auto' }}
          animate={{ pointerEvents: 'auto' }}
          exit={{ pointerEvents: 'none' }}
        >
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
          />
          <motion.div
            className={panelClassName || 'relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-100 dark:border-neutral-700'}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={MODAL_TRANSITION}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnimatedModal;
