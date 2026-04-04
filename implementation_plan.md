# Implementation Plan: Fix Missing PostgreSQL Enum Types in Production

[Overview]
Single sentence: Fix the 11 missing PostgreSQL enum types in production by resolving the Railway deployment configuration error that blocks the already-committed migration from auto-applying.

The production database is missing 11 PostgreSQL enum types required by the Prisma schema, causing runtime errors in the Monday sync and inbox watch crons. A migration patch (`20260404_ensure_enums_exist`) exists in `apps/backend/prisma/migrations/` and has been committed and pushed (`b1d97179`). The Railway deployment pipeline CI/CD completed successfully but the actual deployment is blocked by a configuration error: "Could not find root directory: sms-insights". The `sms-insights` directory in the workspace is empty, and the actual application code lives in `apps/backend`. Once the Railway root directory setting is corrected, the deployment will proceed and the `postBuild = "npm run migrate:deploy"` hook will auto-apply the migration, creating all 11 missing enum types.

[Types]
No new types or interfaces need to be created - the migration SQL and Prisma schema already define all required enum types correctly.

The 11 PostgreSQL enum types that will be created by the migration:
- `SmsDirection`: 'inbound', 'outbound', 'unknown'
- `ConversationStatus`: 'open', 'closed', 'dnc'
- `CadenceStatus`: 'idle', 'podcast_sent', 'call_offered', 'nurture_pool'
- `DailyRunStatus`: 'success', 'error', 'pending'
- `MondayBookedCallPushStatus`: 'pending', 'synced', 'error', 'skipped'
- `MondaySyncStatus`: 'idle', 'running', 'success', 'error'
- `SendAttemptStatus`: 'blocked', 'queued', 'sent', 'failed', 'duplicate'
- `SequenceRegistryStatus`: 'active', 'inactive'
- `SequenceVersionStatus`: 'active', 'testing', 'rewrite', 'archived'
- `WorkItemSeverity`: 'low', 'med', 'high'
- `WorkItemType`: 'needs_reply', 'follow_up', 'hot_lead'

All defined in `apps/backend/prisma/schema.prisma` (lines 805-874) with matching SQL in `apps/backend/prisma/migrations/20260404_ensure_enums_exist/migration.sql`.

[Files]
Only one file modification is needed - delete a duplicate migration file that is not part of the Prisma migration structure.

- **Delete**: `prisma/migrations/20260404_fix_db_008.sql` - This is a duplicate of the enum creation logic that lives at the repository root level, not inside the Prisma migrations directory structure. It was pushed manually but is not used by Prisma's migration system. The actual migration that will be applied is at `apps/backend/prisma/migrations/20260404_ensure_enums_exist/migration.sql`.

- **No change needed**: `apps/backend/prisma/migrations/20260404_ensure_enums_exist/migration.sql` - Already correct, contains all 11 enum CREATE TYPE statements with EXCEPTION handling for idempotency.

- **No change needed**: `apps/backend/scripts/deploy-migrations.ts` - Already correct, contains REQUIRED_ENUMS list and proper verification logic.

- **No change needed**: `config/railway.toml` - Already correct, Dockerfile-based build with postBuild migration hook.

- **Railway Dashboard Action**: The Root Directory setting must be changed from `sms-insights` to either empty string (repository root) or `apps/backend`. This is a manual configuration change in the Railway dashboard, not a code change.

[Functions]
No functions need to be created, modified, or removed in the codebase. The deploy-migrations.ts script already contains:
- `verifyDatabase()` - verifies database connectivity (line 50)
- `verifyEnumsExist()` - checks all 11 REQUIRED_ENUMS exist (line 109)
- `verifyTableStructure()` - validates sms_events table columns (line 151)
- `deployMigrations()` - orchestrates the 5-step migration process (line 225)

The REQUIRED_ENUMS constant (lines 95-107) already lists all 11 enum types that the migration will create.

[Classes]
No classes need to be created, modified, or removed. The backend uses functional Express patterns with Prisma client, not OOP class structures.

[Dependencies]
No new packages need to be installed. All dependencies are already declared in `apps/backend/package.json`:
- `prisma: ^7.4.2` - handles migration execution
- `pg: ^8.11.3` - direct PostgreSQL connection for verification
- `tsx: ^4.21.0` - TypeScript execution for migration scripts

## Railway Configuration Fix (Manual - No Code Changes)

The "Could not find root directory: sms-insights" error originates from Railway's deployment configuration, not from the codebase. The `sms-insights` directory in the repository is empty (confirmed by file listing). The fix requires:

1. Open Railway dashboard at https://railway.app
2. Navigate to the project settings
3. Find the "Root Directory" or "Service Source" configuration
4. Change from `sms-insights` to either:
   - **Empty string / repository root** (recommended) - the Dockerfile at root handles the full monorepo build
   - **`apps/backend`** - if using direct Node.js deployment without Docker

After this change, trigger a new deployment and the migration will auto-apply.

[Testing]
No new tests need to be written - the migration is already validated by the CI/CD pipeline which passed all checks for commit `b1d97179`.

**Production verification after deployment:**
1. Query production database:
   ```sql
   SELECT typname FROM pg_type WHERE typcategory = 'E' ORDER BY typname;
   ```
   Should return all 11 enum types: CadenceStatus, ConversationStatus, DailyRunStatus, MondayBookedCallPushStatus, MondaySyncStatus, SendAttemptStatus, SequenceRegistryStatus, SequenceVersionStatus, SmsDirection, WorkItemSeverity, WorkItemType

2. Check Railway deployment logs for successful migration application - should see "Migrations deployed successfully" output from deploy-migrations.ts

3. Verify Monday sync cron runs without `PrismaClientKnownRequestError` for missing enum types

4. Verify inbox watch cron runs without enum-related errors

[Implementation Order]
The implementation is sequenced to minimize risk and ensure the deployment completes successfully.

1. **Railway Dashboard**: Fix Root Directory setting from `sms-insights` to repository root (manual action - this is the only required change)
2. **Trigger Railway Deploy**: Either auto-trigger via config change or manually redeploy from Railway dashboard
3. **Monitor Deployment**: Watch Railway logs for successful `npm run migrate:deploy` execution - should complete all 5 steps
4. **Verify Production Database**: Run SQL query to confirm all 11 enum types exist
5. **Verify Crons**: Confirm Monday sync and inbox watch crons run without errors
6. **Cleanup (optional)**: Delete `prisma/migrations/20260404_fix_db_008.sql` duplicate file to avoid confusion in future