# Implementation Plan: Database Migration & Deployment Recovery

## Overview
Migrate the SMS Insights production deployment from the outdated Prisma database to the complete and robust ptbizsms database, resolve Railway deployment issues, and verify full system functionality including the changelog feature.

## Current State Analysis (Updated: 2026-03-09)

### ✅ Completed Work

1. **TypeScript Fix**: Resolved TS2322 error in `sms-insights/api/routes.ts` (commit `d233ee2`)
   - Fixed `messages` array type incompatibility with `InboxMessageRow`
   - Properly handled `event_ts` Date/string conversion for legacy events

2. **Changelog Feature**: Fully implemented and deployed
   - Backend service: `sms-insights/services/changelog-service.ts`
   - API endpoint: `GET /api/v2/changelog` in `sms-insights/api/routes.ts`
   - Frontend component: `frontend/src/v2/components/ChangelogPanel.tsx`
   - GitHub Actions workflow: `.github/workflows/deploy.yml` (created for CI/CD)

3. **Database JSON Fix**: Fixed 22P02 JSON errors in `sms-insights/services/inbox-contact-profiles.ts`
   - Added CAST to jsonb for tags and raw columns in upsert query

4. **GitHub Actions CI/CD**: Added automated deployment workflow (commit `dd5ef85`)
   - Workflow triggers on push to main
   - Uses Railway CLI for deployment
   - Includes build and deploy steps

### ⚠️ Critical Issues

1. **Railway Deployment Incident**: "Deploys are temporarily paused due to an ongoing incident"
   - **Current deployed SHA**: `c6273ac` (old, from March 9, 2026 22:52 UTC)
   - **Latest commit SHA**: `dd5ef85` (has all fixes including GitHub Actions)
   - **Status**: Cannot deploy via CLI due to Railway infrastructure issue
   - **Impact**: Running on outdated code without JSON fix and changelog improvements

2. **Changelog Git History**: API returns only 1 entry (deployment marker)
   - Root cause: Railway deployments don't include `.git` directory
   - The service gracefully handles this by returning empty timeline
   - **Fix needed**: Alternative git history source or build-time changelog generation

3. **Database Connection**: Currently connected to old/outdated Prisma database
   - Target database (ptbizsms) is more complete and robust
   - Connection string: `postgresql://07b4c267f59513292ecea7f09217f913053ddd9972c3f21eec56bf65e9bde0a3:sk_TeOuHW6axVcjkvKBJr03a@db.prisma.io:5432/postgres?sslmode=require`

4. **Health Status**: Service is running but on outdated code
   - Health checks pass: `/api/health` returns `ok=true`
   - Database connection works (to old DB)
   - Build SHA mismatch: deployed `c6273ac` vs latest `dd5ef85`

## Implementation Steps

### Phase 1: Database Migration to ptbizsms

**Goal**: Switch Railway environment to use the correct ptbizsms database.

**Files**:
- `sms-insights/services/prisma.ts` - Prisma client configuration (already supports both modes)
- `sms-insights/prisma/schema.prisma` - Database schema (compatible)
- Railway environment variables (via dashboard or CLI once incident resolves)

**Actions**:
1. Update `DATABASE_URL` environment variable in Railway:
   ```
   postgresql://07b4c267f59513292ecea7f09217f913053ddd9972c3f21eec56bf65e9bde0a3:sk_TeOuHW6axVcjkvKBJr03a@db.prisma.io:5432/postgres?sslmode=require
   ```

2. Update `PRISMA_ACCELERATE_URL` environment variable:
   ```
   prisma+postgres://accelerate.prisma-data.net/?api_key=[ptbizsms-api-key]
   ```

3. Verify database connectivity after variable update

### Phase 2: Resolve Railway Deployment Block

**Goal**: Deploy latest code (commit `d233ee2`) to Railway once incident resolves.

**Files**:
- `.github/workflows/deploy.yml` - CI/CD pipeline
- `railway.toml` - Railway configuration
- `sms-insights/package.json` - Build scripts

**Actions**:
1. Monitor Railway status page for incident resolution
2. Once resolved, trigger deployment via GitHub Actions or CLI:
   ```bash
   cd sms-insights && railway up
   ```
3. Verify deployment succeeds and health checks pass
4. Confirm build SHA matches latest commit (`d233ee2`)

### Phase 3: Verify Changelog Feature

**Goal**: Ensure changelog API and frontend work correctly with authenticated access.

**Files**:
- `sms-insights/services/changelog-service.ts` - Git history parser
- `frontend/src/v2/components/ChangelogPanel.tsx` - UI component
- `frontend/src/api/v2Queries.ts` - React Query hook

**Actions**:
1. Test changelog API with authentication:
   ```bash
   curl -X POST https://ptbizsms.com/api/auth/password \
     -H "Content-Type: application/json" \
     -d '{"password": "bigbizin26"}'
   
   curl https://ptbizsms.com/api/v2/changelog?days=7 \
     -H "Cookie: [session-cookie]" \
     -H "X-CSRF-Token: [csrf-token]"
   ```

2. Verify frontend displays changelog modal in SequencesV2 page

3. Check that git history is properly parsed and categorized

### Phase 4: Full System Verification

**Goal**: Confirm all features work correctly with new database.

**Actions**:
1. Test core API endpoints:
   - `/api/health` - System health
   - `/api/runs` - Daily runs
   - `/api/v2/sequences` - Sequence analytics
   - `/api/inbox/conversations` - Inbox data

2. Verify database tables have correct data:
   - `conversations` - Core conversation data
   - `conversation_state` - Qualification data
   - `sms_events` - Message history
   - `booked_calls` - Call bookings
   - `inbox_contact_profiles` - Contact profiles

3. Test frontend functionality:
   - Login with password
   - View sequences dashboard
   - Access inbox
   - View analytics

## Database Migration Details

### Source Database (Current - Outdated)
- Connection: Old Prisma project
- Status: Missing recent schema changes and data
- Issues: JSON type mismatches, incomplete data

### Target Database (ptbizsms - Intended)
- **Connection String**: `postgresql://07b4c267f59513292ecea7f09217f913053ddd9972c3f21eec56bf65e9bde0a3:sk_TeOuHW6axVcjkvKBJr03a@db.prisma.io:5432/postgres?sslmode=require`
- **Project**: ptbizsms on Prisma
- **Status**: More complete, robust, intended production database
- **Schema**: Fully compatible with current application

### Migration Verification Checklist
- [ ] All tables exist with correct schema
- [ ] Indexes are properly defined
- [ ] Foreign key constraints work
- [ ] JSON/JSONB columns handle data correctly
- [ ] Recent data is present (last 30 days)

## Changelog Feature Specification

### Current Issue: Git History Not Available in Production
**Problem**: Railway deployments don't include the `.git` directory, so the changelog service can't read commit history at runtime.

**Solution**: Build-time changelog generation

### Implementation Plan for Build-Time Changelog

#### New Files to Create:
1. **Build Script**: `sms-insights/scripts/generate-changelog-json.ts`
   - Runs during build process (prebuild hook)
   - Generates `changelog.json` from git history
   - Includes last 365 days of commits

2. **Updated Service**: `sms-insights/services/changelog-service.ts`
   - Modify to read from `changelog.json` if `.git` not available
   - Fallback to runtime git log if `.git` exists (local dev)

3. **Package.json Update**: Add prebuild script
   ```json
   "scripts": {
     "prebuild": "tsx scripts/generate-changelog-json.ts",
     "build": "tsc && node dist/app.js"
   }
   ```

#### API Endpoint
- **URL**: `GET /api/v2/changelog`
- **Query Parameters**:
  - `days`: Number of days to look back (default: 30, max: 365)
- **Response**: `ChangelogTimeline` object with entries grouped by date

### Types
```typescript
type ChangelogEntryType = 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';

interface ChangelogEntry {
  hash: string;
  date: string; // ISO 8601
  message: string;
  author: string;
  type: ChangelogEntryType;
  category: string;
  description: string;
}

interface ChangelogStats {
  features: number;
  fixes: number;
  refactors: number;
  docs: number;
  other: number;
}

interface ChangelogTimeline {
  entries: ChangelogEntry[];
  totalCount: number;
  dateRange: { from: string; to: string };
  stats: ChangelogStats;
}
```

### Frontend Component
- **Location**: `frontend/src/v2/components/ChangelogPanel.tsx`
- **Features**:
  - Modal display with date-grouped entries
  - Color-coded type badges
  - Statistics summary
  - Time range filtering (7d, 30d, 90d, 365d)
  - Git commit history with author attribution

## Environment Variables Required

### Railway (Backend) - To Be Updated
```env
DATABASE_URL=postgresql://07b4c267f59513292ecea7f09217f913053ddd9972c3f21eec56bf65e9bde0a3:sk_TeOuHW6axVcjkvKBJr03a@db.prisma.io:5432/postgres?sslmode=require
PRISMA_ACCELERATE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=[ptbizsms-key]
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
ALOWARE_API_KEY=...
MONDAY_API_KEY=...
DASHBOARD_PASSWORD=bigbizin26
```

### Vercel (Frontend)
```env
VITE_API_URL=https://sms-insights-production.up.railway.app
VITE_FIREBASE_API_KEY=...
```

## Testing Checklist

### Backend Tests
- [ ] TypeScript compilation passes (`npm run typecheck:v2`)
- [ ] Backend builds successfully (`npm run build`)
- [ ] Railway deployment succeeds
- [ ] Database connection works to ptbizsms
- [ ] Changelog API returns correct data
- [ ] All API endpoints respond correctly

### Frontend Tests
- [ ] TypeScript compilation passes
- [ ] Build succeeds
- [ ] Vercel deployment succeeds
- [ ] Login works with password
- [ ] Changelog modal displays
- [ ] All dashboard features work

### Integration Tests
- [ ] Frontend can reach backend API
- [ ] Database queries return expected data
- [ ] Real-time updates work
- [ ] Authentication flows work

## Rollback Plan

If migration fails:
1. Revert Railway environment variables to old database
2. Redeploy previous stable commit if needed
3. Check Railway logs for specific errors
4. Verify database connectivity independently using `scripts/test-db-connection.ts`

## Implementation Order

### Phase 1: Code Fixes ✅ COMPLETED
1. ✅ **TypeScript Error Fix** - Fixed TS2322 in `sms-insights/api/routes.ts`
2. ✅ **Database JSON Fix** - Fixed 22P02 errors in `inbox-contact-profiles.ts`
3. ✅ **Changelog Feature** - Implemented full changelog API and frontend
4. ✅ **Build-Time Changelog** - Created `generate-changelog-json.ts` script
5. ✅ **CI/CD Pipeline** - Added GitHub Actions workflow for Railway deployment

### Phase 2: Deployment (BLOCKED - Railway Incident)
**Status**: Railway deployment incident ongoing since March 9, 2026
- Current deployed SHA: `c6273ac` (old)
- Latest commit SHA: `88f9232` (has all fixes)
- **Cannot deploy** via CLI or GitHub Actions until incident resolves

**Next Steps Once Incident Resolves**:
1. Railway deployment will auto-trigger via GitHub Actions on push
2. Verify build SHA updates to `88f9232`
3. Test changelog API returns 315 entries (not just 1)
4. Verify database connection to ptbizsms

### Phase 3: Database Migration (PENDING)
**Status**: Environment variables need update once deployment works
- Update `DATABASE_URL` to ptbizsms connection string
- Update `PRISMA_ACCELERATE_URL` with correct API key
- Verify all tables and data are accessible

### Phase 4: Full System Verification (PENDING)
- Test all API endpoints with authentication
- Verify frontend displays changelog correctly
- Run production smoke checks

## Success Criteria

- ✅ Railway deployment shows build SHA `d233ee2` or later
- ✅ Health check `/api/health` returns `ok: true` with ptbizsms database
- ✅ Changelog API returns non-empty entries for last 7 days
- ✅ Frontend login works and displays changelog
- ✅ All database tables accessible and contain data
- ✅ No 22P02 JSON errors in logs
