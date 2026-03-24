// Configuration modals for user preferences

export interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: {
    email: boolean;
    slack: boolean;
    reportAlerts: boolean;
    systemAlerts: boolean;
  };
  dashboard: {
    autoRefresh: boolean;
    refreshInterval: number; // minutes
    defaultView: 'summary' | 'detailed' | 'compact';
    showActivityFeed: boolean;
  };
  reports: {
    autoExport: boolean;
    defaultFormat: 'pdf' | 'csv' | 'xlsx';
    includeCharts: boolean;
    schedule: string[]; // cron expressions
  };
  privacy: {
    dataRetention: number; // days
    shareAnalytics: boolean;
    allowPersonalization: boolean;
  };
}

export class ConfigurationModal {
  static createSettingsModal(currentPrefs: Partial<UserPreferences>): any {
    const defaultPrefs: UserPreferences = {
      theme: 'light',
      notifications: {
        email: true,
        slack: true,
        reportAlerts: true,
        systemAlerts: false,
      },
      dashboard: {
        autoRefresh: true,
        refreshInterval: 5,
        defaultView: 'summary',
        showActivityFeed: true,
      },
      reports: {
        autoExport: false,
        defaultFormat: 'pdf',
        includeCharts: true,
        schedule: [],
      },
      privacy: {
        dataRetention: 90,
        shareAnalytics: false,
        allowPersonalization: true,
      },
    };

    const prefs = { ...defaultPrefs, ...currentPrefs };

    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '⚙️ Settings',
        emoji: true,
      },
      submit: {
        type: 'plain_text',
        text: 'Save Changes',
        emoji: true,
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true,
      },
      blocks: [
        // Theme Settings
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎨 Appearance',
            emoji: true,
          },
        },
        {
          type: 'input',
          block_id: 'theme_setting',
          label: {
            type: 'plain_text',
            text: 'Theme',
            emoji: true,
          },
          element: {
            type: 'static_select',
            action_id: 'theme_select',
            initial_option: {
              text: {
                type: 'plain_text',
                text: prefs.theme === 'dark' ? '🌙 Dark' : '☀️ Light',
                emoji: true,
              },
              value: prefs.theme,
            },
            options: [
              {
                text: {
                  type: 'plain_text',
                  text: '☀️ Light',
                  emoji: true,
                },
                value: 'light',
              },
              {
                text: {
                  type: 'plain_text',
                  text: '🌙 Dark',
                  emoji: true,
                },
                value: 'dark',
              },
            ],
          },
        },

        { type: 'divider' },

        // Notification Settings
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔔 Notifications',
            emoji: true,
          },
        },
        {
          type: 'input',
          block_id: 'notifications_email',
          label: {
            type: 'plain_text',
            text: 'Email Notifications',
            emoji: true,
          },
          element: {
            type: 'checkboxes',
            action_id: 'email_notifications',
            initial_options: prefs.notifications.email ? [{
              text: {
                type: 'plain_text',
                text: 'Receive email notifications for reports and alerts',
                emoji: true,
              },
              value: 'email_enabled',
            }] : [],
            options: [{
              text: {
                type: 'plain_text',
                text: 'Receive email notifications for reports and alerts',
                emoji: true,
              },
              value: 'email_enabled',
            }],
          },
        },

        { type: 'divider' },

        // Dashboard Settings
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 Dashboard',
            emoji: true,
          },
        },
        {
          type: 'input',
          block_id: 'dashboard_refresh',
          label: {
            type: 'plain_text',
            text: 'Auto-refresh Settings',
            emoji: true,
          },
          element: {
            type: 'static_select',
            action_id: 'refresh_interval',
            initial_option: {
              text: {
                type: 'plain_text',
                text: `${prefs.dashboard.refreshInterval} minutes`,
                emoji: true,
              },
              value: prefs.dashboard.refreshInterval.toString(),
            },
            options: [
              { text: { type: 'plain_text', text: '1 minute', emoji: true }, value: '1' },
              { text: { type: 'plain_text', text: '5 minutes', emoji: true }, value: '5' },
              { text: { type: 'plain_text', text: '15 minutes', emoji: true }, value: '15' },
              { text: { type: 'plain_text', text: '30 minutes', emoji: true }, value: '30' },
              { text: { type: 'plain_text', text: 'Never', emoji: true }, value: '0' },
            ],
          },
        },

        { type: 'divider' },

        // Privacy Settings
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔒 Privacy',
            emoji: true,
          },
        },
        {
          type: 'input',
          block_id: 'privacy_settings',
          label: {
            type: 'plain_text',
            text: 'Data & Privacy',
            emoji: true,
          },
          element: {
            type: 'checkboxes',
            action_id: 'privacy_options',
            initial_options: [
              ...(prefs.privacy.allowPersonalization ? [{
                text: { type: 'plain_text', text: 'Allow personalized dashboard recommendations', emoji: true },
                value: 'personalization_enabled',
              }] : []),
              ...(prefs.privacy.shareAnalytics ? [{
                text: { type: 'plain_text', text: 'Share anonymous usage analytics', emoji: true },
                value: 'analytics_enabled',
              }] : []),
            ],
            options: [
              {
                text: { type: 'plain_text', text: 'Allow personalized dashboard recommendations', emoji: true },
                value: 'personalization_enabled',
              },
              {
                text: { type: 'plain_text', text: 'Share anonymous usage analytics', emoji: true },
                value: 'analytics_enabled',
              },
            ],
          },
        },
      ],
    };
  }

  static createReportScheduleModal(currentSchedule: string[] = []): any {
    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '📅 Schedule Reports',
        emoji: true,
      },
      submit: {
        type: 'plain_text',
        text: 'Save Schedule',
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
            text: 'Set up automated report delivery. Reports will be sent to your configured notification channels.',
          },
        },
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
            placeholder: {
              type: 'plain_text',
              text: 'Choose frequency',
              emoji: true,
            },
            options: [
              { text: { type: 'plain_text', text: 'Daily (6:00 AM CT)', emoji: true }, value: 'daily' },
              { text: { type: 'plain_text', text: 'Weekly (Monday 6:00 AM CT)', emoji: true }, value: 'weekly' },
              { text: { type: 'plain_text', text: 'Monthly (1st of month)', emoji: true }, value: 'monthly' },
            ],
          },
        },
        {
          type: 'input',
          block_id: 'schedule_format',
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
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '➕ Add Custom Schedule',
                emoji: true,
              },
              action_id: 'add_custom_schedule',
              style: 'secondary',
            },
          ],
        },
      ],
    };
  }

  static createFilterModal(availableFilters: Array<{ id: string; label: string; type: 'select' | 'multiselect' | 'date' | 'text'; options?: Array<{ label: string; value: string }> }>): any {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔍 Advanced Filters',
          emoji: true,
        },
      },
    ];

    availableFilters.forEach(filter => {
      let element;

      switch (filter.type) {
        case 'select':
          element = {
            type: 'static_select',
            action_id: `filter_${filter.id}`,
            placeholder: {
              type: 'plain_text',
              text: `Select ${filter.label}`,
              emoji: true,
            },
            options: filter.options?.map(opt => ({
              text: { type: 'plain_text', text: opt.label, emoji: true },
              value: opt.value,
            })) || [],
          };
          break;

        case 'multiselect':
          element = {
            type: 'multi_static_select',
            action_id: `filter_${filter.id}`,
            placeholder: {
              type: 'plain_text',
              text: `Select ${filter.label}`,
              emoji: true,
            },
            options: filter.options?.map(opt => ({
              text: { type: 'plain_text', text: opt.label, emoji: true },
              value: opt.value,
            })) || [],
          };
          break;

        case 'date':
          element = {
            type: 'datepicker',
            action_id: `filter_${filter.id}`,
            placeholder: {
              type: 'plain_text',
              text: 'Select date',
              emoji: true,
            },
          };
          break;

        case 'text':
          element = {
            type: 'plain_text_input',
            action_id: `filter_${filter.id}`,
            placeholder: {
              type: 'plain_text',
              text: `Enter ${filter.label}`,
              emoji: true,
            },
          };
          break;
      }

      blocks.push({
        type: 'input',
        block_id: `filter_block_${filter.id}`,
        label: {
          type: 'plain_text',
          text: filter.label,
          emoji: true,
        },
        element,
      });
    });

    blocks.push(
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🔄 Reset Filters',
              emoji: true,
            },
            action_id: 'reset_filters',
            style: 'secondary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '💾 Save as Preset',
              emoji: true,
            },
            action_id: 'save_filter_preset',
            style: 'secondary',
          },
        ],
      }
    );

    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '🔍 Filter Options',
        emoji: true,
      },
      submit: {
        type: 'plain_text',
        text: 'Apply Filters',
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
}