import React from 'react';
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
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

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

      {run.full_report && (
        <div className="report-content">
          <h3>Full Report</h3>
          <pre className="report-text">{run.full_report}</pre>
        </div>
      )}

      <div className="detail-footer">
        <p>Run ID: {run.id}</p>
      </div>
    </div>
  );
}
