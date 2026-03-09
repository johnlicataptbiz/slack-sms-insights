import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../api/client';
import { V2Panel, V2State } from './V2Primitives';
import './ChangelogPanel.css';

type ChangelogEntry = {
  hash: string;
  date: string;
  message: string;
  author: string;
  type: 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';
  category: string;
  description: string;
};

type ChangelogStats = {
  features: number;
  fixes: number;
  refactors: number;
  docs: number;
  other: number;
};

type ChangelogTimeline = {
  entries: ChangelogEntry[];
  totalCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  stats: ChangelogStats;
};

const typeColors: Record<ChangelogEntry['type'], string> = {
  feature: '#22c55e', // green
  fix: '#ef4444', // red
  refactor: '#3b82f6', // blue
  style: '#a855f7', // purple
  docs: '#f59e0b', // amber
  chore: '#6b7280', // gray
  other: '#9ca3af', // light gray
};

const typeLabels: Record<ChangelogEntry['type'], string> = {
  feature: 'Feature',
  fix: 'Fix',
  refactor: 'Refactor',
  style: 'Style',
  docs: 'Docs',
  chore: 'Chore',
  other: 'Other',
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const groupByDate = (entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> => {
  const grouped = new Map<string, ChangelogEntry[]>();
  
  for (const entry of entries) {
    const existing = grouped.get(entry.date) || [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }
  
  return grouped;
};

export const ChangelogPanel: React.FC = () => {
  const [days, setDays] = useState(30);
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['v2', 'changelog', days],
    queryFn: async () => {
      const response = await client.get<{ data: ChangelogTimeline }>(`/api/v2/changelog?days=${days}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: isOpen,
  });

  const groupedEntries = data?.entries ? groupByDate(data.entries) : new Map();
  const sortedDates = Array.from(groupedEntries.keys()).sort((a, b) => b.localeCompare(a));

  if (!isOpen) {
    return (
      <button 
        className="changelog-toggle-btn"
        onClick={() => setIsOpen(true)}
        title="View changelog"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Changelog</span>
      </button>
    );
  }

  return (
    <div className="changelog-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) setIsOpen(false);
    }}>
      <div className="changelog-modal">
        <div className="changelog-header">
          <div className="changelog-title">
            <h2>📋 Development Changelog</h2>
            <p className="changelog-subtitle">
              Features, fixes & improvements by Jack Licata
            </p>
          </div>
          <button className="changelog-close" onClick={() => setIsOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="changelog-controls">
          <div className="changelog-filters">
            <label>Time range:</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          
          {data?.stats && (
            <div className="changelog-stats">
              <span className="stat-badge feature" title="Features">
                ✨ {data.stats.features}
              </span>
              <span className="stat-badge fix" title="Fixes">
                🐛 {data.stats.fixes}
              </span>
              <span className="stat-badge refactor" title="Refactors">
                🔧 {data.stats.refactors}
              </span>
              <span className="stat-badge docs" title="Docs">
                📚 {data.stats.docs}
              </span>
              <span className="stat-total">
                {data.totalCount} total
              </span>
            </div>
          )}
        </div>

        <div className="changelog-content">
          {isLoading && (
            <V2State kind="loading">Loading changelog...</V2State>
          )}
          
          {error && (
            <V2State kind="error">
              Failed to load changelog: {error instanceof Error ? error.message : 'Unknown error'}
            </V2State>
          )}

          {!isLoading && !error && data && sortedDates.length === 0 && (
            <V2State kind="empty">No changes found for the selected period.</V2State>
          )}

          {!isLoading && !error && sortedDates.length > 0 && (
            <div className="changelog-timeline">
              {sortedDates.map((date: string) => (
                <div key={date} className="changelog-day">
                  <div className="changelog-day-header">
                    <span className="changelog-date">{formatDate(date)}</span>
                    <span className="changelog-count">
                      {groupedEntries.get(date)?.length} changes
                    </span>
                  </div>
                  
                  <div className="changelog-entries">
                    {groupedEntries.get(date)?.map((entry: ChangelogEntry, idx: number) => (
                      <div key={`${entry.hash}-${idx}`} className="changelog-entry">
                        <div className="entry-type-badge" style={{ 
                          backgroundColor: `${typeColors[entry.type]}20`,
                          color: typeColors[entry.type],
                          borderColor: typeColors[entry.type]
                        }}>
                          {typeLabels[entry.type]}
                        </div>
                        
                        <div className="entry-content">
                          <div className="entry-header">
                            <span className="entry-category">{entry.category}</span>
                            <span className="entry-hash" title={entry.hash}>
                              {entry.hash.slice(0, 7)}
                            </span>
                          </div>
                          <p className="entry-description">{entry.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="changelog-footer">
          <p>
            Showing changes from {data?.dateRange.from ? formatDate(data.dateRange.from) : '...'} 
            {' to '}
            {data?.dateRange.to ? formatDate(data.dateRange.to) : '...'}
          </p>
          <p className="changelog-hint">Click outside or ✕ to close</p>
        </div>
      </div>
    </div>
  );
};
