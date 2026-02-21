import React, { useEffect, useState } from 'react';
import RunList from '../components/RunList';
import '../styles/DataPages.css';
import '../styles/Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || '';

type Run = {
  id: string;
  timestamp: string;
  is_legacy?: boolean | null;
  channel_id: string;
  channel_name: string;
  report_type: string;
  status: 'success' | 'error' | 'pending';
  summary_text: string;
  full_report: string;
  duration_ms: number;
};

type ChannelOption = {
  channel_id: string;
  channel_name: string | null;
  run_count: number;
};

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [legacyRuns, setLegacyRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);

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

      const legacyParams = new URLSearchParams(params);
      legacyParams.set('raw', 'true');
      legacyParams.set('legacyOnly', 'true');
      legacyParams.set('limit', '200');
      legacyParams.set('offset', '0');

      const legacyResponse = await fetch(`${API_URL}/api/runs?${legacyParams}`);
      if (!legacyResponse.ok) {
        throw new Error(`Legacy API error: ${legacyResponse.status}`);
      }

      const data = await response.json();
      const legacyData = await legacyResponse.json();
      setRuns(data.runs || []);
      setLegacyRuns((legacyData.runs || []).filter((r: Run) => r.is_legacy === true));
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
    <div className="DataPage dashboard-container">
      <header className="DataPage__header">
        <h1 className="DataPage__title">Daily Runs</h1>
      </header>
      <p className="DataPage__subtitle">
        Historical run log and run detail viewer. Filters apply to the API query window directly.
      </p>

      <div className="DataPanel dashboard-filters">
        <div className="dashboard-filters__grid">
          <div className="dashboard-filter-group">
            <label>Days Back</label>
            <select aria-label="Days back" value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          <div className="dashboard-filter-group">
            <label>Channel</label>
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
        </div>

        <button onClick={() => fetchRuns(false)} className="dashboard-refresh-button">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="DataError">
          <div className="DataError__title">Failed to load runs</div>
          <div className="DataCode">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="DataLoading dashboard-state">Loading runs...</div>
      ) : runs.length === 0 ? (
        <div className="dashboard-state dashboard-state--empty">
          <p>No reports found for the selected period</p>
        </div>
      ) : (
        <>
          <RunList runs={runs} />
          <details className="DataDetails dashboard-legacy">
            <summary>📁 Legacy runs ({legacyRuns.length})</summary>
            <div className="DataDetails__body">
              {legacyRuns.length === 0 ? (
                <div className="dashboard-state dashboard-state--empty">No legacy runs in this filter window.</div>
              ) : (
                <RunList runs={legacyRuns} />
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
