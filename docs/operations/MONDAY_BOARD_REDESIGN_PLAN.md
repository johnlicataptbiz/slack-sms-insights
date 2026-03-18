  Monday.com Board Redesign Plan (Database-Aligned, Workflow-First)

## 1) Audit Summary: What data exists and how it flows

### Core monday integration tables (from `prisma/schema.prisma`)
- `monday_board_registry`: board metadata/classification (`board_class`, `metric_grain`, ownership flags)
- `monday_sync_state`: per-board cursor and sync health status
- `monday_column_mappings`: saved inferred/manual column mapping JSON per board
- `monday_call_snapshots`: latest normalized item snapshot per monday item
- `monday_call_column_latest`: latest raw column values per item/column
- `monday_call_column_history`: historical item-column versions over time
- `monday_metric_facts`: normalized metric facts extracted from board items
- `monday_booked_call_pushes`: idempotency + audit trail of Slack booked-call writebacks
- `monday_weekly_reports`: weekly report payloads synced to Monday

### Services writing/reading Monday
- `services/monday-sync.ts`: board polling + normalization + metrics fact upserts
- `services/monday-store.ts`: persistence layer for monday sync state/snapshots/mappings/pushes
- `services/monday-personal-writeback.ts`: writeback for booked calls to personal board
- `services/monday-sms-reports.ts`: weekly/summary reporting board sync patterns
- `services/monday-sms-sequences.ts`: sequence-level board sync patterns

### Practical implication
The database model is robust and normalized, but boards became too close to backend payload structure.  
Redesign should keep DB linkage while exposing only decision-grade fields.

---

## 2) Target Purpose Per Board (Operational jobs-to-be-done)

## Board A: Personal Booked Calls (Setter Operating Board)
**Primary user:** setter / appointment coordinator  
**Decision loop:** “What did I book, what source/channel worked, what needs attention next?”

### Keep visible
- Contact Name
- Phone
- Call Date (booked date)
- Date Held (actual appointment date when available)
- Setter
- Advisor (owner)
- Swing/Stage
- Channel
- Source
- Slack Link
- Notes summary (human-readable)

### Hide/avoid
- Raw IDs (slack ts, board ids, internal item ids)
- Raw fallback payload fragments
- Low-signal technical debug fields

### Recommended groups
- `Today`
- `Tomorrow`
- `This Week`
- `Past / Completed`

### Views
- Main Table (default)
- Calendar (by Date Held)
- “Needs Follow-up” filtered view (missing Date Held or missing Advisor)

---

## Board B: SMS Reports (Leadership Summary Board)
**Primary user:** leadership / ops  
**Decision loop:** “Are we pacing to targets? Which trends need intervention?”

### Keep visible
- Reporting Period (week_start)
- Booked calls total
- By setter (Jack/Brandon/Self Booked)
- QoQ/WoW trend indicator
- Key notes / summary
- Sync status timestamp

### Hide/avoid
- Raw JSON blobs (`summary_json`) in visible columns
- Technical extraction artifacts

### Recommended groups
- `Current Quarter`
- `Previous Quarter`
- `Historical`

### Views
- Executive Snapshot (condensed)
- Trend Table (weekly sequence)
- Exceptions (weeks with drop/anomaly flags)

---

## Board C: SMS Sequences (Optimization Board)
**Primary user:** growth / campaign operator  
**Decision loop:** “Which sequences are driving replies/bookings and where to optimize?”

### Keep visible
- Sequence Name
- Time window
- Sends
- Replies
- Reply Rate
- Booked Calls Attributed
- Booking Rate
- Owner
- Last Updated

### Hide/avoid
- Raw event rows
- Duplicative backend timestamps not needed by operators

### Recommended groups
- `Top Performers`
- `Needs Optimization`
- `Testing / New`

### Views
- KPI ranking (sorted by booking rate)
- Volume view (sorted by sends)
- Underperformers (threshold filter)

---

## 3) Column/Label Governance Rules (critical)

1. **Status/dropdown labels must be constrained to valid Monday labels**  
   Never write raw backend text directly into status columns.
2. **Display labels should be business language, not backend naming.**
3. **One owner per board for column governance** (prevent drift).
4. **Mapping changes require doc update + one test sync run.**

---

## 4) Implementation Changes Applied in Code

File: `sms-insights/services/monday-personal-writeback.ts`

### Added mapping helpers
- `mapStageToSwing(): "First Swing"`
- `mapLineToChannel(line)`:
  - maps fuzzy inputs to valid Channel labels:
    - Circle DM
    - Aloware SMS
    - Email Marketing
    - Instagram DM
    - Game Plan Call
    - SELF BOOK
- `mapSourceToMondaySource(firstConversion)`:
  - maps fuzzy first-conversion strings to valid Source labels:
    - Circle Group
    - Book Buyer
    - Start-Up Checklist
    - Raise Your Rates
    - Stand Alone Space Setup Guide
    - Marketing Email
    - Direct Outreach (default)
    - Social Media
    - Hiring Guide
    - Webinar
    - Workshop Playbook
    - Signature Self Book

### Updated column writing in `toColumnValues()`
- Stage: `'Booked'` ➜ `mapStageToSwing()` (`First Swing`)
- Channel/Line: raw `source.line` ➜ `mapLineToChannel(source.line)`
- Source: raw Slack/self text ➜ `mapSourceToMondaySource(source.firstConversion)`

Result: prevents silent Monday rejection for invalid status labels and aligns board with operational taxonomy.

---

## 5) Board Rebuild Procedure (recommended execution order)

1. Freeze current board edits (avoid mid-migration drift).
2. Export existing board data for backup.
3. Create 3 new boards with the structures above.
4. Configure required status/dropdown options first.
5. Run sync/writeback into new boards (small time window).
6. Validate 20 sample records per board:
   - labels populated
   - links valid
   - dates correct
   - no raw backend-only fields shown
7. Switch team usage to new boards.
8. Archive old boards as “legacy_raw_export”.

---

## 6) Acceptance Criteria

- Each board supports a clear operator decision loop.
- No invalid status writes in monday logs for mapped columns.
- Users can identify priorities without reading raw payload text.
- Database linkage/sync continuity is preserved.
- Leadership can review trend views without technical mediation.
