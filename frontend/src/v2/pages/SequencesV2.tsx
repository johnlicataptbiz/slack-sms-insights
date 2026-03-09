import { type ReactNode, useMemo, useState } from 'react';

import {
  useV2SalesMetrics,
  useV2Scoreboard,
  useV2SequenceQualification,
} from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import { ReplyTimingPanel } from '../components/ReplyTimingPanel';
import { SkeletonDashboard } from '../components/Skeleton';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2AnimatedList, V2Sparkline } from '../components/V2Primitives';
import { SequencePerformanceTable, type MergedSeqRow } from '../components/SequencePerformanceTable';
import { CompliancePanel } from '../components/CompliancePanel';
import { TimingPanel } from '../components/TimingPanel';
import { BookingAttributionPanel } from '../components/BookingAttributionPanel';

const BUSINESS_TZ = 'America/Chicago';
const MANUAL_LABEL = 'No sequence (manual/direct)';
const NOT_CAPTURED_LABEL = 'Not Captured Yet';
const executiveSectionsStorageKey = 'v2_sequences_executive_sections_v1';
type ExecutiveSectionKey = 'leadMagnet' | 'attribution' | 'compliance' | 'timing';
type ExecutiveSectionState = Record<ExecutiveSectionKey, boolean>;
const defaultExecutiveSectionState: ExecutiveSectionState = {
  leadMagnet: false,
  attribution: false,
  compliance: false,
  timing: false,
};

type Mode = '7d' | '30d' | '90d' | '180d' | '365d';
// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();



const normalizeSequenceLabel = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

const EXPLICIT_AB_VERSION_PATTERN = /\b(?:version\s*([AB])|([AB])\s*version)\b/i;
const TRAILING_YEAR_VERSION_PATTERN = /\s*-\s*20\d{2}\s*v?\d+(?:\.\d+)*\s*$/i;
const TRAILING_GENERIC_VERSION_PATTERN = /\s*(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)\s*$/i;
const TRAILING_YEAR_PATTERN = /\s*-\s*20\d{2}\s*$/i;
const V2_PATTERN = /\bv2\b/i;
const LEGACY_PATTERN = /\blegacy\b/i;

const parseLeadMagnetAndVersionFallback = (label: string): { leadMagnet: string; version: string } => {
  const normalized = label.trim().replace(/\s+/g, ' ');
  const normalizedLower = normalized.toLowerCase();

  if (!normalized) {
    return { leadMagnet: NOT_CAPTURED_LABEL, version: '' };
  }

  const isManualSequence =
    normalizedLower === MANUAL_LABEL.toLowerCase() ||
    normalizedLower === 'manual' ||
    normalizedLower === 'manual/direct' ||
    normalizedLower.startsWith('no sequence');

  if (isManualSequence) {
    return { leadMagnet: MANUAL_LABEL, version: '' };
  }

  const abMatch = normalized.match(EXPLICIT_AB_VERSION_PATTERN);
  const abVersion = (abMatch?.[1] || abMatch?.[2] || '').toUpperCase();

  let base = normalized
    .replace(EXPLICIT_AB_VERSION_PATTERN, '')
    .replace(TRAILING_YEAR_VERSION_PATTERN, '')
    .replace(TRAILING_GENERIC_VERSION_PATTERN, '')
    .replace(TRAILING_YEAR_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) base = normalized;

  let version = '';
  if (abVersion) {
    version = `Version ${abVersion}`;
  } else if (LEGACY_PATTERN.test(normalized)) {
    version = 'Legacy';
    base = base.replace(LEGACY_PATTERN, '').replace(/\s+/g, ' ').trim();
  } else if (V2_PATTERN.test(normalized)) {
    version = 'V2';
    base = base.replace(V2_PATTERN, '').replace(/\s+/g, ' ').trim();
  } else if (TRAILING_YEAR_PATTERN.test(normalized) || TRAILING_YEAR_VERSION_PATTERN.test(normalized)) {
    version = 'Legacy';
  }

  return { leadMagnet: base || NOT_CAPTURED_LABEL, version };
};

const MODE_LABELS: Record<Mode, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '180d': 'Last 180 days',
  '365d': 'Last 365 days',
};

// ─── JSX Helpers ─────────────────────────────────────────────────────────────

function ExecutiveSection({
  id,
  title,
  meta,
  children,
  isOpen,
  onToggle,
}: {
  id: ExecutiveSectionKey;
  title: string;
  meta: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: (id: ExecutiveSectionKey, open: boolean) => void;
}) {
  return (
    <details
      className="V2ExecutiveSection"
      open={isOpen}
      onToggle={(event) => onToggle(id, event.currentTarget.open)}
    >
      <summary className="V2ExecutiveSection__summary">
        <div className="V2ExecutiveSection__titleWrap">
          <p className="V2ExecutiveSection__title">{title}</p>
          <p className="V2ExecutiveSection__meta">{meta}</p>
        </div>
        <span className="V2ExecutiveSection__chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="V2ExecutiveSection__body">{children}</div>
    </details>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────


// ─── Component ───────────────────────────────────────────────────────────────

export default function SequencesV2() {
  const [mode, setMode] = useState<Mode>('7d');
  const [executiveSections, setExecutiveSections] = useState<ExecutiveSectionState>(() => {
    if (typeof window === 'undefined') return defaultExecutiveSectionState;
    try {
      const raw = localStorage.getItem(executiveSectionsStorageKey);
      if (!raw) return defaultExecutiveSectionState;
      const parsed = JSON.parse(raw) as Partial<ExecutiveSectionState>;
      return {
        ...defaultExecutiveSectionState,
        ...parsed,
      };
    } catch {
      return defaultExecutiveSectionState;
    }
  });

  const salesMetricsQuery = useV2SalesMetrics({ range: mode, tz: BUSINESS_TZ });
  const scoreboardQuery = useV2Scoreboard({ tz: BUSINESS_TZ });
  const sequenceQualQuery = useV2SequenceQualification({ range: mode, tz: BUSINESS_TZ });

  const updateExecutiveSections = (next: ExecutiveSectionState) => {
    setExecutiveSections(next);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(executiveSectionsStorageKey, JSON.stringify(next));
    } catch {
      // noop
    }
  };

  const setExecutiveSectionOpen = (key: ExecutiveSectionKey, open: boolean) => {
    updateExecutiveSections({
      ...executiveSections,
      [key]: open,
    });
  };

  const setAllExecutiveSections = (open: boolean) => {
    updateExecutiveSections({
      leadMagnet: open,
      attribution: open,
      compliance: open,
      timing: open,
    });
  };

  // sequenceQualQuery is intentionally excluded from the main loading gate — it is a secondary
  // enrichment query that can be slow. The page renders with core data while qual loads separately.
  const isLoading = salesMetricsQuery.isLoading || scoreboardQuery.isLoading;
  const isError = salesMetricsQuery.isError || scoreboardQuery.isError;

  const salesMetrics = salesMetricsQuery.data?.data;
  const scoreboard = scoreboardQuery.data?.data;
  const trendByDay = salesMetrics?.trendByDay ?? [];

  // Build scoreboard lookup by label for metadata fields (leadMagnet/version).
  const scoreboardByLabel = useMemo(() => {
    const exact = new Map<string, NonNullable<typeof scoreboard>['sequences'][0]>();
    const normalized = new Map<string, NonNullable<typeof scoreboard>['sequences'][0]>();

    for (const seq of scoreboard?.sequences ?? []) {
      exact.set(seq.label, seq);
      normalized.set(normalizeSequenceLabel(seq.label), seq);
    }

    return { exact, normalized };
  }, [scoreboard?.sequences]);

  // Merge: numeric fields from sales-metrics (time-range consistent).
  // Scoreboard is used for window-independent metadata (lead magnet/version labels),
  // with local parsing fallback to avoid false "Not Captured Yet" buckets.
  const mergedRows = useMemo((): MergedSeqRow[] => {
    const smSeqs = salesMetrics?.sequences ?? [];
    return smSeqs.map((seq) => {
      const sb =
        scoreboardByLabel.exact.get(seq.label) ||
        scoreboardByLabel.normalized.get(normalizeSequenceLabel(seq.label));

      const fallback = parseLeadMagnetAndVersionFallback(seq.label);
      const resolvedLeadMagnet = sb?.leadMagnet?.trim() || fallback.leadMagnet || NOT_CAPTURED_LABEL;
      const resolvedVersion = sb?.version?.trim() || fallback.version || '';

      return {
        label: seq.label,
        leadMagnet: resolvedLeadMagnet,
        version: resolvedVersion,
        firstSeenAt: seq.firstSeenAt,
        messagesSent: seq.messagesSent,
        uniqueContacted: seq.uniqueContacted,
        repliesReceived: seq.repliesReceived,
        replyRatePct: seq.replyRatePct,
        canonicalBookedCalls: seq.canonicalBookedCalls,
        bookingRatePct: seq.bookingRatePct,
        canonicalBookedAfterSmsReply: seq.canonicalBookedAfterSmsReply,
        canonicalBookedJack: seq.canonicalBookedJack,
        canonicalBookedBrandon: seq.canonicalBookedBrandon,
        canonicalBookedSelf: seq.canonicalBookedSelf,
        optOuts: seq.optOuts,
        optOutRatePct: seq.optOutRatePct,
        bookedAuditRows: seq.bookedAuditRows,
        diagnosticSmsBookingSignals: seq.diagnosticSmsBookingSignals,
        isManual: seq.label === MANUAL_LABEL,
        uniqueReplied: sb?.uniqueReplied ?? 0,
        smsReplyPct:
          seq.canonicalBookedCalls > 0
            ? (seq.canonicalBookedAfterSmsReply / seq.canonicalBookedCalls) * 100
            : null,
      };
    });
  }, [salesMetrics?.sequences, scoreboardByLabel]);

  // KPI totals
  const kpis = useMemo(() => {
    const activeRows = mergedRows.filter((r) => !r.isManual && r.messagesSent > 0);
    const totalMessages = mergedRows.reduce((s, r) => s + r.messagesSent, 0);
    const totalReplied = mergedRows.reduce((s, r) => s + r.repliesReceived, 0);
    const totalBooked = mergedRows.reduce((s, r) => s + r.canonicalBookedCalls, 0);
    const totalBookedAfterSmsReply = mergedRows.reduce((s, r) => s + r.canonicalBookedAfterSmsReply, 0);
    const totalUniqueContacted = mergedRows.reduce((s, r) => s + r.uniqueContacted, 0);
    const avgReplyRate = totalMessages > 0 ? (totalReplied / totalMessages) * 100 : 0;
    const smsReplyBookingPct = totalBooked > 0 ? (totalBookedAfterSmsReply / totalBooked) * 100 : 0;
    return {
      activeSequences: activeRows.length,
      totalMessages,
      totalBooked,
      totalUniqueContacted,
      avgReplyRate,
      smsReplyBookingPct,
      // Channel split KPIs - use totals from salesMetrics to avoid double-counting
      sequenceMessagesSent: salesMetrics?.totals?.sequenceMessagesSent ?? 0,
      manualMessagesSent: salesMetrics?.totals?.manualMessagesSent ?? 0,
      sequenceReplyRatePct: salesMetrics?.totals?.sequenceReplyRatePct ?? 0,
      manualReplyRatePct: salesMetrics?.totals?.manualReplyRatePct ?? 0,
    };
  }, [mergedRows, salesMetrics]);

  const monthlyBookings = scoreboard?.monthly.bookings;
  const compliance = scoreboard?.compliance;
  const timing = scoreboard?.timing;

  if (isLoading) {
    return (
      <div className="V2Page">
        <SkeletonDashboard />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="V2Page">
        <V2State kind="error" onRetry={() => void salesMetricsQuery.refetch()}>
          Failed to load sequence data. Check your connection and try again.
        </V2State>
      </div>
    );
  }

  return (
    <div className="V2Page">
      {/* ── Header ── */}
      <V2PageHeader
        title="Sequences"
        subtitle={`Performance across all active sequences · ${MODE_LABELS[mode]}`}
        right={
          <div className="V2ControlsRow">
            <div className="V2ExecToggles">
              <button
                type="button"
                className="V2ExecToggles__btn"
                onClick={() => setAllExecutiveSections(true)}
              >
                Expand all
              </button>
              <button
                type="button"
                className="V2ExecToggles__btn"
                onClick={() => setAllExecutiveSections(false)}
              >
                Collapse all
              </button>
            </div>
            <div className="V2ModeToggle">
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '7d' ? ' is-active' : ''}`}
                onClick={() => setMode('7d')}
              >
                7d
              </button>
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '30d' ? ' is-active' : ''}`}
                onClick={() => setMode('30d')}
              >
                30d
              </button>
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '90d' ? ' is-active' : ''}`}
                onClick={() => setMode('90d')}
              >
                90d
              </button>
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '180d' ? ' is-active' : ''}`}
                onClick={() => setMode('180d')}
              >
                180d
              </button>
              <button
                type="button"
                className={`V2ModeToggle__btn${mode === '365d' ? ' is-active' : ''}`}
                onClick={() => setMode('365d')}
              >
                365d
              </button>
            </div>
          </div>
        }
      />

      {/* ── KPI Summary ── */}
      <V2AnimatedList className="V2MetricsGrid">
        <V2MetricCard
          label="Active Sequences"
          value={String(kpis.activeSequences)}
          meta={`${mode} window`}
        />
        <V2MetricCard
          label="Messages Sent"
          value={fmtInt(kpis.totalMessages)}
          meta="all sequences"
        />
        <V2MetricCard
          label="Unique Contacts"
          value={fmtInt(kpis.totalUniqueContacted)}
          meta={`${mode} window`}
        />
        <V2MetricCard
          label="Booked Calls"
          value={fmtInt(kpis.totalBooked)}
          tone={kpis.totalBooked > 0 ? 'positive' : 'default'}
          meta="Slack-verified bookings"
        />
        <V2MetricCard
          label="Avg Reply Rate"
          value={fmtPct(kpis.avgReplyRate)}
          tone={kpis.avgReplyRate >= 10 ? 'positive' : 'default'}
          meta="based on messages sent"
        />
        <V2MetricCard
          label="Booked via SMS Reply %"
          value={fmtPct(kpis.smsReplyBookingPct)}
          tone={kpis.smsReplyBookingPct >= 50 ? 'positive' : 'default'}
          meta="of bookings had a prior SMS reply"
        />
      </V2AnimatedList>

      {/* ── Channel Split KPIs ── */}
      {(kpis.sequenceMessagesSent > 0 || kpis.manualMessagesSent > 0) && (
        <V2AnimatedList className="V2MetricsGrid">
          <V2MetricCard
            label="Sequence Messages"
            value={fmtInt(kpis.sequenceMessagesSent)}
            meta={`${mode} window`}
          />
          <V2MetricCard
            label="Sequence Reply Rate"
            value={fmtPct(kpis.sequenceReplyRatePct)}
            tone={kpis.sequenceReplyRatePct >= 10 ? 'positive' : 'default'}
            meta="replies ÷ messages"
          />
          <V2MetricCard
            label="Manual Messages"
            value={fmtInt(kpis.manualMessagesSent)}
            meta={`${mode} window`}
          />
          <V2MetricCard
            label="Manual Reply Rate"
            value={fmtPct(kpis.manualReplyRatePct)}
            tone={kpis.manualReplyRatePct >= 10 ? 'positive' : 'default'}
            meta="replies ÷ messages"
          />
        </V2AnimatedList>
      )}

      {/* ── Trend Sparklines ── */}
      {trendByDay.length > 0 && (
        <V2Panel
          title="Trend Overview"
          caption={`Day-by-day performance · ${MODE_LABELS[mode]}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ width: '100px', fontSize: '0.85rem', color: 'var(--v2-text-dim)' }}>Messages</span>
              <V2Sparkline
                data={trendByDay.map((d) => d.messagesSent)}
                stroke="var(--v2-accent)"
                height={28}
              />
              <span style={{ width: '60px', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>
                {fmtInt(trendByDay.reduce((s, d) => s + d.messagesSent, 0))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ width: '100px', fontSize: '0.85rem', color: 'var(--v2-text-dim)' }}>Replies</span>
              <V2Sparkline
                data={trendByDay.map((d) => d.repliesReceived)}
                stroke="var(--v2-positive)"
                height={28}
              />
              <span style={{ width: '60px', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>
                {fmtInt(trendByDay.reduce((s, d) => s + d.repliesReceived, 0))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ width: '100px', fontSize: '0.85rem', color: 'var(--v2-text-dim)' }}>Bookings</span>
              <V2Sparkline
                data={trendByDay.map((d) => d.canonicalBookedCalls)}
                stroke="var(--v2-success)"
                height={28}
              />
              <span style={{ width: '60px', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>
                {fmtInt(trendByDay.reduce((s, d) => s + d.canonicalBookedCalls, 0))}
              </span>
            </div>
          </div>
        </V2Panel>
      )}

      {/* ── Reply Timing Insights ── */}
      <ReplyTimingPanel
        timing={timing}
        sequences={mergedRows.map(r => ({
          label: r.label,
          medianTimeToFirstReplyMinutes: r.medianTimeToFirstReplyMinutes,
          avgTimeToFirstReplyMinutes: r.avgTimeToFirstReplyMinutes,
        }))}
      />

      {/* ── Sequence Qualification Breakdown ── */}
      <V2Panel
        title="Lead Qualification by Sequence"
        caption={`Self-identified lead attributes from qualification inference · ${mode} window`}
      >
        <SequenceQualificationBreakdown
          items={sequenceQualQuery.data?.data?.items ?? []}
          isLoading={sequenceQualQuery.isLoading}
        />
      </V2Panel>

      {/* ── Sequence Performance: Redesigned ── */}
      <SequencePerformanceTable 
        mergedRows={mergedRows} 
        modeLabel={MODE_LABELS[mode]} 
        unattributedAuditRows={salesMetrics?.provenance.sequenceBookedAttribution?.unattributedAuditRows}
      />

      {/* ── Booking Attribution ── */}
      {(salesMetrics?.bookedCredit || monthlyBookings) && (
        <ExecutiveSection
          id="attribution"
          title="Booking Attribution"
          meta={`Expanded analysis panel · rep split: ${MODE_LABELS[mode]} window`}
          isOpen={executiveSections.attribution}
          onToggle={setExecutiveSectionOpen}
        >
          <BookingAttributionPanel
            bookedCredit={salesMetrics?.bookedCredit}
            attribution={salesMetrics?.provenance.sequenceBookedAttribution}
            modeLabel={MODE_LABELS[mode]}
            mode={mode}
          />
        </ExecutiveSection>
      )}

      {/* ── Compliance Panel ── */}
      {compliance && (
        <ExecutiveSection
          id="compliance"
          title="Opt-Out Health"
          meta="Expanded analysis panel · weekly window"
          isOpen={executiveSections.compliance}
          onToggle={setExecutiveSectionOpen}
        >
          <CompliancePanel compliance={compliance} />
        </ExecutiveSection>
      )}

      {/* ── Timing Panel ── */}
      {timing && (
        <ExecutiveSection
          id="timing"
          title="Reply Timing"
          meta="Expanded analysis panel · weekly window"
          isOpen={executiveSections.timing}
          onToggle={setExecutiveSectionOpen}
        >
          <TimingPanel timing={timing} />
        </ExecutiveSection>
      )}
    </div>
  );
}
