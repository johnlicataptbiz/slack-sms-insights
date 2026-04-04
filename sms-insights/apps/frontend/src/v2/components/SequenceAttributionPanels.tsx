import { useMemo } from 'react';
import type {
  AttributionMethodDailyRowV2,
  AttributionReviewQueueRowV2,
  RepResponseDailyRowV2,
  SequenceFunnelDailyRowV2,
  UnresolvedAttributionRowV2,
} from '../../api/v2-types';
import { V2Badge, V2Panel } from './V2Primitives';

const fmtInt = (value: number) => value.toLocaleString();
const fmtPct = (value: number) => `${value.toFixed(1)}%`;

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const formatMinutes = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value < 60) return `${Math.round(value)}m`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${minutes}m`;
};

const formatDays = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${value.toFixed(2)}d`;
  return `${value.toFixed(1)}d`;
};

export function SequenceFunnelPanel({
  rows,
}: { rows: SequenceFunnelDailyRowV2[] }) {
  const rowsByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        day: string;
        new_leads_contacted: number;
        leads_replied: number;
        qualified_leads: number;
        booked_calls: number;
        opt_outs: number;
      }
    >();

    for (const row of rows) {
      const existing = map.get(row.day) || {
        day: row.day,
        new_leads_contacted: 0,
        leads_replied: 0,
        qualified_leads: 0,
        booked_calls: 0,
        opt_outs: 0,
      };
      existing.new_leads_contacted += row.new_leads_contacted;
      existing.leads_replied += row.leads_replied;
      existing.qualified_leads += row.qualified_leads;
      existing.booked_calls += row.booked_calls;
      existing.opt_outs += row.opt_outs;
      map.set(row.day, existing);
    }

    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const totals = useMemo(() => {
    return rowsByDay.reduce(
      (acc, row) => {
        acc.contacted += row.new_leads_contacted;
        acc.replied += row.leads_replied;
        acc.qualified += row.qualified_leads;
        acc.booked += row.booked_calls;
        acc.optOuts += row.opt_outs;
        return acc;
      },
      { contacted: 0, replied: 0, qualified: 0, booked: 0, optOuts: 0 },
    );
  }, [rowsByDay]);

  if (rowsByDay.length === 0) return null;

  return (
    <V2Panel
      title="Sequence Funnel"
      caption="Daily contacted-to-booked funnel across the selected range."
    >
      <div className="V2SplitStat" style={{ marginBottom: '1rem' }}>
        <div>
          <span>Contacted</span>
          <strong>{fmtInt(totals.contacted)}</strong>
        </div>
        <div>
          <span>Replied</span>
          <strong>{fmtInt(totals.replied)}</strong>
        </div>
        <div>
          <span>Qualified</span>
          <strong>{fmtInt(totals.qualified)}</strong>
        </div>
        <div>
          <span>Booked</span>
          <strong>{fmtInt(totals.booked)}</strong>
        </div>
      </div>

      <div className="V2TableWrap V2TableWrap--sequences">
        <table className="V2Table V2Table--sequences">
          <thead>
            <tr>
              <th>Day</th>
              <th className="is-right">Contacted</th>
              <th className="is-right">Replied</th>
              <th className="is-right">Qualified</th>
              <th className="is-right">Booked</th>
              <th className="is-right">Opt-outs</th>
            </tr>
          </thead>
          <tbody>
            {rowsByDay.slice(-8).map((row) => (
              <tr key={row.day}>
                <td>{formatDate(row.day)}</td>
                <td className="is-right">{fmtInt(row.new_leads_contacted)}</td>
                <td className="is-right">{fmtInt(row.leads_replied)}</td>
                <td className="is-right">{fmtInt(row.qualified_leads)}</td>
                <td className="is-right">{fmtInt(row.booked_calls)}</td>
                <td className="is-right">{fmtInt(row.opt_outs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </V2Panel>
  );
}

export function AttributionReviewQueuePanel({
  rows,
}: { rows: AttributionReviewQueueRowV2[] }) {
  const visibleRows = rows.slice(0, 6);

  if (rows.length === 0) return null;

  return (
    <V2Panel
      title="Attribution Review Queue"
      caption="Ambiguous bookings that need a second look."
    >
      <div className="V2TableWrap V2TableWrap--sequences">
        <table className="V2Table V2Table--sequences">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Issue</th>
              <th>Summary</th>
              <th>Status</th>
              <th className="is-right">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const candidateCount = Array.isArray(row.candidate_sequences)
                ? row.candidate_sequences.length
                : row.candidate_sequences &&
                    typeof row.candidate_sequences === 'object'
                  ? Object.keys(row.candidate_sequences).length
                  : 0;

              return (
                <tr key={row.id}>
                  <td>
                    <V2Badge
                      variant={
                        row.priority >= 80
                          ? 'critical'
                          : row.priority >= 50
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {row.priority}
                    </V2Badge>
                  </td>
                  <td>{row.issue_type || 'unknown'}</td>
                  <td title={row.issue_summary || ''}>
                    {row.issue_summary || 'No summary'}
                    <div
                      style={{ fontSize: '0.75rem', color: 'var(--v2-muted)' }}
                    >
                      {candidateCount} candidate
                      {candidateCount === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td>{row.status || 'open'}</td>
                  <td className="is-right">
                    {row.resolved_at ? formatDate(row.resolved_at) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </V2Panel>
  );
}

export function UnresolvedAttributionPanel({
  rows,
}: { rows: UnresolvedAttributionRowV2[] }) {
  const visibleRows = rows.slice(0, 6);

  if (rows.length === 0) return null;

  return (
    <V2Panel
      title="Unresolved Attributions"
      caption="Latest bookings that still need a sequence decision."
    >
      <div className="V2TableWrap V2TableWrap--sequences">
        <table className="V2Table V2Table--sequences">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Sequence</th>
              <th className="is-right">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.booked_call_id}>
                <td>{formatDate(row.booked_event_ts)}</td>
                <td>
                  <V2Badge variant={row.needs_review ? 'warning' : 'default'}>
                    {row.attribution_status || 'unknown'}
                  </V2Badge>
                </td>
                <td title={row.review_reason || ''}>
                  {row.review_reason || '—'}
                </td>
                <td title={row.resolved_sequence_label || ''}>
                  {row.resolved_sequence_label || '—'}
                </td>
                <td className="is-right">
                  {row.created_at ? formatDate(row.created_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </V2Panel>
  );
}

export function AttributionMethodPanel({
  rows,
}: { rows: AttributionMethodDailyRowV2[] }) {
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.matched += row.matched_calls;
        acc.manual += row.manual_direct_calls;
        acc.unattributed += row.unattributed_calls;
        acc.phone += row.sms_phone_match_calls;
        acc.fuzzy += row.fuzzy_match_calls;
        acc.reply += row.reply_linked_calls;
        return acc;
      },
      { matched: 0, manual: 0, unattributed: 0, phone: 0, fuzzy: 0, reply: 0 },
    );
  }, [rows]);

  const totalCalls = totals.matched + totals.manual + totals.unattributed;
  if (totalCalls === 0) return null;

  return (
    <V2Panel
      title="Attribution Methods"
      caption="How booked calls were matched in the selected range."
    >
      <div className="V2SplitStat" style={{ marginBottom: '0.75rem' }}>
        <div>
          <span>Matched</span>
          <strong>{fmtInt(totals.matched)}</strong>
          <small>
            {fmtPct(totalCalls > 0 ? (totals.matched / totalCalls) * 100 : 0)}
          </small>
        </div>
        <div>
          <span>Manual</span>
          <strong>{fmtInt(totals.manual)}</strong>
          <small>
            {fmtPct(totalCalls > 0 ? (totals.manual / totalCalls) * 100 : 0)}
          </small>
        </div>
        <div>
          <span>Unattributed</span>
          <strong>{fmtInt(totals.unattributed)}</strong>
          <small>
            {fmtPct(
              totalCalls > 0 ? (totals.unattributed / totalCalls) * 100 : 0,
            )}
          </small>
        </div>
      </div>

      <div className="V2TableWrap V2TableWrap--sequences">
        <table className="V2Table V2Table--sequences">
          <thead>
            <tr>
              <th>Method</th>
              <th className="is-right">Calls</th>
              <th className="is-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'SMS phone match', value: totals.phone },
              { label: 'Fuzzy match', value: totals.fuzzy },
              { label: 'Reply linked', value: totals.reply },
            ].map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="is-right">{fmtInt(row.value)}</td>
                <td className="is-right">
                  {fmtPct(totalCalls > 0 ? (row.value / totalCalls) * 100 : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </V2Panel>
  );
}

export function RepResponsePanel({ rows }: { rows: RepResponseDailyRowV2[] }) {
  const byRep = useMemo(() => {
    const map = new Map<
      string,
      {
        rep: string;
        newLeads: number;
        replied: number;
        booked: number;
        replyMedians: number[];
        bookMedians: number[];
      }
    >();

    for (const row of rows) {
      const repKey = row.rep_id || 'unknown';
      const existing = map.get(repKey) || {
        rep: repKey,
        newLeads: 0,
        replied: 0,
        booked: 0,
        replyMedians: [],
        bookMedians: [],
      };
      existing.newLeads += row.new_leads_contacted;
      existing.replied += row.leads_replied;
      existing.booked += row.booked_calls;
      if (row.median_reply_time_minutes !== null)
        existing.replyMedians.push(row.median_reply_time_minutes);
      if (row.median_book_time_days !== null)
        existing.bookMedians.push(row.median_book_time_days);
      map.set(repKey, existing);
    }

    return [...map.values()].sort(
      (a, b) => b.booked - a.booked || b.replied - a.replied,
    );
  }, [rows]);

  if (byRep.length === 0) return null;

  const avg = (values: number[]) =>
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

  return (
    <V2Panel
      title="Rep Response"
      caption="Contacted-to-booked funnel and timing by rep."
    >
      <div className="V2TableWrap V2TableWrap--sequences">
        <table className="V2Table V2Table--sequences">
          <thead>
            <tr>
              <th>Rep</th>
              <th className="is-right">Contacted</th>
              <th className="is-right">Replied</th>
              <th className="is-right">Booked</th>
              <th className="is-right">Median reply</th>
              <th className="is-right">Median book</th>
            </tr>
          </thead>
          <tbody>
            {byRep.map((row) => (
              <tr key={row.rep}>
                <td style={{ textTransform: 'capitalize' }}>{row.rep}</td>
                <td className="is-right">{fmtInt(row.newLeads)}</td>
                <td className="is-right">{fmtInt(row.replied)}</td>
                <td className="is-right">{fmtInt(row.booked)}</td>
                <td className="is-right">
                  {formatMinutes(avg(row.replyMedians))}
                </td>
                <td className="is-right">{formatDays(avg(row.bookMedians))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </V2Panel>
  );
}
