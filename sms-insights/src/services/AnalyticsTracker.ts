// Analytics integration for usage tracking

export interface AnalyticsEvent {
  id: string;
  type: string;
  userId: string;
  timestamp: Date;
  properties: Record<string, any>;
  sessionId?: string;
  deviceInfo?: Record<string, any>;
}

export class AnalyticsTracker {
  private static events: AnalyticsEvent[] = [];
  private static sessionId: string = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  private static flushInterval: NodeJS.Timeout | null = null;
  private static readonly BATCH_SIZE = 50;
  private static readonly FLUSH_INTERVAL = 30 * 1000; // 30 seconds

  static initialize(): void {
    // Set up flush interval
    this.flushInterval = setInterval(() => this.flushEvents(), this.FLUSH_INTERVAL);

    // Track startup event
    this.track('app_startup', { version: process.env.APP_VERSION || 'unknown' });
  }

  static track(eventType: string, properties: Record<string, any> = {}): void {
    const event: AnalyticsEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      userId: this.getCurrentUserId(), // Assume method to get current user
      timestamp: new Date(),
      properties,
      sessionId: this.sessionId,
      deviceInfo: this.getDeviceInfo(),
    };

    this.events.push(event);

    if (this.events.length >= this.BATCH_SIZE) {
      this.flushEvents();
    }
  }

  private static flushEvents(): void {
    if (this.events.length === 0) return;

    const batch = this.events.splice(0, this.events.length);

    // In production, send to analytics service (e.g., Mixpanel, Amplitude, or custom backend)
    console.log(`[Analytics] Flushing ${batch.length} events:`, batch);

    // Simulate sending
    // await fetch('/api/analytics', {
    //   method: 'POST',
    //   body: JSON.stringify(batch),
    //   headers: { 'Content-Type': 'application/json' },
    // });
  }

  static trackPageView(page: string): void {
    this.track('page_view', { page });
  }

  static trackAction(action: string, details: Record<string, any> = {}): void {
    this.track('user_action', { action, ...details });
  }

  static trackError(error: Error, context: Record<string, any> = {}): void {
    this.track('error', {
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  private static getCurrentUserId(): string {
    // In real implementation, get from auth context
    return 'U123456';
  }

  private static getDeviceInfo(): Record<string, any> {
    // In Slack context, limited info available
    return {
      platform: 'slack',
      deviceType: 'desktop', // Assume default
      screenSize: 'large',
    };
  }

  static createAnalyticsDashboard(): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Usage Analytics',
        emoji: true,
      },
    });

    // Summary metrics
    const totalEvents = this.events.length;
    const uniqueUsers = new Set(this.events.map(e => e.userId)).size;
    const sessionDuration = (Date.now() - parseInt(this.sessionId.split('_')[1])) / 1000 / 60;

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Events:* ${totalEvents}`,
        },
        {
          type: 'mrkdwn',
          text: `*Unique Users:* ${uniqueUsers}`,
        },
        {
          type: 'mrkdwn',
          text: `*Session Duration:* ${sessionDuration.toFixed(1)} min`,
        },
      ],
    });

    // Top events
    const eventCounts = this.events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topEvents = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Top Events:*',
      },
    });

    topEvents.forEach(([type, count]) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${type}: ${count}`,
        },
      });
    });

    return blocks;
  }

  static cleanup(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.events = [];
  }
}

// Initialize analytics on app start
AnalyticsTracker.initialize();

// Cleanup on shutdown
process.on('SIGTERM', () => {
  AnalyticsTracker.flushEvents();
  AnalyticsTracker.cleanup();
});