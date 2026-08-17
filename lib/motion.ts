// Shared animation constants — keep every component's motion feeling like the same app instead
// of ad hoc per-component timing. Reconciled with the hand-rolled durations/easing already used
// in BreakdownTab.tsx's detail modal (0.18s/0.28s, cubic-bezier(0.32, 0.72, 0, 1)).

// Expo-out — the default for fades, scales, and list items.
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// iOS-sheet-style curve — for things that slide in/out like a native sheet.
export const EASE_SHEET: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const DURATION = {
  press: 0.15,   // button/toggle press feedback
  modal: 0.2,    // modal/list item enter-exit
  page: 0.22,    // tab/page transitions
} as const;

export const MODAL_TRANSITION = { duration: DURATION.modal, ease: EASE_OUT };
export const PAGE_TRANSITION = { duration: DURATION.page, ease: EASE_OUT };
export const SHEET_TRANSITION = { duration: DURATION.modal, ease: EASE_SHEET };

// Backdrop fade + panel scale-in, used by AnimatedModal and can be reused directly by any
// bespoke modal that doesn't go through that component.
export const MODAL_BACKDROP_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const MODAL_PANEL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

// Card/list mount stagger — put STAGGER_CONTAINER on the parent (initial="hidden" animate="visible")
// and STAGGER_ITEM on each direct motion.* child.
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.modal, ease: EASE_OUT } },
};
