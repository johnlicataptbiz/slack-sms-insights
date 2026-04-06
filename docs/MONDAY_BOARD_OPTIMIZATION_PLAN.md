# Monday.com Board Optimization Plan

## Executive Summary

This document outlines the plan to transform PTBiz SMS Monday.com boards from raw data dumps into useful reporting dashboards. The optimization is divided into 4 phases, with Phases 1 and 2 complete.

## Current State Assessment

### Board Inventory

| Board ID | Name | Purpose | Items | Status |
|----------|------|---------|-------|--------|
| 10029059942 | Fixed (Booked Calls) | Personal call tracking | ~172 | Deduped, cleaned |
| 18404367751 | SMS Events | Active conversation queue | ~50 | Script-driven |
| 18404367764 | SMS Sequences | Campaign performance KPIs | ~15-30 | Script-driven |
| 18404367781 | SMS Daily Reports | Weekly executive summaries | ~4-12 | Weekly sync |

### Identified Pain Points

1. **Raw Text Dumps** - SMS bodies truncated to 220 chars, stored as unstructured text
2. **Update Stacking** - Every sync appended a new `create_update()`, creating noise
3. **Noisy Item Names** - "Contact Name • Inbound • 2026-04-05" instead of just "Contact Name"
4. **Missing Structure** - Metrics embedded in text instead of proper column types
5. **No Staleness Control** - Updates posted on every sync cycle regardless of frequency
6. **No Actionable Intelligence** - Data presented without recommendations or alerts

---

## Phase 1: Core Engine Fixes (COMPLETE)

**Commits:** `98af6df4`, `285c60e4`

### Changes Made

#### 1. `monday-client.ts` - Core Engine
- **`UPDATE_COOLDOWN_HOURS`** (env: `MONDAY_UPDATE_COOLDOWN_HOURS`, default: 24) - Prevents update stacking
- **`MAX_TEXT_FIELD_LENGTH`** (180) - Limit for short text fields
- **`MAX_LONG_TEXT_LENGTH`** (500) - Limit for summaries and notes
- **`truncateText()`** - Intelligent truncation at sentence/word boundaries
- **`extractFirstSentence()`** - Extracts actionable snippet from raw SMS body
- **`truncateLongText()`** - Limits summaries to 500 chars
- **`shouldPostUpdate()`** - Checks if last update exceeds cooldown period
- **`upsertBookedCallItem()`** - Now staleness-aware, returns `updatePosted` boolean
- **`upsertWeeklySummaryItem()`** - Now staleness-aware, returns `updatePosted` boolean

#### 2. `push-sms-events-to-monday.ts` - Events Board
- Item names: "Contact Name" only (no metadata clutter)
- Summaries: Bullet format with `extractFirstSentence()` for message preview
- Added `Latest Message` column mapping

#### 3. `push-sms-sequences-to-monday.ts` - Sequences Board
- Item names: "Sequence Name" with optional `[paused]` indicator
- Optimization notes: Structured bullets with all key metrics
- **Auto-generated recommendations:**
  - ⚠️ Low reply rate (<8% on 50+ sends) → "review opener copy"
  - ⚠️ Low booking rate (<1% on 10+ replies) → "improve CTA or follow-up"
  - ⚠️ Declining trend → "consider A/B testing"
  - ✓ Strong performer (Up + 5%+ booking) → "consider scaling volume"
- Added `Engagement Score` computed column (0-100 composite)

#### 4. `weekly-manager-summary.ts` - Reports Board
- New `concise` mode generates bullet-format summaries under 500 chars
- Format: `📊 Week of X: metrics`, `• Jack: N booked`, `⚠️ risk flags`, `→ action`
- Full multi-line markdown still available for API/frontend consumers
- Monday sync uses concise version by default

### Expected Impact
- **~90% reduction in update noise** - updates only post every 24h
- **Readable item names** - Clean contact/sequence names
- **Structured text** - Bullets instead of raw dumps
- **Auto-alerts** - Sequences board shows warnings for underperformers

---

## Phase 2: Board Schema Updates (COMPLETE)

**Commit:** `deacae1f` - "feat(monday): Phase 2 board repair script for missing column detection and creation"

### Updated Column Schemas

#### SMS Events Board - Redesigned

| Column | Type | Purpose | Change |
|--------|------|---------|--------|
| Contact Name | Text | Customer identifier | Keep |
| Phone Number | Phone | Phone number | Keep |
| Direction | Status | Inbound/Outbound/System | **Rename** from Signal Type |
| Priority | Status | Hot/Normal/Low | **NEW** - auto-calculated |
| Next Step | Status | Reply/Follow Up/Book/Archive/Escalate | **Updated** labels |
| Latest Message | Long Text | First sentence of SMS | **NEW** - structured snippet |
| Channel | Text | Communication channel | Keep |
| Assigned To | Text | Person responsible | **Rename** from Setter |
| Sequence | Text | Campaign name | Keep |
| Slack Thread | Link | Thread reference | **Rename** from Slack Link |
| Summary | Long Text | Structured bullet summary | **Updated** format |
| Last Reply | Date | When message was received | **Rename** from Event Date |
| Conversation ID | Text | Unique identifier | Keep |
| Reply Rate % | Numbers | Computed metric | Phase 2+ |
| Response Time Hours | Numbers | Computed metric | Phase 2+ |
| Conversation Quality Score | Numbers | Computed metric | Phase 2+ |

#### SMS Sequences Board - Redesigned

| Column | Type | Purpose | Change |
|--------|------|---------|--------|
| Sequence Name | Text | Campaign identifier | Keep |
| Owner | Text | Responsible team member | Keep |
| Status | Status | Active/Paused/Testing/Archived | Keep |
| Time Window | Text | Reporting period | Keep |
| Messages Sent | Numbers | Total sends | Keep |
| Replies | Numbers | Total replies | Keep |
| Reply Rate % | Numbers | Reply percentage | Keep |
| Booked Calls | Numbers | Total bookings | Keep |
| Booking Rate % | Numbers | Booking percentage | Keep |
| Trend | Status | Up/Flat/Down | Keep |
| WoW Change % | Numbers | Week-over-week change | **NEW** |
| Engagement Score | Numbers | 0-100 composite | **NEW** |
| Last Updated | Date | Sync timestamp | Keep |
| Optimization Notes | Long Text | Recommendations | **Updated** format |

#### SMS Daily Reports Board - Redesigned

| Column | Type | Purpose | Change |
|--------|------|---------|--------|
| Week Start | Date | Week start date | Keep |
| Reporting Period | Text | Date range | Keep |
| Total Booked | Numbers | Aggregate bookings | **NEW** - explicit total |
| Jack | Numbers | Individual bookings | Keep |
| Brandon | Numbers | Individual bookings | Keep |
| Self Booked | Numbers | Self-service bookings | Keep |
| vs Last Week | Numbers | Percentage change | **NEW** |
| Trend | Status | Up/Flat/Down | Keep |
| Health | Status | Good/Watch/Action | Keep |
| Health Score | Numbers | 0-100 composite | **NEW** |
| Key Notes | Long Text | Primary KPIs | Keep |
| Actions Next Week | Long Text | Planned improvements | Keep |
| Exceptions | Long Text | Anomalies | Keep |
| Last Synced | Date | Sync timestamp | Keep |

### Schema and Tooling
- `apps/backend/services/monday-board-schemas.ts` - Updated with new column definitions
- `apps/backend/scripts/repair-monday-board-columns.ts` - Board repair script (Phase 2 commit)

### How to run the repair script

```bash
# Requires MONDAY_API_TOKEN set in .env
npx tsx scripts/repair-monday-board-columns.ts
```

The script will:
1. Connect to each board (Events, Sequences, Reports)
2. Compare existing columns against the schema in `monday-board-schemas.ts`
3. Report missing columns, type mismatches, and extra columns
4. Create any missing columns with correct types and status label defaults
5. Provide a summary with next steps

---

## Phase 3: Automation & Intelligence (PLANNED)

### Monday Automations (to configure in Monday UI)

#### Events Board Automations
1. **Auto-Priority Assignment**
   - When: `Last Reply` is older than 2 hours AND `Direction` = Inbound
   - Then: Set `Priority` = Hot
   - When: `Last Reply` is older than 24 hours AND `Direction` = Inbound
   - Then: Set `Priority` = Hot, notify Assigned To

2. **Auto-Archive Resolved**
   - When: `Next Step` changed to Archive
   - Then: Move item to Archive group after 7 days

3. **SLA Breach Alert**
   - When: `Priority` = Hot for more than 4 hours
   - Then: Send Slack notification to #sms-ops

#### Sequences Board Automations
1. **Trend Auto-Calculation**
   - When: Item updated
   - Then: Calculate WoW Change % from previous sync data
   - Set `Trend` = Up if WoW > +15%, Down if WoW < -15%, else Flat

2. **Health Score Update**
   - When: Metrics updated
   - Then: Calculate Engagement Score = (ReplyRate/20 * 50) + (BookingRate/5 * 50)

### Dashboard Views (to configure in Monday UI)

#### Events Board Views
1. **Kanban View** - Grouped by Priority (Hot → Normal → Low)
2. **Calendar View** - Items by Last Reply date
3. **Table View** - Filtered: Priority = Hot, sorted by Last Reply ascending

#### Sequences Board Views
1. **Chart View** - Reply Rate % vs Booking Rate % scatter plot
2. **Table View** - Sorted by Engagement Score descending
3. **Filter View** - Status = Active, Trend = Down (at-risk sequences)

#### Reports Board Views
1. **Chart View** - Total Booked weekly trend line
2. **Table View** - Last 8 weeks, sorted by Week Start descending

---

## Phase 4: Governance & Maintenance (PLANNED)

### Sync Frequency Policy
| Board | Max Sync Frequency | Recommended Schedule |
|-------|-------------------|---------------------|
| SMS Events | Hourly | Every 2 hours during business hours |
| SMS Sequences | Every 2 hours | Daily at 9am, 1pm, 5pm CT |
| SMS Daily Reports | Weekly | Monday 8am CT |

### Staleness Detection
- Add `last_sync_status` tracking visible in reports board
- Alert when sync hasn't run within expected window
- Auto-skip sync if data hasn't changed

### Item Archival Policy
- Events: Auto-archive items older than 14 days
- Sequences: Archive sequences paused for 4+ weeks
- Reports: Keep last 12 weeks, archive older

### Schema Versioning
- Version the board schema in `monday-board-schemas.ts`
- Detect drift on each sync (missing columns, type mismatches)
- Log warnings when schema doesn't match board state

---

## Implementation Checklist

### Phase 1 (COMPLETE)
- [x] Add staleness detection to monday-client.ts
- [x] Add text truncation utilities
- [x] Update push-sms-events-to-monday.ts
- [x] Update push-sms-sequences-to-monday.ts
- [x] Update weekly-manager-summary.ts
- [x] Commit changes (`98af6df4`, `285c60e4`)

### Phase 2 (COMPLETE)
- [x] Update monday-board-schemas.ts with new column definitions
- [x] Create board repair script to add missing columns (`deacae1f`)
- [x] Script passes biome lint checks

### Phase 3 (PLANNED)
- [ ] Configure Monday automations (UI-based)
- [ ] Create dashboard views (UI-based)
- [ ] Add WoW Change % calculation to sequences sync
- [ ] Add Priority auto-calculation to events sync

### Phase 4 (PLANNED)
- [ ] Implement sync rate limiting
- [ ] Add staleness tracking and alerting
- [ ] Create item archival automation
- [ ] Add schema versioning and drift detection

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONDAY_API_TOKEN` | (required) | Monday.com API token |
| `MONDAY_API_TIMEOUT_MS` | 12000 | API request timeout |
| `MONDAY_API_MAX_RETRIES` | 2 | Max retry attempts |
| `MONDAY_API_RETRY_BASE_MS` | 500 | Base retry delay |
| `MONDAY_UPDATE_COOLDOWN_HOURS` | 24 | Hours between update posts (0 to disable) |
| `MONDAY_SMS_EVENTS_BOARD_ID` | 18404367751 | Events board ID |
| `MONDAY_SMS_SEQUENCES_BOARD_ID` | 18404367764 | Sequences board ID |
| `MONDAY_SMS_REPORTS_BOARD_ID` | 18404367781 | Reports board ID |

---

## Monday.com Best Practices Applied

1. **Use column types appropriately** - Numbers for metrics, Status for categorical data, Long Text for notes
2. **Keep item names clean** - Use names for identification, columns for metadata
3. **Limit update frequency** - Prevent noise with cooldown periods
4. **Structure text content** - Use bullets and consistent formatting
5. **Create dashboard views** - Different views for different use cases (Kanban, Chart, Table)
6. **Automate routine actions** - Use Monday automations for status changes and alerts
7. **Archive old items** - Keep boards manageable with archival policies
8. **Use status labels consistently** - Standardize label names across boards

---

## Next Steps

1. **Run board repair script** to add missing columns: `npx tsx scripts/repair-monday-board-columns.ts`
2. **Configure Monday automations** in the Monday.com UI (Phase 3)
3. **Create dashboard views** for each board (Phase 3)
4. **Test the changes** with a full sync cycle
5. **Monitor for 1 week** to ensure staleness detection works correctly