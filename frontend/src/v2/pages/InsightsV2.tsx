import { useMemo, useState } from 'react';

import type { SalesMetricsV2 } from '../../api/v2-types';
import { useV2SalesMetrics, useV2SetterTrend, useV2WeeklySummary } from '../../api/v2Queries';
import { v2Copy } from '../copy';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';

const BUSINESS_TZ = 'America/Chicago';
type InsightsRange = 'today' | '7d' | '30d';

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtPctMaybe = (n: number | null | undefined) => (typeof n === 'number' ? fmtPct(n) : 'n/a');
const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString()}`;
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

const sourceTone = (status: 'ready' | 'stale' | 'missing' | 'disabled'): 'positive' | 'accent' | 'critical' => {
  if (status === 'ready') return 'positive';
  if (status === 'stale') return 'accent';
  return 'critical';
};

const sourceText = (status: 'ready' | 'stale' | 'missing' | 'disabled'): string => {
  if (status === 'ready') return 'Monday synced';
  if (status === 'stale') return 'Monday stale';
  if (status === 'missing') return 'Monday missing';
  return 'PTBizSMS only';
};

const rangeLabel = (range: InsightsRange): string => {
  if (range === 'today') return 'Today';
  if (range === '30d') return 'Last 30 days';
  return 'Last 7 days';
};

const rangeShortLabel = (range: InsightsRange): string => {
  if (range === 'today') return '1d';
  if (range === '30d') return '30d';
  return '7d';
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
    bookedAttribution,
    bookedTotalAllChannels,
    bookedSmsLinkedStrict,
    bookedSelf,
    bookedNonSmsOrUnknown,
    bookedNonSmsOrUnknownExcludingSelf,
  };
};

export default function InsightsV2() {
  const [range, setRange] = useState<InsightsRange>('7d');
  const { data, isLoading, isError, error } = useV2SalesMetrics({ range, tz: BUSINESS_TZ });
  const weeklyEnvelopeQuery = useV2SalesMetrics({ range: '7d', tz: BUSINESS_TZ });
  const weeklySummaryQuery = useV2WeeklySummary({ tz: BUSINESS_TZ });

  const payload = data?.data;
  const weeklyDays = useMemo(() => {
    const rows = weeklyEnvelopeQuery.data?.data.trendByDay || [];
    return [...rows].map((row) => row.day).sort((a, b) => a.localeCompare(b));
  }, [weeklyEnvelopeQuery.data?.data.trendByDay]);
  const weeklyTrendQuery = useV2SetterTrend(weeklyDays, BUSINESS_TZ);

  const runRate = useMemo(() => {
    if (!payload || payload.trendByDay.length < 2) return null;
    const sorted = [...payload.trendByDay].sort((a, b) => a.day.localeCompare(b.day));
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (!latest || !prev) return null;
    return {
      bookedDelta: latest.canonicalBookedCalls - prev.canonicalBookedCalls,
      replyDelta: latest.replyRatePct - prev.replyRatePct,
      sentDelta: latest.messagesSent - prev.messagesSent,
    };
  }, [payload]);

  const highRisk = useMemo(() => {
    if (!payload) return [];
    return [...payload.sequences]
      .filter((row) => row.messagesSent > 0)
      .sort((a, b) => b.optOutRatePct - a.optOutRatePct)
      .slice(0, 6);
  }, [payload]);

  const weeklyTrend = useMemo(() => {
    return [...(weeklyTrendQuery.data || [])].sort((a, b) => a.day.localeCompare(b.day));
  }, [weeklyTrendQuery.data]);

  const weeklyTrendSummary = useMemo(() => {
    if (!weeklyTrend.length) return null;
    const latest = weeklyTrend[weeklyTrend.length - 1];
    if (!latest) return null;
    const prev = weeklyTrend.length > 1 ? weeklyTrend[weeklyTrend.length - 2] : null;

    const totals = weeklyTrend.reduce(
      (acc, point) => {
        acc.messagesSent += point.team.messagesSent;
        acc.bookedCalls += point.team.bookedCalls;
        acc.optOuts += point.team.optOuts;
        acc.jackBooked += point.setters.jack.bookedCalls;
        acc.jackOutbound += point.setters.jack.outboundConversations;
        acc.jackOptOuts += point.setters.jack.optOuts;
        acc.brandonBooked += point.setters.brandon.bookedCalls;
        acc.brandonOutbound += point.setters.brandon.outboundConversations;
        acc.brandonOptOuts += point.setters.brandon.optOuts;
        acc.jackReplyRateTotal += point.setters.jack.replyRatePct;
        acc.brandonReplyRateTotal += point.setters.brandon.replyRatePct;
        return acc;
      },
      {
        messagesSent: 0,
        bookedCalls: 0,
        optOuts: 0,
        jackBooked: 0,
        jackOutbound: 0,
        jackOptOuts: 0,
        brandonBooked: 0,
        brandonOutbound: 0,
        brandonOptOuts: 0,
        jackReplyRateTotal: 0,
        brandonReplyRateTotal: 0,
      },
    );

    return {
      totals,
      latestDelta: {
        teamBooked: prev ? latest.team.bookedCalls - prev.team.bookedCalls : 0,
        jackBooked: prev ? latest.setters.jack.bookedCalls - prev.setters.jack.bookedCalls : 0,
        brandonBooked: prev ? latest.setters.brandon.bookedCalls - prev.setters.brandon.bookedCalls : 0,
      },
      avgReplyRate: {
        jack: totals.jackReplyRateTotal / weeklyTrend.length,
        brandon: totals.brandonReplyRateTotal / weeklyTrend.length,
      },
    };
  }, [weeklyTrend]);

  if (isLoading) return <V2State kind="loading">Loading team insights…</V2State>;
  if (isError || !payload) {
    return <V2State kind="error">Failed to load team insights: {String((error as Error)?.message || error)}</V2State>;
  }

  const {
    bookedAttribution,
    bookedTotalAllChannels,
    bookedSmsLinkedStrict,
    bookedSelf,
    bookedNonSmsOrUnknown,
    bookedNonSmsOrUnknownExcludingSelf,
  } = computeInsightsBookedBreakdown(payload);

  const weeklySummary = weeklySummaryQuery.data?.data || null;
  const sourceStatus = weeklySummary?.sources.monday.status || 'disabled';
  const sourceBadge = sourceText(sourceStatus);
  const selectedRangeLabel = rangeLabel(range);
  const selectedRangeShortLabel = rangeShortLabel(range);
  const isWeeklyRange = range === '7d';
  const jackRangeRep = payload.reps.find((row) => row.repName.toLowerCase().includes('jack')) || null;
  const brandonRangeRep = payload.reps.find((row) => row.repName.toLowerCase().includes('brandon')) || null;
  const selectedWindowMeta = `Selected window: ${selectedRangeLabel}`;
  const sentMeta = range === 'today' && runRate ? `${runRate.sentDelta >= 0 ? '+' : ''}${runRate.sentDelta} vs prior day` : selectedWindowMeta;
  const replyMeta =
    range === 'today' && runRate ? `${runRate.replyDelta >= 0 ? '+' : ''}${runRate.replyDelta.toFixed(1)}pp vs prior day` : selectedWindowMeta;
  const bookedMeta =
    range === 'today' && runRate
      ? `${runRate.bookedDelta >= 0 ? '+' : ''}${runRate.bookedDelta} vs prior day`
      : `Canonical booked-call KPI (${selectedRangeLabel})`;

  return (
    <div className="V2Page V2Insights">
      <V2PageHeader
        title={v2Copy.nav.insights}
        subtitle="Live team performance in rolling windows. Calls booked come from Slack booked-call records with self-booked shown separately."
        right={
          <label className="V2Control">
            <span>Range</span>
            <select value={range} onChange={(e) => setRange(e.target.value as InsightsRange)}>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        }
      />

      <section className="V2MetricsGrid">
        <V2MetricCard label="Messages Sent" value={fmtInt(payload.totals.messagesSent)} meta={sentMeta} />
        <V2MetricCard label={<V2Term term="peopleContacted" />} value={fmtInt(payload.totals.peopleContacted)} />
        <V2MetricCard
          label={<V2Term term="replyRatePeople" />}
          value={fmtPct(payload.totals.replyRatePct)}
          meta={replyMeta}
          tone="accent"
        />
        <V2MetricCard
          label={<V2Term term="callsBookedSlack" />}
          value={fmtInt(bookedTotalAllChannels)}
          meta={bookedMeta}
          tone="positive"
        />
        <V2MetricCard label="Booked SMS linked (strict)" value={fmtInt(bookedSmsLinkedStrict)} tone="accent" />
        <V2MetricCard
          label="Self-booked calls"
          value={fmtInt(bookedSelf)}
          meta="No setter reaction on booked-call message"
          tone="accent"
        />
        <V2MetricCard
          label="Booked calls (non-SMS/unknown, excluding self-booked)"
          value={fmtInt(bookedNonSmsOrUnknownExcludingSelf)}
          meta={`Raw non-SMS/unknown bucket is ${fmtInt(bookedNonSmsOrUnknown)} including self-booked`}
        />
        <V2MetricCard label={<V2Term term="optOuts" />} value={fmtInt(payload.totals.optOuts)} tone="critical" />
      </section>

      <V2Panel
        title={isWeeklyRange ? 'Weekly Summary' : 'Range Summary'}
        caption={
          isWeeklyRange
            ? 'Past 7 days with team totals and per-setter trend.'
            : `${selectedRangeLabel} totals and per-setter summary.`
        }
      >
        {isWeeklyRange ? (
          weeklyEnvelopeQuery.isLoading || weeklyTrendQuery.isLoading || weeklySummaryQuery.isLoading ? (
            <V2State kind="loading">Loading weekly summary…</V2State>
          ) : weeklySummary && weeklyTrendSummary ? (
            <div className="V2WeeklySummary">
              <div className="V2WeeklySummary__stats">
                <article>
                  <span>Team Messages (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.messagesSent)}</strong>
                </article>
                <article>
                  <span>Team Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.bookedCalls)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.teamBooked)} vs prior day</em>
                </article>
                <article>
                  <span>Jack Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.jackBooked)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.jackBooked)} vs prior day</em>
                </article>
                <article>
                  <span>Brandon Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.brandonBooked)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.brandonBooked)} vs prior day</em>
                </article>
              </div>

              <div className="V2WeeklySummary__setters">
                <article>
                  <h3>Setter Jack</h3>
                  <p>
                    Outbound {fmtInt(weeklyTrendSummary.totals.jackOutbound)} | Opt-outs {fmtInt(weeklyTrendSummary.totals.jackOptOuts)} |
                    Avg reply {fmtPct(weeklyTrendSummary.avgReplyRate.jack)}
                  </p>
                </article>
                <article>
                  <h3>Setter Brandon</h3>
                  <p>
                    Outbound {fmtInt(weeklyTrendSummary.totals.brandonOutbound)} | Opt-outs{' '}
                    {fmtInt(weeklyTrendSummary.totals.brandonOptOuts)} | Avg reply {fmtPct(weeklyTrendSummary.avgReplyRate.brandon)}
                  </p>
                </article>
              </div>

              <div className="V2WeeklySummary__meta">
                <span className={`V2Tag V2Tag--${sourceTone(sourceStatus)}`}>Source: {sourceBadge}</span>
                <span>Last monday sync: {fmtDateTime(weeklySummary.sources.monday.lastSyncAt)}</span>
                <span>Generated: {fmtDateTime(weeklySummary.sources.generatedAt)}</span>
              </div>

              <div className="V2TableWrap">
                <table className="V2Table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="is-right">Team calls booked</th>
                      <th className="is-right">Team opt-outs</th>
                      <th className="is-right">Jack calls booked</th>
                      <th className="is-right">Jack outbound</th>
                      <th className="is-right">Brandon calls booked</th>
                      <th className="is-right">Brandon outbound</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyTrend.map((point) => (
                      <tr key={point.day}>
                        <td>{point.day}</td>
                        <td className="is-right">{fmtInt(point.team.bookedCalls)}</td>
                        <td className="is-right">{fmtInt(point.team.optOuts)}</td>
                        <td className="is-right">{fmtInt(point.setters.jack.bookedCalls)}</td>
                        <td className="is-right">{fmtInt(point.setters.jack.outboundConversations)}</td>
                        <td className="is-right">{fmtInt(point.setters.brandon.bookedCalls)}</td>
                        <td className="is-right">{fmtInt(point.setters.brandon.outboundConversations)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="V2WeeklySummary__extras">
                <article>
                  <h3>monday Pipeline Snapshot</h3>
                  <p>
                    Total {fmtInt(weeklySummary.mondayPipeline.totalCalls)} | Booked {fmtInt(weeklySummary.mondayPipeline.booked)} | No-show{' '}
                    {fmtInt(weeklySummary.mondayPipeline.noShow)} | Cancelled {fmtInt(weeklySummary.mondayPipeline.cancelled)}
                  </p>
                </article>
                <article>
                  <h3>Actions Next Week</h3>
                  <ul className="V2BulletList">
                    {weeklySummary.actionsNextWeek.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          ) : weeklyTrendSummary ? (
            <div className="V2WeeklySummary">
              <div className="V2WeeklySummary__meta">
                <span className="V2Tag V2Tag--critical">Source: PTBizSMS only</span>
                <span>monday summary unavailable; showing fallback trend from sales-metrics.</span>
              </div>
              <div className="V2WeeklySummary__stats">
                <article>
                  <span>Team Messages (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.messagesSent)}</strong>
                </article>
                <article>
                  <span>Team Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.bookedCalls)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.teamBooked)} vs prior day</em>
                </article>
                <article>
                  <span>Jack Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.jackBooked)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.jackBooked)} vs prior day</em>
                </article>
                <article>
                  <span>Brandon Calls Booked (7d)</span>
                  <strong>{fmtInt(weeklyTrendSummary.totals.brandonBooked)}</strong>
                  <em>{fmtDelta(weeklyTrendSummary.latestDelta.brandonBooked)} vs prior day</em>
                </article>
              </div>
              <V2State kind="empty">
                Weekly manager summary endpoint unavailable: {String((weeklySummaryQuery.error as Error | undefined)?.message || 'unknown error')}
              </V2State>
            </div>
          ) : (
            <V2State kind="empty">No weekly summary available for this range.</V2State>
          )
        ) : (
          <div className="V2WeeklySummary">
            <div className="V2WeeklySummary__stats">
              <article>
                <span>Team Messages ({selectedRangeShortLabel})</span>
                <strong>{fmtInt(payload.totals.messagesSent)}</strong>
              </article>
              <article>
                <span>Team Calls Booked ({selectedRangeShortLabel})</span>
                <strong>{fmtInt(payload.totals.canonicalBookedCalls)}</strong>
              </article>
              <article>
                <span>Jack Calls Booked ({selectedRangeShortLabel})</span>
                <strong>{fmtInt(payload.bookedCredit.jack)}</strong>
              </article>
              <article>
                <span>Brandon Calls Booked ({selectedRangeShortLabel})</span>
                <strong>{fmtInt(payload.bookedCredit.brandon)}</strong>
              </article>
            </div>

            <div className="V2WeeklySummary__setters">
              <article>
                <h3>Setter Jack</h3>
                <p>
                  Outbound {fmtInt(jackRangeRep?.outboundConversations ?? 0)} | Opt-outs {fmtInt(jackRangeRep?.optOuts ?? 0)} | Avg reply{' '}
                  {fmtPctMaybe(jackRangeRep?.replyRatePct)}
                </p>
              </article>
              <article>
                <h3>Setter Brandon</h3>
                <p>
                  Outbound {fmtInt(brandonRangeRep?.outboundConversations ?? 0)} | Opt-outs {fmtInt(brandonRangeRep?.optOuts ?? 0)} | Avg reply{' '}
                  {fmtPctMaybe(brandonRangeRep?.replyRatePct)}
                </p>
              </article>
            </div>

            <div className="V2WeeklySummary__meta">
              <span className="V2Tag V2Tag--accent">Source: selected range ({selectedRangeLabel})</span>
              <span>monday weekly endpoint is not used outside the 7d view.</span>
            </div>
          </div>
        )}
      </V2Panel>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Booked Call Credit (Slack)" caption="Source-of-truth from Slack reactions and first-conversion attribution model.">
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

        <V2Panel title="Attribution Rules" caption="Explicit split so self-booked does not hide inside unknown buckets.">
          <ul className="V2BulletList">
            <li>Calls Booked source: {payload.provenance.canonicalBookedSource} (canonical KPI).</li>
            <li>
              Channel split:
              {` total ${fmtInt(bookedTotalAllChannels)}, SMS linked strict ${fmtInt(bookedSmsLinkedStrict)}, self-booked ${fmtInt(bookedSelf)}, non-SMS/unknown excluding self ${fmtInt(bookedNonSmsOrUnknownExcludingSelf)}.`}
            </li>
            <li>
              Sequence label coverage:{' '}
              {bookedAttribution
                ? `${bookedAttribution.matchedCalls}/${bookedAttribution.totalCalls} (named: ${Math.max(0, bookedAttribution.matchedCalls - bookedAttribution.manualCalls)}, manual/direct: ${bookedAttribution.manualCalls})`
                : 'n/a'}
            </li>
          </ul>
        </V2Panel>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Sequence Risk Watch" caption="Protect list health before scaling volume.">
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

        <V2Panel title="Live Trend" caption={`Rolling by-day trend in ${data.meta.timeZone}.`}>
          <div className="V2TrendList">
            {payload.trendByDay.map((day) => (
              <article key={day.day} className="V2TrendList__row">
                <h3>{day.day}</h3>
                <div className="V2TrendList__metrics">
                  <span>Sent {fmtInt(day.messagesSent)}</span>
                  <span>Reply {fmtPct(day.replyRatePct)}</span>
                  <span>Booked Calls {fmtInt(day.canonicalBookedCalls)}</span>
                  <span>Opt-outs {fmtInt(day.optOuts)}</span>
                </div>
              </article>
            ))}
          </div>
        </V2Panel>
      </div>
    </div>
  );
}
