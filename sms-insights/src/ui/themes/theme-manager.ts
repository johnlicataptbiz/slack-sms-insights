import { designTokens } from './design-tokens.js';

export interface Theme {
  name: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
}

export const themes: Record<'light' | 'dark', Theme> = {
  light: {
    name: 'light',
    colors: {
      primary: designTokens.colors.primary,
      secondary: designTokens.colors.gray[500],
      success: designTokens.colors.success,
      warning: designTokens.colors.warning,
      error: designTokens.colors.error,
      info: designTokens.colors.info,
      background: '#ffffff',
      surface: designTokens.colors.gray[50],
      text: designTokens.colors.gray[900],
      textSecondary: designTokens.colors.gray[600],
    },
  },
  dark: {
    name: 'dark',
    colors: {
      primary: '#60a5fa', // Lighter blue for dark theme
      secondary: designTokens.colors.gray[400],
      success: '#34d399', // Lighter green
      warning: '#fbbf24', // Lighter orange
      error: '#f87171', // Lighter red
      info: '#22d3ee', // Lighter cyan
      background: designTokens.colors.gray[900],
      surface: designTokens.colors.gray[800],
      text: designTokens.colors.gray[100],
      textSecondary: designTokens.colors.gray[400],
    },
  },
};

export class ThemeManager {
  static getTheme(themeName: 'light' | 'dark' = 'light'): Theme {
    return themes[themeName];
  }

  static applyThemeToBlock(block: any, theme: Theme): any {
    // This would apply theme colors to Block Kit elements
    // For now, return the block as-is since Slack handles theming
    // In future, we could add custom color properties if Slack supports them
    return block;
  }

  static getStatusColor(status: keyof typeof designTokens.status, theme: Theme): string {
    // Return theme-appropriate colors for status indicators
    const statusColors = {
      success: theme.colors.success,
      warning: theme.colors.warning,
      error: theme.colors.error,
      info: theme.colors.info,
    };
    return statusColors[status];
  }
}