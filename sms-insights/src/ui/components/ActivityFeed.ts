// Live activity feed component for recent reports and system activities

export interface ActivityItem {
  id: string;
  type: 'report' | 'alert' | 'system' | 'user';
  title: string;
  description: string;
  timestamp: Date;
  status?: 'success' | 'warning' | 'error' | 'info';
  user?: string;
  actionId?: string;
  metadata?: Record<string, any>;
}

export class ActivityFeed {
  static createFeed(items: ActivityItem[], maxItems: number = 5): any[] {
    if (items.length === 0) {
      return [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_No recent activity_',
        },
      }];
    }

    const recentItems = items.slice(0, maxItems);
    const blocks = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔴 Live Activity Feed',
        emoji: true,
      },
    });

    // Activity items
    for (const item of recentItems) {
      blocks.push(this.createActivityItem(item));
    }

    // Footer with refresh option
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${recentItems.length} recent activities* · Last updated: ${new Date().toLocaleTimeString()}`,
        },
      ],
    });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh Feed',
            emoji: true,
          },
          action_id: 'refresh_activity_feed',
          style: 'primary',
        },
      ],
    });

    return blocks;
  }

  private static createActivityItem(item: ActivityItem): any {
    const emoji = this.getActivityEmoji(item.type, item.status);
    const timeAgo = this.getTimeAgo(item.timestamp);
    const statusIndicator = item.status ? this.getStatusEmoji(item.status) : '';

    let text = `${emoji} ${statusIndicator} *${item.title}*\n${item.description}\n_${timeAgo}`;

    if (item.user) {
      text += ` by ${item.user}`;
    }

    const block: any = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text,
      },
    };

    // Add action button if specified
    if (item.actionId) {
      block.accessory = {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View',
          emoji: true,
        },
        action_id: item.actionId,
        value: JSON.stringify({ activityId: item.id }),
      };
    }

    return block;
  }

  private static getActivityEmoji(type: ActivityItem['type'], status?: string): string {
    const baseEmojis = {
      report: '📊',
      alert: '🚨',
      system: '⚙️',
      user: '👤',
    };

    return baseEmojis[type] || '📝';
  }

  private static getStatusEmoji(status: string): string {
    const statusEmojis = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
    };

    return statusEmojis[status as keyof typeof statusEmojis] || '';
  }

  private static getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  static createMockActivities(): ActivityItem[] {
    return [
      {
        id: '1',
        type: 'report',
        title: 'Daily Report Generated',
        description: 'SMS performance report for today completed successfully',
        timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        status: 'success',
        user: 'System',
        actionId: 'view_report_today',
      },
      {
        id: '2',
        type: 'alert',
        title: 'High Conversion Rate',
        description: 'Conversion rate exceeded 15% threshold',
        timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
        status: 'success',
        user: 'Analytics',
      },
      {
        id: '3',
        type: 'user',
        title: 'New User Registered',
        description: 'Sarah Johnson joined the team',
        timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        status: 'info',
        user: 'Admin',
      },
      {
        id: '4',
        type: 'system',
        title: 'Database Backup',
        description: 'Automated backup completed successfully',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        status: 'success',
        user: 'System',
      },
    ];
  }
}