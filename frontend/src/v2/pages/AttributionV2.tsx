import { useMemo } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../../utils/runDay';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';
import { v2Copy } from '../copy';
import { UnattributedAuditTable } from '../components/UnattributedAuditTable';

const BUSINESS_TZ = 'America/Chicago';

export default function AttributionV2() {
  const business = useMemo(() => resolveCurrentBusinessDay({ timeZone: BUSINESS_TZ, startHour: 4 }), []);
  const day = useMemo(() => (business ? shiftIsoDay(business.day, -1) : null), [business]);

  const { data, isLoading, isError, error } = useV2SalesMetrics(day ? { day, tz: BUSINESS_TZ } : { range: 'today', tz: BUSINESS_TZ });
  const payload = data?.data;

  if (isLoading) return <V2State kind="loading">Loading attribution deep dive…</V2State>;
  if (isError || !payload) {
    return <V2State kind="error">Failed to load attribution: {String((error as Error)?.message || error)}</V2State>;
  }

  const diagnosticSignals = payload.sequences.reduce((sum, row) => sum + row.diagnosticSmsBookingSignals, 0);

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.attribution}
        subtitle="See where your booked calls are coming from."
      />

      <section className="V2MetricsGrid">
        <V2MetricCard label={<V2Term term="callsBookedSlack" />} value={payload.bookedCredit.total.toLocaleString()} tone="positive" />
        <V2MetricCard label={<V2Term term="smsBookingHintsDiagnostic" />} value={diagnosticSignals.toLocaleString()} tone="accent" />
        <V2MetricCard label="Overall Reply Rate (People)" value={`${payload.totals.replyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="manualReplyRate" />} value={`${payload.totals.manualReplyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="sequenceReplyRate" />} value={`${payload.totals.sequenceReplyRatePct.toFixed(1)}%`} />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Booked Calls Source (Slack)" caption="This is the booked-call KPI and setter credit source.">
          <ul className="V2BulletList">
            <li>Source: Slack booked-call channel + reaction-based credit routing.</li>
            <li>This is the KPI used in scorecards and weekly reviews.</li>
            <li>Day-by-day trend uses this same canonical booked-call count.</li>
          </ul>
        </V2Panel>

        <V2Panel title="SMS Hint Signals (Support View)" caption="Useful for QA and early signal checks, not booked-call KPI totals.">
          <ul className="V2BulletList">
            <li>Source: SMS body heuristics.</li>
            <li>Used to coach messaging quality and catch conversion signals early.</li>
            <li>Not included in booked-call totals in v2.</li>
          </ul>
        </V2Panel>
      </div>

      <V2Panel title="Coverage" caption='How many booked calls matched a sequence label vs "No sequence (manual/direct)".'>
        <div className="V2SplitStat">
          <div>
            <span>Total Calls Booked</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.totalCalls ?? 0}</strong>
          </div>
          <div>
            <span>Matched</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.matchedCalls ?? 0}</strong>
          </div>
          <div>
            <span>Manual/Direct</span>
            <strong>{payload.provenance.sequenceBookedAttribution?.manualCalls ?? 0}</strong>
          </div>
          <div>
            <span>Unattributed</span>
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
