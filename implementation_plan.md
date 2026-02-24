# Implementation Plan: Sequence Attribution Fix + SequencesV2 Analytics Expansion

## Overview

Fix the booking attribution model so that a sequence which triggers a lead's first reply is credited for the booking — even if the setter sends 3–30 manual follow-up messages before the lead books. Then surface the corrected metrics and new analytics panels inside the existing `SequencesV2` page (no new pages).

---

## Core Attribution Model Change

### Current (broken) model in `sales-metrics.ts`
"Last outbound touch within 14 days before booking, preferring sequenced."

**Problem:** After a sequence triggers a reply, the setter sends manual follow-ups. The "last outbound" before booking is now a manual message, so the booking gets credited to manual — even though the sequence started the conversation.

### New (correct) model: "Sequence-Initiated Conversation"

```
For each booking event on a contact:
  1. Find the contact's FIRST inbound reply that occurred after any outbound.
  2. Find the outbound that triggered that first reply (within 48h window).
  3. If that triggering outbound had a sequence label → attribute booking to that sequence.
  4. If no sequence triggered a reply (or no reply at all) → fall back to last outbound touch
     within 14 days (current behavior), preferring sequenced over manual.
```

This correctly handles:
- Sequence → reply → 30 manual messages → booking = **sequence gets credit**
- Manual → reply → booking = **manual gets credit**
- Sequence → no reply → manual → reply → booking = **manual gets credit** (sequence didn't trigger the reply)
- Sequence → reply → no booking = **sequence gets reply credit, no booking credit**

---

## [Types]

### New types in `sms-insights/api/v2-contract.ts`

```typescript
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
  sequenceInitiated: number;   // booking where a sequence triggered the first reply
  manualInitiated: number;     // booking where no sequence triggered a reply
};

export type ScoreboardSequenceRow = {
  label: string;
  leadMagnet: string;       // normalized base name (version stripped)
  version: string;          // 'Legacy' | 'V2' | 'A' | 'B' | ''
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
  dayOfWeek: string;   // 'Mon' | 'Tue' | ... | 'Sun'
  outboundCount: number;
  replyCount: number;
  replyRatePct: number;
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
  provenance: {
    attributionModel: 'sequence_initiated_conversation';
    weeklyBookingTotal: number;
    monthlyBookingTotal: number;
  };
};
```

### New frontend types in `frontend/src/api/v2-types.ts`
Mirror all `ScoreboardV2` types above (identical shape, no transformation needed).

---

## [Files]

### New Files

| Path | Purpose |
|------|---------|
| `sms-insights/services/scoreboard.ts` | Core service: builds `ScoreboardV2` using the new attribution model |

### Modified Files

| Path | Changes |
|------|---------|
| `sms-insights/services/sales-metrics.ts` | **Fix attribution model**: replace "last outbound touch" with "sequence-initiated conversation" logic for booking and reply attribution |
| `sms-insights/api/v2-contract.ts` | Add `ScoreboardV2` and sub-types |
| `sms-insights/api/routes.ts` | Add `GET /api/v2/scoreboard` route + `handleGetScoreboardV2` handler |
| `frontend/src/api/v2-types.ts` | Add `ScoreboardV2` and sub-types |
| `frontend/src/api/v2Queries.ts` | Add `useV2Scoreboard(params)` React Query hook |
| `frontend/src/v2/pages/SequencesV2.tsx` | Add 3 new panels: Volume Split, Lead Magnet Comparison, Timing & Compliance |
| `frontend/src/v2/v2.css` | Add CSS for new panels |

---

## [Functions]

### Modified: `sms-insights/services/sales-metrics.ts`

**`getSalesMetricsSummary()`** — change booking attribution logic:

Replace the current "last outbound touch" loop with a two-pass approach:

```typescript
// Pass 1: For each contact, find the outbound that triggered their FIRST reply.
// This is the "conversation initiator" — the touch that gets booking credit.
const conversationInitiatorByContact = new Map<string, EventRow>(); // contactKey → initiating outbound

for (const [contactKey, list] of eventsByContact.entries()) {
  const firstInbound = list.find(e => e.direction === 'inbound');
  if (!firstInbound) continue;
  const firstInboundTs = new Date(firstInbound.event_ts).getTime();

  // Find the outbound that triggered this first reply (within 48h, prefer sequenced)
  let latestOutbound: EventRow | undefined;
  let latestSequencedOutbound: EventRow | undefined;
  for (const candidate of list) {
    if (candidate.direction !== 'outbound') continue;
    const ts = new Date(candidate.event_ts).getTime();
    if (ts > firstInboundTs) break;
    if (firstInboundTs - ts > REPLY_TRIGGER_WINDOW_MS) continue; // 48h
    latestOutbound = candidate;
    if ((candidate.sequence || '').trim()) latestSequencedOutbound = candidate;
  }
  const initiator = latestSequencedOutbound || latestOutbound;
  if (initiator) conversationInitiatorByContact.set(contactKey, initiator);
}

// Pass 2: For each booking, attribute to the conversation initiator (not last touch).
for (const [contactKey, list] of eventsByContact.entries()) {
  for (const e of list) {
    if (!isHighConfidenceBookingSignal(e.direction, e.body || '')) continue;
    
    const initiator = conversationInitiatorByContact.get(contactKey);
    // Fall back to last-touch if no initiator found (cold booking, no prior reply)
    const attributedTouch = initiator ?? findLastOutboundBeforeBooking(list, e);
    const sequenceLabel = (attributedTouch?.sequence || '').trim() || MANUAL_SEQUENCE_LABEL;
    // ... credit booking to sequenceLabel
  }
}
```

**New constant**: `const REPLY_TRIGGER_WINDOW_MS = 48 * 60 * 60 * 1000;` (48 hours)

### New: `sms-insights/services/scoreboard.ts`

```typescript
export const getScoreboardData = async (
  params: { weekStart?: string; timeZone?: string },
  logger?: Logger
): Promise<ScoreboardV2>

// Internal helpers
const resolveWeekWindow = (weekStart: string | undefined, tz: string): { weekStart: Date; weekEnd: Date }
const resolveMonthWindow = (weekStart: Date, tz: string): { monthStart: Date; monthEnd: Date }
const buildVolumeSplit = (events: EventRow[], from: Date, to: Date): ScoreboardVolumeSplit
const buildUniqueSplit = (events: EventRow[], from: Date, to: Date): ScoreboardUniqueSplit
const buildReplySplit = (events: EventRow[], initiatorMap: Map<string, EventRow>, from: Date, to: Date): ScoreboardReplySplit
const buildBookingSplit = (
  events: EventRow[],
  initiatorMap: Map<string, EventRow>,
  bookedCalls: BookedCallSummary,
  sequenceAttribution: SequenceAttributionResult,
  from: Date, to: Date
): ScoreboardBookingSplit
const buildSequenceRows = (events: EventRow[], initiatorMap: Map<string, EventRow>, bookedCalls: BookedCallSummary, sequenceAttribution: SequenceAttributionResult, from: Date, to: Date): ScoreboardSequenceRow[]
const buildLeadMagnetComparison = (sequenceRows: ScoreboardSequenceRow[]): ScoreboardLeadMagnetRow[]
const buildTimingMetrics = (events: EventRow[], initiatorMap: Map<string, EventRow>, tz: string): ScoreboardTimingMetrics
const buildComplianceMetrics = (events: EventRow[], sequenceRows: ScoreboardSequenceRow[], from: Date, to: Date): ScoreboardComplianceMetrics
const parseLeadMagnetAndVersion = (label: string): { leadMagnet: string; version: string }
const buildConversationInitiatorMap = (eventsByContact: Map<string, EventRow[]>): Map<string, EventRow>
const computeMedianTimeToFirstReply = (events: EventRow[], initiatorMap: Map<string, EventRow>): number | null
```

### New: `sms-insights/api/routes.ts` — `handleGetScoreboardV2`

```typescript
const handleGetScoreboardV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const weekStart = url.searchParams.get('weekStart') || undefined;
  const tz = url.searchParams.get('tz') || undefined;
  const data = await getScoreboardData({ weekStart, timeZone: tz }, logger);
  sendJson(res, 200, toEnvelope({ data, timeZone: data.window.timeZone }), origin);
};
```

### New: `frontend/src/api/v2Queries.ts` — `useV2Scoreboard`

```typescript
export const useV2Scoreboard = (params: { weekStart?: string; tz?: string }) =>
  useQuery({ queryKey: ['v2-scoreboard', params], queryFn: () => fetchScoreboard(params) });
```

### Modified: `frontend/src/v2/pages/SequencesV2.tsx`

Add 3 new `<V2Panel>` sections **below** the existing Sequence Table:

1. **Volume & Reply Split Panel** — shows weekly sequence vs manual volume, unique leads, reply rates side-by-side
2. **Lead Magnet Comparison Panel** — table grouping sequences by lead magnet, Legacy vs V2 columns
3. **Timing & Compliance Panel** — median time to first reply, reply rate by day of week, top opt-out sequences

The existing header metrics, Sets Attribution panel, At-Risk Watchlist, and Sequence Table remain unchanged.

---

## [Implementation Order]

1. **Fix attribution model in `sales-metrics.ts`** — most impactful change; fixes existing data shown in SequencesV2 immediately.
2. **Add `ScoreboardV2` types to `sms-insights/api/v2-contract.ts`**.
3. **Create `sms-insights/services/scoreboard.ts`** — new service using the fixed attribution model.
4. **Add `handleGetScoreboardV2` + route to `sms-insights/api/routes.ts`**.
5. **Add `ScoreboardV2` types to `frontend/src/api/v2-types.ts`**.
6. **Add `useV2Scoreboard` hook to `frontend/src/api/v2Queries.ts`**.
7. **Enhance `frontend/src/v2/pages/SequencesV2.tsx`** — add 3 new panels using scoreboard data.
8. **Add CSS to `frontend/src/v2/v2.css`**.
9. **Build verification** — `npm run build` in `frontend/`, confirm 0 TypeScript errors.

---

## Out of Scope

- Reply rate by step number (step not stored in `sms_events`)
- Show rate / close rate (not in any current data source)
- Messages sent to opted-out numbers (not tracked at send time)
- Enrollment count (Aloware enrollment events not ingested)
- New pages / routes (merging into SequencesV2 per user direction)
