import { type Variants, type Transition } from 'framer-motion';

// ─── Easing Functions ────────────────────────────────────────────────────────
export const easing = {
  smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
  bounce: [0.68, -0.55, 0.265, 1.55] as [number, number, number, number],
  snappy: [0.16, 1, 0.3, 1] as [number, number, number, number],
  gentle: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// ─── Spring Presets ──────────────────────────────────────────────────────────
export const springs = {
  soft: { type: 'spring' as const, stiffness: 300, damping: 30 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 25, mass: 0.8 },
  stiff: { type: 'spring' as const, stiffness: 600, damping: 35 },
  wobbly: { type: 'spring' as const, stiffness: 180, damping: 12 },
};

// ─── Page Transitions ────────────────────────────────────────────────────────
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: easing.smooth,
      staggerChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

// ─── Card Animations ─────────────────────────────────────────────────────────
export const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springs.soft,
  },
  hover: {
    y: -4,
    scale: 1.02,
    boxShadow: '0 20px 40px rgba(8, 12, 29, 0.15)',
    transition: springs.bouncy,
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

// ─── List Stagger Animations ─────────────────────────────────────────────────
export const listContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: springs.soft,
  },
};

// ─── Metric Card Animations ──────────────────────────────────────────────────
export const metricCardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
    rotateX: -15,
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      ...springs.bouncy,
      duration: 0.5,
    },
  },
  hover: {
    y: -6,
    scale: 1.03,
    transition: springs.soft,
  },
};

// ─── Panel Animations ────────────────────────────────────────────────────────
export const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: easing.smooth,
    },
  },
};

// ─── Sidebar Navigation ──────────────────────────────────────────────────────
export const navItemVariants: Variants = {
  idle: {
    x: 0,
    scale: 1,
  },
  hover: {
    x: 6,
    scale: 1.02,
    transition: springs.soft,
  },
  active: {
    x: 4,
    scale: 1,
    transition: springs.stiff,
  },
  tap: {
    scale: 0.97,
  },
};

// ─── Tooltip Animations ──────────────────────────────────────────────────────
export const tooltipVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.15,
      ease: easing.snappy,
    },
  },
};

// ─── Badge/Pill Animations ───────────────────────────────────────────────────
export const badgeVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.6,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springs.bouncy,
  },
  pulse: {
    scale: [1, 1.1, 1],
    transition: {
      duration: 0.4,
      repeat: 2,
    },
  },
};

// ─── Alert Animations ────────────────────────────────────────────────────────
export const alertVariants: Variants = {
  hidden: {
    opacity: 0,
    height: 0,
    y: -20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    height: 'auto',
    y: 0,
    scale: 1,
    transition: {
      height: { duration: 0.3, ease: easing.smooth },
      opacity: { duration: 0.2, delay: 0.1 },
      y: { duration: 0.3, ease: easing.smooth },
      scale: { duration: 0.3, ease: easing.smooth },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -20,
    scale: 0.95,
    transition: {
      height: { duration: 0.2, delay: 0.1 },
      opacity: { duration: 0.15 },
      y: { duration: 0.2 },
    },
  },
};

// ─── Table Row Animations ────────────────────────────────────────────────────
export const tableRowVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
    backgroundColor: 'rgba(17, 184, 214, 0)',
  },
  visible: {
    opacity: 1,
    y: 0,
    backgroundColor: 'rgba(17, 184, 214, 0)',
    transition: springs.soft,
  },
  hover: {
    backgroundColor: 'rgba(17, 184, 214, 0.04)',
    transition: { duration: 0.15 },
  },
};

// ─── Expandable Animations ───────────────────────────────────────────────────
export const expandableVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    scale: 0.98,
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    scale: 1,
    transition: {
      height: { duration: 0.35, ease: easing.smooth },
      opacity: { duration: 0.25, delay: 0.1 },
      scale: { duration: 0.3, delay: 0.05 },
    },
  },
};

// ─── Skeleton Loading Animations ─────────────────────────────────────────────
export const skeletonVariants: Variants = {
  loading: {
    opacity: [0.4, 0.7, 0.4],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ─── Sparkline Draw Animation ────────────────────────────────────────────────
export const sparklineVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1, ease: easing.smooth },
      opacity: { duration: 0.3 },
    },
  },
};

// ─── Progress Bar Animation ──────────────────────────────────────────────────
export const progressVariants: Variants = {
  hidden: {
    width: 0,
    opacity: 0,
  },
  visible: (custom: number) => ({
    width: `${custom}%`,
    opacity: 1,
    transition: {
      width: { duration: 0.8, ease: easing.smooth },
      opacity: { duration: 0.2 },
    },
  }),
};

// ─── Number Counter Animation Helper ─────────────────────────────────────────
export const counterTransition: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
};

// ─── Floating Action Button ──────────────────────────────────────────────────
export const fabVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
    rotate: -180,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: springs.bouncy,
  },
  hover: {
    scale: 1.1,
    boxShadow: '0 8px 25px rgba(17, 184, 214, 0.35)',
    transition: springs.soft,
  },
  tap: {
    scale: 0.9,
  },
};

// ─── Modal Animations ────────────────────────────────────────────────────────
export const modalBackdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15, delay: 0.1 } },
};

export const modalContentVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      ...springs.bouncy,
      delay: 0.05,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.15 },
  },
};

// ─── Stagger Children Helper ─────────────────────────────────────────────────
export const staggerContainer = (staggerAmount = 0.08, delayChildren = 0.1): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerAmount,
      delayChildren,
    },
  },
});

// ─── Fade In Up Animation ────────────────────────────────────────────────────
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springs.soft },
};

// ─── Fade In Scale Animation ─────────────────────────────────────────────────
export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: springs.bouncy },
};

// ─── Slide In From Left ──────────────────────────────────────────────────────
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: springs.soft },
};

// ─── Slide In From Right ─────────────────────────────────────────────────────
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: springs.soft },
};
