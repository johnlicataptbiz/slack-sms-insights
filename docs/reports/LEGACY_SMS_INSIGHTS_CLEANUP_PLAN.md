# Legacy `sms-insights` Cleanup Plan

## Current State
- Active runtime/workspaces are `apps/backend` and `apps/frontend`.
- `sms-insights/` is a legacy duplicate tree.
- Inventory comparison:
  - Common relative paths between `sms-insights/` and `apps/backend/`: `287`
  - Byte-identical: `158`
  - Diverged: `129`

## Blocker Removed
- The scheduled report workflow no longer depends on `sms-insights/`.
- Updated workflow: `.github/workflows/generate-live-report.yml`
  - Now installs from root lockfile
  - Runs `npm run --workspace=ptbizsms-api generate:db-report`
  - Commits `apps/backend/LIVE-DATABASE-REPORT.md`

## Files To Preserve Before Removing `sms-insights/`
These appear unique in `sms-insights/` and should be reviewed/copied if still needed:

- Analytics migration helpers:
  - `sms-insights/services/analytics-schema-bootstrap.ts`
  - `sms-insights/scripts/run-analytics-migration.mjs`
  - `sms-insights/scripts/backfill-sms-events-analytics.ts`
  - `sms-insights/scripts/run-schema-bootstrap.ts`
  - `sms-insights/ANALYTICS_MIGRATION_README.md`
- Legacy SQL migrations not present in `apps/backend`:
  - `sms-insights/prisma/migrations/20260402_add_analytics_schema_baseline/migration.sql`
  - `sms-insights/prisma/migrations/20260403_db_compliance_fixes/migration.sql`
- Ad-hoc Monday/DB diagnostics (optional to preserve):
  - `sms-insights/backfill-monday-boards.mjs`
  - `sms-insights/generate-monday-mapping.mjs`
  - `sms-insights/inspect-board-items.mjs`
  - `sms-insights/monday-sync-manager.mjs`
  - `sms-insights/test-monday-api.mjs`

## Safe Removal Scope
After preserve/copy decisions are complete, remove:

- Entire legacy app tree: `sms-insights/`
- Any docs that still instruct `cd sms-insights` (update references to `apps/backend`)

## Recommended Execution Order
1. Copy approved preserve files from `sms-insights/` into `apps/backend/` (or `archive/legacy/`).
2. Run checks:
   - `npm run --workspace=ptbizsms-api generate:db-report`
   - `npm run --workspace=ptbizsms-api sync:monday -- --help` (sanity for script wiring)
3. Remove `sms-insights/`.
4. Sweep stale references:
   - Search pattern: `sms-insights/|cd sms-insights`
5. Open one PR focused only on legacy tree removal + doc path updates.

## Notes
- There are still many historical mentions of `sms-insights` in docs/reports. They are non-runtime, but should be updated to reduce onboarding confusion.
