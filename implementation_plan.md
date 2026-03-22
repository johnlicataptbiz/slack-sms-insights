# Implementation Plan for Monday Sync Fix

## Overview
Fix and enable Monday.com sync functionality in the sms-insights app. The sync handles data synchronization between Slack events, SMS data, and Monday.com boards for booked calls, SMS reports, SMS sequences, and governed analytics. Current state shows sync jobs are feature-flagged as 'disabled' in app.ts logs, pending calls exist, and configuration is incomplete. This plan will make sync reliable, automatic, and production-ready by configuring boards, enabling flags, fixing column mappings, and adding monitoring.

The sync is critical for PTBiz dashboard KPIs and lead attribution. It reads from monday_sync_state table for cursors/status, uses monday-client.ts for API calls, and stores column snapshots in monday_call_column_latest/history.

## Types
No new types needed. Existing Prisma models cover:
- `monday_sync_state`: board_id, cursor, status, last_sync_at
- `monday_board_registry`: board metadata
- `monday_call_column_latest`: per-item column data
- `monday_booked_call_pushes`: booked call writeback tracking

Extend `MondaySyncConfig` in monday-sync.ts with validation.

## Files
- **sms-insights/.env**: Add MONDAY_API_TOKEN, MONDAY_PERSONAL_BOARD_ID, MONDAY_SMS_BOARD_IDS, MONDAY_SMS_SEQUENCES_BOARD_IDS, MONDAY_SMS_REPORTS_BOARD_IDS, enable MONDAY_SYNC_ENABLED=true
- **sms-insights/services/monday-sync.ts**: Enable syncEnabled, configure boardIds, column maps
- **sms-insights/services/monday-sms-sync.ts**: Enable and configure SMS boards
- **sms-insights/services/monday-sms-sequences.ts**: Enable and configure sequences boards
- **sms-insights/services/monday-sms-reports.ts**: Enable and configure reports boards
- **sms-insights/app.ts**: Remove 'Monday jobs disabled' logs if flags enabled
- **sms-insights/monday-sync-manager.mjs**: Enhance for production usage
- New: **sms-insights/services/monday-sync-monitor.ts**: Health check cron job

No deletions.

## Functions
- **monday-sync.ts**:
  - `syncMondayBoard(boardId, logger)`: Add error handling, cursor resumption, retry logic
  - `startMondaySyncJobs(logger)`: Enable via MONDAY_SYNC_ENABLED
- **monday-sms-sync.ts**:
  - `syncMondaySmsBoard(boardId, logger)`: Same improvements
  - `startMondaySmsSyncJobs(logger)`: Enable via flag
- **monday-personal-writeback.ts**: Add retry, validation
- New **monday-sync-monitor.ts**: `checkSyncHealth()` - report pending/error statuses to Slack

## Classes
No new classes. Extend MondayClient with GraphQL query pooling.

## Dependencies
- `@slack/bolt`: ^4.6.0 (current)
- `@prisma/client`: ^7.4.2 (current)
- No new packages. All Monday API calls use WebClient.

## Testing
- **Unit**: Expand tests/services/monday-sms-sync.test.ts for edge cases (no cursor, errors)
- **Integration**: npm run test:monday-sms-sync, test:monday-sms-sequences, test:monday-sms-reports
- **Manual**: railway run npx tsx monday-sync-manager.mjs pending/sync, check Prisma Studio

## Implementation Order
1. Configure .env with board IDs/token, set flags true
2. Test current sync: cd sms-insights && railway run npx tsx monday-sync-manager.mjs pending
3. Edit services/monday-sync.ts: enable configs, add retry
4. Edit app.ts: conditional job starts
5. Test: npm run test:monday-sms-sync
6. Add monitor service, cron job
7. Production deploy: railway up
8. Monitor logs/Prisma for sync status
