import React, { useMemo, useState } from 'react';
import '../styles/Dashboard.css';
import { useMetricsOverview, useMetricsSla, useMetricsVolumeByDay, useMetricsWorkloadByRep } from '../api/queries';

export default function Insights({ token }: { token: string }) {
  const [days, setDays] = useState(7);

  // token is currently stored in localStorage and used by apiFetch; keep prop for parity with other pages
  const _token = token;

  const overview = useMetricsOverview(days);
  const sla = useMetricsSla(days);
  const workload = useMetricsWorkloadByRep(days);
  const volume = useMetricsVolumeByDay(days);

  const breachPct = useMemo(() => {
    const v = sla.data?.sla.breachRate ?? 0;
    return `${Math.round(v * 100)}%`;
  }, [sla.data?.sla.breachRate]);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>📊 Insights</h1>
          <p>Leadership metrics (server-side aggregation)</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Window
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Open work items</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {overview.isLoading ? '…' : overview.data?.overview.openWorkItems ?? '-'}
          </div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Overdue work items</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {overview.isLoading ? '…' : overview.data?.overview.overdueWorkItems ?? '-'}
          </div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Open needs_reply</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {overview.isLoading ? '…' : overview.data?.overview.openNeedsReply ?? '-'}
          </div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Breach rate</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{sla.isLoading ? '…' : breachPct}</div>
        </div>
      </div>

      <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
        <h3 style={{ marginTop: 0 }}>SLA distribution (minutes)</h3>
        {sla.isLoading ? (
          <div className="loading">Loading SLA…</div>
        ) : sla.error ? (
          <div className="error-message">Failed to load SLA metrics</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>p50</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{sla.data?.sla.p50Minutes ?? '-'}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>p75</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{sla.data?.sla.p75Minutes ?? '-'}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>p90</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{sla.data?.sla.p90Minutes ?? '-'}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>p95</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{sla.data?.sla.p95Minutes ?? '-'}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
        <h3 style={{ marginTop: 0 }}>Workload by rep (open items)</h3>
        {workload.isLoading ? (
          <div className="loading">Loading workload…</div>
        ) : workload.error ? (
          <div className="error-message">Failed to load workload metrics</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="run-list-table">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th>Open</th>
                  <th>Overdue</th>
                  <th>Needs reply</th>
                  <th>Needs reply overdue</th>
                  <th>High severity</th>
                </tr>
              </thead>
              <tbody>
                {(workload.data?.workload.rows || []).map((r) => (
                  <tr key={r.repId ?? 'unassigned'}>
                    <td>{r.repId || '(unassigned)'}</td>
                    <td>{r.openWorkItems}</td>
                    <td>{r.overdueWorkItems}</td>
                    <td>{r.openNeedsReply}</td>
                    <td>{r.overdueNeedsReply}</td>
                    <td>{r.highSeverityOpen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
        <h3 style={{ marginTop: 0 }}>Volume by day</h3>
        {volume.isLoading ? (
          <div className="loading">Loading volume…</div>
        ) : volume.error ? (
          <div className="error-message">Failed to load volume metrics</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="run-list-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Inbound</th>
                  <th>Outbound</th>
                </tr>
              </thead>
              <tbody>
                {(volume.data?.volume.rows || []).map((r) => (
                  <tr key={r.day}>
                    <td>{r.day}</td>
                    <td>{r.inbound}</td>
                    <td>{r.outbound}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
