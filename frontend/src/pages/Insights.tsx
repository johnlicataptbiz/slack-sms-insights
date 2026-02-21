import { useMemo, useState } from 'react';

import { useSalesMetrics } from '../api/queries';
import { MetricCard } from '../components/insights/MetricCard';
import { SalesTrendChart } from '../components/insights/SalesTrendChart';
import '../styles/DataPages.css';
import '../styles/Insights.css';

const BUSINESS_TIME_ZONE = 'America/Chicago';
const MANUAL_SEQUENCE_LABEL = 'No sequence (manual/direct)';

function formatPct(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}

function formatCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString();
}

function pctValue(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

export function Insights() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  const { data: metrics, isLoading, isError, error } = useSalesMetrics({ range, tz: BUSINESS_TIME_ZONE });

  const bookedSplit = useMemo(
    () => [
      { key: 'jack', label: 'Jack', value: metrics?.bookedCalls?.jack ?? 0, tone: 'jack' as const },
      { key: 'brandon', label: 'Brandon', value: metrics?.bookedCalls?.brandon ?? 0, tone: 'brandon' as const },
      { key: 'self', label: 'Self-booked', value: metrics?.bookedCalls?.selfBooked ?? 0, tone: 'self' as const },
    ],
    [metrics?.bookedCalls],
  );

  const totalBooked = metrics?.bookedCalls?.booked ?? 0;
  const totalMessages = metrics?.totals.messagesSent ?? 0;
  const totalPeopleContacted = metrics?.totals.peopleContacted ?? 0;
  const totalReplies = metrics?.totals.repliesReceived ?? 0;

  const funnelSteps = useMemo(
    () => [
      { label: 'Messages sent', value: totalMessages, conversionLabel: null as string | null },
      {
        label: 'People contacted',
        value: totalPeopleContacted,
        conversionLabel: formatPct(pctValue(totalPeopleContacted, totalMessages)),
      },
      {
        label: 'People replied',
        value: totalReplies,
        conversionLabel: formatPct(pctValue(totalReplies, totalPeopleContacted)),
      },
      {
        label: 'Booked calls (Slack)',
        value: totalBooked,
        conversionLabel: formatPct(pctValue(totalBooked, totalReplies)),
      },
    ],
    [totalBooked, totalMessages, totalPeopleContacted, totalReplies],
  );

  const messageMix = useMemo(() => {
    const manual = metrics?.totals.manualMessagesSent ?? 0;
    const sequence = metrics?.totals.sequenceMessagesSent ?? 0;
    const total = manual + sequence;
    return {
      manual,
      sequence,
      manualPct: pctValue(manual, total),
      sequencePct: pctValue(sequence, total),
    };
  }, [metrics?.totals.manualMessagesSent, metrics?.totals.sequenceMessagesSent]);

  const repRows = useMemo(() => {
    const rows = [...(metrics?.repLeaderboard ?? [])].sort((a, b) => b.outboundConversations - a.outboundConversations);
    const totalOutbound = rows.reduce((sum, row) => sum + row.outboundConversations, 0);
    return rows.map((row) => ({
      ...row,
      outboundSharePct: pctValue(row.outboundConversations, totalOutbound),
    }));
  }, [metrics?.repLeaderboard]);

  const maxOutboundConversations = useMemo(() => {
    const max = repRows.reduce((peak, row) => (row.outboundConversations > peak ? row.outboundConversations : peak), 0);
    return max > 0 ? max : 1;
  }, [repRows]);

  const sequenceRiskRows = useMemo(() => {
    return (metrics?.topSequences ?? [])
      .filter((row) => row.label !== MANUAL_SEQUENCE_LABEL)
      .filter((row) => row.messagesSent > 0)
      .map((row) => ({
        ...row,
        optOutRatePct: pctValue(row.optOuts, row.messagesSent),
      }))
      .sort((a, b) => {
        if (b.optOutRatePct !== a.optOutRatePct) return b.optOutRatePct - a.optOutRatePct;
        if (b.optOuts !== a.optOuts) return b.optOuts - a.optOuts;
        return b.messagesSent - a.messagesSent;
      })
      .slice(0, 8);
  }, [metrics?.topSequences]);

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
        <div>
          <h1>Team Insights</h1>
          <p className="Insights__subtitle">
            High-level command view for team performance. Sequence-level breakdown now lives in the Sequences tab.
          </p>
          <p className="Insights__caption">
            Time zone: {metrics?.meta?.timeZone || BUSINESS_TIME_ZONE}. Canonical booked KPI source: Slack.
          </p>
        </div>
        <label className="Insights__rangeControl">
          <span>Date range</span>
          <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as any)}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
      </header>

      <section className="Insights__kpis">
        <MetricCard label="Messages sent" value={formatCount(metrics?.totals.messagesSent)} />
        <MetricCard label="People contacted" value={formatCount(metrics?.totals.peopleContacted)} />
        <MetricCard label="People who replied" value={formatCount(metrics?.totals.repliesReceived)} />
        <MetricCard label="Reply rate (people)" value={formatPct(metrics?.totals.replyRatePct)} />
        <MetricCard label="Calls booked (Slack)" value={formatCount(metrics?.bookedCalls?.booked)} tone="success" />
        <MetricCard label="Jack booked credit" value={formatCount(metrics?.bookedCalls?.jack)} />
        <MetricCard label="Brandon booked credit" value={formatCount(metrics?.bookedCalls?.brandon)} />
        <MetricCard label="Opt-outs" value={formatCount(metrics?.totals.optOuts)} tone="danger" />
      </section>

      <section className="Insights__focusGrid">
        <div className="InsightsPanel">
          <h3>Pipeline Snapshot</h3>
          <div className="InsightsFunnel">
            {funnelSteps.map((step) => (
              <div key={step.label} className="InsightsFunnel__step">
                <div className="InsightsFunnel__label">{step.label}</div>
                <div className="InsightsFunnel__value">{formatCount(step.value)}</div>
                <div className="InsightsFunnel__meta">{step.conversionLabel ? `${step.conversionLabel} from previous step` : 'Base volume'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="InsightsPanel">
          <h3>Booked Call Credit (Slack)</h3>
          <div className="InsightsSplit">
            {bookedSplit.map((row) => (
              <div key={row.key} className="InsightsSplit__row">
                <div className="InsightsSplit__label">{row.label}</div>
                <div className="InsightsSplit__track">
                  <div
                    className={`InsightsSplit__fill InsightsSplit__fill--${row.tone}`}
                    style={{ width: `${pctValue(row.value, totalBooked)}%` }}
                  />
                </div>
                <div className="InsightsSplit__value">
                  {formatCount(row.value)} ({formatPct(pctValue(row.value, totalBooked))})
                </div>
              </div>
            ))}
          </div>
          <p className="Insights__caption">Credit comes from reactions on booked-call posts: :jack: and :me:.</p>
        </div>

        <div className="InsightsPanel">
          <h3>Message Mix</h3>
          <div className="InsightsSplit">
            <div className="InsightsSplit__row">
              <div className="InsightsSplit__label">Manual</div>
              <div className="InsightsSplit__track">
                <div className="InsightsSplit__fill InsightsSplit__fill--manual" style={{ width: `${messageMix.manualPct}%` }} />
              </div>
              <div className="InsightsSplit__value">
                {formatCount(messageMix.manual)} ({formatPct(messageMix.manualPct)})
              </div>
            </div>
            <div className="InsightsSplit__row">
              <div className="InsightsSplit__label">Sequence</div>
              <div className="InsightsSplit__track">
                <div className="InsightsSplit__fill InsightsSplit__fill--sequence" style={{ width: `${messageMix.sequencePct}%` }} />
              </div>
              <div className="InsightsSplit__value">
                {formatCount(messageMix.sequence)} ({formatPct(messageMix.sequencePct)})
              </div>
            </div>
          </div>
          <p className="Insights__caption">
            Manual follow-ups after a sequence reply are excluded from manual totals.
          </p>
        </div>
      </section>

      <section className="InsightsPanel InsightsPanel--wide">
        <h3>Sales Trend</h3>
        <SalesTrendChart points={metrics?.trendByDay ?? []} />
      </section>

      <section className="Insights__main">
        <div className="Insights__table">
          <h3>Rep Performance</h3>
          <div className="DataTableWrap">
            <table className="DataTable">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th className="is-right">Outbound convos</th>
                  <th className="is-right">Volume share</th>
                  <th className="is-right">Reply rate</th>
                  <th className="is-right">Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {repRows.map((row) => (
                  <tr key={row.repName}>
                    <td>{row.repName}</td>
                    <td className="is-right">
                      <div className="InsightsMiniMetric">
                        <span>{formatCount(row.outboundConversations)}</span>
                        <div className="InsightsMiniBar">
                          <div
                            className="InsightsMiniBar__fill"
                            style={{ width: `${pctValue(row.outboundConversations, maxOutboundConversations)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="is-right">{formatPct(row.outboundSharePct)}</td>
                    <td className="is-right">{formatPct(row.replyRatePct)}</td>
                    <td className="is-right">{formatCount(row.optOuts)}</td>
                  </tr>
                ))}
                {repRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="Insights__emptyCell">
                      No reps
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="Insights__table">
          <h3>Sequence Risk Watch</h3>
          <div className="Insights__caption">
            Fast risk scan only. For full sequence analytics and attribution details, use the Sequences tab.
          </div>
          <div className="DataTableWrap">
            <table className="DataTable">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Replies</th>
                  <th className="is-right">Opt-outs</th>
                  <th className="is-right">Opt-out rate</th>
                </tr>
              </thead>
              <tbody>
                {sequenceRiskRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="is-right">{formatCount(row.messagesSent)}</td>
                    <td className="is-right">
                      {formatCount(row.repliesReceived)} ({formatPct(row.replyRatePct)})
                    </td>
                    <td className="is-right">{formatCount(row.optOuts)}</td>
                    <td className="is-right">{formatPct(row.optOutRatePct)}</td>
                  </tr>
                ))}
                {sequenceRiskRows.length === 0 ? (
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
