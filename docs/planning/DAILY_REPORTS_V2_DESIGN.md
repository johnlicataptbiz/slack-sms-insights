# Daily Reports V2 — DB-Driven Architecture

## Problem Statement

The current daily reports system was designed before the inbox, fact tables, Monday.com integration, and contact profiles existed. It relies on a fragile pipeline:

```
Cron tick → Slack channel history fetch → regex text parsing → AI summary generation
→ post to Slack → log summary_text to daily_runs → frontend regex-parses the text again
```

**Failure modes (all observed in production):**
- Prisma Accelerate Cloudflare Worker exceeds resource limits on `$queryRawUnsafe()`
- Slack API rate limits / timeouts
- AI model latency / errors
- Text parsing breaks when summary format changes
- Maintenance task errors pollute `daily_runs` table (fixed in `a7b9fb2`)
- 2-day lag between report generation and report date
- No backfill capability — missed reports require manual intervention

## What Already Exists in the DB

The platform now has **pre-aggregated fact tables** that contain everything a daily report needs:

| Fact Table | Granularity | Key Metrics |
|---|---|---|
| `fact_sms_daily` | day × sequence × rep | messages_sent, unique_contacted, replies_received, opt_outs, reply_rate_pct, opt_out_rate_pct, booking_signals_sms |
| `fact_booking_daily` | day × sequence × rep | booked_total, booked_jack, booked_brandon, booked_self, booked_after_sms_reply, booking_rate_pct |
| `fact_lead_quality_daily` | day × sequence × rep | leads_count, progress_step_0-4, revenue_mix_*, employment_*, coaching_interest_*, avg_lead_score |
| `fact_monday_health_daily` | day × board | sync_status, is_stale, source/campaign/set_by/touchpoints coverage_pct, snapshot_count |

**Plus raw tables for drill-down:**
- `sms_events` — every SMS sent/received with timestamps, sequence, rep, contact
- `booked_calls` — every booked call with attribution
- `booked_call_attribution` — sequence/rep attribution for each booking
- `setter_activity` — Monday.com setter activity (stage, outcome, source)
- `inbox_contact_profiles` — enriched contact data (LRN, qualification, lead score)
- `trend_alerts` — automated trend detection alerts
- `work_items` — flagged issues requiring attention

## Proposed Architecture

### Core Concept: **Compute-on-Read Daily Reports**

Instead of generating and storing a text summary, the new system **computes the daily report on-demand** from fact tables when the user requests it.

```
Frontend requests /api/v2/daily-report/2026-03-13
  → API aggregates fact_sms_daily + fact_booking_daily + fact_lead_quality_daily
  → Returns structured JSON
  → Frontend renders rich, interactive report
```

### New API Endpoint

```
GET /api/v2/daily-report/:date
GET /api/v2/daily-report/:date?compare=prev_day|prev_week|prev_month
GET /api/v2/daily-report/range?from=2026-03-01&to=2026-03-14
```

**Response shape:**

```typescript
interface DailyReportV2 {
  date: string;                    // "2026-03-13"
  generatedAt: string;             // ISO timestamp
  
  // ── Top-line KPIs ──────────────────────────────────────
  kpis: {
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    optOuts: number;
    optOutRatePct: number;
    bookedTotal: number;
    bookingRatePct: number;
    bookingSignalsSms: number;
    leadsCount: number;
    avgLeadScore: number | null;
  };
  
  // ── Comparison to previous period ──────────────────────
  comparison?: {
    period: 'prev_day' | 'prev_week' | 'prev_month';
    kpis: DailyReportV2['kpis'];
    deltas: Record<keyof DailyReportV2['kpis'], number>;  // % change
  };
  
  // ── Breakdown by sequence ──────────────────────────────
  sequences: Array<{
    sequenceId: string;
    sequenceName: string;
    messagesSent: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedTotal: number;
    bookingRatePct: number;
    optOuts: number;
  }>;
  
  // ── Breakdown by rep ───────────────────────────────────
  reps: Array<{
    repId: string;
    repName: string;
    messagesSent: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedTotal: number;
  }>;
  
  // ── Lead quality snapshot ──────────────────────────────
  leadQuality: {
    total: number;
    progressDistribution: number[];  // [step0, step1, step2, step3, step4]
    revenueMix: { cash: number; insurance: number; balanced: number; unknown: number };
    coachingInterest: { high: number; medium: number; low: number; unknown: number };
  };
  
  // ── Monday.com health ──────────────────────────────────
  mondayHealth: Array<{
    boardId: string;
    boardClass: string;
    syncStatus: string | null;
    isStale: boolean;
    sourceCoveragePct: number;
    campaignCoveragePct: number;
  }>;
  
  // ── Alerts & work items ────────────────────────────────
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    createdAt: string;
  }>;
}
```

### New Service: `daily-report-v2.ts`

```typescript
// services/daily-report-v2.ts

export async function computeDailyReport(date: string): Promise<DailyReportV2> {
  const prisma = getPrismaClient();
  const targetDate = new Date(date);
  
  // 1. Aggregate fact_sms_daily for the target date
  const smsAgg = await prisma.fact_sms_daily.aggregate({
    where: { day: targetDate },
    _sum: {
      messages_sent: true,
      unique_contacted: true,
      replies_received: true,
      opt_outs: true,
      booking_signals_sms: true,
    },
  });
  
  // 2. Aggregate fact_booking_daily
  const bookingAgg = await prisma.fact_booking_daily.aggregate({
    where: { day: targetDate },
    _sum: {
      booked_total: true,
      booked_jack: true,
      booked_brandon: true,
      booked_self: true,
      booked_after_sms_reply: true,
    },
  });
  
  // 3. Aggregate fact_lead_quality_daily
  const leadAgg = await prisma.fact_lead_quality_daily.aggregate({
    where: { day: targetDate },
    _sum: { leads_count: true, /* ... */ },
    _avg: { avg_lead_score: true },
  });
  
  // 4. Group by sequence for breakdown
  const bySequence = await prisma.fact_sms_daily.groupBy({
    by: ['sequence_id'],
    where: { day: targetDate },
    _sum: { messages_sent: true, replies_received: true, opt_outs: true },
  });
  
  // 5. Group by rep for breakdown
  const byRep = await prisma.fact_sms_daily.groupBy({
    by: ['rep_id'],
    where: { day: targetDate },
    _sum: { messages_sent: true, replies_received: true },
  });
  
  // 6. Monday health
  const mondayHealth = await prisma.fact_monday_health_daily.findMany({
    where: { day: targetDate },
  });
  
  // 7. Trend alerts for the date
  const alerts = await prisma.trend_alerts.findMany({
    where: { created_at: { gte: targetDate, lt: nextDay(targetDate) } },
  });
  
  // Assemble and return structured report
  return { date, generatedAt: new Date().toISOString(), kpis: { ... }, ... };
}
```

### Migration Path

| Phase | What Changes | Risk |
|---|---|---|
| **Phase 1: Add new endpoint** | Add `GET /api/v2/daily-report/:date` alongside existing system | Zero — additive only |
| **Phase 2: New frontend page** | Build `DailyReportV2` page component using structured JSON | Zero — new route, old page untouched |
| **Phase 3: Wire up RunsV2** | Replace text-parsing RunsV2 with new DB-driven component | Low — feature flag toggle |
| **Phase 4: Simplify cron** | Cron only refreshes fact tables + optional Slack post | Medium — remove report generation from cron |
| **Phase 5: Deprecate old system** | Remove `daily-report-summary.ts`, text parsing, `$queryRawUnsafe` | Low — after validation period |

### Benefits

| Current System | New System |
|---|---|
| Depends on Slack API for data | Queries DB fact tables directly |
| Prisma Accelerate `$queryRawUnsafe` hits Cloudflare limits | Simple `aggregate()` / `groupBy()` — lightweight queries |
| AI-generated text summary | Structured JSON — deterministic, testable |
| Frontend regex-parses text | Frontend renders structured data |
| No backfill capability | Any historical date available instantly |
| 2-day lag | Real-time (fact tables updated continuously) |
| Single text blob | Rich breakdowns by sequence, rep, lead quality, Monday health |
| Cron failure = missing report | Compute-on-read = always available if data exists |
| ~6.5s generation time | ~200ms query time (indexed fact tables) |

### What the Cron Becomes

The cron scheduler's role simplifies to:
1. **Refresh fact tables** — aggregate raw `sms_events` + `booked_calls` into fact tables (already happening)
2. **Optional Slack notification** — post a summary to Slack channel (but Slack is no longer the source of truth)
3. **Trend detection** — run `trend_alerts` analysis
4. **Monday sync** — sync Monday.com data (already happening)

The cron **no longer generates or stores reports**. Reports are computed on-demand from fact tables.

### Open Questions

1. **Fact table freshness** — How frequently are fact tables refreshed? If there's a lag, the daily report endpoint should indicate data freshness.
2. **Historical data** — Do fact tables have data going back to the beginning, or only from when they were introduced?
3. **Slack post** — Should the cron still post a summary to Slack? If so, it can use the same `computeDailyReport()` function to generate structured data, then format it as Slack blocks.
4. **Report caching** — Should computed reports be cached in a `daily_report_snapshots` table for performance? (Probably not needed given ~200ms query time.)

---

*Created: 2026-03-14*
*Status: Proposal — awaiting review*
