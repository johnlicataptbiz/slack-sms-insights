import { Fragment, useMemo, useState } from 'react';

import { useV2SalesMetrics, useV2Scoreboard } from '../../api/v2Queries';
import type { SalesMetricsV2, ScoreboardLeadMagnetRow } from '../../api/v2-types';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';

const BUSINESS_TZ = 'America/Chicago';
const MANUAL_LABEL = 'No sequence (manual/direct)';

type Mode = '7d' | '30d';
type Sort =
  | 'messagesSent'
  | 'replyRatePct'
  | 'canonicalBookedCalls'
  | 'canonicalBookedAfterSmsReply'
  | 'optOutRatePct';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

const fmtDay = (iso: string | null) => {
  if (!iso) return '—';
  const value = iso.trim();
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const utcDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return utcDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (value: string) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const maskPhone = (value: string | null) => {
  if (!value) return 'n/a';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return value;
  return `***${digits.slice(-4)}`;
};

const bucketLabel = (value: 'jack' | 'brandon' | 'selfBooked') => {
  if (value === 'jack') return 'Jack';
  if (value === 'brandon') return 'Brandon';
  return 'Self-booked';
};

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditRow = SalesMetricsV2['sequences'][0]['bookedAuditRows'][0];

type MergedSeqRow = {
  label: string;
  // metadata from scoreboard (window-independent)
  leadMagnet: string;
  version: string;
  // all numeric fields exclusively from sales-metrics (respects mode toggle)
  firstSeenAt: string | null;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  canonicalBookedAfterSmsReply: number;
  canonicalBookedJack: number;
  canonicalBookedBrandon: number;
  canonicalBookedSelf: number;
  optOuts: number;
  optOutRatePct: number;
  bookedAuditRows: AuditRow[];
  diagnosticSmsBookingSignals: number;
  isManual: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SequencesV2() {
  const [mode, setMode] = useState<Mode>('7d');
  const [sort, setSort] = useState<Sort>('messagesSent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());

  const salesMetricsQuery = useV2SalesMetrics({ range: mode, tz: BUSINESS_TZ });
  const scoreboardQuery = useV2Scoreboard({ tz: BUSINESS_TZ });

  const isLoading = salesMetricsQuery.isLoading || scoreboardQuery.isLoading;
  const isError = salesMetricsQuery.isError || scoreboardQuery.isError;

  const salesMetrics = salesMetricsQuery.data?.data;
  const scoreboard = scoreboardQuery.data?.data;

  // Build scoreboard lookup by label for leadMagnet / version / uniqueContacted
  const scoreboardByLabel = useMemo(() => {
    const map = new Map<string, NonNullable<typeof scoreboard>['sequences'][0]>();
    for (const seq of scoreboard?.sequences ?? []) {
      map.set(seq.label, seq);
    }
    return map;
  }, [scoreboard?.sequences]);

  // Merge: numeric fields exclusively from sales-metrics (time-range consistent).
  // Scoreboard is used only for window-independent metadata: leadMagnet, version.
  const mergedRows = useMemo((): MergedSeqRow[] => {
    const smSeqs = salesMetrics?.sequences ?? [];
    return smSeqs.map((seq) => {
      const sb = scoreboardByLabel.get(seq.label);
      return {
        label: seq.label,
        leadMagnet: sb?.leadMagnet && sb.leadMagnet !== seq.label ? sb.leadMagnet : '',
        version: sb?.version ?? '',
        firstSeenAt: seq.firstSeenAt,
        messagesSent: seq.messagesSent,
        repliesReceived: seq.repliesReceived,
        replyRatePct: seq.replyRatePct,
        canonicalBookedCalls: seq.canonicalBookedCalls,
        canonicalBookedAfterSmsReply: seq.canonicalBookedAfterSmsReply,
        canonicalBookedJack: seq.canonicalBookedJack,
        canonicalBookedBrandon: seq.canonicalBookedBrandon,
        canonicalBookedSelf: seq.canonicalBookedSelf,
        optOuts: seq.optOuts,
        optOutRatePct: seq.optOutRatePct,
        bookedAuditRows: seq.bookedAuditRows,
        diagnosticSmsBookingSignals: seq.diagnosticSmsBookingSignals,
        isManual: seq.label === MANUAL_LABEL,
      };
    });
  }, [salesMetrics?.sequences, scoreboardByLabel]);

  // Sort — manual/unattributed always last
  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...mergedRows].sort((a, b) => {
      if (a.isManual && !b.isManual) return 1;
      if (!a.isManual && b.isManual) return -1;
      switch (sort) {
        case 'messagesSent':
          return dir * (a.messagesSent - b.messagesSent);
        case 'replyRatePct':
          return dir * (a.replyRatePct - b.replyRatePct);
        case 'canonicalBookedCalls':
          return dir * (a.canonicalBookedCalls - b.canonicalBookedCalls);
        case 'canonicalBookedAfterSmsReply':
          return dir * (a.canonicalBookedAfterSmsReply - b.canonicalBookedAfterSmsReply);
        case 'optOutRatePct':
          return dir * (a.optOutRatePct - b.optOutRatePct);
        default:
          return 0;
      }
    });
  }, [mergedRows, sort, sortDir]);

  // KPI totals
  const kpis = useMemo(() => {
    const activeRows = mergedRows.filter((r) => !r.isManual && r.messagesSent > 0);
    const totalMessages = mergedRows.reduce((s, r) => s + r.messagesSent, 0);
    const totalReplied = mergedRows.reduce((s, r) => s + r.repliesReceived, 0);
    const totalBooked = mergedRows.reduce((s, r) => s + r.canonicalBookedCalls, 0);
    const avgReplyRate = totalMessages > 0 ? (totalReplied / totalMessages) * 100 : 0;
    return {
      activeSequences: activeRows.length,
      totalMessages,
      totalBooked,
      avgReplyRate,
    };
  }, [mergedRows]);

  const toggleExpanded = (label: string) => {
    setExpandedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleSortClick = (col: Sort) => {
    if (sort === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(col);
      setSortDir('desc');
    }
  };

  const sortArrow = (col: Sort) =>
    sort === col ? <span className="V2Table__sortArrow">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span> : null;

  const leadMagnetRows: ScoreboardLeadMagnetRow[] = scoreboard?.leadMagnetComparison ?? [];
  const monthlyBookings = scoreboard?.monthly.bookings;

  if (isLoading) {
    return (
      <div className="V2Page">
        <V2State kind="loading">Loading sequences…</V2State>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="V2Page">
        <V2State kind="error">Failed to load sequence data. Check your connection and try again.</V2State>
      </div>
    );
  }

  return (
    <div className="V2Page">
      {/* ── Header ── */}
      <V2PageHeader
        title="Sequences"
        subtitle={`Performance across all active sequences · ${mode === '7d' ? 'Last 7 days' : 'Last 30 days'}`}
        right={
          <div className="V2ControlsRow">
            <div className="V2ModeToggle">
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '7d' ? ' is-active' : ''}`}
                onClick={() => setMode('7d')}
              >
                7d
              </button>
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '30d' ? ' is-active' : ''}`}
                onClick={() => setMode('30d')}
              >
                30d
              </button>
            </div>
          </div>
        }
      />

      {/* ── KPI Summary ── */}
      <section className="V2MetricsGrid">
        <V2MetricCard
          label="Active Sequences"
          value={String(kpis.activeSequences)}
          meta={`${mode} window`}
        />
        <V2MetricCard
          label="Messages Sent"
          value={fmtInt(kpis.totalMessages)}
          meta="all sequences"
        />
        <V2MetricCard
          label="Booked Calls"
          value={fmtInt(kpis.totalBooked)}
          tone={kpis.totalBooked > 0 ? 'positive' : 'default'}
          meta="Slack-attributed (canonical)"
        />
        <V2MetricCard
          label="Avg Reply Rate"
          value={fmtPct(kpis.avgReplyRate)}
          tone={kpis.avgReplyRate >= 10 ? 'positive' : 'default'}
          meta="messages-sent basis"
        />
      </section>

      {/* ── Sequence Performance Table ── */}
      <V2Panel
        title="Sequence Performance"
        caption={`${sortedRows.length} sequences · all numbers from ${mode} rolling window · Booked = Slack-attributed canonical · click headers to sort`}
      >
        {sortedRows.length === 0 ? (
          <V2State kind="empty">No sequence data for this window.</V2State>
        ) : (
          <div className="V2TableWrap">
            <table className="V2Table V2Table--sequences">
              <thead>
                <tr>
                  <th className="V2Table__col--label">Sequence</th>
                  <th className="V2Table__col--leadMagnet">Lead Magnet</th>
                  <th className="V2Table__col--version">Ver.</th>
                  <th className="V2Table__col--date">First Seen</th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('messagesSent')}
                  >
                    Sent{sortArrow('messagesSent')}
                  </th>
                  <th className="is-right">Replied</th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('replyRatePct')}
                  >
                    Reply Rate{sortArrow('replyRatePct')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('canonicalBookedCalls')}
                  >
                    Booked{sortArrow('canonicalBookedCalls')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('canonicalBookedAfterSmsReply')}
                  >
                    w/ SMS Reply{sortArrow('canonicalBookedAfterSmsReply')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('optOutRatePct')}
                  >
                    Opt-Out Rate{sortArrow('optOutRatePct')}
                  </th>
                  <th className="is-right">Opt-Outs</th>
                  <th className="is-center V2Table__col--expand" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const expanded = expandedLabels.has(row.label);
                  const isHighOptOut = row.optOutRatePct >= 5 && row.messagesSent >= 10;
                  const isHighBooking = row.canonicalBookedCalls > 0 && !row.isManual;
                  const rowClass = [
                    'V2Table__row',
                    row.isManual ? 'V2Table__row--manual' : '',
                    isHighOptOut ? 'V2Table__row--warn' : '',
                    isHighBooking && !isHighOptOut ? 'V2Table__row--positive' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <Fragment key={row.label}>
                      <tr className={rowClass}>
                        <td className="V2Table__col--label">
                          <span className="V2Table__seqName" title={row.label}>
                            {row.label}
                          </span>
                        </td>
                        <td className="V2Table__col--leadMagnet">
                          {row.isManual ? (
                            <span className="V2Badge V2Badge--muted">manual</span>
                          ) : row.leadMagnet ? (
                            <span className="V2Table__leadMagnetText">{row.leadMagnet}</span>
                          ) : (
                            <span className="V2Table__dim">—</span>
                          )}
                        </td>
                        <td className="V2Table__col--version">
                          {row.version ? (
                            <span className="V2Badge V2Badge--version">{row.version}</span>
                          ) : (
                            <span className="V2Table__dim">—</span>
                          )}
                        </td>
                        <td className="V2Table__col--date V2Table__dim">
                          {fmtDay(row.firstSeenAt)}
                        </td>
                        <td className="is-right">{fmtInt(row.messagesSent)}</td>
                        <td className="is-right">{fmtInt(row.repliesReceived)}</td>
                        <td className="is-right">{fmtPct(row.replyRatePct)}</td>
                        <td className="is-right">
                          <strong>{fmtInt(row.canonicalBookedCalls)}</strong>
                        </td>
                        <td className="is-right V2Table__dim">
                          {fmtInt(row.canonicalBookedAfterSmsReply)}
                        </td>
                        <td className={`is-right${isHighOptOut ? ' V2Table__cell--warn' : ''}`}>
                          {fmtPct(row.optOutRatePct)}
                        </td>
                        <td className="is-right">{fmtInt(row.optOuts)}</td>
                        <td className="is-center">
                          <button
                            type="button"
                            className="V2Table__expandBtn"
                            onClick={() => toggleExpanded(row.label)}
                            aria-expanded={expanded}
                            title={expanded ? 'Collapse audit' : 'Expand audit'}
                          >
                            {expanded ? '▲' : '▼'}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="V2Table__auditRow">
                          <td colSpan={13}>
                            <div className="V2SeqAudit">
                              {/* Booking breakdown summary */}
                              <div className="V2SeqAudit__summary">
                                <div className="V2SeqAudit__summaryItem">
                                  <span className="V2SeqAudit__summaryLabel">Booked (Slack)</span>
                                  <span className="V2SeqAudit__summaryValue">
                                    {fmtInt(row.canonicalBookedCalls)}
                                    {row.canonicalBookedCalls > 0 && (
                                      <span className="V2SeqAudit__breakdown">
                                        {' '}— Jack {fmtInt(row.canonicalBookedJack)} / Brandon{' '}
                                        {fmtInt(row.canonicalBookedBrandon)} / Self{' '}
                                        {fmtInt(row.canonicalBookedSelf)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="V2SeqAudit__summaryItem">
                                  <span className="V2SeqAudit__summaryLabel">w/ SMS Reply</span>
                                  <span className="V2SeqAudit__summaryValue">
                                    {fmtInt(row.canonicalBookedAfterSmsReply)}
                                  </span>
                                </div>
                                <div className="V2SeqAudit__summaryItem V2SeqAudit__summaryItem--diagnostic">
                                  <span className="V2SeqAudit__summaryLabel">
                                    SMS Booking Signals
                                    <span className="V2SeqAudit__hint"> (diagnostic, not canonical)</span>
                                  </span>
                                  <span className="V2SeqAudit__summaryValue V2SeqAudit__summaryValue--muted">
                                    {fmtInt(row.diagnosticSmsBookingSignals)}
                                  </span>
                                </div>
                              </div>

                              {/* Per-booking audit rows */}
                              {row.bookedAuditRows.length === 0 ? (
                                <V2State kind="empty">
                                  No Slack booked-call audit rows for this sequence in this window.
                                </V2State>
                              ) : (
                                <div className="V2AuditList">
                                  {row.bookedAuditRows
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime(),
                                    )
                                    .map((audit) => (
                                      <article key={audit.bookedCallId} className="V2AuditItem">
                                        <header className="V2AuditItem__header">
                                          <strong>{fmtDateTime(audit.eventTs)}</strong>
                                          <span
                                            className={`V2Badge V2Badge--${
                                              audit.bucket === 'jack'
                                                ? 'jack'
                                                : audit.bucket === 'brandon'
                                                  ? 'brandon'
                                                  : 'self'
                                            }`}
                                          >
                                            {bucketLabel(audit.bucket)}
                                          </span>
                                          <span
                                            className={`V2Badge V2Badge--${audit.strictSmsReplyLinked ? 'positive' : 'muted'}`}
                                          >
                                            SMS reply: {audit.strictSmsReplyLinked ? 'yes' : 'no'}
                                          </span>
                                          {audit.convertedViaSequence && (
                                            <span className="V2Badge V2Badge--via" title={`Contact was actively enrolled in this sequence at booking time`}>
                                              via {audit.convertedViaSequence}
                                            </span>
                                          )}
                                        </header>
                                        <p className="V2AuditItem__meta">
                                          First conversion:{' '}
                                          <em>{audit.firstConversion || 'n/a'}</em> · Contact:{' '}
                                          {audit.contactName || 'n/a'} · Phone:{' '}
                                          {maskPhone(audit.contactPhone)}
                                        </p>
                                        <p className="V2AuditItem__reason">
                                          Reason:{' '}
                                          {audit.strictSmsReplyReason.replace(/_/g, ' ')}
                                          {audit.latestReplyAt
                                            ? ` · Latest SMS reply: ${fmtDateTime(audit.latestReplyAt)}`
                                            : ''}
                                        </p>
                                      </article>
                                    ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </V2Panel>

      {/* ── Lead Magnet Comparison ── */}
      {leadMagnetRows.length > 0 && (
        <V2Panel
          title="Lead Magnet Comparison"
          caption="Legacy vs v2 sequences by lead magnet · weekly scoreboard window"
        >
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Lead Magnet</th>
                  <th className="is-right">Legacy Sent</th>
                  <th className="is-right">Legacy Reply Rate</th>
                  <th className="is-right">Legacy Booked</th>
                  <th className="is-right">v2 Sent</th>
                  <th className="is-right">v2 Reply Rate</th>
                  <th className="is-right">v2 Booked</th>
                </tr>
              </thead>
              <tbody>
                {leadMagnetRows.map((row) => (
                  <tr key={row.leadMagnet}>
                    <td>{row.leadMagnet}</td>
                    <td className="is-right">
                      {row.legacy ? fmtInt(row.legacy.messagesSent) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.legacy ? fmtPct(row.legacy.replyRatePct) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.legacy ? fmtInt(row.legacy.canonicalBookedCalls) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtInt(row.v2.messagesSent) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtPct(row.v2.replyRatePct) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtInt(row.v2.canonicalBookedCalls) : <span className="V2Table__dim">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </V2Panel>
      )}

      {/* ── Booking Attribution (Monthly) ── */}
      {monthlyBookings && (
        <V2Panel
          title="Booking Attribution (Monthly)"
          caption="How booked calls are attributed across setters and conversation types · monthly scoreboard window"
        >
          <div className="V2SeqAttribution">
            <div className="V2SeqAttribution__grid">
              <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                <span className="V2SeqAttribution__label">Total Booked</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.total)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Jack</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.jack)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Brandon</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.brandon)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Self-Booked</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.selfBooked)}</span>
              </div>
              <div className="V2SeqAttribution__item V2SeqAttribution__item--highlight">
                <span className="V2SeqAttribution__label">Sequence-Initiated</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.sequenceInitiated)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Manual-Initiated</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.manualInitiated)}</span>
              </div>
            </div>
            <p className="V2SeqAttribution__note">
              Attribution model: sequence-initiated conversation. A sequence gets credit when it
              triggered the first outbound contact with a lead, even if manual follow-ups preceded
              the booking.
            </p>
          </div>
        </V2Panel>
      )}
    </div>
  );
}
