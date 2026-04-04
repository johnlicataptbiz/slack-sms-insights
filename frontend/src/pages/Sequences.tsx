import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { useSalesMetrics } from '../api/queries';
import { dayKeyInTimeZone, shiftIsoDay } from '../utils/runDay';
import '../styles/DataPages.css';
import '../styles/Sequences.css';

const BUSINESS_TIME_ZONE = 'America/Chicago';
const MANUAL_LABEL = 'No sequence (manual/direct)';

type RangeMode = 'day' | '7d' | '30d';
type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'label'
  | 'messagesSent'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'slackBookedCalls'
  | 'bookingSignalsSms'
  | 'optOuts'
  | 'optOutRatePct'
  | 'volumeSharePct'
  | 'signalSharePct'
  | 'healthScore';

type RiskLevel = 'low' | 'medium' | 'high';

type SequenceKpiRow = {
  label: string;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  slackBookedCalls: number;
  slackBookedJack: number;
  slackBookedBrandon: number;
  slackBookedSelf: number;
  bookingSignalsSms: number;
  optOuts: number;
  optOutRatePct: number;
  volumeSharePct: number;
  signalSharePct: number;
  healthScore: number;
  riskLevel: RiskLevel;
};

const formatPct = (value: number): string => `${value.toFixed(1)}%`;
const dayLabelFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatBusinessDayLabel = (day: string | null): string => {
  if (!day) return 'Unknown day';
  const parts = day.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return day;
  const [year, month, date] = parts;
  const instant = new Date(Date.UTC(year || 0, (month || 1) - 1, date || 1, 12, 0, 0, 0));
  return `${dayLabelFormatter.format(instant)} (${day})`;
};

const getRiskLevel = (params: { optOutRatePct: number; optOuts: number; messagesSent: number }): RiskLevel => {
  const { optOutRatePct, optOuts, messagesSent } = params;

  if (optOuts >= 3 || (messagesSent >= 10 && optOutRatePct >= 8)) return 'high';
  if (optOuts >= 1 || (messagesSent >= 10 && optOutRatePct >= 3)) return 'medium';
  return 'low';
};

const toHealthScore = (row: {
  messagesSent: number;
  replyRatePct: number;
  closeRatePct: number;
  optOutRatePct: number;
}): number => {
  const base =
    45 +
    row.replyRatePct * 0.8 +
    row.closeRatePct * 0.9 -
    row.optOutRatePct * 2.4 +
    Math.min(row.messagesSent, 200) * 0.06;
  return Math.max(0, Math.min(100, base));
};

export default function SequencesDeepDive() {
  const today = useMemo(() => dayKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE), []);
  const previousDay = useMemo(() => {
    if (!today) return null;
    return shiftIsoDay(today, -1);
  }, [today]);

  const [mode, setMode] = useState<RangeMode>('day');
  const [selectedDay, setSelectedDay] = useState<string | null>(previousDay);
  const [search, setSearch] = useState('');
  const [includeManual, setIncludeManual] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('messagesSent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [minSendsThreshold, setMinSendsThreshold] = useState<number>(15);

  const activeDay = selectedDay || previousDay;
  const canStepForward = mode === 'day' && Boolean(activeDay && today && activeDay < today);

  const moveDay = (delta: number) => {
    if (!activeDay) return;
    if (delta > 0 && !canStepForward) return;
    setSelectedDay(shiftIsoDay(activeDay, delta));
  };

  const salesQuery = useMemo(() => {
    if (mode === 'day' && activeDay) {
      return { day: activeDay, tz: BUSINESS_TIME_ZONE } as const;
    }
    if (mode === '7d') return { range: '7d' as const, tz: BUSINESS_TIME_ZONE };
    if (mode === '30d') return { range: '30d' as const, tz: BUSINESS_TIME_ZONE };
    const today = dayKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
    if (today) return { day: shiftIsoDay(today, -1), tz: BUSINESS_TIME_ZONE } as const;
    return { range: '7d' as const, tz: BUSINESS_TIME_ZONE };
  }, [activeDay, mode]);

  const { data, isLoading, error } = useSalesMetrics(salesQuery);

  const rows = useMemo((): SequenceKpiRow[] => {
    const sourceRows = data?.topSequences ?? [];
    const totalSent = sourceRows.reduce((sum, row) => sum + row.messagesSent, 0);
    const totalSlackBooked = sourceRows.reduce((sum, row) => sum + (row.slackBookedCalls ?? 0), 0);
    const searchText = search.trim().toLowerCase();

    const filtered = sourceRows
      .filter((row) => (includeManual ? true : row.label !== MANUAL_LABEL))
      .filter((row) => (searchText ? row.label.toLowerCase().includes(searchText) : true))
      .filter((row) => row.messagesSent >= minSendsThreshold)
      .map((row) => {
        const slackBookedCalls = row.slackBookedCalls ?? 0;
        const bookedImpactPct = row.messagesSent > 0 ? Math.min((slackBookedCalls / row.messagesSent) * 100, 100) : 0;
        const optOutRatePct = row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0;
        const volumeSharePct = totalSent > 0 ? (row.messagesSent / totalSent) * 100 : 0;
        const signalSharePct = totalSlackBooked > 0 ? (slackBookedCalls / totalSlackBooked) * 100 : 0;
        const riskLevel = getRiskLevel({ optOutRatePct, optOuts: row.optOuts, messagesSent: row.messagesSent });
        const healthScore = toHealthScore({
          messagesSent: row.messagesSent,
          replyRatePct: row.replyRatePct,
          closeRatePct: bookedImpactPct,
          optOutRatePct,
        });

        return {
          label: row.label,
          messagesSent: row.messagesSent,
          repliesReceived: row.repliesReceived,
          replyRatePct: row.replyRatePct,
          slackBookedCalls,
          slackBookedJack: row.slackBookedJack ?? 0,
          slackBookedBrandon: row.slackBookedBrandon ?? 0,
          slackBookedSelf: row.slackBookedSelf ?? 0,
          bookingSignalsSms: row.bookingSignalsSms,
          optOuts: row.optOuts,
          optOutRatePct,
          volumeSharePct,
          signalSharePct,
          healthScore,
          riskLevel,
        };
      });

    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir;
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue < bValue) return -1 * dir;
      if (aValue > bValue) return 1 * dir;
      return a.label.localeCompare(b.label);
    });
  }, [data?.topSequences, includeManual, search, sortDirection, sortKey, minSendsThreshold]);

  const filteredCount = useMemo(() => {
    const sourceRows = data?.topSequences ?? [];
    return sourceRows.filter((row) => row.messagesSent < minSendsThreshold).length;
  }, [data?.topSequences, minSendsThreshold]);

  const summary = useMemo(() => {
    const totalSent = rows.reduce((sum, row) => sum + row.messagesSent, 0);
    const totalReplies = rows.reduce((sum, row) => sum + row.repliesReceived, 0);
    const totalSlackBooked = rows.reduce((sum, row) => sum + row.slackBookedCalls, 0);
    const totalSignals = rows.reduce((sum, row) => sum + row.bookingSignalsSms, 0);
    const totalOptOuts = rows.reduce((sum, row) => sum + row.optOuts, 0);
    const highRiskCount = rows.filter((row) => row.riskLevel === 'high').length;

    return {
      sequences: rows.length,
      totalSent,
      totalReplies,
      totalSlackBooked,
      totalSignals,
      totalOptOuts,
      highRiskCount,
      weightedReplyRatePct: totalSent > 0 ? (totalReplies / totalSent) * 100 : 0,
      weightedOptOutRatePct: totalSent > 0 ? (totalOptOuts / totalSent) * 100 : 0,
    };
  }, [rows]);

  const rangeLabel =
    mode === 'day'
      ? `Business day ${formatBusinessDayLabel(activeDay)}`
      : mode === '7d'
        ? 'Last 7 Days'
        : 'Last 30 Days';

  const sortIndicator = (key: SortKey): string => {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'label' ? 'asc' : 'desc');
  };

  const errorMessage = (() => {
    if (!error) return null;
    if (error instanceof ApiError) return `${error.message} (status ${error.status})`;
    if (error instanceof Error) return error.message;
    return String(error);
  })();

  return (
    <div className="DataPage SequencesPage">
      <div className="DataPage__header">
        <h1 className="DataPage__title">Sequence Performance</h1>
      </div>

      <p className="DataPage__subtitle">
        Clear sequence performance metrics. Sequence names are preserved exactly as stored (for example, 1.2 and 1.3
        stay separate).
      </p>

      <section className="DataPanel">
        <div className="SequencesPage__controls">
          <label className="SequencesPage__control">
            <span>View</span>
            <select
              value={mode}
              onChange={(e) => {
                const nextMode = e.target.value as RangeMode;
                setMode(nextMode);
                if (nextMode === 'day' && !selectedDay && previousDay) {
                  setSelectedDay(previousDay);
                }
              }}
            >
              <option value="day">Day by day</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </label>

          {mode === 'day' ? (
            <div className="SequencesPage__dayNav" aria-label="Business day navigation">
              <button
                className="SequencesPage__dayButton"
                type="button"
                onClick={() => moveDay(-1)}
                aria-label="Go to previous day"
              >
                ←
              </button>
              <div className="SequencesPage__dayLabel">{formatBusinessDayLabel(activeDay)}</div>
              <button
                className="SequencesPage__dayButton"
                type="button"
                onClick={() => moveDay(1)}
                disabled={!canStepForward}
                aria-label="Go to next day"
              >
                →
              </button>
            </div>
          ) : null}

          <label className="SequencesPage__control SequencesPage__control--search">
            <span>Find sequence</span>
            <input
              type="search"
              value={search}
              placeholder="Filter sequence name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="SequencesPage__toggle">
            <input type="checkbox" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
            Include "{MANUAL_LABEL}" row
          </label>

          <label className="SequencesPage__control">
            <span>Min sends</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={minSendsThreshold}
              onChange={(e) => setMinSendsThreshold(Math.max(0, parseInt(e.target.value, 10) || 0))}
              style={{ width: '70px' }}
            />
          </label>
        </div>
        <p className="DataPanel__caption">
          View: {rangeLabel}. Time zone: {data?.meta?.timeZone ?? BUSINESS_TIME_ZONE}.
          {data?.meta?.sequenceBookedAttribution
            ? ` Matched ${data.meta.sequenceBookedAttribution.matchedCalls}/${data.meta.sequenceBookedAttribution.totalCalls} Slack booked calls to a sequence (${formatPct((data.meta.sequenceBookedAttribution.matchedCalls / Math.max(1, data.meta.sequenceBookedAttribution.totalCalls)) * 100)}).`
            : ''}
        </p>
      </section>

      {isLoading ? (
        <div className="DataLoading">Loading sequence KPIs…</div>
      ) : error ? (
        <div className="DataError">
          <div className="DataError__title">Failed to load sequence KPIs.</div>
          <div className="DataCode">{errorMessage}</div>
        </div>
      ) : (
        <>
          <section className="DataPanel">
            <h2 className="DataPanel__title">KPI Snapshot</h2>
            <div className="DataGrid">
              <div className="DataCard DataCard--accent">
                <div className="DataCard__label">Active sequences</div>
                <div className="DataCard__value">{summary.sequences}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Messages sent</div>
                <div className="DataCard__value">{summary.totalSent.toLocaleString()}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">People who replied</div>
                <div className="DataCard__value">{summary.totalReplies.toLocaleString()}</div>
                <p className="DataCard__meta">{formatPct(summary.weightedReplyRatePct)} reply rate (people)</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Booked calls (Slack)</div>
                <div className="DataCard__value">{summary.totalSlackBooked.toLocaleString()}</div>
                <p className="DataCard__meta">Call-level attribution shown per sequence in the table</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">SMS booking hints (diagnostic)</div>
                <div className="DataCard__value">{summary.totalSignals.toLocaleString()}</div>
                <p className="DataCard__meta">Diagnostic only (not the canonical booked KPI)</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Opt-outs</div>
                <div className="DataCard__value">{summary.totalOptOuts.toLocaleString()}</div>
                <p className="DataCard__meta">{formatPct(summary.weightedOptOutRatePct)} opt-out rate</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">High-risk sequences (opt-out)</div>
                <div className="DataCard__value">{summary.highRiskCount}</div>
              </div>
              {filteredCount > 0 && (
                <div className="DataCard DataCard--muted">
                  <div className="DataCard__label">Filtered out (low activity)</div>
                  <div className="DataCard__value">{filteredCount}</div>
                  <p className="DataCard__meta">Sequences with < {minSendsThreshold} sends hidden</p>
                </div>
              )}
            </div>
          </section>

          <section className="DataPanel">
            <h2 className="DataPanel__title">Comprehensive Sequence Table</h2>
            <div className="DataTableWrap">
              <table className="DataTable SequencesTable">
                <thead>
                  <tr>
                    <th>
                      <button className="SequencesSortButton" onClick={() => onSort('label')}>
                        Sequence{sortIndicator('label')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('messagesSent')}>
                        Messages sent{sortIndicator('messagesSent')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('repliesReceived')}>
                        People replied{sortIndicator('repliesReceived')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('replyRatePct')}>
                        Reply rate {sortIndicator('replyRatePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('slackBookedCalls')}>
                        Booked (Slack){sortIndicator('slackBookedCalls')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('bookingSignalsSms')}>
                        SMS booking hints{sortIndicator('bookingSignalsSms')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('optOuts')}>
                        Opt-outs{sortIndicator('optOuts')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('optOutRatePct')}>
                        Opt-out rate {sortIndicator('optOutRatePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('volumeSharePct')}>
                        Share of messages{sortIndicator('volumeSharePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('signalSharePct')}>
                        Share of booked calls{sortIndicator('signalSharePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('healthScore')}>
                        Health Score{sortIndicator('healthScore')}
                      </button>
                    </th>
                    <th className="is-right">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="SequencesTable__empty">
                        No sequences match the current filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.label} className={`SequencesTable__row SequencesTable__row--${row.riskLevel}`}>
                        <td className="SequencesTable__name">{row.label}</td>
                        <td className="is-right">{row.messagesSent.toLocaleString()}</td>
                        <td className="is-right">{row.repliesReceived.toLocaleString()}</td>
                        <td className="is-right">{formatPct(row.replyRatePct)}</td>
                        <td className="is-right">
                          {row.slackBookedCalls.toLocaleString()}
                          {row.slackBookedCalls > 0 ? (
                            <span className="SequencesCellMeta">
                              Jack {row.slackBookedJack} / Brandon {row.slackBookedBrandon} / Self {row.slackBookedSelf}
                            </span>
                          ) : null}
                        </td>
                        <td className="is-right">{row.bookingSignalsSms.toLocaleString()}</td>
                        <td className="is-right">{row.optOuts.toLocaleString()}</td>
                        <td className="is-right">{formatPct(row.optOutRatePct)}</td>
                        <td className="is-right">{formatPct(row.volumeSharePct)}</td>
                        <td className="is-right">{formatPct(row.signalSharePct)}</td>
                        <td className="is-right">{row.healthScore.toFixed(1)}</td>
                        <td className="is-right">
                          <span className={`SequencesRisk SequencesRisk--${row.riskLevel}`}>{row.riskLevel}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
