import type { Logger } from '@slack/bolt';
import { getBookedCallAttributionSources, getBookedCallSmsReplyLinks, getBookedCallsSummary } from './booked-calls.js';
import { getPool } from './db.js';
import { getSalesMetricsSummary } from './sales-metrics.js';
import { buildCanonicalSalesMetricsSlice } from './sales-metrics-contract.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone, resolveTimeZone } from './time-range.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScoreboardVolumeSplit = {
  total: number;
  sequence: number;
  manual: number;
  sequencePct: number;
  manualPct: number;
};

export type ScoreboardUniqueSplit = {
  total: number;
  sequence: number;
  manual: number;
};

export type ScoreboardReplySplit = {
  sequence: { count: number; ratePct: number };
  manual: { count: number; ratePct: number };
  overall: { count: number; ratePct: number };
};

export type ScoreboardBookingSplit = {
  total: number;
  jack: number;
  brandon: number;
  selfBooked: number;
  sequenceInitiated: number;
  manualInitiated: number;
};

export type ScoreboardSequenceRow = {
  label: string;
  leadMagnet: string;
  version: string;
  messagesSent: number;
  uniqueContacted: number;
  uniqueReplied: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  bookingRatePct: number;
  optOuts: number;
  optOutRatePct: number;
};

export type ScoreboardLeadMagnetRow = {
  leadMagnet: string;
  legacy: {
    messagesSent: number;
    uniqueContacted: number;
    uniqueReplied: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    bookingRatePct: number;
  } | null;
  v2: {
    messagesSent: number;
    uniqueContacted: number;
    uniqueReplied: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    bookingRatePct: number;
  } | null;
};

export type ScoreboardTimingRow = {
  dayOfWeek: string;
  outboundCount: number;
  replyCount: number;
  replyRatePct: number;
};

export type ScoreboardLeadMagnetAttributionIssue = {
  label: string;
  parsedLeadMagnet: string;
  parsedVersion: string;
  reason: 'missing_lead_magnet' | 'no_pattern_match';
};

export type ScoreboardLeadMagnetAttributionDebug = {
  missingCount: number;
  missingLabels: string[];
  parserNoMatchCount: number;
  parserNoMatchLabels: string[];
  issues: ScoreboardLeadMagnetAttributionIssue[];
};

export type ScoreboardV2 = {
  window: {
    weekStart: string;
    weekEnd: string;
    monthStart: string;
    monthEnd: string;
    timeZone: string;
  };
  weekly: {
    volume: ScoreboardVolumeSplit;
    uniqueLeads: ScoreboardUniqueSplit;
    replies: ScoreboardReplySplit;
    bookings: ScoreboardBookingSplit;
  };
  monthly: {
    volume: ScoreboardVolumeSplit;
    uniqueLeads: ScoreboardUniqueSplit;
    replies: ScoreboardReplySplit;
    bookings: ScoreboardBookingSplit;
  };
  sequences: ScoreboardSequenceRow[];
  leadMagnetComparison: ScoreboardLeadMagnetRow[];
  timing: {
    medianTimeToFirstReplyMinutes: number | null;
    replyRateByDayOfWeek: ScoreboardTimingRow[];
  };
  compliance: {
    optOutRateWeeklyPct: number;
    optOutRateMonthlyPct: number;
    topOptOutSequences: Array<{ label: string; optOuts: number; optOutRatePct: number }>;
  };
  debug: {
    leadMagnetAttribution: ScoreboardLeadMagnetAttributionDebug;
  };
  provenance: {
    attributionModel: 'sequence_initiated_conversation';
    weeklyBookingTotal: number;
    monthlyBookingTotal: number;
  };
};

// ─── Version / lead-magnet parsing ───────────────────────────────────────────

const EXPLICIT_AB_VERSION_PATTERN = /\b(?:version\s*([AB])|([AB])\s*version)\b/i;
const TRAILING_YEAR_VERSION_PATTERN = /\s*-\s*20\d{2}\s*v?\d+(?:\.\d+)*\s*$/i;
const TRAILING_GENERIC_VERSION_PATTERN = /\s*v?\d+(?:\.\d+){1,}\s*$/i;
const TRAILING_YEAR_PATTERN = /\s*-\s*20\d{2}\s*$/i;
const V2_PATTERN = /\bv2\b/i;
const LEGACY_PATTERN = /\blegacy\b/i;

/**
 * Parse a raw sequence label into a normalized lead magnet name and a version tag.
 * Version tags: 'Legacy' | 'V2' | 'Version A' | 'Version B' | ''
 */
export const parseLeadMagnetAndVersion = (label: string): { leadMagnet: string; version: string } => {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.toLowerCase().includes('no sequence') || normalized.toLowerCase().includes('manual')) {
    return { leadMagnet: normalized || 'Manual / No Sequence', version: '' };
  }

  // Detect explicit A/B version
  const abMatch = normalized.match(EXPLICIT_AB_VERSION_PATTERN);
  const abVersion = (abMatch?.[1] || abMatch?.[2] || '').toUpperCase();

  // Strip version suffixes to get base name
  let base = normalized
    .replace(EXPLICIT_AB_VERSION_PATTERN, '')
    .replace(TRAILING_YEAR_VERSION_PATTERN, '')
    .replace(TRAILING_GENERIC_VERSION_PATTERN, '')
    .replace(TRAILING_YEAR_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) base = normalized;

  // Determine version tag
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
    // Has a year suffix → treat as Legacy
    version = 'Legacy';
  }

  return { leadMagnet: base || normalized, version };
};

// ─── Window helpers ───────────────────────────────────────────────────────────

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseIsoDay = (day: string): { year: number; month: number; date: number } => {
  if (!ISO_DAY_PATTERN.test(day)) throw new Error(`Invalid day: ${day}`);
  const [y, m, d] = day.split('-').map((v) => Number.parseInt(v, 10));
  return { year: y, month: m, date: d };
};

const getTimezoneOffsetMs = (instant: Date, tz: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  return sign * ((hours * 60 + minutes) * 60 * 1000);
};

const zonedToUtc = (year: number, month: number, date: number, hours: number, tz: string): Date => {
  const utcGuess = Date.UTC(year, month - 1, date, hours, 0, 0, 0);
  const offset0 = getTimezoneOffsetMs(new Date(utcGuess), tz);
  let utc = utcGuess - offset0;
  const offset1 = getTimezoneOffsetMs(new Date(utc), tz);
  if (offset1 !== offset0) utc = utcGuess - offset1;
  return new Date(utc);
};

/**
 * Resolve the Mon–Sun week window containing the given day (or current week if not provided).
 */
const resolveWeekWindow = (
  weekStartInput: string | undefined,
  tz: string,
): { weekFrom: Date; weekTo: Date; weekStartKey: string; weekEndKey: string } => {
  let anchorDay: string;

  if (weekStartInput && ISO_DAY_PATTERN.test(weekStartInput)) {
    anchorDay = weekStartInput;
  } else {
    // Default to current week's Monday
    const todayKey = dayKeyInTimeZone(new Date(), tz);
    if (!todayKey) throw new Error('Failed to resolve current day');
    const { year, month, date } = parseIsoDay(todayKey);
    const utcAnchor = Date.UTC(year, month - 1, date);
    const dow = new Date(utcAnchor).getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysToMonday = dow === 0 ? -6 : 1 - dow;
    const mondayUtc = new Date(utcAnchor + daysToMonday * 86400000);
    anchorDay = `${mondayUtc.getUTCFullYear()}-${String(mondayUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(mondayUtc.getUTCDate()).padStart(2, '0')}`;
  }

  const { year, month, date } = parseIsoDay(anchorDay);
  const weekFrom = zonedToUtc(year, month, date, 0, tz);
  const sundayUtc = new Date(Date.UTC(year, month - 1, date + 6));
  const weekTo = new Date(
    zonedToUtc(sundayUtc.getUTCFullYear(), sundayUtc.getUTCMonth() + 1, sundayUtc.getUTCDate(), 23, tz).getTime() +
      59 * 60 * 1000 +
      59 * 1000 +
      999,
  );

  const weekEndKey = `${sundayUtc.getUTCFullYear()}-${String(sundayUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(sundayUtc.getUTCDate()).padStart(2, '0')}`;

  return { weekFrom, weekTo, weekStartKey: anchorDay, weekEndKey };
};

/**
 * Resolve the calendar month window containing the given date.
 */
const resolveMonthWindow = (
  weekFrom: Date,
  tz: string,
): { monthFrom: Date; monthTo: Date; monthStartKey: string; monthEndKey: string } => {
  const dayKey = dayKeyInTimeZone(weekFrom, tz);
  if (!dayKey) throw new Error('Failed to resolve month window');
  const { year, month } = parseIsoDay(dayKey);
  const monthFrom = zonedToUtc(year, month, 1, 0, tz);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // last day of month
  const monthTo = new Date(zonedToUtc(year, month, lastDay, 23, tz).getTime() + 59 * 60 * 1000 + 59 * 1000 + 999);
  const monthStartKey = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndKey = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { monthFrom, monthTo, monthStartKey, monthEndKey };
};

// ─── Metric builders ──────────────────────────────────────────────────────────

type SummaryTotals = {
  messagesSent: number;
  manualMessagesSent: number;
  sequenceMessagesSent: number;
  peopleContacted: number;
  manualPeopleContacted: number;
  sequencePeopleContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  manualRepliesReceived: number;
  manualReplyRatePct: number;
  sequenceRepliesReceived: number;
  sequenceReplyRatePct: number;
  booked: number;
  optOuts: number;
};

const buildVolumeSplit = (totals: SummaryTotals): ScoreboardVolumeSplit => {
  const total = totals.messagesSent;
  const sequence = totals.sequenceMessagesSent;
  const manual = totals.manualMessagesSent;
  return {
    total,
    sequence,
    manual,
    sequencePct: total > 0 ? (sequence / total) * 100 : 0,
    manualPct: total > 0 ? (manual / total) * 100 : 0,
  };
};

const buildUniqueSplit = (totals: SummaryTotals): ScoreboardUniqueSplit => ({
  total: totals.peopleContacted,
  sequence: totals.sequencePeopleContacted,
  manual: totals.manualPeopleContacted,
});

const buildReplySplit = (totals: SummaryTotals): ScoreboardReplySplit => ({
  sequence: { count: totals.sequenceRepliesReceived, ratePct: totals.sequenceReplyRatePct },
  manual: { count: totals.manualRepliesReceived, ratePct: totals.manualReplyRatePct },
  overall: { count: totals.repliesReceived, ratePct: totals.replyRatePct },
});

const buildBookingSplit = (
  bookedCalls: { totals: { booked: number; jack: number; brandon: number; selfBooked: number } },
  sequenceAttribution: ReturnType<typeof attributeSlackBookedCallsToSequences>,
): ScoreboardBookingSplit => {
  const total = bookedCalls.totals.booked;
  // "sequence-initiated" = bookings attributed to a named sequence (not manual/no-sequence)
  const MANUAL_LABEL_PATTERN = /no sequence|manual|direct/i;
  let sequenceInitiated = 0;
  let manualInitiated = 0;
  for (const [label, data] of sequenceAttribution.byLabel.entries()) {
    if (MANUAL_LABEL_PATTERN.test(label)) {
      manualInitiated += data.booked;
    } else {
      sequenceInitiated += data.booked;
    }
  }
  // Unattributed calls count as manual-initiated
  const attributed = sequenceAttribution.totals.matchedCalls;
  const unattributed = Math.max(0, total - attributed);
  manualInitiated += unattributed;

  return {
    total,
    jack: bookedCalls.totals.jack,
    brandon: bookedCalls.totals.brandon,
    selfBooked: bookedCalls.totals.selfBooked,
    sequenceInitiated,
    manualInitiated,
  };
};

const buildSequenceRows = (
  topSequences: Array<{
    label: string;
    messagesSent: number;
    repliesReceived: number;
    replyRatePct: number;
    bookingSignalsSms: number;
    optOuts: number;
    firstSeenAt?: string | null;
  }>,
  sequenceAttribution: ReturnType<typeof attributeSlackBookedCallsToSequences>,
  peopleContactedBySequence: Map<string, number>,
): {
  rows: ScoreboardSequenceRow[];
  leadMagnetAttribution: ScoreboardLeadMagnetAttributionDebug;
} => {
  const rows: ScoreboardSequenceRow[] = [];
  const missingLeadMagnetLabels = new Set<string>();
  const parserNoMatchLabels = new Set<string>();
  const issues: ScoreboardLeadMagnetAttributionIssue[] = [];

  for (const row of topSequences) {
    const { leadMagnet, version } = parseLeadMagnetAndVersion(row.label);
    const booked = sequenceAttribution.byLabel.get(row.label)?.booked ?? 0;
    const uniqueContacted = peopleContactedBySequence.get(row.label) ?? row.messagesSent;
    const uniqueReplied = row.repliesReceived;

    const trimmedLeadMagnet = leadMagnet.trim();
    if (!trimmedLeadMagnet) {
      missingLeadMagnetLabels.add(row.label);
      issues.push({
        label: row.label,
        parsedLeadMagnet: leadMagnet,
        parsedVersion: version,
        reason: 'missing_lead_magnet',
      });
    } else if (trimmedLeadMagnet === row.label.trim() && !version) {
      parserNoMatchLabels.add(row.label);
      issues.push({
        label: row.label,
        parsedLeadMagnet: leadMagnet,
        parsedVersion: version,
        reason: 'no_pattern_match',
      });
    }

    rows.push({
      label: row.label,
      leadMagnet,
      version,
      messagesSent: row.messagesSent,
      uniqueContacted,
      uniqueReplied,
      replyRatePct: row.replyRatePct,
      canonicalBookedCalls: booked,
      bookingRatePct: uniqueContacted > 0 ? (booked / uniqueContacted) * 100 : 0,
      optOuts: row.optOuts,
      optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
    });
  }

  return {
    rows,
    leadMagnetAttribution: {
      missingCount: missingLeadMagnetLabels.size,
      missingLabels: [...missingLeadMagnetLabels].sort((a, b) => a.localeCompare(b)),
      parserNoMatchCount: parserNoMatchLabels.size,
      parserNoMatchLabels: [...parserNoMatchLabels].sort((a, b) => a.localeCompare(b)),
      issues,
    },
  };
};

const buildLeadMagnetComparison = (sequenceRows: ScoreboardSequenceRow[]): ScoreboardLeadMagnetRow[] => {
  type Bucket = {
    messagesSent: number;
    uniqueContacted: number;
    uniqueReplied: number;
    canonicalBookedCalls: number;
  };

  const legacyByMagnet = new Map<string, Bucket>();
  const v2ByMagnet = new Map<string, Bucket>();
  const allMagnets = new Set<string>();

  for (const row of sequenceRows) {
    const { leadMagnet, version } = row;
    if (!leadMagnet || leadMagnet.toLowerCase().includes('manual')) continue;
    allMagnets.add(leadMagnet);

    const isLegacy = version === 'Legacy' || version === '' || version.startsWith('Version ');
    const isV2 = version === 'V2';

    const target = isV2 ? v2ByMagnet : isLegacy ? legacyByMagnet : null;
    if (!target) continue;

    const existing = target.get(leadMagnet) || {
      messagesSent: 0,
      uniqueContacted: 0,
      uniqueReplied: 0,
      canonicalBookedCalls: 0,
    };
    existing.messagesSent += row.messagesSent;
    existing.uniqueContacted += row.uniqueContacted;
    existing.uniqueReplied += row.uniqueReplied;
    existing.canonicalBookedCalls += row.canonicalBookedCalls;
    target.set(leadMagnet, existing);
  }

  const toStats = (bucket: Bucket) => ({
    messagesSent: bucket.messagesSent,
    uniqueContacted: bucket.uniqueContacted,
    uniqueReplied: bucket.uniqueReplied,
    replyRatePct: bucket.uniqueContacted > 0 ? (bucket.uniqueReplied / bucket.uniqueContacted) * 100 : 0,
    canonicalBookedCalls: bucket.canonicalBookedCalls,
    bookingRatePct: bucket.uniqueContacted > 0 ? (bucket.canonicalBookedCalls / bucket.uniqueContacted) * 100 : 0,
  });

  return [...allMagnets]
    .map((leadMagnet) => ({
      leadMagnet,
      legacy: (() => {
        const bucket = legacyByMagnet.get(leadMagnet);
        return bucket ? toStats(bucket) : null;
      })(),
      v2: (() => {
        const bucket = v2ByMagnet.get(leadMagnet);
        return bucket ? toStats(bucket) : null;
      })(),
    }))
    .filter((row) => row.legacy !== null || row.v2 !== null)
    .sort((a, b) => {
      const aTotal = (a.legacy?.messagesSent ?? 0) + (a.v2?.messagesSent ?? 0);
      const bTotal = (b.legacy?.messagesSent ?? 0) + (b.v2?.messagesSent ?? 0);
      return bTotal - aTotal;
    });
};

// ─── Timing metrics (raw DB query) ───────────────────────────────────────────

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REPLY_TRIGGER_WINDOW_MS = 48 * 60 * 60 * 1000;

const buildTimingMetrics = async (
  from: Date,
  to: Date,
  tz: string,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>,
): Promise<ScoreboardV2['timing']> => {
  const pool = getPool();
  if (!pool) {
    return { medianTimeToFirstReplyMinutes: null, replyRateByDayOfWeek: [] };
  }

  try {
    const { rows } = await pool.query<{
      event_ts: string;
      direction: 'inbound' | 'outbound' | 'unknown';
      contact_id: string | null;
      contact_phone: string | null;
    }>(
      `SELECT event_ts, direction, contact_id, contact_phone
       FROM sms_events
       WHERE event_ts >= $1::timestamptz
         AND event_ts <= $2::timestamptz
         AND direction IN ('inbound','outbound')
       ORDER BY event_ts ASC`,
      [from.toISOString(), to.toISOString()],
    );

    const normalizeKey = (r: { contact_id: string | null; contact_phone: string | null }): string | null => {
      if (r.contact_id) return `contact:${r.contact_id}`;
      if (r.contact_phone) return `phone:${r.contact_phone.replace(/\D/g, '')}`;
      return null;
    };

    // Group by contact
    const byContact = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = normalizeKey(r);
      if (!key) continue;
      const list = byContact.get(key) || [];
      list.push(r);
      byContact.set(key, list);
    }

    // Compute time-to-first-reply for each contact
    const replyMinutes: number[] = [];
    // For day-of-week: track outbound contacts and replied contacts per DOW
    const dowOutbound = new Map<number, Set<string>>();
    const dowReplied = new Map<number, Set<string>>();

    for (const [contactKey, list] of byContact.entries()) {
      let firstOutbound: (typeof rows)[number] | undefined;
      let firstInboundAfterOutbound: (typeof rows)[number] | undefined;

      for (const e of list) {
        if (e.direction === 'outbound' && !firstOutbound) {
          firstOutbound = e;
        }
        if (e.direction === 'inbound' && firstOutbound) {
          const outTs = new Date(firstOutbound.event_ts).getTime();
          const inTs = new Date(e.event_ts).getTime();
          if (inTs > outTs && inTs - outTs <= REPLY_TRIGGER_WINDOW_MS) {
            firstInboundAfterOutbound = e;
            break;
          }
        }
      }

      if (firstOutbound) {
        const outTs = new Date(firstOutbound.event_ts).getTime();
        const outDate = new Date(outTs);
        // Day of week in business timezone
        const dowParts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
        }).formatToParts(outDate);
        const dowLabel = dowParts.find((p) => p.type === 'weekday')?.value || '';
        const dowIndex = DOW_LABELS.indexOf(dowLabel.slice(0, 3));
        if (dowIndex >= 0) {
          const outSet = dowOutbound.get(dowIndex) || new Set<string>();
          outSet.add(contactKey);
          dowOutbound.set(dowIndex, outSet);
        }

        if (firstInboundAfterOutbound) {
          const inTs = new Date(firstInboundAfterOutbound.event_ts).getTime();
          const minutes = (inTs - outTs) / 60000;
          if (minutes >= 0 && minutes <= 48 * 60) {
            replyMinutes.push(minutes);
          }
          if (dowIndex >= 0) {
            const repSet = dowReplied.get(dowIndex) || new Set<string>();
            repSet.add(contactKey);
            dowReplied.set(dowIndex, repSet);
          }
        }
      }
    }

    // Median
    let medianTimeToFirstReplyMinutes: number | null = null;
    if (replyMinutes.length > 0) {
      const sorted = [...replyMinutes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianTimeToFirstReplyMinutes =
        sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
    }

    // Day-of-week reply rates (Mon–Sun order)
    const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sun=0
    const replyRateByDayOfWeek: ScoreboardTimingRow[] = DOW_ORDER.map((dowIndex) => {
      const outCount = dowOutbound.get(dowIndex)?.size ?? 0;
      const repCount = dowReplied.get(dowIndex)?.size ?? 0;
      return {
        dayOfWeek: DOW_LABELS[dowIndex] ?? '',
        outboundCount: outCount,
        replyCount: repCount,
        replyRatePct: outCount > 0 ? (repCount / outCount) * 100 : 0,
      };
    });

    return { medianTimeToFirstReplyMinutes, replyRateByDayOfWeek };
  } catch (error) {
    logger?.error?.('scoreboard: failed to build timing metrics', error);
    return { medianTimeToFirstReplyMinutes: null, replyRateByDayOfWeek: [] };
  }
};

// ─── People-contacted-by-sequence helper ─────────────────────────────────────

/**
 * Returns a map of sequence label → unique contacts reached (outbound) in the given window.
 * Used to compute per-sequence booking rates against unique contacts rather than message count.
 */
const buildPeopleContactedBySequence = async (
  from: Date,
  to: Date,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>,
): Promise<Map<string, number>> => {
  const pool = getPool();
  if (!pool) return new Map();

  try {
    const { rows } = await pool.query<{ label: string; unique_contacts: string }>(
      `SELECT
         COALESCE(NULLIF(TRIM(sequence), ''), 'No sequence (manual/direct)') AS label,
         COUNT(DISTINCT COALESCE(contact_id, regexp_replace(contact_phone, '\\D', '', 'g'))) AS unique_contacts
       FROM sms_events
       WHERE event_ts >= $1::timestamptz
         AND event_ts <= $2::timestamptz
         AND direction = 'outbound'
       GROUP BY 1`,
      [from.toISOString(), to.toISOString()],
    );
    return new Map(rows.map((r) => [r.label, Number.parseInt(r.unique_contacts, 10) || 0]));
  } catch (error) {
    logger?.error?.('scoreboard: failed to build people-contacted-by-sequence', error);
    return new Map();
  }
};

// ─── Main export ─────────────────────────────────────────────────────────────

export const getScoreboardData = async (
  params: { weekStart?: string; timeZone?: string },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ScoreboardV2> => {
  const tz = resolveTimeZone(params.timeZone) || DEFAULT_BUSINESS_TIMEZONE;
  const { weekFrom, weekTo, weekStartKey, weekEndKey } = resolveWeekWindow(params.weekStart, tz);
  const { monthFrom, monthTo, monthStartKey, monthEndKey } = resolveMonthWindow(weekFrom, tz);

  const bookedCallsChannelId = process.env.BOOKED_CALLS_CHANNEL_ID;

  // Fetch all data in parallel
  const [
    weeklySummary,
    monthlySummary,
    weeklyBooked,
    monthlyBooked,
    weeklyAttributionSources,
    monthlyAttributionSources,
    weeklyPeopleBySeq,
    timingMetrics,
  ] = await Promise.all([
    getSalesMetricsSummary({ from: weekFrom, to: weekTo, timeZone: tz }, logger),
    getSalesMetricsSummary({ from: monthFrom, to: monthTo, timeZone: tz }, logger),
    getBookedCallsSummary({ from: weekFrom, to: weekTo, channelId: bookedCallsChannelId, timeZone: tz }, logger),
    getBookedCallsSummary({ from: monthFrom, to: monthTo, channelId: bookedCallsChannelId, timeZone: tz }, logger),
    getBookedCallAttributionSources({ from: weekFrom, to: weekTo, channelId: bookedCallsChannelId }),
    getBookedCallAttributionSources({ from: monthFrom, to: monthTo, channelId: bookedCallsChannelId }),
    buildPeopleContactedBySequence(weekFrom, weekTo, logger),
    buildTimingMetrics(monthFrom, monthTo, tz, logger),
  ]);

  // SMS reply links for attribution
  const [weeklySmsReplyLinks, monthlySmsReplyLinks] = await Promise.all([
    getBookedCallSmsReplyLinks(weeklyAttributionSources, logger),
    getBookedCallSmsReplyLinks(monthlyAttributionSources, logger),
  ]);

  // Build canonical slices (merges SMS heuristics with Slack booked-calls)
  const weeklyCanonical = buildCanonicalSalesMetricsSlice(weeklySummary, weeklyBooked);
  const monthlyCanonical = buildCanonicalSalesMetricsSlice(monthlySummary, monthlyBooked);

  // Sequence attribution (HubSpot first-conversion fuzzy match)
  const weeklySeqAttribution = attributeSlackBookedCallsToSequences(
    weeklyCanonical.topSequences,
    weeklyAttributionSources,
    weeklySmsReplyLinks,
  );
  const monthlySeqAttribution = attributeSlackBookedCallsToSequences(
    monthlyCanonical.topSequences,
    monthlyAttributionSources,
    monthlySmsReplyLinks,
  );

  // Build all metric sections
  const weeklyVolume = buildVolumeSplit(weeklyCanonical.totals);
  const weeklyUniqueLeads = buildUniqueSplit(weeklyCanonical.totals);
  const weeklyReplies = buildReplySplit(weeklyCanonical.totals);
  const weeklyBookings = buildBookingSplit(weeklyBooked, weeklySeqAttribution);

  const monthlyVolume = buildVolumeSplit(monthlyCanonical.totals);
  const monthlyUniqueLeads = buildUniqueSplit(monthlyCanonical.totals);
  const monthlyReplies = buildReplySplit(monthlyCanonical.totals);
  const monthlyBookings = buildBookingSplit(monthlyBooked, monthlySeqAttribution);

  // Sequence rows (weekly window, with lead-magnet + version parsing)
  const { rows: sequenceRows, leadMagnetAttribution } = buildSequenceRows(
    weeklyCanonical.topSequences,
    weeklySeqAttribution,
    weeklyPeopleBySeq,
  );
  const leadMagnetComparison = buildLeadMagnetComparison(sequenceRows);

  // Compliance
  const weeklyOptOutRate = weeklyVolume.total > 0 ? (weeklyCanonical.totals.optOuts / weeklyVolume.total) * 100 : 0;
  const monthlyOptOutRate = monthlyVolume.total > 0 ? (monthlyCanonical.totals.optOuts / monthlyVolume.total) * 100 : 0;
  const topOptOutSequences = sequenceRows
    .filter((r) => r.optOuts > 0)
    .sort((a, b) => b.optOutRatePct - a.optOutRatePct || b.optOuts - a.optOuts)
    .slice(0, 5)
    .map((r) => ({ label: r.label, optOuts: r.optOuts, optOutRatePct: r.optOutRatePct }));

  return {
    window: {
      weekStart: weekStartKey,
      weekEnd: weekEndKey,
      monthStart: monthStartKey,
      monthEnd: monthEndKey,
      timeZone: tz,
    },
    weekly: {
      volume: weeklyVolume,
      uniqueLeads: weeklyUniqueLeads,
      replies: weeklyReplies,
      bookings: weeklyBookings,
    },
    monthly: {
      volume: monthlyVolume,
      uniqueLeads: monthlyUniqueLeads,
      replies: monthlyReplies,
      bookings: monthlyBookings,
    },
    sequences: sequenceRows,
    leadMagnetComparison,
    timing: timingMetrics,
    compliance: {
      optOutRateWeeklyPct: weeklyOptOutRate,
      optOutRateMonthlyPct: monthlyOptOutRate,
      topOptOutSequences,
    },
    debug: {
      leadMagnetAttribution,
    },
    provenance: {
      attributionModel: 'sequence_initiated_conversation',
      weeklyBookingTotal: weeklyBooked.totals.booked,
      monthlyBookingTotal: monthlyBooked.totals.booked,
    },
  };
};
