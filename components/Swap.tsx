import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Text that changes with a soft fade and slide: the old value drifts up and fades out while the
// new one rises in from below, in about a quarter of a second. Only opacity and position move
// (no blur), which phones can animate without redrawing the page.
const Swap: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span className={`relative inline-grid align-baseline ${className}`}>
    <AnimatePresence initial={false}>
      <motion.span
        key={text}
        style={{ gridArea: '1 / 1', willChange: 'transform, opacity' }}
        className="whitespace-nowrap"
        initial={{ opacity: 0, y: '0.35em' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '-0.35em' }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  </span>
);

// A row in a list that re-sorts or changes: it glides to its new place, and fades in or out when
// it joins or leaves. Use inside <AnimatePresence initial={false} mode="popLayout">. It passes its
// ref through so a leaving row can step out of the list straight away (instead of holding its
// space until it has faded, which made lists grow and then shrink).
export const GlideRow = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(({ children, className }, ref) => (
  <motion.div
    ref={ref}
    layout="position"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    className={className}
  >
    {children}
  </motion.div>
));
GlideRow.displayName = 'GlideRow';

// Grows or shrinks smoothly to fit what's inside, so a list getting longer or shorter eases into
// its new height rather than snapping.
export const AutoHeight: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | 'auto'>('auto');
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height: h }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className={`overflow-hidden ${className}`}>
      <div ref={inner} className="relative">{children}</div>
    </motion.div>
  );
};

export default Swap;
