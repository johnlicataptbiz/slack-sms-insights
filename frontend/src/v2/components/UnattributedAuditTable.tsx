import { useMemo, useState } from 'react';
import type { UnattributedAuditRow } from '../../api/v2-types';
import { V2Panel } from './V2Primitives';

interface UnattributedAuditTableProps {
  rows: UnattributedAuditRow[];
}

export function UnattributedAuditTable({ rows }: UnattributedAuditTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime());
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <V2Panel 
      title="Unattributed Bookings (Audit)" 
      caption="Booked calls from Slack that could not be matched to a known sequence label via fuzzy matching."
    >
      <div className="V2ActionRow">
        <button
          type="button"
          className="V2Btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Hide Details' : `View ${rows.length} Unattributed Calls`}
        </button>
      </div>

      {isExpanded && (
        <div className="V2TableWrapper">
          <table className="V2Table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Contact</th>
                <th>Bucket</th>
                <th>First Message</th>
                <th>Fuzzy Match Attempt</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.bookedCallId}>
                  <td className="V2Table__cell--date">
                    <div className="V2DateWrap">
                      <span className="V2DateWrap__date">{new Date(row.eventTs).toLocaleDateString()}</span>
                      <span className="V2DateWrap__time">{new Date(row.eventTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </td>
                  <td>
                    <div className="V2ContactWrap">
                      <span className="V2ContactWrap__name">{row.contactName || 'Unknown'}</span>
                      <span className="V2ContactWrap__phone">{row.contactPhone}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`V2Badge V2Badge--${row.bucket}`}>
                      {row.bucket}
                    </span>
                  </td>
                  <td className="V2Table__cell--text">
                    <div className="V2AuditText" title={row.text || ''}>
                      {row.text || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="V2FuzzyCandidate">
                      {row.bestFuzzyCandidate || 'None'}
                    </div>
                  </td>
                  <td className="V2Table__cell--score">
                    <div className={`V2Score ${row.bestFuzzyScore > 0.8 ? 'V2Score--high' : ''}`}>
                      {Math.round(row.bestFuzzyScore * 100)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </V2Panel>
  );
}
