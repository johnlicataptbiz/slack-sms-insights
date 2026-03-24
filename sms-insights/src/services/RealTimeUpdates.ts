// Real-time dashboard updates and live monitoring

export interface LiveMetric {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  trend: 'up' | 'down' | 'stable';
  threshold?: {
    warning: number;
    critical: number;
  };
  lastUpdated: Date;
  updateFrequency: number; // seconds
}

export interface NotificationRule {
  id: string;
  metricId: string;
  condition: 'above' | 'below' | 'equals' | 'changes';
  threshold: number;
  message: string;
  channels: string[];
  enabled: boolean;
}

export class RealTimeUpdates {
  private static metrics = new Map<string, LiveMetric>();
  private static notificationRules = new Map<string, NotificationRule>();
  private static updateIntervals = new Map<string, NodeJS.Timeout>();
  private static subscribers = new Set<(metric: LiveMetric) => void>();

  static initializeMetrics(): void {
    // Initialize default metrics
    const defaultMetrics: LiveMetric[] = [
      {
        id: 'active_conversations',
        name: 'Active Conversations',
        value: 0,
        trend: 'stable',
        threshold: { warning: 50, critical: 100 },
        lastUpdated: new Date(),
        updateFrequency: 30, // 30 seconds
      },
      {
        id: 'response_time',
        name: 'Avg Response Time',
        value: 0,
        trend: 'stable',
        threshold: { warning: 300, critical: 600 }, // seconds
        lastUpdated: new Date(),
        updateFrequency: 60, // 1 minute
      },
      {
        id: 'conversion_rate',
        name: 'Conversion Rate',
        value: 0,
        trend: 'stable',
        threshold: { warning: 5, critical: 2 }, // percentage
        lastUpdated: new Date(),
        updateFrequency: 300, // 5 minutes
      },
      {
        id: 'daily_messages',
        name: 'Messages Today',
        value: 0,
        trend: 'up',
        lastUpdated: new Date(),
        updateFrequency: 60, // 1 minute
      },
    ];

    defaultMetrics.forEach(metric => {
      this.metrics.set(metric.id, metric);
      this.startMetricUpdates(metric.id);
    });
  }

  static subscribeToUpdates(callback: (metric: LiveMetric) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  static getLiveMetrics(): LiveMetric[] {
    return Array.from(this.metrics.values());
  }

  static getMetric(id: string): LiveMetric | undefined {
    return this.metrics.get(id);
  }

  static updateMetric(id: string, newValue: number): void {
    const metric = this.metrics.get(id);
    if (!metric) return;

    const previousValue = metric.value;
    metric.previousValue = previousValue;
    metric.value = newValue;
    metric.lastUpdated = new Date();

    // Calculate trend
    if (newValue > previousValue) {
      metric.trend = 'up';
    } else if (newValue < previousValue) {
      metric.trend = 'down';
    } else {
      metric.trend = 'stable';
    }

    // Check notification rules
    this.checkNotificationRules(metric);

    // Notify subscribers
    this.subscribers.forEach(callback => callback(metric));
  }

  static addNotificationRule(rule: NotificationRule): void {
    this.notificationRules.set(rule.id, rule);
  }

  static removeNotificationRule(ruleId: string): void {
    this.notificationRules.delete(ruleId);
  }

  static getNotificationRules(): NotificationRule[] {
    return Array.from(this.notificationRules.values());
  }

  private static startMetricUpdates(metricId: string): void {
    const metric = this.metrics.get(metricId);
    if (!metric) return;

    const interval = setInterval(() => {
      // Simulate real-time data updates
      this.simulateMetricUpdate(metricId);
    }, metric.updateFrequency * 1000);

    this.updateIntervals.set(metricId, interval);
  }

  private static simulateMetricUpdate(metricId: string): void {
    const metric = this.metrics.get(metricId);
    if (!metric) return;

    // Simulate realistic data changes
    let newValue: number;
    const change = (Math.random() - 0.5) * 0.2; // ±10% change

    switch (metricId) {
      case 'active_conversations':
        newValue = Math.max(0, Math.round(metric.value * (1 + change)));
        break;
      case 'response_time':
        newValue = Math.max(0, metric.value * (1 + change));
        break;
      case 'conversion_rate':
        newValue = Math.max(0, Math.min(100, metric.value * (1 + change)));
        break;
      case 'daily_messages':
        newValue = metric.value + Math.floor(Math.random() * 10);
        break;
      default:
        newValue = metric.value * (1 + change);
    }

    this.updateMetric(metricId, Math.round(newValue * 100) / 100);
  }

  private static checkNotificationRules(metric: LiveMetric): void {
    this.notificationRules.forEach(rule => {
      if (!rule.enabled || rule.metricId !== metric.id) return;

      let shouldNotify = false;

      switch (rule.condition) {
        case 'above':
          shouldNotify = metric.value > rule.threshold;
          break;
        case 'below':
          shouldNotify = metric.value < rule.threshold;
          break;
        case 'equals':
          shouldNotify = Math.abs(metric.value - rule.threshold) < 0.01;
          break;
        case 'changes':
          shouldNotify = metric.previousValue !== undefined &&
                         Math.abs(metric.value - metric.previousValue) >= rule.threshold;
          break;
      }

      if (shouldNotify) {
        this.sendNotification(rule, metric);
      }
    });
  }

  private static sendNotification(rule: NotificationRule, metric: LiveMetric): void {
    // In a real implementation, this would send notifications to Slack channels
    console.log(`🚨 Notification: ${rule.message}`, {
      metric: metric.name,
      value: metric.value,
      channels: rule.channels,
    });

    // For now, we'll simulate notification delivery
    // In production, this would integrate with Slack's chat.postMessage API
  }

  static createLiveDashboard(): any[] {
    const metrics = this.getLiveMetrics();
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Live Dashboard',
        emoji: true,
      },
    });

    // Live metrics grid
    const metricFields = metrics.flatMap(metric => {
      const statusEmoji = this.getMetricStatusEmoji(metric);
      const trendEmoji = { up: '📈', down: '📉', stable: '➡️' }[metric.trend];
      const lastUpdate = this.getTimeAgo(metric.lastUpdated);

      return {
        type: 'mrkdwn',
        text: `${statusEmoji} *${metric.name}*\n${metric.value}${this.getMetricUnit(metric.id)}\n${trendEmoji} Updated ${lastUpdate}`,
      };
    });

    blocks.push({
      type: 'section',
      fields: metricFields.slice(0, 10),
    });

    // Control buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh Now',
            emoji: true,
          },
          action_id: 'refresh_live_dashboard',
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⚙️ Configure Alerts',
            emoji: true,
          },
          action_id: 'configure_alerts',
          style: 'secondary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 View Trends',
            emoji: true,
          },
          action_id: 'view_trends',
          style: 'secondary',
        },
      ],
    });

    return blocks;
  }

  private static getMetricStatusEmoji(metric: LiveMetric): string {
    if (!metric.threshold) return '📊';

    if (metric.value >= metric.threshold.critical) return '🔴';
    if (metric.value >= metric.threshold.warning) return '🟡';
    return '🟢';
  }

  private static getMetricUnit(metricId: string): string {
    const units = {
      response_time: 's',
      conversion_rate: '%',
      active_conversations: '',
      daily_messages: '',
    };
    return units[metricId as keyof typeof units] || '';
  }

  private static getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  }

  static cleanup(): void {
    // Clear all update intervals
    this.updateIntervals.forEach(interval => clearInterval(interval));
    this.updateIntervals.clear();
    this.subscribers.clear();
  }
}