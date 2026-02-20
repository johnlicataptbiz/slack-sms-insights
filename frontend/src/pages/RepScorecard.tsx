import React from 'react';
import { useSalesMetrics } from '../api/queries';

type RepKey = 'jack' | 'brandon';

type Props = {
  rep: RepKey;
};

function getTodayRange() {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

const titleFor = (rep: RepKey) => (rep === 'jack' ? 'Jack' : 'Brandon');

export default function RepScorecard({ rep }: Props) {
  const { data, isLoading, error } = useSalesMetrics(getTodayRange());

  // Back-compat: API returns bookedCalls buckets keyed by "jack"/"brandon".
  // Some older deployments may return rep names in repLeaderboard only.
  const repBooked =
    rep === 'jack'
      ? data?.bookedCalls?.jack ?? null
      : rep === 'brandon'
        ? data?.bookedCalls?.brandon ?? null
        : null;

  const repSelfBooked = data?.bookedCalls?.selfBooked ?? null;

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>{titleFor(rep)} — Scorecard</h1>

      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        Sales-first view for today. (Uses Slack booked-call credit where available.)
      </div>

      {isLoading ? (
        <div>Loading…</div>
      ) : error ? (
        <div style={{ color: '#b00020' }}>
          Failed to load metrics.
          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12 }}>{String((error as any)?.message ?? error)}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Calls booked — credit</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{repBooked ?? '—'}</div>
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Team total booked (Slack)</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{data?.bookedCalls?.booked ?? '—'}</div>
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Self-booked (Slack)</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{repSelfBooked ?? '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
