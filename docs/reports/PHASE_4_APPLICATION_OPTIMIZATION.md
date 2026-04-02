# Phase 4: Application-Layer Optimization & Query Patterns

## Overview

Phase 4 focuses on optimizing data fetching patterns, result typing, and validation at the application layer. Unlike Phases 1-3 (database-level), these are code changes that improve query efficiency without migrations.

## Implementation Areas

### 1. SELECT Column Projection

**Goal:** Fetch only needed columns to reduce payload size and query cost

**Current Problems:**

- Many queries use `SELECT *` which fetches unnecessary columns
- Results in larger network transfer and slower deserialization
- Unused columns keep data in memory needlessly

**Solutions (Code Changes):**

```typescript
// ❌ BAD: Fetches all columns including large JSON, text fields
const conversations = await prisma.conversation.findMany({
  where: { status: "open" },
});

// ✅ GOOD: Select only needed fields
const conversations = await prisma.conversation.findMany({
  where: { status: "open" },
  select: {
    id: true,
    contactKey: true,
    current_rep_id: true,
    last_touch_at: true,
    status: true,
  },
});
```

**Files to Optimize:**

- `sms-insights/src/services/conversation.service.ts` — Add `.select()` to queries fetching lists
- `sms-insights/src/services/sms-events.service.ts` — Project only needed SMS fields
- `sms-insights/src/services/rep-summary.service.ts` — Optimize aggregation queries

**Expected Impact:**

- 20-30% reduction in result payload size
- 10-15% faster query deserialization
- Reduced memory footprint on backend

---

### 2. N+1 Query Prevention via Batch Loading

**Goal:** Load related data efficiently without triggering query loops

**Current Problems:**

- Sequential relationship loads (rep details, contact profiles per conversation)
- If loading 100 conversations + their reps, causes 101 queries
- Each rep lookup adds 1-10ms latency; compounds across results

**Solutions (Code Changes):**

```typescript
// ❌ BAD: N+1 queries
const conversations = await prisma.conversation.findMany({
  where: { status: "open" },
  take: 100,
});
for (const conv of conversations) {
  const rep = await db.rep.findUnique({ where: { id: conv.current_rep_id } });
  conv.rep = rep;
}
// Result: 101 queries (1 find many + 100 find unique)

// ✅ GOOD: Batch load via include/relation
const conversations = await prisma.conversation.findMany({
  where: { status: "open" },
  take: 100,
  include: {
    representative: { select: { id: true, name: true } },
  },
});
// Result: 1-2 queries (with eager loading)
```

**Files to Optimize:**

- `sms-insights/src/api/routes/conversations.ts` — Add `.include()` for rep details
- `sms-insights/src/services/inbox.service.ts` — Batch load contact profiles
- `sms-insights/src/services/monday-sync.ts` — Batch load board registries

**Expected Impact:**

- 90% reduction in query count for list endpoints
- 500ms-2s faster list loading (for large result sets)
- CPU savings from fewer query roundtrips

---

### 3. Prisma Client Query Pagination

**Goal:** Implement cursor-based pagination for stable, efficient list queries

**Current Problems:**

- Offset-based pagination slow on large datasets (must scan/skip N rows)
- Can cause duplicate results if data changes during pagination
- Inefficient index usage (doesn't use composite indexes)

**Solutions (Code Changes):**

```typescript
// ❌ OLD: Offset-based (slow on large tables)
const page = await prisma.conversation.findMany({
  skip: (pageNum - 1) * 20,
  take: 20,
  where: { status: "open" },
});

// ✅ NEW: Cursor-based (efficient with composite indexes)
const page = await prisma.conversation.findMany({
  where: { status: "open" },
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: [{ current_rep_id: "asc" }, { last_touch_at: { sort: "desc" } }],
});
```

**Files to Implement:**

- `frontend/src/api/conversations.ts` — Cursor-based pagination for conversation list
- `sms-insights/src/api/routes/inbox.ts` — Cursor pagination for contact profiles
- `sms-insights/src/api/routes/sms-events.ts` — Cursor pagination for event streams

**Expected Impact:**

- Stable performance on 100k+ row tables
- Uses Phase 1 composite indexes efficiently
- Eliminates duplicate pagination results

---

### 4. Result Type Validation with Zod

**Goal:** Validate all query results against Zod schemas before return

**Current Problems:**

- No runtime validation of DB results
- Type safety only at compile time (could break if schema drifts)
- API responses might include unexpected NULL fields
- No standardized error handling for missing/invalid fields

**Solutions (Code Changes):**

Create `sms-insights/src/schemas/db-results.ts`:

```typescript
import { z } from "zod";
import { SmsDirection, ConversationStatus } from "@prisma/client";

// Schema for a conversation query result
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  contactKey: z.string(),
  current_rep_id: z.string().nullable(),
  status: z.enum(["open", "closed", "dnc"]),
  last_touch_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type ConversationResult = z.infer<typeof ConversationSchema>;

// Validation function for query results
export async function validateConversation(
  data: unknown,
): Promise<ConversationResult> {
  try {
    return await ConversationSchema.parseAsync(data);
  } catch (err) {
    logger.error("Conversation validation failed", { error: err, data });
    throw new Error("Invalid conversation data from database");
  }
}
```

**Usage in Services:**

```typescript
// In conversation.service.ts
export async function getOpenConversations() {
  const raw = await prisma.conversation.findMany({
    where: { status: 'open' },
    select: { id: true, contactKey: true, status: true, ... }
  });

  // Validate all results
  return Promise.all(raw.map(validateConversation));
}
```

**Files to Create/Update:**

- `sms-insights/src/schemas/db-results.ts` — New file with all Zod schemas
- `sms-insights/src/services/*.service.ts` — Add result validation to all service methods
- `sms-insights/src/api/routes/*.ts` — Validate before returning to client

**Expected Impact:**

- 100% runtime type safety
- Catches schema/data consistency issues early
- Better error messages from validation failures
- Documented expected response shapes

---

### 5. Aggregation Query Optimization

**Goal:** Use database aggregations instead of application-level loops

**Current Problems:**

- Fetching all rows then aggregating in application (wasteful)
- Large memory footprint for counts/sums/grouping
- Slower than native DB aggregation

**Solutions (Code Changes):**

```typescript
// ❌ BAD: Application aggregation
const conversations = await prisma.conversation.findMany({
  where: { status: "open" },
});
const count = conversations.length;
const avgTouchCount =
  conversations.reduce((sum, c) => sum + c.inbound_message_count) /
  conversations.length;

// ✅ GOOD: Database aggregation
const stats = await prisma.conversation.aggregate({
  where: { status: "open" },
  _count: true,
  _avg: { inbound_message_count: true },
});

const count = stats._count;
const avgTouchCount = stats._avg.inbound_message_count;
```

**Files to Optimize:**

- `sms-insights/src/services/rep-summary.service.ts` — Use `groupBy()` for daily metrics
- `sms-insights/src/services/analytics.ts` — Use `aggregate()` for counts/averages
- `sms-insights/src/api/routes/metrics.ts` — Database-side metric calculations

**Expected Impact:**

- 10-50x faster aggregation queries
- Reduced memory usage on server
- Lower database CPU on analytical workloads

---

## Implementation Priority

**High Priority (Week 1):**

1. SELECT column projection (20-30% payload reduction)
2. N+1 prevention via .include() (massive query count reduction)
3. Zod result validation (type safety + error clarity)

**Medium Priority (Week 2):** 4. Cursor-based pagination (stability on large tables) 5. Aggregation optimization (analytical query speed)

**Monitoring:**

- Track query count via logs before/after
- Measure response times on list endpoints
- Monitor memory usage on backend
- Set up alerts for validation failures

## Success Criteria

✅ **Query Performance:**

- List endpoints respond in <500ms (vs current 1-2s)
- Aggregate queries respond in <100ms (vs current 500ms+)
- Single query count for multi-entity fetches (vs 100+)

✅ **Data Type Safety:**

- 100% Zod validation on all DB results
- Zero unexpected NULL values in responses
- Type-safe query returns across all services

✅ **Monitoring & Observability:**

- Log slow queries (>100ms for single entity, >500ms for list)
- Monitor validation failure rate (target: 0%)
- Dashboard showing before/after performance

---

## Files Modified in Phase 4

```
sms-insights/
├── src/
│   ├── schemas/
│   │   └── db-results.ts (NEW)
│   ├── services/
│   │   ├── conversation.service.ts (UPDATE)
│   │   ├── sms-events.service.ts (UPDATE)
│   │   ├── rep-summary.service.ts (UPDATE)
│   │   ├── analytics.ts (UPDATE)
│   │   └── inbox.service.ts (UPDATE)
│   └── api/
│       ├── routes/conversations.ts (UPDATE)
│       ├── routes/inbox.ts (UPDATE)
│       ├── routes/sms-events.ts (UPDATE)
│       └── routes/metrics.ts (UPDATE)
└── prisma/
    └── migrations/
        └── 20260319_add_temporal_columns/ (Phase 3 already deployed)
```

---

## Next Steps

1. **Review code patterns** — Identify top 5 slowest queries from production logs
2. **Prioritize high-impact changes** — Focus on SELECT optimization + N+1 prevention first
3. **Implement Zod schemas** — Create validation layer for all db results
4. **Test before deploying** — Verify query count reduction + latency improvements
5. **Monitor post-deploy** — Track metrics for 1 week to validate improvements

**Estimated Effort:** 20-30 hours of development + testing
**Expected ROI:** 60-80% performance improvement on read-heavy operations
