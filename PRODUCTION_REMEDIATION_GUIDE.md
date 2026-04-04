# Production Remediation Guide — Phase 1 Implementation
**Status:** Ready for implementation  
**Estimated Duration:** 2-4 hours  
**Priority:** CRITICAL

---

## Overview

This guide provides step-by-step instructions to fix the 9 broken API endpoints and restore the production dashboard to operational status.

---

## Phase 1: API Route Wiring (0-2 hours)

### Step 1.1: Create V2 API Router

**File:** `/apps/backend/src/routes/v2.routes.ts` (NEW)

```typescript
import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../services/logger.js';

// Import services
import { getSalesMetrics } from '../services/sales-metrics.js';
import { getInsightsSummary } from '../services/insights-summary.js';
import { getInboxConversations } from '../services/inbox-store.js';
import { getInboxSendConfig } from '../services/send-line-catalog.js';
import { getInboxTemplates } from '../services/inbox-send.js';
import { getRuns } from '../services/daily-run-logger.js';
import { getChannels } from '../services/daily-run-logger.js';
import { getSequencesDeep } from '../services/sequences-deep.js';
import { getAttributionHealth } from '../services/attribution-health.js';
import { getSequencesFunnel } from '../services/sequence-kpis.js';
import { getAttributionMethods } from '../services/sequence-booked-attribution.js';
import { getRepsResponse } from '../services/sales-metrics.js';
import { getAttributionReviewQueue } from '../services/attribution-review-queue.js';
import { getAttributionUnresolved } from '../services/sequence-booked-attribution.js';
import { getSequencesQualification } from '../services/sequence-qualification-analytics.js';

const router = Router();

// Error wrapper for consistent error handling
const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => 
  (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// ─── Insights Endpoints ────────────────────────────────────────────────────

/**
 * GET /api/v2/insights/summary
 * Returns KPI summary for a given time range
 */
router.get('/insights/summary', asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  
  try {
    const data = await getInsightsSummary({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch insights summary', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch insights summary',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sales-metrics
 * Returns sales metrics for a given time range
 */
router.get('/sales-metrics', asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  
  try {
    const data = await getSalesMetrics({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch sales metrics', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales metrics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Inbox Endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/v2/inbox/conversations
 * Returns list of conversations with optional filtering
 */
router.get('/inbox/conversations', asyncHandler(async (req, res) => {
  const { status, repId, needsReplyOnly = false, search, limit = 50, offset = 0 } = req.query;
  
  try {
    const data = await getInboxConversations({
      status: status ? String(status) : null,
      repId: repId ? String(repId) : null,
      needsReplyOnly: needsReplyOnly === 'true',
      search: search ? String(search) : null,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });
    
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch inbox conversations', { error, status, repId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox conversations',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/inbox/send-config
 * Returns available send lines and configuration
 */
router.get('/inbox/send-config', asyncHandler(async (req, res) => {
  try {
    const data = await getInboxSendConfig();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch inbox send config', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox send config',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/inbox/templates
 * Returns available message templates
 */
router.get('/inbox/templates', asyncHandler(async (req, res) => {
  try {
    const data = await getInboxTemplates();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch inbox templates', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox templates',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Runs Endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/v2/runs
 * Returns daily automation runs
 */
router.get('/runs', asyncHandler(async (req, res) => {
  const { daysBack = 7, channelId, limit = 50, offset = 0 } = req.query;
  
  try {
    const data = await getRuns({
      daysBack: Number(daysBack) || 7,
      channelId: channelId ? String(channelId) : null,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });
    
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch runs', { error, daysBack });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch runs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/channels
 * Returns available channels
 */
router.get('/channels', asyncHandler(async (req, res) => {
  try {
    const data = await getChannels();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch channels', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Sequences Endpoints ───────────────────────────────────────────────────

/**
 * GET /api/v2/sequences/deep
 * Returns deep sequence analytics
 */
router.get('/sequences/deep', asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  
  try {
    const data = await getSequencesDeep({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch sequences deep', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences deep',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sequences/funnel
 * Returns sequence funnel analysis
 */
router.get('/sequences/funnel', asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  
  try {
    const data = await getSequencesFunnel({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch sequences funnel', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences funnel',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sequences/qualification
 * Returns sequence qualification analysis
 */
router.get('/sequences/qualification', asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  
  try {
    const data = await getSequencesQualification({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch sequences qualification', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences qualification',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Attribution Endpoints ─────────────────────────────────────────────────

/**
 * GET /api/v2/attribution/health
 * Returns attribution system health
 */
router.get('/attribution/health', asyncHandler(async (req, res) => {
  try {
    const data = await getAttributionHealth();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch attribution health', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution health',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/methods
 * Returns available attribution methods
 */
router.get('/attribution/methods', asyncHandler(async (req, res) => {
  try {
    const data = await getAttributionMethods();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch attribution methods', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution methods',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/review-queue
 * Returns attribution review queue
 */
router.get('/attribution/review-queue', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const data = await getAttributionReviewQueue({
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });
    
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch attribution review queue', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution review queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/unresolved
 * Returns unresolved attribution items
 */
router.get('/attribution/unresolved', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const data = await getAttributionUnresolved({
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });
    
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch attribution unresolved', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution unresolved',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Reps Endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/v2/reps/response
 * Returns rep response metrics
 */
router.get('/reps/response', asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  
  try {
    const data = await getRepsResponse({ range: String(range) });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch reps response', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reps response',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

export default router;
```

### Step 1.2: Wire Router into HTTP Server

**File:** `/apps/backend/app.ts` (MODIFY)

Find the section where API routes are handled (around line 167):

```typescript
// BEFORE:
if (pathname.startsWith('/api/')) {
  const handled = await handleApiRoute(req, res, pathname, app.logger);
  if (handled) {
    return;
  }
}

// AFTER:
if (pathname.startsWith('/api/v2/')) {
  // Import at top: import v2Router from './src/routes/v2.routes.js';
  const handled = await v2Router(req, res, pathname);
  if (handled) {
    return;
  }
}

if (pathname.startsWith('/api/')) {
  const handled = await handleApiRoute(req, res, pathname, app.logger);
  if (handled) {
    return;
  }
}
```

Actually, since the current setup uses a lightweight router, we need to integrate it differently. Let me provide the correct approach:

**Better approach:** Update `/api/routes.ts` to handle V2 routes:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import v2Router from '../src/routes/v2.routes.js';

export const handleApiRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'warn' | 'error' | 'info' | 'debug'>,
): Promise<boolean> => {
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, source: 'api-routes', ts: new Date().toISOString() }));
    return true;
  }

  // Handle V2 routes
  if (pathname.startsWith('/api/v2/')) {
    try {
      const routePath = pathname.replace('/api/v2', '');
      // Delegate to Express router
      await v2Router(req, res, routePath);
      return true;
    } catch (error) {
      logger?.error?.('V2 route error', { pathname, error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return true;
    }
  }

  logger?.debug?.('Unhandled API route path', { pathname });
  return false;
};
```

### Step 1.3: Test Endpoints Locally

```bash
# Start backend
npm run dev:backend

# In another terminal, test each endpoint
curl http://localhost:3000/api/v2/insights/summary?range=7d
curl http://localhost:3000/api/v2/inbox/conversations
curl http://localhost:3000/api/v2/runs?daysBack=7
curl http://localhost:3000/api/v2/channels
curl http://localhost:3000/api/v2/sequences/deep?range=30d
curl http://localhost:3000/api/v2/attribution/health
curl http://localhost:3000/api/v2/sequences/funnel?range=30d
curl http://localhost:3000/api/v2/attribution/methods
curl http://localhost:3000/api/v2/reps/response?range=7d
curl http://localhost:3000/api/v2/attribution/review-queue
curl http://localhost:3000/api/v2/attribution/unresolved
curl http://localhost:3000/api/v2/sequences/qualification?range=30d
```

All should return 200 with `{ success: true, data: {...}, meta: {...} }` structure.

### Step 1.4: Deploy to Production

```bash
# Commit changes
git add -A
git commit -m "feat: wire up V2 API routes for production dashboard

- Create v2.routes.ts with all 14 endpoints
- Integrate router into HTTP server
- Add error handling and response formatting
- All endpoints now return proper JSON responses

Fixes: 9 broken endpoints returning 500 errors"

# Push to Railway
git push origin main

# Monitor deployment
railway logs
```

---

## Phase 2: Database & Data Verification (2-8 hours)

### Step 2.1: Verify Database Connection

```bash
# SSH into Railway backend
railway shell

# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check table counts
psql $DATABASE_URL -c "
  SELECT 
    'conversations' as table_name, COUNT(*) as row_count FROM conversations
  UNION ALL
  SELECT 'sms_events', COUNT(*) FROM sms_events
  UNION ALL
  SELECT 'daily_runs', COUNT(*) FROM daily_runs
  UNION ALL
  SELECT 'sequences', COUNT(*) FROM sequences
  UNION ALL
  SELECT 'booked_calls', COUNT(*) FROM booked_calls;
"
```

### Step 2.2: Fix Inbox Conversations Endpoint

If the endpoint still returns 500 after routing is fixed:

```bash
# Check Prisma schema
cat apps/backend/prisma/schema.prisma | grep -A 20 "model Conversation"

# Verify table exists
psql $DATABASE_URL -c "\dt conversations"

# Check for data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM conversations;"

# If table doesn't exist, run migrations
npm run prisma:generate
npm run migrate:deploy
```

### Step 2.3: Verify Data Sync Jobs

```bash
# Check if sync jobs are running
npm run sync:monday

# Check Aloware sync status
npm run backfill:hubspot

# Verify SMS events are being ingested
psql $DATABASE_URL -c "
  SELECT 
    DATE(created_at) as date,
    COUNT(*) as event_count
  FROM sms_events
  GROUP BY DATE(created_at)
  ORDER BY date DESC
  LIMIT 7;
"
```

### Step 2.4: Run Pending Migrations

```bash
# Check migration status
npx prisma migrate status

# Deploy any pending migrations
npm run migrate:deploy

# Regenerate Prisma client
npm run prisma:generate
```

---

## Phase 3: Validation & Monitoring (1-2 days)

### Step 3.1: End-to-End Testing

```bash
# Test all endpoints in production
curl https://ptbizsms.com/api/v2/insights/summary?range=7d | jq .
curl https://ptbizsms.com/api/v2/inbox/conversations | jq .
curl https://ptbizsms.com/api/v2/runs?daysBack=7 | jq .

# Verify dashboard loads
open https://ptbizsms.com/v2/insights
open https://ptbizsms.com/v2/inbox
open https://ptbizsms.com/v2/runs
open https://ptbizsms.com/v2/sequences
```

### Step 3.2: Monitor Error Rates

```bash
# Check Railway logs for errors
railway logs --follow

# Check Vercel Analytics
# https://vercel.com/dashboard/ptbizsms/analytics

# Monitor database performance
psql $DATABASE_URL -c "
  SELECT 
    query,
    calls,
    total_time,
    mean_time
  FROM pg_stat_statements
  ORDER BY total_time DESC
  LIMIT 10;
"
```

### Step 3.3: Set Up Alerts

Create a monitoring script to check endpoint health:

**File:** `/apps/backend/scripts/health-check.ts`

```typescript
import { logger } from '../services/logger.js';

const endpoints = [
  'https://ptbizsms.com/api/v2/insights/summary?range=7d',
  'https://ptbizsms.com/api/v2/inbox/conversations',
  'https://ptbizsms.com/api/v2/runs?daysBack=7',
  'https://ptbizsms.com/api/v2/channels',
  'https://ptbizsms.com/api/v2/sequences/deep?range=30d',
  'https://ptbizsms.com/api/v2/attribution/health',
  'https://ptbizsms.com/api/v2/sequences/funnel?range=30d',
  'https://ptbizsms.com/api/v2/attribution/methods',
  'https://ptbizsms.com/api/v2/reps/response?range=7d',
  'https://ptbizsms.com/api/v2/attribution/review-queue',
  'https://ptbizsms.com/api/v2/attribution/unresolved',
  'https://ptbizsms.com/api/v2/sequences/qualification?range=30d',
];

async function checkHealth() {
  const results = await Promise.all(
    endpoints.map(async (url) => {
      try {
        const response = await fetch(url);
        return {
          url,
          status: response.status,
          ok: response.status === 200,
        };
      } catch (error) {
        return {
          url,
          status: 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    logger.error('Health check failed', { failed });
    // Send alert to Slack
  } else {
    logger.info('All endpoints healthy');
  }

  return results;
}

// Run every 5 minutes
setInterval(checkHealth, 5 * 60 * 1000);
```

---

## Rollback Plan

If issues arise after deployment:

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Monitor Railway deployment
railway logs --follow

# Verify endpoints are back to previous state
curl https://ptbizsms.com/api/v2/insights/summary
```

---

## Success Criteria

✅ All 14 endpoints return 200 status  
✅ Response format matches V2 contract  
✅ Dashboard pages load without errors  
✅ Metrics display real data (not zeros)  
✅ No 500 errors in production logs  
✅ Error rate < 0.1%  
✅ Response time < 500ms (p95)  

---

## Troubleshooting

### Endpoint returns 404
- Verify route is registered in v2.routes.ts
- Check path matches exactly (case-sensitive)
- Restart backend server

### Endpoint returns 500
- Check backend logs: `railway logs --follow`
- Verify service function exists and is imported
- Test service function directly in Node REPL
- Check database connection

### Metrics show zeros
- Verify SMS events exist: `SELECT COUNT(*) FROM sms_events;`
- Check sync jobs are running
- Verify Aloware integration is connected
- Check for data ingestion errors in logs

### Response is slow
- Check database query performance
- Add indexes if needed
- Enable caching for expensive queries
- Monitor database CPU/memory

---

## Next Steps

After Phase 1 is complete:
1. Monitor production for 24 hours
2. Collect performance metrics
3. Optimize slow queries
4. Plan Phase 2 (data population)
5. Plan Phase 3 (monitoring & alerting)

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-04  
**Status:** Ready for implementation
