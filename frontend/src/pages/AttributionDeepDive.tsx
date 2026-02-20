import React, { useMemo } from 'react';
import { useSalesMetrics } from '../api/queries';

function getTodayRange() {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AttributionDeepDive() {
  // Memoize params so React Query's queryKey stays stable and doesn't refetch forever.
  const range = useMemo(() => getTodayRange(), []);
  const { data, isLoading, error } = useSalesMetrics(range);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>Attribution — Deep Dive</h1>

      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        This page explains what we’re counting and why (manual vs sequence), plus how we credit replies and bookings.
      </div>

      {isLoading ? (
        <div>Loading…</div>
      ) : error ? (
        <div style={{ color: '#b00020' }}>Failed to load sales metrics.</div>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>Today — Reply rates</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Overall reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.replyRatePct != null ? `${data.totals.replyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.repliesReceived ?? '—'} replies / {data?.totals?.messagesSent ?? '—'} texts sent
              </div>
            </div>

            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Manual reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.manualReplyRatePct != null ? `${data.totals.manualReplyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.manualRepliesReceived ?? '—'} replies / {data?.totals?.manualMessagesSent ?? '—'} manual
                texts
              </div>
            </div>

            <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Sequence reply rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data?.totals?.sequenceReplyRatePct != null ? `${data.totals.sequenceReplyRatePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {data?.totals?.sequenceRepliesReceived ?? '—'} replies / {data?.totals?.sequenceMessagesSent ?? '—'}{' '}
                sequence texts
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
        </>
      )}
    </div>
  );
}
