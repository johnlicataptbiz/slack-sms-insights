# PT Biz Revenue Messaging System — Phase 2 Implementation Plan

## 1. Information Gathered (Site Audit Results)

A comprehensive audit of the live site (`https://ptbizsms.com/v2/inbox`) and the codebase has been completed. The Phase 1 and Phase 3 features are largely functional, but several critical bugs were identified, primarily stemming from a mismatch between the database schema and the API contract for Phase 3 fields. Additionally, the analytical pages lack depth and visual clarity.

### Bugs & Edge Cases Detected
1. **BUG #1 (Stage Gating NOT enforced):** The frontend currently allows sending call links regardless of the escalation level. This is a missing Phase 2 feature.
2. **BUG #2 (Template APPENDS instead of replaces):** The `onInsertTemplate` function in `InboxV2.tsx` appends the template text to the existing `composerText` instead of replacing it.
3. **BUG #3, #5, #6 (Phase 3 fields missing/wiped):** The `InboxConversationV2` TypeScript interface in `v2-contract.ts` and `v2-types.ts` does not include the Phase 3 fields (`objectionTags`, `callOutcome`, `guardrailOverrideCount`). Consequently, the `toInboxConversationV2` mapping function in `routes.ts` does not map these fields from the database row to the API response. The frontend attempts to access them using `as any` casts, which results in `undefined`. This causes the local state to be reset to empty/null on every query re-fetch.
4. **BUG #4 (Escalation button active state lost):** The `useEffect` in `InboxV2.tsx` correctly syncs `escalationLevel` from `detail.conversation.escalation.level`. However, a timing issue or a missing query invalidation in the `useV2OverrideEscalation` mutation causes the local state to be out of sync with the UI after a save.
5. **BUG #7 ("Stop" replies showing as "needs reply"):** Opt-out requests (e.g., "Stop", "STOP") are not automatically DNC'd and remain in the urgent queue.
6. **BUG #8 (Monday Pipeline all zeros):** The Monday sync is stale (data from 2/23, today is 2/25).
7. **BUG #9 (Daily Activity Discrepancy):** The Daily Activity page shows 0 booked calls for 2/23, but the Performance page shows 4 sets for the same day.

### UX & Analytical Gaps Identified
*   **Performance Page (`/v2/insights`):**
    *   KPI Definitions panel is open by default, wasting screen real estate.
    *   "Actions Next Week" only provides 1 generic recommendation.
    *   No trend charts/sparklines for visual context; just raw numbers.
    *   No conversion funnel visualization.
    *   Daily Stats show raw numbers and ISO date formats (`2026-02-19`).
    *   ↓↑ arrows on KPI cards lack benchmark/target context.
    *   No "Booking Rate" metric (conversations → booked calls %).
    *   Sets Breakdown and Call Sources lack visual charts.
    *   List Health lacks a "Reply Rate" column.
*   **Sequences Page (`/v2/sequences`):**
    *   No "Booking Rate" column (booked/sent ratio) — only raw "Booked" count.
    *   No visual charts — all tables.
    *   "w/ SMS Reply" column is not explained anywhere.
    *   Underperformers (e.g., CPFM Check In: 476 sent, 0 booked) and top performers (e.g., Cash Practice Field Manual: 12 booked) are not visually flagged.
    *   Lead Magnet Comparison table is mostly empty/useless (all v2 columns "—").
    *   No trend data — just 7d or 30d window.
*   **Inbox Page (`/v2/inbox`):**
    *   Stage → Call Conversion shows all 0% because Phase 2 call gating is not built yet.
    *   Top Objections data is very sparse.
    *   Many phone-number-only contacts (no name enrichment).
    *   No pagination — all 75 conversations shown at once.
*   **Rep Stats Pages (`/v2/rep/jack`, `/v2/rep/brandon`):**
    *   Shows data for a specific business day (e.g., 2026-02-23) instead of a rolling window or today.
    *   "Booking Hints" are not shown/explained.
    *   "Day by Day" shows just deltas, no trend chart.
    *   No weekly/monthly trend.
    *   No "Booking Rate" metric.
*   **Daily Activity Page (`/v2/runs`):**
    *   No visual chart — just a list of runs.
    *   No run selected by default in "Run Details".
    *   No "Reply Rate" column in the run list.

### Phase 2 Requirements (Conversion Control)
*   **Stage Gating:** Block sending messages containing call links if the escalation level is 1 (Awareness).
*   **Guardrail Checklist:** Require a checklist of 7 signals to be completed (≥2 checked) before allowing a call link to be sent at L3/L4.
*   **Double Pitch Protection:** Warn the user if a call link was already sent and no reply has been received.
*   **Podcast/Call Auto-Snooze:** Automatically create follow-up reminders when podcast or call links are sent.
*   **Objection Tag Requirement:** Require at least one objection tag before moving a thread to L2 (Objection stage).

---

## 2. Detailed Code Update Plan

### Step 1: Fix API Contract & Mapping (Bugs #3, #5, #6)
*   **`sms-insights/api/v2-contract.ts` & `frontend/src/api/v2-types.ts`:**
    *   Update the `InboxConversationV2` interface to include the missing Phase 3 fields:
        ```typescript
        objectionTags: string[];
        callOutcome: CallOutcomeV2 | null;
        guardrailOverrideCount: number;
        ```
*   **`sms-insights/api/routes.ts`:**
    *   Update the `toInboxConversationV2` function signature to accept the new fields from the DB row (`state_objection_tags`, `state_call_outcome`, `state_guardrail_override_count`).
    *   Map these fields to the returned object:
        ```typescript
        objectionTags: row.state_objection_tags || [],
        callOutcome: (row.state_call_outcome as CallOutcomeV2) || null,
        guardrailOverrideCount: row.state_guardrail_override_count || 0,
        ```

### Step 2: Fix Frontend State Management (Bugs #2, #3, #4, #5, #6)
*   **`frontend/src/v2/pages/InboxV2.tsx`:**
    *   **Bug #2:** Update `onInsertTemplate` to replace the text: `setComposerText(filled);`.
    *   **Bugs #3, #5, #6:** Remove the `as any` casts in the `useEffect` that syncs state from `detail`. Use the newly typed fields directly:
        ```typescript
        setLocalObjectionTags(detail.conversation.objectionTags);
        setLocalCallOutcome(detail.conversation.callOutcome);
        ```
        Update the Guardrail Override display to use `detail.conversation.guardrailOverrideCount`.
    *   **Bug #4:** Ensure the `useV2OverrideEscalation` mutation in `v2Queries.ts` correctly invalidates the `['v2', 'inbox', 'conversation', variables.conversationId]` query key.

### Step 3: Implement Phase 2 Database Tables
*   **`sms-insights/scripts/migrate-phase2-tables.ts`:**
    *   Run the existing migration script to create the `follow_up_reminders` and `call_link_sends` tables.

### Step 4: Implement Stage Gating & Guardrails (Phase 2)
*   **`frontend/src/v2/pages/InboxV2.tsx`:**
    *   Add a utility function to detect call links (e.g., `calendly.com`, `cal.com`) and podcast links in the `composerText`.
    *   In the `onSend` handler, intercept the send action if a call link is detected.
    *   **Stage Gating:** If `escalationLevel` is 1, block the send and show a warning modal: "Select escalation stage before offering call."
    *   **Guardrail Checklist:** If `escalationLevel` is 3 or 4, open a new `GuardrailModal` component.
        *   The modal should present the 7 signals (timeline, cash intent, etc.).
        *   Require ≥2 checked to proceed.
        *   If <2, show a warning and require an override explanation (which calls `incrementGuardrailOverride`).
*   **`sms-insights/api/routes.ts` & `sms-insights/services/inbox-send.ts`:**
    *   Add backend validation to reject messages with call links if the escalation level is insufficient (defense in depth).

### Step 5: Implement Double Pitch Protection & Auto-Snooze (Phase 2)
*   **`sms-insights/services/inbox-store.ts`:**
    *   Add functions to query `call_link_sends` to check for prior unreplied call links.
    *   Add functions to create `follow_up_reminders`.
*   **`sms-insights/api/routes.ts`:**
    *   Create endpoints for checking guardrail status and managing reminders.
*   **`frontend/src/v2/pages/InboxV2.tsx`:**
    *   Before sending a call link, query the backend to check for double pitches. Show a warning if detected.
    *   After successfully sending a podcast or call link, automatically trigger the snooze mutation (48-72hr for podcast, 3-4 days for call).

### Step 6: UX & Analytics Improvements (Code Quality & Maintainability)
*   **`frontend/src/v2/pages/InsightsV2.tsx`:**
    *   Close KPI Definitions panel by default.
    *   Format Daily Stats dates to human-readable format.
    *   Add "Booking Rate" metric.
    *   Add visual charts (e.g., `V2StatBar`) for Sets Breakdown and Call Sources.
*   **`frontend/src/v2/pages/SequencesV2.tsx`:**
    *   Add "Booking Rate" column.
    *   Visually flag underperformers and top performers.
*   **`frontend/src/v2/pages/RepV2.tsx`:**
    *   Add "Booking Rate" metric.
*   **`frontend/src/v2/pages/RunsV2.tsx`:**
    *   Add "Reply Rate" column to the run list.

---

## 3. Dependent Files to be Edited

1.  `sms-insights/api/v2-contract.ts` (Types)
2.  `frontend/src/api/v2-types.ts` (Types)
3.  `sms-insights/api/routes.ts` (API Handlers & Mapping)
4.  `frontend/src/v2/pages/InboxV2.tsx` (UI & Logic)
5.  `frontend/src/api/v2Queries.ts` (React Query Hooks)
6.  `sms-insights/services/inbox-store.ts` (DB Queries)
7.  `sms-insights/services/inbox-send.ts` (Send Logic)
8.  `frontend/src/v2/pages/InsightsV2.tsx` (UX Improvements)
9.  `frontend/src/v2/pages/SequencesV2.tsx` (UX Improvements)
10. `frontend/src/v2/pages/RepV2.tsx` (UX Improvements)
11. `frontend/src/v2/pages/RunsV2.tsx` (UX Improvements)

---

## 4. Follow-up Steps

1.  Run `tsc --noEmit --skipLibCheck` in both `frontend` and `sms-insights` to ensure type safety after updating the API contracts.
2.  Test the bug fixes on the local development server.
3.  Run the Phase 2 database migration.
4.  Implement and test the Phase 2 features (Stage Gating, Guardrails, Double Pitch Protection).
5.  Implement and test the UX & Analytics improvements.
6.  Commit and push the changes.
