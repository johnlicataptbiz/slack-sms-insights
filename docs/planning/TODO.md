# Implementation Plan

## Tasks

- [x] Read and understand codebase (README, LOCAL_DEV, DASHBOARD_OVERVIEW, vite.config, RunsV2.tsx, SequencesV2.tsx, v2-contract.ts, routes.ts, scoreboard.ts, sales-metrics.ts, sequence-booked-attribution.ts, v2Queries.ts, v2-types.ts, v2.css)
- [ ] Fix 1: RunsV2 booked calls on cards — add `BOOKINGS_ALT_PATTERN` fallback in `buildRunViewModel`
- [ ] Fix 2: Sequences page overhaul — complete rewrite of `SequencesV2.tsx`
  - [ ] KPI row (Active Sequences, Messages Sent, Booked Calls, Avg Reply Rate)
  - [ ] Sequence Performance Table (sortable, expandable audit rows, color coding)
  - [ ] Lead Magnet Comparison panel
  - [ ] Booking Attribution panel
- [ ] CSS: add new styles to `v2.css` for sequences overhaul
- [ ] Verify in browser
