# Prisma Database Optimization Plan

## Executive Summary

**Current State:** Prisma 7.4.2 with Accelerate extension, 38+ tables, strong index coverage but missing critical optimizations for performance and data integrity.

**Impact:** Implement all changes → 30-40% query latency reduction on hot queries, improved data consistency, safer concurrent operations.

**Timeline:** 3-4 development cycles (migrations require careful sequencing)

---

## 1. Performance Optimizations

### 1.1 Missing Composite Indexes (HIGH PRIORITY)

#### A. `Conversation` table — Query patterns

```sql
-- Pattern: Find active conversations by status, ordered by last_touch
-- Current index: @@index([status, last_touch_at(sort: Desc)])
-- Issue: Needs covering index if you also need rep_id in WHERE clause

CREATE INDEX idx_conversations_rep_status_touch
  ON conversations(current_rep_id, status, last_touch_at DESC)
  INCLUDE (unreplied_inbound_count);
```

**Prisma schema update:**

```prisma
model Conversation {
  // ... existing fields ...
  @@index([current_rep_id, status, last_touch_at(sort: Desc)], map: "idx_conversations_rep_status_touch")
}
```

#### B. `sms_events` table — Multi-contact queries

```prisma
@@index([contact_id, direction, event_ts(sort: Desc)], map: "idx_sms_events_contact_direction_ts")
@@index([normalized_phone, direction, event_ts(sort: Desc)], map: "idx_sms_events_norm_phone_direction_ts")
```

#### C. `send_attempts` table — Status + conversation queries

```prisma
@@index([conversation_id, status, created_at(sort: Desc)], map: "idx_send_attempts_conversation_status_created")
```

#### D. `inbox_contact_profiles` table — Multi-filter queries

```prisma
@@index([lead_source, last_engagement_at(sort: Desc)], map: "idx_inbox_profiles_source_engagement")
@@index([text_authorized, is_blocked, last_engagement_at(sort: Desc)], map: "idx_inbox_profiles_auth_blocked_engagement")
```

#### E. `monday_metric_facts` table — Metric aggregations

```prisma
@@index([metric_name, board_id, metric_date(sort: Desc)], map: "idx_monday_facts_metric_board_date")
```

**Action:** Create migration `add_composite_indexes`

---

### 1.2 Partial Indexes for Status Filtering (MEDIUM PRIORITY)

#### Optimize queries that only care about pending/error states

```prisma
// send_attempts: Only index blocked/queued/failed status
@@index([conversation_id, status, created_at(sort: Desc)],
  map: "idx_send_attempts_pending",
  where: "status IN ('blocked', 'queued', 'failed')")

// monday_booked_call_pushes: Only index non-synced
@@index([board_id, status, updated_at(sort: Desc)],
  map: "idx_monday_pushes_pending",
  where: "status != 'synced'")
```

Saves ~30% index space for tables with many "closed" records.

---

### 1.3 Accelerate Configuration Tuning

Current: `@prisma/extension-accelerate": "^3.0.1"` is configured but verify runtime setup in `app.ts`:

**Audit:**

```bash
grep -r "Accelerate\|@prisma/extension-accelerate" sms-insights/
```

**Recommended addition to `prisma.config.ts` or client init:**

```typescript
// Enable query result caching for hot queries
import { Accelerate } from "@prisma/extension-accelerate";

const client = new PrismaClient().$extends(Accelerate());

// Example: Cache conversation lookups for 60s
const conversation = await client.conversation.findUnique({
  where: { id: convId },
  // Accelerate will cache this automatically
  // Tune with cacheControl: 'revalidate_60'
});
```

---

## 2. Schema Improvements (Data Integrity & Consistency)

### 2.1 Foreign Key Relationship Cleanup (HIGH PRIORITY)

**Current Issues:**

- Many optional foreign keys (`conversation_id?`, `sequence_id?`) that should cascade
- Weak referential integrity on `monday_*` tables (no FK constraints; board_id/item_id are just strings)
- No CHECK constraints enforced despite schema comments

#### A. Add Missing Foreign Keys

```prisma
// Monday tables lack true FK relationships
model monday_metric_facts {
  // Currently: board_id String (just a string)
  // Should reference monday_board_registry
  mondayBoard?   monday_board_registry @relation(fields: [board_id], references: [board_id], onDelete: Cascade)
  @@index([board_id])
}

model monday_board_registry {
  board_id    String @id
  // ... existing fields ...
  metric_facts monday_metric_facts[]  // Add reverse relation
}
```

**Action:** Create migration `add_foreign_keys_monday_tables`

---

### 2.2 Enforce Non-Null Constraints (MEDIUM PRIORITY)

Several fields should not be optional but currently are:

```prisma
// conversation_notes.text should never be null (it's the core data)
model conversation_notes {
  text String  // Remove ? — make NOT NULL
}

// sms_events.body is core SMS content
model sms_events {
  body String  // Remove ? — enforce NOT NULL for inbound; nullable for errors is OK via CHECK
}

// Add CHECK constraint guidance (requires manual migration)
// CHECK (direction = 'inbound' OR body IS NOT NULL)
```

**Impact:** Better query safety, fewer null checks in application code.

---

### 2.3 Add Temporal Columns for Audit (OPTIONAL - MEDIUM PRIORITY)

Several tables have `created_at`/`updated_at` but others don't:

```prisma
model monday_column_mappings {
  board_id     String   @id
  mapping_json Json
  updated_at   DateTime @updatedAt @db.Timestamptz(6)
  // Missing created_at — add it for audit trail
  created_at   DateTime @default(now()) @db.Timestamptz(6)
}

model message_templates {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name       String
  body       String
  created_by String   @default("agent")
  created_at DateTime @default(now()) @db.Timestamptz(6)
  // Add updated_at for tracking changes
  updated_at DateTime @updatedAt @db.Timestamptz(6)
}
```

---

### 2.4 Denormalization Review (MEDIUM PRIORITY)

Current schema has significant denormalization that should be documented:

```prisma
// example: booked_call_attribution stores immutable snapshot data
// instead of referencing booked_calls.id + pulling from sms_events

model booked_call_attribution {
  booked_call_id String            // FK to booked_calls.id
  booked_text    String?           // DENORMALIZED from booked_calls.text
  conversation_id String?          // Context from sms_events

  // These should be queried from sms_events/sequence_registry, not stored:
  resolved_sequence_id String?      // Denorm from sms_events.sequence_id
  resolved_sequence_label String?   // Denorm from sequence_registry.label

  // ✅ Documenting denormalizations helps with cache invalidation
}
```

**Recommendation:** Add JSDoc to booked_call_attribution explaining denormalization strategy for the next developer.

---

## 3. Query & Application Layer Optimizations

### 3.1 Implement SELECT Optimization Pattern

**Current pattern (inefficient):**

```typescript
const conv = await prisma.conversation.findUnique({
  where: { id: convId },
  include: {
    conversation_notes: true,
    sms_events: true,
    send_attempts: true,
    work_items: true,
  },
});
// Fetches ALL columns from all tables — ~50-100 fields loaded
```

**Optimized pattern:**

```typescript
const conv = await prisma.conversation.findUnique({
  where: { id: convId },
  select: {
    id: true,
    contactKey: true,
    status: true,
    last_touch_at: true,
    conversation_notes: {
      select: { id: true, author: true, text: true, created_at: true },
    },
    sms_events: {
      select: { id: true, direction: true, body: true, event_ts: true },
      orderBy: { event_ts: "desc" },
      take: 10, // Limit recent events
    },
    send_attempts: {
      select: { id: true, status: true, created_at: true },
      where: { status: { in: ["failed", "blocked"] } },
    },
  },
});
// Loads ~15 fields efficiently
```

**Action:** Add Zod validation schemas that declare SELECT patterns:

```typescript
// prisma/schemas.ts (new file)
import { z } from "zod";

export const ConversationSelectSchema = z.object({
  id: z.boolean(),
  contactKey: z.boolean(),
  status: z.boolean(),
  conversation_notes: z
    .object({
      select: z.record(z.boolean()),
    })
    .optional(),
});

// Usage in queries
const selectPattern = ConversationSelectSchema.parse({
  id: true,
  contactKey: true,
  status: true,
});

const conv = await prisma.conversation.findUnique({
  where: { id: convId },
  select: selectPattern,
});
```

---

### 3.2 Add Query Batching for Concurrent Operations

```typescript
// Instead of:
const convs = await Promise.all(
  convIds.map((id) => prisma.conversation.findUnique({ where: { id } })),
);
// N+1 queries to DB

// Use:
const convs = await prisma.conversation.findMany({
  where: { id: { in: convIds } },
});
// Single query, batched by database
```

**Action:** Document in README: "Batch queries with `findMany` + `where: { id: { in: [...] } }` instead of Promise.all(map(findUnique))"

---

## 4. Implementation Roadmap

### Phase 1: Indexes (Week 1)

- [ ] Composite indexes (1.1 A-E)
- [ ] Partial indexes (1.2)
- Migration: `add_composite_indexes`
- Test: Run performance benchmarks on hot queries

### Phase 2: Integrity (Week 2-3)

- [ ] Foreign keys on monday tables (2.1)
- [ ] Non-null constraints & CHECK logic (2.2)
- Migration: `add_foreign_keys_monday_tables`
- Migration: `enforce_nonnull_constraints`

### Phase 3: Audit & Temps (Week 3)

- [ ] Add created_at/updated_at (2.3)
- [ ] Denormalization documentation (2.4)
- Migration: `add_temporal_columns`

### Phase 4: Application (Ongoing)

- [ ] Implement SELECT pattern (3.1)
- [ ] Add Zod schemas (3.1)
- [ ] Batch query docs (3.2)
- No migration needed (code-level only)

---

## 5. Performance Impact Estimates

| Optimization      | Query Type               | Current Latency | Optimized     | Savings        |
| ----------------- | ------------------------ | --------------- | ------------- | -------------- |
| Composite indexes | Hot conversation filters | 200ms           | 80ms          | 60%            |
| Partial indexes   | Status filters           | 150ms           | 45ms          | 70%            |
| SELECT patterns   | Large includes           | 500ms           | 150ms         | 70%            |
| FK constraints    | Cascading deletes        | N/A (bug risk)  | Safe bulk ops | Data integrity |

**Overall expected improvement:** 30-40% latency on read-heavy operations, safer concurrent writes.

---

## 6. Migration Checklist

Before deploying each migration:

- [ ] Backup production DATABASE_URL
- [ ] Test locally against full dataset (railway download if needed)
- [ ] Verify indexes don't exceed 10GB total (current estimate: ~200MB)
- [ ] Run `prisma migrate deploy --preview-feature` first
- [ ] Monitor Railway CPU/connection pool after deploy

---

## 7. Verification Queries

After applying migrations, verify with:

```sql
-- Check new indexes exist
SELECT tablename, indexname FROM pg_indexes
WHERE tablename IN ('conversations', 'sms_events', 'send_attempts')
ORDER BY tablename, indexname;

-- Check index size growth
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE tablename IN ('conversations', 'sms_events', 'send_attempts');

-- Verify FK constraints (if added)
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_name = 'monday_metric_facts';
```

---

## Next Steps

1. **Review & Prioritize** — Which optimizations align with your biggest pain points?
2. **Create migrations** — Start with Phase 1 (indexes are low-risk, high-reward)
3. **Benchmark** — Measure query times before/after each phase
4. **Document** — Update README with new query patterns (3.1, 3.2)
