import { useState } from 'react';

import { useSalesMetrics } from '../api/queries';
import { MetricCard } from '../components/insights/MetricCard';
import { SalesTrendChart } from '../components/insights/SalesTrendChart';
import '../styles/DataPages.css';
import '../styles/Insights.css';

const BUSINESS_TIME_ZONE = 'America/Chicago';

function formatPct(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}

export function Insights() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  const { data: metrics, isLoading, isError, error } = useSalesMetrics({ range, tz: BUSINESS_TIME_ZONE });
  const topSequenceRows = (metrics?.topSequences ?? []).slice(0, 10);

  if (isLoading) {
    return (
      <div className="Insights Insights--loading">
        <div className="DataLoading">Loading metrics...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="Insights__error">
        Failed to load metrics.
        <pre className="Insights__errorCode">
          {String((error as any)?.message ?? error)}
        </pre>
      </div>
    );
  }

  return (
    <div className="Insights">
      <header className="Insights__header">
        <h1>Team Insights</h1>
        <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as any)}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </header>

      <section className="Insights__kpis">
        <MetricCard label="Messages sent" value={metrics?.totals.messagesSent ?? 0} />
        <MetricCard label="Manual texts sent" value={metrics?.totals.manualMessagesSent ?? 0} />
        <MetricCard label="Sequence texts sent" value={metrics?.totals.sequenceMessagesSent ?? 0} />
        <MetricCard label="People contacted" value={metrics?.totals.peopleContacted ?? 0} />
        <MetricCard label="People who replied" value={metrics?.totals.repliesReceived ?? 0} />
        <MetricCard label="Reply rate (people)" value={formatPct(metrics?.totals.replyRatePct)} />
        <MetricCard label="Calls booked (Slack)" value={metrics?.bookedCalls?.booked ?? 0} />
        <MetricCard label="Opt-outs" value={metrics?.totals.optOuts ?? 0} tone="danger" />
      </section>

      {metrics?.bookedCalls ? (
        <section className="Insights__table Insights__table--first">
          <h3>Calls booked — credit (from Slack)</h3>
          <div className="DataTableWrap">
            <table className="DataTable">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th className="is-right">Booked</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Jack (:jack:)</td>
                  <td className="is-right">{metrics.bookedCalls.jack}</td>
                </tr>
                <tr>
                  <td>Brandon (:me:)</td>
                  <td className="is-right">{metrics.bookedCalls.brandon}</td>
                </tr>
                <tr>
                  <td>Self-booked</td>
                  <td className="is-right">{metrics.bookedCalls.selfBooked}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="is-right">
                    <strong>{metrics.bookedCalls.booked}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="Insights__caption">
            Calls booked are sourced from HubSpot Slack posts in #bookedcalls. Credit uses reactions (:jack: and :me:).
            Time zone: {metrics.meta?.timeZone || BUSINESS_TIME_ZONE}.
          </div>
        </section>
      ) : null}

      <section className="Insights__main">
        <div className="Insights__chart">
          <h3>Sales Trend</h3>
          <SalesTrendChart points={metrics?.trendByDay ?? []} />
        </div>

        <div className="Insights__table">
          <h3>Top Sequences (Top 10)</h3>
          <div className="Insights__caption">
            Canonical booked metrics are Slack-sourced and shown above. Sequence tables show volume/reply/opt-out performance.
          </div>
          <div className="DataTableWrap">
            <table className="DataTable">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Replies</th>
                  <th className="is-right">Reply %</th>
                  <th className="is-right">Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {topSequenceRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="is-right">{row.messagesSent}</td>
                    <td className="is-right">{row.repliesReceived}</td>
                    <td className="is-right">{formatPct(row.replyRatePct)}</td>
                    <td className="is-right">{row.optOuts}</td>
                  </tr>
                ))}
                {topSequenceRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="Insights__emptyCell">
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
          <div className="DataTableWrap">
            <table className="DataTable">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th className="is-right">Outbound convos</th>
                  <th className="is-right">Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.repLeaderboard ?? []).map((row) => (
                  <tr key={row.repName}>
                    <td>{row.repName}</td>
                    <td className="is-right">{row.outboundConversations}</td>
                    <td className="is-right">{row.optOuts}</td>
                  </tr>
                ))}
                {(metrics?.repLeaderboard ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="Insights__emptyCell">
                      No reps
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <details className="DataDetails Insights__diagnostics">
        <summary>Advanced diagnostics (SMS booking signals)</summary>
        <div className="DataDetails__body">
          <div className="Insights__caption">
          These values are diagnostic heuristics from SMS text analysis and are not the canonical booked KPI.
          </div>

          <div className="DataSplit DataSplit--2">
            <div>
              <div className="DataTableWrap">
                <table className="DataTable">
                  <thead>
                    <tr>
                      <th>Sequence</th>
                      <th className="is-right">Booking signals (SMS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.topSequences ?? []).map((row) => (
                      <tr key={`diag-seq-${row.label}`}>
                        <td>{row.label}</td>
                        <td className="is-right">{row.bookingSignalsSms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="DataTableWrap">
                <table className="DataTable">
                  <thead>
                    <tr>
                      <th>Rep</th>
                      <th className="is-right">Booking signals (SMS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.repLeaderboard ?? []).map((row) => (
                      <tr key={`diag-rep-${row.repName}`}>
                        <td>{row.repName}</td>
                        <td className="is-right">{row.bookingSignalsSms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
