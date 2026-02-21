import React, { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { useSalesMetrics } from '../api/queries';
import { dayKeyInTimeZone, shiftIsoDay } from '../utils/runDay';
import '../styles/DataPages.css';
import '../styles/Sequences.css';

const BUSINESS_TIME_ZONE = 'America/Chicago';
const MANUAL_LABEL = 'No sequence (manual/direct)';

type RangeMode = 'previous-day' | '7d' | '30d';
type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'label'
  | 'messagesSent'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'bookingSignalsSms'
  | 'closeRatePct'
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
  bookingSignalsSms: number;
  optOuts: number;
  closeRatePct: number;
  optOutRatePct: number;
  volumeSharePct: number;
  signalSharePct: number;
  healthScore: number;
  riskLevel: RiskLevel;
};

const formatPct = (value: number): string => `${value.toFixed(1)}%`;

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
  const [mode, setMode] = useState<RangeMode>('previous-day');
  const [search, setSearch] = useState('');
  const [includeManual, setIncludeManual] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('messagesSent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const previousDay = useMemo(() => {
    const today = dayKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
    if (!today) return null;
    return shiftIsoDay(today, -1);
  }, []);

  const salesQuery = useMemo(() => {
    if (mode === 'previous-day' && previousDay) {
      return { day: previousDay, tz: BUSINESS_TIME_ZONE } as const;
    }
    if (mode === '7d') return { range: '7d' as const, tz: BUSINESS_TIME_ZONE };
    return { range: '30d' as const, tz: BUSINESS_TIME_ZONE };
  }, [mode, previousDay]);

  const { data, isLoading, error } = useSalesMetrics(salesQuery);

  const rows = useMemo((): SequenceKpiRow[] => {
    const sourceRows = data?.topSequences ?? [];
    const totalSent = sourceRows.reduce((sum, row) => sum + row.messagesSent, 0);
    const totalSignals = sourceRows.reduce((sum, row) => sum + row.bookingSignalsSms, 0);
    const searchText = search.trim().toLowerCase();

    const filtered = sourceRows
      .filter((row) => (includeManual ? true : row.label !== MANUAL_LABEL))
      .filter((row) => (searchText ? row.label.toLowerCase().includes(searchText) : true))
      .map((row) => {
        const closeRatePct = row.repliesReceived > 0 ? (row.bookingSignalsSms / row.repliesReceived) * 100 : 0;
        const optOutRatePct = row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0;
        const volumeSharePct = totalSent > 0 ? (row.messagesSent / totalSent) * 100 : 0;
        const signalSharePct = totalSignals > 0 ? (row.bookingSignalsSms / totalSignals) * 100 : 0;
        const riskLevel = getRiskLevel({ optOutRatePct, optOuts: row.optOuts, messagesSent: row.messagesSent });
        const healthScore = toHealthScore({
          messagesSent: row.messagesSent,
          replyRatePct: row.replyRatePct,
          closeRatePct,
          optOutRatePct,
        });

        return {
          label: row.label,
          messagesSent: row.messagesSent,
          repliesReceived: row.repliesReceived,
          replyRatePct: row.replyRatePct,
          bookingSignalsSms: row.bookingSignalsSms,
          optOuts: row.optOuts,
          closeRatePct,
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
  }, [data?.topSequences, includeManual, search, sortDirection, sortKey]);

  const summary = useMemo(() => {
    const totalSent = rows.reduce((sum, row) => sum + row.messagesSent, 0);
    const totalReplies = rows.reduce((sum, row) => sum + row.repliesReceived, 0);
    const totalSignals = rows.reduce((sum, row) => sum + row.bookingSignalsSms, 0);
    const totalOptOuts = rows.reduce((sum, row) => sum + row.optOuts, 0);
    const highRiskCount = rows.filter((row) => row.riskLevel === 'high').length;

    return {
      sequences: rows.length,
      totalSent,
      totalReplies,
      totalSignals,
      totalOptOuts,
      highRiskCount,
      weightedReplyRatePct: totalSent > 0 ? (totalReplies / totalSent) * 100 : 0,
      weightedSignalCloseRatePct: totalReplies > 0 ? (totalSignals / totalReplies) * 100 : 0,
      weightedOptOutRatePct: totalSent > 0 ? (totalOptOuts / totalSent) * 100 : 0,
    };
  }, [rows]);

  const rangeLabel =
    mode === 'previous-day' ? `Previous Day (${previousDay ?? 'auto'})` : mode === '7d' ? 'Last 7 Days' : 'Last 30 Days';

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
        Detailed sequence KPIs from canonical sms_events attribution. Sequence names are preserved exactly as stored
        (for example, 1.2 and 1.3 remain separate labels).
      </p>

      <section className="DataPanel">
        <div className="SequencesPage__controls">
          <label className="SequencesPage__control">
            <span>Window</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as RangeMode)}>
              <option value="previous-day">Previous Day</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </label>

          <label className="SequencesPage__control SequencesPage__control--search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="Filter sequence name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="SequencesPage__toggle">
            <input type="checkbox" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
            Include "{MANUAL_LABEL}"
          </label>
        </div>
        <p className="DataPanel__caption">
          Range: {rangeLabel}. Time zone: {data?.meta?.timeZone ?? BUSINESS_TIME_ZONE}. Sequence-level booked values
          are SMS booking signals (diagnostic), not the canonical Slack booked KPI.
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
                <div className="DataCard__label">Sequence messages sent</div>
                <div className="DataCard__value">{summary.totalSent.toLocaleString()}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">People replied</div>
                <div className="DataCard__value">{summary.totalReplies.toLocaleString()}</div>
                <p className="DataCard__meta">{formatPct(summary.weightedReplyRatePct)} weighted reply rate</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Booking signals (SMS)</div>
                <div className="DataCard__value">{summary.totalSignals.toLocaleString()}</div>
                <p className="DataCard__meta">{formatPct(summary.weightedSignalCloseRatePct)} signal close rate</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Opt-outs</div>
                <div className="DataCard__value">{summary.totalOptOuts.toLocaleString()}</div>
                <p className="DataCard__meta">{formatPct(summary.weightedOptOutRatePct)} weighted opt-out rate</p>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">High-risk sequences</div>
                <div className="DataCard__value">{summary.highRiskCount}</div>
              </div>
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
                        Sent{sortIndicator('messagesSent')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('repliesReceived')}>
                        Replies{sortIndicator('repliesReceived')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('replyRatePct')}>
                        Reply % {sortIndicator('replyRatePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('bookingSignalsSms')}>
                        Booking Signals{sortIndicator('bookingSignalsSms')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('closeRatePct')}>
                        Close % {sortIndicator('closeRatePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('optOuts')}>
                        Opt-outs{sortIndicator('optOuts')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('optOutRatePct')}>
                        Opt-out % {sortIndicator('optOutRatePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('volumeSharePct')}>
                        Volume Share{sortIndicator('volumeSharePct')}
                      </button>
                    </th>
                    <th className="is-right">
                      <button className="SequencesSortButton" onClick={() => onSort('signalSharePct')}>
                        Signal Share{sortIndicator('signalSharePct')}
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
                        <td className="is-right">{row.bookingSignalsSms.toLocaleString()}</td>
                        <td className="is-right">{formatPct(row.closeRatePct)}</td>
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
