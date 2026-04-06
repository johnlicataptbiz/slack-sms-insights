# Data Ingestion Pipeline - Deployment Runbook

## Overview

The PTBiz SMS Insights data ingestion pipeline collects SMS events from these sources:

1. **Slack Channel Mirroring** (PRIMARY - only working path): Aloware SMS logs are mirrored to a Slack channel, parsed by the Bolt listener (`app.message()` in `listeners/messages/index.ts`), and stored in the database.
2. **Aloware Webhook Receiver** (available, needs Aloware-side config): Real-time webhook endpoint for immediate SMS event ingestion at `/api/webhooks/aloware`.
3. **Monday.com Sync** (existing): Polls Monday.com boards for booked calls, lead outcomes, and metrics.

> **Important:** Aloware's public API does NOT include an SMS list/fetch endpoint. The polling service (`aloware-sms-poller.ts`) is disabled because no such endpoint exists. Confirmed by reviewing the complete Aloware API documentation. The only SMS ingestion paths are Slack channel mirroring and the webhook receiver.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Aloware SMS    │────▶│  Slack Channel   │────▶│  Bolt Listener  │
│  (mirrored)     │     │  #aloware-updates│     │  (app.message)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  Aloware API    │────▶│  Polling Service │──────────────┤
│  (direct)       │     │  (5-min interval)│              │
└─────────────────┘     └──────────────────┘              │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Aloware Webhook│────▶│  Webhook Handler │────▶│  sms_events DB  │
│  (real-time)    │     │  /api/webhooks/  │     │  + projections  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  Monday.com     │────▶│  Monday Sync     │              │
│  (boards)       │     │  (15-min interval)│              │
└─────────────────┘     └──────────────────┘              │
                                                          ▼
                                                  ┌─────────────────┐
                                                  │  V2 Dashboard   │
                                                  │  (ptbizsms.com) │
                                                  └─────────────────┘
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `ALOWARE_API_TOKEN` | Aloware API authentication token | `your_aloware_token` |
| `ALOWARE_CHANNEL_ID` | Slack channel ID for SMS ingestion | `C09ULGH1BEC` |

### Data Ingestion Pipeline

| Variable | Default | Description |
|----------|---------|-------------|
| `ALOWARE_POLLING_ENABLED` | `false` | Enable direct Aloware API polling |
| `ALOWARE_POLL_INTERVAL_MS` | `300000` | Polling interval in milliseconds (5 min) |
| `ALOWARE_POLL_LOOKBACK_MINUTES` | `10` | How far back to look on each poll |
| `ALOWARE_POLL_MAX_EVENTS` | `100` | Maximum events per poll cycle |
| `ALOWARE_WEBHOOK_SECRET` | _(empty)_ | HMAC secret for webhook signature validation |

### Monday.com Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `MONDAY_API_TOKEN` | _(empty)_ | Monday.com API token |
| `MONDAY_SYNC_ENABLED` | `false` | Enable Monday.com board sync |
| `MONDAY_ACQ_BOARD_ID` | `5077164868` | Acquisition funnel board ID |
| `MONDAY_PERSONAL_BOARD_ID` | `10029059942` | Personal calls board ID |
| `MONDAY_SMS_EVENTS_BOARD_ID` | _(empty)_ | SMS events board ID |
| `MONDAY_SMS_SEQUENCES_BOARD_ID` | _(empty)_ | SMS sequences board ID |

## Deployment Steps

### 1. Set Environment Variables on Railway

```bash
# Via Railway CLI
railway variables set ALOWARE_POLLING_ENABLED=true
railway variables set ALOWARE_POLL_INTERVAL_MS=300000
railway variables set ALOWARE_POLL_LOOKBACK_MINUTES=10
railway variables set ALOWARE_POLL_MAX_EVENTS=100

# Or via Railway dashboard:
# 1. Go to project → Environment
# 2. Add the variables above
```

### 2. Configure Aloware Webhook (Optional, for real-time ingestion)

In Aloware admin panel:
1. Navigate to Settings → Webhooks
2. Add new webhook with URL: `https://sms-insights-production.up.railway.app/api/webhooks/aloware`
3. Set event type: `sms.sent` and `sms.received`
4. Copy the webhook secret and set `ALOWARE_WEBHOOK_SECRET` in Railway

### 3. Configure Monday.com Sync (Optional)

```bash
railway variables set MONDAY_SYNC_ENABLED=true
railway variables set MONDAY_API_TOKEN=your_monday_token
railway variables set MONDAY_ACQ_BOARD_ID=5077164868
```

### 4. Deploy

```bash
# Push to trigger Railway deploy
git push origin main

# Or manually trigger
railway up
```

### 5. Validate Pipeline

```bash
# SSH into Railway or run locally with production DATABASE_URL
npx tsx scripts/validate-pipeline.ts
```

Expected output:
```
═══════════════════════════════════════════════════════
  PTBiz SMS Insights - Pipeline Validation Report
═══════════════════════════════════════════════════════

✅ Database Connection
   Connected. SMS events count: 1234

✅ SMS Events Ingestion
   Total: 1234, Last 24h: 45, Last 7d: 312

✅ Contact Profiles
   Total contact profiles: 567

✅ Conversations
   Total: 890, Open: 123

✅ Aloware Polling
   Enabled. Ingested: 45, Errors: 0

✅ Monday.com Sync
   Enabled. Boards: 5077164868

───────────────────────────────────────────────────────
Summary: 8 passed, 0 warnings, 0 failed
───────────────────────────────────────────────────────

✅ Pipeline validation PASSED. All systems operational.
```

## API Endpoints

### Webhook Receiver

```
POST /api/webhooks/aloware
Content-Type: application/json
X-Aloware-Signature: sha256=...

{
  "event_type": "sms.sent",
  "direction": "outbound",
  "contact_id": "12345",
  "contact_name": "John Doe",
  "contact_phone": "+18555551234",
  "body": "Hi, I'm interested in learning more.",
  "line_label": "Main Desk",
  "sequence_label": "Welcome Sequence",
  "user_name": "Jack",
  "timestamp": "2026-04-06T18:30:00Z"
}
```

Response: `200 OK`
```json
{
  "success": true,
  "data": {
    "status": "success",
    "eventId": "uuid-here",
    "conversationId": "uuid-here"
  }
}
```

### Admin Endpoints (require auth session)

```
POST /api/admin/aloware/poll
```
Triggers an immediate Aloware API poll.

```
GET /api/admin/aloware/status
```
Returns current polling state.

## Troubleshooting

### Dashboard Shows Zero Values

1. **Check if polling is enabled**: `GET /api/admin/aloware/status`
2. **Run validation script**: `npx tsx scripts/validate-pipeline.ts`
3. **Check logs**: Railway → Logs → filter for "Aloware"
4. **Verify API token**: Ensure `ALOWARE_API_TOKEN` is set and valid

### SMS Events Not Being Ingested

1. **Check Aloware API connectivity**:
   ```bash
   curl -H "Accept: application/json" \
     "https://app.aloware.com/api/v1/webhook/sms/events?api_token=YOUR_TOKEN&limit=1"
   ```

2. **Check Slack channel configuration**:
   - Ensure `ALOWARE_CHANNEL_ID` matches the correct Slack channel
   - Verify the bot is in the channel

3. **Check ingest monitor**:
   - Look for skip rate warnings in logs
   - Common skip reasons: `unknown_direction`, `missing_contact`

### Monday.com Sync Not Working

1. **Verify board IDs**: Ensure board IDs are correct and accessible
2. **Check API token**: Verify `MONDAY_API_TOKEN` has read permissions
3. **Check sync state**: Query `monday_sync_state` table for last sync timestamps

## Data Flow

### SMS Event Ingestion

1. SMS event arrives (via Slack, webhook, or polling)
2. Parsed and validated (direction, contact info)
3. Inserted into `sms_events` table (upsert by channel+ts)
4. Conversation projected/updated in `conversations` table
5. Contact profile created/updated in `inbox_contact_profiles`
6. Work items created for inbound messages needing replies
7. Opt-out detection auto-marks conversations as DNC

### Monday.com Sync

1. Polls configured boards every 15 minutes
2. Discovers column mappings automatically
3. Normalizes items and upserts into:
   - `monday_call_snapshots`
   - `monday_call_column_latest`
   - `monday_metric_facts`
   - `lead_attribution`
   - `lead_outcomes`
   - `setter_activity`

### Dashboard Metrics

All V2 dashboard metrics are computed from the database tables:
- **Metrics**: `fact_sms_daily`, `fact_booking_daily`, `fact_sequence_funnel_daily`
- **Inbox**: `conversations`, `inbox_contact_profiles`, `conversation_state`
- **Runs**: `daily_runs`
- **Sequences**: `sequence_registry`, `fact_sequence_funnel_daily`
- **Attribution**: `booked_call_attribution`, `fact_attribution_method_daily`
