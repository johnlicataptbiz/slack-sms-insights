import { useMemo } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
import { SkeletonDashboard } from '../components/Skeleton';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../../utils/runDay';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';

type RepKey = 'jack' | 'brandon';

const BUSINESS_TZ = 'America/Chicago';

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtDeltaInt = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString()}`;
const fmtDeltaPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}pp`;

export default function RepV2({ rep }: { rep: RepKey }) {
  const currentBusinessDay = useMemo(
    () => resolveCurrentBusinessDay({ timeZone: BUSINESS_TZ, startHour: 4 }),
    [],
  );
  const day = useMemo(() => (currentBusinessDay ? shiftIsoDay(currentBusinessDay.day, -1) : null), [currentBusinessDay]);
  const prevDay = useMemo(() => (day ? shiftIsoDay(day, -1) : null), [day]);

  const { data, isLoading, isError, refetch } = useV2SalesMetrics(
    day ? { day, tz: BUSINESS_TZ } : { range: 'today', tz: BUSINESS_TZ },
  );
  const { data: prevData } = useV2SalesMetrics(prevDay ? { day: prevDay, tz: BUSINESS_TZ } : { range: 'today', tz: BUSINESS_TZ });

  const payload = data?.data;
  const prevPayload = prevData?.data;
  const name = rep === 'jack' ? 'Jack' : 'Brandon';

  const metrics = useMemo(() => {
    if (!payload) {
      return {
        booked: 0,
        replyRate: 0,
        outbound: 0,
        optOuts: 0,
        optOutRate: 0,
        hints: 0,
      };
    }

    const repRow = payload.reps.find((row) => row.repName.toLowerCase().includes(rep)) || null;
    const booked = rep === 'jack' ? payload.bookedCredit.jack : payload.bookedCredit.brandon;
    const replyRate = repRow?.replyRatePct ?? 0;
    const outbound = repRow?.outboundConversations ?? 0;
    const optOuts = repRow?.optOuts ?? 0;
    const optOutRate = outbound > 0 ? (optOuts / outbound) * 100 : 0;
    const hints = repRow?.diagnosticSmsBookingSignals ?? 0;

    return {
      booked,
      replyRate,
      outbound,
      optOuts,
      optOutRate,
      hints,
    };
  }, [payload, rep]);

  const prevMetrics = useMemo(() => {
    if (!prevPayload) return null;

    const repRow = prevPayload.reps.find((row) => row.repName.toLowerCase().includes(rep)) || null;
    const booked = rep === 'jack' ? prevPayload.bookedCredit.jack : prevPayload.bookedCredit.brandon;
    const replyRate = repRow?.replyRatePct ?? 0;
    const outbound = repRow?.outboundConversations ?? 0;
    const optOuts = repRow?.optOuts ?? 0;
    const optOutRate = outbound > 0 ? (optOuts / outbound) * 100 : 0;
    const hints = repRow?.diagnosticSmsBookingSignals ?? 0;

    return {
      booked,
      replyRate,
      outbound,
      optOuts,
      optOutRate,
      hints,
    };
  }, [prevPayload, rep]);

  const deltas = useMemo(() => {
    if (!prevMetrics) return null;
    return {
      booked: metrics.booked - prevMetrics.booked,
      outbound: metrics.outbound - prevMetrics.outbound,
      replyRate: metrics.replyRate - prevMetrics.replyRate,
      optOuts: metrics.optOuts - prevMetrics.optOuts,
      optOutRate: metrics.optOutRate - prevMetrics.optOutRate,
      hints: metrics.hints - prevMetrics.hints,
    };
  }, [metrics, prevMetrics]);

  const riskFlags = useMemo(() => {
    const flags: Array<{ level: 'critical' | 'warning' | 'info'; title: string; detail: string }> = [];

    if (metrics.optOutRate >= 3) {
      flags.push({
        level: 'critical',
        title: 'Opt-out rate above watch threshold',
        detail: `Current opt-out rate is ${fmtPct(metrics.optOutRate)} (watch threshold: 3.0%).`,
      });
    }
    if (metrics.outbound >= 40 && metrics.booked === 0) {
      flags.push({
        level: 'warning',
        title: 'High outbound volume with zero calls booked',
        detail: `${fmtInt(metrics.outbound)} outbound conversations with no booked-call credit.`,
      });
    }
    if (metrics.replyRate > 0 && metrics.replyRate < 5 && metrics.outbound >= 20) {
      flags.push({
        level: 'warning',
        title: 'Low reply rate on high volume',
        detail: `Reply rate is ${fmtPct(metrics.replyRate)} on ${fmtInt(metrics.outbound)} outbound conversations.`,
      });
    }
    if (deltas && deltas.optOuts > 0) {
      flags.push({
        level: 'info',
        title: 'Opt-outs increased day over day',
        detail: `${fmtDeltaInt(deltas.optOuts)} opt-outs vs ${prevDay || 'prior day'}.`,
      });
    }

    return flags;
  }, [deltas, metrics.booked, metrics.optOutRate, metrics.outbound, metrics.replyRate, prevDay]);

  if (isLoading) return <SkeletonDashboard />;
  if (isError || !payload) return (
    <V2State kind="error" onRetry={() => void refetch()}>
      Failed to load scorecard. Check your connection and try again.
    </V2State>
  );

  return (
    <div className="V2Page">
      <V2PageHeader
        title={`${name} Scorecard`}
        subtitle={`Daily activity summary for business day ${day || 'current'} (${BUSINESS_TZ}). Changes vs. ${prevDay || 'prior day'}.`}
      />

      <section className="V2MetricsGrid">
        <V2MetricCard
          label={<V2Term term="callsBookedCreditSlack" />}
          value={fmtInt(metrics.booked)}
          meta={deltas ? `${fmtDeltaInt(deltas.booked)} vs prior day` : 'No prior-day data yet'}
          tone="positive"
        />
        <V2MetricCard
          label={<V2Term term="outboundConversations" />}
          value={fmtInt(metrics.outbound)}
          meta={deltas ? `${fmtDeltaInt(deltas.outbound)} vs prior day` : 'No prior-day data yet'}
        />
        <V2MetricCard
          label={<V2Term term="replyRatePeople" />}
          value={fmtPct(metrics.replyRate)}
          meta={deltas ? `${fmtDeltaPct(deltas.replyRate)} vs prior day` : 'No prior-day data yet'}
          tone="accent"
        />
        <V2MetricCard
          label={<V2Term term="optOuts" />}
          value={fmtInt(metrics.optOuts)}
          meta={deltas ? `${fmtDeltaInt(deltas.optOuts)} vs prior day` : 'No prior-day data yet'}
          tone={metrics.optOuts > 0 ? 'critical' : 'default'}
        />
        <V2MetricCard
          label={<V2Term term="optOutRate" />}
          value={fmtPct(metrics.optOutRate)}
          meta={deltas ? `${fmtDeltaPct(deltas.optOutRate)} vs prior day` : 'No prior-day data yet'}
          tone={metrics.optOutRate >= 3 ? 'critical' : 'default'}
        />
        <V2MetricCard
          label={<V2Term term="smsBookingHintsDiagnostic" />}
          value={fmtInt(metrics.hints)}
          meta={deltas ? `${fmtDeltaInt(deltas.hints)} vs prior day` : 'No prior-day data yet'}
        />
        <V2MetricCard
          label="Booking Rate"
          value={metrics.outbound > 0 ? `${((metrics.booked / metrics.outbound) * 100).toFixed(1)}%` : 'n/a'}
          meta={`${fmtInt(metrics.booked)} booked / ${fmtInt(metrics.outbound)} outbound`}
          tone={metrics.outbound > 0 && (metrics.booked / metrics.outbound) * 100 >= 5 ? 'positive' : 'default'}
        />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Day by Day" caption="Changes from yesterday to today.">
          {deltas ? (
            <div className="V2DeltaList">
              <div>
                <span>Calls Booked</span>
                <strong>{fmtDeltaInt(deltas.booked)}</strong>
              </div>
              <div>
                <span>Outbound Conversations</span>
                <strong>{fmtDeltaInt(deltas.outbound)}</strong>
              </div>
              <div>
                <span>Reply Rate</span>
                <strong>{fmtDeltaPct(deltas.replyRate)}</strong>
              </div>
              <div>
                <span>Opt-Outs</span>
                <strong>{fmtDeltaInt(deltas.optOuts)}</strong>
              </div>
            </div>
          ) : (
            <V2State kind="empty">No prior-day data to compare yet.</V2State>
          )}
        </V2Panel>

        <V2Panel title="Watch List" caption="Things to keep an eye on.">
          {riskFlags.length ? (
            <div className="V2RiskFlags">
              {riskFlags.map((flag) => (
                <article className={`V2RiskFlag V2RiskFlag--${flag.level}`} key={`${flag.level}-${flag.title}`}>
                  <h3>{flag.title}</h3>
                  <p>{flag.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <V2State kind="empty">No issues flagged for today.</V2State>
          )}
        </V2Panel>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Team Totals" caption="How the team performed.">
          <div className="V2SplitStat">
            <div>
              <span>Jack</span>
              <strong>{fmtInt(payload.bookedCredit.jack)}</strong>
            </div>
            <div>
              <span>Brandon</span>
              <strong>{fmtInt(payload.bookedCredit.brandon)}</strong>
            </div>
            <div>
              <span>Self-Booked</span>
              <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
            </div>
          </div>
        </V2Panel>

        <V2Panel title="How to Read This Page" caption="This page is a daily summary, not a ranking.">
          <ul className="V2BulletList">
            <li>Calls Booked comes from Slack booking records.</li>
            <li>Booking Signals are for reference only — they don't count toward booked-call totals.</li>
            <li>Use the Sequences and Performance pages to dig into root cause.</li>
          </ul>
        </V2Panel>
      </div>
    </div>
  );
}
