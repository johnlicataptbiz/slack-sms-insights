# PT Biz SMS Insights — Usage Guide

This guide covers day-to-day usage of the PT Biz SMS Insights platform for developers, analysts, and administrators.

## 📋 Table of Contents

1. [Dashboard Usage](#1-dashboard-usage)
2. [Slack Bot Commands](#2-slack-bot-commands)
3. [API Usage](#3-api-usage)
4. [Data Management](#4-data-management)
5. [Monitoring & Analytics](#5-monitoring--analytics)
6. [Troubleshooting Operations](#6-troubleshooting-operations)

---

## 1. Dashboard Usage

### 1.1 Accessing the Dashboard

**Local Development:**
```
http://localhost:5173
```

**Production:**
```
https://your-project.vercel.app
```

### 1.2 Authentication

The dashboard supports two authentication modes:

#### Slack OAuth (Production)
1. Click "Sign in with Slack"
2. Authorize the app in your Slack workspace
3. Redirected back to dashboard with active session

#### Dummy Auth (Local Development)
Set `ALLOW_DUMMY_AUTH_TOKEN=true` in backend `.env` to bypass OAuth for testing.

### 1.3 Dashboard Versions

| Version | URL | Features |
|---------|-----|----------|
| Legacy | `/` or `/legacy` | Original dashboard with daily runs list |
| V2 | `/v2/insights` | Modern dashboard with KPIs, charts, real-time data |

**Switching Versions:**
- Use query parameter: `?ui=v2` or `?ui=legacy`
- Or set in browser console:
  ```javascript
  localStorage.setItem('ptbizsms-ui-mode', 'v2');
  location.reload();
  ```

### 1.4 V2 Dashboard Features

#### KPI Cards
- **Messages Sent** — Total SMS messages sent
- **Response Rate** — Percentage of messages with responses
- **Booked Calls** — Number of calls scheduled
- **Revenue** — Estimated revenue from conversions
- **SLA Compliance** — Response time adherence

#### Interactive Charts
- Sales trends over time
- Response rate by channel
- Conversion funnel
- Agent performance metrics

#### Campaign Table
- Sortable by date, channel, performance
- Filter by date range
- Export to CSV
- Drill-down to conversation details

#### Real-time Updates
- Auto-refresh every 30 seconds
- Live indicator when new data arrives
- Toast notifications for significant events

### 1.5 Legacy Dashboard Features

- Daily runs list with status indicators
- Report detail view with full metrics
- Channel filtering
- Basic date range selection

---

## 2. Slack Bot Commands

### 2.1 Daily Report Generation

**Basic Command:**
```
@Aloware SMS Insights populate daily report for today
```

**With Specific Date:**
```
@Aloware SMS Insights populate daily report for 2024-01-15
```

**With Channel Filter:**
```
@Aloware SMS Insights populate daily report for today in #general
```

### 2.2 Conversation Insights

**Get Conversation Summary:**
```
@Aloware SMS Insights summarize conversation +1234567890
```

**Get Thread Analysis:**
```
@Aloware SMS Insights analyze thread <thread_ts>
```

### 2.3 Quick Stats

**Channel Statistics:**
```
@Aloware SMS Insights stats for #marketing
```

**Agent Performance:**
```
@Aloware SMS Insights agent stats @username
```

### 2.4 Help

**List All Commands:**
```
@Aloware SMS Insights help
```

---

## 3. API Usage

### 3.1 Authentication

All API requests require authentication via:
- **Bearer Token** (from Slack OAuth session)
- **CSRF Token** (for write operations)

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
     -H "X-CSRF-Token: <csrf-token>" \
     https://api.example.com/api/runs
```

### 3.2 Core Endpoints

#### Health Check
```bash
GET /api/health
```
Returns service status and database connectivity.

#### Get Daily Runs
```bash
GET /api/runs?daysBack=7&channelId=C123456
```
Query Parameters:
- `daysBack` (number, default: 7) — Days of history to fetch
- `channelId` (string, optional) — Filter by Slack channel
- `limit` (number, default: 50) — Maximum results

Response:
```json
{
  "data": [
    {
      "id": "run_123",
      "reportType": "daily",
      "channelId": "C123456",
      "messagesSent": 150,
      "responsesReceived": 45,
      "bookedCalls": 12,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1
  }
}
```

#### Get Conversation Metrics
```bash
GET /api/conversations/metrics?startDate=2024-01-01&endDate=2024-01-31
```

#### Get KPIs
```bash
GET /api/kpis?period=7d
```
Periods: `24h`, `7d`, `30d`, `90d`

#### Stream Real-time Updates
```bash
GET /api/stream
```
Server-sent events endpoint for live dashboard updates.

### 3.3 Write Operations

#### Create Manual Run
```bash
POST /api/runs
Content-Type: application/json
X-CSRF-Token: <token>

{
  "reportType": "manual",
  "channelId": "C123456",
  "messagesSent": 100,
  "responsesReceived": 30,
  "notes": "Manual entry for testing"
}
```

#### Update Work Item
```bash
PATCH /api/work-items/:id
Content-Type: application/json
X-CSRF-Token: <token>

{
  "status": "resolved",
  "resolution": "Contact responded positively"
}
```

### 3.4 WebSocket API

Connect to WebSocket for real-time updates:
```javascript
const ws = new WebSocket('wss://api.example.com/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New data:', data);
};
```

Events:
- `run.created` — New daily run logged
- `conversation.updated` — Conversation status changed
- `kpi.updated` — KPI values refreshed

---

## 4. Data Management

### 4.1 Backfill Operations

When you need to populate historical data:

#### Backfill Slack Events
```bash
cd sms-insights
npm run backfill:slack
```
Backfills SMS events from Slack conversation history.

Options:
```bash
# Specific date range
START_DATE=2024-01-01 END_DATE=2024-01-31 npm run backfill:slack

# Specific channel
CHANNEL_ID=C123456 npm run backfill:slack
```

#### Backfill Booked Calls
```bash
npm run backfill:booked-calls
```
Syncs booked call data from Monday.com and Aloware.

#### Backfill Contact Profiles
```bash
npm run backfill:contact-profiles
```
Enriches contact data from HubSpot and Aloware.

#### Backfill LRN Data
```bash
npm run backfill:contact-profiles-lrn
```
Adds line type (mobile/landline) information to contacts.

### 4.2 Sync Operations

#### Monday.com Sync
```bash
npm run sync:monday
```
Syncs lead and call data with Monday.com boards.

Options:
```bash
# Full sync with backfill
FULL_SYNC=true npm run sync:monday

# Specific board only
BOARD_ID=5077164868 npm run sync:monday
```

#### Refresh Booked Call Attribution
```bash
npm run refresh:booked-attribution
```
Recalculates attribution for booked calls across channels.

### 4.3 Data Regeneration

#### Regenerate Daily Runs
```bash
npm run regenerate:runs
```
Recreates daily run records from raw event data.

Useful when:
- Analytics logic changes
- Data corrections needed
- Migrating to new schema

### 4.4 Data Auditing

#### Check Monday Lead Normalization
```bash
npm run check:monday:lead-normalization
```
Validates lead data consistency between systems.

#### Rebuild Governed Analytics
```bash
npm run rebuild:monday:governed
```
Rebuilds pre-aggregated analytics tables.

### 4.5 Database Maintenance

#### Connect to Database
```bash
# Local
psql sms_insights

# Railway
railway db:connect
```

#### Common Maintenance Queries

```sql
-- Check table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname='public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Find old data to archive
SELECT * FROM daily_runs 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Archive old runs (move to archive table)
INSERT INTO daily_runs_archive 
SELECT * FROM daily_runs 
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM daily_runs 
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## 5. Monitoring & Analytics

### 5.1 Health Monitoring

#### Backend Health
```bash
curl https://api.example.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "slack": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Railway Logs
```bash
railway logs --follow
```

Filter by service:
```bash
railway logs --service sms-insights
```

#### Vercel Analytics
Access via Vercel Dashboard → Analytics

### 5.2 Performance Monitoring

#### Database Performance
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Check connection count
SELECT count(*) FROM pg_stat_activity;
```

#### API Performance
Monitor via:
- Railway metrics dashboard
- Custom logging in `services/logger.ts`
- Vercel Edge Function logs (for frontend API calls)

### 5.3 Business Analytics

#### Daily Metrics Query
```sql
SELECT 
  DATE(created_at) as date,
  SUM(messages_sent) as total_messages,
  SUM(responses_received) as total_responses,
  ROUND(AVG(response_rate), 2) as avg_response_rate,
  SUM(booked_calls) as total_booked
FROM daily_runs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### Channel Performance
```sql
SELECT 
  channel_id,
  COUNT(*) as run_count,
  SUM(messages_sent) as total_messages,
  ROUND(AVG(response_rate), 2) as avg_response_rate
FROM daily_runs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY channel_id
ORDER BY total_messages DESC;
```

---

## 6. Troubleshooting Operations

### 6.1 Common Issues

#### Dashboard Not Loading
1. Check backend health: `curl /api/health`
2. Verify `VITE_API_URL` points to correct backend
3. Check browser console for CORS errors
4. Verify `ALLOWED_ORIGINS` includes dashboard URL

#### Slack Bot Not Responding
1. Check Socket Mode connection in logs
2. Verify `SLACK_APP_TOKEN` is valid
3. Ensure bot is invited to channel
4. Check app mention permissions

#### Missing Data in Dashboard
1. Verify daily runs are being created:
   ```sql
   SELECT * FROM daily_runs ORDER BY created_at DESC LIMIT 5;
   ```
2. Check backfill status for historical data
3. Verify channel filters aren't too restrictive

#### Slow Query Performance
1. Check for missing indexes:
   ```sql
   SELECT schemaname, tablename, attname as column, n_tup_read, n_tup_fetch
   FROM pg_stats 
   WHERE schemaname = 'public'
   ORDER BY n_tup_read DESC;
   ```
2. Run `EXPLAIN ANALYZE` on slow queries
3. Consider adding composite indexes for common filters

### 6.2 Emergency Procedures

#### Reset Database Connection
```bash
# Restart backend service
railway up --service sms-insights

# Or locally
Ctrl+C  # Stop dev server
npm run dev  # Restart
```

#### Clear Cache
```bash
# Frontend cache
# Clear browser localStorage and reload

# Backend cache (if Redis enabled)
redis-cli FLUSHDB
```

#### Rollback Deployment
```bash
# Railway
railway rollback

# Vercel
# Use Vercel dashboard → Deployments → Redeploy previous
```

### 6.3 Log Analysis

#### Backend Logs
```bash
# Real-time logs
railway logs --follow

# Search for errors
railway logs | grep ERROR

# Specific time range
railway logs --start 2024-01-15T10:00:00Z --end 2024-01-15T11:00:00Z
```

#### Frontend Logs
- Browser DevTools → Console
- Vercel Edge Function logs (for API routes)

### 6.4 Getting Support

1. **Check Documentation:**
   - [ONBOARDING.md](ONBOARDING.md) — Setup issues
   - [API.md](../architecture/API.md) — API questions
   - [CONTRIBUTING.md](../development/CONTRIBUTING.md) — Development workflow

2. **Review Logs:**
   - Railway logs for backend issues
   - Browser console for frontend issues
   - Slack app logs for integration issues

3. **Open Issue:**
   Include:
   - Error message
   - Steps to reproduce
   - Environment details (Node version, OS, browser)
   - Relevant log excerpts

---

## 📚 Quick Reference Card

| Task | Command/URL |
|------|-------------|
| Dashboard (Local) | http://localhost:5173 |
| Dashboard (Prod) | https://your-project.vercel.app |
| API Health | GET /api/health |
| Get Runs | GET /api/runs?daysBack=7 |
| Backfill Slack | `npm run backfill:slack` |
| Sync Monday | `npm run sync:monday` |
| Database GUI | `npx prisma studio` |
| Railway Logs | `railway logs --follow` |

---

**Need more help?** Check the [ONBOARDING.md](ONBOARDING.md) for setup issues or [API.md](../architecture/API.md) for API details.
