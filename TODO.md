# Code Review Fixes — TODO

## Status: Implementing Gemini Code Review Fixes

---

## ✅ Previously Completed (Own Code Review)

- [x] **`frontend/src/App.tsx`** — Restore auth verification
- [x] **`frontend/src/v2/pages/InsightsV2.tsx`** — Fix Rules of Hooks violation
- [x] **`sms-insights/api/routes.ts`** — Timing-safe password comparison
- [x] **`sms-insights/api/routes.ts`** — Memoize `getAllowedOrigins()`
- [x] **`sms-insights/api/routes.ts`** — Compile-on-first-use regex cache for `routeMatches`
- [x] **`sms-insights/api/routes.ts`** — Fix `err: any` in daily report handlers
- [x] **`frontend/src/v2/V2App.tsx`** — Move `InboxV2` lazy import to top of file
- [x] **`frontend/src/v2/layout/V2Shell.tsx`** — Remove `isDesktopCollapsed` dead code
- [x] **Add `displayName` to `withErrorBoundary` HOC**
- [x] **Handle `startViewTransition` `finished` promise**
- [x] **Standardize URLSearchParams helpers** in `v2Queries.ts`
- [x] **Remove dead `detectUiMode` / `uiMode.ts` infrastructure**
- [x] **Extract `'America/Chicago'` to shared constant** across all 5 frontend pages

---

## Gemini Code Review Fixes

### Phase 1: Critical + High (Backend) ✅ COMPLETE

- [x] **1a.** `sms-insights/services/daily-report-v2.ts` — Fix null `created_at` fallback (use `null` not `new Date()`)
- [x] **1b.** `sms-insights/api/v2-contract.ts` — Make `DailyReportAlertV2.createdAt` nullable (`string | null`)
- [x] **1c.** `sms-insights/api/routes.ts` — Sanitize `/api/runtime-status` public endpoint (strip `detail` fields)
- [x] **1d.** `sms-insights/api/routes.ts` — Validate `compare` query param before type-cast
- [x] **1e.** `sms-insights/api/routes.ts` — Replace remaining hardcoded `'America/Chicago'` in daily report handlers

### Phase 2: Medium — Frontend Code Quality ✅ COMPLETE

- [x] **2a.** `frontend/src/v2/layout/V2Shell.tsx` — Refactor route-to-asset if-chains to data-driven maps
- [x] **2b.** `frontend/src/v2/pages/InboxV2.tsx` — Replace inline CSS variable with `sms-pattern-bg--subtle` class
- [x] **2c.** `frontend/src/v2/pages/InboxV2.tsx` — Replace inline divider styles with `sms-section-divider--compact` class
- [x] **2d.** `frontend/src/v2/v2.css` — Add CSS modifier classes, RGB variable tokens, remove dead CSS
- [x] **2e.** `frontend/src/v2/pages/RepV2.tsx` — Move hero banner inline styles to CSS classes
- [x] **2f.** `frontend/src/v2/pages/InsightsV2.tsx` — Extract magic number thresholds to named constants; remove stale unused imports

### Phase 3: Cleanup ✅ COMPLETE

- [x] **3a.** Remove `type-motion copy/` directory (bloat)
- [x] **3b.** Remove `sms-insights-workflow/assets/implementation_plan.md` (duplicate)

### Deferred (Future)

- [ ] `repDisplayName` hardcoded mapping → data-driven (requires DB schema change)
- [ ] `computeDailyReportRange` N+1 optimization (requires significant refactor)
- [ ] Extract `SequencePerformanceTable` inline styles to CSS
- [ ] Extract shared `useTheme` hook from V2Shell + PasswordGate
- [ ] Extract `toInboxConversationV2` to `sms-insights/api/mappers/inbox.ts`
- [ ] Split `sms-insights/api/routes.ts` into domain modules
