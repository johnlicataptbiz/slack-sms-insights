Phase 2 Implementation TODO

## Step 1: Fix API Contract & Mapping (Bugs #3, #5, #6)
- [x] Update `InboxConversationV2` in `sms-insights/api/v2-contract.ts` to include `objectionTags`, `callOutcome`, and `guardrailOverrideCount`.
- [x] Update `InboxConversationV2` in `frontend/src/api/v2-types.ts` to include `objectionTags`, `callOutcome`, and `guardrailOverrideCount`.
- [x] Update `toInboxConversationV2` in `sms-insights/api/routes.ts` to map these fields from the DB row.
- [x] Fix `handleGetInboxConversationDetailV2` mergedRow to explicitly forward `state_objection_tags`, `state_call_outcome`, `state_guardrail_override_count` from `ensuredState` so the detail endpoint returns correct values.

## Step 2: Fix Frontend State Management (Bugs #2, #3, #4, #5, #6)
- [x] Fix Bug #2: `onInsertTemplate` in `frontend/src/v2/pages/InboxV2.tsx` replaces text (not appends). Confirmed correct.
- [x] Fix Bugs #3, #5, #6: Removed `(detail.conversation as any).nextFollowupDueAt` cast — now uses `detail.conversation.escalation.nextFollowupDueAt`.
- [x] Fix Bug #4: `useV2OverrideEscalation` in `frontend/src/api/v2Queries.ts` already invalidates `['v2', 'inbox', 'conversation', variables.conversationId]`. Confirmed correct.

## Step 3: Implement Phase 2 Database Tables
- [x] Run `sms-insights/scripts/migrate-phase2-tables.ts`. Tables `conversation_notes` and `message_templates` created successfully.

## Step 4: Implement Stage Gating & Guardrails (Phase 2)
- [x] `containsCallLink` and `containsPodcastLink` utility functions present in `InboxV2.tsx`.
- [x] Stage Gating: Block send if `escalationLevel <= 1` and message contains a call link.
- [x] Guardrail Checklist Modal: Shown when `escalationLevel >= 3` and call link detected. Requires ≥2 checked for "Send Anyway". "Override & Send" requires ≥1 checked.
- [x] Guardrail checklist labels updated to spec: Timeline, Cash Intent, Revenue Ambition, Frustration, Complexity, Engagement, How-To Question.
- [x] Double Pitch Protection: Yellow warning banner above composer (replaces `window.confirm`). Detects prior outbound call link with no inbound reply since. "Send anyway ✕" button to dismiss.

## Step 5: Auto-Snooze after podcast/call link send
- [x] Podcast link send → auto-snooze 72 hours.
- [x] Call link send → auto-snooze 96 hours (4 days).

## Step 6: UX Improvements
- [x] `InsightsV2.tsx`: Daily Stats day labels formatted from ISO (2026-02-19) to human-readable (Feb 19).
- [x] `InsightsV2.tsx`: Booking Rate metric card added: `(canonicalBookedCalls / peopleContacted * 100).toFixed(1) + '%'`.
- [x] `InsightsV2.tsx`: 'This Week' panel Window timestamps formatted via `toLocaleDateString()`.
- [x] `SequencesV2.tsx`: Booking Rate column added after 'Booked': `(canonicalBookedCalls / messagesSent * 100).toFixed(1) + '%'`. Shows '—' if `messagesSent === 0`.
- [x] `SequencesV2.tsx`: Tooltip on 'w/ SMS Reply' column header: 'Booked calls where the contact had replied to an SMS before booking'.
- [x] `RepV2.tsx`: Booking Rate metric card added: `(booked / outbound * 100).toFixed(1) + '%'`, shows 'n/a' if `outbound === 0`.

## Follow-up
- [x] Run `tsc --noEmit --skipLibCheck` in both `frontend` and `sms-insights`. Both pass with zero errors.
- [x] All Phase 2 implementation steps complete.
