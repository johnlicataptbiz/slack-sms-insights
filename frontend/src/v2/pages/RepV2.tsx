import { useMemo } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
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

  const { data, isLoading, isError, error } = useV2SalesMetrics(
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
        title: 'Low reply efficiency on active volume',
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

  if (isLoading) return <V2State kind="loading">Loading setter scorecard…</V2State>;
  if (isError || !payload) return <V2State kind="error">Failed to load setter scorecard: {String((error as Error)?.message || error)}</V2State>;

  return (
    <div className="V2Page">
      <V2PageHeader
        title={`${name} Scorecard`}
        subtitle={`Daily activity summary for business day ${day || 'current'} (${BUSINESS_TZ}). Deltas compare against ${prevDay || 'prior day'} for coaching context.`}
      />

      <section className="V2MetricsGrid">
        <V2MetricCard
          label={<V2Term term="callsBookedCreditSlack" />}
          value={fmtInt(metrics.booked)}
          meta={deltas ? `${fmtDeltaInt(deltas.booked)} vs prior day` : 'No prior-day baseline yet'}
          tone="positive"
        />
        <V2MetricCard
          label={<V2Term term="outboundConversations" />}
          value={fmtInt(metrics.outbound)}
          meta={deltas ? `${fmtDeltaInt(deltas.outbound)} vs prior day` : 'No prior-day baseline yet'}
        />
        <V2MetricCard
          label={<V2Term term="replyRatePeople" />}
          value={fmtPct(metrics.replyRate)}
          meta={deltas ? `${fmtDeltaPct(deltas.replyRate)} vs prior day` : 'No prior-day baseline yet'}
          tone="accent"
        />
        <V2MetricCard
          label={<V2Term term="optOuts" />}
          value={fmtInt(metrics.optOuts)}
          meta={deltas ? `${fmtDeltaInt(deltas.optOuts)} vs prior day` : 'No prior-day baseline yet'}
          tone={metrics.optOuts > 0 ? 'critical' : 'default'}
        />
        <V2MetricCard
          label={<V2Term term="optOutRate" />}
          value={fmtPct(metrics.optOutRate)}
          meta={deltas ? `${fmtDeltaPct(deltas.optOutRate)} vs prior day` : 'No prior-day baseline yet'}
          tone={metrics.optOutRate >= 3 ? 'critical' : 'default'}
        />
        <V2MetricCard
          label={<V2Term term="smsBookingHintsDiagnostic" />}
          value={fmtInt(metrics.hints)}
          meta={deltas ? `${fmtDeltaInt(deltas.hints)} vs prior day` : 'No prior-day baseline yet'}
        />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Day-over-Day Deltas" caption={`Compared with ${prevDay || 'prior day'}.`}>
          {deltas ? (
            <div className="V2DeltaList">
              <div>
                <span>Booked Call Credit</span>
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
            <V2State kind="empty">No prior-day data to calculate deltas yet.</V2State>
          )}
        </V2Panel>

        <V2Panel title="At-Risk Flags" caption="Setter Ops Pack checks for execution drift.">
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
            <V2State kind="empty">No at-risk flags for this setter on this day.</V2State>
          )}
        </V2Panel>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Team Booked Call Credit (Slack)" caption="Canonical split from Slack reactions.">
          <div className="V2SplitStat">
            <div>
              <span>Setter Jack</span>
              <strong>{fmtInt(payload.bookedCredit.jack)}</strong>
            </div>
            <div>
              <span>Setter Brandon</span>
              <strong>{fmtInt(payload.bookedCredit.brandon)}</strong>
            </div>
            <div>
              <span>Self-Booked</span>
              <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
            </div>
          </div>
        </V2Panel>

        <V2Panel title="How to Read This Card" caption="This page is a daily summary, not a ranking.">
          <ul className="V2BulletList">
            <li>Calls Booked KPI is sourced from Slack booked-call records.</li>
            <li>SMS Booking Hints are diagnostic-only and never added to booked-call totals.</li>
            <li>Use Sequence Performance and Insights attribution panels to diagnose root cause.</li>
          </ul>
        </V2Panel>
      </div>
    </div>
  );
}
