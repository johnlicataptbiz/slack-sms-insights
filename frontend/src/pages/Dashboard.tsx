import React, { useEffect, useState } from 'react';
import RunList from '../components/RunList';
import '../styles/Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || '';

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

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);

  const fetchRuns = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        daysBack: daysBack.toString(),
        limit: '50',
      });
      if (selectedChannelId) {
        params.append('channelId', selectedChannelId);
      }

      const response = await fetch(`${API_URL}/api/runs?${params}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await fetch(`${API_URL}/api/channels`);

      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels || []);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  useEffect(() => {
    fetchRuns(true);
    const interval = setInterval(() => fetchRuns(false), 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [daysBack, selectedChannelId]);

  return (
    <div className="dashboard-container">
      <header className="Insights__header">
        <h1>Daily Report History</h1>
      </header>

      <div className="filters">
        <div className="filter-group">
          <label>Days Back:</label>
          <select aria-label="Days back" value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value))}>
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Channel:</label>
          <select
            aria-label="Channel"
            value={selectedChannelId || ''}
            onChange={(e) => setSelectedChannelId(e.target.value || null)}
          >
            <option value="">All Channels</option>
            {channels.map((ch, idx) => (
              <option key={`${ch.channel_id}-${ch.channel_name ?? ''}-${idx}`} value={ch.channel_id}>
                {ch.channel_name || ch.channel_id} ({ch.run_count})
              </option>
            ))}
          </select>
        </div>

        <button onClick={() => fetchRuns(false)} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading runs...</div>
      ) : runs.length === 0 ? (
        <div className="empty-state">
          <p>No reports found for the selected period</p>
        </div>
      ) : (
        <RunList runs={runs} />
      )}
    </div>
  );
}
