import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useV2InsightsSummary } from '../../api/v2Queries';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';
import { SkeletonDashboard } from '../components/Skeleton';

type Range = 'today' | '7d' | '30d' | '90d' | '180d' | '365d';

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '180d': 'Last 180 days',
  '365d': 'Last 365 days',
};

export function InsightsV2() {
  const [range, setRange] = useState<Range>('7d');
  const [searchParams] = useSearchParams();
  const repParam = (searchParams.get('rep') || '').toLowerCase();
  const selectedRep = repParam === 'jack' || repParam === 'brandon' ? repParam : null;

  const query = useV2InsightsSummary({ range, tz: 'America/Chicago', rep: selectedRep });
  const data = query.data?.data;

  const reps = useMemo(() => data?.reps ?? [], [data?.reps]);

  if (query.isLoading) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="High-level team and setter performance in one place." />
        <SkeletonDashboard />
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="High-level team and setter performance in one place." />
        <V2State kind="error" onRetry={() => void query.refetch()}>
          Failed to load performance summary.
        </V2State>
      </div>
    );
  }

  return (
    <div className="V2Page">
      <V2PageHeader
        title="Performance"
        subtitle="Team and rep KPIs, funnel conversion, risk watchlist, and Monday health."
        right={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(Object.keys(RANGE_LABELS) as Range[]).map((value) => (
              <button
                key={value}
                className={`V2Chip ${range === value ? 'is-active' : ''}`}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {RANGE_LABELS[value]}
              </button>
            ))}
          </div>
        }
      />

      <div className="V2MetricGrid">
        <V2MetricCard label="Messages sent" value={fmtInt(data.kpis.messagesSent)} />
        <V2MetricCard label="Unique contacted" value={fmtInt(data.kpis.uniqueContacted)} />
        <V2MetricCard label="Replies" value={fmtInt(data.kpis.repliesReceived)} />
        <V2MetricCard label="Reply rate" value={fmtPct(data.kpis.replyRatePct)} tone={data.kpis.replyRatePct >= 10 ? 'positive' : 'default'} />
        <V2MetricCard label="Booked calls" value={fmtInt(data.kpis.bookedCalls)} tone="positive" />
        <V2MetricCard label="Booking rate" value={fmtPct(data.kpis.bookingRatePct)} tone={data.kpis.bookingRatePct >= 2 ? 'positive' : 'default'} />
        <V2MetricCard label="Opt-outs" value={fmtInt(data.kpis.optOuts)} tone={data.kpis.optOuts > 0 ? 'critical' : 'default'} />
        <V2MetricCard label="Opt-out rate" value={fmtPct(data.kpis.optOutRatePct)} tone={data.kpis.optOutRatePct >= 3 ? 'critical' : 'default'} />
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Setter Comparison" caption="Embedded Jack/Brandon scorecards.">
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Contacted</th>
                  <th className="is-right">Replies</th>
                  <th className="is-right">Reply %</th>
                  <th className="is-right">Booked</th>
                  <th className="is-right">Booking %</th>
                  <th className="is-right">Opt-outs</th>
                  <th className="is-right">Opt-out %</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((rep) => {
                  const isSelected = selectedRep && rep.repId === selectedRep;
                  return (
                    <tr key={rep.repId} className={isSelected ? 'V2Table__row--highlight' : ''}>
                      <td style={{ textTransform: 'capitalize' }}>{rep.repId}</td>
                      <td className="is-right">{fmtInt(rep.messagesSent)}</td>
                      <td className="is-right">{fmtInt(rep.uniqueContacted)}</td>
                      <td className="is-right">{fmtInt(rep.repliesReceived)}</td>
                      <td className="is-right">{fmtPct(rep.replyRatePct)}</td>
                      <td className="is-right">{fmtInt(rep.bookedCalls)}</td>
                      <td className="is-right">{fmtPct(rep.bookingRatePct)}</td>
                      <td className="is-right">{fmtInt(rep.optOuts)}</td>
                      <td className="is-right">{fmtPct(rep.optOutRatePct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </V2Panel>

        <V2Panel title="Funnel" caption="Contacted -> replied -> booked conversion and dropoff.">
          <div className="V2SplitStat">
            <div>
              <span>Contacted</span>
              <strong>{fmtInt(data.funnel.contacted)}</strong>
            </div>
            <div>
              <span>Replied</span>
              <strong>{fmtInt(data.funnel.replied)}</strong>
            </div>
            <div>
              <span>Booked</span>
              <strong>{fmtInt(data.funnel.booked)}</strong>
            </div>
          </div>
          <div className="V2DeltaList" style={{ marginTop: '1rem' }}>
            <div>
              <span>Contact -&gt; Reply Dropoff</span>
              <strong>{fmtPct(data.funnel.replyDropoffPct)}</strong>
            </div>
            <div>
              <span>Reply -&gt; Booking Dropoff</span>
              <strong>{fmtPct(data.funnel.bookingDropoffPct)}</strong>
            </div>
          </div>
        </V2Panel>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Risk Watchlist" caption="Auto-flagged issues from KPI thresholds.">
          {data.risks.length === 0 ? (
            <V2State kind="empty">No active risk flags for this window.</V2State>
          ) : (
            <div className="V2RiskFlags">
              {data.risks.map((risk) => (
                <article key={risk.key} className={`V2RiskFlag V2RiskFlag--${risk.severity}`}>
                  <h3>{risk.severity.toUpperCase()}</h3>
                  <p>{risk.message}</p>
                </article>
              ))}
            </div>
          )}
        </V2Panel>

        <V2Panel title="Monday Health" caption="Compact sync and coverage health.">
          <div className="V2SplitStat">
            <div>
              <span>Boards</span>
              <strong>{fmtInt(data.mondayHealth.boards)}</strong>
            </div>
            <div>
              <span>Stale</span>
              <strong>{fmtInt(data.mondayHealth.staleBoards)}</strong>
            </div>
            <div>
              <span>Errored</span>
              <strong>{fmtInt(data.mondayHealth.erroredBoards)}</strong>
            </div>
          </div>
          <div className="V2DeltaList" style={{ marginTop: '1rem' }}>
            <div>
              <span>Source Coverage</span>
              <strong>{fmtPct(data.mondayHealth.avgSourceCoveragePct)}</strong>
            </div>
            <div>
              <span>Campaign Coverage</span>
              <strong>{fmtPct(data.mondayHealth.avgCampaignCoveragePct)}</strong>
            </div>
          </div>
        </V2Panel>
      </div>
    </div>
  );
}

export default InsightsV2;
