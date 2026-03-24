// Data visualization components for rich report displays

export interface ChartData {
  label: string;
  value: number;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface MetricData {
  label: string;
  value: number | string;
  unit?: string;
  change?: number;
  changeType?: 'percentage' | 'absolute';
  status?: 'success' | 'warning' | 'error' | 'info';
}

export class DataVisualization {
  static createMetricGrid(metrics: MetricData[]): any {
    const fields = metrics.flatMap(metric => [
      {
        type: 'mrkdwn',
        text: `*${metric.label}*\n${this.formatMetricValue(metric)}`,
      },
    ]);

    return {
      type: 'section',
      fields: fields.slice(0, 10), // Slack limit
    };
  }

  static createProgressChart(data: ChartData[], title: string): any[] {
    const blocks = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 ${title}`,
        emoji: true,
      },
    });

    // Progress bars using text representation
    data.forEach(item => {
      const percentage = Math.min(Math.max(item.value, 0), 100);
      const filled = Math.round(percentage / 10);
      const empty = 10 - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${item.label}\n\`${bar}\` ${percentage}%`,
        },
      });
    });

    return blocks;
  }

  static createComparisonTable(data: Array<{ label: string; current: number; previous: number; unit?: string }>): any {
    const fields = [];

    data.forEach(item => {
      const change = item.current - item.previous;
      const changePercent = item.previous !== 0 ? ((change / item.previous) * 100) : 0;
      const trend = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';

      fields.push({
        type: 'mrkdwn',
        text: `*${item.label}*\n${this.formatValue(item.current, item.unit)} ${trend} ${this.formatChange(change, changePercent)}`,
      });
    });

    return {
      type: 'section',
      fields: fields.slice(0, 10),
    };
  }

  static createTrendIndicator(current: number, previous: number, label: string): any {
    const change = current - previous;
    const changePercent = previous !== 0 ? Math.abs((change / previous) * 100) : 0;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';
    const emoji = { up: '📈', down: '📉', stable: '➡️' }[direction];

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${label}*\n${current} ${emoji} ${changePercent.toFixed(1)}% from last period`,
      },
    };
  }

  static createKPIGrid(kpis: Array<{ label: string; value: number | string; target?: number; status?: string }>): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎯 Key Performance Indicators',
        emoji: true,
      },
    });

    const fields = kpis.map(kpi => {
      let statusEmoji = '📊';
      if (kpi.target && typeof kpi.value === 'number') {
        const percent = (kpi.value / kpi.target) * 100;
        if (percent >= 100) statusEmoji = '✅';
        else if (percent >= 80) statusEmoji = '🟡';
        else statusEmoji = '🔴';
      }

      return {
        type: 'mrkdwn',
        text: `${statusEmoji} *${kpi.label}*\n${kpi.value}${kpi.target ? ` / ${kpi.target}` : ''}`,
      };
    });

    blocks.push({
      type: 'section',
      fields: fields.slice(0, 10),
    });

    return blocks;
  }

  private static formatMetricValue(metric: MetricData): string {
    let value = metric.value.toString();

    if (metric.unit) {
      value += metric.unit;
    }

    if (metric.change !== undefined) {
      const changeStr = metric.changeType === 'percentage'
        ? `${metric.change > 0 ? '+' : ''}${metric.change}%`
        : `${metric.change > 0 ? '+' : ''}${metric.change}`;
      value += ` (${changeStr})`;
    }

    return value;
  }

  private static formatValue(value: number, unit?: string): string {
    if (unit === '%') return `${value.toFixed(1)}%`;
    if (unit === '$') return `$${value.toLocaleString()}`;
    if (typeof value === 'number' && value > 1000) return value.toLocaleString();
    return value.toString() + (unit || '');
  }

  private static formatChange(change: number, percent: number): string {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change} (${sign}${percent.toFixed(1)}%)`;
  }
}