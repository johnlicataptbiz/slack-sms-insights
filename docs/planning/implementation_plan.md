# PT Biz Revenue Messaging System — Implementation Plan
## Phase 2 Advanced + Phase 3 Foundation

**Last updated:** Current session  
**Status:** Phase 1 + Phase 2 core ✅ Complete → Phase 2 Advanced + Phase 3 in progress

---

## COMPLETED (Phase 1 + Phase 2 Core)

- ✅ Flash-to-wrong-contact bug fixed (`isComposerModalOpen` guard in auto-select `useEffect`)
- ✅ Conversation status toggle (Open / Closed / DNC) — UI + backend + DB
- ✅ SMS segment counter (GSM-7 160/153, Unicode 70/67, warn/danger CSS)
- ✅ Bounce error tooltips (`ALOWARE_ERROR_MAP` + `humanizeAlowareError`)
- ✅ Whisper notes (internal team notes, not visible to lead)
- ✅ Snooze with date-based follow-up
- ✅ Conversation assignment (owner label)
- ✅ Message templates (create / insert / delete)
- ✅ All 13 backend endpoints verified ✅

---

## NEXT: Phase 2 Advanced + Phase 3 Foundation

### Priority Order (from roadmap BUILD PRIORITY ORDER)

```
ABSOLUTE FIRST (remaining Layer 2 core):
  → Stage gating before call link
  → Guardrail enforcement
  → Objection tagging
  → Follow-up enforcement (podcast / call triggers)
  → Double pitch protection
  → Call outcome tagging

SECOND (Layer 3 foundation):
  → Stage-to-call conversion dashboard
  → Objection frequency dashboard
  → Source attribution
  → Analytics export
```

---

## FEATURE SPECS

### Feature 1: Objection Tagging Engine
**Roadmap:** Layer 2 — "At least one objection tag required before moving thread to Objection stage"

**Tags:** Money / Time / Spouse / Saturation / Patient payment doubt / Fear of risk / Marketing / Staffing / Scaling

**Podcast episode suggestions per tag:**
- Money → "The Cash-Pay PT Business Model" episode
- Time → "Systemizing Your Practice" episode  
- Spouse → "Getting Buy-In From Your Partner" episode
- Saturation → "Niche Domination Strategy" episode
- Fear of risk → "Risk Reversal Framework" episode
- Marketing → "PT Marketing That Actually Works" episode
- Staffing → "Building Your Dream Team" episode
- Scaling → "Scaling Beyond One Location" episode

**DB change:** `ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS objection_tags TEXT[] NOT NULL DEFAULT '{}'`

**Backend:**
- `updateObjectionTags(conversationId, tags: string[])` in inbox-store.ts
- `POST /api/v2/inbox/conversations/:id/objection-tags` in routes.ts

**Frontend:**
- Objection tag panel in composer sidebar (below Escalation panel)
- Multi-select tag chips (toggle on/off)
- Podcast episode suggestion shown when tag selected
- Warning if escalation level = 2 (Objection) and no tags set

---

### Feature 2: Stage Gating Before Call Link
**Roadmap:** Layer 2 — "System blocks call link send if stage tag is null. Modal prompt: Select escalation stage before offering call."

**Call link detection patterns:**
- `calendly.com`, `cal.com`, `acuityscheduling.com`, `oncehub.com`, `hubspot.com/meetings`, `tidycal.com`, `savvycal.com`

**Logic:**
- If composer text contains call link AND escalation level === 1 → block send
- Show inline warning: "⚠ Stage required — Select escalation level before offering a discovery call"
- Send button disabled until level > 1

**Frontend only** — no backend changes needed.

---

### Feature 3: Double Pitch Protection
**Roadmap:** Layer 2 — "If call link already sent and no reply received: System warns: Momentum unclear. Recommend calibrated question instead."

**Logic:**
- Scan `detail.messages` for outbound messages containing call link patterns
- Find the most recent outbound call-link message
- Check if any inbound message exists AFTER that outbound message
- If no inbound reply since last call link → show warning banner

**Frontend only** — no backend changes needed.

---

### Feature 4: Guardrail Checklist Modal
**Roadmap:** Layer 2 — "When agent selects Level 3 or Level 4 and attempts to send a call link, system prompts agent to confirm at least two of the following..."

**7 checklist items:**
1. Timeline within 6 months
2. Fully cash intent
3. Revenue ambition stated
4. Clear frustration expressed
5. Operational complexity present
6. Strong engagement signal
7. Direct "how to" question asked

**Logic:**
- Triggered when: escalation level ≥ 3 AND composer text contains call link AND user clicks Send
- Modal shows checklist
- If ≥ 2 checked → allow send
- If < 2 checked → show "Guardrails insufficient. Podcast-first escalation recommended."
- Override: requires note text → stored via escalation override endpoint with `guardrail_override_count` increment

**DB change:** `ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS guardrail_override_count INT NOT NULL DEFAULT 0`

**Backend:** Increment `guardrail_override_count` in `updateConversationState` when override note submitted

**Frontend:** Guardrail modal component (inline in InboxV2.tsx)

---

### Feature 5: Podcast / Call Auto-Snooze Triggers
**Roadmap:** Layer 2 — "If agent sends podcast link: Auto-create 48–72 hour follow-up reminder. If call link sent: Auto-create 3–4 day light nudge reminder."

**Logic (post-send):**
- After successful send, analyze sent message text
- If contains podcast link → auto-call snooze endpoint with `snoozedUntil = now + 60hrs`
- If contains call link → auto-call snooze endpoint with `snoozedUntil = now + 84hrs` (3.5 days)
- Show flash: "📅 Follow-up reminder set for [date]"
- Also update `cadenceStatus` via escalation override: `podcast_sent` or `call_offered`

**Podcast link patterns:** `ptbizinsider.com`, `spotify.com`, `podcasts.apple.com`, `anchor.fm`, `buzzsprout.com`

**Frontend only** — uses existing snooze + escalation override endpoints.

---

### Feature 6: Call Outcome Tagging
**Roadmap:** Layer 2/3 — "After discovery call, agent must tag outcome: Not a fit / Too early / Budget / Joined / Ghosted"

**DB change:** `ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS call_outcome TEXT`

**Backend:**
- `updateCallOutcome(conversationId, outcome: string)` in inbox-store.ts
- `POST /api/v2/inbox/conversations/:id/call-outcome` in routes.ts

**Frontend:**
- Call outcome dropdown in modal header (visible when status = closed OR escalation level ≥ 3)
- Options: Not a fit / Too early / Budget / Joined / Ghosted

---

### Feature 7: Stage-to-Call Conversion Dashboard (Layer 3)
**Roadmap:** Layer 3 — "Conversion rate by stage: Level 1→Call, Level 2→Call, Level 3→Call, Level 4→Call"

**Backend query:** Count conversations by escalation level that have `cadence_status = 'call_offered'` or `call_outcome IS NOT NULL`

**New endpoint:** `GET /api/v2/inbox/analytics/stage-conversion`

**Frontend:** New analytics panel in the right column of InboxV2 (below Inbox Health)

---

### Feature 8: Objection Frequency Dashboard (Layer 3)
**Roadmap:** Layer 3 — "Which objections appear most: Money / Time / Spouse / Risk / Marketing doubt / Scaling friction"

**Backend query:** Unnest `objection_tags` array, count by tag

**New endpoint:** `GET /api/v2/inbox/analytics/objection-frequency`

**Frontend:** Bar chart / frequency list in analytics panel

---

## IMPLEMENTATION ORDER

### Step 1: DB Migration
File: `sms-insights/scripts/migrate-phase3-tables.ts`

```sql
ALTER TABLE conversation_state 
  ADD COLUMN IF NOT EXISTS objection_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS guardrail_override_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT;
```

### Step 2: Backend — inbox-store.ts
Add:
- `updateObjectionTags(conversationId, tags)`
- `updateCallOutcome(conversationId, outcome)`
- `getStageConversionAnalytics()`
- `getObjectionFrequencyAnalytics()`

### Step 3: Backend — routes.ts
Add handlers + routes:
- `POST /api/v2/inbox/conversations/:id/objection-tags`
- `POST /api/v2/inbox/conversations/:id/call-outcome`
- `GET /api/v2/inbox/analytics/stage-conversion`
- `GET /api/v2/inbox/analytics/objection-frequency`

### Step 4: Frontend — v2-types.ts
Add to `InboxConversationV2`:
- `objectionTags: string[]`
- `callOutcome: string | null`
- `guardrailOverrideCount: number`

### Step 5: Frontend — v2Queries.ts
Add hooks:
- `useV2UpdateObjectionTags()`
- `useV2UpdateCallOutcome()`
- `useV2StageConversionAnalytics()`
- `useV2ObjectionFrequencyAnalytics()`

### Step 6: Frontend — InboxV2.tsx
Add:
- Objection tag panel (sidebar)
- Stage gating logic (call link detection + send block)
- Double pitch protection banner
- Guardrail checklist modal
- Auto-snooze triggers (post-send)
- Call outcome dropdown (modal header)
- Analytics panels (stage conversion + objection frequency)

### Step 7: Frontend — v2.css
Add CSS for:
- `.V2Inbox__objectionTags` — tag chip grid
- `.V2Inbox__objectionChip` — individual tag chip (toggle)
- `.V2Inbox__objectionChip--active` — selected state
- `.V2Inbox__podcastSuggestion` — podcast episode suggestion box
- `.V2Inbox__guardrailModal` — guardrail checklist overlay
- `.V2Inbox__guardrailChecklist` — checklist items
- `.V2Inbox__doublePitchWarning` — double pitch protection banner
- `.V2Inbox__callOutcomeRow` — call outcome dropdown row
- `.V2Inbox__analyticsChart` — bar chart for objection frequency

---

## DB CONNECTION
```
postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway
```

## BACKEND START
```bash
cd sms-insights && node --import tsx app.ts
# Port 3001, ALLOW_DUMMY_AUTH_TOKEN=true
```

## FRONTEND START
```bash
cd frontend && npm run dev
# Port 5173
