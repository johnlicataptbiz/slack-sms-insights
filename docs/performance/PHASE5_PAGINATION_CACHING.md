# Phase 5: Cursor-Based Pagination & Caching Strategy

## Phase Overview

**Objective:** Implement pagination and caching to reduce memory usage and database load on high-volume endpoints

**Expected Impact:**

- Memory reduction: 70% on large result sets
- Query time reduction: 25-40% on cached queries
- API response time: 5-10x faster on frequently accessed data

**Timeline:** 2-3 weeks  
**Complexity:** Medium-High  
**Risk:** Low (feature-additive, backward compatible)

---

## Phase 5A: Cursor-Based Pagination

### Problem We're Solving

Current endpoints return full result sets:

```typescript
// Before: Returns ALL rows
const conversations = await prisma.conversation.findMany({
  orderBy: { last_touch_at: 'desc' },
  select: { ... }
});
// ❌ Returns 50,000 rows = 8MB payload
// ❌ Memory spike: 50-100MB
// ❌ Response time: 4-6 seconds
```

**Impact:**

- High memory servers (Vercel functions timeout)
- Network bandwidth spike
- Slow frontend pagination

### Solution: Cursor Pagination

```typescript
// After: Returns paginated results with cursor
type ListConversationsResponse = {
  items: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
};

export const listConversations = async (
  params: {
    limit: number;        // 20-100 items
    cursor?: string;      // Base64(sort_key|id)
  }
): Promise<ListConversationsResponse> => {
  const limit = Math.min(params.limit, 100);

  // Decode cursor if provided
  const startPoint = params.cursor
    ? decodeCursor(params.cursor)
    : null;

  // Fetch limit + 1 to detect hasMore
  const rows = await prisma.conversation.findMany({
    where: startPoint ? {
      last_touch_at: { lt: startPoint.lastTouchAt }
    } : undefined,
    orderBy: { last_touch_at: 'desc', id: 'desc' },
    take: limit + 1,
    select: { ... }
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Create cursor from last item
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(items[items.length - 1])
    : null;

  return { items, nextCursor, hasMore };
};
```

### Migration Steps

1. **Add cursor utilities:**

   ```typescript
   // src/utils/cursor.ts
   export function encodeCursor(item: {
     last_touch_at: Date;
     id: string;
   }): string;
   export function decodeCursor(cursor: string): {
     lastTouchAt: Date;
     id: string;
   };
   ```

2. **Update API endpoints:**
   - `/api/inbox/conversations?limit=20&cursor=abc123`
   - `/api/monday/boards?limit=50&cursor=def456`

3. **Update frontend pagination:**
   - Replace offset-based: `?page=1&limit=20`
   - With cursor-based: `?limit=20&cursor=xyz789`

### Target Endpoints for Phase 5A

| Endpoint                   | Current Load | Cursored Benefit | Complexity | Priority |
| -------------------------- | ------------ | ---------------- | ---------- | -------- |
| `/api/inbox/conversations` | 50-100K      | 5-7x mem ↓       | Medium     | HIGH     |
| `/api/monday/boards`       | 10-50K       | 3-5x mem ↓       | Low        | MEDIUM   |
| `/api/reports/daily`       | 5-20K        | 2-3x mem ↓       | Low        | MEDIUM   |
| `/api/analytics/events`    | 100K+        | 10x mem ↓        | High       | HIGH     |

---

## Phase 5B: Redis Caching Layer

### Problem We're Solving

Some queries are expensive and frequently repeated:

- Rep daily summaries (called 100x per day)
- Monday board registry (static, updated 1x per week)
- Canonical sequence labels (fetched every 5 seconds)

**Current:** Every request hits database  
**Impact:** 50-100% of database load is cached data

### Solution: Redis Cache

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const getCachedMondayRegistry = async (): Promise<MondayBoardRegistryRow[]> => {
  // Check cache first
  const cached = await redis.get('monday:board-registry');
  if (cached) {
    return validateBatch(MondayBoardRegistrySelectSchema, JSON.parse(cached));
  }

  // Cache miss: query database
  const rows = await prisma.monday_board_registry.findMany({
    select: { ... }
  });

  // Store in cache for 24 hours
  await redis.setex(
    'monday:board-registry',
    86400,  // 24 hours
    JSON.stringify(rows)
  );

  return validateBatch(MondayBoardRegistrySelectSchema, rows);
};
```

### Caching Strategy

| Data                      | TTL | Cache Key                     | Invalidation     |
| ------------------------- | --- | ----------------------------- | ---------------- |
| Monday Board Registry     | 24h | `monday:board-registry`       | Manual (1x/week) |
| Sequence Labels           | 6h  | `sequences:canonical-labels`  | Worker (auto)    |
| Rep Daily Summary         | 1h  | `rep:daily:{rep_id}:{date}`   | Worker (auto)    |
| Coaching Interest Options | 7d  | `codebook:coaching-interests` | Manual (rare)    |
| Contact Profile (Recent)  | 5m  | `contact:{contact_id}`        | On update        |

### Redis Setup

```bash
# Railway Redis
railway add
# Select Redis from marketplace
# Get connection string: REDIS_URL

# Local development
docker run -d -p 6379:6379 redis:7-alpine

# Add to .env
REDIS_URL=redis://localhost:6379
```

### Implementation Order

**Week 1: Cache Infrastructure**

1. Set up Redis on Railway
2. Add Redis client to app.ts
3. Create cache utilities: cache, invalidate, clearByPattern
4. Add error handling (graceful degradation if Redis down)

**Week 2: Implement Caching**

1. Cache monday-store queries (5 queries)
2. Cache conversation-store queries (2 queries)
3. Test cache hit rates
4. Monitor Redis memory usage

**Week 3: Optimize & Fallback**

1. Add cache warming strategies
2. Implement cache invalidation patterns
3. Set up cache metrics/monitoring
4. Plan cache eviction policy

### Cache Invalidation Patterns

**Pattern 1: Time-Based (TTL)**

```typescript
await redis.setex("key", 3600, data); // 1 hour
```

**Pattern 2: Event-Based Invalidation**

```typescript
// When a record is updated
await redis.del('monday:board-registry');  // Clear cache

// In monday-store.ts updateBoardRegistry()
await updateRegistry(...);
await redis.del('monday:board-registry');  // Invalidate
```

**Pattern 3: Cache Warming**

```typescript
// Run on app startup and every 6 hours
export const warmCaches = async () => {
  const registry = await prisma.monday_board_registry.findMany({...});
  await redis.setex('monday:board-registry', 86400, JSON.stringify(registry));
};
```

---

## Phase 5C: Query Result Streaming (Optional)

For extremely large datasets (100K+ rows):

```typescript
// Instead of returning full array
// Stream results to client incrementally

export const streamSmsEvents = async (
  req: Request,
  res: Response
) => {
  const stream = prisma.sms_events.findMany({
    where: { ... },
    select: { ... }
  }).stream();

  res.setHeader('Content-Type', 'application/x-ndjson');

  for await (const record of stream) {
    res.write(JSON.stringify(record) + '\n');
  }

  res.end();
};

// Frontend: Read streaming response line-by-line
async function* streamEvents(url) {
  const response = await fetch(url);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');

    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line) yield JSON.parse(line);
    }
  }
}
```

---

## Success Metrics for Phase 5

### Cursor Pagination

- [ ] Endpoints support `?limit=` and `?cursor=` parameters
- [ ] Memory usage reduced 70% for large datasets
- [ ] Response time < 500ms for first page (was 4-6s)
- [ ] No regression in small result sets

### Caching

- [ ] Redis cache hit rate > 60% on warm caches
- [ ] Query response time < 100ms on cache hit (was 200-500ms)
- [ ] Cache invalidation < 5ms impact on write operations
- [ ] Redis memory usage < 500MB

### Overall Phase 5

- [ ] Production latency reduced 40-60%
- [ ] Memory usage reduced 60-80%
- [ ] Database query count reduced 40-50%
- [ ] Zero downtime during rollout

---

## Rollout Plan

### Week 1-2: Development & Testing

```bash
# Branch
git checkout -b phase-5/pagination-caching

# Development
npm run dev
# Test locally with Redis container
docker run -d -p 6379:6379 redis:7

# Commit
git commit -m "feat(phase5): cursor pagination + Redis caching"
```

### Week 2: Staging Validation

- Deploy to Railway staging
- Load test with representative data
- Monitor metrics for 48 hours
- Validate cache hit rates

### Week 3: Production Rollout

- Gradual rollout (10% → 50% → 100%)
- Monitor error rates
- Have rollback plan ready
- Gather user feedback

---

## Risks and Mitigations

| Risk                      | Mitigation                      | Probability |
| ------------------------- | ------------------------------- | ----------- |
| Redis connection fails    | Graceful degradation (query DB) | Low         |
| Cache invalidation misses | Comprehensive event triggers    | Low         |
| Memory explosion          | Set Redis max memory policy     | Very Low    |
| Cursor encoding issues    | Comprehensive unit tests        | Low         |

---

## Next Phase (Phase 6): OLAP Analytics

After Phase 5 is stable:

- Offload analytics queries to Data Warehouse (BigQuery/Redshift)
- Keep OLTP (transactions) on PostgreSQL
- Further reduce DB load 90%

---

## Files to Create/Modify for Phase 5

```
NEW:
- src/utils/cursor.ts (cursor encoding/decoding)
- src/cache/redis.ts (Redis client setup)
- src/cache/strategies.ts (caching patterns)
- docs/performance/PHASE5_IMPLEMENTATION.md

MODIFY:
- app.ts (add Redis client initialization)
- services/monday-store.ts (add caching)
- services/conversation-store.ts (add pagination)
- api/routes.ts (update endpoint signatures)
```

---

**Status:** Ready for Implementation  
**Start Date:** After Phase 4 stabilizes (Week of March 24, 2026)  
**Projected Completion:** Week of April 7, 2026  
**Expected Production Improvement:** 40-60% faster, 60-80% less memory
