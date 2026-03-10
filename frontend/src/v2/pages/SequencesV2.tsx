import { useMemo, useRef, useState } from 'react';

import { useV2SequenceQualification, useV2SequencesDeep } from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';

type Mode = '7d' | '30d' | '90d' | '180d' | '365d';

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
  const tableRef = useRef<HTMLDivElement | null>(null);

  const query = useV2SequencesDeep({
    range: mode,
    tz: 'America/Chicago',
    ...(status ? { status } : {}),
  });
  const qualificationQuery = useV2SequenceQualification({ range: mode, tz: 'America/Chicago' });
  const data = query.data?.data;
  const qualificationItems = qualificationQuery.data?.data.items ?? [];

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

  return (
    <div className="V2Page">
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
            <V2MetricCard label="Messages sent" value={fmtInt(totals.messagesSent)} />
            <V2MetricCard label="People reached" value={fmtInt(totals.uniqueContacted)} />
            <V2MetricCard label="Replies" value={fmtInt(totals.repliesReceived)} />
            <V2MetricCard
              label="Reply rate"
              value={fmtPct(totals.uniqueContacted > 0 ? (totals.repliesReceived / totals.uniqueContacted) * 100 : 0)}
            />
            <V2MetricCard label="Booked calls" value={fmtInt(totals.bookedCalls)} tone="positive" />
            <V2MetricCard
              label="Booking rate"
              value={fmtPct(totals.uniqueContacted > 0 ? (totals.bookedCalls / totals.uniqueContacted) * 100 : 0)}
            />
            <V2MetricCard label="Opt-outs" value={fmtInt(totals.optOuts)} tone={totals.optOuts > 0 ? 'critical' : 'default'} />
            <V2MetricCard label="Monday boards behind" value={fmtInt(data.monday.staleBoards)} tone={data.monday.staleBoards > 0 ? 'critical' : 'default'} />
          </div>

          <div ref={tableRef}>
            <V2Panel
              title="Sequence Results"
              caption="At-a-glance sequence performance for this date range. Tip: swipe left/right if needed."
            >
              <div className="V2TableWrap V2TableWrap--sequences">
                <table className="V2Table V2Table--sequences">
                  <thead>
                    <tr>
                      <th>Sequence</th>
                      <th className="is-right">Sent</th>
                      <th className="is-right">Replies</th>
                      <th className="is-right">Reply %</th>
                      <th className="is-right">Booked</th>
                      <th className="is-right">Book %</th>
                      <th className="is-right">Opt-outs</th>
                      <th className="is-right">Opt %</th>
                      <th className="is-right" title="Booked split as Jack / Brandon / Self">J / B / Self</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sequences.map((row) => (
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

          <div className="V2Grid V2Grid--3">
            <V2Panel title="Monday Board Health" caption="Quick read on Monday freshness.">
              <div className="V2SplitStat">
                <div>
                  <span>Boards</span>
                  <strong>{fmtInt(data.monday.boards)}</strong>
                </div>
                <div>
                  <span>Behind</span>
                  <strong>{fmtInt(data.monday.staleBoards)}</strong>
                </div>
                <div>
                  <span>With errors</span>
                  <strong>{fmtInt(data.monday.erroredBoards)}</strong>
                </div>
              </div>
            </V2Panel>

            <V2Panel title="Monday Data Completeness" caption="How complete key Monday fields are.">
              <div className="V2DeltaList">
                <div>
                  <span>Source filled</span>
                  <strong>{fmtPct(data.monday.avgSourceCoveragePct)}</strong>
                </div>
                <div>
                  <span>Campaign filled</span>
                  <strong>{fmtPct(data.monday.avgCampaignCoveragePct)}</strong>
                </div>
                <div>
                  <span>Setter filled</span>
                  <strong>{fmtPct(data.monday.avgSetByCoveragePct)}</strong>
                </div>
                <div>
                  <span>Touchpoints filled</span>
                  <strong>{fmtPct(data.monday.avgTouchpointsCoveragePct)}</strong>
                </div>
              </div>
            </V2Panel>

            <V2Panel title="Booking Rate" caption="Overall booking efficiency for the selected window.">
              <div className="V2SplitStat">
                <div>
                  <span>Booking rate</span>
                  <strong>{fmtPct(totals.uniqueContacted > 0 ? (totals.bookedCalls / totals.uniqueContacted) * 100 : 0)}</strong>
                </div>
                <div>
                  <span>Booked calls</span>
                  <strong>{fmtInt(totals.bookedCalls)}</strong>
                </div>
                <div>
                  <span>Replies</span>
                  <strong>{fmtInt(totals.repliesReceived)}</strong>
                </div>
              </div>
            </V2Panel>

          </div>
        </>
      )}
    </div>
  );
}
