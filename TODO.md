# TODO: Improve Slack Bot Interaction

## Phase 1 — Core Slack Bot ✅ Complete
- [x] 1. Create `sms-insights/services/report-poster.ts` — shared report generation + Block Kit posting
- [x] 2. Update `sms-insights/manifest.json` — add `/sms-report` + `/sms-scoreboard` slash commands
- [x] 3. Refactor `sms-insights/services/cron-scheduler.ts` — direct report generation (no more message → bot)
- [x] 4. Improve `sms-insights/listeners/commands/index.ts` — `/sms-report` + `/sms-scoreboard` commands
- [x] 5. Improve `sms-insights/listeners/actions/index.ts` — all interactive button handlers incl. scoreboard
- [x] 6. Improve `sms-insights/listeners/events/app-home-opened.ts` — live App Home with recent runs from DB
- [x] 7. Improve `sms-insights/listeners/events/app-mention.ts` — rich Block Kit response

## Phase 2 — Robustness & Impressiveness ✅ Complete
- [x] 8. Upgrade `buildDailySnapshotBlocks` — 🟢🟡🔴 indicators, mini progress bars, signal summary line
- [x] 9. Create `sms-insights/services/scoreboard-poster.ts` — weekly scoreboard Block Kit card from live DB
- [x] 10. Add `📊 Scoreboard` button to every report action row (`report-poster.ts`)
- [x] 11. Add `sms_scoreboard_view` + `sms_scoreboard_refresh` action handlers (`actions/index.ts`)
- [x] 12. App Home: live "Recent Reports" section from DB + `📊 Weekly Scoreboard` quick-action button

## Phase 3 — Manifest Push ✅ Complete
- [x] 13. Push `/ask`, `/sms-report`, `/sms-scoreboard` slash commands to live Slack app (A0AFCE7ENE5)
        via `apps.manifest.update` API using Slack CLI rotation token
        Script: `sms-insights/scripts/push-manifest-final.py`

## Phase 4 — Bug Fixes ✅ Complete
- [x] 14. **Date display bug** (`app-mention.ts`) — bare `@SMS Insights` mention in #alowaresmsupdates
        now defaults to `'daily report'` prompt instead of empty string. Generates the daily snapshot
        format (`PT BIZ - DAILY SMS SNAPSHOT` + `Date:` header) so `reportDate` is stored and KPI
        values render correctly in the dashboard. Bad Feb 27 run (null reportDate, wrong format)
        deleted from DB (id: cfe3f1fe-17ab-42f3-b66c-4fe3c597014a).
- [x] 15. **List ordering bug** (`RunsV2.tsx`) — added `sortedItems` useMemo that sorts by
        `reportDate` (YYYY-MM-DD) when stored, falling back to generation `timestamp`. A manual
        report generated today for Feb 24 data now appears after Feb 25 in the list, not before it.
        Commit: e70f5c3
