import { useMemo, useState } from 'react';
import { useSalesMetrics } from '../api/queries';
import { parseReport } from '../utils/reportParser';
import { DEFAULT_BUSINESS_TIME_ZONE, resolveRunBusinessDay } from '../utils/runDay';
import '../styles/RunDetail.css';

type Run = {
  id: string;
  timestamp: string;
  report_date?: string; // YYYY-MM-DD (preferred for daily reports)
  channel_id: string;
  channel_name: string;
  report_type: string;
  status: 'success' | 'error' | 'pending';
  summary_text: string;
  full_report: string;
  error_message?: string;
  duration_ms: number;
};

export default function RunDetail({ run, onBack }: { run: Run; onBack: () => void }) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const businessDay = useMemo(
    () => resolveRunBusinessDay({ report_date: run.report_date, timestamp: run.timestamp }, DEFAULT_BUSINESS_TIME_ZONE),
    [run.report_date, run.timestamp],
  );

  const salesQuery = businessDay
    ? { day: businessDay, tz: DEFAULT_BUSINESS_TIME_ZONE }
    : { range: 'today' as const, tz: DEFAULT_BUSINESS_TIME_ZONE };

  const { data: sales, isLoading: salesLoading, error: salesError } = useSalesMetrics(
    salesQuery,
  );

  const parsedData = useMemo(() => {
    if (run.full_report && run.status === 'success') {
      return parseReport(run.full_report);
    }
    return null;
  }, [run.full_report, run.status]);

  const hasStructuredData = parsedData && parsedData.reps.length > 0;

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedSequences = useMemo(() => {
    if (!parsedData?.allSequences) return [];
    if (!sortConfig) return parsedData.allSequences;

    return [...parsedData.allSequences].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortConfig.key) {
        case 'label':
          aValue = a.label.toLowerCase();
          bValue = b.label.toLowerCase();
          break;
        case 'messagesSent':
          aValue = a.messagesSent;
          bValue = b.messagesSent;
          break;
        case 'repliesReceived':
          aValue = a.repliesReceived;
          bValue = b.repliesReceived;
          break;
        case 'replyRate':
          aValue = a.replyRate;
          bValue = b.replyRate;
          break;
        case 'booked':
          aValue = a.booked;
          bValue = b.booked;
          break;
        case 'optOuts':
          aValue = a.optOuts;
          bValue = b.optOuts;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [parsedData?.allSequences, sortConfig]);

  return (
    <div className="run-detail">
      <button onClick={onBack} className="back-button">
        ← Back to List
      </button>

      <div className="detail-header">
        <h2>Report Details</h2>
        <div className="detail-meta">
          <div className="meta-item">
            <span className="label">Channel:</span>
            <span className="value">{run.channel_name || run.channel_id}</span>
          </div>
          <div className="meta-item">
            <span className="label">Timestamp:</span>
            <span className="value">{formatTime(run.timestamp)}</span>
          </div>
          <div className="meta-item">
            <span className="label">Type:</span>
            <span className="value">{run.report_type}</span>
          </div>
          <div className="meta-item">
            <span className="label">Status:</span>
            <span className={`badge badge-${run.status}`}>{run.status.toUpperCase()}</span>
          </div>
          {run.duration_ms && (
            <div className="meta-item">
              <span className="label">Duration:</span>
              <span className="value">{run.duration_ms}ms</span>
            </div>
          )}
        </div>
      </div>

      {run.status === 'error' && run.error_message && (
        <div className="error-box">
          <strong>Error:</strong>
          <pre>{run.error_message}</pre>
        </div>
      )}

      <div className="structured-report">
        <div className="report-section section-primary">
          <div className="section-header">
            <div className="section-icon">✅</div>
            <div className="section-content">
              <h3>Source-of-truth metrics (sms_events + Slack booked calls)</h3>
              <p className="section-description">
                This panel is computed from the same sources as Team Insights and Attribution. Business day query:{' '}
                {businessDay || 'unavailable'} ({DEFAULT_BUSINESS_TIME_ZONE}).
              </p>
            </div>
          </div>

          {businessDay === null ? (
            <div className="run-detail__state">No valid business day found for this run.</div>
          ) : salesLoading ? (
            <div className="run-detail__state">Loading source-of-truth metrics…</div>
          ) : salesError ? (
            <div className="run-detail__state run-detail__state--error">Failed to load source-of-truth metrics.</div>
          ) : (
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-icon">📤</div>
                <span className="metric-label">Messages sent</span>
                <span className="metric-value">{(sales?.totals?.messagesSent ?? 0).toLocaleString()}</span>
              </div>

              <div className="metric-card">
                <div className="metric-icon">🧑‍💻</div>
                <span className="metric-label">Manual texts sent</span>
                <span className="metric-value">{(sales?.totals?.manualMessagesSent ?? 0).toLocaleString()}</span>
              </div>

              <div className="metric-card">
                <div className="metric-icon">🤖</div>
                <span className="metric-label">Sequence texts sent</span>
                <span className="metric-value">{(sales?.totals?.sequenceMessagesSent ?? 0).toLocaleString()}</span>
              </div>

              <div className="metric-card">
                <div className="metric-icon">💬</div>
                <span className="metric-label">Reply rate (people)</span>
                <span className="metric-value">{(sales?.totals?.replyRatePct ?? 0).toFixed(1)}%</span>
                <span className="metric-subtext">
                  {(sales?.totals?.repliesReceived ?? 0).toLocaleString()} replied /{' '}
                  {(sales?.totals?.peopleContacted ?? 0).toLocaleString()} contacted
                </span>
              </div>

              <div className="metric-card highlight">
                <div className="metric-icon">📞</div>
                <span className="metric-label">Appointments set (Slack)</span>
                <span className="metric-value">{sales?.bookedCalls?.booked ?? 0}</span>
                <span className="metric-subtext">
                  Jack {sales?.bookedCalls?.jack ?? 0} · Brandon {sales?.bookedCalls?.brandon ?? 0} · Self{' '}
                  {sales?.bookedCalls?.selfBooked ?? 0}
                </span>
              </div>

              <div className="metric-card warning">
                <div className="metric-icon">🚫</div>
                <span className="metric-label">Opt-outs</span>
                <span className="metric-value">{sales?.totals?.optOuts ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        {hasStructuredData && (
          <details className="report-section section-secondary diagnostics-details">
            <summary className="diagnostics-details__summary">Show legacy diagnostics (stored report parsing)</summary>

            <div className="diagnostics-details__body">
              <div className="section-header">
                <div className="section-icon">🧾</div>
                <div className="section-content">
                  <h3>Legacy report (sequence tables)</h3>
                  <p className="section-description">
                    This is the original text report that was generated and stored at the time. It uses different
                    definitions (for example: sent and reply rate) and can disagree with the source-of-truth panel
                    above.
                  </p>
                </div>
              </div>

              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-icon">📤</div>
                  <span className="metric-label">Total Sent (legacy)</span>
                  <span className="metric-value">{parsedData.totalMessagesSent.toLocaleString()}</span>
                  <span className="metric-subtext">Legacy definition (sequence report)</span>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">💬</div>
                  <span className="metric-label">Reply Rate (legacy)</span>
                  <span className="metric-value">{parsedData.overallReplyRate.toFixed(1)}%</span>
                  <span className="metric-subtext">{parsedData.totalRepliesReceived} replies (legacy)</span>
                </div>
                <div className="metric-card highlight">
                  <div className="metric-icon">🎯</div>
                  <span className="metric-label">Bookings (legacy)</span>
                  <span className="metric-value">{parsedData.totalBooked}</span>
                  <div className="metric-trend positive">+{parsedData.totalBooked > 0 ? 'Active' : 'Monitor'}</div>
                </div>
                <div className="metric-card warning">
                  <div className="metric-icon">🚫</div>
                  <span className="metric-label">Opt-Outs (legacy)</span>
                  <span className="metric-value">{parsedData.totalOptOuts}</span>
                  <div className="metric-trend negative">{parsedData.totalOptOuts > 10 ? 'High Risk' : 'Normal'}</div>
                </div>
              </div>

              <div className="report-section section-primary">
                <div className="section-header">
                  <div className="section-icon">👥</div>
                  <div className="section-content">
                    <h3>Performance by Representative</h3>
                    <p className="section-description">Individual performance metrics and top-performing sequences</p>
                  </div>
                </div>
                <div className="table-container">
                  <table className="metrics-table">
                    <thead>
                      <tr>
                        <th>Representative</th>
                        <th>Outbound Conv.</th>
                        <th>Bookings</th>
                        <th>Opt-Outs</th>
                        <th>Top Sequence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.reps.map((rep, i) => {
                        const topSeq = rep.sequences.sort((a, b) => b.messagesSent - a.messagesSent)[0];
                        return (
                          <tr key={i}>
                            <td className="font-bold">{rep.name}</td>
                            <td>{rep.outboundConversations}</td>
                            <td className={rep.bookings > 0 ? 'success-text' : ''}>{rep.bookings}</td>
                            <td className={rep.optOuts > 0 ? 'warning-text' : ''}>{rep.optOuts}</td>
                            <td>{topSeq ? `${topSeq.label} (${topSeq.messagesSent} sent)` : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="report-section section-secondary">
                <div className="section-header">
                  <div className="section-icon">📊</div>
                  <div className="section-content">
                    <h3>Sequence Performance</h3>
                    <p className="section-description">Detailed analysis of messaging sequences with risk assessment</p>
                  </div>
                </div>
                <div className="table-container">
                  <table className="metrics-table">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => handleSort('label')}>
                          Sequence {sortConfig?.key === 'label' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="sortable" onClick={() => handleSort('messagesSent')}>
                          Sent {sortConfig?.key === 'messagesSent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="sortable" onClick={() => handleSort('repliesReceived')}>
                          Replies {sortConfig?.key === 'repliesReceived' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="sortable" onClick={() => handleSort('replyRate')}>
                          Reply Rate {sortConfig?.key === 'replyRate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="sortable" onClick={() => handleSort('booked')}>
                          Booked {sortConfig?.key === 'booked' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="sortable" onClick={() => handleSort('optOuts')}>
                          Opt-Outs {sortConfig?.key === 'optOuts' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSequences.map((seq, i) => {
                        const optOutRate = seq.messagesSent > 0 ? (seq.optOuts / seq.messagesSent) * 100 : 0;
                        const isHighRisk = optOutRate > 5 || seq.optOuts > 10;
                        const isMediumRisk = optOutRate > 2 || seq.optOuts > 5;

                        return (
                          <tr key={i} className={isHighRisk ? 'high-risk-row' : isMediumRisk ? 'medium-risk-row' : ''}>
                            <td className="font-bold">{seq.label}</td>
                            <td>{seq.messagesSent}</td>
                            <td>{seq.repliesReceived}</td>
                            <td>{seq.replyRate.toFixed(1)}%</td>
                            <td className={seq.booked > 0 ? 'success-text' : ''}>{seq.booked}</td>
                            <td className={seq.optOuts > 0 ? 'warning-text' : ''}>
                              {seq.optOuts}
                              {seq.optOuts > 0 && <span className="opt-out-rate">({optOutRate.toFixed(1)}%)</span>}
                            </td>
                            <td>
                              {isHighRisk && <span className="risk-badge high-risk">🔴 High</span>}
                              {isMediumRisk && !isHighRisk && <span className="risk-badge medium-risk">🟡 Medium</span>}
                              {!isMediumRisk && <span className="risk-badge low-risk">🟢 Low</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="report-section section-week-to-date">
                <div className="section-header">
                  <div className="section-icon">📅</div>
                  <div className="section-content">
                    <h3>Week-to-Date Summary</h3>
                    <p className="section-description">Rolling weekly performance metrics (coming soon)</p>
                  </div>
                </div>
                <div className="week-to-date-placeholder">
                  <div className="placeholder-icon">📈</div>
                  <h4>Week-to-Date Analytics</h4>
                  <p>
                    Enhanced week-to-date summaries will be available in a future update. This section will display
                    rolling 7-day metrics, trend analysis, and comparative performance data.
                  </p>
                  <div className="placeholder-features">
                    <span className="feature-tag">Rolling Metrics</span>
                    <span className="feature-tag">Trend Analysis</span>
                    <span className="feature-tag">Comparative Data</span>
                  </div>
                </div>
              </div>
            </div>
          </details>
        )}
      </div>

      {run.full_report && (
        <details className="report-content report-content--details">
          <summary className="diagnostics-details__summary">
            {hasStructuredData ? 'Show legacy raw report text' : 'Show full report text'}
          </summary>
          <pre className="report-text report-text--top-spaced">
            {run.full_report}
          </pre>
        </details>
      )}

      <div className="detail-footer">
        <p>Run ID: {run.id}</p>
      </div>
    </div>
  );
}
