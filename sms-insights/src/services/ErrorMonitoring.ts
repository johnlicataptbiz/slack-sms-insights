// Comprehensive error monitoring and logging

export interface ErrorEvent {
  id: string;
  type: 'ui_error' | 'api_error' | 'system_error' | 'network_error';
  message: string;
  stack?: string;
  context: Record<string, any>;
  userId?: string;
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolved: boolean;
  resolutionNotes?: string;
}

export class ErrorMonitoring {
  private static errors = new Map<string, ErrorEvent>();
  private static subscribers = new Set<(error: ErrorEvent) => void>();
  private static readonly MAX_ERRORS = 1000;

  static reportError(event: Omit<ErrorEvent, 'id' | 'timestamp' | 'resolved'>): string {
    const id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const errorEvent: ErrorEvent = {
      ...event,
      id,
      timestamp: new Date(),
      resolved: false,
    };

    if (this.errors.size >= this.MAX_ERRORS) {
      // Remove oldest error
      const oldestKey = Array.from(this.errors.keys())[0];
      this.errors.delete(oldestKey);
    }

    this.errors.set(id, errorEvent);

    // Notify subscribers
    this.subscribers.forEach(callback => callback(errorEvent));

    // Log to console (in production, send to monitoring service)
    console.error(`[Error] ${errorEvent.type}: ${errorEvent.message}`, {
      severity: errorEvent.severity,
      context: errorEvent.context,
    });

    return id;
  }

  static subscribeToErrors(callback: (error: ErrorEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  static getErrors(filter?: { severity?: ErrorEvent['severity']; resolved?: boolean; type?: ErrorEvent['type'] }): ErrorEvent[] {
    let filtered = Array.from(this.errors.values());

    if (filter) {
      if (filter.severity) filtered = filtered.filter(e => e.severity === filter.severity);
      if (filter.resolved !== undefined) filtered = filtered.filter(e => e.resolved === filter.resolved);
      if (filter.type) filtered = filtered.filter(e => e.type === filter.type);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  static resolveError(id: string, notes?: string): boolean {
    const error = this.errors.get(id);
    if (!error) return false;

    error.resolved = true;
    error.resolutionNotes = notes;

    // Notify subscribers of resolution
    this.subscribers.forEach(callback => callback(error));

    return true;
  }

  static createErrorDashboard(): any[] {
    const errors = this.getErrors({ resolved: false });
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Error Dashboard',
        emoji: true,
      },
    });

    // Summary
    const criticalCount = errors.filter(e => e.severity === 'critical').length;
    const highCount = errors.filter(e => e.severity === 'high').length;

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Critical Errors:* ${criticalCount}`,
        },
        {
          type: 'mrkdwn',
          text: `*High Priority:* ${highCount}`,
        },
        {
          type: 'mrkdwn',
          text: `*Total Unresolved:* ${errors.length}`,
        },
      ],
    });

    // Recent errors list
    if (errors.length > 0) {
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Recent Unresolved Errors',
          emoji: true,
        },
      });

      errors.slice(0, 5).forEach(error => {
        const severityEmoji = this.getSeverityEmoji(error.severity);
        const timeAgo = this.getTimeAgo(error.timestamp);

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${severityEmoji} *${error.type.toUpperCase()}* - ${error.message}\n_${timeAgo}_`,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Resolve',
              emoji: true,
            },
            action_id: `resolve_error_${error.id}`,
            style: 'primary',
          },
        });
      });
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ No unresolved errors',
        },
      });
    }

    // Actions
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh',
            emoji: true,
          },
          action_id: 'refresh_error_dashboard',
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 View All',
            emoji: true,
          },
          action_id: 'view_all_errors',
          style: 'secondary',
        },
      ],
    });

    return blocks;
  }

  private static getSeverityEmoji(severity: ErrorEvent['severity']): string {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    };
    return emojis[severity] || '❓';
  }

  private static getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  static createErrorResolutionModal(errorId: string): any {
    const error = this.errors.get(errorId);
    if (!error) return null;

    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: 'Resolve Error',
        emoji: true,
      },
      submit: {
        type: 'plain_text',
        text: 'Resolve',
        emoji: true,
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true,
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error Details:*\n${error.message}\n\n*Type:* ${error.type}\n*Severity:* ${error.severity}\n*Occurred:* ${this.getTimeAgo(error.timestamp)}`,
          },
        },
        {
          type: 'input',
          block_id: 'resolution_notes',
          label: {
            type: 'plain_text',
            text: 'Resolution Notes',
            emoji: true,
          },
          element: {
            type: 'plain_text_input',
            action_id: 'resolution_notes_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Describe how this error was resolved...',
              emoji: true,
            },
          },
          optional: true,
        },
      ],
      private_metadata: JSON.stringify({ errorId }),
    };
  }

  static resolveFromModal(payload: any): boolean {
    const { errorId } = JSON.parse(payload.private_metadata);
    const notes = payload.view.state.values.resolution_notes.resolution_notes_input.value;

    return this.resolveError(errorId, notes);
  }
}