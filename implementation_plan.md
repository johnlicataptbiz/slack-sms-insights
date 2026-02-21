# Implementation Plan

[Overview]
Canonicalize Daily Runs so the dashboard shows exactly one “best” run per day per channel, eliminating duplicates and placeholder confusion.

The Daily Runs UI currently lists raw `daily_runs` rows returned by `GET /api/runs`, which are ordered by `timestamp DESC` and filtered only by `timestamp > NOW() - INTERVAL '<daysBack> days'`. This allows multiple runs per day to appear (e.g., multiple triggers, retries, historical backfills) and also allows “placeholder” backfill rows to appear even when a real run exists for the same `report_date`.

We will implement canonicalization in the backend `getDailyRuns()` query path so the frontend receives a deduped list by default. Canonicalization rules:
- Group by `(channel_id, report_type, canonical_day)` where `canonical_day` is:
  - `report_date` when present (historical/backfilled runs)
  - otherwise `DATE(timestamp AT TIME ZONE 'UTC')` (or `DATE(timestamp)` in Postgres, which is UTC for timestamptz casts)
- Prefer non-placeholder runs over placeholder runs.
- Prefer `status='success'` over `pending` over `error` (optional but recommended for robustness).
- Prefer the most recent `timestamp` among remaining candidates.

We will also harden the backfill/trigger scripts so they do not create placeholder runs when a real run exists for the same `(channel_id, report_type, report_date)`.

This approach keeps the database append-only (no destructive deletes required), preserves auditability, and makes the UI stable and understandable.

[Types]
Type system changes are limited to adding explicit “canonicalization” metadata and placeholder detection helpers.

Backend (TypeScript) additions in `sms-insights/services/daily-run-logger.ts`:
- `export type DailyRunCanonicalKey = { channel_id: string; report_type: DailyRunRow["report_type"]; day: string }`
- `export type DailyRunCanonicalizationOptions = {`
  - `mode: 'canonical-per-day' | 'raw'` (default `'canonical-per-day'`)
  - `preferStatusOrder?: Array<DailyRunRow["status"]>` (default `['success','pending','error']`)
  - `placeholderPredicate?: (row: DailyRunRow) => boolean` (default uses summary/full_report heuristics)
  - `}`

Frontend types remain unchanged because the API response shape stays `{ runs: Run[] }`. We will not require the frontend to implement dedupe logic.

Placeholder detection helper:
- `export const isPlaceholderRun = (row: Pick<DailyRunRow,'summary_text'|'full_report'|'duration_ms'>): boolean`
  - Returns true if `summary_text` starts with `"Backfilled placeholder run"` (case-insensitive) OR `full_report` contains that phrase.
  - Optionally treat `duration_ms === 0` as a weak signal only when combined with the phrase (avoid false positives).

[Files]
Changes will modify backend run listing and add canonicalization utilities; scripts will be updated to avoid placeholder creation when a real run exists.

Existing files to modify:
- `sms-insights/services/daily-run-logger.ts`
  - Add placeholder detection helper.
  - Add a new canonicalized query function (or extend `getDailyRuns`) to return one run per day per channel.
  - Ensure `getChannelsWithRuns` remains correct (may optionally count canonical runs vs raw; keep raw for now).
- `sms-insights/api/routes.ts`
  - Keep `GET /api/runs` but make it return canonicalized runs by default.
  - Add an opt-out query param `raw=true` to return raw rows for debugging/admin use.
- `sms-insights/scripts/trigger-historical-reports.ts`
  - Before calling `logDailyRun` for a `reportDate`, check if a non-placeholder run already exists for that `(channel_id, report_type='daily', report_date=date)`; if so, skip.
- (Optional) `sms-insights/scripts/backfill-daily-runs.ts`
  - This script currently only updates `report_date` and `summary_text` for existing rows; no placeholder creation. No change required unless we want it to also mark placeholders or normalize.
- (Optional) `sms-insights/scripts/cleanup-daily-runs.ts`
  - Keep as-is; it’s a conservative dedupe-by-content tool. Not required for canonicalization.

No new files are strictly required, but if we want cleaner separation:
- New file (optional): `sms-insights/services/daily-run-canonicalizer.ts`
  - Contains SQL and helper functions for canonicalization.

No files will be deleted.

[Functions]
We will add/modify functions to support canonical run selection and script safety checks.

1) `isPlaceholderRun`
- Signature:
  - `export const isPlaceholderRun = (row: Pick<DailyRunRow, 'summary_text' | 'full_report' | 'duration_ms'>): boolean`
- Behavior:
  - Returns true if the run appears to be a placeholder backfill.
- Error handling:
  - Pure function; no throws.

2) `getDailyRunsCanonicalPerDay` (new) OR extend `getDailyRuns`
- Signature (option A - new function):
  - `export const getDailyRunsCanonicalPerDay = async (options: { channelId?: string; limit?: number; offset?: number; daysBack?: number; reportType?: DailyRunInput['reportType'] }, logger?: Pick<Logger,'warn'>): Promise<DailyRunRow[]>`
- Purpose:
  - Return one canonical run per day per channel (and per report_type) within the lookback window.
- Key details:
  - Uses a SQL query with window functions:
    - Compute `canonical_day = COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date)`
    - Compute `is_placeholder` via SQL `CASE` using `summary_text ILIKE 'backfilled placeholder run%' OR full_report ILIKE '%backfilled placeholder run%'`
    - Rank rows per `(channel_id, report_type, canonical_day)` by:
      1. `is_placeholder ASC` (false first)
      2. `status` order (success first) (implemented via `CASE status WHEN 'success' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END`)
      3. `timestamp DESC`
    - Select `WHERE rn = 1`
  - Apply `daysBack` filter using `timestamp > NOW() - INTERVAL '<daysBack> days'` (keeps current behavior).
  - Order final results by `timestamp DESC` (or by `canonical_day DESC` then timestamp).
- Error handling:
  - Catch DB errors and return `[]` with logger warn (consistent with existing style).

3) `handleGetRuns` (modify)
- Signature unchanged.
- Behavior changes:
  - If `raw=true` query param: call existing raw `getDailyRuns`.
  - Else: call canonicalized function.
- Return shape unchanged: `{ runs }`.

4) `hasNonPlaceholderRunForReportDate` (new helper for scripts)
- Signature:
  - `export const hasNonPlaceholderRunForReportDate = async (args: { channelId: string; reportType: DailyRunInput['reportType']; reportDate: string }, logger?: Pick<Logger,'warn'>): Promise<boolean>`
- Behavior:
  - Query `daily_runs` for matching `channel_id`, `report_type`, `report_date = $date` and `NOT is_placeholder`.
  - Return true if any exists.
- Used by `trigger-historical-reports.ts` to skip inserting duplicates/placeholders.

[Changes]
Implementation will canonicalize at the API layer (backend) and harden scripts to avoid creating confusing rows.

1. Add placeholder detection logic
   - Implement `isPlaceholderRun` in `sms-insights/services/daily-run-logger.ts`.
   - Mirror the same predicate in SQL for canonicalization ranking.

2. Implement canonicalized query
   - Add `getDailyRunsCanonicalPerDay` using a CTE + `ROW_NUMBER()` partitioned by `(channel_id, report_type, canonical_day)`.
   - Ensure `channelId` filter is supported.
   - Ensure `limit/offset` apply to the final canonicalized result set (not the raw rows).

3. Update API route behavior
   - In `sms-insights/api/routes.ts` `handleGetRuns`, parse `raw` query param.
   - Default to canonicalized results.
   - Keep response `{ runs }` unchanged.

4. Harden historical trigger script
   - In `sms-insights/scripts/trigger-historical-reports.ts`, before `logDailyRun`, call `hasNonPlaceholderRunForReportDate`.
   - If true, log and `continue` to next date.
   - This prevents re-running the script from creating duplicates for the same day.

5. Verification
   - Call `GET /api/runs?daysBack=7&limit=50` and confirm it returns ~1 per day (per channel) and excludes placeholder when a real run exists.
   - Confirm `raw=true` still returns all rows for debugging.

[Tests]
Testing will focus on canonicalization correctness and placeholder suppression.

Unit tests (backend):
- Add tests for `isPlaceholderRun`:
  - Detects placeholder via `summary_text` prefix.
  - Detects placeholder via `full_report` containing phrase.
  - Does not mark normal runs as placeholder.
- Add tests for canonicalization ranking logic (prefer non-placeholder, prefer success, prefer latest timestamp).
  - If SQL is hard to unit test, extract ranking comparator into a pure function and test it, and keep SQL aligned.

Integration tests:
- Add a test for `GET /api/runs` handler (or service-level test) using a seeded in-memory/temporary DB (if existing test infra supports it) OR mock `getPool().query`.
- Validate:
  - Multiple rows for same day collapse to one.
  - Placeholder is excluded when a real run exists for same day.
  - `raw=true` returns raw list.

Edge cases:
- Days where only placeholder exists: placeholder should be returned (since it’s the only available run).
- Mixed `report_date` and null `report_date` for same day: ensure grouping uses `report_date` when present; otherwise timestamp date.
- Multiple channels: canonicalization is per channel.
- Manual/test report types: ensure canonicalization applies only to `report_type='daily'` unless explicitly desired; default should canonicalize all types or only daily (decide in implementation; recommended: canonicalize all types but keep `report_type` in partition key).

Performance:
- Query uses window functions; ensure indexes on `(channel_id, timestamp)` exist (they do). Consider adding `(channel_id, report_type, report_date)` index if needed later.
