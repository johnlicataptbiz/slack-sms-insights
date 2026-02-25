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
  | 'optOutRatePct'
  | 'uniqueContacted'
  | 'bookingRatePct';

// ─── SMS Reply Reason Labels ─────────────────────────────────────────────────

const SMS_REPLY_REASON_LABELS: Record<string, string> = {
  matched_reply_before_booking: 'SMS reply matched before booking',
  no_contact_phone: 'No contact phone on file',
  no_reply_before_booking: 'No SMS reply before booking',
  invalid_booking_timestamp: 'Invalid booking timestamp',
};

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

const fmtMins = (n: number | null): string => {
  if (n === null) return '—';
  if (n < 60) return `${Math.round(n)}m`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const shorten = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${lastSpace > max * 0.7 ? truncated.slice(0, lastSpace) : truncated}…`;
};

/**
 * Extract a display version string (e.g. "v1.2") from a sequence label.
 * Used in the Version column so we show the actual version number instead of
 * the internal "Legacy" classification tag.
 */
const extractVersionDisplay = (label: string): string => {
  const match = label.match(/\b(v\d+(?:\.\d+)+)\b/i);
  return match?.[1] ?? '';
};

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

const fmtDateTime = (value: string | null): string => {
  if (!value) return '—';
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

const BUCKET_LABELS: Record<'jack' | 'brandon' | 'selfBooked', string> = {
  jack: 'Jack',
  brandon: 'Brandon',
  selfBooked: 'Self-booked',
};

// ─── JSX Helpers ─────────────────────────────────────────────────────────────

const renderVersion = (label: string, version: string): React.ReactNode => {
  const vDisplay = extractVersionDisplay(label);
  if (vDisplay) return <span className="V2Badge V2Badge--version">{vDisplay}</span>;
  if (version && version !== 'Legacy') return <span className="V2Badge V2Badge--version">{version}</span>;
  return <span className="V2Table__dim">—</span>;
};

const toAuditId = (label: string) =>
  `audit-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditRow = SalesMetricsV2['sequences'][0]['bookedAuditRows'][0];

type MergedSeqRow = {
  label: string;
  // metadata from scoreboard (window-independent)
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
  // from scoreboard (weekly window — metadata only, noted in UI)
  uniqueContacted: number;
  uniqueReplied: number;
  bookingRatePct: number;
  // pre-computed derived fields
  smsReplyPct: number | null;
};

type HealthFlag = {
  sequence: string;
  label: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  stats: Array<{ label: string; value: string; variant?: 'critical' | 'warning' }>;
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

  // Build scoreboard lookup by label for leadMagnet / version / uniqueContacted / bookingRatePct
  const scoreboardByLabel = useMemo(() => {
    const map = new Map<string, NonNullable<typeof scoreboard>['sequences'][0]>();
    for (const seq of scoreboard?.sequences ?? []) {
      map.set(seq.label, seq);
    }
    return map;
  }, [scoreboard?.sequences]);

  // Merge: numeric fields exclusively from sales-metrics (time-range consistent).
  // Scoreboard used only for window-independent metadata: version, uniqueContacted, uniqueReplied, bookingRatePct.
  const mergedRows = useMemo((): MergedSeqRow[] => {
    const smSeqs = salesMetrics?.sequences ?? [];
    return smSeqs.map((seq) => {
      const sb = scoreboardByLabel.get(seq.label);
      return {
        label: seq.label,
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
        uniqueContacted: sb?.uniqueContacted ?? 0,
        uniqueReplied: sb?.uniqueReplied ?? 0,
        bookingRatePct: sb?.bookingRatePct ?? 0,
        smsReplyPct:
          seq.canonicalBookedCalls > 0
            ? (seq.canonicalBookedAfterSmsReply / seq.canonicalBookedCalls) * 100
            : null,
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
        case 'optOutRatePct':
          return dir * (a.optOutRatePct - b.optOutRatePct);
        case 'uniqueContacted':
          return dir * (a.uniqueContacted - b.uniqueContacted);
        case 'bookingRatePct':
          return dir * (a.bookingRatePct - b.bookingRatePct);
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
    const totalBookedAfterSmsReply = mergedRows.reduce((s, r) => s + r.canonicalBookedAfterSmsReply, 0);
    const totalUniqueContacted = mergedRows.reduce((s, r) => s + r.uniqueContacted, 0);
    const avgReplyRate = totalMessages > 0 ? (totalReplied / totalMessages) * 100 : 0;
    const smsReplyBookingPct = totalBooked > 0 ? (totalBookedAfterSmsReply / totalBooked) * 100 : 0;
    return {
      activeSequences: activeRows.length,
      totalMessages,
      totalBooked,
      totalUniqueContacted,
      avgReplyRate,
      smsReplyBookingPct,
    };
  }, [mergedRows]);

  // Health watchlist — flag sequences needing attention
  const healthWatchlist = useMemo((): HealthFlag[] => {
    const flags: HealthFlag[] = [];
    for (const row of mergedRows) {
      if (row.isManual) continue;
      if (row.messagesSent < 5) continue;
      if (row.optOutRatePct >= 5 && row.messagesSent >= 10) {
        flags.push({
          sequence: row.label,
          label: '⚠ High Opt-Out Rate',
          detail: `${fmtPct(row.optOutRatePct)} opt-out rate on ${fmtInt(row.messagesSent)} messages. Review messaging tone and targeting.`,
          severity: 'critical',
          stats: [
            { label: 'Opt-Out Rate', value: fmtPct(row.optOutRatePct), variant: 'critical' },
            { label: 'Opt-Outs', value: fmtInt(row.optOuts) },
            { label: 'Sent', value: fmtInt(row.messagesSent) },
          ],
        });
      }
      if (row.replyRatePct < 5 && row.messagesSent >= 30) {
        flags.push({
          sequence: row.label,
          label: '↓ Low Reply Rate',
          detail: `Only ${fmtPct(row.replyRatePct)} reply rate on ${fmtInt(row.messagesSent)} messages. Consider refreshing copy or targeting.`,
          severity: 'warning',
          stats: [
            { label: 'Reply Rate', value: fmtPct(row.replyRatePct), variant: 'warning' },
            { label: 'Replied', value: fmtInt(row.repliesReceived) },
            { label: 'Sent', value: fmtInt(row.messagesSent) },
          ],
        });
      }
      if (row.canonicalBookedCalls === 0 && row.messagesSent > 100) {
        flags.push({
          sequence: row.label,
          label: '○ Zero Bookings',
          detail: `${fmtInt(row.messagesSent)} messages sent with no attributed bookings in this window.`,
          severity: 'info',
          stats: [
            { label: 'Sent', value: fmtInt(row.messagesSent) },
            { label: 'Reply Rate', value: fmtPct(row.replyRatePct) },
            { label: 'Booked', value: '0' },
          ],
        });
      }
    }
    return flags;
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
  const compliance = scoreboard?.compliance;
  const timing = scoreboard?.timing;

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
          label="Unique Contacts"
          value={fmtInt(kpis.totalUniqueContacted)}
          meta="weekly window"
        />
        <V2MetricCard
          label="Booked Calls"
          value={fmtInt(kpis.totalBooked)}
          tone={kpis.totalBooked > 0 ? 'positive' : 'default'}
          meta="Slack-verified bookings"
        />
        <V2MetricCard
          label="Avg Reply Rate"
          value={fmtPct(kpis.avgReplyRate)}
          tone={kpis.avgReplyRate >= 10 ? 'positive' : 'default'}
          meta="based on messages sent"
        />
        <V2MetricCard
          label="Booked via SMS Reply %"
          value={fmtPct(kpis.smsReplyBookingPct)}
          tone={kpis.smsReplyBookingPct >= 50 ? 'positive' : 'default'}
          meta="of bookings had a prior SMS reply"
        />
      </section>

      {/* ── Health Watchlist ── */}
      {healthWatchlist.length > 0 && (
        <V2Panel
          title="⚠ Sequence Health Alerts"
          caption="Sequences flagged for attention based on opt-out rate, reply rate, or booking performance."
        >
          <div className="V2RiskFlags">
            {healthWatchlist.map((flag) => (
              <div
                key={`${flag.sequence}-${flag.label}`}
                className={`V2RiskFlag V2RiskFlag--${flag.severity}`}
              >
                <h3 className="V2RiskFlag__title">{flag.label}</h3>
                <p className="V2RiskFlag__seq">{flag.sequence}</p>
                <p className="V2RiskFlag__detail">{flag.detail}</p>
                <div className="V2Watchlist__stats">
                  {flag.stats.map((stat) => (
                    <span
                      key={stat.label}
                      className={`V2Watchlist__stat${stat.variant ? ` V2Watchlist__stat--${stat.variant}` : ''}`}
                    >
                      {stat.label}: {stat.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </V2Panel>
      )}

      {/* ── Sequence Performance Table ── */}
      <V2Panel
        title="Sequence Performance"
        caption={`${sortedRows.length} sequences · all numbers from ${mode} rolling window · Booked = Slack-verified · Unique/Booking Rate from weekly window · click headers to sort`}
      >
        {sortedRows.length === 0 ? (
          <V2State kind="empty">No sequence data for this window.</V2State>
        ) : (
          <div className="V2TableWrap">
            <table className="V2Table V2Table--sequences">
              <thead>
                <tr>
                  <th className="V2Table__col--label">Sequence</th>
                  <th className="V2Table__col--version">Version</th>
                  <th className="V2Table__col--date">First Seen</th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('messagesSent')}
                    aria-sort={sort === 'messagesSent' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Sent{sortArrow('messagesSent')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('uniqueContacted')}
                    title="Unique people reached by this sequence · weekly window"
                    aria-sort={sort === 'uniqueContacted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Contacts{sortArrow('uniqueContacted')}
                  </th>
                  <th className="is-right" title="Total reply messages received">Replied</th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('replyRatePct')}
                    aria-sort={sort === 'replyRatePct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Reply Rate{sortArrow('replyRatePct')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('canonicalBookedCalls')}
                    aria-sort={sort === 'canonicalBookedCalls' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Booked{sortArrow('canonicalBookedCalls')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('bookingRatePct')}
                    title="Booked calls ÷ unique contacts · weekly window"
                    aria-sort={sort === 'bookingRatePct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    Booking Rate{sortArrow('bookingRatePct')}
                  </th>
                  <th
                    className="is-right is-sortable"
                    onClick={() => handleSortClick('optOutRatePct')}
                    aria-sort={sort === 'optOutRatePct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
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
                  const isHighBooking = row.canonicalBookedCalls >= 2 && !row.isManual;
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
                        <td className="V2Table__col--version">
                          {renderVersion(row.label, row.version)}
                        </td>
                        <td className="V2Table__col--date V2Table__dim">
                          {fmtDay(row.firstSeenAt)}
                        </td>
                        <td className="is-right">{fmtInt(row.messagesSent)}</td>
                        <td className="is-right V2Table__dim">
                          {row.uniqueContacted > 0
                            ? fmtInt(row.uniqueContacted)
                            : <span className="V2Table__dim">—</span>}
                        </td>
                        <td className="is-right">{fmtInt(row.repliesReceived)}</td>
                        <td className="is-right">{fmtPct(row.replyRatePct)}</td>
                        <td className="is-right">
                          <div className="V2SeqRepSplit">
                            <strong>{fmtInt(row.canonicalBookedCalls)}</strong>
                            {row.canonicalBookedCalls > 0 && (
                              <div className="V2SeqRepSplit__badges">
                                {row.canonicalBookedJack > 0 && (
                                  <span
                                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--jack"
                                    title={`Jack: ${row.canonicalBookedJack}`}
                                  >
                                    J·{row.canonicalBookedJack}
                                  </span>
                                )}
                                {row.canonicalBookedBrandon > 0 && (
                                  <span
                                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--brandon"
                                    title={`Brandon: ${row.canonicalBookedBrandon}`}
                                  >
                                    B·{row.canonicalBookedBrandon}
                                  </span>
                                )}
                                {row.canonicalBookedSelf > 0 && (
                                  <span
                                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--self"
                                    title={`Self-booked: ${row.canonicalBookedSelf}`}
                                  >
                                    S·{row.canonicalBookedSelf}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="is-right V2Table__dim">
                          {row.bookingRatePct > 0
                            ? fmtPct(row.bookingRatePct)
                            : <span className="V2Table__dim">—</span>}
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
                            aria-controls={toAuditId(row.label)}
                            title={expanded ? 'Collapse audit' : 'Expand audit'}
                          >
                            {expanded ? '▲' : '▼'}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr id={toAuditId(row.label)} className="V2Table__auditRow">
                          <td colSpan={12}>
                            <div className="V2SeqAudit">
                              {/* Booking breakdown summary */}
                              <div className="V2SeqAudit__summary">
                                <div className="V2SeqAudit__summaryItem">
                                  <span className="V2SeqAudit__summaryLabel">Booked (Slack-verified)</span>
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
                                  <span className="V2SeqAudit__summaryLabel">SMS-Linked</span>
                                  <span className="V2SeqAudit__summaryValue">
                                    {fmtInt(row.canonicalBookedAfterSmsReply)}
                                    {row.canonicalBookedCalls > 0 && row.smsReplyPct !== null && (
                                      <span className="V2SeqAudit__breakdown">
                                        {' '}({fmtPct(row.smsReplyPct)} of bookings)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="V2SeqAudit__summaryItem V2SeqAudit__summaryItem--diagnostic">
                                  <span className="V2SeqAudit__summaryLabel">
                                    Booking Signals
                                    <span className="V2SeqAudit__hint"> (for reference only)</span>
                                  </span>
                                  <span className="V2SeqAudit__summaryValue V2SeqAudit__summaryValue--muted">
                                    {fmtInt(row.diagnosticSmsBookingSignals)}
                                  </span>
                                </div>
                              </div>

                              {/* Per-booking audit rows */}
                              {row.bookedAuditRows.length === 0 ? (
                                <V2State kind="empty">
                                  No booking records found for this sequence in this window.
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
                                            {BUCKET_LABELS[audit.bucket]}
                                          </span>
                                          {audit.rep && (
                                            <span className="V2Badge V2Badge--muted" title="Rep">
                                              {audit.rep}
                                            </span>
                                          )}
                                          {audit.line && (
                                            <span className="V2Badge V2Badge--muted" title="Line">
                                              {audit.line}
                                            </span>
                                          )}
                                          <span
                                            className={`V2Badge V2Badge--${audit.strictSmsReplyLinked ? 'positive' : 'muted'}`}
                                          >
                                            SMS reply: {audit.strictSmsReplyLinked ? 'yes' : 'no'}
                                          </span>
                                          {audit.convertedViaSequence && (
                                            <span
                                              className="V2Badge V2Badge--via"
                                              title="Contact was actively enrolled in this sequence at booking time"
                                            >
                                              via {audit.convertedViaSequence}
                                            </span>
                                          )}
                                        </header>
                                        <p className="V2AuditItem__meta">
                                          Lead source:{' '}
                                          <em>{audit.firstConversion || 'n/a'}</em> · Contact:{' '}
                                          {audit.contactName || 'n/a'} · Phone:{' '}
                                          {maskPhone(audit.contactPhone)}
                                        </p>
                                        <p className="V2AuditItem__reason">
                                          Reason:{' '}
                                          {SMS_REPLY_REASON_LABELS[audit.strictSmsReplyReason] ?? audit.strictSmsReplyReason.replace(/_/g, ' ')}
                                          {audit.latestReplyAt
                                            ? ` · Latest SMS reply: ${fmtDateTime(audit.latestReplyAt)}`
                                            : ''}
                                        </p>
                                        {audit.text && (
                                          <p className="V2AuditItem__text">
                                            <span className="V2AuditItem__textLabel">Message: </span>
                                            {shorten(audit.text, 120)}
                                          </p>
                                        )}
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
          caption="Legacy vs v2 sequences by lead magnet · weekly window"
        >
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Lead Magnet</th>
                  <th className="is-right">Legacy Sent</th>
                  <th className="is-right">Legacy Contacts</th>
                  <th className="is-right">Legacy Reply Rate</th>
                  <th className="is-right">Legacy Booked</th>
                  <th className="is-right">Legacy Booking Rate</th>
                  <th className="is-right">v2 Sent</th>
                  <th className="is-right">v2 Contacts</th>
                  <th className="is-right">v2 Reply Rate</th>
                  <th className="is-right">v2 Booked</th>
                  <th className="is-right">v2 Booking Rate</th>
                </tr>
              </thead>
              <tbody>
                {leadMagnetRows.map((row) => (
                  <tr key={row.leadMagnet}>
                    <td>{row.leadMagnet}</td>
                    <td className="is-right">
                      {row.legacy ? fmtInt(row.legacy.messagesSent) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right V2Table__dim">
                      {row.legacy ? fmtInt(row.legacy.uniqueContacted) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.legacy ? fmtPct(row.legacy.replyRatePct) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.legacy ? fmtInt(row.legacy.canonicalBookedCalls) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right V2Table__dim">
                      {row.legacy ? fmtPct(row.legacy.bookingRatePct) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtInt(row.v2.messagesSent) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right V2Table__dim">
                      {row.v2 ? fmtInt(row.v2.uniqueContacted) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtPct(row.v2.replyRatePct) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right">
                      {row.v2 ? fmtInt(row.v2.canonicalBookedCalls) : <span className="V2Table__dim">—</span>}
                    </td>
                    <td className="is-right V2Table__dim">
                      {row.v2 ? fmtPct(row.v2.bookingRatePct) : <span className="V2Table__dim">—</span>}
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
                <span className="V2SeqAttribution__label">From Sequences</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.sequenceInitiated)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">From Direct Outreach</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.manualInitiated)}</span>
              </div>
            </div>
            <p className="V2SeqAttribution__note">
              A sequence gets credit when it started the first outbound contact with a lead, even if manual follow-ups came before the booking.
            </p>
          </div>
        </V2Panel>
      )}

      {/* ── Compliance Panel ── */}
      {compliance && (
        <V2Panel
          title="Opt-Out Health"
          caption="Opt-out rates and top opt-out sequences · weekly window"
        >
          <div className="V2SeqCompliance">
            <div className="V2SeqCompliance__rates">
              <div className="V2SeqCompliance__rate">
                <span className="V2SeqCompliance__rateLabel">Weekly Opt-Out Rate</span>
                <span
                  className={`V2SeqCompliance__rateValue${compliance.optOutRateWeeklyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
                >
                  {fmtPct(compliance.optOutRateWeeklyPct)}
                </span>
              </div>
              <div className="V2SeqCompliance__rate">
                <span className="V2SeqCompliance__rateLabel">Monthly Opt-Out Rate</span>
                <span
                  className={`V2SeqCompliance__rateValue${compliance.optOutRateMonthlyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
                >
                  {fmtPct(compliance.optOutRateMonthlyPct)}
                </span>
              </div>
            </div>
            {compliance.topOptOutSequences.length > 0 && (
              <div className="V2SeqCompliance__topList">
                <p className="V2SeqCompliance__topTitle">Highest Opt-Out Sequences</p>
                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Sequence</th>
                        <th className="is-right">Opt-Outs</th>
                        <th className="is-right">Opt-Out Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliance.topOptOutSequences.map((seq) => (
                        <tr key={seq.label}>
                          <td>{seq.label}</td>
                          <td className="is-right">{fmtInt(seq.optOuts)}</td>
                          <td className={`is-right${seq.optOutRatePct >= 5 ? ' V2Table__cell--warn' : ''}`}>
                            {fmtPct(seq.optOutRatePct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </V2Panel>
      )}

      {/* ── Timing Panel ── */}
      {timing && (
        <V2Panel
          title="Reply Timing"
          caption="Median time to first reply and reply rate by day of week · weekly window"
        >
          <div className="V2SeqTiming">
            {timing.medianTimeToFirstReplyMinutes !== null && (
              <div className="V2SeqTiming__median">
                <span className="V2SeqTiming__medianLabel">Median Time to First Reply</span>
                <span className="V2SeqTiming__medianValue">
                  {fmtMins(timing.medianTimeToFirstReplyMinutes)}
                </span>
              </div>
            )}
            {timing.replyRateByDayOfWeek.length > 0 && (
              <div className="V2SeqTiming__chart">
                <p className="V2SeqTiming__chartTitle">Reply Rate by Day of Week</p>
                {timing.replyRateByDayOfWeek.map((day) => {
                  const barPct = Math.min(day.replyRatePct, 100);
                  return (
                    <div key={day.dayOfWeek} className="V2SeqTiming__row">
                      <span className="V2SeqTiming__day">{day.dayOfWeek}</span>
                      <div className="V2SeqTiming__barWrap">
                        <div
                          className="V2SeqTiming__bar"
                          style={{ width: `${barPct}%` }}
                          title={`${fmtPct(day.replyRatePct)} reply rate · ${fmtInt(day.outboundCount)} sent · ${fmtInt(day.replyCount)} replied`}
                        />
                      </div>
                      <span className="V2SeqTiming__pct">{fmtPct(day.replyRatePct)}</span>
                      <span className="V2SeqTiming__vol">{fmtInt(day.outboundCount)} sent</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </V2Panel>
      )}
    </div>
  );
}
