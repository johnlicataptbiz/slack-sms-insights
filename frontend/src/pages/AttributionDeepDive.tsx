import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { useSalesMetrics } from '../api/queries';

const BUSINESS_TIME_ZONE = 'America/Chicago';

export default function AttributionDeepDive() {
  const salesQuery = useMemo(
    () => ({ range: 'today' as const, tz: BUSINESS_TIME_ZONE }),
    [],
  );
  const { data, isLoading, error, refetch, isFetching, fetchStatus, status } = useSalesMetrics(salesQuery);
  const [stuck, setStuck] = useState(false);

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
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>Attribution — Deep Dive</h1>

      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        This page explains what we’re counting and why (manual vs sequence), plus how we credit replies and bookings.
      </div>

      {isLoading && !stuck ? (
        <div>Loading…</div>
      ) : error || stuck ? (
        <div
          style={{
            border: '1px solid rgba(176, 0, 32, 0.35)',
            background: 'rgba(176, 0, 32, 0.06)',
            borderRadius: 8,
            padding: 12,
            color: '#b00020',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {stuck ? 'Still loading sales metrics (possible hang)' : 'Failed to load sales metrics'}
          </div>
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {stuck
              ? `status=${String(status)} fetchStatus=${String(fetchStatus)} isLoading=${String(isLoading)} isFetching=${String(isFetching)}`
              : errorMessage ?? 'Unknown error'}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => refetch()}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid rgba(176, 0, 32, 0.35)',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>
            Today — Reply rates (people-based)
            {isFetching ? <span style={{ fontSize: 12, opacity: 0.6 }}> (refreshing…)</span> : null}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Overall reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.replyRatePct != null ? `${data.totals.replyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.repliesReceived ?? '—'} people replied / {data?.totals?.peopleContacted ?? '—'} people
                contacted
              </div>
            </div>

            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Manual reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.manualReplyRatePct != null ? `${data.totals.manualReplyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.manualRepliesReceived ?? '—'} people replied / {data?.totals?.manualPeopleContacted ?? '—'}{' '}
                people contacted manually
              </div>
            </div>

            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Sequence reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.sequenceReplyRatePct != null ? `${data.totals.sequenceReplyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.sequenceRepliesReceived ?? '—'} people replied /{' '}
                {data?.totals?.sequencePeopleContacted ?? '—'} people contacted by sequence
              </div>
            </div>
          </div>

          <h2>Rule: exclude manual follow-ups after a sequence reply</h2>
          <div style={{ opacity: 0.85, lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}>
              If someone replies to a <b>sequence</b>, we treat the next 14 days as “sequence-driven.” During that window,
              we <b>exclude manual outbound texts</b> from “Manual texts sent” so we don’t inflate manual volume with
              follow-ups that were triggered by the sequence reply.
            </p>
            <p style={{ marginBottom: 0 }}>
              In other words: manual follow-ups inside that 14-day window are not counted as “new manual sends.”
            </p>
          </div>

          <h2>Booked calls — credit (from Slack)</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Canonical booked KPI source: Slack. Time zone: {data?.meta?.timeZone ?? BUSINESS_TIME_ZONE}.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Total booked</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.bookedCalls?.booked ?? '—'}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Jack</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.bookedCalls?.jack ?? '—'}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Brandon</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.bookedCalls?.brandon ?? '—'}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Self-booked</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.bookedCalls?.selfBooked ?? '—'}</div>
            </div>
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer' }}>Show diagnostic SMS booking signals (non-canonical)</summary>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              These values come from SMS text heuristics and are for diagnostics only.
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Sequence-level SMS booking signals</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {(data?.topSequences ?? []).reduce((sum, row) => sum + row.bookingSignalsSms, 0)}
                </div>
              </div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Rep-level SMS booking signals</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {(data?.repLeaderboard ?? []).reduce((sum, row) => sum + row.bookingSignalsSms, 0)}
                </div>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
