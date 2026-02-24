import { Fragment, useEffect, useMemo, useState } from 'react';

import { useV2SalesMetrics, useV2Scoreboard } from '../../api/v2Queries';
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

  // Scoreboard data for new panels (weekly window)
  const { data: scoreboardData, isLoading: isScoreboardLoading } = useV2Scoreboard({
    weekStart: selectedDay || undefined,
    tz: BUSINESS_TZ,
  });
  const scoreboard = scoreboardData?.data;

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
    // totalBookedNonSmsOrUnknown is computed but not yet displayed in the UI
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
        <V2MetricCard label="Sequences" value={String(rows.length)} meta="active in window" />
        <V2MetricCard label="Messages Sent" value={fmtInt(totalSent)} />
        <V2MetricCard
          label="Total Sets"
          value={fmtInt(totalBookedAllChannels)}
          tone="positive"
          meta={`${fmtInt(totalBookedAttributedToRows)} attributed to sequences`}
        />
        <V2MetricCard
          label={<V2Term term="optOuts" />}
          value={fmtInt(totalOptOuts)}
          tone={totalOptOuts > 0 ? 'critical' : 'default'}
          meta={totalSent > 0 ? `${((totalOptOuts / totalSent) * 100).toFixed(2)}% of sent` : undefined}
        />
      </section>

      {/* New Scoreboard Panels - Volume & Reply Split */}
      {scoreboard && !isScoreboardLoading ? (
        <>
          <V2Panel
            title="Volume & Reply Split"
            caption="Compare sequence-initiated vs manual outreach performance."
          >
            <div className="V2SplitGrid">
              <div className="V2SplitCard">
                <h4>Messages Sent</h4>
                <div className="V2SplitBar">
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--sequence"
                    style={{ width: `${scoreboard.weekly.volume.sequencePct}%` }}
                  />
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--manual"
                    style={{ width: `${scoreboard.weekly.volume.manualPct}%` }}
                  />
                </div>
                <div className="V2SplitLegend">
                  <span>Sequence: {fmtInt(scoreboard.weekly.volume.sequence)} ({fmtPct(scoreboard.weekly.volume.sequencePct)})</span>
                  <span>Manual: {fmtInt(scoreboard.weekly.volume.manual)} ({fmtPct(scoreboard.weekly.volume.manualPct)})</span>
                </div>
              </div>
              <div className="V2SplitCard">
                <h4>Unique Leads</h4>
                <div className="V2SplitBar">
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--sequence"
                    style={{
                      width: `${
                        scoreboard.weekly.uniqueLeads.total > 0
                          ? (scoreboard.weekly.uniqueLeads.sequence / scoreboard.weekly.uniqueLeads.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--manual"
                    style={{
                      width: `${
                        scoreboard.weekly.uniqueLeads.total > 0
                          ? (scoreboard.weekly.uniqueLeads.manual / scoreboard.weekly.uniqueLeads.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="V2SplitLegend">
                  <span>Sequence: {fmtInt(scoreboard.weekly.uniqueLeads.sequence)}</span>
                  <span>Manual: {fmtInt(scoreboard.weekly.uniqueLeads.manual)}</span>
                </div>
              </div>
              <div className="V2SplitCard">
                <h4>Replies</h4>
                <div className="V2SplitBar">
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--sequence"
                    style={{
                      width: `${
                        scoreboard.weekly.replies.overall.count > 0
                          ? (scoreboard.weekly.replies.sequence.count / scoreboard.weekly.replies.overall.count) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--manual"
                    style={{
                      width: `${
                        scoreboard.weekly.replies.overall.count > 0
                          ? (scoreboard.weekly.replies.manual.count / scoreboard.weekly.replies.overall.count) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="V2SplitLegend">
                  <span>
                    Sequence: {fmtInt(scoreboard.weekly.replies.sequence.count)} ({fmtPct(scoreboard.weekly.replies.sequence.ratePct)} rate)
                  </span>
                  <span>
                    Manual: {fmtInt(scoreboard.weekly.replies.manual.count)} ({fmtPct(scoreboard.weekly.replies.manual.ratePct)} rate)
                  </span>
                </div>
              </div>
            </div>
          </V2Panel>

          <V2Panel
            title="Booking Attribution"
            caption="Who gets credit for bookings: sequence-initiated vs manual, and by rep."
          >
            <div className="V2SplitGrid">
              <div className="V2SplitCard">
                <h4>By Initiator Type</h4>
                <div className="V2SplitBar">
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--sequence"
                    style={{
                      width: `${
                        scoreboard.weekly.bookings.total > 0
                          ? (scoreboard.weekly.bookings.sequenceInitiated / scoreboard.weekly.bookings.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div
                    className="V2SplitBar__segment V2SplitBar__segment--manual"
                    style={{
                      width: `${
                        scoreboard.weekly.bookings.total > 0
                          ? (scoreboard.weekly.bookings.manualInitiated / scoreboard.weekly.bookings.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="V2SplitLegend">
                  <span>Sequence-initiated: {fmtInt(scoreboard.weekly.bookings.sequenceInitiated)}</span>
                  <span>Manual-initiated: {fmtInt(scoreboard.weekly.bookings.manualInitiated)}</span>
                </div>
              </div>
              <div className="V2SplitCard">
                <h4>By Rep</h4>
                <div className="V2RepBreakdown">
                  <div className="V2RepRow">
                    <span className="V2RepRow__name">Jack</span>
                    <span className="V2RepRow__value">{fmtInt(scoreboard.weekly.bookings.jack)}</span>
                  </div>
                  <div className="V2RepRow">
                    <span className="V2RepRow__name">Brandon</span>
                    <span className="V2RepRow__value">{fmtInt(scoreboard.weekly.bookings.brandon)}</span>
                  </div>
                  <div className="V2RepRow">
                    <span className="V2RepRow__name">Self-booked</span>
                    <span className="V2RepRow__value">{fmtInt(scoreboard.weekly.bookings.selfBooked)}</span>
                  </div>
                  <div className="V2RepRow V2RepRow--total">
                    <span className="V2RepRow__name">Total</span>
                    <span className="V2RepRow__value">{fmtInt(scoreboard.weekly.bookings.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </V2Panel>

          <V2Panel
            title="Lead Magnet Comparison"
            caption="Compare Legacy vs V2 versions of each lead magnet."
          >
            {scoreboard.leadMagnetComparison.length === 0 ? (
              <V2State kind="empty">No lead magnet comparison data available.</V2State>
            ) : (
              <div className="V2LeadMagnetTable">
                <table className="V2Table">
                  <thead>
                    <tr>
                      <th>Lead Magnet</th>
                      <th className="is-right">Version</th>
                      <th className="is-right">Sent</th>
                      <th className="is-right">Leads</th>
                      <th className="is-right">Replies</th>
                      <th className="is-right">Reply Rate</th>
                      <th className="is-right">Booked</th>
                      <th className="is-right">Booking Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboard.leadMagnetComparison.map((row) => (
                      <Fragment key={row.leadMagnet}>
                        {row.legacy ? (
                          <tr>
                            <td rowSpan={row.v2 ? 2 : 1}>{row.leadMagnet}</td>
                            <td className="is-right">Legacy</td>
                            <td className="is-right">{fmtInt(row.legacy.messagesSent)}</td>
                            <td className="is-right">{fmtInt(row.legacy.uniqueContacted)}</td>
                            <td className="is-right">{fmtInt(row.legacy.uniqueReplied)}</td>
                            <td className="is-right">{fmtPct(row.legacy.replyRatePct)}</td>
                            <td className="is-right">{fmtInt(row.legacy.canonicalBookedCalls)}</td>
                            <td className="is-right">{fmtPct(row.legacy.bookingRatePct)}</td>
                          </tr>
                        ) : null}
                        {row.v2 ? (
                          <tr>
                            {row.legacy ? null : <td rowSpan={row.legacy ? 2 : 1}>{row.leadMagnet}</td>}
                            <td className="is-right">V2</td>
                            <td className="is-right">{fmtInt(row.v2.messagesSent)}</td>
                            <td className="is-right">{fmtInt(row.v2.uniqueContacted)}</td>
                            <td className="is-right">{fmtInt(row.v2.uniqueReplied)}</td>
                            <td className="is-right">{fmtPct(row.v2.replyRatePct)}</td>
                            <td className="is-right">{fmtInt(row.v2.canonicalBookedCalls)}</td>
                            <td className="is-right">{fmtPct(row.v2.bookingRatePct)}</td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </V2Panel>
        </>
      ) : null}

      {/* Sets Attribution — shows how sets are credited to sequences across multi-day convos */}
      <V2Panel
        title="Sets Attribution"
        caption={`${fmtInt(totalBookedAllChannels)} total sets. Attribution uses HubSpot first-conversion label matching — so a set is credited to the sequence that started the conversation, even if the booking happened days later.`}
      >
        <div className="V2SetsAttribution">
          <div className="V2SetsAttribution__bar">
            {totalBookedAllChannels > 0 ? (
              <>
                <div
                  className="V2SetsAttribution__segment V2SetsAttribution__segment--sms"
                  style={{ width: `${(totalBookedAttributedToRows / totalBookedAllChannels) * 100}%` }}
                  title={`Sequence-attributed: ${totalBookedAttributedToRows}`}
                />
                <div
                  className="V2SetsAttribution__segment V2SetsAttribution__segment--unattr"
                  style={{ width: `${(unattributedCalls / totalBookedAllChannels) * 100}%` }}
                  title={`Unmatched: ${unattributedCalls}`}
                />
              </>
            ) : (
              <div className="V2SetsAttribution__segment V2SetsAttribution__segment--empty" style={{ width: '100%' }} />
            )}
          </div>
          <div className="V2SetsAttribution__legend">
            <div className="V2SetsAttribution__legendItem">
              <span className="V2SetsAttribution__dot V2SetsAttribution__dot--sms" />
              <div>
                <span className="V2SetsAttribution__legendLabel">Sequence-Attributed</span>
                <span className="V2SetsAttribution__legendDesc">Credited to the sequence that started the conversation (HubSpot first conversion)</span>
              </div>
              <span className="V2SetsAttribution__legendValue">{fmtInt(totalBookedAttributedToRows)}</span>
              <span className="V2SetsAttribution__legendPct">
                {totalBookedAllChannels > 0 ? fmtPct((totalBookedAttributedToRows / totalBookedAllChannels) * 100) : '—'}
              </span>
            </div>
            <div className="V2SetsAttribution__legendItem V2SetsAttribution__legendItem--sub">
              <span className="V2SetsAttribution__dot V2SetsAttribution__dot--confirm" />
              <div>
                <span className="V2SetsAttribution__legendLabel">↳ Confirmed SMS Reply</span>
                <span className="V2SetsAttribution__legendDesc">Subset: contact replied to an outbound SMS before booking (strictest signal)</span>
              </div>
              <span className="V2SetsAttribution__legendValue">{fmtInt(totalBookedAfterReply)}</span>
              <span className="V2SetsAttribution__legendPct">
                {totalBookedAllChannels > 0 ? fmtPct((totalBookedAfterReply / totalBookedAllChannels) * 100) : '—'}
              </span>
            </div>
            {unattributedCalls > 0 ? (
              <div className="V2SetsAttribution__legendItem V2SetsAttribution__legendItem--muted">
                <span className="V2SetsAttribution__dot V2SetsAttribution__dot--unattr" />
                <div>
                  <span className="V2SetsAttribution__legendLabel">Unmatched / Other Channels</span>
                  <span className="V2SetsAttribution__legendDesc">IG, LinkedIn, Circle, website, or no label match found</span>
                </div>
                <span className="V2SetsAttribution__legendValue">{fmtInt(unattributedCalls)}</span>
                <span className="V2SetsAttribution__legendPct">
                  {totalBookedAllChannels > 0 ? fmtPct((unattributedCalls / totalBookedAllChannels) * 100) : '—'}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </V2Panel>

      <V2Panel title="At-Risk Sequences" caption="Sequences that need attention.">
        {watchlistRows.length === 0 ? (
          <V2State kind="empty">All clear! No sequences need attention.</V2State>
        ) : (
          <div className="V2Watchlist">
            {watchlistRows.map((row) => {
              const reviewed = Boolean(reviewedMap[row.label]);
              const tone = riskTone(row.optOutRatePct);
              return (
                <article className={`V2Watchlist__item ${reviewed ? 'is-reviewed' : ''}`} key={row.label}>
                  <div className="V2Watchlist__head">
                    <div>
                      <h3>{row.label}</h3>
                      <div className="V2Watchlist__stats">
                        <span className="V2Watchlist__stat">
                          📤 {fmtInt(row.messagesSent)} sent
                        </span>
                        <span className="V2Watchlist__stat">
                          💬 {fmtInt(row.repliesReceived)} replies
                        </span>
                        <span className={`V2Watchlist__stat V2Watchlist__stat--${tone === 'critical' ? 'critical' : 'warning'}`}>
                          🚫 {fmtInt(row.optOuts)} opt-outs ({fmtPct(row.optOutRatePct)})
                        </span>
                      </div>
                    </div>
                    <span className={`V2RiskTag V2RiskTag--${tone}`}>{riskLabel(row.optOutRatePct)}</span>
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
                    <tr key={`${row.label}-summary`} className={row.optOutRatePct >= 6 ? 'is-risk-critical' : row.optOutRatePct >= 3 ? 'is-risk-watch' : ''}>
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
