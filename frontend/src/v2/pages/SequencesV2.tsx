import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ColumnDef, ColumnPinningState, VisibilityState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import DiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

import {
  useV2SalesMetrics,
  useV2Scoreboard,
  useV2SequenceQualification,
  useV2SequenceVersionHistory,
  useV2UpdateSequenceVersionDecision,
} from '../../api/v2Queries';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import type { SalesMetricsV2, SequenceVersionHistoryRowV2 } from '../../api/v2-types';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2AnimatedList, V2ProgressBar } from '../components/V2Primitives';
import { useToast } from '../hooks/useToast';

const BUSINESS_TZ = 'America/Chicago';
const MANUAL_LABEL = 'No sequence (manual/direct)';
const NOT_CAPTURED_LABEL = 'Not Captured Yet';
const WINNER_MIN_SENDS = 100;
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
type Sort =
  | 'version'
  | 'messagesSent'
  | 'replyRatePct'
  | 'canonicalBookedCalls'
  | 'optOutRatePct'
  | 'uniqueContacted'
  | 'bookingRatePct';

type ColumnId =
  | 'label'
  | 'version'
  | 'firstSeenAt'
  | 'messagesSent'
  | 'uniqueContacted'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'canonicalBookedCalls'
  | 'bookingRatePct'
  | 'optOutRatePct'
  | 'optOuts'
  | 'expand';

// ─── SMS Reply Reason Labels ─────────────────────────────────────────────────

const SMS_REPLY_REASON_LABELS: Record<string, string> = {
  matched_reply_before_booking: 'SMS reply matched before booking',
  no_contact_phone: 'No contact phone on file',
  no_reply_before_booking: 'No SMS reply before booking',
  invalid_booking_timestamp: 'Invalid booking timestamp',
};

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

const shorten = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${lastSpace > max * 0.7 ? truncated.slice(0, lastSpace) : truncated}…`;
};

const fmtSignedInt = (n: number): string => {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : ''}${fmtInt(n)}`;
};

const fmtSignedPctPoints = (n: number): string => {
  if (n === 0) return '0.0 pp';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`;
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

const fmtDay = (iso: string | null) => {
  if (!iso) return '—';
  const value = iso.trim();
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const utcDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return utcDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (value: string | null): string => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const maskPhone = (value: string | null) => {
  if (!value) return 'n/a';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return value;
  return `***${digits.slice(-4)}`;
};

const BUCKET_LABELS: Record<'jack' | 'brandon' | 'selfBooked', string> = {
  jack: 'Jack',
  brandon: 'Brandon',
  selfBooked: 'Self-booked',
};
const labelSorter = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const MODE_LABELS: Record<Mode, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '180d': 'Last 180 days',
  '365d': 'Last 365 days',
};

// ─── JSX Helpers ─────────────────────────────────────────────────────────────

const renderVersion = (label: string, version: string): React.ReactNode => {
  const vDisplay = extractVersionDisplay(label);
  if (vDisplay) return <span className="V2Badge V2Badge--version">{vDisplay}</span>;
  if (version && version !== 'Legacy') return <span className="V2Badge V2Badge--version">{version}</span>;
  return <span className="V2Table__dim">—</span>;
};

const toAuditId = (label: string) =>
  `audit-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

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
  // all numeric fields exclusively from sales-metrics (respects mode toggle)
  firstSeenAt: string | null;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  canonicalBookedAfterSmsReply: number;
  canonicalBookedJack: number;
  canonicalBookedBrandon: number;
  canonicalBookedSelf: number;
  optOuts: number;
  optOutRatePct: number;
  bookedAuditRows: AuditRow[];
  diagnosticSmsBookingSignals: number;
  isManual: boolean;
  // from scoreboard (weekly window — metadata only, noted in UI)
  uniqueContacted: number;
  uniqueReplied: number;
  bookingRatePct: number;
  // pre-computed derived fields
  smsReplyPct: number | null;
};

type VersionDiffContext = {
  previous: MergedSeqRow | null;
  currentCanonicalBody: string | null;
  previousCanonicalBody: string | null;
  usingVariantPair: boolean;
};

type VersionTimelineItem = {
  label: string;
  versionLabel: string;
  status: 'active' | 'testing' | 'rewrite' | 'archived';
  firstSeenAt: string | null;
  messagesSent: number;
  replyRatePct: number;
  bookedCalls: number;
  bookingRatePct: number;
  isCurrent: boolean;
  isWinner: boolean;
  winnerLowConfidence: boolean;
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

const toVersionSortKey = (row: MergedSeqRow): number[] | null => {
  return parseVersionParts(extractVersionDisplay(row.label) || row.version);
};

const toSequenceFamily = (row: Pick<MergedSeqRow, 'label' | 'leadMagnet' | 'isManual'>): string => {
  if (row.isManual) return MANUAL_LABEL;
  const cleaned = row.label
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\bv\d+(?:\.\d+)+\b/gi, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 0) return cleaned;
  return row.leadMagnet || NOT_CAPTURED_LABEL;
};

const getTopBodyVariants = (row: SequenceVersionHistoryRowV2 | null | undefined): string[] => {
  if (!row) return [];
  const candidates = [row.canonicalBody, ...(row.sampleBodies || [])]
    .map((value) => (value || '').trim())
    .filter((value) => value.length > 0);
  const unique: string[] = [];
  for (const value of candidates) {
    if (!unique.includes(value)) unique.push(value);
    if (unique.length >= 2) break;
  }
  return unique;
};

const pickDiffPair = (
  previousVariants: string[],
  currentVariants: string[],
): { previous: string | null; current: string | null; usingVariantPair: boolean } => {
  const prev0 = previousVariants[0] || null;
  const curr0 = currentVariants[0] || null;
  if (!prev0 || !curr0) {
    return { previous: prev0, current: curr0, usingVariantPair: false };
  }

  if (prev0 !== curr0) {
    return { previous: prev0, current: curr0, usingVariantPair: false };
  }

  const variantCandidates: Array<[string | null, string | null]> = [
    [prev0, currentVariants[1] || null],
    [previousVariants[1] || null, curr0],
    [previousVariants[1] || null, currentVariants[1] || null],
  ];

  for (const [prev, curr] of variantCandidates) {
    if (prev && curr && prev !== curr) {
      return { previous: prev, current: curr, usingVariantPair: true };
    }
  }

  return { previous: prev0, current: curr0, usingVariantPair: false };
};

export const computeSequenceHeaderMetrics = (
  payload: SalesMetricsV2,
  sequenceRows: SalesMetricsV2['sequences'],
) => {
  const totalBookedAllChannels = payload.totals.canonicalBookedCalls;
  const totalBookedAttributedToRows = sequenceRows.reduce((sum, row) => sum + row.canonicalBookedCalls, 0);
  const attribution = payload.provenance.sequenceBookedAttribution;
  const unattributedCalls =
    attribution?.unattributedCalls ?? Math.max(0, totalBookedAllChannels - totalBookedAttributedToRows);
  const totalBookedAfterReply =
    attribution?.strictSmsReplyLinkedCalls ??
    sequenceRows.reduce((sum, row) => sum + row.canonicalBookedAfterSmsReply, 0);
  const totalBookedNonSmsOrUnknown =
    attribution?.nonSmsOrUnknownCalls ?? Math.max(0, totalBookedAllChannels - totalBookedAfterReply);

  return {
    totalBookedAllChannels,
    totalBookedAttributedToRows,
    unattributedCalls,
    totalBookedAfterReply,
    totalBookedNonSmsOrUnknown,
  };
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SequencesV2() {
  const [mode, setMode] = useState<Mode>('7d');
  const [sort, setSort] = useState<Sort>('version');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [showManualRow, setShowManualRow] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    firstSeenAt: false,
    uniqueContacted: false,
    bookingRatePct: false,
  });
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: ['label'],
    right: ['expand'],
  });
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
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());
  const [decisionPendingLabel, setDecisionPendingLabel] = useState<string | null>(null);
  const toast = useToast();

  const salesMetricsQuery = useV2SalesMetrics({ range: mode, tz: BUSINESS_TZ });
  const scoreboardQuery = useV2Scoreboard({ tz: BUSINESS_TZ });
  const sequenceQualQuery = useV2SequenceQualification({ range: mode, tz: BUSINESS_TZ });
  const sequenceVersionHistoryQuery = useV2SequenceVersionHistory({ lookbackDays: 365 });
  const updateSequenceDecisionMutation = useV2UpdateSequenceVersionDecision();

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

  const isLoading = salesMetricsQuery.isLoading || scoreboardQuery.isLoading || sequenceQualQuery.isLoading;
  const isError = salesMetricsQuery.isError || scoreboardQuery.isError || sequenceQualQuery.isError;

  const salesMetrics = salesMetricsQuery.data?.data;
  const scoreboard = scoreboardQuery.data?.data;
  const versionHistory = sequenceVersionHistoryQuery.data?.data?.items ?? [];

  const versionHistoryByLabel = useMemo(() => {
    const map = new Map<string, SequenceVersionHistoryRowV2>();
    for (const row of versionHistory) {
      map.set(row.label, row);
    }
    return map;
  }, [versionHistory]);

  const updateSequenceStatus = async (
    label: string,
    status: 'active' | 'testing' | 'rewrite' | 'archived',
  ) => {
    try {
      setDecisionPendingLabel(label);
      await updateSequenceDecisionMutation.mutateAsync({
        label,
        status,
        updatedBy: 'dashboard',
      });
      toast.success(`Updated ${label} to ${status}.`, { duration: 2200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update version status';
      toast.error(message, { duration: 2800 });
    } finally {
      setDecisionPendingLabel(null);
    }
  };

  // Build scoreboard lookup by label for leadMagnet / version / uniqueContacted / bookingRatePct
  const scoreboardByLabel = useMemo(() => {
    const map = new Map<string, NonNullable<typeof scoreboard>['sequences'][0]>();
    for (const seq of scoreboard?.sequences ?? []) {
      map.set(seq.label, seq);
    }
    return map;
  }, [scoreboard?.sequences]);

  // Merge: numeric fields exclusively from sales-metrics (time-range consistent).
  // Scoreboard used only for window-independent metadata: version, uniqueContacted, uniqueReplied, bookingRatePct.
  const mergedRows = useMemo((): MergedSeqRow[] => {
    const smSeqs = salesMetrics?.sequences ?? [];
    return smSeqs.map((seq) => {
      const sb = scoreboardByLabel.get(seq.label);
      return {
        label: seq.label,
        leadMagnet: sb?.leadMagnet ?? NOT_CAPTURED_LABEL,
        version: sb?.version ?? '',
        firstSeenAt: seq.firstSeenAt,
        messagesSent: seq.messagesSent,
        repliesReceived: seq.repliesReceived,
        replyRatePct: seq.replyRatePct,
        canonicalBookedCalls: seq.canonicalBookedCalls,
        canonicalBookedAfterSmsReply: seq.canonicalBookedAfterSmsReply,
        canonicalBookedJack: seq.canonicalBookedJack,
        canonicalBookedBrandon: seq.canonicalBookedBrandon,
        canonicalBookedSelf: seq.canonicalBookedSelf,
        optOuts: seq.optOuts,
        optOutRatePct: seq.optOutRatePct,
        bookedAuditRows: seq.bookedAuditRows,
        diagnosticSmsBookingSignals: seq.diagnosticSmsBookingSignals,
        isManual: seq.label === MANUAL_LABEL,
        uniqueContacted: sb?.uniqueContacted ?? 0,
        uniqueReplied: sb?.uniqueReplied ?? 0,
        bookingRatePct: sb?.bookingRatePct ?? 0,
        smsReplyPct:
          seq.canonicalBookedCalls > 0
            ? (seq.canonicalBookedAfterSmsReply / seq.canonicalBookedCalls) * 100
            : null,
      };
    });
  }, [salesMetrics?.sequences, scoreboardByLabel]);

  const versionDiffByLabel = useMemo(() => {
    const grouped = new Map<string, MergedSeqRow[]>();
    for (const row of mergedRows) {
      const key = row.leadMagnet || NOT_CAPTURED_LABEL;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    const result = new Map<string, VersionDiffContext>();
    for (const rows of grouped.values()) {
      const ordered = [...rows].sort((a, b) => {
        const v = compareVersionParts(toVersionSortKey(a), toVersionSortKey(b));
        if (v !== 0) return v;
        const aTs = a.firstSeenAt ? new Date(a.firstSeenAt).getTime() : 0;
        const bTs = b.firstSeenAt ? new Date(b.firstSeenAt).getTime() : 0;
        return aTs - bTs;
      });

      ordered.forEach((current, idx) => {
        const previous = idx > 0 ? (ordered[idx - 1] ?? null) : null;
        const currentHistory = versionHistoryByLabel.get(current.label);
        const previousHistory = previous ? versionHistoryByLabel.get(previous.label) : null;
        const currentVariants = getTopBodyVariants(currentHistory);
        const previousVariants = getTopBodyVariants(previousHistory);
        const diffPair = pickDiffPair(previousVariants, currentVariants);
        result.set(current.label, {
          previous,
          currentCanonicalBody: diffPair.current,
          previousCanonicalBody: diffPair.previous,
          usingVariantPair: diffPair.usingVariantPair,
        });
      });
    }
    return result;
  }, [mergedRows, versionHistoryByLabel]);

  const versionTimelineByLabel = useMemo(() => {
    const grouped = new Map<string, MergedSeqRow[]>();
    for (const row of mergedRows) {
      const key = row.leadMagnet || NOT_CAPTURED_LABEL;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    const result = new Map<string, VersionTimelineItem[]>();
    for (const rows of grouped.values()) {
      const ordered = [...rows].sort((a, b) => {
        const v = compareVersionParts(toVersionSortKey(a), toVersionSortKey(b));
        if (v !== 0) return v;
        const aTs = a.firstSeenAt ? new Date(a.firstSeenAt).getTime() : 0;
        const bTs = b.firstSeenAt ? new Date(b.firstSeenAt).getTime() : 0;
        return aTs - bTs;
      });

      const winner = [...ordered].sort((a, b) => {
        const aRate = a.messagesSent > 0 ? (a.canonicalBookedCalls / a.messagesSent) * 100 : 0;
        const bRate = b.messagesSent > 0 ? (b.canonicalBookedCalls / b.messagesSent) * 100 : 0;
        if (bRate !== aRate) return bRate - aRate;
        if (b.canonicalBookedCalls !== a.canonicalBookedCalls) return b.canonicalBookedCalls - a.canonicalBookedCalls;
        return b.messagesSent - a.messagesSent;
      })[0] ?? null;

      ordered.forEach((current) => {
        const items: VersionTimelineItem[] = ordered.map((r) => ({
          label: r.label,
          versionLabel: extractVersionDisplay(r.label) || r.version || r.label,
          status: versionHistoryByLabel.get(r.label)?.status ?? 'testing',
          firstSeenAt: r.firstSeenAt,
          messagesSent: r.messagesSent,
          replyRatePct: r.replyRatePct,
          bookedCalls: r.canonicalBookedCalls,
          bookingRatePct: r.messagesSent > 0 ? (r.canonicalBookedCalls / r.messagesSent) * 100 : 0,
          isCurrent: r.label === current.label,
          isWinner: winner ? r.label === winner.label : false,
          winnerLowConfidence: winner ? winner.messagesSent < WINNER_MIN_SENDS : false,
        }));
        result.set(current.label, items);
      });
    }
    return result;
  }, [mergedRows, versionHistoryByLabel]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mergedRows.filter((row) => {
      if (!showManualRow && row.isManual) return false;
      if (!needle) return true;
      return (
        row.label.toLowerCase().includes(needle) ||
        row.leadMagnet.toLowerCase().includes(needle) ||
        row.version.toLowerCase().includes(needle)
      );
    });
  }, [mergedRows, query, showManualRow]);

  // Sort — manual/unattributed always last
  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (a.isManual && !b.isManual) return 1;
      if (!a.isManual && b.isManual) return -1;
      const familyCmp = labelSorter.compare(toSequenceFamily(a), toSequenceFamily(b));
      if (familyCmp !== 0) return familyCmp;
      switch (sort) {
        case 'version': {
          const versionCmp = compareVersionParts(toVersionSortKey(a), toVersionSortKey(b));
          if (versionCmp !== 0) return dir * versionCmp;
          break;
        }
        case 'messagesSent':
          if (a.messagesSent !== b.messagesSent) return dir * (a.messagesSent - b.messagesSent);
          break;
        case 'replyRatePct':
          if (a.replyRatePct !== b.replyRatePct) return dir * (a.replyRatePct - b.replyRatePct);
          break;
        case 'canonicalBookedCalls':
          if (a.canonicalBookedCalls !== b.canonicalBookedCalls) return dir * (a.canonicalBookedCalls - b.canonicalBookedCalls);
          break;
        case 'optOutRatePct':
          if (a.optOutRatePct !== b.optOutRatePct) return dir * (a.optOutRatePct - b.optOutRatePct);
          break;
        case 'uniqueContacted':
          if (a.uniqueContacted !== b.uniqueContacted) return dir * (a.uniqueContacted - b.uniqueContacted);
          break;
        case 'bookingRatePct':
          if (a.bookingRatePct !== b.bookingRatePct) return dir * (a.bookingRatePct - b.bookingRatePct);
          break;
        default:
          break;
      }
      const versionCmp = compareVersionParts(toVersionSortKey(a), toVersionSortKey(b));
      if (versionCmp !== 0) return -versionCmp;
      return labelSorter.compare(a.label, b.label);
    });
  }, [filteredRows, sort, sortDir]);

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
    };
  }, [mergedRows]);

  const toggleExpanded = (label: string) => {
    setExpandedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
        // Fire a subtle toast when expanding to show the notification system works
        toast.info(`Viewing audit log for ${label}`, { duration: 2000 });
      }
      return next;
    });
  };

  const handleSortClick = (col: Sort) => {
    if (sort === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(col);
      setSortDir('desc');
    }
  };

  const sortArrow = (col: Sort) =>
    sort === col ? <span className="V2Table__sortArrow">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span> : null;
  const columnSortMap: Record<Sort, ColumnId> = {
    version: 'version',
    messagesSent: 'messagesSent',
    replyRatePct: 'replyRatePct',
    canonicalBookedCalls: 'canonicalBookedCalls',
    optOutRatePct: 'optOutRatePct',
    uniqueContacted: 'uniqueContacted',
    bookingRatePct: 'bookingRatePct',
  };
  const sortColumnId = columnSortMap[sort];
  const columnLabels: Array<{ id: ColumnId; label: string }> = [
    { id: 'label', label: 'Sequence Name' },
    { id: 'version', label: 'Script Version' },
    { id: 'firstSeenAt', label: 'Live Since' },
    { id: 'messagesSent', label: 'Texts Sent' },
    { id: 'uniqueContacted', label: 'Contacts' },
    { id: 'repliesReceived', label: 'Leads Replied' },
    { id: 'replyRatePct', label: 'Reply %' },
    { id: 'canonicalBookedCalls', label: 'Calls Booked' },
    { id: 'bookingRatePct', label: 'Booking %' },
    { id: 'optOutRatePct', label: 'Stop %' },
    { id: 'optOuts', label: 'Stops' },
  ];

  const monthlyBookings = scoreboard?.monthly.bookings;
  const compliance = scoreboard?.compliance;
  const timing = scoreboard?.timing;
  const columns = useMemo<ColumnDef<MergedSeqRow, unknown>[]>(
    () => [
      {
        id: 'label',
        accessorKey: 'label',
        header: 'Sequence Name',
        cell: ({ row }) => (
          <span className="V2Table__seqName" title={row.original.label}>
            {row.original.label}
          </span>
        ),
        enableHiding: false,
      },
      {
        id: 'version',
        accessorKey: 'version',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            onClick={() => handleSortClick('version')}
            title="Group sequence families and sort by script version"
          >
            Script Version{sortArrow('version')}
          </button>
        ),
        cell: ({ row }) => renderVersion(row.original.label, row.original.version),
      },
      {
        id: 'firstSeenAt',
        accessorKey: 'firstSeenAt',
        header: 'Live Since',
        cell: ({ row }) => <span className="V2Table__dim">{fmtDay(row.original.firstSeenAt)}</span>,
      },
      {
        id: 'messagesSent',
        accessorKey: 'messagesSent',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            onClick={() => handleSortClick('messagesSent')}
          >
            Texts Sent{sortArrow('messagesSent')}
          </button>
        ),
        cell: ({ row }) => fmtInt(row.original.messagesSent),
      },
      {
        id: 'uniqueContacted',
        accessorKey: 'uniqueContacted',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            title="Unique people reached by this sequence · weekly window"
            onClick={() => handleSortClick('uniqueContacted')}
          >
            Contacts{sortArrow('uniqueContacted')}
          </button>
        ),
        cell: ({ row }) =>
          row.original.uniqueContacted > 0 ? fmtInt(row.original.uniqueContacted) : <span className="V2Table__dim">—</span>,
      },
      {
        id: 'repliesReceived',
        accessorKey: 'repliesReceived',
        header: 'Leads Replied',
        cell: ({ row }) => fmtInt(row.original.repliesReceived),
      },
      {
        id: 'replyRatePct',
        accessorKey: 'replyRatePct',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            onClick={() => handleSortClick('replyRatePct')}
          >
            Reply %{sortArrow('replyRatePct')}
          </button>
        ),
        cell: ({ row }) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
            <span>{fmtPct(row.original.replyRatePct)}</span>
            <div style={{ width: '40px' }}>
              <V2ProgressBar
                value={row.original.replyRatePct}
                max={25}
                height={4}
                color={
                  row.original.replyRatePct >= 10
                    ? 'var(--v2-positive)'
                    : row.original.replyRatePct < 5
                      ? 'var(--v2-warning)'
                      : 'var(--v2-accent)'
                }
              />
            </div>
          </div>
        ),
      },
      {
        id: 'canonicalBookedCalls',
        accessorKey: 'canonicalBookedCalls',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            onClick={() => handleSortClick('canonicalBookedCalls')}
          >
            Calls Booked{sortArrow('canonicalBookedCalls')}
          </button>
        ),
        cell: ({ row }) => (
          <div className="V2SeqRepSplit">
            <strong>{fmtInt(row.original.canonicalBookedCalls)}</strong>
            {row.original.canonicalBookedCalls > 0 && (
              <div className="V2SeqRepSplit__badges">
                {row.original.canonicalBookedJack > 0 && (
                  <span
                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--jack"
                    title={`Jack: ${row.original.canonicalBookedJack}`}
                  >
                    J·{row.original.canonicalBookedJack}
                  </span>
                )}
                {row.original.canonicalBookedBrandon > 0 && (
                  <span
                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--brandon"
                    title={`Brandon: ${row.original.canonicalBookedBrandon}`}
                  >
                    B·{row.original.canonicalBookedBrandon}
                  </span>
                )}
                {row.original.canonicalBookedSelf > 0 && (
                  <span
                    className="V2SeqRepSplit__badge V2SeqRepSplit__badge--self"
                    title={`Self-booked: ${row.original.canonicalBookedSelf}`}
                  >
                    S·{row.original.canonicalBookedSelf}
                  </span>
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'bookingRatePct',
        accessorKey: 'bookingRatePct',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            title="Booked calls ÷ unique contacts · weekly window"
            onClick={() => handleSortClick('bookingRatePct')}
          >
            Booking %{sortArrow('bookingRatePct')}
          </button>
        ),
        cell: ({ row }) =>
          row.original.bookingRatePct > 0 ? fmtPct(row.original.bookingRatePct) : <span className="V2Table__dim">—</span>,
      },
      {
        id: 'optOutRatePct',
        accessorKey: 'optOutRatePct',
        header: () => (
          <button
            type="button"
            className="V2Table__sortBtn"
            onClick={() => handleSortClick('optOutRatePct')}
          >
            Stop %{sortArrow('optOutRatePct')}
          </button>
        ),
        cell: ({ row }) => {
          const isHighOptOut = row.original.optOutRatePct >= 5 && row.original.messagesSent >= 10;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
              <span className={isHighOptOut ? 'V2Table__cell--warn' : ''}>{fmtPct(row.original.optOutRatePct)}</span>
              <div style={{ width: '40px' }}>
                <V2ProgressBar
                  value={row.original.optOutRatePct}
                  max={10}
                  height={4}
                  color={isHighOptOut ? 'var(--v2-critical)' : 'var(--v2-muted)'}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: 'optOuts',
        accessorKey: 'optOuts',
        header: 'Stops',
        cell: ({ row }) => fmtInt(row.original.optOuts),
      },
      {
        id: 'expand',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const expanded = expandedLabels.has(row.original.label);
          return (
            <button
              type="button"
              className="V2Table__expandBtn"
              onClick={() => toggleExpanded(row.original.label)}
              aria-expanded={expanded}
              aria-controls={toAuditId(row.original.label)}
              title={expanded ? 'Collapse audit' : 'Expand audit'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          );
        },
      },
    ],
    [expandedLabels, sort, sortDir],
  );
  const table = useReactTable({
    data: sortedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
      columnPinning,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
  });
  const getPinnedStyles = (column: any): React.CSSProperties => {
    const isPinned = column.getIsPinned();
    if (!isPinned) return {};
    return {
      position: 'sticky',
      [isPinned]: `${isPinned === 'left' ? column.getStart('left') : column.getAfter('right')}px`,
      zIndex: 2,
      background: 'var(--v2-surface-1)',
      boxShadow:
        isPinned === 'left'
          ? '1px 0 0 rgba(7, 19, 36, 0.08)'
          : '-1px 0 0 rgba(7, 19, 36, 0.08)',
    };
  };

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
          meta="weekly window"
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

      {/* ── Sequence Performance Table ── */}
      <V2Panel
        title="Sequence Performance"
        caption={`${sortedRows.length} sequences · all numbers from ${mode} rolling window · Booked = Slack-verified · Unique/Booking Rate from weekly window · click headers to sort`}
      >
        {sortedRows.length === 0 ? (
          <V2State kind="empty">No sequence data for this window.</V2State>
        ) : (
          <>
            <div className="V2TableActions">
              <div className="V2TableActions__header">
                <label>
                  Sequence Controls
                  <span className="V2TableActions__hint">Use search + columns to reduce noise and horizontal scrolling.</span>
                </label>
                <div className="V2TableActions__summary">
                  Showing <strong>{fmtInt(sortedRows.length)}</strong> of <strong>{fmtInt(mergedRows.length)}</strong>
                </div>
              </div>
              <div className="V2TableActions__inputs">
                <input
                  type="text"
                  className="V2TableActions__search"
                  placeholder="Search sequence, version, or lead magnet…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search sequences"
                />
                <label className="V2TableActions__toggle">
                  <input
                    type="checkbox"
                    checked={showManualRow}
                    onChange={(event) => setShowManualRow(event.target.checked)}
                  />
                  Include manual/direct row
                </label>
              </div>
              <div className="V2TableActions__chips">
                {columnLabels.map((columnLabel) => {
                  const column = table.getColumn(columnLabel.id);
                  if (!column || !column.getCanHide()) return null;
                  return (
                    <button
                      key={columnLabel.id}
                      type="button"
                      className={`V2TableActions__chip${column.getIsVisible() ? ' is-active' : ''}`}
                      onClick={() => column.toggleVisibility(!column.getIsVisible())}
                    >
                      {columnLabel.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="V2TableWrap V2TableWrap--sequences">
            <table className="V2Table V2Table--sequences">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={`
                          ${header.column.id === 'label' ? 'V2Table__col--label' : ''}
                          ${header.column.id === 'version' ? 'V2Table__col--version' : ''}
                          ${header.column.id === 'firstSeenAt' ? 'V2Table__col--date' : ''}
                          ${header.column.id === 'expand' ? 'is-center V2Table__col--expand' : ''}
                          ${['messagesSent','uniqueContacted','repliesReceived','replyRatePct','canonicalBookedCalls','bookingRatePct','optOutRatePct','optOuts'].includes(header.column.id) ? 'is-right' : ''}
                          ${header.column.id === sortColumnId ? 'is-sortable' : ''}
                        `}
                        style={getPinnedStyles(header.column)}
                        aria-sort={
                          header.column.id === sortColumnId
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <motion.tbody
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: { opacity: 1, transition: { staggerChildren: 0.03 } }
                }}
              >
                {table.getRowModel().rows.map((tableRow) => {
                  const row = tableRow.original;
                  const expanded = expandedLabels.has(row.label);
                  const versionDiff = versionDiffByLabel.get(row.label);
                  const versionTimeline = versionTimelineByLabel.get(row.label) ?? [];
                  const previousVersionRow = versionDiff?.previous ?? null;
                  const previousDiffText = versionDiff?.previousCanonicalBody ?? '';
                  const currentDiffText = versionDiff?.currentCanonicalBody ?? '';
                  const hasDiffInputs =
                    previousDiffText.trim().length > 0 && currentDiffText.trim().length > 0;
                  const canRenderTextDiff =
                    hasDiffInputs && previousDiffText.trim() !== currentDiffText.trim();
                  const isHighOptOut = row.optOutRatePct >= 5 && row.messagesSent >= 10;
                  const isHighBooking = row.canonicalBookedCalls >= 2 && !row.isManual;
                  const rowClass = [
                    'V2Table__row',
                    row.isManual ? 'V2Table__row--manual' : '',
                    isHighOptOut ? 'V2Table__row--warn' : '',
                    isHighBooking && !isHighOptOut ? 'V2Table__row--positive' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <Fragment key={row.label}>
                      <motion.tr 
                        className={rowClass}
                        variants={{
                          hidden: { opacity: 0, y: 10 },
                          show: { opacity: 1, y: 0 }
                        }}
                      >
                        {tableRow.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={`
                              ${cell.column.id === 'label' ? 'V2Table__col--label' : ''}
                              ${cell.column.id === 'version' ? 'V2Table__col--version' : ''}
                              ${cell.column.id === 'firstSeenAt' ? 'V2Table__col--date V2Table__dim' : ''}
                              ${cell.column.id === 'expand' ? 'is-center' : ''}
                              ${['messagesSent','uniqueContacted','repliesReceived','replyRatePct','canonicalBookedCalls','bookingRatePct','optOutRatePct','optOuts'].includes(cell.column.id) ? 'is-right' : ''}
                            `}
                            style={getPinnedStyles(cell.column)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </motion.tr>

                      <AnimatePresence>
                        {expanded && (
                          <motion.tr 
                            id={toAuditId(row.label)} 
                            className="V2Table__auditRow"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <td colSpan={table.getVisibleLeafColumns().length} style={{ padding: 0 }}>
                              <motion.div 
                                className="V2SeqAudit"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                style={{ overflow: 'hidden' }}
                              >
                              {/* Booking breakdown summary */}
                              <div className="V2SeqAudit__summary">
                                <div className="V2SeqAudit__summaryItem">
                                  <span className="V2SeqAudit__summaryLabel">Booked (Slack-verified)</span>
                                  <span className="V2SeqAudit__summaryValue">
                                    {fmtInt(row.canonicalBookedCalls)}
                                    {row.canonicalBookedCalls > 0 && (
                                      <span className="V2SeqAudit__breakdown">
                                        {' '}— Jack {fmtInt(row.canonicalBookedJack)} / Brandon{' '}
                                        {fmtInt(row.canonicalBookedBrandon)} / Self{' '}
                                        {fmtInt(row.canonicalBookedSelf)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="V2SeqAudit__summaryItem">
                                  <span className="V2SeqAudit__summaryLabel">SMS-Linked</span>
                                  <span className="V2SeqAudit__summaryValue">
                                    {fmtInt(row.canonicalBookedAfterSmsReply)}
                                    {row.canonicalBookedCalls > 0 && row.smsReplyPct !== null && (
                                      <span className="V2SeqAudit__breakdown">
                                        {' '}({fmtPct(row.smsReplyPct)} of bookings)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="V2SeqAudit__summaryItem V2SeqAudit__summaryItem--diagnostic">
                                  <span className="V2SeqAudit__summaryLabel">
                                    Booking Signals
                                    <span className="V2SeqAudit__hint"> (for reference only)</span>
                                  </span>
                                  <span className="V2SeqAudit__summaryValue V2SeqAudit__summaryValue--muted">
                                    {fmtInt(row.diagnosticSmsBookingSignals)}
                                  </span>
                                </div>
                              </div>

                              <section className="V2SeqVersionDiff">
                                <header className="V2SeqVersionDiff__header">
                                  <h4 className="V2SeqVersionDiff__title">Sequence Script Changes</h4>
                                  <p className="V2SeqVersionDiff__caption">
                                    {previousVersionRow
                                      ? `Comparing against previous ${previousVersionRow.version || 'version'} in ${row.leadMagnet}`
                                      : 'No earlier version found for this lead magnet yet.'}
                                  </p>
                                  {versionDiff?.usingVariantPair ? (
                                    <p className="V2SeqVersionDiff__caption">
                                      Diff uses top message variants because primary canonical texts matched.
                                    </p>
                                  ) : null}
                                </header>
                                {versionTimeline.length > 1 && (
                                  <div className="V2SeqVersionDiff__timeline">
                                    <p className="V2SeqVersionDiff__copyLabel">Version Timeline</p>
                                    <div className="V2SeqVersionDiff__timelineList">
                                      {versionTimeline.map((item) => (
                                        <article
                                          key={item.label}
                                          className={`V2SeqVersionDiff__timelineItem${item.isCurrent ? ' is-current' : ''}${item.isWinner && item.winnerLowConfidence ? ' is-low-confidence' : ''}`}
                                        >
                                          <p className="V2SeqVersionDiff__timelineVersion">
                                            {item.versionLabel}
                                            <span className={`V2SeqVersionDiff__timelineBadge is-status is-${item.status}`}>
                                              {item.status}
                                            </span>
                                            {item.isWinner && !item.winnerLowConfidence && (
                                              <span className="V2SeqVersionDiff__timelineBadge is-winner">Winner</span>
                                            )}
                                            {item.isWinner && item.winnerLowConfidence && (
                                              <span className="V2SeqVersionDiff__timelineBadge is-low-confidence">Leading (low confidence)</span>
                                            )}
                                          </p>
                                          <p className="V2SeqVersionDiff__timelineMeta">
                                            {fmtDay(item.firstSeenAt)} · {fmtInt(item.messagesSent)} sent · {fmtPct(item.replyRatePct)} reply ·{' '}
                                            {fmtInt(item.bookedCalls)} booked · {fmtPct(item.bookingRatePct)} booked rate
                                          </p>
                                          <div className="V2SeqVersionDiff__timelineActions">
                                            <button
                                              type="button"
                                              className="V2SeqVersionDiff__timelineAction"
                                              onClick={() => void updateSequenceStatus(item.label, 'active')}
                                              disabled={decisionPendingLabel === item.label || item.status === 'active'}
                                            >
                                              Promote
                                            </button>
                                            <button
                                              type="button"
                                              className="V2SeqVersionDiff__timelineAction"
                                              onClick={() => void updateSequenceStatus(item.label, 'rewrite')}
                                              disabled={decisionPendingLabel === item.label || item.status === 'rewrite'}
                                            >
                                              Rewrite
                                            </button>
                                            <button
                                              type="button"
                                              className="V2SeqVersionDiff__timelineAction"
                                              onClick={() => void updateSequenceStatus(item.label, 'archived')}
                                              disabled={decisionPendingLabel === item.label || item.status === 'archived'}
                                            >
                                              Archive
                                            </button>
                                          </div>
                                        </article>
                                      ))}
                                    </div>
                                    <p className="V2SeqVersionDiff__note">
                                      Winner uses highest booked rate. Confidence requires at least {fmtInt(WINNER_MIN_SENDS)} sent.
                                    </p>
                                  </div>
                                )}
                                {previousVersionRow ? (
                                  <>
                                    <div className="V2SeqVersionDiff__metrics">
                                      <div className="V2SeqVersionDiff__metric">
                                        <span className="V2SeqVersionDiff__metricLabel">Texts Sent</span>
                                        <strong className="V2SeqVersionDiff__metricValue">
                                          {fmtSignedInt(row.messagesSent - previousVersionRow.messagesSent)}
                                        </strong>
                                      </div>
                                      <div className="V2SeqVersionDiff__metric">
                                        <span className="V2SeqVersionDiff__metricLabel">Reply %</span>
                                        <strong className="V2SeqVersionDiff__metricValue">
                                          {fmtSignedPctPoints(row.replyRatePct - previousVersionRow.replyRatePct)}
                                        </strong>
                                      </div>
                                      <div className="V2SeqVersionDiff__metric">
                                        <span className="V2SeqVersionDiff__metricLabel">Calls Booked</span>
                                        <strong className="V2SeqVersionDiff__metricValue">
                                          {fmtSignedInt(row.canonicalBookedCalls - previousVersionRow.canonicalBookedCalls)}
                                        </strong>
                                      </div>
                                      <div className="V2SeqVersionDiff__metric">
                                        <span className="V2SeqVersionDiff__metricLabel">Stop %</span>
                                        <strong
                                          className={`V2SeqVersionDiff__metricValue ${
                                            row.optOutRatePct - previousVersionRow.optOutRatePct <= 0
                                              ? 'is-positive'
                                              : 'is-negative'
                                          }`}
                                        >
                                          {fmtSignedPctPoints(row.optOutRatePct - previousVersionRow.optOutRatePct)}
                                        </strong>
                                      </div>
                                    </div>
                                    <div className="V2SeqVersionDiff__copyGrid">
                                      <article className="V2SeqVersionDiff__copyCard">
                                        <p className="V2SeqVersionDiff__copyLabel">
                                          Before ({previousVersionRow.version || previousVersionRow.label})
                                        </p>
                                        {versionDiff?.previousCanonicalBody ? (
                                          <blockquote className="V2SeqVersionDiff__quote">
                                            {shorten(versionDiff.previousCanonicalBody, 220)}
                                          </blockquote>
                                        ) : (
                                          <p className="V2SeqVersionDiff__empty">Previous version text not found yet.</p>
                                        )}
                                      </article>
                                      <article className="V2SeqVersionDiff__copyCard">
                                        <p className="V2SeqVersionDiff__copyLabel">After ({row.version || row.label})</p>
                                        {versionDiff?.currentCanonicalBody ? (
                                          <blockquote className="V2SeqVersionDiff__quote">
                                            {shorten(versionDiff.currentCanonicalBody, 220)}
                                          </blockquote>
                                        ) : (
                                          <p className="V2SeqVersionDiff__empty">Current version text not found yet.</p>
                                        )}
                                      </article>
                                    </div>
                                    <div className="V2SeqVersionDiff__diff">
                                      <p className="V2SeqVersionDiff__copyLabel">Copy Diff (Before vs After)</p>
                                      {canRenderTextDiff ? (
                                        <DiffViewer
                                          oldValue={previousDiffText}
                                          newValue={currentDiffText}
                                          splitView
                                          compareMethod={DiffMethod.WORDS}
                                          disableWordDiff={false}
                                          extraLinesSurroundingDiff={1}
                                          hideLineNumbers={false}
                                          showDiffOnly
                                          hideSummary
                                          leftTitle={`Before (${previousVersionRow.version || previousVersionRow.label})`}
                                          rightTitle={`After (${row.version || row.label})`}
                                          useDarkTheme={false}
                                          styles={{
                                            diffContainer: {
                                              borderRadius: '10px',
                                              border: '1px solid rgba(7, 19, 36, 0.1)',
                                              overflow: 'hidden',
                                            },
                                            titleBlock: {
                                              background: 'rgba(7, 19, 36, 0.03)',
                                              borderBottom: '1px solid rgba(7, 19, 36, 0.08)',
                                              color: 'var(--v2-text)',
                                              fontWeight: 700,
                                            },
                                            marker: {
                                              minWidth: '22px',
                                              textAlign: 'center',
                                            },
                                            contentText: {
                                              fontSize: '0.76rem',
                                              lineHeight: '1.4',
                                              fontFamily: 'var(--v2-font-sans)',
                                            },
                                            gutter: {
                                              minWidth: '28px',
                                            },
                                            diffAdded: {
                                              background: 'rgba(19, 185, 129, 0.16)',
                                            },
                                            diffRemoved: {
                                              background: 'rgba(224, 62, 62, 0.16)',
                                            },
                                            wordAdded: {
                                              background: 'rgba(19, 185, 129, 0.34)',
                                            },
                                            wordRemoved: {
                                              background: 'rgba(224, 62, 62, 0.34)',
                                            },
                                            highlightedGutter: {
                                              background: 'rgba(17, 184, 214, 0.10)',
                                            },
                                          }}
                                        />
                                      ) : hasDiffInputs ? (
                                        <p className="V2SeqVersionDiff__empty">
                                          No copy change between these two versions.
                                        </p>
                                      ) : (
                                        <p className="V2SeqVersionDiff__empty">
                                          We need both the previous and current sent sequence texts to show a diff.
                                        </p>
                                      )}
                                    </div>
                                    <p className="V2SeqVersionDiff__note">
                                      Diff is based only on actual sequence texts that were sent to leads.
                                    </p>
                                  </>
                                ) : null}
                              </section>

                              {/* Per-booking audit rows */}
                              {row.bookedAuditRows.length === 0 ? (
                                <V2State kind="empty">
                                  No booking records found for this sequence in this window.
                                </V2State>
                              ) : (
                                <div className="V2AuditList">
                                  {row.bookedAuditRows
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime(),
                                    )
                                    .map((audit) => (
                                      <article key={audit.bookedCallId} className="V2AuditItem">
                                        <header className="V2AuditItem__header">
                                          <strong>{fmtDateTime(audit.eventTs)}</strong>
                                          <span
                                            className={`V2Badge V2Badge--${
                                              audit.bucket === 'jack'
                                                ? 'jack'
                                                : audit.bucket === 'brandon'
                                                  ? 'brandon'
                                                  : 'self'
                                            }`}
                                          >
                                            {BUCKET_LABELS[audit.bucket]}
                                          </span>
                                          {audit.rep && (
                                            <span className="V2Badge V2Badge--muted" title="Rep">
                                              {audit.rep}
                                            </span>
                                          )}
                                          {audit.line && (
                                            <span className="V2Badge V2Badge--muted" title="Line">
                                              {audit.line}
                                            </span>
                                          )}
                                          <span
                                            className={`V2Badge V2Badge--${audit.strictSmsReplyLinked ? 'positive' : 'muted'}`}
                                          >
                                            SMS reply: {audit.strictSmsReplyLinked ? 'yes' : 'no'}
                                          </span>
                                          {audit.convertedViaSequence && (
                                            <span
                                              className="V2Badge V2Badge--via"
                                              title="Contact was actively enrolled in this sequence at booking time"
                                            >
                                              via {audit.convertedViaSequence}
                                            </span>
                                          )}
                                        </header>
                                        <p className="V2AuditItem__meta">
                                          Lead source:{' '}
                                          <em>{audit.firstConversion || 'n/a'}</em> · Contact:{' '}
                                          {audit.contactName || 'n/a'} · Phone:{' '}
                                          {maskPhone(audit.contactPhone)}
                                        </p>
                                        <p className="V2AuditItem__reason">
                                          Reason:{' '}
                                          {SMS_REPLY_REASON_LABELS[audit.strictSmsReplyReason] ?? audit.strictSmsReplyReason.replace(/_/g, ' ')}
                                          {audit.latestReplyAt
                                            ? ` · Latest SMS reply: ${fmtDateTime(audit.latestReplyAt)}`
                                            : ''}
                                        </p>
                                        {audit.text && (
                                          <p className="V2AuditItem__text">
                                            <span className="V2AuditItem__textLabel">Message: </span>
                                            {shorten(audit.text, 120)}
                                          </p>
                                        )}
                                      </article>
                                    ))}
                                </div>
                              )}
                              </motion.div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </motion.tbody>
            </table>
            </div>
          </>
        )}
      </V2Panel>

      {/* ── Booking Attribution (Monthly) ── */}
      {monthlyBookings && (
        <ExecutiveSection
          id="attribution"
          title="Booking Attribution (Monthly)"
          meta="Expanded analysis panel · monthly scoreboard window"
          isOpen={executiveSections.attribution}
          onToggle={setExecutiveSectionOpen}
        >
          <V2Panel
            title="Booking Attribution (Monthly)"
            caption="How booked calls are attributed across setters and conversation types · monthly scoreboard window"
          >
            <div className="V2SeqAttribution">
              <div className="V2SeqAttribution__grid">
                <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                  <span className="V2SeqAttribution__label">Total Booked</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.total)}</span>
                </div>
                <div className="V2SeqAttribution__item">
                  <span className="V2SeqAttribution__label">Jack</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.jack)}</span>
                </div>
                <div className="V2SeqAttribution__item">
                  <span className="V2SeqAttribution__label">Brandon</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.brandon)}</span>
                </div>
                <div className="V2SeqAttribution__item">
                  <span className="V2SeqAttribution__label">Self-Booked</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.selfBooked)}</span>
                </div>
                <div className="V2SeqAttribution__item V2SeqAttribution__item--highlight">
                  <span className="V2SeqAttribution__label">From Sequences</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.sequenceInitiated)}</span>
                </div>
                <div className="V2SeqAttribution__item">
                  <span className="V2SeqAttribution__label">From Direct Outreach</span>
                  <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.manualInitiated)}</span>
                </div>
              </div>
              <p className="V2SeqAttribution__note">
                A sequence gets credit when it started the first outbound contact with a lead, even if manual follow-ups came before the booking.
              </p>
            </div>
          </V2Panel>
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
