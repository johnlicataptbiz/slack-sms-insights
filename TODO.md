# Task TODO

## Tasks

- [x] Read all relevant files (SequencesV2.tsx, InboxV2.tsx, routes.ts, aloware-client.ts, listeners/messages/index.ts, v2.css)
- [x] Fix SequencesV2.tsx TypeScript warning — remove unused `totalBookedNonSmsOrUnknown` destructuring
- [x] InboxV2.tsx — Add Refresh button in composer modal header (Aloware webhook stale-data fix)
- [x] InboxV2.tsx — Expand composer modal to 2-column layout with qualification/escalation/send-line sidebar
- [x] v2.css — Add/adjust responsive rules for expanded composer modal sidebar
- [x] Browser verify Sequences page at ptbizsms.com/v2/sequences

## Daily Activity Page Overhaul

- [x] RunsV2.tsx — Add 4 aggregate KPI cards (Total Runs, Total Messages Sent, Total Booked Calls, Avg Reply Rate)
- [x] RunsV2.tsx — Enhance run list cards with status-colored borders + Latest badge
- [x] RunsV2.tsx — Clean up verbose KPI card labels in run detail
- [x] RunsV2.tsx — Add V2StatBar setter split visualization in run detail
- [x] RunsV2.tsx — Improve Saved Views (remove nested details, add toggle in header)
- [x] v2.css — Add status border modifiers + latestBadge styles
- [x] npm run build — verify TypeScript (✓ 127 modules, 0 errors)
- [x] Browser verify Daily Activity page at ptbizsms.com/v2/runs

## Inbox Chat Thread Layout Fix

- [x] v2.css — `.V2Inbox__composerModalBody`: add `flex: 1; min-height: 0` so modal body fills constrained height and `overflow: auto` works
- [x] v2.css — `.V2Inbox__chatThread`: increase `max-height` from `380px` → `480px`, add `scroll-behavior: smooth`
- [x] InboxV2.tsx — Add `chatThreadRef` (`useRef<HTMLDivElement>`) and attach to `.V2Inbox__chatThread`
- [x] InboxV2.tsx — Add `useEffect` to auto-scroll thread to bottom on `detail?.messages` or `justSentMessage` change
- [x] npm run build — verify TypeScript (✓ 127 modules, 0 errors)
- [x] Committed `df9c0e6` and pushed to `origin/main` → Vercel deployed
