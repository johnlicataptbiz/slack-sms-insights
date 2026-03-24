// Drill-down capabilities for detailed data exploration

export interface DrillDownOption {
  id: string;
  label: string;
  value: string;
  count?: number;
  percentage?: number;
}

export interface DrillDownLevel {
  title: string;
  options: DrillDownOption[];
  currentSelection?: string;
  parentLevel?: string;
}

export class DrillDown {
  static createDrillDownMenu(level: DrillDownLevel): any {
    const blocks = [];

    // Header with breadcrumb
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🔍 ${level.title}`,
        emoji: true,
      },
    });

    // Current selection indicator
    if (level.currentSelection) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Current: ${level.currentSelection}*`,
          },
        ],
      });
    }

    // Navigation buttons
    const buttons = level.options.map(option => ({
      type: 'button' as const,
      text: {
        type: 'plain_text',
        text: `${option.label}${option.count ? ` (${option.count})` : ''}${option.percentage ? ` ${option.percentage.toFixed(1)}%` : ''}`,
        emoji: true,
      },
      action_id: `drill_down_${level.title.toLowerCase().replace(/\s+/g, '_')}_${option.id}`,
      value: JSON.stringify({
        level: level.title,
        selection: option.value,
        parent: level.parentLevel,
      }),
    }));

    // Split buttons into rows of 5 (Slack limit)
    for (let i = 0; i < buttons.length; i += 5) {
      blocks.push({
        type: 'actions',
        elements: buttons.slice(i, i + 5),
      });
    }

    // Back button if there's a parent level
    if (level.parentLevel) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⬅️ Back',
              emoji: true,
            },
            action_id: `drill_up_${level.parentLevel}`,
            style: 'secondary',
          },
        ],
      });
    }

    return blocks;
  }

  static createSummaryView(data: Array<{ category: string; value: number; subItems?: DrillDownOption[] }>): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Summary View',
        emoji: true,
      },
    });

    // Summary table
    const fields = data.flatMap(item => [
      {
        type: 'mrkdwn',
        text: `*${item.category}*\n${item.value.toLocaleString()}${item.subItems ? ` (${item.subItems.length} items)` : ''}`,
      },
    ]);

    blocks.push({
      type: 'section',
      fields: fields.slice(0, 10),
    });

    // Drill-down actions
    const actions = data.map(item => ({
      type: 'button' as const,
      text: {
        type: 'plain_text',
        text: `Explore ${item.category}`,
        emoji: true,
      },
      action_id: `drill_into_${item.category.toLowerCase().replace(/\s+/g, '_')}`,
      value: JSON.stringify({ category: item.category }),
    }));

    for (let i = 0; i < actions.length; i += 5) {
      blocks.push({
        type: 'actions',
        elements: actions.slice(i, i + 5),
      });
    }

    return blocks;
  }

  static createDetailedBreakdown(title: string, breakdown: Array<{ label: string; value: number; percentage: number }>): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📈 ${title} Breakdown`,
        emoji: true,
      },
    });

    // Sort by value descending
    const sorted = breakdown.sort((a, b) => b.value - a.value);

    const fields = sorted.flatMap(item => [
      {
        type: 'mrkdwn',
        text: `*${item.label}*\n${item.value.toLocaleString()} (${item.percentage.toFixed(1)}%)`,
      },
    ]);

    blocks.push({
      type: 'section',
      fields: fields.slice(0, 10),
    });

    // Progress visualization for top items
    const topItems = sorted.slice(0, 5);
    topItems.forEach(item => {
      const barLength = Math.round(item.percentage / 2); // Scale to fit
      const bar = '█'.repeat(Math.max(1, barLength));

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${item.label}\n\`${bar}\` ${item.percentage.toFixed(1)}%`,
        },
      });
    });

    return blocks;
  }

  static createTimeSeriesDrillDown(timeRanges: Array<{ period: string; data: Array<{ label: string; value: number }> }>): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📅 Time Series Analysis',
        emoji: true,
      },
    });

    // Time range selector
    const timeButtons = timeRanges.map(range => ({
      type: 'button' as const,
      text: {
        type: 'plain_text',
        text: range.period,
        emoji: true,
      },
      action_id: `time_drill_${range.period.toLowerCase().replace(/\s+/g, '_')}`,
      value: JSON.stringify({ period: range.period }),
    }));

    for (let i = 0; i < timeButtons.length; i += 5) {
      blocks.push({
        type: 'actions',
        elements: timeButtons.slice(i, i + 5),
      });
    }

    // Show current period data
    if (timeRanges.length > 0) {
      const currentData = timeRanges[0].data;
      const fields = currentData.flatMap(item => [
        {
          type: 'mrkdwn',
          text: `*${item.label}*\n${item.value.toLocaleString()}`,
        },
      ]);

      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10),
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Trend',
            emoji: true,
          },
          action_id: 'view_trend_chart',
        },
      });
    }

    return blocks;
  }
}