import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import type { SalesMetricsV2 } from '../../api/v2-types';
import {
  useV2MondayBoardCatalog,
  useV2MondayLeadInsights,
  useV2MondayScorecards,
  useV2SalesMetrics,
  useV2WeeklySummary,
} from '../../api/v2Queries';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2RiskAlert, V2StatBar, V2PipelineVisual, V2ActionList, V2MiniTrend, V2AnimatedList, V2ProgressBar } from '../components/V2Primitives';

type InsightsRange = 'today' | '7d' | '30d';
type VolumeMode = 'all' | 'sequence' | 'manual';
type InsightsSection = 'executive' | 'lead_funnel' | 'ops_scorecards' | 'data_quality';
const BUSINESS_TZ = 'America/Chicago';

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
  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? first;
  const change = last - first;
  if (change > 0.01) return 'up';
  if (change < -0.01) return 'down';
  return 'flat';
};

// Calculate Setter Efficiency Score (0-100)
const calculateEfficiencyScore = (bookings: number, optOuts: number, conversations: number): number => {
  if (conversations === 0) return 0;
  // Weighted formula: bookings are worth +10, optOuts are worth -5
  const rawScore = (bookings * 10) - (optOuts * 5);
  // Normalize to 0-100 scale based on conversations
  const normalized = (rawScore / conversations) * 10 + 50;
  return Math.max(0, Math.min(100, normalized));
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
    bookedNonSmsOrUnknown,
    bookedNonSmsOrUnknownExcludingSelf,
    bookedAttribution,
  };
};

export function InsightsV2() {
  const [range, setRange] = useState<InsightsRange>('7d');
  const [volumeMode, setVolumeMode] = useState<VolumeMode>('all');
  const [section, setSection] = useState<InsightsSection>('executive');
  const { data: payloadEnvelope, isLoading, error } = useV2SalesMetrics({ range });
  const { data: weeklyEnvelope } = useV2WeeklySummary({});
  const mondayLeadInsightsQuery = useV2MondayLeadInsights({
    range,
    tz: BUSINESS_TZ,
    scope: 'curated',
    sourceLimit: 6,
    setterLimit: 6,
  });
  const mondayBoardCatalogQuery = useV2MondayBoardCatalog({});
  const mondayScorecardsQuery = useV2MondayScorecards({
    range,
    tz: BUSINESS_TZ,
  });

  const payload = payloadEnvelope?.data;
  const weekly = weeklyEnvelope?.data;
  const mondayLeadInsights = mondayLeadInsightsQuery.data?.data;
  const mondayBoardCatalog = mondayBoardCatalogQuery.data?.data;
  const mondayScorecards = mondayScorecardsQuery.data?.data;

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

  // Extract sparkline data from trendByDay based on volume mode
  const sparklines = useMemo(() => {
    if (!payload?.trendByDay?.length) return null;
    const days = payload.trendByDay;

    if (volumeMode === 'sequence') {
      return {
        replyRate: days.map((d) => d.replyRatePct),
        bookedCalls: days.map((d) => d.canonicalBookedCalls),
        messagesSent: days.map((d) => d.sequenceMessagesSent),
        optOuts: days.map((d) => d.optOuts),
      };
    } else if (volumeMode === 'manual') {
      return {
        replyRate: days.map((d) => d.replyRatePct),
        bookedCalls: days.map((d) => d.canonicalBookedCalls),
        messagesSent: days.map((d) => d.manualMessagesSent),
        optOuts: days.map((d) => d.optOuts),
      };
    }

    return {
      replyRate: days.map((d) => d.replyRatePct),
      bookedCalls: days.map((d) => d.canonicalBookedCalls),
      messagesSent: days.map((d) => d.messagesSent),
      optOuts: days.map((d) => d.optOuts),
    };
  }, [payload, volumeMode]);

  // Compute volume metrics based on mode
  const volumeMetrics = useMemo(() => {
    if (!payload) return null;

    if (volumeMode === 'sequence') {
      return {
        messagesSent: payload.totals.sequenceMessagesSent,
        peopleContacted: payload.totals.sequencePeopleContacted,
        repliesReceived: payload.totals.sequenceRepliesReceived,
        replyRatePct: payload.totals.sequenceReplyRatePct,
        label: 'Sequence',
      };
    } else if (volumeMode === 'manual') {
      return {
        messagesSent: payload.totals.manualMessagesSent,
        peopleContacted: payload.totals.manualPeopleContacted,
        repliesReceived: payload.totals.manualRepliesReceived,
        replyRatePct: payload.totals.manualReplyRatePct,
        label: 'Manual',
      };
    }

    return {
      messagesSent: payload.totals.messagesSent,
      peopleContacted: payload.totals.peopleContacted,
      repliesReceived: payload.totals.repliesReceived,
      replyRatePct: payload.totals.replyRatePct,
      label: 'All',
    };
  }, [payload, volumeMode]);

  // Calculate setter efficiency scores
  const setterScores = useMemo(() => {
    if (!payload) return null;

    const jackRep = payload.reps.find((r) => r.repName.toLowerCase().includes('jack'));
    const brandonRep = payload.reps.find((r) => r.repName.toLowerCase().includes('brandon'));

    const jackScore = jackRep
      ? calculateEfficiencyScore(payload.bookedCredit.jack, jackRep.optOuts, jackRep.outboundConversations)
      : 0;
    const brandonScore = brandonRep
      ? calculateEfficiencyScore(payload.bookedCredit.brandon, brandonRep.optOuts, brandonRep.outboundConversations)
      : 0;

    return {
      jack: {
        score: jackScore,
        bookings: payload.bookedCredit.jack,
        conversations: jackRep?.outboundConversations ?? 0,
        optOuts: jackRep?.optOuts ?? 0,
        replyRate: jackRep?.replyRatePct ?? 0,
        bookingRate: jackRep && jackRep.outboundConversations > 0
          ? (payload.bookedCredit.jack / jackRep.outboundConversations) * 100
          : 0,
      },
      brandon: {
        score: brandonScore,
        bookings: payload.bookedCredit.brandon,
        conversations: brandonRep?.outboundConversations ?? 0,
        optOuts: brandonRep?.optOuts ?? 0,
        replyRate: brandonRep?.replyRatePct ?? 0,
        bookingRate: brandonRep && brandonRep.outboundConversations > 0
          ? (payload.bookedCredit.brandon / brandonRep.outboundConversations) * 100
          : 0,
      },
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

  // Derive setter stats directly from the already-loaded sales metrics reps array
  const jackRep = payload.reps.find((r) => r.repName.toLowerCase().includes('jack'));
  const brandonRep = payload.reps.find((r) => r.repName.toLowerCase().includes('brandon'));

  return (
    <div className="V2Page">
      <V2PageHeader
        title="Performance"
        subtitle="Track your team's messaging performance and outcomes."
        right={
          <div className="V2ControlsRow">
            <label className="V2Control">
              <span>Volume</span>
              <select value={volumeMode} onChange={(e) => setVolumeMode(e.target.value as VolumeMode)}>
                <option value="all">All Messages</option>
                <option value="sequence">Sequence Only</option>
                <option value="manual">Manual Only</option>
              </select>
            </label>
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

      <div className="V2ControlsRow" style={{ marginBottom: '0.75rem' }}>
        <button className="V2Btn" onClick={() => setSection('executive')} aria-pressed={section === 'executive'}>
          Executive
        </button>
        <button className="V2Btn" onClick={() => setSection('lead_funnel')} aria-pressed={section === 'lead_funnel'}>
          Lead Funnel
        </button>
        <button className="V2Btn" onClick={() => setSection('ops_scorecards')} aria-pressed={section === 'ops_scorecards'}>
          Ops Scorecards
        </button>
        <button className="V2Btn" onClick={() => setSection('data_quality')} aria-pressed={section === 'data_quality'}>
          Data Quality
        </button>
      </div>

      {section === 'executive' && (
        <>

      {/* Risk Alert Banner */}
      <AnimatePresence>
        {criticalRiskCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <V2RiskAlert
              title="High Opt-Out Risk Detected"
              count={criticalRiskCount}
              onAction={() => {
                const element = document.querySelector('.V2Panel:has(.V2Table)');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Metrics with Sparklines */}
      <V2AnimatedList className="V2MetricsGrid">
        <V2MetricCard
          label="Total Sets"
          value={fmtInt(payload.totals.canonicalBookedCalls)}
          meta={`${fmtInt(volumeMetrics?.repliesReceived ?? 0)} replies`}
          tone="positive"
          sparkline={sparklines?.bookedCalls}
          trend={sparklines ? calculateTrend(sparklines.bookedCalls) : undefined}
        />
        <V2MetricCard
          label={`${volumeMetrics?.label ?? 'All'} Messages`}
          value={fmtInt(volumeMetrics?.messagesSent ?? 0)}
          meta={`${fmtInt(volumeMetrics?.peopleContacted ?? 0)} people contacted`}
          sparkline={sparklines?.messagesSent}
          trend={sparklines ? calculateTrend(sparklines.messagesSent) : undefined}
        />
        <V2MetricCard
          label="Reply Rate"
          value={fmtPctMaybe(volumeMetrics?.replyRatePct)}
          meta={`${fmtInt(volumeMetrics?.repliesReceived ?? 0)} / ${fmtInt(volumeMetrics?.messagesSent ?? 0)}`}
          tone={typeof volumeMetrics?.replyRatePct === 'number' && volumeMetrics.replyRatePct >= 15 ? 'positive' : 'default'}
          sparkline={sparklines?.replyRate}
          trend={sparklines ? calculateTrend(sparklines.replyRate) : undefined}
        />
        <V2MetricCard
          label="Opt-Outs"
          value={fmtInt(payload.totals.optOuts)}
          meta={`of ${fmtInt(payload.totals.messagesSent)} messages`}
          tone={payload.totals.optOuts >= 10 ? 'critical' : 'default'}
          sparkline={sparklines?.optOuts}
          trend={sparklines ? calculateTrend(sparklines.optOuts) : undefined}
        />
        <V2MetricCard
          label="Booking Rate"
          value={
            (volumeMetrics?.peopleContacted ?? 0) > 0
              ? `${((payload.totals.canonicalBookedCalls / (volumeMetrics?.peopleContacted ?? 1)) * 100).toFixed(1)}%`
              : 'n/a'
          }
          meta={`${fmtInt(payload.totals.canonicalBookedCalls)} / ${fmtInt(volumeMetrics?.peopleContacted ?? 0)}`}
          tone={(volumeMetrics?.peopleContacted ?? 0) > 0 && (payload.totals.canonicalBookedCalls / (volumeMetrics?.peopleContacted ?? 1)) * 100 >= 5 ? 'positive' : 'default'}
        />
        <V2MetricCard
          label="Self-Booked"
          value={fmtInt(payload.bookedCredit.selfBooked)}
          meta="From website & ads"
          tone="accent"
        />
      </V2AnimatedList>

      {/* Volume Split Comparison */}
      {volumeMode === 'all' && (
        <V2Panel title="Volume Split" caption="Sequence vs Manual breakdown">
          <div className="V2VolumeSplit">
            <div className="V2VolumeSplit__bar">
              <div
                className="V2VolumeSplit__segment V2VolumeSplit__segment--sequence"
                style={{ width: `${payload.totals.messagesSent > 0 ? (payload.totals.sequenceMessagesSent / payload.totals.messagesSent) * 100 : 0}%` }}
              />
              <div
                className="V2VolumeSplit__segment V2VolumeSplit__segment--manual"
                style={{ width: `${payload.totals.messagesSent > 0 ? (payload.totals.manualMessagesSent / payload.totals.messagesSent) * 100 : 0}%` }}
              />
            </div>
            <div className="V2VolumeSplit__legend">
              <div className="V2VolumeSplit__item">
                <span className="V2VolumeSplit__dot V2VolumeSplit__dot--sequence" />
                <span className="V2VolumeSplit__label">Sequence</span>
                <span className="V2VolumeSplit__value">{fmtInt(payload.totals.sequenceMessagesSent)} ({fmtPct(payload.totals.messagesSent > 0 ? (payload.totals.sequenceMessagesSent / payload.totals.messagesSent) * 100 : 0)})</span>
                <span className="V2VolumeSplit__meta">{fmtPct(payload.totals.sequenceReplyRatePct)} reply rate</span>
              </div>
              <div className="V2VolumeSplit__item">
                <span className="V2VolumeSplit__dot V2VolumeSplit__dot--manual" />
                <span className="V2VolumeSplit__label">Manual</span>
                <span className="V2VolumeSplit__value">{fmtInt(payload.totals.manualMessagesSent)} ({fmtPct(payload.totals.messagesSent > 0 ? (payload.totals.manualMessagesSent / payload.totals.messagesSent) * 100 : 0)})</span>
                <span className="V2VolumeSplit__meta">{fmtPct(payload.totals.manualReplyRatePct)} reply rate</span>
              </div>
            </div>
          </div>
        </V2Panel>
      )}

      {/* Setter Efficiency */}
      <V2Panel title="Setter Efficiency" caption="Performance score based on bookings, opt-outs, and volume">
        <div className="V2SetterEfficiency">
          <div className="V2SetterEfficiency__card">
            <div className="V2SetterEfficiency__header">
              <span className="V2SetterEfficiency__name">Jack</span>
              <span className="V2SetterEfficiency__score" data-score={setterScores?.jack.score ?? 0}>
                {(setterScores?.jack.score ?? 0).toFixed(0)}
              </span>
            </div>
            <V2ProgressBar value={setterScores?.jack.score ?? 0} max={100} />
            <div className="V2SetterEfficiency__stats">
              <div><span>Bookings</span><strong>{setterScores?.jack.bookings ?? 0}</strong></div>
              <div><span>Booking Rate</span><strong>{fmtPct(setterScores?.jack.bookingRate ?? 0)}</strong></div>
              <div><span>Reply Rate</span><strong>{fmtPct(setterScores?.jack.replyRate ?? 0)}</strong></div>
              <div><span>Opt-Outs</span><strong>{setterScores?.jack.optOuts ?? 0}</strong></div>
            </div>
          </div>
          <div className="V2SetterEfficiency__card">
            <div className="V2SetterEfficiency__header">
              <span className="V2SetterEfficiency__name">Brandon</span>
              <span className="V2SetterEfficiency__score" data-score={setterScores?.brandon.score ?? 0}>
                {(setterScores?.brandon.score ?? 0).toFixed(0)}
              </span>
            </div>
            <V2ProgressBar value={setterScores?.brandon.score ?? 0} max={100} />
            <div className="V2SetterEfficiency__stats">
              <div><span>Bookings</span><strong>{setterScores?.brandon.bookings ?? 0}</strong></div>
              <div><span>Booking Rate</span><strong>{fmtPct(setterScores?.brandon.bookingRate ?? 0)}</strong></div>
              <div><span>Reply Rate</span><strong>{fmtPct(setterScores?.brandon.replyRate ?? 0)}</strong></div>
              <div><span>Opt-Outs</span><strong>{setterScores?.brandon.optOuts ?? 0}</strong></div>
            </div>
          </div>
        </div>
      </V2Panel>

      <V2Panel title="Actor Role Snapshot" caption="Actor directory roles mapped to Monday metric ownership.">
        {mondayScorecardsQuery.isLoading ? (
          <V2State kind="loading">Loading actor role metrics…</V2State>
        ) : mondayScorecardsQuery.isError || !mondayScorecards ? (
          <V2State kind="error">Unable to load actor role metrics.</V2State>
        ) : (
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Role</th>
                  <th className="is-right">Rows</th>
                  <th className="is-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {mondayScorecards.byOwner.slice(0, 8).map((row) => (
                  <tr key={`${row.metricOwner}:${row.role}`}>
                    <td>{row.metricOwner}</td>
                    <td>{row.role}</td>
                    <td className="is-right">{fmtInt(row.rowCount)}</td>
                    <td className="is-right">{row.totalValue == null ? 'n/a' : row.totalValue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </V2Panel>

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
                <strong>{fmtInt(payload.bookedCredit.jack)}</strong>
                <em>{fmtInt(jackRep?.outboundConversations ?? 0)} conversations</em>
              </article>
              <article>
                <span>Brandon's Sets</span>
                <strong>{fmtInt(payload.bookedCredit.brandon)}</strong>
                <em>{fmtInt(brandonRep?.outboundConversations ?? 0)} conversations</em>
              </article>
              <article>
                <span>Self-Booked</span>
                <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
                <em>From website & ads</em>
              </article>
              <article>
                <span>Total Outreach</span>
                <strong>{fmtInt(payload.totals.messagesSent)}</strong>
                <em>{fmtInt(payload.totals.peopleContacted)} people contacted</em>
              </article>
            </div>

            <div className="V2WeeklySummary__setters">
              <article>
                <h3>Jack's Performance</h3>
                <p>
                  {fmtInt(jackRep?.outboundConversations ?? 0)} conversations ·{' '}
                  {fmtPctMaybe(jackRep?.replyRatePct)} reply rate ·{' '}
                  {fmtInt(payload.bookedCredit.jack)} sets
                </p>
              </article>
              <article>
                <h3>Brandon's Performance</h3>
                <p>
                  {fmtInt(brandonRep?.outboundConversations ?? 0)} conversations ·{' '}
                  {fmtPctMaybe(brandonRep?.replyRatePct)} reply rate ·{' '}
                  {fmtInt(payload.bookedCredit.brandon)} sets
                </p>
              </article>
            </div>

            <div className="V2WeeklySummary__meta">
              <span>Source: Slack booking records</span>
              <span>Last synced: {fmtDateTime(weekly?.sources?.monday?.lastSyncAt ?? null)}</span>
              <span>Period: {new Date(payload.timeRange.from).toLocaleDateString()} – {new Date(payload.timeRange.to).toLocaleDateString()}</span>
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
          <V2Panel title="Sets Breakdown" caption="Jack's sets vs Brandon's sets vs self-booked.">
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
                <span>Self-Booked</span>
                <strong>{fmtInt(payload.bookedCredit.selfBooked)}</strong>
              </div>
            </div>
          </V2Panel>

          <V2Panel title="Where Calls Came From" caption="Where your booked discovery calls came from.">
            <V2StatBar
              segments={[
                { label: 'Booked via SMS', value: breakdown.bookedSmsLinkedStrict, color: 'var(--v2-accent)' },
                { label: 'Self Booked', value: breakdown.bookedSelf, color: 'var(--v2-positive)' },
                { label: 'Other', value: breakdown.bookedNonSmsOrUnknownExcludingSelf, color: 'var(--v2-muted)' },
              ]}
              total={breakdown.bookedTotalAllChannels}
            />
            <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--v2-muted)' }}>
              Source: Slack booking records •
              {breakdown.bookedAttribution
                ? `Matched ${breakdown.bookedAttribution.matchedCalls} of ${breakdown.bookedAttribution.totalCalls} calls to a source`
                : 'n/a'}
            </div>
          </V2Panel>

          <V2Panel title="Sales Call Outcomes (Monday)" caption="Historical lead outcomes from synced Monday boards.">
            {mondayLeadInsightsQuery.isLoading ? (
              <V2State kind="loading">Loading historical sales outcomes…</V2State>
            ) : mondayLeadInsightsQuery.isError || !mondayLeadInsights ? (
              <V2State kind="error">Unable to load Monday lead insights.</V2State>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="V2SplitStat">
                  <div>
                    <span>Leads</span>
                    <strong>{fmtInt(mondayLeadInsights.totals.leads)}</strong>
                  </div>
                  <div>
                    <span>Booked</span>
                    <strong>{fmtInt(mondayLeadInsights.totals.booked)}</strong>
                  </div>
                  <div>
                    <span>No-Show</span>
                    <strong>{fmtInt(mondayLeadInsights.totals.noShow)}</strong>
                  </div>
                  <div>
                    <span>Closed Won</span>
                    <strong>{fmtInt(mondayLeadInsights.totals.closedWon)}</strong>
                  </div>
                </div>

                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Top Source</th>
                        <th className="is-right">Leads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mondayLeadInsights.topSources.map((row) => (
                        <tr key={row.source}>
                          <td>{row.source}</td>
                          <td className="is-right">{fmtInt(row.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Top Setter</th>
                        <th className="is-right">Leads</th>
                        <th className="is-right">Booked</th>
                        <th className="is-right">No-Show</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mondayLeadInsights.topSetters.map((row) => (
                        <tr key={row.setter}>
                          <td>{row.setter}</td>
                          <td className="is-right">{fmtInt(row.leads)}</td>
                          <td className="is-right">{fmtInt(row.booked)}</td>
                          <td className="is-right">{fmtInt(row.noShow)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--v2-muted)' }}>
                  Window: {mondayLeadInsights.window.fromDay} to {mondayLeadInsights.window.toDay} ({mondayLeadInsights.window.timeZone}) ·
                  Last sync:{' '}
                  {fmtDateTime(
                    mondayLeadInsights.mondaySyncState[0]?.lastSyncAt ?? mondayLeadInsights.mondaySyncState[0]?.updatedAt ?? null,
                  )}
                </div>
              </div>
            )}
          </V2Panel>
        </div>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Opt-Out Watch" caption="Watch for opt-out spikes.">
          <div className="V2TableWrap">
            <table className="V2Table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th className="is-right">Sent</th>
                  <th className="is-right">Replies</th>
                  <th className="is-right">Opt-Out Rate</th>
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
            {payload.trendByDay.map((day) => {
              // Format ISO date (2026-02-19) → human-readable (Feb 19)
              const m = day.day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              const dayLabel = m
                ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                : day.day;
              return (
                <V2MiniTrend
                  key={day.day}
                  day={dayLabel}
                  sent={volumeMode === 'sequence' ? day.sequenceMessagesSent : volumeMode === 'manual' ? day.manualMessagesSent : day.messagesSent}
                  replyRate={day.replyRatePct}
                  booked={day.canonicalBookedCalls}
                  optOuts={day.optOuts}
                />
              );
            })}
          </div>
        </V2Panel>
      </div>
        </>
      )}

      {section === 'lead_funnel' && (
        <div className="V2Grid">
          <V2Panel title="Lead Journey Funnel" caption="Curated lead-level Monday boards only.">
            {mondayLeadInsightsQuery.isLoading ? (
              <V2State kind="loading">Loading curated lead journey analytics…</V2State>
            ) : mondayLeadInsightsQuery.isError || !mondayLeadInsights ? (
              <V2State kind="error">Unable to load lead funnel insights.</V2State>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="V2SplitStat">
                  <div><span>Leads</span><strong>{fmtInt(mondayLeadInsights.totals.leads)}</strong></div>
                  <div><span>Booked</span><strong>{fmtInt(mondayLeadInsights.totals.booked)}</strong></div>
                  <div><span>Closed Won</span><strong>{fmtInt(mondayLeadInsights.totals.closedWon)}</strong></div>
                  <div><span>Closed Lost</span><strong>{fmtInt(mondayLeadInsights.totals.closedLost)}</strong></div>
                </div>
                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Top Source</th>
                        <th className="is-right">Leads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mondayLeadInsights.topSources.map((row) => (
                        <tr key={row.source}>
                          <td>{row.source}</td>
                          <td className="is-right">{fmtInt(row.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--v2-muted)' }}>
                  Scope: {mondayLeadInsights.window.scope} · Included boards: {mondayLeadInsights.includedBoards.length} ·
                  Source coverage: {mondayLeadInsights.dataQuality.sourceCoveragePct.toFixed(1)}%
                </div>
              </div>
            )}
          </V2Panel>
        </div>
      )}

      {section === 'ops_scorecards' && (
        <div className="V2Grid">
          <V2Panel title="Monday Ops Scorecards" caption="Aggregate metric boards (sales/marketing/retention).">
            {mondayScorecardsQuery.isLoading ? (
              <V2State kind="loading">Loading scorecards…</V2State>
            ) : mondayScorecardsQuery.isError || !mondayScorecards ? (
              <V2State kind="error">Unable to load Monday scorecards.</V2State>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="V2SplitStat">
                  <div><span>Rows</span><strong>{fmtInt(mondayScorecards.totals.rows)}</strong></div>
                  <div><span>Boards</span><strong>{fmtInt(mondayScorecards.totals.boards)}</strong></div>
                  <div><span>Metrics</span><strong>{fmtInt(mondayScorecards.totals.metrics)}</strong></div>
                </div>
                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th className="is-right">Rows</th>
                        <th className="is-right">Boards</th>
                        <th className="is-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mondayScorecards.metrics.slice(0, 12).map((row) => (
                        <tr key={row.metricName}>
                          <td>{row.metricName}</td>
                          <td className="is-right">{fmtInt(row.rowCount)}</td>
                          <td className="is-right">{fmtInt(row.boards)}</td>
                          <td className="is-right">{row.totalValue == null ? 'n/a' : row.totalValue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </V2Panel>
        </div>
      )}

      {section === 'data_quality' && (
        <div className="V2Grid">
          <V2Panel title="Monday Data Quality" caption="Sync health, board coverage, and completeness by board type.">
            {mondayBoardCatalogQuery.isLoading ? (
              <V2State kind="loading">Loading data quality catalog…</V2State>
            ) : mondayBoardCatalogQuery.isError || !mondayBoardCatalog ? (
              <V2State kind="error">Unable to load board catalog.</V2State>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="V2SplitStat">
                  <div><span>Boards</span><strong>{fmtInt(mondayBoardCatalog.totals.boards)}</strong></div>
                  <div><span>Stale</span><strong>{fmtInt(mondayBoardCatalog.totals.stale)}</strong></div>
                  <div><span>Errored</span><strong>{fmtInt(mondayBoardCatalog.totals.errored)}</strong></div>
                  <div><span>Empty</span><strong>{fmtInt(mondayBoardCatalog.totals.empty)}</strong></div>
                </div>
                <div className="V2TableWrap">
                  <table className="V2Table">
                    <thead>
                      <tr>
                        <th>Board</th>
                        <th>Class</th>
                        <th className="is-right">Snapshots</th>
                        <th className="is-right">Attribution</th>
                        <th className="is-right">Metric Facts</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mondayBoardCatalog.boards.map((row) => (
                        <tr key={row.boardId}>
                          <td>{row.boardLabel}</td>
                          <td>{row.boardClass}</td>
                          <td className="is-right">{fmtInt(row.snapshotCount)}</td>
                          <td className="is-right">{fmtInt(row.leadAttributionCount)}</td>
                          <td className="is-right">{fmtInt(row.metricFactCount)}</td>
                          <td>{row.syncStatus || 'unknown'}{row.isStale ? ' (stale)' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </V2Panel>
        </div>
      )}
    </div>
  );
}

export default InsightsV2;
