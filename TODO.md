# Daily Runs Fix + Page Overhaul

## Tasks

- [x] 1. Create `sms-insights/services/cron-scheduler.ts` — interval-based cron (6 AM CT, user token)
- [x] 2. Update `sms-insights/app.ts` — wire up new cron, remove commented-out old scheduler
- [x] 3. Add CSS to `frontend/src/v2/v2.css` — staleness banner + redesigned run cards
- [x] 4. Overhaul `frontend/src/v2/pages/RunsV2.tsx` — staleness banner, redesigned cards
- [x] 5. Deploy backend: `railway up --service sms-insights`
- [x] 6. Verify Railway logs — `[cron] Daily report cron started — fires at 6:00 AM CT targeting <@U0AEZGJA3BL>` ✅ confirmed in new deployment (19:27 UTC)
