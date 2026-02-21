import React, { useMemo } from 'react';
import { useSalesMetrics } from '../api/queries';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../utils/runDay';
import '../styles/DataPages.css';

type RepKey = 'jack' | 'brandon';

type Props = {
  rep: RepKey;
};

const BUSINESS_TIME_ZONE = 'America/Chicago';

const titleFor = (rep: RepKey) => (rep === 'jack' ? 'Jack' : 'Brandon');

export default function RepScorecard({ rep }: Props) {
  const currentBusinessDay = useMemo(
    () => resolveCurrentBusinessDay({ timeZone: BUSINESS_TIME_ZONE, startHour: 4 }),
    [],
  );
  const businessDay = useMemo(
    () => (currentBusinessDay ? shiftIsoDay(currentBusinessDay.day, -1) : null),
    [currentBusinessDay],
  );
  const salesQuery = businessDay
    ? { day: businessDay, tz: BUSINESS_TIME_ZONE }
    : { range: 'today' as const, tz: BUSINESS_TIME_ZONE };
  const { data, isLoading, error } = useSalesMetrics(salesQuery);

  // Back-compat: API returns bookedCalls buckets keyed by "jack"/"brandon".
  // Some older deployments may return rep names in repLeaderboard only.
  const repBooked =
    rep === 'jack'
      ? data?.bookedCalls?.jack ?? null
      : rep === 'brandon'
        ? data?.bookedCalls?.brandon ?? null
        : null;

  const repSelfBooked = data?.bookedCalls?.selfBooked ?? null;
  const periodLabel = 'Previous Day';

  return (
    <div className="DataPage">
      <div className="DataPage__header">
        <h1 className="DataPage__title">{titleFor(rep)} Scorecard</h1>
      </div>

      <p className="DataPage__subtitle">
        Sales-first view for the previous business day. (Uses Slack booked-call credit where available.)
      </p>

      {isLoading ? (
        <div className="DataLoading">Loading metrics…</div>
      ) : error ? (
        <div className="DataError">
          <div className="DataError__title">Failed to load metrics.</div>
          <div className="DataCode">{String((error as any)?.message ?? error)}</div>
        </div>
      ) : (
        <div className="DataPanel">
          <h2 className="DataPanel__title">{periodLabel}</h2>
          <p className="DataPanel__caption">
            Business day: {businessDay ?? 'auto'} (previous-day view). Canonical booked KPI source: Slack (
            {BUSINESS_TIME_ZONE}).
          </p>
          <div className="DataGrid DataGrid--tight">
            <div className="DataCard DataCard--accent">
              <div className="DataCard__label">Calls booked credit</div>
              <div className="DataCard__value">{repBooked ?? '—'}</div>
            </div>

            <div className="DataCard">
              <div className="DataCard__label">Team total booked</div>
              <div className="DataCard__value">{data?.bookedCalls?.booked ?? '—'}</div>
            </div>

            <div className="DataCard">
              <div className="DataCard__label">Self-booked</div>
              <div className="DataCard__value">{repSelfBooked ?? '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
