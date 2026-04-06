Implementation Plan

[Overview]
Add foreign key constraints to all conversation-related tables to enforce referential integrity and enable safe CASCADE deletes.

This is TASKS.md item DB-001 (Critical priority). Without FK constraints, orphaned rows can accumulate when conversations are deleted, leading to data corruption and broken queries. The FK constraints will cascade deletes automatically for related tables (sms_events, send_attempts, conversation_state, conversation_notes) and enforce referential integrity for others (draft_suggestions, work_items, booked_calls). Additionally, we need to resolve two gaps noted in the task: (1) clean up any orphaned rows before applying constraints to avoid violations, and (2) create a users table to resolve the user_id FK references in audit_logs and user_send_preferences.

Key risk: Applying FK constraints on tables with existing orphaned rows will fail. The migration must first audit for orphans, clean them, then apply constraints within a single transaction with a rollback plan.

[Types]
No new Prisma enum or model types are required beyond the existing ones. The FK constraints reference existing tables. A new `users` table will be created with TEXT primary key matching the current `user_id` TEXT pattern used in audit_logs and user_send_preferences.

```sql
CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

[Files]
One new migration SQL file will be created:
- `apps/backend/prisma/migrations/YYYYMMDDHHMMSS_add_foreign_keys/migration.sql`

The migration will be applied via `npm run --workspace=ptbizsms-api prisma:generate` and then `prisma migrate` to sync the Prisma schema.

After the database migration succeeds, the Prisma schema (`apps/backend/prisma/schema.prisma` or the unified schema) must be regenerated with `npx prisma db pull` followed by `npx prisma generate` so that the Prisma client reflects the new FK relationships.

Migration SQL content (applied inside a single transaction):

```sql
BEGIN;

-- Step 1: Create users table to resolve user_id FK gaps
CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed existing user_ids from audit_logs as users (optional but useful)
INSERT INTO users (user_id)
  SELECT DISTINCT user_id FROM audit_logs WHERE user_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Audit and clean orphaned rows BEFORE adding FK constraints
-- Delete orphaned sms_events (no matching conversation)
DELETE FROM sms_events WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned send_attempts (no matching conversation)
DELETE FROM send_attempts WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned conversation_state (no matching conversation)
DELETE FROM conversation_state WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned conversation_notes (no matching conversation)
DELETE FROM conversation_notes WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned draft_suggestions (no matching conversation)
DELETE FROM draft_suggestions WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned work_items (no matching conversation)
DELETE FROM work_items WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned booked_calls (no matching conversation)
DELETE FROM booked_calls WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Delete orphaned booked_call_reactions (no matching booked_call)
DELETE FROM booked_call_reactions WHERE booked_call_id NOT IN (SELECT id FROM booked_calls);

-- Step 3: Apply FK constraints
ALTER TABLE sms_events ADD CONSTRAINT fk_sms_events_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE send_attempts ADD CONSTRAINT fk_send_attempts_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE draft_suggestions ADD CONSTRAINT fk_draft_suggestions_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE work_items ADD CONSTRAINT fk_work_items_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE conversation_state ADD CONSTRAINT fk_conv_state_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE conversation_notes ADD CONSTRAINT fk_conv_notes_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE booked_calls ADD CONSTRAINT fk_booked_calls_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE booked_call_reactions ADD CONSTRAINT fk_booked_call_reactions_call
  FOREIGN KEY (booked_call_id) REFERENCES booked_calls(id) ON DELETE CASCADE;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_contact
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key);

ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user
  FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE user_send_preferences ADD CONSTRAINT fk_user_send_prefs_user
  FOREIGN KEY (user_id) REFERENCES users(user_id);

COMMIT;
```

[Functions]
No functions will be modified. New service-level functions may be added later to leverage FK relationships but that is out of scope.

[Classes]
No classes will be modified.

[Dependencies]
No dependency changes are required. The migration uses native PostgreSQL FK constraints.

[Testing]
After migration, verify:
1. `npx prisma generate` succeeds without errors
2. Query a conversation and verify its related sms_events return correctly
3. Attempt to insert an sms_event with a non-existent conversation_id — should fail with FK violation
4. Delete a test conversation and verify CASCADE removes related sms_events, send_attempts, conversation_state, and conversation_notes
5. Verify audit_logs.user_id still works with the new FK to users table

Validation commands:
- `npm run --workspace=ptbizsms-api lint`
- `npm run --workspace=ptbizsms-api prisma:generate`

[Implementation Order]
The implementation follows a safe migration sequence with rollback protection.

1. Create the Prisma migration file with the exact SQL above in `apps/backend/prisma/migrations/<timestamp>_add_foreign_keys/migration.sql`
2. Run `npm run --workspace=ptbizsms-api migrate:dev` (or apply the raw SQL migration via `npx prisma db execute`) to apply the migration
3. Run `npx prisma db pull` to sync Prisma schema with the database
4. Run `npm run --workspace=ptbizsms-api prisma:generate` to regenerate Prisma client
5. Verify migration success with `git branch -r` (already clean), then query DB to confirm FK constraints exist
6. Run backend lint: `npm run --workspace=ptbizsms-api lint`
7. Commit migration files, schema updates, and FK changes
