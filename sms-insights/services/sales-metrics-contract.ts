import type { RepLeaderboardRow, SalesMetricsSummary, SalesTrendPoint, TopSequenceRow } from './sales-metrics.js';
import type { BookedCallsSummary } from './booked-calls.js';

export type CanonicalSalesMetricsSlice = {
  totals: SalesMetricsSummary['totals'];
  trendByDay: SalesTrendPoint[];
  topSequences: TopSequenceRow[];
  repLeaderboard: RepLeaderboardRow[];
  bookedCalls: BookedCallsSummary['totals'];
  consistency: {
    totalsBookedMatches: boolean;
    trendBookedSum: number;
    trendBookedMatches: boolean;
  };
};

export const buildCanonicalSalesMetricsSlice = (
  summary: SalesMetricsSummary,
  bookedCalls: BookedCallsSummary,
): CanonicalSalesMetricsSlice => {
  const summaryByDay = new Map(summary.trendByDay.map((d) => [d.day, d]));
  const bookedByDay = new Map(bookedCalls.trendByDay.map((d) => [d.day, d]));
  const mergedDays = [...new Set([...summaryByDay.keys(), ...bookedByDay.keys()])].sort((a, b) => a.localeCompare(b));

  const trendByDay = mergedDays.map((day) => {
    const base =
      summaryByDay.get(day) ||
      ({
        day,
        messagesSent: 0,
        manualMessagesSent: 0,
        sequenceMessagesSent: 0,
        peopleContacted: 0,
        manualPeopleContacted: 0,
        sequencePeopleContacted: 0,
        repliesReceived: 0,
        replyRatePct: 0,
        manualRepliesReceived: 0,
        manualReplyRatePct: 0,
        sequenceRepliesReceived: 0,
        sequenceReplyRatePct: 0,
        booked: 0,
        optOuts: 0,
      } satisfies SalesTrendPoint);
    // Use Slack booked-calls count for the day; fall back to SMS heuristic if no Slack data exists.
    const bookedDay = bookedByDay.get(day);
    return { ...base, booked: bookedDay?.booked ?? base.booked };
  });

  const topSequences = summary.topSequences.map((row) => ({
    ...row,
    booked: row.bookingSignalsSms,
  }));
  const repLeaderboard = summary.repLeaderboard.map((row) => ({
    ...row,
    booked: row.bookingSignalsSms,
  }));

  // Use Slack booked-calls as the canonical booked count; SMS heuristic signals are diagnostic only.
  const totals = {
    ...summary.totals,
    booked: bookedCalls.totals.booked,
  };
  const trendBookedSum = trendByDay.reduce((acc, row) => acc + row.booked, 0);

  return {
    totals,
    trendByDay,
    topSequences,
    repLeaderboard,
    // Pass through the full Slack booked-calls breakdown (jack / brandon / selfBooked).
    bookedCalls: bookedCalls.totals,
    consistency: {
      totalsBookedMatches: totals.booked === bookedCalls.totals.booked,
      trendBookedSum,
      trendBookedMatches: trendBookedSum === bookedCalls.totals.booked,
    },
  };
};
