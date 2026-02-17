import React, { useState } from 'react';
import RunDetail from './RunDetail';
import '../styles/RunList.css';

type Run = {
  id: string;
  timestamp: string;
  channel_id: string;
  channel_name: string;
  report_type: string;
  status: 'success' | 'error' | 'pending';
  summary_text: string;
  full_report: string;
  duration_ms: number;
};

export default function RunList({ runs, token }: { runs: Run[]; token: string }) {
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const statusClass = `badge badge-${status}`;
    return <span className={statusClass}>{status.toUpperCase()}</span>;
  };

  if (selectedRun) {
    return <RunDetail run={selectedRun} onBack={() => setSelectedRun(null)} />;
  }

  return (
    <div className="run-list">
      <table className="runs-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Channel</th>
            <th>Type</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} onClick={() => setSelectedRun(run)} style={{ cursor: 'pointer' }}>
              <td className="timestamp">{formatTime(run.timestamp)}</td>
              <td className="channel">{run.channel_name || run.channel_id}</td>
              <td className="type">{run.report_type}</td>
              <td className="status">{getStatusBadge(run.status)}</td>
              <td className="duration">{run.duration_ms ? `${run.duration_ms}ms` : '-'}</td>
              <td className="summary" title={run.summary_text}>
                {run.summary_text ? run.summary_text.substring(0, 50) + '...' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
