# Implementation Plan — Sales Intelligence Command Center (React + Vite + Slack Bolt)

[Overview]
This repo already has:
- v1: “Daily Runs Dashboard” (daily report logs in `daily_runs`, rendered in `Dashboard`/`RunDetail`).
- v2 foundation: operational command center tables + ingestion + basic “Inbox” (`sms_events`, `conversations`, `work_items`, `/api/work-items`, `frontend/src/pages/Inbox.tsx`).

The next step is to evolve v2 from “a table of needs_reply work items” into a high-performance sales intelligence command center that:
- Improves response speed and accountability (SLA, follow-up lag, ownership).
- Improves visibility for leadership (distributions, trends, rep comparisons).
- Stays fast and simple (server-side aggregation, cursor pagination, minimal UI complexity).
- Scales cleanly (append-only event log + projections + work queue + rollups).

Key architectural decision:
- Treat `sms_events` as the canonical append-only log.
- Treat `conversations` as the “current state” projection.
- Treat `work_items` as the action queue (what needs doing now).
- Add a small set of “metrics rollups” endpoints (server-side aggregation) rather than parsing text reports in the browser.

Immediate product shift:
- Dashboard becomes “Command Center” with 2 primary surfaces:
  1) Inbox (action queue): prioritized work items with fast filters + drill-in.
  2) Insights (leadership): SLA distributions, follow-up lag, conversion velocity proxies, rep accountability.

[Types]
Backend (existing)
- `SmsEventRow` (`sms-insights/services/sms-event-store.ts`)
  - Unique key: `(slack_channel_id, slack_message_ts)` idempotent insert.
  - Fields: `event_ts`, `direction`, `contact_id/phone/name`, `aloware_user`, `sequence`, `line`, `raw`.
- `ConversationRow` (`sms-insights/services/conversation-projector.ts`)
  - Key: `contact_key` = `contact:${contact_id}` or `phone:${digits(phone)}`
  - Fields: `current_rep_id`, `status`, `last_inbound_at`, `last_outbound_at`, `last_touch_at`, `unreplied_inbound_count`, `next_followup_due_at`.
- `WorkItemRow` (`sms-insights/services/work-item-engine.ts`)
  - Types: `needs_reply | sla_breach | hot_lead | unowned | followup_due` (only `needs_reply` implemented)
  - Fields: `conversation_id`, `rep_id`, `severity`, `due_at`, `resolved_at`, `resolution`, `source_event_id`.
- `WorkItemListRow` (`sms-insights/services/work-items.ts`)
  - Join of `work_items` + `conversations` for list rendering.

Frontend (existing)
- `Inbox` page defines a local `WorkItem` type mirroring `WorkItemListRow`.
- `Dashboard`/`RunDetail` uses `Run` and parses `full_report` text via `parseReport()`.

New/expanded types (proposed)
- `WorkItemType` (frontend shared): union of known types.
- `WorkItemStatus`: `open | resolved`.
- `WorkItemListQuery`: `{ type?: WorkItemType; repId?: string; severity?: ...; dueBefore?: ...; limit; cursor? }`
- `ConversationDetail`: conversation + recent events preview (needed for drill-in).
- `Metrics`:
  - `SlaDistribution`: p50/p75/p90/p95, breach rate, open breaches.
  - `FollowUpLag`: distribution of time since last inbound with no outbound.
  - `RepAccountability`: open items by rep, breach rate by rep, median response time by rep.
  - `Volume`: inbound/outbound counts by day, by rep, by sequence.

[Files]
Backend
- Existing:
  - `sms-insights/api/routes.ts` — current endpoints: `/api/runs`, `/api/channels`, `/api/work-items`, `/api/auth/verify`.
  - `sms-insights/services/db.ts` — schema init (additive), tables + indexes.
  - `sms-insights/services/sms-event-store.ts` — insert events.
  - `sms-insights/services/conversation-projector.ts` — upsert conversation.
  - `sms-insights/services/work-item-engine.ts` — needs_reply SLA v1.
  - `sms-insights/services/work-items.ts` — list open work items.
- To add/modify:
  - `sms-insights/api/routes.ts` — add new endpoints for metrics + conversation drill-in + realtime.
  - `sms-insights/services/metrics.ts` (new) — server-side aggregation queries.
  - `sms-insights/services/conversation-store.ts` (new) — fetch conversation + events by contact_key.
  - `sms-insights/services/sms-event-store.ts` — add list-by-contact_key helper (by contact_id/phone).
  - `sms-insights/services/work-items.ts` — add cursor pagination + more filters (severity, due windows).
  - `sms-insights/services/work-item-engine.ts` — add additional work item types incrementally (sla_breach, unowned, followup_due).

Frontend
- Existing:
  - `frontend/src/pages/Inbox.tsx` — polls `/api/work-items` every 10s.
  - `frontend/src/pages/Dashboard.tsx` — polls `/api/runs` every 10s via `setInterval`.
  - `frontend/src/components/RunList.tsx`, `RunDetail.tsx`, `frontend/src/utils/reportParser.ts`.
- To add/modify:
  - `frontend/src/api/client.ts` (new) — typed fetch wrapper (auth header, base URL, error handling).
  - `frontend/src/api/queries.ts` (new) — React Query hooks for work items, metrics, conversation detail.
  - `frontend/src/features/inbox/*` (new) — inbox table, filters, row, drill-in drawer.
  - `frontend/src/features/insights/*` (new) — leadership metrics cards + charts (minimal).
  - `frontend/src/state/filters.ts` (new) — URL-synced filter state (search params).
  - `frontend/src/pages/CommandCenter.tsx` (new) — replaces/augments current Dashboard navigation.
  - Keep `Dashboard` (daily runs) as “Reports” section for now to avoid breaking v1.

Docs
- `DASHBOARD_OVERVIEW.md` — update “v2 next steps” to reflect command center roadmap.

[Functions]
Backend (existing)
- `handleApiRoute()` routes requests and verifies Slack token via `slack.auth.test()` (or dummy bypass token).
- `listOpenWorkItems({ type, repId, limit, offset })` returns open items ordered by `due_at`.
- `upsertConversationFromEvent(event)` updates conversation projection.
- `upsertNeedsReplyWorkItem(conversation, inboundEvent)` creates/updates a single open needs_reply item.
- `resolveNeedsReplyOnOutbound(conversationId, outboundEvent)` resolves needs_reply.

Backend (to implement)
1) Work items: better querying + pagination
- `listOpenWorkItemsCursor(params)`:
  - Replace offset pagination with cursor based on `(due_at, id)` for stability and performance.
  - Add filters: `severity`, `dueBefore`, `overdueOnly`, `repId`, `type`.
2) Conversation drill-in
- `getConversationById(id)` and/or `getConversationByContactKey(contactKey)`
- `listSmsEventsForConversation(conversation)`:
  - Until `sms_events` has `conversation_id`, query by `contact_id` or normalized `contact_phone`.
  - Return last N events for preview (direction/body/event_ts).
3) Metrics aggregation (server-side)
- `getSlaMetrics({ windowDays, repId?, channelId? })`
  - Response time distribution: compute from inbound event to first outbound after it (approx v1).
  - Breach rate: open needs_reply past due.
- `getWorkloadMetrics({ windowDays, repId? })`
  - Open items count, overdue count, by severity/type.
- `getVolumeMetrics({ windowDays, repId?, sequence? })`
  - inbound/outbound counts by day, by rep, by sequence.
4) Realtime updates
- `GET /api/stream` (SSE) emitting:
  - `work_item_created`, `work_item_resolved`, `conversation_updated`
  - Minimal payload: ids + timestamps; frontend invalidates relevant queries.

Frontend (to implement)
- `apiFetch(path, { token, signal })` in `frontend/src/api/client.ts`
- React Query hooks:
  - `useWorkItems(filters)` with `keepPreviousData`, `select` for derived view models.
  - `useMetrics(filters)`
  - `useConversationDetail(conversationId)`
- SSE hook:
  - `useEventStream({ token, onEvent })` that invalidates query keys.

[Changes]
Backend API changes (additive; keep existing endpoints)
- Add:
  - `GET /api/conversations/:id` → conversation + computed fields (e.g., “time since last inbound”).
  - `GET /api/conversations/:id/events?limit=50` → recent sms events for drill-in.
  - `GET /api/metrics/overview?days=7&repId=...` → leadership cards.
  - `GET /api/metrics/sla?days=7&repId=...` → SLA distribution + breach rate.
  - `GET /api/stream` → SSE for realtime invalidation.
- Improve:
  - `GET /api/work-items`:
    - Add `severity`, `overdueOnly`, `cursor` (optional) while keeping `limit/offset` for backward compatibility initially.
    - Return `{ items, nextCursor? }`.

Backend data model improvements (additive)
- Add partial unique index for “one open needs_reply per conversation” to remove update-then-insert race:
  - `CREATE UNIQUE INDEX ... ON work_items(conversation_id) WHERE type='needs_reply' AND resolved_at IS NULL;`
  - (Note: current schema init is additive; index creation is safe.)
- Add `conversation_id` to `sms_events` later (optional) once projector is stable:
  - For now, drill-in queries by `contact_id`/`contact_phone`.

Frontend UX changes (incremental)
- Introduce “Command Center” navigation:
  - Inbox (action queue)
  - Insights (leadership)
  - Reports (existing daily runs)
- Inbox upgrades:
  - Filters: rep, severity, overdue, type, search by phone/contact id.
  - Row actions: “Open in Slack thread” (deep link), “Mark resolved” (future), “Assign” (future).
  - Drill-in drawer: last 10 messages, timestamps, SLA clock, suggested next action.
- Insights upgrades:
  - SLA distribution chart (simple histogram or percentile cards).
  - Rep leaderboard: open items, overdue, median response time.
  - Trend: inbound volume vs replies (proxy for coverage).

State management decisions (avoid overengineering)
- Use React Query for server state everywhere (already present in Inbox).
- Use URLSearchParams for filter state (shareable links, back/forward works).
- Keep local UI state in components; avoid global stores unless needed.

Performance strategy (practical)
- Server-side aggregation for metrics; avoid parsing `full_report` for leadership views.
- Cursor pagination for work items.
- Frontend:
  - `select` in React Query to compute derived view models without re-rendering whole trees.
  - `React.memo` for row components.
  - Virtualize long lists (only if > ~200 rows; otherwise keep simple).
- Realtime:
  - SSE to invalidate queries; fallback to 10s polling (current behavior) if SSE fails.

Slack integration improvements (incremental)
- Work item alerts:
  - When `needs_reply` created: post/update a thread message with SLA due time and “Open Inbox” link.
  - Escalate on breach: notify rep + manager channel (role-based routing later).
- Dedupe:
  - Use existing DB patterns (like `setter_feedback_dedupe`) to avoid repeated alerts.

[Tests]
Backend
- Add unit tests for:
  - `computeContactKey()` normalization.
  - `upsertNeedsReplyWorkItem()` idempotency behavior.
  - New metrics queries (use a test DB or pg test harness).
- Add integration tests for new API routes:
  - `/api/work-items` new filters/cursor.
  - `/api/conversations/:id/events`.
  - `/api/metrics/*`.
Frontend
- Minimal:
  - Type-level safety via TS.
  - Component tests only for critical filter logic (optional).
- Manual verification checklist:
  - Inbox loads, filters work, drill-in works.
  - SSE invalidation updates UI without full refresh.
  - Existing Reports dashboard remains functional.
