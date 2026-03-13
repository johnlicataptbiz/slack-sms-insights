import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Users, Reply, Percent, Phone, CalendarCheck, UserMinus, TrendingDown, Share2, LayoutGrid } from 'lucide-react';

import { useV2InsightsSummary, useV2SalesMetrics } from '../../api/v2Queries';
import type { BookedCredit } from '../../api/v2-types';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';
import { BookingAttributionPanel } from '../components/BookingAttributionPanel';
import { AttributionHealthPanel } from '../components/AttributionHealthPanel';
import { SkeletonDashboard } from '../components/Skeleton';

function IconLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {icon}
      {children}
    </span>
  );
}

const smsBannerUrl = 'https://22001532.fs1.hubspotusercontent-na1.net/hubfs/22001532/JL/ptbizsms/smsbanner1.png';

type Range = 'today' | '7d' | '30d' | '90d' | '180d' | '365d';

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtSignedInt = (n: number) => `${n >= 0 ? '+' : ''}${Math.abs(n).toLocaleString()}`;

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
  const setterRows = useMemo(
    () =>
      reps.filter((rep) => {
        const id = (rep.repId || '').toLowerCase();
        return id === 'jack' || id === 'brandon';
      }),
    [reps],
  );

  const salesMetricsQuery = useV2SalesMetrics({ range, tz: 'America/Chicago' });
  const salesMetrics = salesMetricsQuery.data?.data;
  const bookedCredit = salesMetrics?.bookedCredit;
  const manualSharePct = bookedCredit && bookedCredit.total > 0 ? (bookedCredit.selfBooked / bookedCredit.total) * 100 : 0;
  const manualBookedCalls = bookedCredit?.selfBooked ?? 0;
  const slackBookedTotal = bookedCredit?.total ?? 0;
  const slackVsMondayDelta = data ? slackBookedTotal - data.kpis.bookedCalls : 0;
  const bookingAttributionMeta = salesMetrics?.provenance.sequenceBookedAttribution;
  const mondayHealth = data?.mondayHealth;
  const mondayCoverageCards = mondayHealth
    ? [
        { label: 'Monday coverage · source', value: mondayHealth.avgSourceCoveragePct },
        { label: 'Monday coverage · campaign', value: mondayHealth.avgCampaignCoveragePct },
        { label: 'Monday coverage · set by', value: mondayHealth.avgSetByCoveragePct },
        { label: 'Monday coverage · touchpoints', value: mondayHealth.avgTouchpointsCoveragePct },
      ]
    : [];

  const renderBookingAttributionSection = () => {
    if (salesMetricsQuery.isLoading) {
      return (
        <V2Panel title="Booking attribution" caption="Slack booked calls matched to sequences.">
          <V2State kind="loading">Loading booking attribution…</V2State>
        </V2Panel>
      );
    }
    if (salesMetricsQuery.isError) {
      return (
        <V2Panel title="Booking attribution" caption="Slack booked calls matched to sequences.">
          <V2State kind="error">Failed to load booking attribution.</V2State>
        </V2Panel>
      );
    }
    if (!bookedCredit) {
      return (
        <V2Panel title="Booking attribution" caption="Slack booked calls matched to sequences.">
          <V2State kind="empty">No booking data available yet.</V2State>
        </V2Panel>
      );
    }
    return (
      <BookingAttributionPanel
        bookedCredit={bookedCredit}
        attribution={bookingAttributionMeta}
        modeLabel={RANGE_LABELS[range]}
        mode={range}
      />
    );
  };

  if (query.isLoading) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="Team results in one place." />
        <SkeletonDashboard />
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div className="V2Page">
        <V2PageHeader title="Performance" subtitle="Team results in one place." />
        <V2State kind="error" onRetry={() => void query.refetch()}>
          Failed to load performance summary.
        </V2State>
      </div>
    );
  }

  return (
    <div className="V2Page">
      <img className="V2PageHeroBanner" src={smsBannerUrl} alt="" aria-hidden="true" />
      <V2PageHeader
        title="Performance"
        subtitle="Team and setter results, what needs attention, and Monday board health."
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

      {data.warnings && data.warnings.length > 0 ? (
        <div className="V2InlineWarning">
          {data.warnings.join(' ')}
        </div>
      ) : null}

      <section className="V2MetricsGrid V2MetricsGrid--compact">
        <V2MetricCard label={<IconLabel icon={<MessageSquare size={11} />}>Messages sent</IconLabel>} value={fmtInt(data.kpis.messagesSent)} />
        <V2MetricCard label={<IconLabel icon={<Users size={11} />}>People reached</IconLabel>} value={fmtInt(data.kpis.uniqueContacted)} />
        <V2MetricCard label={<IconLabel icon={<Reply size={11} />}>Replies</IconLabel>} value={fmtInt(data.kpis.repliesReceived)} />
        <V2MetricCard
          label={<IconLabel icon={<Percent size={11} />}>Reply rate</IconLabel>}
          value={fmtPct(data.kpis.replyRatePct)}
          tone={data.kpis.replyRatePct >= 10 ? 'positive' : 'default'}
        />
        <V2MetricCard label={<IconLabel icon={<Phone size={11} />}>Booked calls</IconLabel>} value={fmtInt(data.kpis.bookedCalls)} tone="positive" />
        <V2MetricCard
          label={<IconLabel icon={<CalendarCheck size={11} />}>Booking rate</IconLabel>}
          value={fmtPct(data.kpis.bookingRatePct)}
          tone={data.kpis.bookingRatePct >= 2 ? 'positive' : data.kpis.bookingRatePct <= 1 ? 'critical' : 'default'}
        />
        <V2MetricCard label={<IconLabel icon={<Share2 size={11} />}>Manual share (Slack)</IconLabel>} value={fmtPct(manualSharePct)} />
        {mondayCoverageCards.map((card) => (
          <V2MetricCard key={card.label} label={<IconLabel icon={<LayoutGrid size={11} />}>{card.label}</IconLabel>} value={fmtPct(card.value)} />
        ))}
        <V2MetricCard
          label={<IconLabel icon={<UserMinus size={11} />}>Opt-outs</IconLabel>}
          value={fmtInt(data.kpis.optOuts)}
          tone={data.kpis.optOuts > 0 ? 'critical' : 'default'}
        />
        <V2MetricCard
          label={<IconLabel icon={<TrendingDown size={11} />}>Opt-out rate</IconLabel>}
          value={fmtPct(data.kpis.optOutRatePct)}
          tone={data.kpis.optOutRatePct >= 3 ? 'critical' : 'default'}
        />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Setter Comparison" caption="Side-by-side view of Jack and Brandon for this date range.">
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
                {setterRows.map((rep) => {
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

        <div className="V2PanelStack">
          {renderBookingAttributionSection()}
          <AttributionHealthPanel />
        </div>
      </div>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Contact Journey" caption="How people move from reached to replied to booked.">
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
              <span>Reached but no reply yet</span>
              <strong>{fmtPct(data.funnel.replyDropoffPct)}</strong>
            </div>
            <div>
              <span>Replied but not booked yet</span>
              <strong>{fmtPct(data.funnel.bookingDropoffPct)}</strong>
            </div>
          </div>
        </V2Panel>

        <div className="V2PanelStack">
          <V2Panel title="Monday board health" caption="Is Monday data up to date and complete?">
            <div className="V2SplitStat">
              <div>
                <span>Boards</span>
                <strong>{fmtInt(mondayHealth?.boards ?? 0)}</strong>
              </div>
              <div>
                <span>Behind</span>
                <strong>{fmtInt(mondayHealth?.staleBoards ?? 0)}</strong>
              </div>
              <div>
                <span>Errors</span>
                <strong>{fmtInt(mondayHealth?.erroredBoards ?? 0)}</strong>
              </div>
            </div>
            <div className="V2DeltaList" style={{ marginTop: '1rem' }}>
              {mondayCoverageCards.map((stat) => (
                <div key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{fmtPct(stat.value)}</strong>
                </div>
              ))}
            </div>
          </V2Panel>

          <V2Panel title="Booking rate" caption="Manual + sequence bookings for this window.">
            <div className="V2SplitStat">
              <div>
                <span>Booking rate</span>
                <strong>{fmtPct(data.kpis.bookingRatePct)}</strong>
              </div>
              <div>
                <span>Manual share (Slack)</span>
                <strong>{fmtPct(manualSharePct)}</strong>
              </div>
              <div>
                <span>Slack vs. Monday delta</span>
                <strong>{fmtSignedInt(slackVsMondayDelta)}</strong>
              </div>
            </div>
            <div className="V2DeltaList" style={{ marginTop: '1rem' }}>
              <div>
                <span>Manual booked calls</span>
                <strong>{fmtInt(manualBookedCalls)}</strong>
              </div>
              <div>
                <span>Fallback SMS matches</span>
                <strong>{fmtInt(bookingAttributionMeta?.smsPhoneMatchedCalls ?? 0)}</strong>
              </div>
              <div>
                <span>Strict SMS reply matches</span>
                <strong>{fmtInt(bookingAttributionMeta?.strictSmsReplyLinkedCalls ?? 0)}</strong>
              </div>
            </div>
          </V2Panel>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <V2Panel title="Watch List" caption="Items that need attention based on this range.">
          {data.risks.length === 0 ? (
            <V2State kind="empty">No issues flagged for this date range.</V2State>
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
      </div>
    </div>
  );
}

export default InsightsV2;
