import { PrismaClient } from '@prisma/client';

export interface UserUIState {
  userId: string;
  theme: 'light' | 'dark';
  expandedSections: string[];
  quickActions: string[];
  lastActivity: Date;
  preferences: Record<string, any>;
}

export class UIStateManager {
  constructor(private prisma: PrismaClient) {}

  async getUserState(userId: string): Promise<UserUIState> {
    const state = await this.prisma.uiState.findUnique({
      where: { userId },
    });

    if (!state) {
      // Return default state
      return {
        userId,
        theme: 'light',
        expandedSections: ['quick-actions', 'recent-reports'],
        quickActions: ['dashboard', 'scoreboard', 'ask'],
        lastActivity: new Date(),
        preferences: {},
      };
    }

    return {
      userId: state.userId,
      theme: state.theme as 'light' | 'dark',
      expandedSections: state.expandedSections as string[],
      quickActions: state.quickActions as string[],
      lastActivity: state.lastActivity,
      preferences: state.preferences as Record<string, any>,
    };
  }

  async updateUserState(userId: string, updates: Partial<Omit<UserUIState, 'userId'>>): Promise<UserUIState> {
    const existingState = await this.getUserState(userId);

    const updatedState = {
      ...existingState,
      ...updates,
      lastActivity: new Date(),
    };

    const result = await this.prisma.uiState.upsert({
      where: { userId },
      update: {
        theme: updatedState.theme,
        expandedSections: updatedState.expandedSections,
        quickActions: updatedState.quickActions,
        lastActivity: updatedState.lastActivity,
        preferences: updatedState.preferences,
      },
      create: {
        userId: updatedState.userId,
        theme: updatedState.theme,
        expandedSections: updatedState.expandedSections,
        quickActions: updatedState.quickActions,
        lastActivity: updatedState.lastActivity,
        preferences: updatedState.preferences,
      },
    });

    return {
      userId: result.userId,
      theme: result.theme as 'light' | 'dark',
      expandedSections: result.expandedSections as string[],
      quickActions: result.quickActions as string[],
      lastActivity: result.lastActivity,
      preferences: result.preferences as Record<string, any>,
    };
  }

  async toggleSectionExpansion(userId: string, sectionId: string): Promise<UserUIState> {
    const state = await this.getUserState(userId);
    const expandedSections = state.expandedSections.includes(sectionId)
      ? state.expandedSections.filter(id => id !== sectionId)
      : [...state.expandedSections, sectionId];

    return this.updateUserState(userId, { expandedSections });
  }

  async setTheme(userId: string, theme: 'light' | 'dark'): Promise<UserUIState> {
    return this.updateUserState(userId, { theme });
  }

  async updateQuickActions(userId: string, quickActions: string[]): Promise<UserUIState> {
    return this.updateUserState(userId, { quickActions });
  }

  async setPreference(userId: string, key: string, value: any): Promise<UserUIState> {
    const state = await this.getUserState(userId);
    const preferences = { ...state.preferences, [key]: value };
    return this.updateUserState(userId, { preferences });
  }

  async getPreference(userId: string, key: string): Promise<any> {
    const state = await this.getUserState(userId);
    return state.preferences[key];
  }
}

// Singleton instance
export const uiStateManager = new UIStateManager();