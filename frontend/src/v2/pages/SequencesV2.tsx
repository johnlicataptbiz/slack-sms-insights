import { useEffect, useMemo, useState } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
import { dayKeyInTimeZone, shiftIsoDay } from '../../utils/runDay';
import { v2Copy } from '../copy';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';

const BUSINESS_TZ = 'America/Chicago';
const watchlistStateStorageKey = 'ptbizsms-v2-sequence-watchlist-reviewed';

type Mode = 'day' | '7d' | '30d';
type Sort = 'messagesSent' | 'replyRatePct' | 'canonicalBookedCalls' | 'optOutRatePct';

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

export default function SequencesV2() {
  const today = useMemo(() => dayKeyInTimeZone(new Date(), BUSINESS_TZ), []);
  const initialDay = useMemo(() => (today ? shiftIsoDay(today, -1) : null), [today]);

  const [mode, setMode] = useState<Mode>('day');
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('messagesSent');
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>(() => readWatchlistState());
  const [copiedSequence, setCopiedSequence] = useState<string | null>(null);

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
    return [...payload.sequences]
      .filter((row) => (queryText ? row.label.toLowerCase().includes(queryText) : true))
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

  const totalSent = rows.reduce((sum, row) => sum + row.messagesSent, 0);
  const totalBooked = rows.reduce((sum, row) => sum + row.canonicalBookedCalls, 0);
  const totalOptOuts = rows.reduce((sum, row) => sum + row.optOuts, 0);
  const attribution = payload.provenance.sequenceBookedAttribution;
  const matchedCalls = attribution?.matchedCalls ?? 0;
  const manualCalls = attribution?.manualCalls ?? 0;
  const namedSequenceCalls = Math.max(0, matchedCalls - manualCalls);
  const totalCalls = attribution?.totalCalls ?? 0;

  const toggleReviewed = (sequenceLabel: string) => {
    setReviewedMap((prev) => ({
      ...prev,
      [sequenceLabel]: !prev[sequenceLabel],
    }));
  };

  const copySetterNote = async (row: (typeof rows)[number]) => {
    const note = [
      `Setter Ops watchlist: ${row.label}`,
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

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.sequences}
        subtitle="Clear sequence performance metrics for calls booked, replies, and opt-outs. Sequence names are preserved exactly as stored."
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
        <V2MetricCard label={<V2Term term="callsBookedSlack" />} value={fmtInt(totalBooked)} tone="positive" />
        <V2MetricCard label={<V2Term term="optOuts" />} value={fmtInt(totalOptOuts)} tone={totalOptOuts > 0 ? 'critical' : 'default'} />
      </section>

      <V2Panel title="High Opt-Out Watchlist" caption="Setter Ops Pack action queue for sequences above watch thresholds.">
        {watchlistRows.length === 0 ? (
          <V2State kind="empty">No sequences are currently above watch thresholds (sent 20+ and opt-out rate 3%+).</V2State>
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
            ? `Matched ${matchedCalls}/${totalCalls} booked calls to attribution buckets (${namedSequenceCalls} named sequences, ${manualCalls} "No sequence (manual/direct)"). First seen is the earliest outbound timestamp observed in PTBizSMS data (not sequence rename history).`
            : 'No booked attribution metadata available. First seen is based on PTBizSMS outbound history.'
        }
      >
        <div className="V2TableActions">
          <label>
            Sort by{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="messagesSent">Messages</option>
              <option value="replyRatePct">Reply rate</option>
              <option value="canonicalBookedCalls">Booked (Slack)</option>
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
                <th className="is-right">
                  <V2Term term="callsBookedSlack" label="Booked (Slack)" />
                </th>
                <th className="is-right">
                  <V2Term term="smsBookingHintsDiagnostic" label="SMS hints (QA)" />
                </th>
                <th className="is-right">Opt-out rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {hasFirstSeenData ? <td>{fmtDay(row.firstSeenAt)}</td> : null}
                  <td className="is-right">{row.messagesSent.toLocaleString()}</td>
                  <td className="is-right">{row.repliesReceived.toLocaleString()}</td>
                  <td className="is-right">{fmtPct(row.replyRatePct)}</td>
                  <td className="is-right">{row.canonicalBookedCalls.toLocaleString()}</td>
                  <td className="is-right">{row.diagnosticSmsBookingSignals.toLocaleString()}</td>
                  <td className="is-right">{fmtPct(row.optOutRatePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </V2Panel>
    </div>
  );
}
