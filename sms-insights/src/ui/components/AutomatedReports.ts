// User-configurable automated report delivery

export interface ReportSchedule {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string; // HH:MM format
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  timezone: string;
  format: 'pdf' | 'csv' | 'xlsx' | 'json';
  recipients: string[]; // email addresses or Slack user IDs
  channels: string[]; // Slack channel IDs
  filters?: Record<string, any>;
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdBy: string;
  createdAt: Date;
}

export class AutomatedReports {
  static createScheduleManager(currentSchedules: ReportSchedule[] = []): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⏰ Automated Reports',
        emoji: true,
      },
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Set up automatic report delivery to stay updated without manual checks. Reports will be sent to your configured channels and recipients.',
      },
    });

    // Current schedules
    if (currentSchedules.length > 0) {
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📅 Active Schedules',
          emoji: true,
        },
      });

      currentSchedules.slice(0, 3).forEach(schedule => {
        const statusEmoji = schedule.isActive ? '🟢' : '🔴';
        const nextRunText = schedule.nextRun
          ? `Next: ${schedule.nextRun.toLocaleDateString()} ${schedule.time}`
          : 'Not scheduled';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *${schedule.name}*\n${schedule.description}\n_${schedule.frequency} at ${schedule.time} (${schedule.timezone})_`,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: schedule.isActive ? 'Pause' : 'Resume',
              emoji: true,
            },
            action_id: `toggle_schedule_${schedule.id}`,
            style: schedule.isActive ? 'secondary' : 'primary',
          },
        });
      });

      if (currentSchedules.length > 3) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*And ${currentSchedules.length - 3} more schedules...*`,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View All',
              emoji: true,
            },
            action_id: 'view_all_schedules',
          },
        });
      }
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_No automated reports scheduled yet. Create your first schedule below._',
        },
      });
    }

    // Quick setup options
    blocks.push(
      { type: 'divider' },
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚡ Quick Setup',
          emoji: true,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📊 Daily Summary',
              emoji: true,
            },
            action_id: 'create_daily_summary',
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📈 Weekly Report',
              emoji: true,
            },
            action_id: 'create_weekly_report',
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📋 Monthly Overview',
              emoji: true,
            },
            action_id: 'create_monthly_overview',
            style: 'primary',
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⚙️ Custom Schedule',
              emoji: true,
            },
            action_id: 'create_custom_schedule',
            style: 'secondary',
          },
        ],
      }
    );

    return blocks;
  }

  static createScheduleWizard(step: number, data: Partial<ReportSchedule> = {}): any {
    const steps = [
      'Choose Report Type',
      'Set Frequency & Time',
      'Configure Delivery',
      'Review & Save'
    ];

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `⏰ Create Schedule - Step ${step} of ${steps.length}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${steps[step - 1]}*\n${this.getStepDescription(step)}`,
        },
      },
    ];

    // Step-specific content
    switch (step) {
      case 1:
        blocks.push(
          {
            type: 'input',
            block_id: 'schedule_name',
            label: {
              type: 'plain_text',
              text: 'Schedule Name',
              emoji: true,
            },
            element: {
              type: 'plain_text_input',
              action_id: 'schedule_name_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g., Daily Performance Summary',
                emoji: true,
              },
              initial_value: data.name || '',
            },
          },
          {
            type: 'input',
            block_id: 'report_type',
            label: {
              type: 'plain_text',
              text: 'Report Type',
              emoji: true,
            },
            element: {
              type: 'static_select',
              action_id: 'report_type_select',
              placeholder: {
                type: 'plain_text',
                text: 'Choose report type',
                emoji: true,
              },
              options: [
                { text: { type: 'plain_text', text: '📊 Performance Summary', emoji: true }, value: 'performance' },
                { text: { type: 'plain_text', text: '👥 Team Activity', emoji: true }, value: 'team_activity' },
                { text: { type: 'plain_text', text: '💬 Conversation Analytics', emoji: true }, value: 'conversations' },
                { text: { type: 'plain_text', text: '🎯 Goal Tracking', emoji: true }, value: 'goals' },
                { text: { type: 'plain_text', text: '📈 Trend Analysis', emoji: true }, value: 'trends' },
              ],
            },
          }
        );
        break;

      case 2:
        blocks.push(
          {
            type: 'input',
            block_id: 'schedule_frequency',
            label: {
              type: 'plain_text',
              text: 'Frequency',
              emoji: true,
            },
            element: {
              type: 'static_select',
              action_id: 'frequency_select',
              initial_option: {
                text: { type: 'plain_text', text: '📅 Daily', emoji: true },
                value: 'daily',
              },
              options: [
                { text: { type: 'plain_text', text: '📅 Daily', emoji: true }, value: 'daily' },
                { text: { type: 'plain_text', text: '📆 Weekly', emoji: true }, value: 'weekly' },
                { text: { type: 'plain_text', text: '📊 Monthly', emoji: true }, value: 'monthly' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'schedule_time',
            label: {
              type: 'plain_text',
              text: 'Time (CT)',
              emoji: true,
            },
            element: {
              type: 'timepicker',
              action_id: 'time_select',
              initial_time: data.time || '06:00',
              timezone: 'America/Chicago',
            },
          }
        );
        break;

      case 3:
        blocks.push(
          {
            type: 'input',
            block_id: 'delivery_format',
            label: {
              type: 'plain_text',
              text: 'Format',
              emoji: true,
            },
            element: {
              type: 'static_select',
              action_id: 'format_select',
              initial_option: {
                text: { type: 'plain_text', text: '📄 PDF', emoji: true },
                value: 'pdf',
              },
              options: [
                { text: { type: 'plain_text', text: '📄 PDF', emoji: true }, value: 'pdf' },
                { text: { type: 'plain_text', text: '📊 Excel', emoji: true }, value: 'xlsx' },
                { text: { type: 'plain_text', text: '📋 CSV', emoji: true }, value: 'csv' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'delivery_channels',
            label: {
              type: 'plain_text',
              text: 'Slack Channels',
              emoji: true,
            },
            element: {
              type: 'multi_channels_select',
              action_id: 'channels_select',
              placeholder: {
                type: 'plain_text',
                text: 'Select channels to post reports',
                emoji: true,
              },
            },
          }
        );
        break;

      case 4:
        // Review step
        const schedule = data as ReportSchedule;
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${schedule.name}*\n${schedule.description}\n\n📅 *${schedule.frequency}* at *${schedule.time} CT*\n📄 Format: *${schedule.format.toUpperCase()}*\n📢 Channels: ${schedule.channels?.length || 0} selected`,
          },
        });
        break;
    }

    // Navigation buttons
    const navButtons = [];
    if (step > 1) {
      navButtons.push({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: '⬅️ Back',
          emoji: true,
        },
        action_id: `schedule_step_${step - 1}`,
        style: 'secondary',
      });
    }

    if (step < steps.length) {
      navButtons.push({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: 'Next ➡️',
          emoji: true,
        },
        action_id: `schedule_step_${step + 1}`,
        style: 'primary',
      });
    } else {
      navButtons.push({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: '✅ Create Schedule',
          emoji: true,
        },
        action_id: 'create_schedule',
        style: 'primary',
      });
    }

    blocks.push({
      type: 'actions',
      elements: navButtons,
    });

    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '⏰ Schedule Report',
        emoji: true,
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true,
      },
      blocks,
    };
  }

  private static getStepDescription(step: number): string {
    const descriptions = [
      'Choose what type of report you want to automate.',
      'Set how often and when the report should be generated.',
      'Configure where and how the report should be delivered.',
      'Review your settings and create the automated schedule.',
    ];
    return descriptions[step - 1] || '';
  }

  static createQuickSchedule(type: 'daily' | 'weekly' | 'monthly'): ReportSchedule {
    const baseSchedule = {
      id: `quick_${type}_${Date.now()}`,
      time: '06:00',
      timezone: 'America/Chicago',
      format: 'pdf' as const,
      recipients: [],
      channels: [],
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
    };

    switch (type) {
      case 'daily':
        return {
          ...baseSchedule,
          name: 'Daily Performance Summary',
          description: 'Daily overview of SMS performance metrics',
          frequency: 'daily',
        };

      case 'weekly':
        return {
          ...baseSchedule,
          name: 'Weekly Team Report',
          description: 'Weekly summary of team performance and goals',
          frequency: 'weekly',
          dayOfWeek: 1, // Monday
        };

      case 'monthly':
        return {
          ...baseSchedule,
          name: 'Monthly Overview',
          description: 'Monthly comprehensive performance analysis',
          frequency: 'monthly',
          dayOfMonth: 1,
        };
    }
  }
}