import { useMemo, useRef, useState, useCallback } from 'react';
import { MessageSquare, Users, Reply, Phone, CalendarCheck, UserMinus, AlertCircle, ChevronUp, ChevronDown, ArrowDownToLine, Filter } from 'lucide-react';

import { useV2SequenceQualification, useV2SequencesDeep } from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';

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
    tz: 'America/Chicago',
    ...(status ? { status } : {}),
  });
  const qualificationQuery = useV2SequenceQualification({ range: mode, tz: 'America/Chicago' });
  const data = query.data?.data;
  const qualificationItems = qualificationQuery.data?.data.items ?? [];
  const qualificationSummary = useMemo(() => {
    const total = qualificationItems.reduce((sum, item) => sum + item.totalConversations, 0);
    const sumFullTime = qualificationItems.reduce((sum, item) => sum + item.fullTime.count, 0);
    const sumPartTime = qualificationItems.reduce((sum, item) => sum + item.partTime.count, 0);
    const sumCash = qualificationItems.reduce((sum, item) => sum + item.mostlyCash.count, 0);
    const sumInsurance = qualificationItems.reduce((sum, item) => sum + item.mostlyInsurance.count, 0);
    const sumBalanced = qualificationItems.reduce((sum, item) => sum + item.balancedMix.count, 0);
    const sumHighInterest = qualificationItems.reduce((sum, item) => sum + item.highInterest.count, 0);
    const sumMediumInterest = qualificationItems.reduce((sum, item) => sum + item.mediumInterest.count, 0);
    const sumLowInterest = qualificationItems.reduce((sum, item) => sum + item.lowInterest.count, 0);
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

  const totals = useMemo(() => {
    if (!data) return null;
    return data.sequences.reduce(
      (acc, row) => {
        acc.messagesSent += row.messagesSent;
        acc.uniqueContacted += row.uniqueContacted;
        acc.repliesReceived += row.repliesReceived;
        acc.bookedCalls += row.bookedCalls;
        acc.optOuts += row.optOuts;
        return acc;
      },
      { messagesSent: 0, uniqueContacted: 0, repliesReceived: 0, bookedCalls: 0, optOuts: 0 },
    );
  }, [data]);

  const filteredCount = useMemo(() => {
    if (!data) return 0;
    return data.sequences.filter((row) => row.messagesSent < minSendsThreshold).length;
  }, [data, minSendsThreshold]);

  const sortedSequences = useMemo(() => {
    if (!data) return [];
    const filtered = data.sequences.filter((row) => row.messagesSent >= minSendsThreshold);
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir;
      const aVal = a[sortKey as keyof typeof a] as number;
      const bVal = b[sortKey as keyof typeof b] as number;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return a.label.localeCompare(b.label);
    });
  }, [data, minSendsThreshold, sortKey, sortDirection]);

  const bookingRatePct = totals && totals.uniqueContacted > 0 ? (totals.bookedCalls / totals.uniqueContacted) * 100 : 0;
  const verification = data?.verification ?? {
    slackBookedTotal: 0,
    mondayBookedTotal: 0,
    deltaBookedVsMonday: 0,
    manualDirectSharePct: 0,
    manualDirectBooked: 0,
    attributionConversationMapped: 0,
    smsPhoneMatchedCalls: 0,
  };

  return (
    <div className="V2Page V2PageTransition">
      <V2PageHeader
        title="Sequences"
        subtitle="How each sequence is performing: volume, replies, and booked calls."
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
      ) : query.isError || !data || !totals ? (
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
            <V2MetricCard label={<IconLabel icon={<MessageSquare size={11} />}>Messages sent</IconLabel>} value={fmtInt(totals.messagesSent)} />
            <V2MetricCard label={<IconLabel icon={<Users size={11} />}>People reached</IconLabel>} value={fmtInt(totals.uniqueContacted)} />
            <V2MetricCard label={<IconLabel icon={<Reply size={11} />}>Replies</IconLabel>} value={fmtInt(totals.repliesReceived)} />
            <V2MetricCard
              label={<IconLabel icon={<ArrowDownToLine size={11} />}>Reply rate</IconLabel>}
              value={fmtPct(totals.uniqueContacted > 0 ? (totals.repliesReceived / totals.uniqueContacted) * 100 : 0)}
            />
            <V2MetricCard label={<IconLabel icon={<Phone size={11} />}>Booked calls</IconLabel>} value={fmtInt(totals.bookedCalls)} tone="positive" />
            <V2MetricCard
              label={<IconLabel icon={<CalendarCheck size={11} />}>Booking rate</IconLabel>}
              value={fmtPct(totals.uniqueContacted > 0 ? (totals.bookedCalls / totals.uniqueContacted) * 100 : 0)}
            />
            <V2MetricCard label={<IconLabel icon={<UserMinus size={11} />}>Opt-outs</IconLabel>} value={fmtInt(totals.optOuts)} tone={totals.optOuts > 0 ? 'critical' : 'default'} />
            <V2MetricCard label={<IconLabel icon={<AlertCircle size={11} />}>Monday boards behind</IconLabel>} value={fmtInt(data.monday.staleBoards)} tone={data.monday.staleBoards > 0 ? 'critical' : 'default'} />
            {filteredCount > 0 && (
              <V2MetricCard
                label={<IconLabel icon={<Filter size={11} />}>Filtered out (low activity)</IconLabel>}
                value={fmtInt(filteredCount)}
                tone="default"
              />
            )}
          </div>

          <V2Panel title="Verification snapshot" caption="Slack totals, Monday totals, and fallback cues.">
            <div className="V2SplitStat">
              <div>
                <span>Slack booked</span>
                <strong>{fmtInt(verification.slackBookedTotal ?? 0)}</strong>
              </div>
              <div>
                <span>Monday booked</span>
                <strong>{fmtInt(verification.mondayBookedTotal ?? 0)}</strong>
              </div>
              <div>
                <span>Delta</span>
                <strong>{fmtInt(verification.deltaBookedVsMonday ?? 0)}</strong>
              </div>
            </div>
            <div className="V2DeltaList" style={{ marginTop: '1rem' }}>
              <div>
                <span>Manual booked calls</span>
                <strong>{fmtInt(verification.manualDirectBooked ?? 0)}</strong>
              </div>
              <div>
                <span>SMS conversations mapped</span>
                <strong>{fmtInt(verification.attributionConversationMapped ?? 0)}</strong>
              </div>
              <div>
                <span>Fallback SMS matches</span>
                <strong>{fmtInt(verification.smsPhoneMatchedCalls ?? 0)}</strong>
              </div>
            </div>
            {(verification.smsPhoneMatchedCalls ?? 0) > 0 && (
              <div className="V2InlineWarning" style={{ marginTop: '1rem' }}>
                Fallback SMS matches are being used for attribution; consider the Slack reaction data the source of truth until the refresh finishes.
              </div>
            )}
          </V2Panel>

          <div ref={tableRef}>
            <V2Panel
              title="Sequence Results"
              caption="At-a-glance sequence performance for this date range. Tip: swipe left/right if needed."
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
                        <button type="button" className="V2SortButton" onClick={() => onSort('messagesSent')}>
                          Sent{sortIndicator('messagesSent')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('repliesReceived')}>
                          Replies{sortIndicator('repliesReceived')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('replyRatePct')}>
                          Reply %{sortIndicator('replyRatePct')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('bookedCalls')}>
                          Booked{sortIndicator('bookedCalls')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('bookingRatePct')}>
                          Book %{sortIndicator('bookingRatePct')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('optOuts')}>
                          Opt-outs{sortIndicator('optOuts')}
                        </button>
                      </th>
                      <th className="is-right">
                        <button type="button" className="V2SortButton" onClick={() => onSort('optOutRatePct')}>
                          Opt %{sortIndicator('optOutRatePct')}
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
                        <td className="is-right">{fmtInt(row.messagesSent)}</td>
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
          </div>

          <V2Panel
            title="Lead Qualification by Sequence"
            caption="Deeper breakdown as you scroll: employment, revenue model, interest level, and top niches."
          >
            {qualificationQuery.isLoading ? (
              <V2State kind="loading">Loading qualification breakdown...</V2State>
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
