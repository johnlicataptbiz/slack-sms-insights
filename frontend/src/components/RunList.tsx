import React, { useState, useMemo } from 'react';
import RunDetail from './RunDetail';
import '../styles/RunList.css';

type Run = {
  id: string;
  timestamp: string;
  report_date?: string;
  channel_id: string;
  channel_name: string;
  report_type: string;
  status: 'success' | 'error' | 'pending';
  summary_text: string;
  full_report: string;
  duration_ms: number;
};

export default function RunList({ runs }: { runs: Run[] }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'timestamp', direction: 'desc' });
  const selectedRun = runs.find(r => r.id === selectedRunId) || null;

  const formatTime = (isoString: string, reportDate?: string) => {
    const date = new Date(reportDate || isoString);
    if (reportDate) {
      // For historical reports with just a date, show the date in UTC to avoid shifting
      return date.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    }
    // For real-time runs, show the full local timestamp
    return date.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const statusClass = `badge badge-${status}`;
    return <span className={statusClass}>{status.toUpperCase()}</span>;
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedRuns = useMemo(() => {
    if (!sortConfig) return runs;

    return [...runs].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortConfig.key) {
        case 'timestamp':
          aValue = new Date(a.report_date || a.timestamp).getTime();
          bValue = new Date(b.report_date || b.timestamp).getTime();
          break;
        case 'channel':
          aValue = (a.channel_name || a.channel_id).toLowerCase();
          bValue = (b.channel_name || b.channel_id).toLowerCase();
          break;
        case 'type':
          aValue = a.report_type.toLowerCase();
          bValue = b.report_type.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'duration':
          aValue = a.duration_ms || 0;
          bValue = b.duration_ms || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [runs, sortConfig]);

  if (selectedRun) {
    return <RunDetail run={selectedRun} onBack={() => setSelectedRunId(null)} />;
  }

  return (
    <div className="run-list">
      <table className="runs-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSort('timestamp')}>
              Report Date {sortConfig?.key === 'timestamp' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSort('channel')}>
              Channel {sortConfig?.key === 'channel' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSort('type')}>
              Type {sortConfig?.key === 'type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSort('status')}>
              Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSort('duration')}>
              Duration {sortConfig?.key === 'duration' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {sortedRuns.map((run) => (
            <tr key={run.id} onClick={() => setSelectedRunId(run.id)} style={{ cursor: 'pointer' }}>
              <td className="timestamp">{formatTime(run.timestamp, run.report_date)}</td>
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
