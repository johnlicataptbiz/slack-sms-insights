import { useMemo, useRef, useState, useCallback } from 'react';
import { MessageSquare, Users, Reply, Phone, ChevronUp, ChevronDown } from 'lucide-react';

import {
  useV2AttributionMethodDaily,
  useV2AttributionReviewQueue,
  useV2RepResponseDaily,
  useV2SequenceFunnel,
  useV2SequenceQualification,
  useV2SequencesDeep,
  useV2UnresolvedAttributions,
} from '../../api/v2Queries';
import type { SequenceQualificationItem } from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import { AttributionHealthPanel } from '../components/AttributionHealthPanel';
import {
  AttributionMethodPanel,
  AttributionReviewQueuePanel,
  RepResponsePanel,
  SequenceFunnelPanel,
  UnresolvedAttributionPanel,
} from '../components/SequenceAttributionPanels';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';
import { DEFAULT_BUSINESS_TIME_ZONE } from '../../utils/runDay';

function IconLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {icon}
      {children}
    </span>
  );
}

type Mode = '7d' | '30d' | '90d' | '180d' | '365d';
type SortKey =
  | 'label'
  | 'messagesSent'
  | 'uniqueContacted'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'bookedCalls'
  | 'bookingRatePct'
  | 'optOuts'
  | 'optOutRatePct';
type SortDirection = 'asc' | 'desc';

const MODE_LABELS: Record<Mode, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '180d': 'Last 180 days',
  '365d': 'Last 365 days',
};

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtSplit = (jack: number, brandon: number, selfBooked: number) => `${fmtInt(jack)} / ${fmtInt(brandon)} / ${fmtInt(selfBooked)}`;

export default function SequencesV2() {
  const [mode, setMode] = useState<Mode>('30d');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('active');
  const [minSendsThreshold, setMinSendsThreshold] = useState<number>(15);
  const [sortKey, setSortKey] = useState<SortKey>('messagesSent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const tableRef = useRef<HTMLDivElement | null>(null);

  const onSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'label' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc'
      ? <ChevronUp size={10} style={{ marginLeft: '3px', display: 'inline' }} />
      : <ChevronDown size={10} style={{ marginLeft: '3px', display: 'inline' }} />;
  };

  const query = useV2SequencesDeep({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
    ...(status ? { status } : {}),
  });
  const funnelQuery = useV2SequenceFunnel({ range: mode, tz: DEFAULT_BUSINESS_TIME_ZONE });
  const attributionMethodQuery = useV2AttributionMethodDaily({ range: mode, tz: DEFAULT_BUSINESS_TIME_ZONE });
  const repResponseQuery = useV2RepResponseDaily({ range: mode, tz: DEFAULT_BUSINESS_TIME_ZONE });
  const reviewQueueQuery = useV2AttributionReviewQueue(8);
  const unresolvedQuery = useV2UnresolvedAttributions(8);
  const qualificationQuery = useV2SequenceQualification({ range: mode, tz: DEFAULT_BUSINESS_TIME_ZONE });
  const data = query.data?.data;
  const funnelRows = funnelQuery.data ?? [];
  const attributionMethodRows = attributionMethodQuery.data ?? [];
  const repResponseRows = repResponseQuery.data ?? [];
  const reviewQueueRows = reviewQueueQuery.data ?? [];
  const unresolvedRows = unresolvedQuery.data ?? [];
  const qualificationItems = qualificationQuery.data?.data.items ?? [];
  const qualificationSummary = useMemo(() => {
    const total = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.totalConversations, 0);
    const sumFullTime = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.fullTime.count, 0);
    const sumPartTime = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.partTime.count, 0);
    const sumCash = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.mostlyCash.count, 0);
    const sumInsurance = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.mostlyInsurance.count, 0);
    const sumBalanced = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.balancedMix.count, 0);
    const sumHighInterest = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.highInterest.count, 0);
    const sumMediumInterest = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.mediumInterest.count, 0);
    const sumLowInterest = qualificationItems.reduce((sum: number, item: SequenceQualificationItem) => sum + item.lowInterest.count, 0);
    const nicheMap = new Map<string, number>();
    for (const item of qualificationItems) {
      for (const niche of item.topNiches) {
        nicheMap.set(niche.niche, (nicheMap.get(niche.niche) || 0) + niche.count);
      }
    }
    const topNiches = [...nicheMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([niche, count]) => ({ niche, count }));
    const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
    return {
      total,
      fullTimePct: pct(sumFullTime),
      partTimePct: pct(sumPartTime),
      cashPct: pct(sumCash),
      insurancePct: pct(sumInsurance),
      balancedPct: pct(sumBalanced),
      highInterestPct: pct(sumHighInterest),
      mediumInterestPct: pct(sumMediumInterest),
      lowInterestPct: pct(sumLowInterest),
      topNiches,
    };
  }, [qualificationItems]);

  const tableEligibleSequences = useMemo(() => {
    if (!data) return [];
    return data.sequences.filter((row) => !row.isManualBucket);
  }, [data]);

  const totals = useMemo(() => {
    return tableEligibleSequences.reduce(
      (acc, row) => {
        acc.messagesSent += row.messagesSent;
        acc.uniqueContacted += row.uniqueContacted;
        acc.inboundTexts += row.inboundTexts;
        acc.repliesReceived += row.repliesReceived;
        acc.bookedCalls += row.bookedCalls;
        acc.optOuts += row.optOuts;
        return acc;
      },
      { messagesSent: 0, uniqueContacted: 0, inboundTexts: 0, repliesReceived: 0, bookedCalls: 0, optOuts: 0 },
    );
  }, [tableEligibleSequences]);

  const sortedSequences = useMemo(() => {
    const filtered = tableEligibleSequences.filter((row) => row.messagesSent >= minSendsThreshold);
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir;
      const aVal = a[sortKey as keyof typeof a] as number;
      const bVal = b[sortKey as keyof typeof b] as number;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return a.label.localeCompare(b.label);
    });
  }, [tableEligibleSequences, minSendsThreshold, sortKey, sortDirection]);

  const summaryCopy = [
    `${fmtInt(totals.messagesSent)} outbound`,
    `${fmtInt(totals.uniqueContacted)} leads contacted`,
    `${fmtInt(totals.repliesReceived)} replied`,
    `${fmtInt(totals.bookedCalls)} booked`,
  ].join(' · ');

  return (
    <div className="V2Page V2PageTransition V2Page--sequencesClean">
      <V2PageHeader
        title="Sequences"
        subtitle="How each sequence is performing: outbound texts, contact response, and booked calls."
        right={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button key={m} className={`V2Chip ${mode === m ? 'is-active' : ''}`} onClick={() => setMode(m)}>
                {MODE_LABELS[m]}
              </button>
            ))}
            <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'inactive' | '')}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <span style={{ whiteSpace: 'nowrap' }}>Min sends</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={minSendsThreshold}
                onChange={(e) => setMinSendsThreshold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{ width: '64px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--v2-border, #e2e8f0)', fontSize: '0.85rem' }}
              />
            </label>
            <button
              type="button"
              className="V2GhostButton"
              onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Jump to table
            </button>
          </div>
        }
      />

      {query.isLoading ? (
        <V2State kind="loading">Loading sequence performance…</V2State>
      ) : query.isError || !data ? (
        <V2State kind="error" onRetry={() => void query.refetch()}>
          Failed to load sequence performance.
        </V2State>
      ) : (
        <>
          {data.warnings && data.warnings.length > 0 ? (
            <div className="V2InlineWarning">
              {data.warnings.join(' ')}
            </div>
          ) : null}

          <div className="V2MetricsGrid V2MetricsGrid--compact">
            <V2MetricCard label={<IconLabel icon={<MessageSquare size={11} />}>Total outbound sent</IconLabel>} value={fmtInt(totals.messagesSent)} />
            <V2MetricCard label={<IconLabel icon={<Users size={11} />}>New leads contacted</IconLabel>} value={fmtInt(totals.uniqueContacted)} />
            <V2MetricCard label={<IconLabel icon={<Reply size={11} />}>Leads who replied</IconLabel>} value={fmtInt(totals.repliesReceived)} />
            <V2MetricCard label={<IconLabel icon={<Phone size={11} />}>Booked calls</IconLabel>} value={fmtInt(totals.bookedCalls)} tone="positive" />
          </div>
          <div style={{ marginTop: '0.85rem', color: 'var(--v2-muted)', fontSize: '0.88rem' }}>
            {summaryCopy}
          </div>

          <div ref={tableRef}>
            <V2Panel
              title="Sequence Results"
              caption="Outbound, response, and booked-call performance for each sequence."
            >
              <div className="V2TableWrap V2TableWrap--sequences">
                <table className="V2Table V2Table--sequences">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" className="V2SortButton" onClick={() => onSort('label')}>
                          Sequence{sortIndicator('label')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('uniqueContacted')}>
                          New leads contacted{sortIndicator('uniqueContacted')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('repliesReceived')}>
                          Leads who replied{sortIndicator('repliesReceived')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('replyRatePct')}>
                          Reply rate{sortIndicator('replyRatePct')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('bookedCalls')}>
                          Calls booked{sortIndicator('bookedCalls')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('bookingRatePct')}>
                          Booking rate{sortIndicator('bookingRatePct')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('optOuts')}>
                          Opt-outs{sortIndicator('optOuts')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('optOutRatePct')}>
                          Opt-out rate{sortIndicator('optOutRatePct')}
                        </button>
                      </th>
                      <th className="is-right" title="Booked split as Jack / Brandon / Self">J / B / Self</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSequences.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--v2-muted, #94a3b8)' }}>
                          No sequences match the current filter.
                        </td>
                      </tr>
                    ) : sortedSequences.map((row) => (
                      <tr key={row.sequenceId} className={row.isManualBucket ? 'V2Table__row--manual' : ''}>
                        <td title={`${row.label}${row.leadMagnet ? ` • ${row.leadMagnet}` : ''}`}>
                          <span className="V2Table__seqName">{row.label}</span>
                        </td>
                        <td className="is-right">{fmtInt(row.uniqueContacted)}</td>
                        <td className="is-right">{fmtInt(row.repliesReceived)}</td>
                        <td className="is-right">{fmtPct(row.replyRatePct)}</td>
                        <td className="is-right">{fmtInt(row.bookedCalls)}</td>
                        <td className="is-right">{fmtPct(row.bookingRatePct)}</td>
                        <td className="is-right">{fmtInt(row.optOuts)}</td>
                        <td className="is-right">{fmtPct(row.optOutRatePct)}</td>
                        <td className="is-right">{fmtSplit(row.bookedBreakdown.jack, row.bookedBreakdown.brandon, row.bookedBreakdown.selfBooked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </V2Panel>
          </div>

          <div className="V2Grid V2Grid--2">
            {funnelQuery.isLoading ? (
              <V2Panel title="Sequence Funnel" caption="Daily contacted-to-booked funnel across the selected range.">
                <V2State kind="loading">Loading funnel data…</V2State>
              </V2Panel>
            ) : funnelQuery.isError ? (
              <V2Panel title="Sequence Funnel" caption="Daily contacted-to-booked funnel across the selected range.">
                <V2State kind="error" onRetry={() => void funnelQuery.refetch()}>
                  Failed to load funnel data.
                </V2State>
              </V2Panel>
            ) : (
              <SequenceFunnelPanel rows={funnelRows} />
            )}

            {reviewQueueQuery.isLoading ? (
              <V2Panel title="Attribution Review Queue" caption="Ambiguous bookings that need a second look.">
                <V2State kind="loading">Loading review queue…</V2State>
              </V2Panel>
            ) : reviewQueueQuery.isError ? (
              <V2Panel title="Attribution Review Queue" caption="Ambiguous bookings that need a second look.">
                <V2State kind="error" onRetry={() => void reviewQueueQuery.refetch()}>
                  Failed to load review queue.
                </V2State>
              </V2Panel>
            ) : (
              <AttributionReviewQueuePanel rows={reviewQueueRows} />
            )}
          </div>

          <div className="V2Grid V2Grid--2">
            <AttributionHealthPanel />

            {unresolvedQuery.isLoading ? (
              <V2Panel title="Unresolved Attributions" caption="Latest bookings that still need a sequence decision.">
                <V2State kind="loading">Loading unresolved attributions…</V2State>
              </V2Panel>
            ) : unresolvedQuery.isError ? (
              <V2Panel title="Unresolved Attributions" caption="Latest bookings that still need a sequence decision.">
                <V2State kind="error" onRetry={() => void unresolvedQuery.refetch()}>
                  Failed to load unresolved attributions.
                </V2State>
              </V2Panel>
            ) : (
              <UnresolvedAttributionPanel rows={unresolvedRows} />
            )}
          </div>

          <div className="V2Grid V2Grid--2">
            {attributionMethodQuery.isLoading ? (
              <V2Panel title="Attribution Methods" caption="How booked calls were matched in the selected range.">
                <V2State kind="loading">Loading attribution methods…</V2State>
              </V2Panel>
            ) : attributionMethodQuery.isError ? (
              <V2Panel title="Attribution Methods" caption="How booked calls were matched in the selected range.">
                <V2State kind="error" onRetry={() => void attributionMethodQuery.refetch()}>
                  Failed to load attribution methods.
                </V2State>
              </V2Panel>
            ) : (
              <AttributionMethodPanel rows={attributionMethodRows} />
            )}

            {repResponseQuery.isLoading ? (
              <V2Panel title="Rep Response" caption="Contacted-to-booked funnel and timing by rep.">
                <V2State kind="loading">Loading rep response…</V2State>
              </V2Panel>
            ) : repResponseQuery.isError ? (
              <V2Panel title="Rep Response" caption="Contacted-to-booked funnel and timing by rep.">
                <V2State kind="error" onRetry={() => void repResponseQuery.refetch()}>
                  Failed to load rep response.
                </V2State>
              </V2Panel>
            ) : (
              <RepResponsePanel rows={repResponseRows} />
            )}
          </div>

            {!qualificationQuery.isLoading && !qualificationQuery.isError && qualificationItems.length > 0 ? (
              <div className="V2QualSummary">
                <article className="V2QualSummary__cell">
                  <strong>{fmtPct(qualificationSummary.fullTimePct)}</strong>
                  <span>Full-time</span>
                  <small>{fmtPct(qualificationSummary.partTimePct)} part-time</small>
                </article>
                <article className="V2QualSummary__cell">
                  <strong>{fmtPct(qualificationSummary.cashPct)}</strong>
                  <span>Revenue mix</span>
                  <small>
                    {fmtPct(qualificationSummary.insurancePct)} insurance · {fmtPct(qualificationSummary.balancedPct)} balanced
                  </small>
                </article>
                <article className="V2QualSummary__cell">
                  <strong>{fmtPct(qualificationSummary.highInterestPct)}</strong>
                  <span>Coaching interest</span>
                  <small>
                    {fmtPct(qualificationSummary.mediumInterestPct)} medium · {fmtPct(qualificationSummary.lowInterestPct)} low
                  </small>
                </article>
                <article className="V2QualSummary__cell">
                  <strong>Top niches</strong>
                  <span>Incoming interests</span>
                  <div className="V2QualSummary__niches">
                    {qualificationSummary.topNiches.map((niche) => (
                      <span key={niche.niche} className="V2QualSummary__niche">
                        {niche.niche}
                        <strong>{fmtInt(niche.count)}</strong>
                      </span>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}

          <V2Panel
            title="Lead Qualification by Sequence"
            caption="Deeper breakdown as you scroll: employment, revenue model, interest level, and top niches."
          >
            {qualificationQuery.isLoading ? (
              <V2State kind="loading">Loading qualification breakdown...</V2State>
            ) : qualificationQuery.isError ? (
              <V2State kind="error" onRetry={() => void qualificationQuery.refetch()}>
                Failed to load qualification breakdown.
              </V2State>
            ) : qualificationItems.length === 0 ? (
              <V2State kind="empty">No qualification breakdown available for this date range.</V2State>
            ) : (
              <SequenceQualificationBreakdown items={qualificationItems} isLoading={false} />
            )}
          </V2Panel>

        </>
      )}
    </div>
  );
}
