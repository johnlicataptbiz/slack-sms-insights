// Design tokens for consistent theming across Slack UI components

export const designTokens = {
  // Color palette - semantic meanings
  colors: {
    primary: '#3b82f6',      // Blue for primary actions
    secondary: '#64748b',    // Gray for secondary elements
    success: '#10b981',      // Green for success states
    warning: '#f59e0b',      // Orange for warnings
    error: '#ef4444',        // Red for errors
    info: '#06b6d4',         // Cyan for informational content

    // Neutral colors
    gray: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
  },

  // Typography scale
  typography: {
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  // Spacing system (4px grid)
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },

  // Border radius
  borderRadius: {
    none: '0',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },

  // Shadows (Slack-compatible)
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },

  // Status indicators
  status: {
    success: {
      emoji: '✅',
      color: '#10b981',
    },
    warning: {
      emoji: '⚠️',
      color: '#f59e0b',
    },
    error: {
      emoji: '❌',
      color: '#ef4444',
    },
    info: {
      emoji: 'ℹ️',
      color: '#06b6d4',
    },
  },
} as const;

// Type definitions for design tokens
export type ColorPalette = typeof designTokens.colors;
export type TypographyScale = typeof designTokens.typography;
export type SpacingScale = typeof designTokens.spacing;
export type StatusTokens = typeof designTokens.status;