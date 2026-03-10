import { useV2SalesMetrics } from '../../api/v2Queries';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';
import { v2Copy } from '../copy';
import { UnattributedAuditTable } from '../components/UnattributedAuditTable';

export default function AttributionV2() {
  const { data, isLoading, isError, error } = useV2SalesMetrics({ range: 'today', tz: 'America/Chicago' });
  const payload = data?.data;

  if (isLoading) return <V2State kind="loading">Loading booking source details…</V2State>;
  if (isError || !payload) {
    return <V2State kind="error">Could not load booking source details: {String((error as Error)?.message || error)}</V2State>;
  }

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.attribution}
        subtitle="See where your booked calls are coming from."
      />

      <section className="V2MetricsGrid">
        <V2MetricCard label={<V2Term term="callsBookedSlack" />} value={payload.bookedCredit.total.toLocaleString()} tone="positive" />
        <V2MetricCard label="Overall reply rate" value={`${payload.totals.replyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="manualReplyRate" />} value={`${payload.totals.manualReplyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="sequenceReplyRate" />} value={`${payload.totals.sequenceReplyRatePct.toFixed(1)}%`} />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Booked Calls Source (Slack)" caption="This is the main booked-call number and credit source.">
          <ul className="V2BulletList">
            <li>Source: Slack booked-call channel plus reaction-based credit routing.</li>
            <li>This is the booked-call number used in scorecards and weekly reviews.</li>
            <li>Day-by-day trend uses this same booked-call count.</li>
          </ul>
        </V2Panel>

        <V2Panel title="How Booking Credit Works" caption="Clear rule set for how setter credit is assigned.">
          <ul className="V2BulletList">
            <li>If Jack reacts, credit goes to Jack.</li>
            <li>If Brandon reacts, credit goes to Brandon.</li>
            <li>If no setter reaction exists, it is treated as self-booked.</li>
          </ul>
        </V2Panel>
      </div>

      <V2Panel title="Sequence Match Summary" caption='How many booked calls matched a sequence name vs "No sequence (manual/direct)".'>
        <div className="V2SplitStat">
          <div>
            <span>Total Calls Booked</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.totalCalls ?? 0}</strong>
          </div>
          <div>
            <span>Matched to sequence</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.matchedCalls ?? 0}</strong>
          </div>
          <div>
            <span>Manual/Direct</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.manualCalls ?? 0}</strong>
          </div>
          <div>
            <span>Not linked yet</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.unattributedCalls ?? 0}</strong>
          </div>
        </div>
      </V2Panel>

      {payload.provenance.sequenceBookedAttribution?.unattributedAuditRows && (
        <UnattributedAuditTable rows={payload.provenance.sequenceBookedAttribution.unattributedAuditRows} />
      )}
    </div>
  );
}
