import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { useSalesMetrics } from '../api/queries';
import { resolveCurrentBusinessDay } from '../utils/runDay';
import '../styles/DataPages.css';

const BUSINESS_TIME_ZONE = 'America/Chicago';

export default function AttributionDeepDive() {
  const businessDay = useMemo(
    () => resolveCurrentBusinessDay({ timeZone: BUSINESS_TIME_ZONE, startHour: 4 }),
    [],
  );
  const salesQuery = useMemo(
    () =>
      businessDay
        ? { day: businessDay.day, tz: BUSINESS_TIME_ZONE }
        : ({ range: 'today' as const, tz: BUSINESS_TIME_ZONE }),
    [businessDay],
  );
  const { data, isLoading, error, refetch, isFetching, fetchStatus, status } = useSalesMetrics(salesQuery);
  const [stuck, setStuck] = useState(false);
  const periodLabel = businessDay?.isCarryOver ? 'Yesterday' : 'Today';

  useEffect(() => {
    if (!isLoading) return;
    const id = window.setTimeout(() => setStuck(true), 8000);
    return () => window.clearTimeout(id);
  }, [isLoading]);

  const errorMessage = (() => {
    if (!error) return null;
    if (error instanceof ApiError) {
      return `${error.message} (status ${error.status})`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
  })();

  return (
    <div className="DataPage">
      <div className="DataPage__header">
        <h1 className="DataPage__title">Attribution Deep Dive</h1>
      </div>

      <p className="DataPage__subtitle">
        This page explains what we’re counting and why (manual vs sequence), plus how we credit replies and bookings.
      </p>

      {isLoading && !stuck ? (
        <div className="DataLoading">Loading sales metrics…</div>
      ) : error || stuck ? (
        <div className="DataError">
          <div className="DataError__title">
            {stuck ? 'Still loading sales metrics (possible hang)' : 'Failed to load sales metrics'}
          </div>
          <div className="DataCode">
            {stuck
              ? `status=${String(status)} fetchStatus=${String(fetchStatus)} isLoading=${String(isLoading)} isFetching=${String(isFetching)}`
              : errorMessage ?? 'Unknown error'}
          </div>
          <button className="DataBtn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="DataPanel">
            <div className="DataPanel__titleRow">
              <h2 className="DataPanel__title">{periodLabel}: reply rates (people-based)</h2>
              {isFetching ? <span className="DataPanel__status">Refreshing...</span> : null}
            </div>
            <p className="DataPanel__caption">
              Business day: {businessDay?.day ?? 'auto'} {businessDay?.isCarryOver ? '(carry-over before 4:00 AM CT)' : ''}
              .
            </p>
            <div className="DataGrid">
              <div className="DataCard DataCard--accent">
                <div className="DataCard__label">Overall reply rate</div>
                <div className="DataCard__value">
                  {data?.totals?.replyRatePct != null ? `${data.totals.replyRatePct.toFixed(1)}%` : '—'}
                </div>
                <p className="DataCard__meta">
                  {data?.totals?.repliesReceived ?? '—'} people replied / {data?.totals?.peopleContacted ?? '—'} people
                  contacted
                </p>
              </div>

              <div className="DataCard">
                <div className="DataCard__label">Manual reply rate</div>
                <div className="DataCard__value">
                  {data?.totals?.manualReplyRatePct != null ? `${data.totals.manualReplyRatePct.toFixed(1)}%` : '—'}
                </div>
                <p className="DataCard__meta">
                  {data?.totals?.manualRepliesReceived ?? '—'} people replied /{' '}
                  {data?.totals?.manualPeopleContacted ?? '—'} people contacted manually
                </p>
              </div>

              <div className="DataCard">
                <div className="DataCard__label">Sequence reply rate</div>
                <div className="DataCard__value">
                  {data?.totals?.sequenceReplyRatePct != null ? `${data.totals.sequenceReplyRatePct.toFixed(1)}%` : '—'}
                </div>
                <p className="DataCard__meta">
                  {data?.totals?.sequenceRepliesReceived ?? '—'} people replied /{' '}
                  {data?.totals?.sequencePeopleContacted ?? '—'} people contacted by sequence
                </p>
              </div>
            </div>
          </section>

          <section className="DataPanel">
            <h2 className="DataPanel__title">Rule: exclude manual follow-ups after a sequence reply</h2>
            <p className="DataText">
              If someone replies to a <b>sequence</b>, the next 14 days are treated as sequence-driven. During that
              window, manual outbound texts are excluded from manual volume.
            </p>
            <p className="DataText">
              This prevents manual counts from being inflated by follow-ups that were triggered by a sequence reply.
            </p>
          </section>

          <section className="DataPanel">
            <h2 className="DataPanel__title">Booked calls credit (Slack)</h2>
            <p className="DataPanel__caption">
              Business day: {businessDay?.day ?? 'auto'}. Canonical booked KPI source: Slack. Time zone:{' '}
              {data?.meta?.timeZone ?? BUSINESS_TIME_ZONE}.
            </p>
            <div className="DataGrid DataGrid--tight">
              <div className="DataCard DataCard--accent">
                <div className="DataCard__label">Total booked</div>
                <div className="DataCard__value">{data?.bookedCalls?.booked ?? '—'}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Jack</div>
                <div className="DataCard__value">{data?.bookedCalls?.jack ?? '—'}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Brandon</div>
                <div className="DataCard__value">{data?.bookedCalls?.brandon ?? '—'}</div>
              </div>
              <div className="DataCard">
                <div className="DataCard__label">Self-booked</div>
                <div className="DataCard__value">{data?.bookedCalls?.selfBooked ?? '—'}</div>
              </div>
            </div>
          </section>

          <details className="DataDetails">
            <summary>Show diagnostic SMS booking signals (non-canonical)</summary>
            <div className="DataDetails__body">
              <p className="DataPanel__caption">These values come from SMS text heuristics and are for diagnostics only.</p>
              <div className="DataGrid DataGrid--tight">
                <div className="DataCard">
                  <div className="DataCard__label">Sequence-level SMS booking signals</div>
                  <div className="DataCard__value">
                    {(data?.topSequences ?? []).reduce((sum, row) => sum + row.bookingSignalsSms, 0)}
                  </div>
                </div>
                <div className="DataCard">
                  <div className="DataCard__label">Rep-level SMS booking signals</div>
                  <div className="DataCard__value">
                    {(data?.repLeaderboard ?? []).reduce((sum, row) => sum + row.bookingSignalsSms, 0)}
                  </div>
                </div>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
