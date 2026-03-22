# Monday.com SMS Integration Guide

## Overview

The SMS Insights platform integrates with Monday.com to surface operational scorecards across three specialized boards:

- **SMS Events** — Conversation-level queue showing latest message state per contact
- **SMS Sequences** — Performance KPI dashboard with weekly metrics and trends
- **SMS Daily Reports** — Executive summary with booked call totals and health indicators

All boards use curated column schemas that transform raw data exports into decision-grade dashboards.

## Board Schemas

### Events Board (SMS Events)
Displays the active conversation queue with action signals.

| Column | Type | Purpose |
|--------|------|---------|
| Contact Name | Text | Customer identifier |
| Phone | Phone | Phone number |
| Latest Message | Long Text | Most recent SMS content |
| Signal Type | Status | Inbound/Outbound/System categorization |
| Next Step | Status | Recommended action (Reply/Monitor/Book/Archive) |
| Slack Link | Link | Thread reference |
| Setter | Text | Person responsible |
| Conversation Summary | Long Text | Context and history |
| Last Updated | Date | When message was received |

### Sequences Board (SMS Sequences)
Performance metrics aggregated from fact tables for each active sequence.

| Column | Type | Purpose |
|--------|------|---------|
| Sequence Name | Text | Campaign identifier |
| Owner | Text | Responsible team member |
| Status | Status | Active/Paused/Testing/Archived |
| Messages Sent | Numbers | Total sends in period |
| Replies | Numbers | Total replies received |
| Reply Rate % | Numbers | Calculated reply percentage |
| Booked Calls | Numbers | Total bookings generated |
| Booking Rate % | Numbers | Calculated booking percentage |
| Trend | Status | Up/Flat/Down week-over-week |
| Last 7 Days Performance | Long Text | Narrative summary |
| Last Updated | Date | Sync timestamp |
| Optimization Notes | Long Text | Recommended improvements |

### Reports Board (SMS Daily Reports)
Weekly executive snapshots with team performance aggregation.

| Column | Type | Purpose |
|--------|------|---------|
| Week | Text | Week identifier (YYYY-Www) |
| Reporting Period | Text | Start/end date range |
| Total Booked | Numbers | Aggregate bookings |
| Jack's Booked | Numbers | Individual contributor bookings |
| Brandon's Booked | Numbers | Individual contributor bookings |
| Self-Booked | Numbers | Self-service bookings |
| Health | Status | Great/Good/Fair/Needs Attention |
| Trend | Status | Up/Flat/Down vs. prior week |
| Key Metrics | Long Text | Primary KPIs and flags |
| Actions Next Week | Long Text | Planned improvements |
| Exceptions | Long Text | Anomalies or blockers |
| Last Synced | Date | When data was last updated |

## Setup

### Prerequisites
- Valid Monday.com API token with board mutation permissions
- Board IDs for the three SMS boards (defaults provided but can be configured)
- Environment variables configured in `.env`

### Configuration

Add to `.env`:
```bash
MONDAY_API_TOKEN=your_actual_api_token_here
MONDAY_EVENTS_BOARD_ID=18404367751      # Optional: override default
MONDAY_SEQUENCES_BOARD_ID=18404367764  # Optional: override default
MONDAY_REPORTS_BOARD_ID=18404367781    # Optional: override default
```

### Obtaining a Monday API Token

1. Go to monday.com → Settings
2. Navigate to Integrations → OAuth & Access tokens
3. Create a personal API token
4. Grant permissions:
   - `boards:read` — Query board structure
   - `boards:write` — Modify board columns and items
5. Copy token to `.env` as `MONDAY_API_TOKEN`

## Usage

### 1. Apply Curated Schema to Existing Boards

If you have existing SMS boards, add the curated columns without recreating:

```bash
npm run monday:repair-sms-boards
```

This script will:
- Query each board's current columns
- Compare against the curated schema
- Create any missing columns in place
- Report completion status

**Example output:**
```
🧼 Polishing Monday.com SMS boards
═══════════════════════════════════════
Adding curated columns that turn raw dumps into decision boards...

📋 Checking SMS Events (board 18404367751)...
✅ Already up to date (9 columns)

📋 Checking SMS Sequences (board 18404367764)...
⚠️  Found 3 missing columns. Creating them...
  ✓ Created: Trend
  ✓ Created: Optimization Notes
  ✓ Created: Last 7 Days Performance

📋 Checking SMS Daily Reports (board 18404367781)...
✅ Already up to date (12 columns)

📊 Polish Summary
═══════════════════════════════════════
Total Created: 3
✅ Board schema upgrade complete! Columns are ready for KPI data.
```

### 2. Populate Events Board with Conversation Queue

Syncs active conversations to the Events board:

```bash
node --import tsx scripts/push-sms-events-to-monday.ts
```

**What it does:**
- Queries `sms_events` table for latest message per contact
- Deduplicates at conversation level
- Maps to Events board columns
- Creates/updates items in Monday

**Expected items:** ~50 active conversations

### 3. Populate Sequences Board with Performance KPIs

Aggregates sequence metrics from fact tables:

```bash
node --import tsx scripts/push-sms-sequences-to-monday.ts
```

**What it does:**
- Queries `fact_sms_daily` and `fact_booking_daily`
- Aggregates sends, replies, reply rate, bookings, booking rate
- Calculates trend vs. prior period
- Creates/updates items in Monday

**Expected items:** ~15-30 active sequences with metrics

### 4. Populate Reports Board with Weekly Summaries

Syncs weekly executive summaries:

```bash
npm run push-sms-reports-to-monday
```

**What it does:**
- Queries `monday_weekly_reports` table
- Maps to Reports board columns
- Calculates health and trend indicators
- Creates/updates weekly snapshot items

**Expected items:** ~4-12 recent/historical weeks

### 5. Full Integration (All Boards at Once)

```bash
# First time: Apply schema
npm run monday:repair-sms-boards

# Then: Populate all boards
node --import tsx scripts/push-sms-events-to-monday.ts
node --import tsx scripts/push-sms-sequences-to-monday.ts
npm run push-sms-reports-to-monday
```

## Automation

### Scheduled Syncs

The weekly manager summary service automatically syncs to the Reports board every week:

```typescript
// services/weekly-manager-summary.ts
await syncWeeklySummaryToMonday(weekStartDate, summaryData);
```

This populates the Reports board with fresh KPIs every Monday morning.

### Event-Driven Syncs

To sync Events board on incoming SMS:

```typescript
// In event listener
await pushSmsEventToMonday(smsEvent);
```

## Troubleshooting

### "Not authenticated" Error
**Cause:** Invalid or missing MONDAY_API_TOKEN  
**Solution:**
1. Generate new API token in Monday.com settings
2. Verify it has `boards:read` and `boards:write` permissions
3. Add to `.env` and restart script

### "Board not found" Error
**Cause:** Board ID is incorrect  
**Solution:**
1. Open Monday.com → SMS Events board
2. Look at URL: `https://monday.com/boards/BOARD_ID`
3. Update `.env` with correct ID

### "Column not found" Error
**Cause:** Board schema is incomplete  
**Solution:**
```bash
npm run monday:repair-sms-boards
```
This will add missing columns.

### No Items Appearing in Monday
**Cause:** Backfill scripts haven't been run  
**Solution:**
```bash
# Run the backfill scripts in order
npm run monday:repair-sms-boards
node --import tsx scripts/push-sms-events-to-monday.ts
node --import tsx scripts/push-sms-sequences-to-monday.ts
npm run push-sms-reports-to-monday
```

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────┐
│  SMS Data Sources                               │
│  (sms_events, fact_*, sequence_registry)        │
└────────────┬────────────────────────────────────┘
             │
             ├─→ Events Board Writer
             │   (push-sms-events-to-monday.ts)
             │   → Events Board (conversation queue)
             │
             ├─→ Sequences Board Writer
             │   (push-sms-sequences-to-monday.ts)
             │   → Sequences Board (performance KPIs)
             │
             └─→ Weekly Summary Service
                 (weekly-manager-summary.ts)
                 → Reports Board (executive summaries)
                 → Slack notifications
                 → Email reports
```

### Column Resolution

All writers use signal-based column matching:

```typescript
const columnId = findColumnIdByTitle(boardColumns, 
  'Messages Sent',
  'SMS Sent',
  'Sends'
);
```

This handles boards with variations in column naming or ordering.

### Defensive Writes

Writes only populate columns that exist on the board:

```typescript
const columnValues: Record<string, unknown> = {};
if (columnId) {
  columnValues[columnId] = value; // Only add if column exists
}
```

## API Reference

### Board Schemas

```typescript
import { mondaySmsBoardSchemas } from '../services/monday-board-schemas';

// Get schema for a board
const eventsSchema = mondaySmsBoardSchemas.events;

// Find missing columns
const missing = findMissingBoardColumns(eventsSchema, boardColumns);

// Resolve column ID by title
const columnId = findColumnIdByTitle(boardColumns, 'Sequence Name');
```

### Client Functions

```typescript
import { 
  queryBoardColumns,
  createBoardColumn,
  upsertBookedCallItem,
  upsertWeeklySummaryItem 
} from '../services/monday-client';

// Read board structure
const columns = await queryBoardColumns(boardId);

// Create new column
await createBoardColumn(boardId, columnDefinition);

// Write item data
await upsertBookedCallItem(boardId, itemData);
await upsertWeeklySummaryItem(boardId, summaryData, columnValues);
```

## Next Steps

1. **Get Monday API Token** → Settings → Integrations → OAuth & Access tokens
2. **Configure .env** → Add MONDAY_API_TOKEN and optional board IDs
3. **Apply Schema** → `npm run monday:repair-sms-boards`
4. **Populate Boards** → Run the three backfill scripts
5. **Monitor Syncs** → Check board items appear and sync regularly

## Support

For issues or questions about the Monday integration:
- Review the [Troubleshooting](#troubleshooting) section
- Check Monday API documentation: https://api.monday.com/
- Examine script output logs for detailed error messages
