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
