# Implementation Plan: Enhanced Sequences Dashboard with Reply Timing & Lead Classification

## Overview
Transform the SequencesV2 page to replace health alerts with reply timing insights and add lead qualification classification columns, showing which sequences attract what types of self-identified leads (full/part-time, revenue mix, coaching interest).

## Types

### New Types for Sequence Qualification Breakdown
```typescript
// frontend/src/api/v2-types.ts additions

export type SequenceQualificationBreakdownV2 = {
  sequenceLabel: string;
  totalConversations: number;
  // Employment status breakdown
  fullTime: { count: number; pct: number; sampleQuote: string | null };
  partTime: { count: number; pct: number; sampleQuote: string | null };
  unknownEmployment: { count: number; pct: number };
  // Revenue mix breakdown
  mostlyCash: { count: number; pct: number; sampleQuote: string | null };
  mostlyInsurance: { count: number; pct: number; sampleQuote: string | null };
  balancedMix: { count: number; pct: number; sampleQuote: string | null };
  unknownRevenue: { count: number; pct: number };
  // Coaching interest breakdown
  highInterest: { count: number; pct: number; sampleQuote: string | null };
  mediumInterest: { count: number; pct: number; sampleQuote: string | null };
  lowInterest: { count: number; pct: number; sampleQuote: string | null };
  unknownInterest: { count: number; pct: number };
  // Top niches mentioned
  topNiches: Array<{ niche: string; count: number; pct: number }>;
};

export type SequencesQualificationResponseV2 = {
  items: SequenceQualificationBreakdownV2[];
  window: {
    from: string;
    to: string;
    timeZone: string;
  };
};
```

### Extended Scoreboard Type
```typescript
// Add to ScoreboardSequenceRow in v2-types.ts
export type ScoreboardSequenceRow = {
  // ... existing fields ...
  // Reply timing metrics (per-sequence)
  medianTimeToFirstReplyMinutes: number | null;
  avgTimeToFirstReplyMinutes: number | null;
  replyRateByHour: Array<{
    hour: number; // 0-23
    sent: number;
    replies: number;
    replyRatePct: number;
  }>;
};
```

## Files

### New Files
1. **`sms-insights/services/sequence-qualification-analytics.ts`** - Backend service to aggregate qualification data by sequence from conversation data
2. **`frontend/src/v2/components/SequenceQualificationBreakdown.tsx`** - Component showing qualification breakdown for a sequence
3. **`frontend/src/v2/components/ReplyTimingPanel.tsx`** - Component showing reply timing insights (replaces health alerts)

### Modified Files
1. **`frontend/src/api/v2-types.ts`** - Add new types for qualification breakdown and extended sequence timing
2. **`frontend/src/api/v2Queries.ts`** - Add query hook for sequence qualification data
3. **`frontend/src/v2/pages/SequencesV2.tsx`** - Major refactor:
   - Remove health watchlist section
   - Add reply timing panel at top
   - Add qualification breakdown columns to table
   - Add expandable row section showing detailed classification
4. **`sms-insights/api/routes.ts`** - Add new API endpoint `/v2/sequences/qualification`
5. **`sms-insights/services/scoreboard.ts`** - Add per-sequence reply timing metrics to scoreboard query
6. **`frontend/src/v2/v2.css`** - Add styles for new qualification badges and reply timing visualizations

## Functions

### New Functions

**`sms-insights/services/sequence-qualification-analytics.ts`**
```typescript
export const buildSequenceQualificationBreakdown = async (params: {
  from: string;
  to: string;
  timezone: string;
}): Promise<SequenceQualificationBreakdownV2[]>;

// Internal helpers:
- aggregateQualificationBySequence(): Groups conversations by sequence and infers qualification
- extractSampleQuote(): Finds representative message showing the qualification signal
- calculateNicheFrequency(): Counts niche mentions per sequence
```

**`frontend/src/v2/components/ReplyTimingPanel.tsx`**
```typescript
export const ReplyTimingPanel: React.FC<{
  timing: ScoreboardV2['timing'];
  sequences: ScoreboardSequenceRow[];
}> = ({ timing, sequences }) => {
  // Shows:
  // - Overall median time to first reply (big metric)
  // - Reply rate by day of week (bar chart)
  // - Best performing hours (heatmap)
  // - Sequences ranked by reply speed
};
```

**`frontend/src/v2/components/SequenceQualificationBreakdown.tsx`**
```typescript
export const SequenceQualificationBreakdown: React.FC<{
  breakdown: SequenceQualificationBreakdownV2;
}> = ({ breakdown }) => {
  // Shows:
  // - Employment status badges (Full-time X%, Part-time Y%)
  // - Revenue mix badges (Cash-pay X%, Insurance Y%)
  // - Coaching interest indicator
  // - Top niches as tags
  // - Sample quotes on hover
};
```

### Modified Functions

**`frontend/src/v2/pages/SequencesV2.tsx`**
- Remove `healthWatchlist` useMemo and related UI section
- Add `replyTimingPanel` section at top
- Add new sort options: `medianReplyTime`, `fullTimePct`, `cashPayPct`
- Add qualification columns to table:
  - "Lead Profile" column with mini badges (FT/PT, Cash/Ins, High/Med/Low interest)
  - Expandable row shows full breakdown with sample quotes
- Modify `MergedSeqRow` type to include qualification data

**`sms-insights/services/scoreboard.ts`**
- Modify `buildScoreboard()` to include per-sequence timing:
  - Query for median/avg reply time per sequence
  - Query for reply rate by hour of day per sequence
- Add CTE to calculate time-to-first-reply per conversation

## Classes

No new classes needed - using functional React components and service modules.

## Dependencies

No new dependencies required. Using existing:
- `framer-motion` for animations (already in use)
- `recharts` or CSS-based bar charts (recommend CSS for simplicity)
- Existing database connection via `getPool()`

## Testing

1. **Backend**: Verify qualification aggregation query returns correct percentages
2. **Frontend**: 
   - Test reply timing panel renders with real scoreboard data
   - Test qualification breakdown shows correct badges
   - Test expandable rows show sample quotes
   - Test sorting by new qualification columns

## Implementation Order

1. **[Backend]** Create `sequence-qualification-analytics.ts` service with qualification aggregation logic
2. **[Backend]** Add API endpoint in `routes.ts` for sequence qualification data
3. **[Backend]** Extend `scoreboard.ts` to include per-sequence reply timing metrics
4. **[Frontend]** Add new types to `v2-types.ts`
5. **[Frontend]** Create `ReplyTimingPanel.tsx` component
6. **[Frontend]** Create `SequenceQualificationBreakdown.tsx` component
7. **[Frontend]** Add query hook in `v2Queries.ts`
8. **[Frontend]** Major refactor of `SequencesV2.tsx`:
   - Remove health watchlist
   - Add reply timing panel
   - Add qualification columns
   - Add expandable breakdown rows
9. **[Frontend]** Add CSS styles to `v2.css`
10. **[Testing]** Verify all data flows correctly and UI renders properly

## UI Design Notes

### Reply Timing Panel (replaces health alerts)
```
┌─────────────────────────────────────────────────────────────┐
│ ⏱️ Reply Timing Insights                                    │
├─────────────────────────────────────────────────────────────┤
│  Median Time to First Reply: 2h 34m                         │
│                                                             │
│  Reply Rate by Day:                                         │
│  Mon ████████ 18%  Tue ██████ 14%  Wed ██████████ 22%     │
│  Thu ██████ 12%  Fri ███████ 16%  Sat ██ 4%  Sun █ 2%       │
│                                                             │
│  Best Hours: 9am (28%), 2pm (24%), 11am (21%)              │
│                                                             │
│  Fastest Responding Sequences:                              │
│  1. Workshop v2 - 1h 12m median                             │
│  2. Hiring A - 1h 45m median                                │
└─────────────────────────────────────────────────────────────┘
```

### Sequence Table - New Columns
```
Sequence      │ Ver │ Sent │ Reply │ Booked │ Lead Profile        │ Opt-Out
──────────────┼─────┼──────┼───────┼────────┼─────────────────────┼─────────
Workshop v2   │ v2  │ 1,234│ 18.2% │   12   │ FT 67% • Cash 45%   │  2.1%
              │     │      │       │        │ High Interest 23%   │
Hiring A      │ v1  │  892 │ 14.5% │    8   │ PT 54% • Ins 62%    │  3.2%
              │     │      │       │        │ Med Interest 31%    │
```

### Expandable Row - Qualification Breakdown
```
┌─────────────────────────────────────────────────────────────┐
│ Lead Self-Identification Profile                              │
├─────────────────────────────────────────────────────────────┤
│ Employment:                                                 │
│   • Full-time practice owners: 67% (42 leads)               │
│     "I run a full time clinic in Texas"                     │
│   • Part-time / side hustle: 23% (14 leads)                 │
│     "Still working at a hospital part time"                 │
│   • Unknown: 10%                                            │
│                                                             │
│ Revenue Model:                                              │
│   • Mostly cash-pay: 45% (28 leads)                         │
│     "I'm all cash based, no insurance"                      │
│   • Mostly insurance: 32% (20 leads)                        │
│   • Balanced mix: 15% (9 leads)                             │
│                                                             │
│ Coaching Interest:                                          │
│   • High: 23%  • Medium: 31%  • Low: 12%  • Unknown: 34%   │
│                                                             │
│ Top Niches Mentioned:                                       │
│   Orthopedics (18)  Sports (12)  Pelvic Health (8)          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Reply Timing**: Already available in `ScoreboardV2.timing` - just needs per-sequence breakdown added
2. **Qualification Data**: 
   - Query `conversations` table joined with `conversation_state` 
   - Join with `sms_events` to get sequence attribution
   - Aggregate by sequence label, counting qualification fields
   - Extract sample quotes from inbound messages showing the qualification signal
