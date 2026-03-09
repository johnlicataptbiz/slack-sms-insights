import { useMemo, useState, useEffect } from 'react';
import type { UnattributedAuditRow } from '../../api/v2-types';
import { V2Panel, V2State, V2Skeleton } from './V2Primitives';
import { exportToCSV, formatDateForFilename } from '../../utils/export';

// Formatting utilities
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

// Type definitions
export interface MergedSeqRow {
  label: string;
  leadMagnet: string;
  version: string;
  firstSeenAt: string | null;
  messagesSent: number;
  uniqueContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  bookingRatePct: number;
  canonicalBookedAfterSmsReply: number;
  canonicalBookedJack: number;
  canonicalBookedBrandon: number;
  canonicalBookedSelf: number;
  optOuts: number;
  optOutRatePct: number;
  bookedAuditRows: any[];
  diagnosticSmsBookingSignals: number;
  isManual: boolean;
  uniqueReplied: number;
  smsReplyPct: number | null;
  // Reply timing fields
  medianTimeToFirstReplyMinutes?: number | null;
  avgTimeToFirstReplyMinutes?: number | null;
}

const parseVersionParts = (value: string): number[] | null => {
  const match = value.toLowerCase().match(/v?(\d+(?:\.\d+)*)/);
  if (!match) return null;
  const raw = match[1] ?? '';
  if (!raw) return null;
  const parts = raw
    .split('.')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  return parts.length > 0 ? parts : null;
};

const compareVersionParts = (a: number[] | null, b: number[] | null): number => {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
};

const extractVersionDisplay = (label: string): string => {
  const match = label.match(/(?:v\d+(?:\.\d+)*|\b\d+(?:\.\d+)+)\b/i);
  return match?.[0] ?? '';
};

interface StatDeltaProps {
  current: number;
  previous: number;
  isPct?: boolean;
}

function StatDelta({ current, previous, isPct = true }: StatDeltaProps) {
  if (!previous || previous === 0) return null;
  const diff = current - previous;
  const isPositive = diff > 0;
  const symbol = isPositive ? '+' : '';
  
  return (
    <span className={`V2Delta ${isPositive ? 'V2Delta--positive' : 'V2Delta--negative'}`}>
      {symbol}{isPct ? diff.toFixed(1) : diff.toLocaleString()}{isPct ? '%' : ''}
    </span>
  );
}

interface SequencePerformanceTableProps {
  mergedRows: MergedSeqRow[];
  unattributedAuditRows?: UnattributedAuditRow[] | undefined;
  modeLabel: string;
  mode?: string;
}

type SortKey = 'label' | 'messagesSent' | 'replyRatePct' | 'canonicalBookedCalls' | 'bookingRatePct' | 'optOutRatePct';
type SortOrder = 'asc' | 'desc';

interface ColumnVisibility {
  version: boolean;
  volume: boolean;
  replyRate: boolean;
  bookingRate: boolean;
  optOuts: boolean;
  gaps: boolean;
}

interface TableControlsProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSortChange: (key: SortKey) => void;
  onSortOrderToggle: () => void;
  columnVisibility: ColumnVisibility;
  onColumnVisibilityChange: (key: keyof ColumnVisibility) => void;
  onExport: () => void;
  resultsCount: number;
  totalCount: number;
}

function TableControls({
  searchQuery,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortChange,
  onSortOrderToggle,
  columnVisibility,
  onColumnVisibilityChange,
  onExport,
  resultsCount,
  totalCount,
}: TableControlsProps) {
  return (
    <div className="V2TableControls">
      {/* Search */}
      <div className="V2TableControls__search">
        <input
          type="text"
          placeholder="Search sequences..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="V2TableControls__searchInput"
        />
      </div>

      {/* Sort Controls */}
      <div className="V2TableControls__sort">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="V2TableControls__select"
        >
          <option value="label">Sequence Name</option>
          <option value="messagesSent">Messages Sent</option>
          <option value="replyRatePct">Reply Rate</option>
          <option value="canonicalBookedCalls">Booked Calls</option>
          <option value="bookingRatePct">Booking Rate</option>
          <option value="optOutRatePct">Opt-Out Rate</option>
        </select>
        <button
          onClick={onSortOrderToggle}
          className="V2TableControls__sortBtn"
          title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Column Visibility */}
      <div className="V2TableControls__columns">
        {Object.entries(columnVisibility).map(([key, visible]) => (
          <button
            key={key}
            onClick={() => onColumnVisibilityChange(key as keyof ColumnVisibility)}
            className={`V2TableControls__chip ${visible ? 'is-active' : ''}`}
            title={key}
          >
            {key === 'version' && 'Ver'}
            {key === 'volume' && 'Vol'}
            {key === 'replyRate' && 'Reply'}
            {key === 'bookingRate' && 'Book'}
            {key === 'optOuts' && 'Opt-out'}
            {key === 'gaps' && 'Gaps'}
          </button>
        ))}
      </div>

      {/* Export & Results */}
      <div className="V2TableControls__actions">
        <span className="V2TableControls__count">
          {resultsCount} of {totalCount}
        </span>
        <button onClick={onExport} className="V2TableControls__exportBtn">
          Export CSV
        </button>
      </div>
    </div>
  );
}

function SequenceFamilyGroup({ 
  family, 
  familyRows, 
  unattributedAuditRows = [],
  columnVisibility,
  sortBy,
  sortOrder,
}: { 
  family: string; 
  familyRows: MergedSeqRow[];
  unattributedAuditRows?: UnattributedAuditRow[];
  columnVisibility: ColumnVisibility;
  sortBy: SortKey;
  sortOrder: SortOrder;
}) {
  const {
    sortedVersions,
    avgReplyRate,
    avgBookingRate,
    hasMultipleVersions,
  } = useMemo(() => {
    const sorted = [...familyRows].sort((a, b) => {
      const aVer = parseVersionParts(extractVersionDisplay(a.label) || a.version);
      const bVer = parseVersionParts(extractVersionDisplay(b.label) || b.version);
      return compareVersionParts(bVer, aVer);
    });

    const contacts = familyRows.reduce((s, r) => s + r.uniqueContacted, 0);
    const replied = familyRows.reduce((s, r) => s + r.repliesReceived, 0);
    const booked = familyRows.reduce((s, r) => s + r.canonicalBookedCalls, 0);
    const sent = familyRows.reduce((s, r) => s + r.messagesSent, 0);
    const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
    const bookingRate = contacts > 0 ? (booked / contacts) * 100 : 0;
    const multipleVersions = familyRows.length > 1;

    return {
      sortedVersions: sorted,
      avgReplyRate: replyRate,
      avgBookingRate: bookingRate,
      hasMultipleVersions: multipleVersions,
    };
  }, [familyRows]);

  // Find the "Champion" (best booking rate with enough volume)
  const championLabel = useMemo(() => {
    let best = -1;
    let winner = '';
    familyRows.forEach(r => {
      if (r.uniqueContacted >= 50 && r.bookingRatePct > best) {
        best = r.bookingRatePct;
        winner = r.label;
      }
    });
    return winner;
  }, [familyRows]);

  return (
    <div className="V2Panel V2Panel--nested" style={{ border: '1px solid var(--v2-border)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
      {/* Group Header */}
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--v2-border)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{family}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--v2-text-dim)' }}>
              {familyRows.length} Iterations in Family
            </span>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--v2-accent)' }}>{fmtPct(avgReplyRate)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase' }}>Avg Reply</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: avgBookingRate > 0 ? 'var(--v2-positive)' : 'var(--v2-text-dim)' }}>{fmtPct(avgBookingRate)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase' }}>Avg Booked</div>
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <table className="V2Table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--v2-text-dim)', textAlign: 'left', borderBottom: '1px solid var(--v2-border)' }}>
            {columnVisibility.version && <th style={{ padding: '0.75rem 1.25rem' }}>Version / Status</th>}
            {columnVisibility.volume && <th>Volume</th>}
            {columnVisibility.replyRate && <th>Reply Rate</th>}
            {columnVisibility.bookingRate && <th>Booking Rate</th>}
            {columnVisibility.optOuts && <th>Opt-Outs</th>}
            {columnVisibility.gaps && <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Gaps</th>}
          </tr>
        </thead>
        <tbody>
          {sortedVersions.map((row, idx) => {
            const prevVersion = sortedVersions[idx + 1];
            const versionLabel = extractVersionDisplay(row.label) || row.version || 'v?';
            const isExperimental = idx === 0 && hasMultipleVersions;
            const isChampion = row.label === championLabel;
            
            // Link Gaps
            const gaps = unattributedAuditRows.filter(g => g.bestFuzzyCandidate === row.label);

            return (
              <tr key={row.label} style={{ borderBottom: idx < sortedVersions.length -1 ? '1px solid var(--v2-border)' : 'none' }}>
                {columnVisibility.version && (
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <div className="V2ExperimentMeta">
                      <span className="V2ExperimentMeta__version">{versionLabel}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {isChampion && <span className="V2Badge V2Badge--champion">Champion</span>}
                        {isExperimental && <span className="V2Badge V2Badge--experimental">Latest</span>}
                        {row.uniqueContacted > 0 && row.uniqueContacted < 50 && <span className="V2Badge V2Badge--confidenceLow">Low Sample</span>}
                      </div>
                    </div>
                  </td>
                )}
                {columnVisibility.volume && (
                  <td>
                    <div style={{ fontWeight: 500 }}>{fmtInt(row.uniqueContacted)} <span style={{ color: 'var(--v2-text-dim)', fontSize: '0.75rem' }}>leads</span></div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)' }}>{fmtInt(row.messagesSent)} msgs</div>
                  </td>
                )}
                {columnVisibility.replyRate && (
                  <td>
                    <div className="V2StatComparison">
                      <span className="V2Table__cell--main-metric" style={{ color: row.replyRatePct >= 10 ? 'var(--v2-positive)' : 'inherit' }}>
                        {fmtPct(row.replyRatePct)}
                      </span>
                      <StatDelta current={row.replyRatePct} previous={prevVersion?.replyRatePct ?? 0} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)' }}>{fmtInt(row.repliesReceived)} interactions</div>
                  </td>
                )}
                {columnVisibility.bookingRate && (
                  <td>
                    <div className="V2StatComparison">
                      <span className="V2Table__cell--main-metric" style={{ color: row.bookingRatePct >= 2 ? 'var(--v2-positive)' : 'inherit' }}>
                        {fmtPct(row.bookingRatePct)}
                      </span>
                      <StatDelta current={row.bookingRatePct} previous={prevVersion?.bookingRatePct ?? 0} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)', display: 'flex', gap: '8px' }}>
                      <span>{fmtInt(row.canonicalBookedCalls)} calls</span>
                      {(row.canonicalBookedJack > 0 || row.canonicalBookedBrandon > 0 || row.canonicalBookedSelf > 0) && (
                        <span style={{ color: 'var(--v2-text-dim)', opacity: 0.8 }}>
                          ({[
                            row.canonicalBookedJack > 0 && `J:${row.canonicalBookedJack}`,
                            row.canonicalBookedBrandon > 0 && `B:${row.canonicalBookedBrandon}`,
                            row.canonicalBookedSelf > 0 && `S:${row.canonicalBookedSelf}`
                          ].filter(Boolean).join(' ')})
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {columnVisibility.optOuts && (
                  <td>
                    <div style={{ color: row.optOutRatePct >= 6 ? 'var(--v2-warning)' : 'inherit' }}>
                      {fmtPct(row.optOutRatePct)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)' }}>{row.optOuts} total</div>
                  </td>
                )}
                {columnVisibility.gaps && (
                  <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                    {gaps.length > 0 ? (
                      <div className="V2Table__cell--gap-warning" title={`${gaps.length} booked calls almost matched this version but were below the fuzzy threshold.`}>
                        ⚠️ {gaps.length} Gaps
                      </div>
                    ) : (
                      <span style={{ color: 'var(--v2-text-dim)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const columnVisibilityStorageKey = 'v2_sequences_column_visibility_v1';

export function SequencePerformanceTable({ 
  mergedRows, 
  modeLabel, 
  unattributedAuditRows = [],
  mode = '7d',
}: SequencePerformanceTableProps) {
  // State for table controls
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('canonicalBookedCalls');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Load column visibility from localStorage
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    if (typeof window === 'undefined') {
      return {
        version: true,
        volume: true,
        replyRate: true,
        bookingRate: true,
        optOuts: true,
        gaps: true,
      };
    }
    try {
      const saved = localStorage.getItem(columnVisibilityStorageKey);
      if (saved) {
        return { ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parse errors
    }
    return {
      version: true,
      volume: true,
      replyRate: true,
      bookingRate: true,
      optOuts: true,
      gaps: true,
    };
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Persist column visibility to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(columnVisibilityStorageKey, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  // Filter and sort rows
  const processedRows = useMemo(() => {
    let rows = mergedRows.filter((r) => !r.isManual);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter(r => 
        r.label.toLowerCase().includes(query) ||
        r.leadMagnet.toLowerCase().includes(query) ||
        r.version.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    rows = [...rows].sort((a, b) => {
      let aVal: number | string = a[sortBy];
      let bVal: number | string = b[sortBy];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [mergedRows, searchQuery, sortBy, sortOrder]);

  // Group by family
  const { familyEntries, activeSequenceCount, uniqueFamilyCount } = useMemo(() => {
    const grouped = processedRows.reduce((acc, row) => {
      const family = row.leadMagnet || 'Not Captured Yet';
      if (!acc[family]) acc[family] = [];
      acc[family].push(row);
      return acc;
    }, {} as Record<string, MergedSeqRow[]>);

    return {
      familyEntries: Object.entries(grouped),
      activeSequenceCount: processedRows.length,
      uniqueFamilyCount: Object.keys(grouped).length,
    };
  }, [processedRows]);

  // Export handler
  const handleExport = () => {
    const filename = `sequences-${mode}-${formatDateForFilename()}.csv`;
    exportToCSV(processedRows, filename);
  };

  // Toggle column visibility
  const toggleColumn = (key: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  if (activeSequenceCount === 0) {
    return (
      <V2Panel title="Sequence Performance" caption={`${modeLabel} · Booked = Slack-verified`}>
        <V2State kind="empty">No sequence data for this window.</V2State>
      </V2Panel>
    );
  }

  return (
    <V2Panel
      title="Sequence Performance Dashboard"
      caption={`Iterative tracking across ${uniqueFamilyCount} sequence families · ${modeLabel} · Booked = Slack-verified`}
    >
      <TableControls
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={setSortBy}
        onSortOrderToggle={toggleSortOrder}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={toggleColumn}
        onExport={handleExport}
        resultsCount={processedRows.length}
        totalCount={mergedRows.filter(r => !r.isManual).length}
      />
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1.5rem' }}>
        {familyEntries.map(([family, familyRows]) => (
          <SequenceFamilyGroup 
            key={family} 
            family={family} 
            familyRows={familyRows} 
            unattributedAuditRows={unattributedAuditRows}
            columnVisibility={columnVisibility}
            sortBy={sortBy}
            sortOrder={sortOrder}
          />
        ))}
      </div>
    </V2Panel>
  );
}
