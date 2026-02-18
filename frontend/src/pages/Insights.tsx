import { useState } from 'react';
import { useMetrics } from '../api/queries';
import { MetricCard } from '../components/insights/MetricCard';
import { RepTable } from '../components/insights/RepTable';
import { ResponseTimeChart } from '../components/insights/ResponseTimeChart';
import '../styles/Insights.css';

function computeRange(range: 'today' | '7d' | '30d') {
  const to = new Date();
  const from = new Date();
  
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    from.setDate(from.getDate() - 7);
  } else if (range === '30d') {
    from.setDate(from.getDate() - 30);
  }
  
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatMinutes(minutes: number | null | undefined) {
  if (minutes == null) return '-';
  return `${Math.round(minutes)}m`;
}

export function Insights() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  const { from, to } = computeRange(range);
  const { data: metrics, isLoading, isError, error } = useMetrics({ from, to });

  if (isLoading) {
    return (
      <div className="Insights" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        Loading metrics...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="Insights__error">
        Failed to load metrics.
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, opacity: 0.8 }}>
          {String((error as any)?.message ?? error)}
        </pre>
      </div>
    );
  }

  return (
    <div className="Insights">
      <header className="Insights__header">
        <h1>Team Insights</h1>
        <select value={range} onChange={e => setRange(e.target.value as any)}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </header>

      <section className="Insights__kpis">
        <MetricCard
          label="Avg first response"
          value={formatMinutes(metrics?.pipelineVelocity.avgTimeToFirstResponseMinutes)}
        />
        <MetricCard
          label="P90 first response"
          value={formatMinutes(metrics?.reps.reduce((acc, r) => Math.max(acc, r.p90FirstResponseMinutes || 0), 0))}
        />
        <MetricCard
          label="Open work items"
          value={metrics?.openWorkItems ?? 0}
        />
        <MetricCard
          label="Overdue work items"
          value={metrics?.overdueWorkItems ?? 0}
          tone="danger"
        />
      </section>

      <section className="Insights__main">
        <div className="Insights__chart">
          <h3>Response Time Distribution</h3>
          <ResponseTimeChart buckets={metrics?.responseTimeBuckets ?? []} />
        </div>
        <div className="Insights__table">
          <h3>Rep Performance</h3>
          <RepTable reps={metrics?.reps ?? []} />
        </div>
      </section>
    </div>
  );
}
