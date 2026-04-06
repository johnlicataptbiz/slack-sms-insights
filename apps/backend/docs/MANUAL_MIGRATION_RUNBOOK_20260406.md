# Manual Migration Runbook (2026-04-06)

Use this runbook to manually gate migration rollout for the missing-table fix and related Prisma migrations.

## Scope
- Source-of-truth migration for missing tables:
  - `apps/backend/prisma/migrations/20260406_add_missing_tables/migration.sql`
- Expected tables:
  - `sequenceAliases`
  - `booked_call_attribution`
  - `attribution_review_queue`

## Preflight
Run from repo root:

```bash
npm run --workspace=ptbizsms-api prisma:generate
npm run --workspace=ptbizsms-api migrate:status
```

Validate:
- `DATABASE_URL` points to the intended environment.
- `_prisma_migrations` is reachable.
- Pending migrations are visible.

Optional direct DB precheck:

```sql
SELECT 1;
SELECT COUNT(*) FROM _prisma_migrations;
```

## Apply (Manual Gate)
Run:

```bash
npm run --workspace=ptbizsms-api migrate:deploy
```

This uses `apps/backend/scripts/deploy-migrations.ts` and includes:
- DB connectivity check
- enum precheck
- schema validation
- migration deployment (with drift fallback path)

## Post-Apply Verification
Run smoke queries:

```sql
SELECT to_regclass('"sequenceAliases"') AS sequence_aliases_table;
SELECT to_regclass('"booked_call_attribution"') AS booked_call_attribution_table;
SELECT to_regclass('"attribution_review_queue"') AS attribution_review_queue_table;

SELECT to_regclass('"sequenceAliases_rawLabel_key"') AS idx_sequence_aliases_raw_label;
SELECT to_regclass('"idx_booked_call_attribution_event_ts"') AS idx_booked_attr_event_ts;
SELECT to_regclass('"uniq_attribution_review_queue_booked_call_id"') AS idx_attr_review_unique;
```

Also validate runtime health:
- `GET /api/health`
- `GET /api/alerts/status`
- `POST /api/alerts/webhook` (known-good payload)
- Automated smoke:
  ```bash
  BACKEND_BASE_URL=https://<backend-host> npm run --workspace=ptbizsms-api smoke:alerts
  ```

## Failure Mitigation (Required)
If migration apply fails:
1. Stop rollout and do not continue app promotion.
2. Capture exact migration error and migration name.
3. Inspect migration state:
   ```sql
   SELECT migration_name, finished_at, rolled_back_at, logs
   FROM _prisma_migrations
   ORDER BY started_at DESC
   LIMIT 20;
   ```
4. Resolve DB dependency blockers before retry (example from 2026-04-06):
   - Migration `20260404_fix_sms_events_columns` failed because view `analytics_booked_call_attribution_v` depends on `sms_events.direction` type change.
5. Apply mitigation in controlled SQL change:
   - Drop or recreate dependent view around the column type migration, or update migration ordering.
6. Re-run `migrate:status`, then `migrate:deploy`.

Do not mark failed migrations as applied unless explicitly reviewed and approved.
