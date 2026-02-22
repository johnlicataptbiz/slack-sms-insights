import { useMemo } from 'react';

import { useV2SalesMetrics } from '../../api/v2Queries';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../../utils/runDay';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2Term } from '../components/V2Primitives';

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
        title="Attribution Deep Dive"
        subtitle="This page explains what we count and why (manual vs sequence), plus how we credit replies and booked calls."
      />

      <section className="V2MetricsGrid">
        <V2MetricCard label={<V2Term term="callsBookedSlack" />} value={payload.bookedCredit.total.toLocaleString()} tone="positive" />
        <V2MetricCard label={<V2Term term="smsBookingHintsDiagnostic" />} value={diagnosticSignals.toLocaleString()} tone="accent" />
        <V2MetricCard label="Overall Reply Rate (People)" value={`${payload.totals.replyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="manualReplyRate" />} value={`${payload.totals.manualReplyRatePct.toFixed(1)}%`} />
        <V2MetricCard label={<V2Term term="sequenceReplyRate" />} value={`${payload.totals.sequenceReplyRatePct.toFixed(1)}%`} />
      </section>

      <div className="V2Grid V2Grid--2">
        <V2Panel title="Canonical Layer (Slack)" caption="This drives KPI decisions and setter credit.">
          <ul className="V2BulletList">
            <li>Source: Slack booked-call channel + reaction-based credit routing.</li>
            <li>This is the KPI used in manager decisions, scorecards, and weekly reviews.</li>
            <li>Day-by-day trend uses this same canonical booked-call count.</li>
          </ul>
        </V2Panel>

        <V2Panel title="Diagnostic Layer (SMS Hints)" caption="Useful for QA and signal detection, not canonical KPI accounting.">
          <ul className="V2BulletList">
            <li>Source: SMS body heuristics.</li>
            <li>Used to coach messaging quality and catch conversion signals early.</li>
            <li>Never mixed into booked-call totals in v2 schema.</li>
          </ul>
        </V2Panel>
      </div>

      <V2Panel title="Coverage" caption='How many booked calls were matched to a sequence label vs "No sequence (manual/direct)".'>
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
    </div>
  );
}
