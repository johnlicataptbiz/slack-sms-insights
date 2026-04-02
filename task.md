# SENIOR DATABASE ENGINEER ANALYSIS: SMS-INSIGHTS SCHEMA

## 1. NORMALIZATION & INTEGRITY ISSUES

### Critical Foreign Key Gaps

| Issue                                         | Tables Affected                                                | Impact                                                | Recommendation                                                                   |
| --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| No FK: conversations → inbox_contact_profiles | conversations.contact_key ↔ inbox_contact_profiles.contact_key | Orphaned contacts possible; no referential integrity  | Add FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key)     |
| No FK: sms_events → conversations             | sms_events.conversation_id ↔ conversations.id                  | SMS events can reference deleted conversations        | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE |
| No FK: send_attempts → conversations          | send_attempts.conversation_id ↔ conversations.id               | Send attempts orphaned if conversation deleted        | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id)                   |
| No FK: draft_suggestions → conversations      | draft_suggestions.conversation_id ↔ conversations.id           | Suggestions can exist without parent conversation     | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id)                   |
| No FK: work_items → conversations             | work_items.conversation_id ↔ conversations.id                  | Work items can be orphaned                            | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id)                   |
| No FK: conversation_state → conversations     | conversation_state.conversation_id ↔ conversations.id          | State can exist without conversation                  | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE |
| No FK: conversation_notes → conversations     | conversation_notes.conversation_id ↔ conversations.id          | Notes can be orphaned                                 | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE |
| No FK: booked_calls → conversations           | booked_calls.conversation_id ↔ conversations.id                | Booked calls can reference deleted conversations      | Add FOREIGN KEY (conversation_id) REFERENCES conversations(id)                   |
| No FK: booked_call_reactions → booked_calls   | booked_call_reactions.booked_call_id ↔ booked_calls.id         | Reactions orphaned if call deleted                    | Add FOREIGN KEY (booked_call_id) REFERENCES booked_calls(id) ON DELETE CASCADE   |
| No FK: audit_logs → users                     | audit_logs.user_id ↔ (missing users table)                     | No user validation; audit trail integrity compromised | Create users table or add CHECK constraint on user_id format                     |
| No FK: user_send_preferences → users          | user_send_preferences.user_id ↔ (missing users table)          | Orphaned preferences; no user validation              | Create users table with PK, add FK                                               |

### Data Type Inconsistencies (Normalization Red Flags)

- CRITICAL: user_id is TEXT in user_send_preferences but CHARACTER VARYING in audit_logs
- CRITICAL: contact_id is TEXT in multiple tables (sms_events, inbox_contact_profiles, conversations)
  but should be UUID for consistency with your primary key pattern
- CRITICAL: resource_id in audit_logs is CHARACTER VARYING but should match the resource type
  (e.g., UUID for conversation_id, TEXT for contact_id) — this is a design smell

### Redundant Data

| Table              | Redundancy                                        | Issue                                                                                      |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| conversations      | contact_phone, contact_id, current_rep_id         | Duplicates inbox_contact_profiles data; denormalized for query speed but creates sync risk |
| sms_events         | contact_id, contact_phone, contact_name           | Duplicates inbox_contact_profiles; denormalized                                            |
| conversation_state | Qualification/escalation fields                   | Should be normalized into separate qualification_profile and escalation_log tables         |
| booked_calls       | slack_team_id, slack_channel_id, slack_message_ts | Duplicated across booked_calls, monday_booked_call_pushes, booked_call_reactions           |

Why this matters: If inbox_contact_profiles.phone changes, you must update conversations.contact_phone AND sms_events.contact_phone. This is a sync nightmare and a source of data inconsistency bugs.

## 2. PERFORMANCE BOTTLENECKS

### High-Growth Tables (Likely to Explode)

| Table              | Growth Rate | Reason                                                                             | Current Indexes | Risk                                          |
| ------------------ | ----------- | ---------------------------------------------------------------------------------- | --------------- | --------------------------------------------- |
| sms_events         | 🔴 CRITICAL | Every inbound/outbound SMS = 1 row. 100 conversations × 50 SMS each = 5K rows/week | None visible    | MISSING: conversation_id, event_ts, direction |
| send_attempts      | 🔴 CRITICAL | Every send retry = 1 row. Retries compound growth                                  | None visible    | MISSING: conversation_id, status, created_at  |
| audit_logs         | 🟠 HIGH     | Every action logged (create, update, delete)                                       | None visible    | MISSING: user_id, resource_type, created_at   |
| conversation_state | 🟡 MEDIUM   | 1 row per conversation, but updated frequently                                     | None visible    | MISSING: conversation_id                      |
| booked_calls       | 🟡 MEDIUM   | 1 per successful call booking                                                      | None visible    | MISSING: conversation_id, event_ts            |

### Recommended Indexing Strategy

```sql
-- CRITICAL: sms_events (highest growth)
CREATE INDEX idx_sms_events_conversation_id ON sms_events(conversation_id);
CREATE INDEX idx_sms_events_event_ts ON sms_events(event_ts DESC);
CREATE INDEX idx_sms_events_direction_created ON sms_events(direction, created_at DESC);
CREATE INDEX idx_sms_events_contact_key ON sms_events(contact_key);
-- Composite for "get all SMS for conversation in date range"
CREATE INDEX idx_sms_events_conv_ts ON sms_events(conversation_id, event_ts DESC);

-- CRITICAL: send_attempts (high growth + frequent queries)
CREATE INDEX idx_send_attempts_conversation_id ON send_attempts(conversation_id);
CREATE INDEX idx_send_attempts_status_created ON send_attempts(status, created_at DESC);
CREATE INDEX idx_send_attempts_idempotency ON send_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- For retry logic
CREATE INDEX idx_send_attempts_conv_status ON send_attempts(conversation_id, status);

-- HIGH: audit_logs (compliance + debugging)
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- MEDIUM: conversations (frequent lookups)
CREATE INDEX idx_conversations_contact_key ON conversations(contact_key);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_current_rep_id ON conversations(current_rep_id);
CREATE INDEX idx_conversations_last_touch ON conversations(last_touch_at DESC);

-- MEDIUM: conversation_state (state machine queries)
CREATE INDEX idx_conversation_state_conversation_id ON conversation_state(conversation_id);
CREATE INDEX idx_conversation_state_cadence ON conversation_state(cadence_status);
CREATE INDEX idx_conversation_state_escalation ON conversation_state(escalation_level);

-- MEDIUM: work_items (task queries)
CREATE INDEX idx_work_items_conversation_id ON work_items(conversation_id);
CREATE INDEX idx_work_items_rep_id ON work_items(rep_id);
CREATE INDEX idx_work_items_resolved_at ON work_items(resolved_at) WHERE resolved_at IS NULL;

-- MEDIUM: booked_calls (call tracking)
CREATE INDEX idx_booked_calls_conversation_id ON booked_calls(conversation_id);
CREATE INDEX idx_booked_calls_event_ts ON booked_calls(event_ts DESC);

-- LOW: conversation_notes (less frequent)
CREATE INDEX idx_conversation_notes_conversation_id ON conversation_notes(conversation_id);

-- COMPLIANCE: inbox_contact_profiles (DNC/allowlist checks)
CREATE INDEX idx_inbox_contact_profiles_contact_key ON inbox_contact_profiles(contact_key);
CREATE INDEX idx_inbox_contact_profiles_phone ON inbox_contact_profiles(phone);
CREATE INDEX idx_inbox_contact_profiles_dnc ON inbox_contact_profiles(dnc) WHERE dnc = true;
```

### Query Performance Risks

```sql
-- ⚠️ SLOW: No index on sms_events.conversation_id
SELECT * FROM sms_events WHERE conversation_id = $1 ORDER BY event_ts DESC;
-- Result: Full table scan on millions of rows

-- ⚠️ SLOW: No index on send_attempts.status
SELECT * FROM send_attempts WHERE status = 'PENDING' AND created_at > NOW() - INTERVAL '1 day';
-- Result: Full table scan

-- ⚠️ SLOW: No index on audit_logs.created_at
SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC;
-- Result: Full table scan on compliance queries
```

## 3. NAMING & CONSISTENCY ISSUES

### Type Inconsistencies (Will Cause Bugs)

| Field             | Inconsistency                                                                                        | Impact                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| user_id           | TEXT in user_send_preferences, CHARACTER VARYING in audit_logs, TEXT in conversations.current_rep_id | Joins fail silently; implicit casting overhead            |
| contact_id        | TEXT in sms_events, inbox_contact_profiles, conversations                                            | Should be UUID or consistently TEXT with CHECK constraint |
| contact_key       | TEXT in conversations, sms_events, inbox_contact_profiles                                            | Good consistency, but should be indexed everywhere        |
| id                | UUID in most tables, but CHARACTER VARYING in goals                                                  | Inconsistent primary key type; goals is an outlier        |
| timestamp columns | event_ts vs created_at vs timestamp                                                                  | Confusing naming; use consistent pattern                  |

### Naming Convention Violations

INCONSISTENT TIMESTAMP NAMING:

- sms_events: event_ts, created_at, first_sms_touch_at
- booked_calls: event_ts, created_at
- send_attempts: created_at (no event_ts)
- conversations: last_inbound_at, last_outbound_at, last_touch_at, created_at, updated_at
- work_items: created_at, due_at, resolved_at

RECOMMENDATION: Standardize to:

- event_ts: When the event occurred in the external system (Slack, SMS provider)
- created_at: When the record was inserted into our DB
- updated_at: When the record was last modified
- \*\_at: For domain-specific timestamps (due_at, resolved_at, etc.)

INCONSISTENT BOOLEAN NAMING:

- is_booked (monday_call_snapshots)
- is_legacy (daily_runs)
- accepted, edited (draft_suggestions)
- dnc (inbox_contact_profiles)

RECOMMENDATION: Use is\_\* prefix consistently:

- is_booked ✓
- is_legacy ✓
- is_accepted (not just "accepted")
- is_dnc (not just "dnc")

INCONSISTENT STATUS FIELDS:

- status (conversations, send_attempts, daily_runs, monday_booked_call_pushes, monday_sync_state)
- cadence_status (conversation_state)
- call_outcome (conversation_state)

RECOMMENDATION: Use enum types or document valid values:

```sql
CREATE TYPE sms_send_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED');
CREATE TYPE conversation_status AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
```

### Ambiguous Column Names

| Column                                              | Ambiguity                                    | Fix                                                     |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| raw (appears in 5+ tables)                          | What is "raw"? Raw JSON from API? Raw event? | Rename to raw_payload, raw_event_json, raw_api_response |
| details (audit_logs)                                | What details? Action details?                | Rename to action_details or metadata                    |
| text (sms_events, booked_calls, conversation_notes) | Message body? Slack message?                 | Rename to message_body, slack_message_text, note_text   |
| line (sms_events)                                   | Phone line? Twilio line?                     | Rename to phone_line_id or sms_line_id                  |
| sequence (sms_events)                               | Sequence number? Sequence name?              | Rename to sequence_name or sequence_id                  |

## 4. FEATURE-SPECIFIC LOGIC: SMS/CRM COMPLIANCE & TRACKING GAPS

### Missing Fields for SMS Compliance (TCPA/GDPR)

```sql
-- CRITICAL: inbox_contact_profiles is missing:
ALTER TABLE inbox_contact_profiles ADD COLUMN (
  -- TCPA Compliance
  tcpa_consent_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- OPTED_IN, OPTED_OUT, PENDING, UNKNOWN
  tcpa_consent_date TIMESTAMP WITH TIME ZONE,
  tcpa_consent_method TEXT, -- SMS, WEB_FORM, VERBAL, IMPORT

  -- DNC List Tracking
  dnc_list_checked_at TIMESTAMP WITH TIME ZONE,
  dnc_list_source TEXT, -- FEDERAL, STATE, INTERNAL

  -- GDPR
  gdpr_consent_status TEXT, -- CONSENTED, WITHDRAWN, PENDING
  gdpr_consent_date TIMESTAMP WITH TIME ZONE,

  -- Audit Trail
  last_consent_update_by TEXT, -- user_id who updated consent
  consent_update_reason TEXT -- WHY consent changed
);

-- CRITICAL: send_attempts is missing:
ALTER TABLE send_attempts ADD COLUMN (
  -- Compliance Checks
  compliance_check_passed BOOLEAN NOT NULL DEFAULT false,
  compliance_check_details JSONB, -- { "dnc_checked": true, "consent_verified": true, ... }

  -- Delivery Tracking
  delivery_status TEXT, -- QUEUED, SENT, DELIVERED, FAILED, BOUNCED, UNSUBSCRIBED
  delivery_timestamp TIMESTAMP WITH TIME ZONE,

  -- Carrier Feedback
  carrier_error_code TEXT,
  carrier_error_description TEXT,

  -- Opt-out Tracking
  opt_out_detected BOOLEAN DEFAULT false,
  opt_out_timestamp TIMESTAMP WITH TIME ZONE
);

-- CRITICAL: conversations is missing:
ALTER TABLE conversations ADD COLUMN (
  -- Consent Tracking
  has_active_consent BOOLEAN NOT NULL DEFAULT false,
  consent_verified_at TIMESTAMP WITH TIME ZONE,

  -- Opt-out Status
  is_opted_out BOOLEAN NOT NULL DEFAULT false,
  opted_out_at TIMESTAMP WITH TIME ZONE,
  opted_out_reason TEXT,

  -- DNC Status
  is_dnc_flagged BOOLEAN NOT NULL DEFAULT false,
  dnc_checked_at TIMESTAMP WITH TIME ZONE,

  -- Message Preference
  preferred_contact_time_start TIME,
  preferred_contact_time_end TIME,
  preferred_contact_timezone TEXT,

  -- Frequency Capping
  messages_sent_today INTEGER DEFAULT 0,
  messages_sent_this_week INTEGER DEFAULT 0,
  last_message_sent_at TIMESTAMP WITH TIME ZONE
);

-- CRITICAL: sms_events is missing:
ALTER TABLE sms_events ADD COLUMN (
  -- Compliance Context
  was_compliant BOOLEAN NOT NULL DEFAULT true,
  compliance_notes TEXT,

  -- Delivery Status
  delivery_status TEXT, -- SENT, DELIVERED, FAILED, BOUNCED, UNSUBSCRIBED
  delivery_timestamp TIMESTAMP WITH TIME ZONE,

  -- Carrier Feedback
  carrier_code TEXT,
  carrier_message TEXT,

  -- Opt-out Detection
  contains_opt_out_keyword BOOLEAN DEFAULT false,

  -- Message Classification
  message_type TEXT, -- MARKETING, TRANSACTIONAL, REMINDER, FOLLOWUP
  campaign_id TEXT -- For tracking campaign performance
);
```

### Missing Audit/Compliance Tables

```sql
-- MISSING: Consent Audit Trail
CREATE TABLE consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL,
  contact_key TEXT NOT NULL,
  previous_consent_status TEXT,
  new_consent_status TEXT NOT NULL,
  changed_by TEXT, -- user_id or 'SYSTEM'
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key)
);

-- MISSING: DNC Check Log (for compliance audits)
CREATE TABLE dnc_check_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  dnc_status BOOLEAN NOT NULL,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  check_source TEXT, -- FEDERAL, STATE, INTERNAL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- MISSING: Opt-out Events
CREATE TABLE opt_out_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  contact_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  opt_out_method TEXT NOT NULL, -- SMS_REPLY, LINK_CLICK, MANUAL, SYSTEM
  opt_out_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (contact_id) REFERENCES inbox_contact_profiles(contact_id)
);

-- MISSING: Message Delivery Status Log
CREATE TABLE message_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_attempt_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  status TEXT NOT NULL, -- QUEUED, SENT, DELIVERED, FAILED, BOUNCED
  status_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  carrier_code TEXT,
  carrier_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (send_attempt_id) REFERENCES send_attempts(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

### Missing Fields in conversation_state

```sql
-- conversation_state is missing:
ALTER TABLE conversation_state ADD COLUMN (
  -- Engagement Tracking
  total_messages_sent INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  response_rate NUMERIC(5,2), -- percentage
  avg_response_time_minutes INTEGER,

  -- Qualification Tracking
  qualification_completed_at TIMESTAMP WITH TIME ZONE,
  qualification_completed_by TEXT,

  -- Escalation Tracking
  escalation_created_at TIMESTAMP WITH TIME ZONE,
  escalation_resolved_at TIMESTAMP WITH TIME ZONE,
  escalation_resolved_by TEXT,

  -- Call Tracking
  booked_call_count INTEGER DEFAULT 0,
  completed_call_count INTEGER DEFAULT 0,
  last_call_booked_at TIMESTAMP WITH TIME ZONE,

  -- Compliance
  last_consent_verified_at TIMESTAMP WITH TIME ZONE,
  is_compliant BOOLEAN NOT NULL DEFAULT true
);
```

### Missing Fields in user_send_preferences

```sql
-- user_send_preferences is missing:
ALTER TABLE user_send_preferences ADD COLUMN (
  -- Sending Behavior
  max_messages_per_day INTEGER DEFAULT 50,
  max_messages_per_contact_per_day INTEGER DEFAULT 5,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT,

  -- Compliance
  auto_opt_out_on_keyword BOOLEAN DEFAULT true,
  require_consent_verification BOOLEAN DEFAULT true,

  -- Audit
  created_by TEXT,
  updated_by TEXT,

  -- Feature Flags
  enable_ai_drafts BOOLEAN DEFAULT true,
  enable_auto_followup BOOLEAN DEFAULT true,
  enable_compliance_checks BOOLEAN DEFAULT true
);
```

## 5. SUMMARY TABLE: CRITICAL ACTIONS

| Priority    | Action                                                                                  | Effort  | Impact                                            |
| ----------- | --------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| 🔴 CRITICAL | Add FKs to all conversation-related tables                                              | 2 hours | Prevents data corruption; enables CASCADE deletes |
| 🔴 CRITICAL | Index sms_events & send_attempts (high-growth tables)                                   | 1 hour  | 10-100x query speedup                             |
| 🔴 CRITICAL | Add TCPA/GDPR compliance fields to inbox_contact_profiles, send_attempts, conversations | 4 hours | Legal/compliance requirement                      |
| 🟠 HIGH     | Standardize timestamp naming (event_ts vs created_at)                                   | 3 hours | Reduces developer confusion                       |
| 🟠 HIGH     | Standardize user_id type (TEXT vs CHARACTER VARYING)                                    | 2 hours | Prevents implicit casting bugs                    |
| 🟠 HIGH     | Create consent_audit_log & opt_out_events tables                                        | 2 hours | Compliance audit trail                            |
| 🟡 MEDIUM   | Normalize conversation_state (split into qualification_profile, escalation_log)         | 6 hours | Reduces update contention; improves query clarity |
| 🟡 MEDIUM   | Rename ambiguous columns (raw → raw_payload, text → message_body)                       | 4 hours | Improves code readability                         |
| 🟡 MEDIUM   | Add enum types for status fields                                                        | 2 hours | Prevents invalid status values                    |

## 6. QUICK WINS (Do These First)

```sql
-- 1. Add critical FKs (30 min)
ALTER TABLE sms_events ADD CONSTRAINT fk_sms_events_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE send_attempts ADD CONSTRAINT fk_send_attempts_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE conversation_state ADD CONSTRAINT fk_conv_state_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- 2. Add critical indexes (15 min)
CREATE INDEX idx_sms_events_conv_ts ON sms_events(conversation_id, event_ts DESC);
CREATE INDEX idx_send_attempts_conv_status ON send_attempts(conversation_id, status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 3. Add compliance fields (1 hour)
ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_status TEXT DEFAULT 'UNKNOWN';
ALTER TABLE send_attempts ADD COLUMN compliance_check_passed BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN is_opted_out BOOLEAN DEFAULT false;
```

This schema is production-ready but compliance-risky. The biggest gaps are TCPA/GDPR tracking and missing foreign keys. Fix those first.
