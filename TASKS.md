# Tasks

## Active

### 🔴 DB-001 — Add Foreign Keys to All Conversation-Related Tables

**Priority:** Critical | **Effort:** ~2 hours | **Impact:** Prevents data corruption; enables safe CASCADE deletes

Add the following foreign key constraints:

```sql
-- sms_events → conversations
ALTER TABLE sms_events ADD CONSTRAINT fk_sms_events_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- send_attempts → conversations
ALTER TABLE send_attempts ADD CONSTRAINT fk_send_attempts_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- draft_suggestions → conversations
ALTER TABLE draft_suggestions ADD CONSTRAINT fk_draft_suggestions_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- work_items → conversations
ALTER TABLE work_items ADD CONSTRAINT fk_work_items_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- conversation_state → conversations
ALTER TABLE conversation_state ADD CONSTRAINT fk_conv_state_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- conversation_notes → conversations
ALTER TABLE conversation_notes ADD CONSTRAINT fk_conv_notes_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- booked_calls → conversations
ALTER TABLE booked_calls ADD CONSTRAINT fk_booked_calls_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- booked_call_reactions → booked_calls
ALTER TABLE booked_call_reactions ADD CONSTRAINT fk_booked_call_reactions_call
  FOREIGN KEY (booked_call_id) REFERENCES booked_calls(id) ON DELETE CASCADE;

-- conversations → inbox_contact_profiles
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_contact
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key);
```

- [ ] Migrate in a transaction with a rollback plan — existing orphaned rows will cause constraint violations; audit and clean first
- [ ] Create a users table (or document Slack-derived user_id format) to resolve audit_logs.user_id and user_send_preferences.user_id FK gaps

---

### 🔴 DB-002 — Index High-Growth Tables (sms_events & send_attempts)

**Priority:** Critical | **Effort:** ~1 hour | **Impact:** 10–100× query speedup; prevents full table scans at scale

```sql
-- sms_events (highest growth — every inbound/outbound SMS)
CREATE INDEX idx_sms_events_conversation_id   ON sms_events(conversation_id);
CREATE INDEX idx_sms_events_event_ts           ON sms_events(event_ts DESC);
CREATE INDEX idx_sms_events_direction_created  ON sms_events(direction, created_at DESC);
CREATE INDEX idx_sms_events_contact_key        ON sms_events(contact_key);
CREATE INDEX idx_sms_events_conv_ts            ON sms_events(conversation_id, event_ts DESC);

-- send_attempts (high growth + frequent status queries)
CREATE INDEX idx_send_attempts_conversation_id ON send_attempts(conversation_id);
CREATE INDEX idx_send_attempts_status_created  ON send_attempts(status, created_at DESC);
CREATE INDEX idx_send_attempts_idempotency     ON send_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_send_attempts_conv_status     ON send_attempts(conversation_id, status);

-- audit_logs (compliance + debugging)
CREATE INDEX idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource    ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at  ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action      ON audit_logs(action, created_at DESC);

-- conversations (frequent lookups)
CREATE INDEX idx_conversations_contact_key  ON conversations(contact_key);
CREATE INDEX idx_conversations_status       ON conversations(status);
CREATE INDEX idx_conversations_rep_id       ON conversations(current_rep_id);
CREATE INDEX idx_conversations_last_touch   ON conversations(last_touch_at DESC);

-- conversation_state
CREATE INDEX idx_conv_state_conversation_id ON conversation_state(conversation_id);
CREATE INDEX idx_conv_state_cadence         ON conversation_state(cadence_status);
CREATE INDEX idx_conv_state_escalation      ON conversation_state(escalation_level);

-- work_items
CREATE INDEX idx_work_items_conversation_id ON work_items(conversation_id);
CREATE INDEX idx_work_items_rep_id          ON work_items(rep_id);
CREATE INDEX idx_work_items_unresolved      ON work_items(resolved_at) WHERE resolved_at IS NULL;

-- booked_calls
CREATE INDEX idx_booked_calls_conversation_id ON booked_calls(conversation_id);
CREATE INDEX idx_booked_calls_event_ts        ON booked_calls(event_ts DESC);

-- conversation_notes
CREATE INDEX idx_conv_notes_conversation_id ON conversation_notes(conversation_id);

-- inbox_contact_profiles (DNC / allowlist checks)
CREATE INDEX idx_contact_profiles_contact_key ON inbox_contact_profiles(contact_key);
CREATE INDEX idx_contact_profiles_phone       ON inbox_contact_profiles(phone);
CREATE INDEX idx_contact_profiles_dnc         ON inbox_contact_profiles(dnc) WHERE dnc = true;
```

---

### 🔴 DB-003 — Add TCPA/GDPR Compliance Fields

**Priority:** Critical | **Effort:** ~4 hours | **Impact:** Legal/compliance requirement

**inbox_contact_profiles** — consent + DNC tracking:

```sql
ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_status      TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_date        TIMESTAMP WITH TIME ZONE;
ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_method      TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN dnc_list_checked_at      TIMESTAMP WITH TIME ZONE;
ALTER TABLE inbox_contact_profiles ADD COLUMN dnc_list_source          TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN gdpr_consent_status      TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN gdpr_consent_date        TIMESTAMP WITH TIME ZONE;
ALTER TABLE inbox_contact_profiles ADD COLUMN last_consent_update_by   TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN consent_update_reason    TEXT;
```

**send_attempts** — delivery + compliance tracking:

```sql
ALTER TABLE send_attempts ADD COLUMN compliance_check_passed    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE send_attempts ADD COLUMN compliance_check_details   JSONB;
ALTER TABLE send_attempts ADD COLUMN delivery_status            TEXT;
ALTER TABLE send_attempts ADD COLUMN delivery_timestamp         TIMESTAMP WITH TIME ZONE;
ALTER TABLE send_attempts ADD COLUMN carrier_error_code         TEXT;
ALTER TABLE send_attempts ADD COLUMN carrier_error_description  TEXT;
ALTER TABLE send_attempts ADD COLUMN opt_out_detected           BOOLEAN DEFAULT false;
ALTER TABLE send_attempts ADD COLUMN opt_out_timestamp          TIMESTAMP WITH TIME ZONE;
```

**conversations** — opt-out + DNC + frequency capping:

```sql
ALTER TABLE conversations ADD COLUMN has_active_consent             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN consent_verified_at            TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN is_opted_out                   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN opted_out_at                   TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN opted_out_reason               TEXT;
ALTER TABLE conversations ADD COLUMN is_dnc_flagged                 BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN dnc_checked_at                 TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN preferred_contact_time_start   TIME;
ALTER TABLE conversations ADD COLUMN preferred_contact_time_end     TIME;
ALTER TABLE conversations ADD COLUMN preferred_contact_timezone     TEXT;
ALTER TABLE conversations ADD COLUMN messages_sent_today            INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN messages_sent_this_week        INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_message_sent_at           TIMESTAMP WITH TIME ZONE;
```

**sms_events** — compliance context + delivery + opt-out detection:

```sql
ALTER TABLE sms_events ADD COLUMN was_compliant             BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sms_events ADD COLUMN compliance_notes          TEXT;
ALTER TABLE sms_events ADD COLUMN delivery_status           TEXT;
ALTER TABLE sms_events ADD COLUMN delivery_timestamp        TIMESTAMP WITH TIME ZONE;
ALTER TABLE sms_events ADD COLUMN carrier_code              TEXT;
ALTER TABLE sms_events ADD COLUMN carrier_message           TEXT;
ALTER TABLE sms_events ADD COLUMN contains_opt_out_keyword  BOOLEAN DEFAULT false;
ALTER TABLE sms_events ADD COLUMN message_type              TEXT;
ALTER TABLE sms_events ADD COLUMN campaign_id               TEXT;
```

- [ ] Update Prisma schema after running migrations
- [ ] Add seed data for `tcpa_consent_status` enum values: `OPTED_IN`, `OPTED_OUT`, `PENDING`, `UNKNOWN`

---

### 🔴 DB-004 — Create Compliance Audit Tables

**Priority:** Critical | **Effort:** ~2 hours | **Impact:** Compliance audit trail for TCPA/GDPR

```sql
-- Consent audit trail
CREATE TABLE consent_audit_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id              TEXT NOT NULL,
  contact_key             TEXT NOT NULL,
  previous_consent_status TEXT,
  new_consent_status      TEXT NOT NULL,
  changed_by              TEXT,
  change_reason           TEXT,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key)
);

-- DNC check log
CREATE TABLE dnc_check_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   TEXT NOT NULL,
  phone        TEXT NOT NULL,
  dnc_status   BOOLEAN NOT NULL,
  checked_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  check_source TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Opt-out events
CREATE TABLE opt_out_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL,
  contact_id          TEXT NOT NULL,
  contact_phone       TEXT NOT NULL,
  opt_out_method      TEXT NOT NULL,
  opt_out_timestamp   TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (contact_id) REFERENCES inbox_contact_profiles(contact_id)
);

-- Message delivery status log
CREATE TABLE message_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_attempt_id  UUID NOT NULL,
  conversation_id  UUID NOT NULL,
  status           TEXT NOT NULL,
  status_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  carrier_code     TEXT,
  carrier_message  TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (send_attempt_id) REFERENCES send_attempts(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

- [ ] Add Prisma model definitions for all four tables
- [ ] Write service layer functions to log consent changes and opt-out events

---

## Waiting On

### 🟠 DB-005 — Standardize Timestamp Column Naming

**Priority:** High | **Effort:** ~3 hours | **Impact:** Reduces developer confusion; consistent query patterns

Current inconsistency across tables:

- `sms_events`: `event_ts`, `created_at`, `first_sms_touch_at`
- `booked_calls`: `event_ts`, `created_at`
- `send_attempts`: `created_at` (no `event_ts`)
- `conversations`: `last_inbound_at`, `last_outbound_at`, `last_touch_at`, `created_at`, `updated_at`

**Convention to adopt:**
| Column | Meaning |
|---|---|
| `event_ts` | When the event occurred in the external system (Slack, SMS provider) |
| `created_at` | When the record was inserted into our DB |
| `updated_at` | When the record was last modified |
| `*_at` | Domain-specific timestamps (`due_at`, `resolved_at`, etc.) |

- [ ] Audit all tables for timestamp columns and map current→target names
- [ ] Write migration with column renames (use `ALTER TABLE ... RENAME COLUMN`)
- [ ] Update all Prisma model field names and regenerate client
- [ ] Search codebase for direct SQL references to renamed columns

---

### 🟠 DB-006 — Standardize user_id Type (TEXT vs CHARACTER VARYING)

**Priority:** High | **Effort:** ~2 hours | **Impact:** Prevents implicit casting bugs in joins

- `user_send_preferences.user_id`: `TEXT`
- `audit_logs.user_id`: `CHARACTER VARYING`
- `conversations.current_rep_id`: `TEXT`

- [ ] Decide on canonical type: `TEXT` (preferred in PostgreSQL — no length semantics needed)
- [ ] Migrate `audit_logs.user_id` from `CHARACTER VARYING` to `TEXT`
- [ ] Add a `users` reference table or document that user IDs are Slack member IDs (e.g., `U01XXXXXXX`)

---

### 🟠 DB-007 — Add Enum Types for Status Fields

**Priority:** High | **Effort:** ~2 hours | **Impact:** Prevents invalid status values at the DB level

```sql
CREATE TYPE sms_send_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED', 'DELIVERED', 'UNSUBSCRIBED');
CREATE TYPE conversation_status AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE tcpa_consent_status AS ENUM ('OPTED_IN', 'OPTED_OUT', 'PENDING', 'UNKNOWN');
CREATE TYPE opt_out_method AS ENUM ('SMS_REPLY', 'LINK_CLICK', 'MANUAL', 'SYSTEM');
```

- [ ] Migrate existing `status` columns to use enum types after auditing all current values
- [ ] Rename boolean fields to use `is_*` prefix: `accepted` → `is_accepted`, `edited` → `is_edited`, `dnc` → `is_dnc`

---

## Someday

### 🟡 DB-008 — Normalize conversation_state Into Sub-Tables

**Priority:** Medium | **Effort:** ~6 hours | **Impact:** Reduces update contention; improves query clarity

Split `conversation_state` into:

- `qualification_profile` — qualification status, scores, completed timestamps
- `escalation_log` — escalation level, created/resolved timestamps, resolved_by

Also add missing engagement tracking fields to `conversation_state`:

```sql
ALTER TABLE conversation_state ADD COLUMN total_messages_sent         INTEGER DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN total_messages_received     INTEGER DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN response_rate               NUMERIC(5,2);
ALTER TABLE conversation_state ADD COLUMN avg_response_time_minutes   INTEGER;
ALTER TABLE conversation_state ADD COLUMN qualification_completed_at  TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversation_state ADD COLUMN qualification_completed_by  TEXT;
ALTER TABLE conversation_state ADD COLUMN escalation_created_at       TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversation_state ADD COLUMN escalation_resolved_at      TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversation_state ADD COLUMN escalation_resolved_by      TEXT;
ALTER TABLE conversation_state ADD COLUMN booked_call_count           INTEGER DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN completed_call_count        INTEGER DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN last_call_booked_at         TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversation_state ADD COLUMN last_consent_verified_at    TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversation_state ADD COLUMN is_compliant                BOOLEAN NOT NULL DEFAULT true;
```

---

### 🟡 DB-009 — Rename Ambiguous Column Names

**Priority:** Medium | **Effort:** ~4 hours | **Impact:** Improves code readability; reduces misuse

| Current                     | Replacement                         | Tables Affected    |
| --------------------------- | ----------------------------------- | ------------------ |
| `raw`                       | `raw_payload` or `raw_api_response` | 5+ tables          |
| `details` (audit_logs)      | `action_details`                    | audit_logs         |
| `text` (sms_events)         | `message_body`                      | sms_events         |
| `text` (booked_calls)       | `slack_message_text`                | booked_calls       |
| `text` (conversation_notes) | `note_text`                         | conversation_notes |
| `line` (sms_events)         | `phone_line_id`                     | sms_events         |
| `sequence` (sms_events)     | `sequence_name`                     | sms_events         |

---

### 🟡 DB-010 — Extend user_send_preferences with Compliance & Rate-Limit Fields

**Priority:** Medium | **Effort:** ~1 hour | **Impact:** Enables per-user sending limits and compliance controls

```sql
ALTER TABLE user_send_preferences ADD COLUMN max_messages_per_day              INTEGER DEFAULT 50;
ALTER TABLE user_send_preferences ADD COLUMN max_messages_per_contact_per_day  INTEGER DEFAULT 5;
ALTER TABLE user_send_preferences ADD COLUMN quiet_hours_start                 TIME;
ALTER TABLE user_send_preferences ADD COLUMN quiet_hours_end                   TIME;
ALTER TABLE user_send_preferences ADD COLUMN quiet_hours_timezone              TEXT;
ALTER TABLE user_send_preferences ADD COLUMN auto_opt_out_on_keyword           BOOLEAN DEFAULT true;
ALTER TABLE user_send_preferences ADD COLUMN require_consent_verification      BOOLEAN DEFAULT true;
ALTER TABLE user_send_preferences ADD COLUMN created_by                        TEXT;
ALTER TABLE user_send_preferences ADD COLUMN updated_by                        TEXT;
ALTER TABLE user_send_preferences ADD COLUMN enable_ai_drafts                  BOOLEAN DEFAULT true;
ALTER TABLE user_send_preferences ADD COLUMN enable_auto_followup              BOOLEAN DEFAULT true;
ALTER TABLE user_send_preferences ADD COLUMN enable_compliance_checks          BOOLEAN DEFAULT true;
```

---

### 🟡 DB-011 — Fix goals Table Primary Key Type Inconsistency

**Priority:** Medium | **Effort:** ~1 hour | **Impact:** Consistent UUID primary keys across all tables

The `goals` table uses `CHARACTER VARYING` as its primary key while all other tables use `UUID`. Migrate to `UUID DEFAULT gen_random_uuid()`.

---

## Done
