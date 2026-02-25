# Plain Language Pass + Default Route Fix

## Status: IN PROGRESS

### Routing Fix
- [ ] `frontend/src/App.tsx` — DefaultRoute always → /v2/insights (ignore localStorage)

### Language Pass — copy.ts
- [ ] `callsBookedCreditSlack` label: "Setter Credit" → "Calls Booked"
- [ ] `smsBookingHintsDiagnostic` label: "Booking Hints" → "Booking Signals"
- [ ] `outboundConversations` label: "Outbound Messages" → "Conversations Started"
- [ ] `optOuts` label: "Unsubscribes" → "Opt-Outs"
- [ ] `optOutRate` label: "Unsubscribe Rate" → "Opt-Out Rate"
- [ ] `sequenceMatchCoverage` label: "Sequence Coverage" → "Sequence-Attributed Bookings"
- [ ] Update all 6 definitions

### Language Pass — InsightsV2.tsx
- [ ] "Opt-outs" → "Opt-Outs"
- [ ] "Self Bookings" → "Self-Booked" (3 places)
- [ ] "Call Sources" → "Where Calls Came From"
- [ ] "SMS Linked" → "Booked via SMS"
- [ ] "Other" → "Other / Unknown"
- [ ] Source: raw string → "Slack booking records"
- [ ] Coverage: → "Matched N of M calls to a source"
- [ ] "List Health" → "Opt-Out Watch"
- [ ] "Opt-out rate" column → "Opt-Out Rate"
- [ ] "Synced:" → "Last synced:"
- [ ] "Window:" → "Period:"

### Language Pass — RunsV2.tsx
- [ ] "Total Runs" → "Daily Reports"
- [ ] "across all runs" → "across all reports"
- [ ] "Run Timeline" → "Report History"
- [ ] "Showing N runs" → "Showing N reports"
- [ ] buildRunViewModel titles: "Daily Auto-Run"→"Daily Auto-Report", "Manual Pull"→"Manual Report", "Test Pull"→"Test Report"
- [ ] modeLabels: "6:00 AM auto run"→"6:00 AM auto-report", "Manual trigger"→"Manual report", "Test trigger"→"Test report"
- [ ] "Run Details" → "Report Details"
- [ ] "Run Error" → "Report Error"
- [ ] "Booked (Report)" → "Booked (from report)"
- [ ] "Booked (Slack)" → "Booked (Slack-verified)"
- [ ] "Snapshot Summary" → "Summary"
- [ ] "Run Metadata" → "Report Info"
- [ ] "Timestamp" → "Generated at"
- [ ] "Duration" → "Processing time"
- [ ] "Top Sequence Volume" → "Top Sequences"
- [ ] "Setter Breakdown" → "Setter Performance"
- [ ] "Outbound Convos" → "Conversations"
- [ ] "No structured summary stored for this run." → "No summary available for this report."
- [ ] "No parsed sequence rows were found for this run." → "No sequence data found for this report."
- [ ] "No parsed setter rows were found for this run." → "No setter data found for this report."
- [ ] "Show stored raw report text" → "Show full report text"
- [ ] "Loading raw report text…" → "Loading report text…"
- [ ] "No stored report text" → "No report text available"
- [ ] "Back to run timeline" → "Back to report history"
- [ ] "Automated Daily Run" → "Automated Daily Report"
- [ ] "Manual / On-Demand Run" → "Manual / On-Demand Report"
- [ ] "Loading daily runs…" → "Loading reports…"
- [ ] "Failed to load runs:" → "Failed to load reports:"
- [ ] "Select a run to inspect details." → "Select a report to view details."
- [ ] Stale banner text update
- [ ] "Range (days)" → "Show last (days)"
- [ ] "Report day X" → "Report date: X"
- [ ] "Report day not detected" → "Date not detected"
- [ ] Saved view meta line update

### Language Pass — RepV2.tsx
- [ ] Subtitle "Deltas compare against" → "Changes vs."
- [ ] "Setter Jack" / "Setter Brandon" → "Jack" / "Brandon"
- [ ] "Booked Call Credit" → "Calls Booked"
- [ ] "Low reply efficiency on active volume" → "Low reply rate on high volume"
- [ ] "No prior-day data to calculate deltas yet." → "No prior-day data to compare yet."
- [ ] "No at-risk flags for this setter on this day." → "No issues flagged for today."
- [ ] "Team Performance" → "Team Totals"
- [ ] "How to Read This Card" → "How to Read This Page"
- [ ] "How today compared to yesterday." → "Changes from yesterday to today."
- [ ] "No prior-day baseline yet" → "No prior-day data yet"
- [ ] How to Read bullet points — simplify 3 lines
- [ ] "Loading setter scorecard…" → "Loading scorecard…"
- [ ] "Failed to load setter scorecard:" → "Failed to load scorecard:"

### Language Pass — SequencesV2.tsx
- [ ] "Ver." → "Version"
- [ ] "w/ SMS Reply" column → "SMS-Linked"
- [ ] "SMS Reply %" column → "SMS-Linked %"
- [ ] "SMS-Reply Booking %" KPI → "Booked via SMS Reply %"
- [ ] "bookings with prior SMS reply" → "of bookings had a prior SMS reply"
- [ ] "Slack-attributed (canonical)" → "Slack-verified bookings"
- [ ] "messages-sent basis" → "based on messages sent"
- [ ] "weekly scoreboard window" → "weekly window"
- [ ] "Sequence Health Watchlist" → "Sequence Health Alerts"
- [ ] Watchlist caption → simplified
- [ ] Performance table caption → simplified
- [ ] "Sequence-Initiated" → "From Sequences"
- [ ] "Manual-Initiated" → "From Direct Outreach"
- [ ] Attribution note → simplified
- [ ] "Compliance Overview" → "Opt-Out Health"
- [ ] Compliance caption → simplified
- [ ] "Top Opt-Out Sequences" → "Highest Opt-Out Sequences"
- [ ] Audit: "Booked (Slack)" → "Booked (Slack-verified)"
- [ ] Audit: "w/ SMS Reply" → "SMS-Linked"
- [ ] Audit: "SMS Booking Signals" → "Booking Signals"
- [ ] Audit: "(diagnostic, not canonical)" → "(for reference only)"
- [ ] Audit: "No Slack booked-call audit rows…" → "No booking records found…"
- [ ] Audit: "First conversion:" → "Lead source:"
- [ ] Audit: Humanize strictSmsReplyReason values

### Commit
- [ ] git add + commit + push
