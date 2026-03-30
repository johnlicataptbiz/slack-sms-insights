/**
 * 90-day booked-calls analytics report service.
 *
 * Read-only aggregation against Railway production DB via Prisma raw queries.
 * No schema changes required — all tables accessed via $queryRawUnsafe.
 *
 * Usage:
 *   const payload = await getBookedCalls90dReport({ daysBack: 90 }, logger);
 *
 * Query params (all optional):
 *   from / to       — explicit Date boundaries (default: last 90 days)
 *   timezone        — IANA tz string (default: America/Chicago)
 *   sequenceLimit   — max rows in topSequences (default: 10)
 *   setterLimit     — max rows in setterBreakdown (default: 20)
 */

import type { Logger } from "@slack/bolt";
import { getPrismaClient } from "./prisma.js";
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone } from "./time-range.js";

// ─── Public response types ────────────────────────────────────────────────────

export type BookedCalls90dSummary = {
  window: { from: string; to: string; timezone: string; days: number };
  totals: {
    bookedCallsTotal: number;
    bookedCallsAttributed: number;
    bookedCallsUnattributed: number;
    bookedCallsNeedsReview: number;
    bookedCallsSelfBooked: number;
    bookedCallsSetterAttributed: number;
    smsLinkedBookedCalls: number;
    nonSmsOrUnknownBookedCalls: number;
  };
  rates: {
    attributionCoveragePct: number;
    needsReviewPct: number;
    smsLinkedPct: number;
  };
};

export type BookedCalls90dTrendPoint = {
  day: string;
  bookedCalls: number;
  smsLinkedBookedCalls: number;
  needsReviewBookedCalls: number;
  selfBookedCalls: number;
  setterAttributedCalls: number;
};

export type BookedCalls90dSequenceRow = {
  sequenceLabel: string;
  bookedCalls: number;
  smsEventsBeforeBookingAvg: number;
  inboundBeforeBookingAvg: number;
  outboundBeforeBookingAvg: number;
  medianMinutesFirstInboundToBooked: number | null;
};

export type BookedCalls90dOutcomeRow = {
  outcome: string;
  bookedCalls: number;
  sharePct: number;
};

export type BookedCalls90dSetterRow = {
  setterName: string;
  bookedCalls: number;
  needsReview: number;
  smsLinked: number;
  conversionSignalsAvg: number;
};

export type BookedCalls90dPayload = {
  summary: BookedCalls90dSummary;
  trendByDay: BookedCalls90dTrendPoint[];
  topSequences: BookedCalls90dSequenceRow[];
  outcomeBreakdown: BookedCalls90dOutcomeRow[];
  setterBreakdown: BookedCalls90dSetterRow[];
  diagnostics: {
    dataQualityWarnings: string[];
    generatedAt: string;
  };
};

// ─── Internal types ───────────────────────────────────────────────────────────

type ReportParams = {
  from?: Date;
  to?: Date;
  timezone?: string;
  sequenceLimit?: number;
  setterLimit?: number;
};

type BaseBookingRow = {
  id: string;
  event_ts: Date;
  day: string | null;
  attribution_status: string | null;
  needs_review: boolean | null;
  source_bucket: string | null;
  matched_via_reply_link: boolean | null;
  resolved_sequence_label: string | null;
  first_conversion: string | null;
  setter_final: string | null;
  call_outcome: string | null;
};

type SmsCountRow = {
  resolved_sequence_label: string | null;
  conversation_id: string;
  booking_ts: Date;
  total_sms_before: bigint;
  inbound_before: bigint;
  outbound_before: bigint;
  first_inbound_ts: Date | null;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round2(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  }
  return round2(sorted[mid] ?? 0);
};

// ─── Row classification helpers ───────────────────────────────────────────────

const isAttributed = (row: BaseBookingRow): boolean =>
  row.attribution_status != null && row.attribution_status !== "unattributed";

const isNeedsReview = (row: BaseBookingRow): boolean =>
  row.needs_review === true || row.attribution_status === "needs_review";

const isSelfBooked = (row: BaseBookingRow): boolean =>
  row.source_bucket === "self_booked";

const isSetterAttributed = (row: BaseBookingRow): boolean =>
  row.setter_final != null && row.setter_final.trim() !== "";

const isSmsLinked = (row: BaseBookingRow): boolean =>
  row.matched_via_reply_link === true;

const sequenceLabelFor = (row: BaseBookingRow): string =>
  row.resolved_sequence_label?.trim() || "Unknown/Unmapped";

const outcomeFor = (row: BaseBookingRow): string =>
  row.call_outcome?.trim() || "unknown";

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute the 90-day booked-calls analytics payload.
 *
 * All DB access is read-only via $queryRawUnsafe (SMS-insights tables are not
 * in the Prisma schema, so we use raw SQL throughout).
 */
export const getBookedCalls90dReport = async (
  params: ReportParams = {},
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<BookedCalls90dPayload> => {
  const {
    from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to = new Date(),
    timezone = DEFAULT_BUSINESS_TIMEZONE,
    sequenceLimit = 10,
    setterLimit = 20,
  } = params;

  const days = Math.round(
    (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
  const prisma = getPrismaClient();

  // ── Query 1: booked_calls + attribution + conversation_state ────────────────
  const rawRows = await prisma.$queryRawUnsafe<Omit<BaseBookingRow, "day">[]>(
    `
    SELECT
      bc.id,
      bc.event_ts,
      bca.attribution_status,
      bca.needs_review,
      bca.source_bucket,
      bca.matched_via_reply_link,
      bca.resolved_sequence_label,
      bca.first_conversion,
      bca.setter_final,
      cs.call_outcome
    FROM booked_calls bc
    LEFT JOIN booked_call_attribution bca ON bca.booked_call_id = bc.id
    LEFT JOIN conversation_state cs ON cs.conversation_id = bca.conversation_id
    WHERE bc.event_ts >= $1::timestamptz
      AND bc.event_ts < $2::timestamptz
    ORDER BY bc.event_ts ASC
    `,
    from,
    to,
  );

  // Enrich each row with a timezone-aware day key
  const rows: BaseBookingRow[] = rawRows.map((row) => ({
    ...row,
    day: dayKeyInTimeZone(row.event_ts, timezone),
  }));

  // ── Query 2: SMS event counts per conversation (for sequence breakdown) ──────
  // Only runs when there are booked calls to avoid an unnecessary full-table scan.
  let smsCountRows: SmsCountRow[] = [];
  if (rows.length > 0) {
    smsCountRows = await prisma.$queryRawUnsafe<SmsCountRow[]>(
      `
      SELECT
        bca.resolved_sequence_label,
        bca.conversation_id,
        bc.event_ts AS booking_ts,
        COUNT(se.id) FILTER (WHERE se.event_ts < bc.event_ts)                                    AS total_sms_before,
        COUNT(se.id) FILTER (WHERE se.direction = 'inbound'  AND se.event_ts < bc.event_ts)      AS inbound_before,
        COUNT(se.id) FILTER (WHERE se.direction = 'outbound' AND se.event_ts < bc.event_ts)      AS outbound_before,
        MIN(se.event_ts)  FILTER (WHERE se.direction = 'inbound'  AND se.event_ts < bc.event_ts) AS first_inbound_ts
      FROM booked_calls bc
      INNER JOIN booked_call_attribution bca ON bca.booked_call_id = bc.id
      LEFT  JOIN sms_events se ON se.conversation_id = bca.conversation_id
      WHERE bc.event_ts >= $1::timestamptz
        AND bc.event_ts <  $2::timestamptz
        AND bca.conversation_id IS NOT NULL
      GROUP BY bca.resolved_sequence_label, bca.conversation_id, bc.event_ts
      `,
      from,
      to,
    );
  }

  // ── Summary aggregation ───────────────────────────────────────────────────────
  let total = 0;
  let attributed = 0;
  let unattributed = 0;
  let needsReview = 0;
  let selfBooked = 0;
  let setterAttributed = 0;
  let smsLinked = 0;
  let nonSmsOrUnknown = 0;

  for (const row of rows) {
    total++;
    if (isAttributed(row)) {
      attributed++;
    } else {
      unattributed++;
    }
    if (isNeedsReview(row)) needsReview++;
    if (isSelfBooked(row)) selfBooked++;
    if (isSetterAttributed(row)) setterAttributed++;
    if (isSmsLinked(row)) {
      smsLinked++;
    } else {
      nonSmsOrUnknown++;
    }
  }

  // ── Trend by day ──────────────────────────────────────────────────────────────
  const trendMap = new Map<string, BookedCalls90dTrendPoint>();

  for (const row of rows) {
    const day = row.day ?? "unknown";
    const point = trendMap.get(day) ?? {
      day,
      bookedCalls: 0,
      smsLinkedBookedCalls: 0,
      needsReviewBookedCalls: 0,
      selfBookedCalls: 0,
      setterAttributedCalls: 0,
    };
    point.bookedCalls++;
    if (isSmsLinked(row)) point.smsLinkedBookedCalls++;
    if (isNeedsReview(row)) point.needsReviewBookedCalls++;
    if (isSelfBooked(row)) point.selfBookedCalls++;
    if (isSetterAttributed(row)) point.setterAttributedCalls++;
    trendMap.set(day, point);
  }

  const trendByDay = [...trendMap.values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  // ── Sequence breakdown ────────────────────────────────────────────────────────
  type SeqAgg = {
    bookedCalls: number;
    totalSms: number[];
    inbound: number[];
    outbound: number[];
    minutesFirstInboundToBooked: number[];
  };

  const seqMap = new Map<string, SeqAgg>();

  for (const row of smsCountRows) {
    const label = row.resolved_sequence_label?.trim() || "Unknown/Unmapped";
    const agg = seqMap.get(label) ?? {
      bookedCalls: 0,
      totalSms: [],
      inbound: [],
      outbound: [],
      minutesFirstInboundToBooked: [],
    };
    agg.bookedCalls++;
    agg.totalSms.push(Number(row.total_sms_before));
    agg.inbound.push(Number(row.inbound_before));
    agg.outbound.push(Number(row.outbound_before));
    if (row.first_inbound_ts) {
      const bookingMs = new Date(row.booking_ts).getTime();
      const firstInboundMs = new Date(row.first_inbound_ts).getTime();
      const minutesDiff = (bookingMs - firstInboundMs) / (60 * 1000);
      if (minutesDiff >= 0) {
        agg.minutesFirstInboundToBooked.push(minutesDiff);
      }
    }
    seqMap.set(label, agg);
  }

  const avg = (arr: number[]): number =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  const topSequences: BookedCalls90dSequenceRow[] = [...seqMap.entries()]
    .map(([sequenceLabel, agg]) => ({
      sequenceLabel,
      bookedCalls: agg.bookedCalls,
      smsEventsBeforeBookingAvg: round2(avg(agg.totalSms)),
      inboundBeforeBookingAvg: round2(avg(agg.inbound)),
      outboundBeforeBookingAvg: round2(avg(agg.outbound)),
      medianMinutesFirstInboundToBooked: median(
        agg.minutesFirstInboundToBooked,
      ),
    }))
    .sort((a, b) => b.bookedCalls - a.bookedCalls)
    .slice(0, sequenceLimit);

  // ── Outcome breakdown ─────────────────────────────────────────────────────────
  const outcomeMap = new Map<string, number>();

  for (const row of rows) {
    const outcome = outcomeFor(row);
    outcomeMap.set(outcome, (outcomeMap.get(outcome) ?? 0) + 1);
  }

  const outcomeBreakdown: BookedCalls90dOutcomeRow[] = [...outcomeMap.entries()]
    .map(([outcome, count]) => ({
      outcome,
      bookedCalls: count,
      sharePct: total > 0 ? round2((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.bookedCalls - a.bookedCalls);

  // ── Setter breakdown ──────────────────────────────────────────────────────────
  type SetterAgg = {
    bookedCalls: number;
    needsReview: number;
    smsLinked: number;
    conversionSignals: number;
  };

  const setterMap = new Map<string, SetterAgg>();

  for (const row of rows) {
    const key = row.setter_final?.trim() || "Unknown";
    const agg = setterMap.get(key) ?? {
      bookedCalls: 0,
      needsReview: 0,
      smsLinked: 0,
      conversionSignals: 0,
    };
    agg.bookedCalls++;
    if (isNeedsReview(row)) agg.needsReview++;
    if (isSmsLinked(row)) agg.smsLinked++;
    if (sequenceLabelFor(row) !== "Unknown/Unmapped") agg.conversionSignals++;
    setterMap.set(key, agg);
  }

  const setterBreakdown: BookedCalls90dSetterRow[] = [...setterMap.entries()]
    .map(([setterName, agg]) => ({
      setterName,
      bookedCalls: agg.bookedCalls,
      needsReview: agg.needsReview,
      smsLinked: agg.smsLinked,
      conversionSignalsAvg: round2(
        agg.conversionSignals / Math.max(1, agg.bookedCalls),
      ),
    }))
    .sort((a, b) => b.bookedCalls - a.bookedCalls)
    .slice(0, setterLimit);

  // ── Diagnostics ───────────────────────────────────────────────────────────────
  const dataQualityWarnings: string[] = [];

  if (total === 0) {
    dataQualityWarnings.push("No booked calls found in selected window.");
  }
  if (unattributed > 0) {
    dataQualityWarnings.push(
      `${unattributed} booked call${unattributed === 1 ? "" : "s"} missing attribution_status.`,
    );
  }
  if (nonSmsOrUnknown > 0) {
    dataQualityWarnings.push(
      `${nonSmsOrUnknown} booked call${nonSmsOrUnknown === 1 ? "" : "s"} not linked to prior SMS reply evidence.`,
    );
  }
  if (outcomeMap.has("unknown") && total > 0) {
    dataQualityWarnings.push(
      "Some booked calls are missing structured call_outcome values.",
    );
  }

  // ── Build summary ─────────────────────────────────────────────────────────────
  const summary: BookedCalls90dSummary = {
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone,
      days,
    },
    totals: {
      bookedCallsTotal: total,
      bookedCallsAttributed: attributed,
      bookedCallsUnattributed: unattributed,
      bookedCallsNeedsReview: needsReview,
      bookedCallsSelfBooked: selfBooked,
      bookedCallsSetterAttributed: setterAttributed,
      smsLinkedBookedCalls: smsLinked,
      nonSmsOrUnknownBookedCalls: nonSmsOrUnknown,
    },
    rates: {
      attributionCoveragePct:
        total > 0 ? round2((attributed / total) * 100) : 0,
      needsReviewPct: total > 0 ? round2((needsReview / total) * 100) : 0,
      smsLinkedPct: total > 0 ? round2((smsLinked / total) * 100) : 0,
    },
  };

  logger?.info?.("booked-calls-90d-report: computed", {
    total,
    attributed,
    needsReview,
    smsLinked,
    from: summary.window.from,
    to: summary.window.to,
  });

  return {
    summary,
    trendByDay,
    topSequences,
    outcomeBreakdown,
    setterBreakdown,
    diagnostics: {
      dataQualityWarnings,
      generatedAt: new Date().toISOString(),
    },
  };
};
