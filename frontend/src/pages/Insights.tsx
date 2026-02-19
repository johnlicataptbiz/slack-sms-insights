import { useMemo, useState } from 'react';
import { useSalesMetrics } from '../api/queries';
import { MetricCard } from '../components/insights/MetricCard';
import { SalesTrendChart } from '../components/insights/SalesTrendChart';
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

function formatPct(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}

export function Insights() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');

  // Important: keep from/to stable between renders so React Query can cache and settle.
  // If we compute `to = new Date()` on every render, the queryKey changes continuously and
  // the UI can get stuck in a perpetual loading state.
  const { from, to } = useMemo(() => computeRange(range), [range]);

  const { data: metrics, isLoading, isError, error } = useSalesMetrics({ from, to });

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
        <select aria-label="Time range" value={range} onChange={e => setRange(e.target.value as any)}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </header>

      <section className="Insights__kpis">
        <MetricCard label="Messages sent" value={metrics?.totals.messagesSent ?? 0} />
        <MetricCard label="Manual texts sent" value={metrics?.totals.manualMessagesSent ?? 0} />
        <MetricCard label="Sequence texts sent" value={metrics?.totals.sequenceMessagesSent ?? 0} />
        <MetricCard label="People who replied" value={metrics?.totals.repliesReceived ?? 0} />
        <MetricCard label="Reply rate" value={formatPct(metrics?.totals.replyRatePct)} />
        <MetricCard label="Calls booked" value={metrics?.totals.booked ?? 0} />
        <MetricCard label="Opt-outs" value={metrics?.totals.optOuts ?? 0} tone="danger" />
      </section>

      {metrics?.bookedCalls ? (
        <section className="Insights__table" style={{ marginTop: 18 }}>
          <h3>Calls booked — credit (from Slack)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Bucket</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Booked</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>Jack (:jack:)</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {metrics.bookedCalls.jack}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>Brandon (:me:)</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {metrics.bookedCalls.brandon}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>Self-booked</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {metrics.bookedCalls.selfBooked}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <strong>Total</strong>
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <strong>{metrics.bookedCalls.booked}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
            Calls booked are sourced from HubSpot Slack posts in #bookedcalls. Credit uses reactions (:jack: and :me:).
          </div>
        </section>
      ) : null}

      <section className="Insights__main">
        <div className="Insights__chart">
          <h3>Sales Trend</h3>
          <SalesTrendChart points={metrics?.trendByDay ?? []} />
        </div>

        <div className="Insights__table">
          <h3>Top Sequences</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Sequence</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Sent</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Replies</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Reply %</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Booked</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.topSequences ?? []).map((row) => (
                  <tr key={row.label}>
                    <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>{row.label}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.messagesSent}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.repliesReceived}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {formatPct(row.replyRatePct)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.booked}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.optOuts}
                    </td>
                  </tr>
                ))}
                {(metrics?.topSequences ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 6px', opacity: 0.7 }}>
                      No sequences
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="Insights__table">
          <h3>Rep Leaderboard</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Rep</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Outbound convos</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Booked</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.repLeaderboard ?? []).map((row) => (
                  <tr key={row.repName}>
                    <td style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>{row.repName}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.outboundConversations}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.booked}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {row.optOuts}
                    </td>
                  </tr>
                ))}
                {(metrics?.repLeaderboard ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '10px 6px', opacity: 0.7 }}>
                      No reps
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
