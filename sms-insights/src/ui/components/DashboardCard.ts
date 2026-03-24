export interface DashboardCardProps {
  title: string;
  value: string | number;
  trend?: {
    direction: 'up' | 'down';
    value: number;
  };
  status?: 'success' | 'warning' | 'error';
  description?: string;
}

export class DashboardCard {
  static create(props: DashboardCardProps): any {
    const { title, value, trend, status, description } = props;

    // Status emoji mapping
    const statusEmoji = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
    };

    // Trend indicator
    let trendText = '';
    if (trend) {
      const arrow = trend.direction === 'up' ? '📈' : '📉';
      trendText = ` ${arrow} ${trend.value}%`;
    }

    // Status indicator
    const statusIndicator = status ? `${statusEmoji[status]} ` : '';

    // Main value display
    const valueText = `*${value}*${trendText}`;

    // Description if provided
    const descText = description ? `\n${description}` : '';

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusIndicator}*${title}*\n${valueText}${descText}`,
      },
    };
  }

  static createWithAccessory(props: DashboardCardProps & { accessory?: any }): any {
    const section = this.create(props);
    if (props.accessory) {
      section.accessory = props.accessory;
    }
    return section;
  }
}