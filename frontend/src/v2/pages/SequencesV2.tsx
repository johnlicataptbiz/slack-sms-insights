import { type ReactNode, useMemo, useState } from 'react';

import {
  useV2SalesMetrics,
  useV2Scoreboard,
  useV2SequenceQualification,
} from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import type { SalesMetricsV2 } from '../../api/v2-types';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2AnimatedList, V2Sparkline } from '../components/V2Primitives';

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

const fmtMins = (n: number | null): string => {
  if (n === null) return '—';
  if (n < 60) return `${Math.round(n)}m`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};


/**
 * Extract a display version string (e.g. "v1.2") from a sequence label.
 * Used in the Version column so we show the actual version number instead of
 * the internal "Legacy" classification tag.
 */
const extractVersionDisplay = (label: string): string => {
  const match = label.match(/\b(v\d+(?:\.\d+)+)\b/i);
  return match?.[1] ?? '';
};

const normalizeSequenceLabel = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

const EXPLICIT_AB_VERSION_PATTERN = /\b(?:version\s*([AB])|([AB])\s*version)\b/i;
const TRAILING_YEAR_VERSION_PATTERN = /\s*-\s*20\d{2}\s*v?\d+(?:\.\d+)*\s*$/i;
const TRAILING_GENERIC_VERSION_PATTERN = /\s*v?\d+(?:\.\d+){1,}\s*$/i;
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

type AuditRow = SalesMetricsV2['sequences'][0]['bookedAuditRows'][0];

type MergedSeqRow = {
  label: string;
  leadMagnet: string;
  // metadata from scoreboard (window-independent)
  version: string;
  // all numeric fields from sales-metrics (respects mode toggle)
  firstSeenAt: string | null;
  messagesSent: number;
  uniqueContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  bookingRatePct: number;
  canonicalBookedAfterSmsReply: number;
  canonicalBookedJack: number;
  canonicalBookedBrandon: number;
  canonicalBookedSelf: number;
  optOuts: number;
  optOutRatePct: number;
  bookedAuditRows: AuditRow[];
  diagnosticSmsBookingSignals: number;
  isManual: boolean;
  // from scoreboard metadata
  uniqueReplied: number;
  // pre-computed derived fields
  smsReplyPct: number | null;
};

const parseVersionParts = (value: string): number[] | null => {
  const match = value.toLowerCase().match(/v(\d+(?:\.\d+)*)/);
  if (!match) return null;
  const raw = match[1] ?? '';
  if (!raw) return null;
  const parts = raw
    .split('.')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  return parts.length > 0 ? parts : null;
};

const compareVersionParts = (a: number[] | null, b: number[] | null): number => {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
};

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

  // Group sequences by lead magnet family
  const sequencesByFamily = useMemo(() => {
    return mergedRows
      .filter(r => !r.isManual)
      .reduce((acc, row) => {
        const family = row.leadMagnet || NOT_CAPTURED_LABEL;
        if (!acc[family]) {
          acc[family] = [];
        }
        acc[family].push(row);
        return acc;
      }, {} as Record<string, MergedSeqRow[]>);
  }, [mergedRows]);

  const familyEntries = Object.entries(sequencesByFamily);
  const activeSequenceCount = mergedRows.filter(r => !r.isManual).length;
  const uniqueFamilyCount = new Set(mergedRows.map(r => r.leadMagnet || NOT_CAPTURED_LABEL)).size;

  const monthlyBookings = scoreboard?.monthly.bookings;
  const compliance = scoreboard?.compliance;
  const timing = scoreboard?.timing;

  if (isLoading) {
    return (
      <div className="V2Page">
        <V2State kind="loading">Loading sequences…</V2State>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="V2Page">
        <V2State kind="error">Failed to load sequence data. Check your connection and try again.</V2State>
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
      {activeSequenceCount === 0 ? (
        <V2Panel
          title="Sequence Performance"
          caption={`${MODE_LABELS[mode]} · Booked = Slack-verified`}
        >
          <V2State kind="empty">No sequence data for this window.</V2State>
        </V2Panel>
      ) : (
        <V2Panel
          title="Sequence Performance"
          caption={`${activeSequenceCount} sequences across ${uniqueFamilyCount} lead magnets · ${MODE_LABELS[mode]} · Booked = Slack-verified`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {familyEntries.map(([family, familyRows]) => {
              const sortedVersions = [...familyRows].sort((a, b) => {
                const aVer = parseVersionParts(extractVersionDisplay(a.label) || a.version);
                const bVer = parseVersionParts(extractVersionDisplay(b.label) || b.version);
                return compareVersionParts(bVer, aVer);
              });
              
              const totalContacts = familyRows.reduce((s, r) => s + r.uniqueContacted, 0);
              const totalReplied = familyRows.reduce((s, r) => s + r.repliesReceived, 0);
              const totalBooked = familyRows.reduce((s, r) => s + r.canonicalBookedCalls, 0);
              const totalSent = familyRows.reduce((s, r) => s + r.messagesSent, 0);
              const avgReplyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
              const avgBookingRate = totalContacts > 0 ? (totalBooked / totalContacts) * 100 : 0;
              const hasMultipleVersions = familyRows.length > 1;
              const isHighConfidence = totalContacts >= 200 || totalSent >= 400;
              const confidenceLevel = isHighConfidence ? 'high' : totalContacts >= 75 || totalSent >= 150 ? 'medium' : 'low';

              return (
                <div key={family} style={{ 
                  border: '1px solid var(--v2-border)', 
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: 'var(--v2-bg)'
                }}>
                  {/* Family Header - Aggregate Stats */}
                  <div style={{ 
                    background: 'var(--v2-bg-subtle)', 
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--v2-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--v2-text)' }}>{family}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--v2-text-dim)' }}>
                        {familyRows.length} version{familyRows.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      {/* Reply Rate */}
                      <div style={{ textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ 
                          fontSize: '1.35rem', 
                          fontWeight: 700, 
                          color: avgReplyRate >= 10 ? 'var(--v2-positive)' : avgReplyRate < 5 ? 'var(--v2-warning)' : 'var(--v2-accent)' 
                        }}>
                          {fmtPct(avgReplyRate)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Reply Rate
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                          {fmtInt(totalReplied)}/{fmtInt(totalSent)} sent
                        </div>
                      </div>

                      {/* Booking Rate */}
                      <div style={{ textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ 
                          fontSize: '1.35rem', 
                          fontWeight: 700, 
                          color: avgBookingRate >= 2 ? 'var(--v2-positive)' : 'var(--v2-text)' 
                        }}>
                          {fmtPct(avgBookingRate)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Booking Rate
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                          {fmtInt(totalBooked)}/{fmtInt(totalContacts)} contacts
                        </div>
                      </div>

                      {/* Confidence Badge */}
                      <div style={{ textAlign: 'center' }}>
                        <span className={`V2Badge ${confidenceLevel === 'high' ? 'V2Badge--confidenceHigh' : confidenceLevel === 'medium' ? 'V2Badge--confidenceMed' : 'V2Badge--confidenceLow'}`}>
                          {confidenceLevel === 'high' ? 'High confidence' : confidenceLevel === 'medium' ? 'Medium' : 'Low sample'}
                        </span>
                        <div style={{ fontSize: '0.6rem', color: 'var(--v2-text-dim)', marginTop: '2px' }}>
                          {confidenceLevel === 'high' ? '200+ contacts' : confidenceLevel === 'medium' ? '75+ contacts' : 'small dataset'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Version Rows */}
                  <div>
                    {sortedVersions.map((row, idx) => {
                      const replyRate = row.messagesSent > 0 ? (row.repliesReceived / row.messagesSent) * 100 : 0;
                      const bookingRate = row.uniqueContacted > 0 ? (row.canonicalBookedCalls / row.uniqueContacted) * 100 : 0;
                      const versionLabel = extractVersionDisplay(row.label) || row.version || 'Legacy';
                      const isWinning = hasMultipleVersions && idx === 0;
                      return (
                        <div
                          key={row.label}
                          style={{
                            padding: '0.75rem 1.25rem',
                            borderBottom: idx < sortedVersions.length - 1 ? '1px solid var(--v2-border)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            background: isWinning ? 'rgba(34, 197, 94, 0.04)' : undefined,
                          }}
                        >
                          {/* Version & Volume Info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '180px' }}>
                            <span className="V2Badge V2Badge--version" style={{ fontSize: '0.8rem' }}>
                              {versionLabel}
                            </span>
                            {isWinning && (
                              <span className="V2Badge" style={{ background: 'var(--v2-positive)', color: 'white', fontSize: '0.7rem' }}>
                                TOP
                              </span>
                            )}
                            <span style={{ fontSize: '0.8rem', color: 'var(--v2-text-dim)' }}>
                              {fmtInt(row.messagesSent)} sent
                            </span>
                          </div>

                          {/* Metrics */}
                          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                            {/* Reply */}
                            <div style={{ minWidth: '70px' }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: replyRate >= 10 ? 'var(--v2-positive)' : replyRate < 5 ? 'var(--v2-warning)' : 'var(--v2-accent)' }}>
                                {fmtPct(replyRate)}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                                {fmtInt(row.repliesReceived)} replies
                              </div>
                            </div>

                            {/* Booking */}
                            <div style={{ minWidth: '70px' }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: bookingRate >= 2 ? 'var(--v2-positive)' : 'var(--v2-text)' }}>
                                {fmtPct(bookingRate)}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                                {fmtInt(row.canonicalBookedCalls)} booked
                              </div>
                            </div>

                            {/* Rep Attribution */}
                            <div style={{ minWidth: '80px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              {row.canonicalBookedJack > 0 && (
                                <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                                  J:{row.canonicalBookedJack}
                                </span>
                              )}
                              {row.canonicalBookedBrandon > 0 && (
                                <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                                  B:{row.canonicalBookedBrandon}
                                </span>
                              )}
                              {row.canonicalBookedSelf > 0 && (
                                <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                                  S:{row.canonicalBookedSelf}
                                </span>
                              )}
                              {row.canonicalBookedCalls === 0 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)' }}>—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </V2Panel>
      )}

      {/* ── Booking Attribution ── */}
      {(salesMetrics?.bookedCredit || monthlyBookings) && (
        <ExecutiveSection
          id="attribution"
          title="Booking Attribution"
          meta={`Expanded analysis panel · rep split: ${MODE_LABELS[mode]} window`}
          isOpen={executiveSections.attribution}
          onToggle={setExecutiveSectionOpen}
        >
          {salesMetrics?.bookedCredit && (
            <V2Panel
              title={`Booking Attribution — ${MODE_LABELS[mode]}`}
              caption={`Rep split for the selected ${mode} window · Booked = Slack-verified`}
            >
              <div className="V2SeqAttribution">
                <div className="V2SeqAttribution__grid">
                  <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                    <span className="V2SeqAttribution__label">Total Booked</span>
                    <span className="V2SeqAttribution__value">{fmtInt(salesMetrics.bookedCredit.total)}</span>
                  </div>
                  <div className="V2SeqAttribution__item">
                    <span className="V2SeqAttribution__label">Jack</span>
                    <span className="V2SeqAttribution__value">{fmtInt(salesMetrics.bookedCredit.jack)}</span>
                  </div>
                  <div className="V2SeqAttribution__item">
                    <span className="V2SeqAttribution__label">Brandon</span>
                    <span className="V2SeqAttribution__value">{fmtInt(salesMetrics.bookedCredit.brandon)}</span>
                  </div>
                  <div className="V2SeqAttribution__item">
                    <span className="V2SeqAttribution__label">Self-Booked</span>
                    <span className="V2SeqAttribution__value">{fmtInt(salesMetrics.bookedCredit.selfBooked)}</span>
                  </div>
                </div>
                <p className="V2SeqAttribution__note">
                  Rep split reflects the selected {mode} rolling window. Booked = Slack-verified bookings channel.
                </p>
              </div>
            </V2Panel>
          )}
          {monthlyBookings && (
            <V2Panel
              title="Channel Attribution — Monthly"
              caption="Sequence-initiated vs direct outreach · always monthly scoreboard window (channel split not available per rolling window)"
            >
              <div className="V2SeqAttribution">
                <div className="V2SeqAttribution__grid">
                  <div className="V2SeqAttribution__item V2SeqAttribution__item--highlight">
                    <span className="V2SeqAttribution__label">From Sequences</span>
                    <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.sequenceInitiated)}</span>
                  </div>
                  <div className="V2SeqAttribution__item">
                    <span className="V2SeqAttribution__label">From Direct Outreach</span>
                    <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.manualInitiated)}</span>
                  </div>
                  <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                    <span className="V2SeqAttribution__label">Total (month)</span>
                    <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.total)}</span>
                  </div>
                </div>
                <p className="V2SeqAttribution__note">
                  A sequence gets credit when it started the first outbound contact with a lead, even if manual follow-ups came before the booking.
                </p>
              </div>
            </V2Panel>
          )}
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
          <V2Panel
            title="Opt-Out Health"
            caption="Opt-out rates and top opt-out sequences · weekly window"
          >
            <div className="V2SeqCompliance">
              <div className="V2SeqCompliance__rates">
                <div className="V2SeqCompliance__rate">
                  <span className="V2SeqCompliance__rateLabel">Weekly Opt-Out Rate</span>
                  <span
                    className={`V2SeqCompliance__rateValue${compliance.optOutRateWeeklyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
                  >
                    {fmtPct(compliance.optOutRateWeeklyPct)}
                  </span>
                </div>
                <div className="V2SeqCompliance__rate">
                  <span className="V2SeqCompliance__rateLabel">Monthly Opt-Out Rate</span>
                  <span
                    className={`V2SeqCompliance__rateValue${compliance.optOutRateMonthlyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
                  >
                    {fmtPct(compliance.optOutRateMonthlyPct)}
                  </span>
                </div>
              </div>
              {compliance.topOptOutSequences.length > 0 && (
                <div className="V2SeqCompliance__topList">
                  <p className="V2SeqCompliance__topTitle">Highest Opt-Out Sequences</p>
                  <div className="V2TableWrap">
                    <table className="V2Table">
                      <thead>
                        <tr>
                          <th>Sequence</th>
                          <th className="is-right">Opt-Outs</th>
                          <th className="is-right">Opt-Out Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compliance.topOptOutSequences.map((seq) => (
                          <tr key={seq.label}>
                            <td>{seq.label}</td>
                            <td className="is-right">{fmtInt(seq.optOuts)}</td>
                            <td className={`is-right${seq.optOutRatePct >= 5 ? ' V2Table__cell--warn' : ''}`}>
                              {fmtPct(seq.optOutRatePct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </V2Panel>
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
          <V2Panel
            title="Reply Timing"
            caption="Median time to first reply and reply rate by day of week · weekly window"
          >
            <div className="V2SeqTiming">
              {timing.medianTimeToFirstReplyMinutes !== null && (
                <div className="V2SeqTiming__median">
                  <span className="V2SeqTiming__medianLabel">Median Time to First Reply</span>
                  <span className="V2SeqTiming__medianValue">
                    {fmtMins(timing.medianTimeToFirstReplyMinutes)}
                  </span>
                </div>
              )}
              {timing.replyRateByDayOfWeek.length > 0 && (
                <div className="V2SeqTiming__chart">
                  <p className="V2SeqTiming__chartTitle">Reply Rate by Day of Week</p>
                  {timing.replyRateByDayOfWeek.map((day) => {
                    const barPct = Math.min(day.replyRatePct, 100);
                    return (
                      <div key={day.dayOfWeek} className="V2SeqTiming__row">
                        <span className="V2SeqTiming__day">{day.dayOfWeek}</span>
                        <div className="V2SeqTiming__barWrap">
                          <div
                            className="V2SeqTiming__bar"
                            style={{ width: `${barPct}%` }}
                            title={`${fmtPct(day.replyRatePct)} reply rate · ${fmtInt(day.outboundCount)} sent · ${fmtInt(day.replyCount)} replied`}
                          />
                        </div>
                        <span className="V2SeqTiming__pct">{fmtPct(day.replyRatePct)}</span>
                        <span className="V2SeqTiming__vol">{fmtInt(day.outboundCount)} sent</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </V2Panel>
        </ExecutiveSection>
      )}
    </div>
  );
}
