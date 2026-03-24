// Export options with progress tracking

export interface ExportJob {
  id: string;
  type: 'pdf' | 'csv' | 'xlsx' | 'json';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  filename: string;
  downloadUrl?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExportOptions {
  format: 'pdf' | 'csv' | 'xlsx' | 'json';
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, any>;
  includeCharts?: boolean;
  includeRawData?: boolean;
}

export class ExportManager {
  private static jobs = new Map<string, ExportJob>();

  static createExportOptions(dataType: string, availableFormats: string[] = ['pdf', 'csv', 'xlsx']): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📤 Export ${dataType}`,
        emoji: true,
      },
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Choose your preferred format to export ${dataType.toLowerCase()}. Files will be available for download once processing is complete.`,
      },
    });

    // Format selection buttons
    const formatButtons = availableFormats.map(format => ({
      type: 'button' as const,
      text: {
        type: 'plain_text',
        text: format.toUpperCase(),
        emoji: true,
      },
      action_id: `export_${dataType.toLowerCase()}_${format}`,
      value: JSON.stringify({
        dataType,
        format,
        timestamp: Date.now(),
      }),
    }));

    for (let i = 0; i < formatButtons.length; i += 5) {
      blocks.push({
        type: 'actions',
        elements: formatButtons.slice(i, i + 5),
      });
    }

    // Advanced options
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Advanced Options:*',
      },
    });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⚙️ Custom Settings',
            emoji: true,
          },
          action_id: `export_advanced_${dataType.toLowerCase()}`,
          style: 'secondary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 Preview',
            emoji: true,
          },
          action_id: `export_preview_${dataType.toLowerCase()}`,
          style: 'secondary',
        },
      ],
    });

    return blocks;
  }

  static createProgressView(job: ExportJob): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Export Progress`,
        emoji: true,
      },
    });

    // Progress bar
    const progressBar = this.createProgressBar(job.progress);
    const statusEmoji = this.getStatusEmoji(job.status);

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} *${job.filename}*\n${progressBar} ${job.progress}%\nStatus: ${job.status}`,
      },
    });

    // Download button for completed jobs
    if (job.status === 'completed' && job.downloadUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⬇️ Download File',
              emoji: true,
            },
            url: job.downloadUrl,
            style: 'primary',
          },
        ],
      });
    }

    // Error message for failed jobs
    if (job.status === 'failed' && job.error) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❌ *Export Failed*\n${job.error}`,
        },
      });
    }

    // Cancel button for pending/processing jobs
    if (job.status === 'pending' || job.status === 'processing') {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Cancel Export',
              emoji: true,
            },
            action_id: `cancel_export_${job.id}`,
            style: 'danger',
            confirm: {
              title: {
                type: 'plain_text',
                text: 'Cancel Export',
              },
              text: {
                type: 'mrkdwn',
                text: 'Are you sure you want to cancel this export? This action cannot be undone.',
              },
              confirm: {
                type: 'plain_text',
                text: 'Yes, Cancel',
              },
              deny: {
                type: 'plain_text',
                text: 'Keep Exporting',
              },
            },
          },
        ],
      });
    }

    return blocks;
  }

  static createExportHistory(jobs: ExportJob[]): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📚 Export History',
        emoji: true,
      },
    });

    if (jobs.length === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_No export history available_',
        },
      });
      return blocks;
    }

    // Show last 5 exports
    const recentJobs = jobs.slice(0, 5);

    recentJobs.forEach(job => {
      const statusEmoji = this.getStatusEmoji(job.status);
      const timeAgo = this.getTimeAgo(job.createdAt);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${job.filename}*\n${job.type.toUpperCase()} • ${timeAgo}`,
        },
        accessory: job.status === 'completed' && job.downloadUrl ? {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Download',
            emoji: true,
          },
          url: job.downloadUrl,
        } : undefined,
      });
    });

    // View all history button
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 View All Exports',
            emoji: true,
          },
          action_id: 'view_all_exports',
          style: 'secondary',
        },
      ],
    });

    return blocks;
  }

  static startExportJob(options: ExportOptions): ExportJob {
    const jobId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const filename = `sms-insights-export-${new Date().toISOString().split('T')[0]}.${options.format}`;

    const job: ExportJob = {
      id: jobId,
      type: options.format,
      status: 'pending',
      progress: 0,
      filename,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // Simulate progress (in real implementation, this would be handled by background job)
    this.simulateExportProgress(jobId);

    return job;
  }

  private static simulateExportProgress(jobId: string): void {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        this.completeExportJob(jobId);
      } else {
        this.updateExportProgress(jobId, progress);
      }
    }, 1000);
  }

  private static updateExportProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = Math.round(progress);
      job.status = progress < 100 ? 'processing' : 'completed';
    }
  }

  private static completeExportJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      job.downloadUrl = `https://example.com/download/${job.filename}`; // Mock URL
    }
  }

  private static createProgressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\``;
  }

  private static getStatusEmoji(status: string): string {
    const emojis = {
      pending: '⏳',
      processing: '🔄',
      completed: '✅',
      failed: '❌',
    };
    return emojis[status as keyof typeof emojis] || '❓';
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
}