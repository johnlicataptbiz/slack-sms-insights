import React, { useMemo, useState } from 'react';
import { parseReport } from '../utils/reportParser';
import '../styles/RunDetail.css';

type Run = {
  id: string;
  timestamp: string;
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
  const [showRaw, setShowRaw] = useState(false);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const parsedData = useMemo(() => {
    if (run.full_report && run.status === 'success') {
      return parseReport(run.full_report);
    }
    return null;
  }, [run.full_report, run.status]);

  const hasStructuredData = parsedData && parsedData.reps.length > 0;

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

      {hasStructuredData && (
        <div className="structured-report">
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Total Sent</span>
              <span className="metric-value">{parsedData.totalMessagesSent.toLocaleString()}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Reply Rate</span>
              <span className="metric-value">{parsedData.overallReplyRate.toFixed(1)}%</span>
              <span className="metric-subtext">{parsedData.totalRepliesReceived} replies</span>
            </div>
            <div className="metric-card highlight">
              <span className="metric-label">Bookings</span>
              <span className="metric-value">🚀 {parsedData.totalBooked}</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Opt-Outs</span>
              <span className="metric-value">⚠️ {parsedData.totalOptOuts}</span>
            </div>
          </div>

          <div className="report-section">
            <h3>Performance by Representative</h3>
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

          <div className="report-section">
            <h3>Sequence Performance</h3>
            <div className="table-container">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Sequence</th>
                    <th>Sent</th>
                    <th>Replies</th>
                    <th>Reply Rate</th>
                    <th>Booked</th>
                    <th>Opt-Outs</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.allSequences.map((seq, i) => (
                    <tr key={i}>
                      <td className="font-bold">{seq.label}</td>
                      <td>{seq.messagesSent}</td>
                      <td>{seq.repliesReceived}</td>
                      <td>{seq.replyRate.toFixed(1)}%</td>
                      <td className={seq.booked > 0 ? 'success-text' : ''}>{seq.booked}</td>
                      <td className={seq.optOuts > 0 ? 'warning-text' : ''}>{seq.optOuts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {run.full_report && (
        <div className="report-content">
          <div className="section-header">
            <h3>{hasStructuredData ? 'Raw Report Data' : 'Full Report'}</h3>
            {hasStructuredData && (
              <button 
                className="toggle-button"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Hide Raw' : 'Show Raw'}
              </button>
            )}
          </div>
          {(showRaw || !hasStructuredData) && (
            <pre className="report-text">{run.full_report}</pre>
          )}
        </div>
      )}

      <div className="detail-footer">
        <p>Run ID: {run.id}</p>
      </div>
    </div>
  );
}
