import { Fragment, useEffect, useMemo, useState } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
import type { SalesMetricsV2 } from '../../api/v2-types';
import { dayKeyInTimeZone, shiftIsoDay } from '../../utils/runDay';
import { v2Copy } from '../copy';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';

const BUSINESS_TZ = 'America/Chicago';
const watchlistStateStorageKey = 'ptbizsms-v2-sequence-watchlist-reviewed';
const unattributedSequenceLabel = 'Unattributed / other channels / unknown';

type Mode = 'day' | '7d' | '30d';
type Sort = 'messagesSent' | 'replyRatePct' | 'canonicalBookedCalls' | 'canonicalBookedAfterSmsReply' | 'optOutRatePct';

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();
const fmtDay = (iso: string | null) => {
  if (!iso) return '—';
  const value = iso.trim();
  if (!value) return '—';

  const dayOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayOnlyMatch) {
    const year = Number.parseInt(dayOnlyMatch[1] || '', 10);
    const month = Number.parseInt(dayOnlyMatch[2] || '', 10);
    const day = Number.parseInt(dayOnlyMatch[3] || '', 10);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return utcDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
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

const readWatchlistState = () => {
  if (typeof window === 'undefined') return {} as Record<string, boolean>;
  try {
    const raw = localStorage.getItem(watchlistStateStorageKey);
    if (!raw) return {} as Record<string, boolean>;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {} as Record<string, boolean>;
    return parsed as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
};

const riskTone = (optOutRatePct: number): 'critical' | 'accent' | 'default' => {
  if (optOutRatePct >= 6) return 'critical';
  if (optOutRatePct >= 3) return 'accent';
  return 'default';
};

const riskLabel = (optOutRatePct: number) => {
  if (optOutRatePct >= 6) return 'high risk';
  if (optOutRatePct >= 3) return 'watch';
  return 'healthy';
};

export const computeSequenceHeaderMetrics = (
  payload: SalesMetricsV2,
  rows: SalesMetricsV2['sequences'],
) => {
  const totalSent = rows.reduce((sum, row) => sum + row.messagesSent, 0);
  const totalBookedAttributedToRows = rows.reduce((sum, row) => sum + row.canonicalBookedCalls, 0);
  const totalBookedAfterReply = rows.reduce((sum, row) => sum + row.canonicalBookedAfterSmsReply, 0);
  const totalOptOuts = rows.reduce((sum, row) => sum + row.optOuts, 0);
  const attribution = payload.provenance.sequenceBookedAttribution;
  const totalBookedAllChannels = payload.bookedCredit.total;
  const matchedCalls = attribution?.matchedCalls ?? 0;
  const unattributedCalls = attribution?.unattributedCalls ?? Math.max(0, totalBookedAllChannels - matchedCalls);
  const manualCalls = attribution?.manualCalls ?? 0;
  const namedSequenceCalls = Math.max(0, matchedCalls - manualCalls);
  const totalCalls = attribution?.totalCalls ?? 0;
  const totalBookedNonSmsOrUnknown =
    attribution?.nonSmsOrUnknownCalls ?? Math.max(0, totalBookedAllChannels - totalBookedAfterReply);

  return {
    totalSent,
    totalBookedAttributedToRows,
    totalBookedAfterReply,
    totalOptOuts,
    attribution,
    totalBookedAllChannels,
    matchedCalls,
    unattributedCalls,
    manualCalls,
    namedSequenceCalls,
    totalCalls,
    totalBookedNonSmsOrUnknown,
  };
};

export default function SequencesV2() {
  const today = useMemo(() => dayKeyInTimeZone(new Date(), BUSINESS_TZ), []);
  const initialDay = useMemo(() => (today ? shiftIsoDay(today, -1) : null), [today]);

  const [mode, setMode] = useState<Mode>('day');
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('messagesSent');
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>(() => readWatchlistState());
  const [copiedSequence, setCopiedSequence] = useState<string | null>(null);
  const [expandedAuditRows, setExpandedAuditRows] = useState<Record<string, boolean>>({});

  const query = useMemo(() => {
    if (mode === 'day' && selectedDay) return { day: selectedDay, tz: BUSINESS_TZ } as const;
    if (mode === '7d') return { range: '7d' as const, tz: BUSINESS_TZ };
    return { range: '30d' as const, tz: BUSINESS_TZ };
  }, [mode, selectedDay]);

  const { data, isLoading, isError, error } = useV2SalesMetrics(query);
  const payload = data?.data;

  const rows = useMemo(() => {
    if (!payload) return [];
    const queryText = search.trim().toLowerCase();
    const unattributedCalls =
      payload.provenance.sequenceBookedAttribution?.unattributedCalls ??
      Math.max(0, payload.bookedCredit.total - (payload.provenance.sequenceBookedAttribution?.matchedCalls ?? 0));

    const baseRows = [...payload.sequences]
      .filter((row) => (queryText ? row.label.toLowerCase().includes(queryText) : true));

    if (unattributedCalls > 0) {
      const matchesSearch = !queryText || unattributedSequenceLabel.toLowerCase().includes(queryText);
      if (matchesSearch) {
        baseRows.push({
          label: unattributedSequenceLabel,
          firstSeenAt: null,
          messagesSent: 0,
          repliesReceived: 0,
          replyRatePct: 0,
          canonicalBookedCalls: unattributedCalls,
          canonicalBookedAfterSmsReply: 0,
          canonicalBookedJack: 0,
          canonicalBookedBrandon: 0,
          canonicalBookedSelf: 0,
          bookedAuditRows: [],
          diagnosticSmsBookingSignals: 0,
          optOuts: 0,
          optOutRatePct: 0,
        });
      }
    }

    return baseRows
      .sort((a, b) => {
        const diff = b[sort] - a[sort];
        if (diff !== 0) return diff;
        return a.label.localeCompare(b.label);
      });
  }, [payload, search, sort]);

  const watchlistRows = useMemo(() => {
    return rows
      .filter((row) => row.messagesSent >= 20 && row.optOutRatePct >= 3)
      .sort((a, b) => b.optOutRatePct - a.optOutRatePct)
      .slice(0, 8);
  }, [rows]);

  const hasFirstSeenData = useMemo(() => {
    return rows.some((row) => Boolean(row.firstSeenAt && row.firstSeenAt.trim().length > 0));
  }, [rows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(watchlistStateStorageKey, JSON.stringify(reviewedMap));
  }, [reviewedMap]);

  if (isLoading) return <V2State kind="loading">Loading sequence performance…</V2State>;
  if (isError || !payload) return <V2State kind="error">Failed to load sequence performance: {String((error as Error)?.message || error)}</V2State>;

  const {
    totalSent,
    totalBookedAttributedToRows,
    totalBookedAfterReply,
    totalOptOuts,
    attribution,
    totalBookedAllChannels,
    matchedCalls,
    unattributedCalls,
    manualCalls,
    namedSequenceCalls,
    totalCalls,
    totalBookedNonSmsOrUnknown,
  } = computeSequenceHeaderMetrics(payload, payload.sequences);

  const toggleReviewed = (sequenceLabel: string) => {
    setReviewedMap((prev) => ({
      ...prev,
      [sequenceLabel]: !prev[sequenceLabel],
    }));
  };

  const copySetterNote = async (row: (typeof rows)[number]) => {
    const note = [
      `Sequence watchlist: ${row.label}`,
      `Risk level: ${riskLabel(row.optOutRatePct)} (${fmtPct(row.optOutRatePct)} opt-out rate)`,
      `Volume: ${fmtInt(row.messagesSent)} sent | ${fmtInt(row.repliesReceived)} replies | ${fmtInt(row.optOuts)} opt-outs`,
      'Action: tighten opener + CTA, narrow segment targeting, and lower daily send until opt-out rate settles below 3%.',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(note);
      setCopiedSequence(row.label);
      window.setTimeout(() => setCopiedSequence((current) => (current === row.label ? null : current)), 1200);
    } catch {
      setCopiedSequence(null);
    }
  };

  const toggleAuditRow = (label: string) => {
    setExpandedAuditRows((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.sequences}
        subtitle="See how each sequence is performing."
        right={
          <div className="V2ControlsRow">
            <label className="V2Control">
              <span>View</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="day">Day by day</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </label>
            {mode === 'day' ? (
              <label className="V2Control">
                <span>Business Day</span>
                <input type="date" value={selectedDay || ''} onChange={(e) => setSelectedDay(e.target.value || null)} />
              </label>
            ) : null}
            <label className="V2Control">
              <span>Find Sequence</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sequence name" />
            </label>
          </div>
        }
      />

      <section className="V2MetricsGrid">
        <V2MetricCard label="Sequences" value={String(rows.length)} />
        <V2MetricCard label="Messages Sent" value={fmtInt(totalSent)} />
        <V2MetricCard label="Booked calls (all channels, Slack source)" value={fmtInt(totalBookedAllChannels)} tone="positive" />
        <V2MetricCard label="Booked attributed to sequence labels" value={fmtInt(totalBookedAttributedToRows)} tone="accent" />
        <V2MetricCard label="Booked unattributed (IG/LinkedIn/Circle/unknown)" value={fmtInt(unattributedCalls)} />
        <V2MetricCard label="Booked after SMS reply" value={fmtInt(totalBookedAfterReply)} tone="accent" />
        <V2MetricCard label="Booked calls (non-SMS or unknown source)" value={fmtInt(totalBookedNonSmsOrUnknown)} />
        <V2MetricCard label={<V2Term term="optOuts" />} value={fmtInt(totalOptOuts)} tone={totalOptOuts > 0 ? 'critical' : 'default'} />
      </section>

      <V2Panel title="At-Risk Sequences" caption="Sequences that need attention.">
        {watchlistRows.length === 0 ? (
          <V2State kind="empty">All clear! No sequences need attention.</V2State>
        ) : (
          <div className="V2Watchlist">
            {watchlistRows.map((row) => {
              const reviewed = Boolean(reviewedMap[row.label]);
              return (
                <article className={`V2Watchlist__item ${reviewed ? 'is-reviewed' : ''}`} key={row.label}>
                  <div className="V2Watchlist__head">
                    <div>
                      <h3>{row.label}</h3>
                      <p>
                        Sent {fmtInt(row.messagesSent)} | Replies {fmtInt(row.repliesReceived)} | Opt-outs {fmtInt(row.optOuts)} ({fmtPct(row.optOutRatePct)})
                      </p>
                    </div>
                    <span className={`V2RiskTag V2RiskTag--${riskTone(row.optOutRatePct)}`}>{riskLabel(row.optOutRatePct)}</span>
                  </div>
                  <div className="V2Watchlist__actions">
                    <button
                      type="button"
                      onClick={() => {
                        setSearch(row.label);
                        setSort('optOutRatePct');
                      }}
                    >
                      Focus in table
                    </button>
                    <button type="button" onClick={() => void copySetterNote(row)}>
                      {copiedSequence === row.label ? 'Copied' : 'Copy coaching note'}
                    </button>
                    <button type="button" onClick={() => toggleReviewed(row.label)}>
                      {reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </V2Panel>

      <V2Panel
        title="Sequence Table"
        caption={
          attribution
            ? `Matched ${matchedCalls}/${totalCalls} booked calls to sequence attribution (${namedSequenceCalls} named sequences, ${manualCalls} "No sequence (manual/direct)", ${unattributedCalls} unattributed). Unattributed bookings often come from IG/LinkedIn/Circle/other non-SMS sources or unmatched First Conversion labels. Table includes an explicit "${unattributedSequenceLabel}" row when applicable. "First seen" is the first outbound timestamp found in PTBizSMS history.`
            : 'No booked-call attribution metadata found. "First seen" is based on PTBizSMS outbound history.'
        }
      >
        <div className="V2TableActions">
          <label>
            Sort by{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="messagesSent">Messages</option>
              <option value="replyRatePct">Reply rate</option>
              <option value="canonicalBookedCalls">Booked (attributed to this sequence)</option>
              <option value="canonicalBookedAfterSmsReply">Booked after SMS reply</option>
              <option value="optOutRatePct">Opt-out rate</option>
            </select>
          </label>
        </div>
        <div className="V2TableWrap">
          <table className="V2Table">
            <thead>
              <tr>
                <th>Sequence</th>
                {hasFirstSeenData ? <th>First seen</th> : null}
                <th className="is-right">Sent</th>
                <th className="is-right">Replies</th>
                <th className="is-right">Reply rate</th>
                <th className="is-right">Booked (attributed to this sequence)</th>
                <th className="is-right">Booked after SMS reply</th>
                <th className="is-right">
                  <V2Term term="smsBookingHintsDiagnostic" label="SMS hints (QA)" />
                </th>
                <th className="is-right">Opt-out rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = Boolean(expandedAuditRows[row.label]);
                const colSpan = hasFirstSeenData ? 9 : 8;
                return (
                  <Fragment key={row.label}>
                    <tr key={`${row.label}-summary`}>
                      <td>
                        <div className="V2SequenceCell">
                          <span>{row.label}</span>
                          <button type="button" className="V2SequenceCell__auditToggle" onClick={() => toggleAuditRow(row.label)}>
                            {expanded ? 'Hide' : 'View'} audit ({row.bookedAuditRows.length})
                          </button>
                        </div>
                      </td>
                      {hasFirstSeenData ? <td>{fmtDay(row.firstSeenAt)}</td> : null}
                      <td className="is-right">{row.messagesSent.toLocaleString()}</td>
                      <td className="is-right">{row.repliesReceived.toLocaleString()}</td>
                      <td className="is-right">{fmtPct(row.replyRatePct)}</td>
                      <td className="is-right">{row.canonicalBookedCalls.toLocaleString()}</td>
                      <td className="is-right">{row.canonicalBookedAfterSmsReply.toLocaleString()}</td>
                      <td className="is-right">{row.diagnosticSmsBookingSignals.toLocaleString()}</td>
                      <td className="is-right">{fmtPct(row.optOutRatePct)}</td>
                    </tr>
                    {expanded ? (
                      <tr key={`${row.label}-audit`} className="V2Table__auditRow">
                        <td colSpan={colSpan}>
                          {row.bookedAuditRows.length === 0 ? (
                            <V2State kind="empty">No booked-call audit rows for this sequence in this window.</V2State>
                          ) : (
                            <div className="V2AuditList">
                              {row.bookedAuditRows
                                .slice()
                                .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())
                                .map((audit) => (
                                  <article key={audit.bookedCallId} className="V2AuditItem">
                                    <header>
                                      <strong>{fmtDateTime(audit.eventTs)}</strong>
                                      <span>{bucketLabel(audit.bucket)}</span>
                                      <span>
                                        SMS reply link: {audit.strictSmsReplyLinked ? 'yes' : 'no'} ({audit.strictSmsReplyReason})
                                      </span>
                                    </header>
                                    <p>
                                      First conversion: {audit.firstConversion || 'n/a'} | Contact: {audit.contactName || 'n/a'} | Phone:{' '}
                                      {maskPhone(audit.contactPhone)}
                                    </p>
                                    <p>
                                      Slack source: {audit.slackChannelId}:{audit.slackMessageTs}
                                      {audit.latestReplyAt ? ` | Latest SMS reply: ${fmtDateTime(audit.latestReplyAt)}` : ''}
                                    </p>
                                  </article>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </V2Panel>
    </div>
  );
}
