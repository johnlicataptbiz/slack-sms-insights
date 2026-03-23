/**
 * Centralized Design Tokens for SMS Insights Dashboard
 *
 * This file defines the design system foundation including colors, typography,
 * spacing, and component states. Used by Tailwind config and React components.
 */

// ============================================
// COLOR TOKENS
// ============================================

export const colors = {
  // Primary: Action & Interactive Elements
  primary: {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c3d66",
  },

  // Secondary: Supplementary & Secondary Actions
  secondary: {
    50: "#f5f3ff",
    100: "#ede9fe",
    200: "#ddd6fe",
    300: "#c4b5fd",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed",
    700: "#6d28d9",
    800: "#5b21b6",
    900: "#4c1d95",
  },

  // Success: Positive states, delivery confirmation
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#145231",
  },

  // Warning: Caution states, pending actions
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },

  // Error: Failed states, delivery errors
  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Neutral: Background, text, borders
  neutral: {
    0: "#ffffff",
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Semantic SMS States
  sms: {
    sent: "#3b82f6", // Blue
    delivered: "#22c55e", // Green
    read: "#8b5cf6", // Purple
    failed: "#ef4444", // Red
    pending: "#f59e0b", // Amber
  },
};

// ============================================
// TYPOGRAPHY TOKENS
// ============================================

export const typography = {
  // Font Families
  family: {
    sans: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, Menlo, monospace",
  },

  // Font Sizes (px and rem equivalents)
  size: {
    xs: { px: 12, rem: 0.75 }, // Small labels
    sm: { px: 14, rem: 0.875 }, // Secondary text
    base: { px: 16, rem: 1 }, // Body text
    lg: { px: 18, rem: 1.125 }, // Card headers
    xl: { px: 20, rem: 1.25 }, // Section headers
    "2xl": { px: 24, rem: 1.5 }, // Page headers
    "3xl": { px: 30, rem: 1.875 }, // Hero titles
  },

  // Font Weights
  weight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line Heights
  lineHeight: {
    tight: 1.2, // Headings
    normal: 1.5, // Body text
    loose: 1.75, // Lists, descriptions
  },

  // Text Styles (semantic combinations)
  styles: {
    h1: { size: "2xl", weight: "bold", lineHeight: "tight" },
    h2: { size: "xl", weight: "semibold", lineHeight: "tight" },
    h3: { size: "lg", weight: "semibold", lineHeight: "normal" },
    body: { size: "base", weight: "normal", lineHeight: "normal" },
    caption: { size: "sm", weight: "normal", lineHeight: "normal" },
    label: { size: "sm", weight: "medium", lineHeight: "normal" },
    code: { size: "sm", weight: "normal", family: "mono" },
  },
};

// ============================================
// SPACING TOKENS (4px base unit)
// ============================================

export const spacing = {
  0: "0px",
  1: "4px", // Micro
  2: "8px", // Extra small
  3: "12px", // Small
  4: "16px", // Base
  6: "24px", // Medium
  8: "32px", // Large
  10: "40px", // Extra large
  12: "48px", // 2XL
  16: "64px", // 3XL
  20: "80px", // 4XL
  24: "96px", // 5XL
};

// ============================================
// COMPONENT STATES
// ============================================

export const componentStates = {
  // Button States
  button: {
    idle: {
      bg: "primary-500",
      text: "white",
      border: "transparent",
    },
    hover: {
      bg: "primary-600",
    },
    focus: {
      outline: "primary-500",
      outlineWidth: "2px",
      outlineOffset: "2px",
    },
    active: {
      bg: "primary-700",
    },
    disabled: {
      bg: "neutral-200",
      text: "neutral-500",
      cursor: "not-allowed",
      opacity: 0.5,
    },
    loading: {
      opacity: 0.7,
      pointerEvents: "none",
    },
  },

  // Input States
  input: {
    idle: {
      bg: "white",
      border: "neutral-300",
      borderWidth: "1px",
      text: "neutral-900",
    },
    hover: {
      border: "neutral-400",
    },
    focus: {
      border: "primary-500",
      outline: "primary-100",
      outlineWidth: "2px",
      boxShadow: "0 0 0 3px rgba(14, 165, 233, 0.1)",
    },
    error: {
      border: "error-500",
      boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
    },
    disabled: {
      bg: "neutral-100",
      text: "neutral-500",
      cursor: "not-allowed",
    },
  },

  // Card States
  card: {
    default: {
      bg: "white",
      border: "neutral-200",
      borderWidth: "1px",
      borderRadius: "8px",
      shadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    },
    hover: {
      shadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
      borderColor: "neutral-300",
    },
    active: {
      borderColor: "primary-500",
      shadow: "0 0 0 3px rgba(14, 165, 233, 0.1)",
    },
  },

  // Message Bubble States
  messageBubble: {
    sent: {
      bg: "primary-500",
      text: "white",
      align: "right",
    },
    received: {
      bg: "neutral-100",
      text: "neutral-900",
      align: "left",
    },
    pending: {
      opacity: 0.7,
      bg: "primary-50",
      text: "primary-900",
    },
    failed: {
      bg: "error-50",
      text: "error-900",
      border: "error-200",
    },
  },
};

// ============================================
// SHADOW TOKENS
// ============================================

export const shadows = {
  xs: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
};

// ============================================
// BREAKPOINTS (Mobile-first)
// ============================================

export const breakpoints = {
  mobile: 320, // xs - Mobile phones
  tablet: 768, // md - Tablets
  desktop: 1024, // lg - Desktop
  wide: 1280, // xl - Wide screens
  ultraWide: 1536, // 2xl - Ultra wide
};

// ============================================
// BORDER RADIUS TOKENS
// ============================================

export const borderRadius = {
  none: "0px",
  sm: "2px",
  base: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  full: "9999px",
};

// ============================================
// ANIMATION TOKENS
// ============================================

export const animations = {
  duration: {
    fast: "100ms",
    normal: "200ms",
    slow: "300ms",
    slower: "500ms",
  },
  easing: {
    linear: "linear",
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    easeOut: "cubic-bezier(0, 0, 0.2, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
};

// ============================================
// EXPORT DEFAULT THEME OBJECT
// ============================================

export const designTokens = {
  colors,
  typography,
  spacing,
  componentStates,
  shadows,
  breakpoints,
  borderRadius,
  animations,
} as const;
