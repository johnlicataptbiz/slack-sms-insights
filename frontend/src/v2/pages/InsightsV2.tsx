import { useMemo, useState } from 'react';

import type { SalesMetricsV2, WeeklyManagerSummaryV2 } from '../../api/v2-types';
import { useV2SalesMetrics, useV2SetterTrend, useV2WeeklySummary } from '../../api/v2Queries';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term, V2RiskAlert, V2StatBar, V2PipelineVisual, V2ActionList, V2MiniTrend } from '../components/V2Primitives';

const BUSINESS_TZ = 'America/Chicago';
type InsightsRange = 'today' | '7d' | '30d';

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtPctMaybe = (n: number | null | undefined) => (typeof n === 'number' ? fmtPct(n) : 'n/a');
const fmtDateTime = (value: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const riskTone = (optOutRate: number): 'critical' | 'accent' | 'default' => {
  if (optOutRate >= 6) return 'critical';
  if (optOutRate >= 3) return 'accent';
  return 'default';
};

const rangeLabel = (range: InsightsRange): string => {
  if (range === 'today') return 'Today';
  if (range === '30d') return 'Last 30 days';
  return 'Last 7 days';
};

// Calculate trend direction from sparkline data
const calculateTrend = (data: number[]): 'up' | 'down' | 'flat' => {
  if (data.length < 2) return 'flat';
  const first = data[0];
  const last = data[data.length - 1];
  const change = last - first;
  if (change > 0.01) return 'up';
  if (change < -0.01) return 'down';
  return 'flat';
};

export const computeInsightsBookedBreakdown = (payload: SalesMetricsV2) => {
  const bookedAttribution = payload.provenance.sequenceBookedAttribution;
  const bookedTotalAllChannels = payload.totals.canonicalBookedCalls;
  const bookedSmsLinkedStrict = bookedAttribution?.strictSmsReplyLinkedCalls ?? 0;
  const bookedSelf = payload.bookedCredit.selfBooked;
  const bookedNonSmsOrUnknown =
    bookedAttribution?.nonSmsOrUnknownCalls ?? Math.max(0, bookedTotalAllChannels - bookedSmsLinkedStrict);
  const bookedNonSmsOrUnknownExcludingSelf = Math.max(0, bookedNonSmsOrUnknown - bookedSelf);
  return {
    bookedTotalAllChannels,
    bookedSmsLinkedStrict,
    bookedSelf,
    bookedNonSmsOrUnknownExcludingSelf,
    bookedAttribution,
  };
};

export function InsightsV2() {
  const [range, setRange] = useState<InsightsRange>('7d');
  const { data: payloadEnvelope, isLoading, error } = useV2SalesMetrics({ range });
  const { data: weeklyEnvelope } = useV2WeeklySummary({});
  const { data: setterTrend } = useV2SetterTrend([], BUSINESS_TZ);

  const payload = payloadEnvelope?.data;
  const weekly = weeklyEnvelope?.data;

  const rangeMeta = useMemo(() => {
    if (!payload) return null;
    return {
      start: payload.timeRange.from,
      end: payload.timeRange.to,
      label: rangeLabel(range),
    };
  }, [payload, range]);

  // Get high-risk sequences from sequences array
  const highRisk = useMemo(() => {
    if (!payload) return [];
    return payload.sequences
      .filter((s) => s.optOutRatePct >= 3)
      .map((s) => ({
        label: s.label,
        messagesSent: s.messagesSent,
        repliesReceived: s.repliesReceived,
        optOutRatePct: s.optOutRatePct,
      }))
      .slice(0, 6);
  }, [payload]);

  const criticalRiskCount = useMemo(() => {
    return highRisk.filter((s) => s.optOutRatePct >= 6).length;
  }, [highRisk]);

  // Extract sparkline data from trendByDay
  const sparklines = useMemo(() => {
    if (!payload?.trendByDay?.length) return null;
    const days = payload.trendByDay;
    return {
      replyRate: days.map((d) => d.replyRatePct),
      bookedCalls: days.map((d) => d.canonicalBookedCalls),
      messagesSent: days.map((d) => d.messagesSent),
      optOuts: days.map((d) => d.optOuts),
    };
  }, [payload]);

  if (isLoading) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="Track your team's messaging performance and outcomes." />
        <V2State kind="loading">Loading performance metrics…</V2State>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="Track your team's messaging performance and outcomes." />
        <V2State kind="error">Unable to load metrics. Please try again later.</V2State>
      </div>
    );
  }

  const breakdown = computeInsightsBookedBreakdown(payload);
  
  // Get setter data from trend
  const setterJack = setterTrend?.find((d) => d.setters.jack);
  const setterBrandon = setterTrend?.find((d) => d.setters.brandon);

  return (
    <div className="V2Page">
      <V2PageHeader
        title="Performance"
        subtitle="Track your team's messaging performance and outcomes."
        right={
          <div className="V2ControlsRow">
            <label className="V2Control">
              <span>Range</span>
              <select value={range} onChange={(e) => setRange(e.target.value as InsightsRange)}>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
        }
      />

      {/* Risk Alert Banner */}
      <V2RiskAlert
        title="High Opt-Out Risk Detected"
        count={criticalRiskCount}
        onAction={() => {
          const element = document.querySelector('.V2Panel:has(.V2Table)');
          element?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Metrics with Sparklines */}
      <div className="V2MetricsGrid">
        <V2MetricCard
          label="Total Sets"
          value={fmtInt(payload.totals.canonicalBookedCalls)}
          meta={`${fmtInt(payload.totals.repliesReceived)} replies`}
          tone="positive"
          sparkline={sparklines?.bookedCalls}
          trend={sparklines ? calculateTrend(sparklines.bookedCalls) : undefined}
        />
        <V2MetricCard
          label="Messages Sent"
          value={fmtInt(payload.totals.messagesSent)}
          meta={`${fmtInt(payload.totals.peopleContacted)} people contacted`}
          sparkline={sparklines?.messagesSent}
          trend={sparklines ? calculateTrend(sparklines.messagesSent) : undefined}
        />
        <V2MetricCard
          label="Reply Rate"
          value={fmtPctMaybe(payload.totals.replyRatePct)}
          meta={`${fmtInt(payload.totals.repliesReceived)} replies / ${fmtInt(payload.totals.messagesSent)} sent`}
          tone={typeof payload.totals.replyRatePct === 'number' && payload.totals.replyRatePct >= 15 ? 'positive' : 'default'}
          sparkline={sparklines?.replyRate}
          trend={sparklines ? calculateTrend(sparklines.replyRate) : undefined}
        />
        <V2MetricCard
          label="Opt-outs"
          value={fmtInt(payload.totals.optOuts)}
          meta={`of ${fmtInt(payload.totals.messagesSent)} messages`}
          tone={payload.totals.optOuts >= 10 ? 'critical' : 'default'}
          sparkline={sparklines?.optOuts}
          trend={sparklines ? calculateTrend(sparklines.optOuts) : undefined}
        />
        <V2MetricCard
          label="Self Bookings"
          value={fmtInt(payload.bookedCredit.selfBooked)}
          meta="From website & ads"
          tone="accent"
        />
      </div>

      <div className="V2Grid V2Grid--2-1">
        <V2Panel
          title="This Week"
          caption={
            rangeMeta
              ? `${rangeMeta.label} · ${fmtDateTime(rangeMeta.start)} – ${fmtDateTime(rangeMeta.end)}`
              : undefined
          }
        >
          <div className="V2WeeklySummary">
            <div className="V2WeeklySummary__stats">
              <article>
                <span>Jack's Sets</span>
                <strong>{fmtInt(weekly?.setters?.jack?.canonicalBookedCalls ?? 0)}</strong>
                <em>{fmtInt(weekly?.setters?.jack?.outboundConversations ?? 0)} conversations</em>
              </article>
              <article>
                <span>Brandon's Sets</span>
                <strong>{fmtInt(weekly?.setters?.brandon?.canonicalBookedCalls ?? 0)}</strong>
                <em>{fmtInt(weekly?.setters?.brandon?.outboundConversations ?? 0)} conversations</em>
              </article>
              <article>
                <span>Self Bookings</span>
                <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
                <em>From website & ads</em>
              </article>
              <article>
                <span>Total Outreach</span>
                <strong>{fmtInt(weekly?.teamTotals?.messagesSent ?? 0)}</strong>
                <em>{fmtInt(weekly?.teamTotals?.peopleContacted ?? 0)} people contacted</em>
              </article>
            </div>

            <div className="V2WeeklySummary__setters">
              <article>
                <h3>Jack's Performance</h3>
                <p>
                  {fmtInt(setterJack?.setters.jack.outboundConversations ?? 0)} conversations ·{' '}
                  {fmtPctMaybe(setterJack?.setters.jack.replyRatePct)} reply rate ·{' '}
                  {fmtInt(setterJack?.setters.jack.bookedCalls ?? 0)} sets
                </p>
              </article>
              <article>
                <h3>Brandon's Performance</h3>
                <p>
                  {fmtInt(setterBrandon?.setters.brandon.outboundConversations ?? 0)} conversations ·{' '}
                  {fmtPctMaybe(setterBrandon?.setters.brandon.replyRatePct)} reply rate ·{' '}
                  {fmtInt(setterBrandon?.setters.brandon.bookedCalls ?? 0)} sets
                </p>
              </article>
            </div>

            <div className="V2WeeklySummary__meta">
              <span>Source: {payload.provenance.canonicalBookedSource}</span>
              <span>Synced: {fmtDateTime(weekly?.sources?.monday?.lastSyncAt ?? null)}</span>
              <span>Window: {payload.timeRange.from} → {payload.timeRange.to}</span>
            </div>

            <div className="V2WeeklySummary__extras">
              <V2Panel title="Monday Pipeline" caption="Current pipeline status">
                <V2PipelineVisual
                  stages={[
                    { label: 'Total Calls', value: weekly?.mondayPipeline?.totalCalls ?? 0, color: 'var(--v2-accent)' },
                    { label: 'Booked', value: weekly?.mondayPipeline?.booked ?? 0, color: 'var(--v2-positive)' },
                    { label: 'No-Show', value: weekly?.mondayPipeline?.noShow ?? 0, color: 'var(--v2-warning)' },
                    { label: 'Cancelled', value: (weekly?.mondayPipeline as any)?.cancelled ?? 0, color: 'var(--v2-critical)' },
                  ]}
                />
              </V2Panel>
              <V2Panel title="Actions Next Week" caption="Recommended follow-ups">
                <V2ActionList 
                  actions={weekly?.actionsNextWeek?.length ? weekly.actionsNextWeek : ['No actions suggested. Review performance metrics.']} 
                />
              </V2Panel>
            </div>
          </div>
        </V2Panel>

        <div className="V2Grid">
          <V2Panel title="Sets Breakdown" caption="Jack's sets vs Brandon's sets vs self bookings.">
            <div className="V2SplitStat">
              <div>
                <span>Jack's Sets</span>
                <strong>{fmtInt(payload.bookedCredit.jack)}</strong>
              </div>
              <div>
                <span>Brandon's Sets</span>
                <strong>{fmtInt(payload.bookedCredit.brandon)}</strong>
              </div>
              <div>
                <span>Self Bookings</span>
                <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
              </div>
            </div>
          </V2Panel>

          <V2Panel title="Call Sources" caption="Where your booked calls came from.">
            <V2StatBar
              segments={[
                { label: 'SMS Linked', value: breakdown.bookedSmsLinkedStrict, color: 'var(--v2-accent)' },
                { label: 'Self Booked', value: breakdown.bookedSelf, color: 'var(--v2-positive)' },
                { label: 'Other', value: breakdown.bookedNonSmsOrUnknownExcludingSelf, color: 'var(--v2-muted)' },
              ]}
              total={breakdown.bookedTotalAllChannels}
            />
            <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--v2-muted)' }}>
              Source: {payload.provenance.canonicalBookedSource} • 
              Coverage: {breakdown.bookedAttribution
                ? `${breakdown.bookedAttribution.matchedCalls}/${breakdown.bookedAttribution.totalCalls} calls`
                : 'n/a'}
            </div>
          </V2Panel>
        </div>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="List Health" caption="Watch for opt-out spikes.">
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Replies</th>
                  <th className="is-right">Opt-out rate</th>
                </tr>
              </thead>
              <tbody>
                {highRisk.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="is-right">{fmtInt(row.messagesSent)}</td>
                    <td className="is-right">{fmtInt(row.repliesReceived)}</td>
                    <td className="is-right">
                      <span className={`V2RiskTag V2RiskTag--${riskTone(row.optOutRatePct)}`}>{fmtPct(row.optOutRatePct)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </V2Panel>

        <V2Panel title="Daily Stats" caption={`Your numbers by day.`}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {payload.trendByDay.map((day) => (
              <V2MiniTrend
                key={day.day}
                day={day.day}
                sent={day.messagesSent}
                replyRate={day.replyRatePct}
                booked={day.canonicalBookedCalls}
                optOuts={day.optOuts}
              />
            ))}
          </div>
        </V2Panel>
      </div>
    </div>
  );
}

export default InsightsV2;
