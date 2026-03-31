# Implementation Plan

[Overview]
Implement a production-safe, read-only 90-day booked-calls analytics capability that reports comprehensive metrics linking booked calls to surrounding SMS events and outcomes.

The goal is to provide an actionable analytics layer for the last 90 days without changing schema or running risky migrations. The existing codebase already contains strong primitives in `services/booked-calls.ts`, `services/booked-call-attribution-refresh.ts`, and `services/sales-metrics.ts`, plus `booked_calls`, `booked_call_attribution`, and `sms_events` tables in Prisma. This plan composes those assets into a dedicated report service and API endpoint focused on booked-call intelligence.

Scope includes: a new backend service to compute 90-day aggregates, distribution tables, trend series, and attribution quality slices; an API route to return this payload for dashboard/report consumers; and tests for correctness and edge cases. Scope excludes DB schema changes, enum/table migrations, or write-path modifications. All operations remain read-only against Railway production DB via Prisma.

[Types]
Add explicit TypeScript response contracts for a 90-day analytics envelope centered on booked calls and contextual SMS/outcomes.

Define the following types (in new `sms-insights/services/booked-calls-90d-report.ts`):

- `BookedCalls90dSummary`
  - `window`: `{ from: string; to: string; timezone: string; days: number }`
  - `totals`:
    - `bookedCallsTotal: number`
    - `bookedCallsAttributed: number`
    - `bookedCallsUnattributed: number`
    - `bookedCallsNeedsReview: number`
    - `bookedCallsSelfBooked: number`
    - `bookedCallsSetterAttributed: number`
    - `smsLinkedBookedCalls: number`
    - `nonSmsOrUnknownBookedCalls: number`
  - `rates`:
    - `attributionCoveragePct: number`
    - `needsReviewPct: number`
    - `smsLinkedPct: number`
- `BookedCalls90dTrendPoint`
  - `day: string` (`YYYY-MM-DD`)
  - `bookedCalls: number`
  - `smsLinkedBookedCalls: number`
  - `needsReviewBookedCalls: number`
  - `selfBookedCalls: number`
  - `setterAttributedCalls: number`
- `BookedCalls90dSequenceRow`
  - `sequenceLabel: string`
  - `bookedCalls: number`
  - `smsEventsBeforeBookingAvg: number`
  - `inboundBeforeBookingAvg: number`
  - `outboundBeforeBookingAvg: number`
  - `medianMinutesFirstInboundToBooked: number | null`
- `BookedCalls90dOutcomeRow`
  - `outcome: string`
  - `bookedCalls: number`
  - `sharePct: number`
- `BookedCalls90dSetterRow`
  - `setterName: string`
  - `bookedCalls: number`
  - `needsReview: number`
  - `smsLinked: number`
  - `conversionSignalsAvg: number`
- `BookedCalls90dPayload`
  - `summary: BookedCalls90dSummary`
  - `trendByDay: BookedCalls90dTrendPoint[]`
  - `topSequences: BookedCalls90dSequenceRow[]`
  - `outcomeBreakdown: BookedCalls90dOutcomeRow[]`
  - `setterBreakdown: BookedCalls90dSetterRow[]`
  - `diagnostics`:
    - `dataQualityWarnings: string[]`
    - `generatedAt: string`

Validation rules:

- Percentages rounded to 2 decimals.
- Trend sorted ascending by day.
- Top lists capped (e.g., top 15 sequences, top 15 setters).
- Null-safe aggregation when fields are absent (`first_conversion`, `resolved_sequence_label`, `outcome`, `attribution_status`).

[Files]
Add one report service and one API route, plus tests; no schema file changes.

- **New files**
  - `sms-insights/services/booked-calls-90d-report.ts`
    - Main read-only analytics builder for booked-call metrics in last 90 days.
  - `sms-insights/tests/services/booked-calls-90d-report.test.ts`
    - Unit tests for aggregation logic, edge cases, and payload shape.

- **Existing files to modify**
  - `sms-insights/api/routes.ts`
    - Register a new GET endpoint for the report (e.g., `/api/analytics/booked-calls-90d`).
  - `sms-insights/api/validation.ts` (if route schema helpers are centralized)
    - Add query validation for optional `from`, `to`, `timezone`, `limit`.
  - `sms-insights/services/logger.ts` (optional if needed for structured event name constants)
    - Reuse existing logger patterns; avoid console output.
  - `sms-insights/tests/api/route-security.test.ts` or relevant API test file
    - Add route-level response/assertions for auth/shape if pattern exists.

- **No files deleted/moved**
- **No config/infra changes**
  - No `prisma/schema.prisma` edits.
  - No migration folder changes.
  - No Railway config changes.

[Functions]
Add focused analytics functions and wire them into an API handler.

- **New functions**
  - `getBookedCalls90dReport(params, logger): Promise<BookedCalls90dPayload>`
    - File: `sms-insights/services/booked-calls-90d-report.ts`
    - Purpose: orchestrates all read queries and computes final payload.
  - `buildWindow(params): { from: Date; to: Date; timezone: string; days: number }`
    - Purpose: standardize default 90-day window and optional overrides.
  - `aggregateBookedCallsSummary(rows): BookedCalls90dSummary`
    - Purpose: totals and rates across attribution/sms-linked coverage.
  - `buildTrendByDay(rows, timezone): BookedCalls90dTrendPoint[]`
    - Purpose: daily time series.
  - `buildSequenceBreakdown(rows): BookedCalls90dSequenceRow[]`
    - Purpose: sequence-centric booked-call performance.
  - `buildOutcomeBreakdown(rows): BookedCalls90dOutcomeRow[]`
    - Purpose: booked-call outcomes summary.
  - `buildSetterBreakdown(rows): BookedCalls90dSetterRow[]`
    - Purpose: setter-level performance and review pressure.
  - `computeDiagnostics(rows): { dataQualityWarnings: string[]; generatedAt: string }`
    - Purpose: quality signals (missing sequence/outcome/etc.).

- **Modified functions**
  - Route registration function in `sms-insights/api/routes.ts`
    - Add GET handler that invokes `getBookedCalls90dReport`.
  - Existing validation middleware map (if present)
    - Add parsing for optional query params with sane limits.

- **No removed functions**

[Classes]
No class additions or modifications are required; implementation is functional and service-oriented.

The codebase uses function-first service modules with Prisma queries and plain objects. The new report module should follow this established pattern and not introduce class-based abstractions.

[Dependencies]
No dependency changes are required.

Use existing stack:

- `@prisma/client` for data access
- existing logger interfaces (`@slack/bolt` logger shape / pino adapters already in project)
- built-in Date/time handling already used in current services

No new npm packages should be added for this scope.

[Testing]
Add service-level tests and route-level assertions for payload stability and correctness.

- **New tests**
  - `sms-insights/tests/services/booked-calls-90d-report.test.ts`
    - Validates:
      - default 90-day window behavior
      - null/missing attribution fields handling
      - trend sorting and deterministic rounding
      - sequence/outcome/setter breakdown correctness
      - diagnostic warnings generation
- **Route tests**
  - Extend existing API test suite to verify:
    - endpoint responds 200 with expected envelope fields
    - invalid query parameters return validation error
    - optional query overrides are accepted
- **Runtime verification**
  - smoke test endpoint in deployed environment after release
  - compare headline totals vs existing `sales-metrics`/booked calls snapshots for sanity

[Implementation Order]
Implement report service first, then API exposure, then tests and smoke verification.

1. Create `booked-calls-90d-report.ts` with all types and pure aggregation helpers.
2. Add Prisma read queries for booked calls + attribution + contextual SMS/outcome fields within 90-day window.
3. Build summary, trend, sequence, outcome, setter, diagnostics sections.
4. Wire new GET endpoint in `api/routes.ts` with validation and structured logging.
5. Add/extend tests for service and route behavior.
6. Run backend lint/tests; fix regressions.
7. Perform production-safe smoke call to new endpoint and verify payload sanity.
8. Document usage example (query params + sample response keys) in code comments or existing docs section.
