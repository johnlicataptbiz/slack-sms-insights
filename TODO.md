# Fix: Switch Database Connection from Public to Private Endpoint

## Goal
Remove hardcoded public Railway TCP proxy URLs from scripts and use `process.env.DATABASE_URL`
so the production app can be pointed at the private endpoint (no egress fees).

## Steps

- [x] Audit codebase for hardcoded public URLs and `DATABASE_URL` usage
- [x] Update `sms-insights/scripts/clear-bad-backfill.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Update `sms-insights/scripts/investigate-bookings.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Update `sms-insights/scripts/cleanup-booked-calls-dupes.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Rebuild: `cd sms-insights && npm run build`
- [x] Fix `DATABASE_URL` Railway variable via CLI — set to private endpoint `postgres.railway.internal:5432`
- [x] Deploy via `railway up` from repo root — new deployment confirmed: ✅ Database connection pool initialized

---

# Fix: V2 Dashboard Showing Wrong Booked Call Counts

## Root Cause
Two critical bugs caused the v2 dashboard to show `canonicalBookedCalls: 2` and
`bookedCredit: { total:2, jack:0, brandon:0, selfBooked:0 }` for 2026-02-23 (should be 4 / jack:2, brandon:1, selfBooked:1).

## Bugs Fixed

### Bug 1 — `sms-insights/api/validation.ts` ✅
`salesMetricsSchema` only accepted `range: z.enum(['1d','7d','30d','90d']).default('7d')`.
The `day`, `from`, `to`, `tz` params were silently stripped by Zod, so every `/api/sales-metrics`
request fell back to the 7-day default regardless of what the caller passed.

**Fix:** Added `day` (YYYY-MM-DD regex), `from`, `to`, `tz` as optional fields.
Changed `range` enum to `['today','7d','30d'].optional()` (removed `'1d'`/`'90d'` which
`resolveMetricsRange` never handled).

### Bug 2 — `sms-insights/services/sales-metrics-contract.ts` ✅
`buildCanonicalSalesMetricsSlice` had three sub-bugs:
1. `totals.booked` used `summary.totals.booked` (SMS heuristic count = 2) instead of `bookedCalls.totals.booked` (Slack count = 4)
2. `trendByDay[].booked` used `base.booked` (SMS heuristic) — `bookedByDay` map was built but never used
3. `bookedCalls` return value hardcoded `{ jack:0, brandon:0, selfBooked:0 }` instead of passing through `bookedCalls.totals`

**Fix:**
- `totals.booked` → `bookedCalls.totals.booked`
- `trendByDay[].booked` → `bookedByDay.get(day)?.booked ?? base.booked`
- `bookedCalls` return → `bookedCalls.totals` (passes jack/brandon/selfBooked through to `toSalesMetricsV2`)

### Bug 3 — `sms-insights/api/v2-contract.ts` (TODO, lower priority)
`reps[].canonicalBookedCalls` is always 0 because `repLeaderboard` rows only carry SMS heuristic
signals. Slack booked-calls are attributed to jack/brandon/selfBooked buckets but not joined to
the rep leaderboard. Added TODO comment; fix requires cross-referencing `bookedCalls.totals.jack/brandon`
with `repName`.

## Steps

- [x] Read and audit `booked-calls.ts`, `booked-calls-store.ts`, `sales-metrics-contract.ts`, `v2-contract.ts`, `validation.ts`, `routes.ts`
- [x] Fix `sms-insights/api/validation.ts` — `salesMetricsSchema` now passes `day`/`from`/`to`/`tz` through
- [x] Fix `sms-insights/services/sales-metrics-contract.ts` — use Slack booked-calls as canonical source for totals, trendByDay, and bookedCalls breakdown
- [x] Add TODO comment in `sms-insights/api/v2-contract.ts` for Bug 3 (`reps[].canonicalBookedCalls`)
- [x] TypeScript compile check — zero errors
- [x] Deploy via `railway up --service sms-insights` and verify `/api/v2/sales-metrics?day=2026-02-23&tz=America/Chicago` returns `canonicalBookedCalls:4`, `bookedCredit:{total:4,jack:2,brandon:1,selfBooked:1}` ✅ CONFIRMED
