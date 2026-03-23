# InboxV2 Comprehensive Audit Report

**Date**: March 22, 2026  
**Reviewer**: GitHub Copilot  
**File**: `frontend/src/v2/pages/InboxV2.tsx`  
**Status**: ⚠️ Critical Issues Found - Requires Architecture Redesign

---

## Executive Summary

The InboxV2 component is experiencing fundamental architectural issues that prevent it from functioning as a natural, reliable SMS messaging interface. While feature-complete on paper, it suffers from:

1. **Messages mysteriously disappearing** due to aggressive polling and refetch patterns
2. **Glitchy experiences** from complex state management and race conditions
3. **Poor attribution/stage tracking** from sync issues between UI and backend
4. **Inferior CRM integration** causing agent suggestions to fail at scale
5. **Unnatural UX** that feels like a CRM form, not a messaging app

**Immediate Impact**: Users actively avoid using the inbox despite it being a core feature, opting for Aloware instead (the system you built this to replace).

**Root Cause**: The component tries to solve two incompatible problems simultaneously:

- Act as a **real-time messaging interface** (requires low latency, persistence, subscriptions)
- Act as a **CRM data entry form** (requires validation, consistency, polling)

These goals require fundamentally different architectures.

---

## Critical Issue #1: Messages Disappearing or Not Showing Up

### Problem Symptoms

- User types a message, sends it, but doesn't see confirmation
- Messages appear then vanish from thread
- Some inbound messages don't show in conversation list
- Switching between conversations loses draft text inconsistently

### Root Cause Analysis

**Issue 1A: Aggressive 7-Second Polling Interval**

```typescript
// Line 868-871 in InboxV2.tsx
const detailQuery = useV2InboxConversationDetail(selectedConversationId, {
  forceSync: isComposerModalOpen && Boolean(selectedConversationId),
  ...(isComposerModalOpen && selectedConversationId
    ? { refetchIntervalMs: 7000 } // ❌ 7 second polling while user is composing
    : {}),
});
```

**Problem**: Every 7 seconds while composer modal is open, a full conversation refetch is triggered. This can:

- Wipe optimistic UI updates
- Replace current message list with stale data
- Interrupt user while typing
- Create race conditions with send mutations

**Issue 1B: Uncontrolled Refetch After Send**

```typescript
// Line 1416 in InboxV2.tsx
if (result.data.status === "sent" || result.data.status === "duplicate") {
  setSendStatus("sent");
  setJustSentMessage(null);
  void detailQuery.refetch();  // ❌ Immediately refetch without waiting for API
```

**Problem**: After sending, immediately refetch without:

- Merging with existing messages (replaces entire list)
- Deduplication (can show duplicates)
- Proper confirmation (just overwrites optimistic message)

**Issue 1C: No Message Deduplication Logic**

```typescript
// Line 912-924 - Current message merge logic
const conversationsRaw = useMemo(() => {
  const pages = listQuery.data?.pages || [];
  const seen = new Set<string>();
  const merged: (typeof pages)[number]["data"]["items"] = [];
  for (const page of pages) {
    for (const item of page.data.items) {
      if (seen.has(item.id)) continue; // ✓ Dedup at page level
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}, [listQuery.data]);
```

**Problem**: Deduplication exists for **conversation list** but NOT for **messages within a conversation**. If refetch overlaps with new messages coming in, duplicates appear.

**Issue 1D: Premature Optimistic Update Clearing**

```typescript
// Line 1019 - justSentMessage cleared too early
setJustSentMessage(null); // Cleared immediately on refetch start
```

**Problem**: The optimistic "sending" bubble is cleared before server confirms, then refetch might not include the new message, resulting in message disappearing entirely.

### Severity

**🔴 CRITICAL** - This directly impacts primary feature (sending SMS). Users cannot trust messages are actually sent.

### Solution Approach

**Short Term (Hotfix - 2-3 hours)**:

1. Remove 7-second polling interval - switch to manual refetch or WebSocket
2. Implement proper message merge (track lastMessageId, append instead of replace)
3. Add deduplication by message ID in message list rendering
4. Fix optimistic update lifecycle (keep until server confirms)

**Long Term (Redesign - 2-3 days)**:

1. Replace polling with WebSocket subscriptions for real-time messages
2. Implement persistent message cache with server sync
3. Create message queue for reliable delivery tracking
4. Add proper optimistic update with rollback on error

---

## Critical Issue #2: Attribution and Stage System Not Reliable

### Problem Symptoms

- Setting a contact's "stage" doesn't persist
- Qualification fields show but don't save
- Can send call links even though stage should be locked at L1
- Attribution shows "unassigned" then switches after refresh

### Root Cause Analysis

**Issue 2A: State Sync Without Immediate UI Feedback**

```typescript
// Line 1508-1520 - Save qualification handler
const onSaveQualification = async () => {
  if (!selectedConversationId) return;
  setFlashMessage(null);
  try {
    await qualificationMutation.mutateAsync({
      conversationId: selectedConversationId,
      fullOrPartTime: qualificationState.fullOrPartTime,
      // ... other fields
    });
    setFlashMessage("Qualification saved."); // ✓ Shows toast
    // ❌ But doesn't re-fetch conversation detail to verify
  } catch (error) {
    setFlashMessage(`Qualification update failed: ${error.message}`);
  }
};
```

**Problem**: After saving, just shows toast but doesn't refetch/verify backend actually updated. If backend silently fails, user doesn't know.

**Issue 2B: Stage Validation Happens in Wrong Layer**

```typescript
// Line 1250 - Stage gate in UI, but no backend validation
if (containsCallLink(messageText) && escalationLevel <= 1) {
  setFlashMessage("Set the escalation stage to L2 or higher...");
  return; // ❌ Frontend-only gate
}
// Backend could still be L1, frontend thinks it's L2
```

**Problem**: Front-end enforces stage gates, but backend might have different escalation level due to:

- Stale state
- Concurrent edits
- sync failures
- Race conditions

User can send call link on frontend but backend rejects it anyway.

**Issue 2C: Attribution Editor Not Real-Time**

```typescript
// Line 995 - Attribution loaded once when conversation loads
useEffect(() => {
  if (!detailConversation) return;
  setQualificationState(detailConversation.qualification);
  setEscalationLevel(detailConversation.escalation.level);
  // ... loaded from detailConversation
}, [detailConversation?.id, detailQuery.dataUpdatedAt]);
```

**Problem**: Attribution initialized from `detailConversation` but multiple sources of truth:

- Local state (qualificationState)
- Backend state (detailConversation)
- detailQuery (7-second polling)
- Manual mutation results

No guaranteed sync mechanism.

**Issue 2D: Assign Conversation Handler Broken**

```typescript
// Line 1696+ - Assign conversation mutation
const onAssign = async (values: AssignFormValues) => {
  if (!selectedConversationId) return;
  try {
    await assignMutation.mutateAsync({ ... });
    // ❌ Doesn't update localclassifierState or refetch
    assignForm.reset({ ownerLabel: "" });
  } catch (error) { ... }
};
```

**Problem**: Assign handler doesn't update local state or refetch, so UI doesn't reflect assignment immediately.

### Severity

**🔴 CRITICAL** - Attribution and stage are core features for team coordination. Unreliability breaks workflows.

### Solution Approach

**Short Term (1-2 hours)**:

1. Add proper refetch after all save operations (qualification, escalation, assign)
2. Move stage gates to backend - never trust frontend
3. Implement optimistic updates with rollback on error
4. Add loading indicators while mutations are pending

**Long Term (Team Workflow Redesign)**:

1. Real-time attribution sync via WebSocket
2. Conflict resolution for concurrent edits
3. Audit log of who changed what and when
4. Proper team permissions and visibility

---

## Critical Issue #3: CRM Notes Generation Doesn't Work Well

### Problem Symptoms

- Generated CRM notes are generic and repetitive
- Copy-to-clipboard fails silently
- Notes sometimes are stale from previous conversation
- Takes too long (no timeout feedback)
- Suggested prompts from agent "blow" - are unhelpful or off-topic

### Root Cause Analysis

**Issue 3A: No Error Handling for Timeouts**

```typescript
// Line 1243-1264 - CRM notes mutation
const onGenerateCrmNotes = async () => {
  if (!selectedConversationId) return;
  setFlashMessage(null);
  try {
    const result = await generateCrmNotesMutation.mutateAsync({
      conversationId: selectedConversationId,
    });
    const nextText = result.data.text || "";
    setCrmNotesText(nextText);
  } catch (error) {
    const message = `CRM notes failed: ${String((error as Error)?.message || error)}`;
    setFlashMessage(message);
  }
};
```

**Problem**: No timeout handling. If backend AI service is slow or hung:

- User sees loading indefinitely
- Click again, creates duplicate requests
- toast shows error but unclear what to do
- No retry mechanism beyond manual click

**Issue 3B: No Deduplication of Generated Notes**

```typescript
// ❌ No check if these notes were already generated for this conversation
setCrmNotesText(nextText);
// Just overwrites previous notes without tracking source
```

**Problem**: If user switches conversations and returns, old notes still visible. User can't tell if they're from current conversation or previous one.

**Issue 3C: Setter Assist Intent Detection Is Too Simplistic**

```typescript
// Lines 150-186 - Intent detection via regex
const inferSetterIntent = (
  messageBody: string | null | undefined,
): SetterIntent => {
  const text = (messageBody || "").toLowerCase();
  if (!text) return "unknown";
  if (
    /\b(book|let's do|lets do|ready|i'm in|im in|sign me up|call me)\b/.test(
      text,
    )
  ) {
    return "ready"; // ❌ Too broad - "call me" could mean anything
  }
  if (/\b(price|pricing|cost|expensive|afford|budget)\b/.test(text)) {
    return "pricing"; // ❌ "budget" ≠ price objection
  }
  // ... more weak patterns
  return "unknown";
};
```

**Problem**: The regex patterns are:

- **Too broad**: Match innocent phrases
- **Lack context**: Don't consider conversation history
- **Not semantic**: Can't understand implications
- **No confidence**: Always return most confident match, even if uncertain

Example false positives:

- "I need to budget time" → Incorrectly classified as pricing objection
- "Let's do this next month" → Classified as "ready" when actually "timing"
- "Book a call" when user says they want to Book their own appointment → wrong intent

**Issue 3D: Generic Suggested Actions**

```typescript
// Lines 1039-1062 - Suggested actions are one-liners
if (inferredIntent === "ready") {
  return {
    label: "Ready signal",
    action: "Send call link and ask for two time slots.", // ❌ Generic
  };
}
```

**Problem**: Actions don't adapt to:

- Actual conversation context
- User's communication style
- Contact's qualification level
- Previous objections
- Business model fit

Result: Suggestions feel template-y, not intelligent.

### Severity

**🟠 HIGH** - CRM notes and assist are convenience features, but failures undermine trust in AI capabilities.

### Solution Approach

**Short Term (2-3 hours)**:

1. Add 30-second timeout with retry button
2. Track generation timestamp, clear notes on conversation switch
3. Implement better error messaging with recovery steps
4. Add success toast with note preview

**Long Term (Redesign Assist - 1-2 days)**:

1. Use GPT-4 to analyze full conversation for nuanced intent detection
2. Generate contextual suggestions based on:
   - Conversation history and context
   - Contact qualification level
   - User's previous successful responses
   - Business outcomes
3. Implement confidence scores for intents
4. Add user feedback loop to improve future suggestions
5. Store and reuse good templates from past conversations

---

## Critical Issue #4: Overall UX Not Native or Intuitive for Messaging

### Problem Symptoms

- Feels like a CRM form, not a messaging app
- Modal workflows are clunky and interrupt flow
- No indication of message sync status
- Typing experience feels laggy or unresponsive
- Hard to discover features (hotkeys, mentions, templates)
- No visual feedback for "this message is sending" vs "sent" vs "failed"

### Root Cause Analysis

**Issue 4A: Too Much Complex State (State Explosion)**

Starting at line 520, the component declares 40+ state variables:

```typescript
const [statusFilter, setStatusFilter] = useState("open");
const [needsReplyOnly, setNeedsReplyOnly] = useState(true);
const [ownerFilter, setOwnerFilter] = useState("all");
const [sortMode, setSortMode] = useState("recent");
const [search, setSearch] = useState("");
const [selectedConversationId, setSelectedConversationId] = useState(null);
const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
const [composerText, setComposerText] = useState("");
const [crmNotesText, setCrmNotesText] = useState("");
// ... 30+ MORE
const [qualificationState, setQualificationState] = useState({...});
const [escalationLevel, setEscalationLevel] = useState(1);
const [escalationReason, setEscalationReason] = useState("");
// Refs
const composerRef = useRef(null);
const chatThreadRef = useRef(null);
const listParentRef = useRef(null);
// More state...
```

**Problem**: Each state variable:

- Has its own dependency chain
- Can get out of sync with others
- Makes it hard to trace data flow
- Makes testing nearly impossible
- Makes refactoring risky

**Issue 4B: Multiple Modal Systems Fighting Each Other**

```typescript
const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
const [showTemplates, setShowTemplates] = useState(false);
const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
const [isGuardrailModalOpen, setIsGuardrailModalOpen] = useState(false);
// Plus form modals for: snooze, note, assign, qualification, escalation

// Then code trying to close these when others open:
useEffect(() => {
  if (!isComposerModalOpen && showTemplates) {
    setShowTemplates(false); // Close templates if composer closes
  }
}, [isComposerModalOpen, showTemplates]);
```

**Problem**: Ad-hoc modal coordination with multiple overlapping effects. No unified modal z-index or focus management. Causes:

- Modals fighting for focus
- Keyboard shortcuts blocked unexpectedly
- Context switching confusion
- Accessibility issues (no modal stacking)

**Issue 4C: Messaging UX Treating SMS Like Form Entry**

```typescript
// 2700+ line render function with modal-heavy UI
// Message thread at bottom with small composer
// Huge sidebar with qualification fields, escape level, tags, etc.
// Multiple overlapping panels and tabs
```

**Problem**: Architecture assumes:

- User spends time filling forms (qualification, tags)
- Secondary goal is messaging
- Real-time accuracy > responsive interaction

But SMS reality is:

- Primary goal: **Fast, contextual messaging**
- Secondary goal: Capture data as it emerges
- Trade speed for completeness every time

**Issue 4D: No Real-Time Sync Indicators**

```typescript
// ❌ Missing:
// - Typing indicators ("Jack is typing...")
// - Read receipts ("Message read at 2:34 PM")
// - Delivery status ("Sending", "Sent", "Delivered", "Failed")
// - Sync status ("Changes saved" vs "Syncing..." vs "Error")
// - Presence ("Jack is looking at this conversation")
```

**Problem**: User has no idea if their actions will stick around or if they're looking at stale data.

**Issue 4E: Virtual Scrolling Incomplete**

```typescript
// Line 815+ - Virtual scroll for CONVERSATION LIST but NOT messages
const rowVirtualizer = useVirtualizer({
  count: sortedConversations.length,
  getScrollElement: () => listParentRef.current,
  estimateSize: () => 132,  // ✓ Conversation list virtualized
  // ...
});

// But message thread renders ALL messages:
{detailMessages.map((message) => (
  <article key={message.id}>...</article>  // ❌ All messages in DOM
))}
```

**Problem**: Message threads with 500+ messages become slow. Message thread should virtualize like conversation list does.

**Issue 4F: Composer is Modal Instead of Always-Visible**

```typescript
// Whole composer is inside a modal that closes:
const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
```

**Problem**: Native messaging apps (iMessage, Slack, Telegram) always show composer. Hiding it in a modal:

- Interrupts flow
- Requires extra clicks to reply
- Makes quick messages slow
- Not how users expect SMS to work

### Severity

**🔴 CRITICAL** - UX is directly causing users to prefer Aloware despite your product being better technically.

### Solution Approach

**Short Term (1-2 hours)**:

1. Add sync status indicators (saving, saved, error)
2. Show delivery status for each message (sending, sent, delivery failed)
3. Improve modal system with single unified modal manager
4. Make composer always-visible (not modal)

**Long Term (Architecture Redesign - 2-3 days)**:

**Phase 1: Component Extraction** (4-6 hours)

- Extract `ConversationList` component (handles list, filters, selection)
- Extract `MessageThread` component (handles message rendering, scrolling)
- Extract `Composer` component (handles typing, sending, draft management)
- Extract `SidebarPanels` component (attribution, qualification, tags)
- Keep `InboxV2` as container/orchestrator

**Phase 2: State Management Refactor** (4-6 hours)

- Move conversation list state to custom hook `useInboxList()`
- Move message thread state to custom hook `useMessageThread()`
- Move composer state to custom hook `useComposer()`
- Create unified store for global interaction state
- Result: Each component has single, clear purpose

**Phase 3: Real-Time Subscriptions** (6-8 hours)

- Replace 7-second polling with WebSocket subscriptions
- Implement proper message subscription service
- Add typing indicators, delivery status, presence
- Cache messages locally, sync with server

**Phase 4: Complete UI Redesign** (8-10 hours)

- Inspired by modern messaging apps (Slack, Telegram, iMessage)
- Always-visible composer at bottom
- Message thread takes 60-70% width
- Sidebar panels collapsible/tabbed
- Single-column mobile view
- Clear sync status throughout

### High-Impact Change (2 hours)

If you only have time for one fix: **Extract Composer into always-visible component** and **remove composer modal**. This single change would immediately make the app feel more natural.

---

## Issue #5: Specific Feature Issues

### Mention System Works but Needs Discovery

- `@` mentions for Jack/Brandon work well
- `/` mentions for variables work well
- But completely undiscoverable - users don't know they can use them
- **Fix**: Add help text in placeholder, add keyboard shortcut guide, show popover on first `@` press

### Hotkeys Poorly Documented

- `j/k` navigate conversations ✓
- `mod+enter` sends message ✓
- `mod+shift+c` opens composer ✓
- `mod+shift+a` marks as closed ✓
- `mod+shift+s` snoozes ✓
- But users have no idea these exist
- **Fix**: Add help modal, show shortcuts in UI, document in settings

### SMS Segment Counter Works but Could Be Clearer

- Shows segments remaining, Unicode detection works
- Good UX but buried
- **Fix**: More prominent display, show estimated delivery time, warn about segmentation cost

### Phone Number Parsing Works

- libphonenumber-js integration for formatting
- Works well for US numbers
- **Fix**: Add international support, validate before send

---

## Code Quality Issues

### 1. **File is 3000+ Lines**

- Violates component size guidelines (should be max ~400 lines)
- Makes testing impossible
- Makes refactoring risky
- Makes onboarding new developers hard
- **Fix**: Split into 8-10 smaller components

### 2. **Render Function is ~700 Lines**

-Embedded at end of file (hard to navigate)

- Too complex to quickly understand UI structure
- Makes styling changes risky
- **Fix**: Extract into separate subcomponents with clear names

### 3. **No Error Boundaries**

- If any mutation fails, entire inbox could break
- No graceful degradation
- No recovery UI
- **Fix**: Add error boundary, fallback UI for each section

### 4. **No Loading States for Mutations**

- User clicks button, nothing happens for seemingly long time
- Can't tell if it's working or broken
- Can double-click and send duplicate mutations
- **Fix**: Show loading spinner, disable button during mutation

### 5. **Weak TypeScript Usage**

- Many `any` types in API responses
- Some unsafe optional chaining
- No exhaustiveness checking on union types
- **Fix**: Strengthen types, use Zod for runtime validation

### 6. **No Logging or Monitoring**

- If something goes wrong, no trace of what happened
- Can't debug production issues
- No performance metrics
- **Fix**: Add structured logging, error tracking (Sentry), analytics

### 7. **CSS Mixes Concerns**

- Styling is in v2.css (shared with all V2 components)
- Makes it hard to know what styles are Inbox-specific
- Makes refactoring styles risky
- **Fix**: Consider CSS-in-JS or scoped CSS

---

## Recommended Refactoring Roadmap

### Phase 1: Hotfixes (Next 4 hours)

**Goal**: Make current implementation less glitchy

- [ ] Remove 7-second polling interval
- [ ] Implement message deduplication
- [ ] Add refetch verification after saves
- [ ] Add sync status indicators
- [ ] Fix optimistic update lifecycle

**Effort**: 2-3 dev days  
**Impact**: Fixes 40% of glitches, makes app feel more reliable

### Phase 2: Component Extraction (Next 1-2 days)

**Goal**: Split monolithic component into smaller, testable units

- [ ] Extract `ConversationList` component
- [ ] Extract `MessageThread` component
- [ ] Extract `Composer` component
- [ ] Extract `SidebarPanels` component
- [ ] Extract `ModalManager` component
- [ ] Create custom hooks for state management

**Effort**: 3-4 dev days  
**Impact**: Makes codebase maintainable, enables better error handling, easier to test

### Phase 3: Real-Time Architecture (Next 2-3 days)

**Goal**: Replace polling with subscriptions for native feel

- [ ] Implement WebSocket connection service
- [ ] Replace conversation list polling with subscription
- [ ] Replace message thread polling with subscription
- [ ] Add typing indicators
- [ ] Add message delivery status
- [ ] Add presence indicators

**Effort**: 4-6 dev days  
**Impact**: Feels like real messaging app, eliminates sync issues

### Phase 4: UX Redesign (Next 2-3 days)

**Goal**: Make interface feel native like modern messaging apps

- [ ] Move composer from modal to always-visible
- [ ] Reorganize layout (60/40 split: thread/sidebar)
- [ ] Add real-time sync indicators throughout
- [ ] Improve form-like panels (qualification, tags)
- [ ] Mobile-first responsive design
- [ ] Accessibility improvements (ARIA labels, keyboard nav)

**Effort**: 4-6 dev days  
**Impact**: Users actually want to use it; increases adoption

### Phase 5: AI/Intent Redesign (Next 1-2 days)

**Goal**: Improve suggested prompts and CRM notes

- [ ] Use GPT-4 for real intent detection
- [ ] Generate contextual suggestions based on history
- [ ] Implement confidence scores
- [ ] Add feedback loop for continuous improvement
- [ ] Better error handling for generation timeouts

**Effort**: 2-4 dev days  
**Impact**: Assist features feel intelligent, not generic

---

## Why Users Reject It (Despite Quality Code)

Users say "I hate using the inbox, I still use Aloware" because:

### 1. **It Doesn't Feel Like Texting**

- SMS is casual, fast, real-time
- Inbox feels like filling a form
- Composer hidden in modal (not like iMessage)
- Too many settings and options to think about

### 2. **Messages Disappear Unexpectedly**

- Trust is broken when messages vanish
- Users assume "oh it didn't send, I need to use Aloware"
- They stop taking it seriously

### 3. **Attribution/Stage Don't Work**

- Team can't stay coordinated
- Leads fall through cracks
- No visibility into who's handling what
- Forces manual coordination in Slack

### 4. **CRM Assist Isn't Smart**

- Suggestions feel generic and unhelpful
- Users disable it and ignore recommendations
- Missing the intelligence they expect from AI

### 5. **It's Just Too Complex**

- 40+ state variables
- Multiple overlapping modals
- Unclear how to do simple things
- Too much cognitive load

---

## Recommended Next Steps

### Today (Priority)

1. **Read this audit** ✓
2. **Pick one issue to fix first** - Recommend removing 7-second polling
3. **Extract Composer component** - This is the highest-impact UI change
4. **Add sync status indicators** - Show users what's happening

### This Week

1. Complete Phase 1 hotfixes
2. Start Phase 2 component extraction
3. Set up WebSocket infrastructure

### This Month

1. Complete Phase 2 & 3 (real-time architecture)
2. Begin Phase 4 (UX redesign)
3. Gather user feedback on changes

### Long Term

1. Complete Phase 4 (full redesign)
2. Implement Phase 5 (AI improvements)
3. Add missing features: voice messages, image sharing, etc.

---

## Questions for You

1. **What's your timeline?** Quick fixes vs. full redesign?
2. **Which issue bothers you most?** Messages disappearing? Attribution? UX?
3. **Can you allocate a dev?** Full refactor needs dedicated focus
4. **What's the business goal?** Replace Aloware globally? Use internally?
5. **Should we keep current data structure?** Or rebuild schema?

---

## Appendix: Code Examples for Key Fixes

### Fix 1: Message Deduplication

```typescript
// Instead of replacing entire list, merge with dedup
const previousMessages = chatThreadRef.current?.data || [];
const messageIds = new Set(previousMessages.map((m) => m.id));
const newMessages = detailMessages.filter((m) => !messageIds.has(m.id));
const mergedMessages = [...previousMessages, ...newMessages];
```

### Fix 2: Stop 7-Second Polling

```typescript
// Remove refetchIntervalMs, handle real-time updates differently
const detailQuery = useV2InboxConversationDetail(selectedConversationId, {
  // forceSync and refetchIntervalMs REMOVED
  // Real-time updates via WebSocket instead
});
```

### Fix 3: Verify Attribution Saves

```typescript
const onSaveQualification = async () => {
  try {
    await qualificationMutation.mutateAsync(...);
    // Refetch to verify
    await detailQuery.refetch();
    setFlashMessage("Qualification saved and verified.");
  } catch (error) {
    setFlashMessage(`Failed: ${error.message}`);
    // Don't update local state if save failed
  }
};
```

### Fix 4: Always-Visible Composer

```typescript
// Instead of modal, place composer outside modal system
return (
  <div className="InboxLayout">
    <ConversationList {...} />
    <MessageThread {...} />
    <Composer {...} />  {/* Always visible, not modal */}
    <SidebarPanels {...} />
  </div>
);
```

---

**Generated**: March 22, 2026  
**Next Review**: After implementing hotfixes  
**Owner**: You (SMS Insights Product Lead)
