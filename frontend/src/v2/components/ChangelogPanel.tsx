import { useMemo, useState } from 'react';
import { useV2Changelog } from '../../api/v2Queries';
import type { ChangelogEntry } from '../../api/v2-types';
import './ChangelogPanel.css';

const TYPE_COLORS: Record<string, string> = {
  feature: 'var(--v2-positive)',
  fix: 'var(--v2-warning)',
  refactor: 'var(--v2-accent)',
  style: 'var(--v2-info)',
  docs: 'var(--v2-muted)',
  chore: 'var(--v2-text-dim)',
  other: 'var(--v2-text-dim)',
};

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  fix: 'Fix',
  refactor: 'Refactor',
  style: 'Style',
  docs: 'Docs',
  chore: 'Chore',
  other: 'Other',
};

export function ChangelogPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [days, setDays] = useState(30);
  
  const { data, isLoading, error } = useV2Changelog({ days });
  
  const timeline = data?.data;
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  };
  
  // Group entries by date
  const groupedEntries = useMemo<Record<string, ChangelogEntry[]>>(() => {
    const entries = timeline?.entries;
    if (!entries) return {};
    
    const result: Record<string, ChangelogEntry[]> = {};
    
    for (const entry of entries) {
      const datePart = entry.date.split('T')[0];
      if (!datePart) continue;
      const dateKey: string = datePart;
      if (!result[dateKey]) {
        result[dateKey] = [];
      }
      result[dateKey].push(entry);
    }
    
    return result;
  }, [timeline?.entries]);
  
  const sortedDates = useMemo<string[]>(() => 
    Object.keys(groupedEntries).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    ), 
  [groupedEntries]);
  
  return (
    <>
      {/* Changelog Button */}
      <button
        type="button"
        className="ChangelogButton"
        onClick={() => setIsOpen(true)}
        title="View changelog"
        aria-label="Open changelog"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="ChangelogButton__label">Updates</span>
        {timeline && timeline.totalCount > 0 && (
          <span className="ChangelogButton__badge">{timeline.totalCount}</span>
        )}
      </button>
      
      {/* Modal Overlay */}
      {isOpen && (
        <div className="ChangelogModal__overlay" onClick={() => setIsOpen(false)}>
          <div className="ChangelogModal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="ChangelogModal__header">
              <h2 className="ChangelogModal__title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Changelog
              </h2>
              <button
                type="button"
                className="ChangelogModal__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close changelog"
              >
                ×
              </button>
            </div>
            
            {/* Time Range Selector */}
            <div className="ChangelogModal__filters">
              <div className="ChangelogModal__timeRange">
                <label>Show changes from:</label>
                <select 
                  value={days} 
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="ChangelogModal__select"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={180}>Last 6 months</option>
                  <option value={365}>Last year</option>
                </select>
              </div>
              
              {/* Stats */}
              {timeline?.stats && (
                <div className="ChangelogModal__stats">
                  <div className="ChangelogModal__stat" style={{ '--stat-color': TYPE_COLORS.feature } as React.CSSProperties}>
                    <span className="ChangelogModal__statValue">{timeline.stats.features}</span>
                    <span className="ChangelogModal__statLabel">Features</span>
                  </div>
                  <div className="ChangelogModal__stat" style={{ '--stat-color': TYPE_COLORS.fix } as React.CSSProperties}>
                    <span className="ChangelogModal__statValue">{timeline.stats.fixes}</span>
                    <span className="ChangelogModal__statLabel">Fixes</span>
                  </div>
                  <div className="ChangelogModal__stat" style={{ '--stat-color': TYPE_COLORS.refactor } as React.CSSProperties}>
                    <span className="ChangelogModal__statValue">{timeline.stats.refactors}</span>
                    <span className="ChangelogModal__statLabel">Refactors</span>
                  </div>
                  <div className="ChangelogModal__stat" style={{ '--stat-color': TYPE_COLORS.docs } as React.CSSProperties}>
                    <span className="ChangelogModal__statValue">{timeline.stats.docs}</span>
                    <span className="ChangelogModal__statLabel">Docs</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Content */}
            <div className="ChangelogModal__content">
              {isLoading ? (
                <div className="ChangelogModal__loading">
                  <div className="ChangelogModal__spinner" />
                  <p>Loading changelog...</p>
                </div>
              ) : error ? (
                <div className="ChangelogModal__error">
                  <p>Failed to load changelog</p>
                  <button 
                    type="button" 
                    onClick={() => window.location.reload()}
                    className="ChangelogModal__retry"
                  >
                    Retry
                  </button>
                </div>
              ) : sortedDates.length === 0 ? (
                <div className="ChangelogModal__empty">
                  <p>No changes found in the selected time range</p>
                </div>
              ) : (
                <div className="ChangelogModal__timeline">
                  {sortedDates.map((date: string) => (
                    <div key={date} className="ChangelogModal__dateGroup">
                      <div className="ChangelogModal__dateHeader">
                        <span className="ChangelogModal__date">
                          {formatRelativeDate(date)}
                        </span>
                        <span className="ChangelogModal__dateCount">
                          {groupedEntries[date]?.length ?? 0} changes
                        </span>
                      </div>
                      
                      <div className="ChangelogModal__entries">
                        {(groupedEntries[date] ?? []).map((entry: ChangelogEntry, index: number) => (
                          <div 
                            key={`${entry.hash}-${index}`} 
                            className="ChangelogModal__entry"
                          >
                            <div 
                              className="ChangelogModal__entryType"
                              style={{ 
                                backgroundColor: TYPE_COLORS[entry.type] || TYPE_COLORS.other,
                                color: entry.type === 'docs' || entry.type === 'chore' ? 'var(--v2-bg)' : 'white'
                              }}
                              title={TYPE_LABELS[entry.type]}
                            >
                              {entry.type.charAt(0).toUpperCase()}
                            </div>
                            
                            <div className="ChangelogModal__entryContent">
                              <p className="ChangelogModal__entryDescription">
                                {entry.description}
                              </p>
                              
                              <div className="ChangelogModal__entryMeta">
                                <span className="ChangelogModal__entryCategory">
                                  {entry.category}
                                </span>
                                <span className="ChangelogModal__entryHash" title={entry.message}>
                                  {entry.hash}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="ChangelogModal__footer">
              <span className="ChangelogModal__footerText">
                {timeline?.dateRange && (
                  <>Showing changes from {formatDate(timeline.dateRange.from)} to {formatDate(timeline.dateRange.to)}</>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
