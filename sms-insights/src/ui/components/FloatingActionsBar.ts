// Floating actions bar for quick access to common functions

export interface ActionItem {
  id: string;
  text: string;
  emoji: string;
  actionId: string;
  url?: string;
  style?: 'primary' | 'danger';
  confirm?: {
    title: string;
    text: string;
    confirm: string;
    deny: string;
  };
}

export class FloatingActionsBar {
  static create(actions: ActionItem[]): any {
    return {
      type: 'actions',
      elements: actions.map(action => ({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: `${action.emoji} ${action.text}`,
          emoji: true,
        },
        action_id: action.url ? undefined : action.actionId,
        url: action.url,
        style: action.style || 'primary',
        confirm: action.confirm,
      })),
    };
  }

  static createDefaultBar(): any {
    const defaultActions: ActionItem[] = [
      {
        id: 'dashboard',
        text: 'Dashboard',
        emoji: '📊',
        actionId: 'open_dashboard',
        url: process.env.DASHBOARD_URL,
      },
      {
        id: 'report',
        text: 'New Report',
        emoji: '📋',
        actionId: 'generate_report',
      },
      {
        id: 'scoreboard',
        text: 'Scoreboard',
        emoji: '🏆',
        actionId: 'view_scoreboard',
      },
      {
        id: 'ask',
        text: 'Ask AI',
        emoji: '🤖',
        actionId: 'ask_ai',
      },
      {
        id: 'settings',
        text: 'Settings',
        emoji: '⚙️',
        actionId: 'open_settings',
      },
    ];

    return this.create(defaultActions);
  }

  static createCompactBar(): any {
    const compactActions: ActionItem[] = [
      {
        id: 'dashboard',
        text: '',
        emoji: '📊',
        actionId: 'open_dashboard',
        url: process.env.DASHBOARD_URL,
      },
      {
        id: 'report',
        text: '',
        emoji: '📋',
        actionId: 'generate_report',
      },
      {
        id: 'ask',
        text: '',
        emoji: '🤖',
        actionId: 'ask_ai',
      },
    ];

    return this.create(compactActions);
  }
}