# PT Biz SMS API Endpoints Reference

## Overview
Complete mapping of all API endpoints across v1 (legacy) and v2 (current) versions.

---

## 1. Health & Status Management

### Health Check
**GET** `/api/health`
- Purpose: Backend availability check
- Response: Health status indicator
- Status: ✅ Active

### Runtime Status
**GET** `/api/runtime-status`
- Purpose: System runtime diagnostics
- Status: ✅ Active

---

## 2. Authentication & Authorization

### OAuth Flow Start
**GET** `/api/oauth/start`
- Purpose: Initiate OAuth authentication
- Status: ✅ Active

### OAuth Callback
**GET** `/api/oauth/callback`
- Purpose: Handle OAuth callback
- Status: ✅ Active

### Password Authentication
**POST** `/api/auth/password`
- Purpose: Password-based login
- Body: username, password
- Status: ✅ Active

### Auth Verification
**GET** `/api/auth/verify`
- Purpose: Verify authentication status
- Status: ✅ Active

### Logout
**POST** `/api/auth/logout`
- Purpose: Terminate session
- Status: ✅ Active

---

## 3. Metrics & Sales Data (V1)

### Metrics
**GET** `/api/metrics`
- Purpose: General performance metrics
- Status: ✅ Active

### Sales Metrics V1
**GET** `/api/sales-metrics`
- Purpose: Sales performance data (legacy)
- Status: ✅ Active (legacy)

### Channels V1
**GET** `/api/channels`
- Purpose: List SMS channels (v1)
- Status: ✅ Active

---

## 4. Metrics & Sales Data (V2)

### Sales Metrics V2
**GET** `/api/v2/sales-metrics`
- Purpose: Enhanced sales metrics with better performance
- Status: ✅ Active

### Batch Sales Metrics
**GET** `/api/v2/sales-metrics/batch`
- Purpose: Bulk fetch sales metrics
- Status: ✅ Active

### Weekly Summary
**GET** `/api/v2/weekly-summary`
- Purpose: Weekly performance summary
- Status: ✅ Active

### Insights Summary
**GET** `/api/v2/insights/summary`
- Purpose: Dashboard insights aggregation
- Status: ✅ Active

### Channels V2
**GET** `/api/v2/channels`
- Purpose: List SMS channels (v2)
- Status: ✅ Active

### Scoreboard
**GET** `/api/v2/scoreboard`
- Purpose: Real-time performance scoreboard
- Status: ✅ Active

---

## 5. Attribution Management

### Attribution Health
**GET** `/api/v2/attribution/health`
- Purpose: Check attribution system health
- Status: ✅ Active

### Attribution Review Queue
**GET** `/api/v2/attribution/review-queue`
- Purpose: Items requiring attribution review
- Status: ✅ Active

### Unresolved Attributions
**GET** `/api/v2/attribution/unresolved`
- Purpose: List unresolved attribution items
- Status: ✅ Active

### Attribution Methods
**GET** `/api/v2/attribution/methods`
- Purpose: Available attribution methods
- Status: ✅ Active

---

## 6. Runs Management

### Get Runs V1
**GET** `/api/runs`
- Purpose: Retrieve SMS campaign runs (v1)
- Status: ✅ Active

### Create Run V1
**POST** `/api/runs`
- Purpose: Create new SMS campaign run
- Status: ✅ Active

### Get Run by ID V1
**GET** `/api/runs/:id`
- Purpose: Specific run details (v1)
- Status: ✅ Active

### Get Runs V2
**GET** `/api/v2/runs`
- Purpose: Retrieve runs (v2 - enhanced)
- Status: ✅ Active

### Create Run V2
**POST** `/api/v2/runs`
- Purpose: Create new run (v2)
- Status: ✅ Active

### Get Run by ID V2
**GET** `/api/v2/runs/:id`
- Purpose: Specific run details (v2)
- Status: ✅ Active

---

## 7. Sequences Management

### Sequence KPIs
**GET** `/api/v2/sequences/kpis`
- Purpose: Key performance indicators for sequences
- Status: ✅ Active

### Sequence Deep Analysis
**GET** `/api/v2/sequences/deep`
- Purpose: In-depth sequence metrics and analytics
- Status: ✅ Active

### Sequence Funnel
**GET** `/api/v2/sequences/funnel`
- Purpose: Funnel conversion analytics
- Status: ✅ Active

### Sequence Qualification
**GET** `/api/v2/sequences/qualification`
- Purpose: Qualification metrics for sequences
- Status: ✅ Active

### Sequence Version History
**GET** `/api/v2/sequences/version-history`
- Purpose: Version history and changes
- Status: ✅ Active

### Sequence Version Decisions
**POST** `/api/v2/sequences/version-decisions`
- Purpose: Record version decision metadata
- Status: ✅ Active

---

## 8. Inbox & Conversations Management

### Get Conversations
**GET** `/api/v2/inbox/conversations`
- Purpose: List all conversations
- Status: ✅ Active

### Create Conversation
**POST** `/api/v2/inbox/conversations`
- Purpose: Start new conversation
- Status: ✅ Active

### Get Conversation by ID
**GET** `/api/v2/inbox/conversations/:id`
- Purpose: Specific conversation details
- Status: ✅ Active

### Get Conversation Messages
**GET** `/api/v2/inbox/conversations/:id/messages`
- Purpose: All messages in conversation
- Status: ✅ Active

### Add Notes
**POST** `/api/v2/inbox/conversations/:id/notes`
- Purpose: Add internal notes to conversation
- Status: ✅ Active

### Snooze Conversation
**POST** `/api/v2/inbox/conversations/:id/snooze`
- Purpose: Temporarily hide conversation
- Body: snooze_until timestamp
- Status: ✅ Active

### Assign Conversation
**POST** `/api/v2/inbox/conversations/:id/assign`
- Purpose: Assign to rep or team
- Body: assigned_to (user ID)
- Status: ✅ Active

### Add Objection Tags
**POST** `/api/v2/inbox/conversations/:id/objection-tags`
- Purpose: Tag conversation objections
- Body: tags array
- Status: ✅ Active

### Set Call Outcome
**POST** `/api/v2/inbox/conversations/:id/call-outcome`
- Purpose: Record call result
- Body: outcome (booked/unqualified/pending/etc)
- Status: ✅ Active

### Guardrail Override
**POST** `/api/v2/inbox/conversations/:id/guardrail-override`
- Purpose: Override system guardrails
- Body: override_reason
- Status: ✅ Active

### Get Send Configuration
**GET** `/api/v2/inbox/send-config`
- Purpose: Current message sending configuration
- Status: ✅ Active

### Set Default Send Config
**POST** `/api/v2/inbox/send-config/default`
- Purpose: Set default sending parameters
- Status: ✅ Active

### Get Message Templates
**GET** `/api/v2/inbox/templates`
- Purpose: List available message templates
- Status: ✅ Active

### Create Template
**POST** `/api/v2/inbox/templates`
- Purpose: Create new message template
- Body: name, content, variables
- Status: ✅ Active

### Delete Template
**DELETE** `/api/v2/inbox/templates/:id`
- Purpose: Remove template
- Status: ✅ Active

### Get Conversation V1
**GET** `/api/conversations/:id`
- Purpose: Conversation details (legacy v1)
- Status: ✅ Active

### Get Conversation Events V1
**GET** `/api/conversations/:id/events`
- Purpose: Event log for conversation (v1)
- Status: ✅ Active

---

## 9. Inbox Analytics

### Stage Conversion Analytics
**GET** `/api/v2/inbox/analytics/stage-conversion`
- Purpose: Conversion rates between stages
- Status: ✅ Active

### Objection Frequency Analytics
**GET** `/api/v2/inbox/analytics/objection-frequency`
- Purpose: Most common objection patterns
- Status: ✅ Active

### Setter Assist Performance
**GET** `/api/v2/inbox/analytics/setter-assist-performance`
- Purpose: AI setter assistant effectiveness
- Status: ✅ Active

---

## 10. Core Analytics

### Line Performance
**GET** `/api/v2/analytics/line-performance`
- Purpose: Phone line performance metrics
- Status: ✅ Active

### Qualification Funnel
**GET** `/api/v2/analytics/qualification-funnel`
- Purpose: Qualification conversion funnel
- Status: ✅ Active

### Draft AI Performance
**GET** `/api/v2/analytics/draft-ai-performance`
- Purpose: AI draft assistant metrics
- Status: ✅ Active

### Follow-up SLA Analytics
**GET** `/api/v2/analytics/followup-sla`
- Purpose: Follow-up timing compliance
- Status: ✅ Active

### Goals
**GET** `/api/v2/analytics/goals`
- Purpose: Team and individual goals tracking
- Status: ✅ Active

### Trend Alerts
**GET** `/api/v2/analytics/trend-alerts`
- Purpose: Anomaly and trend notifications
- Status: ✅ Active

### Time to Booking
**GET** `/api/v2/analytics/time-to-booking`
- Purpose: Average time from initial contact to booking
- Status: ✅ Active

### Response Time Analytics
**GET** `/api/v2/analytics/response-time`
- Purpose: Response time performance
- Status: ✅ Active

### Line Balance
**GET** `/api/v2/analytics/line-balance`
- Purpose: Call distribution and balance
- Status: ✅ Active

### Sales Metrics Analytics
**GET** `/api/v2/analytics/sales-metrics`
- Purpose: Advanced sales analytics
- Status: ✅ Active

### Daily Report
**GET** `/api/v2/analytics/daily-report`
- Purpose: Daily performance report
- Status: ✅ Active

### Daily Report Range
**GET** `/api/v2/analytics/daily-report/range`
- Purpose: Daily reports for date range
- Query: start_date, end_date
- Status: ✅ Active

---

## 11. Admin Operations

### Auto Assign
**POST** `/api/v2/admin/auto-assign`
- Purpose: Automatically assign work items
- Status: ✅ Active

### Bulk Infer Qualification
**POST** `/api/v2/admin/bulk-infer-qualification`
- Purpose: AI-infer qualification in bulk
- Status: ✅ Active

### Deduplicate Lines
**POST** `/api/v2/admin/deduplicate-lines`
- Purpose: Remove duplicate phone line records
- Status: ✅ Active

### Audit Logs
**GET** `/api/v2/admin/audit-logs`
- Purpose: System activity audit trail
- Status: ✅ Active

### Cron Status
**GET** `/api/v2/admin/cron-status`
- Purpose: Background job status
- Status: ✅ Active

### Outcome Keywords Analytics
**GET** `/api/v2/admin/analytics/outcome-keywords`
- Purpose: Keyword analysis for outcomes
- Status: ✅ Active

### Monday.com Board Catalog
**GET** `/api/v2/admin/monday/board-catalog`
- Purpose: Available Monday.com boards
- Status: ✅ Active

### Monday.com Scorecards
**GET** `/api/v2/admin/monday/scorecards`
- Purpose: Monday.com scorecard configuration
- Status: ✅ Active

### Monday.com Lead Insights
**GET** `/api/v2/admin/monday/lead-insights`
- Purpose: Lead data from Monday.com
- Status: ✅ Active

---

## 12. Monday.com Integration

### Manual Booked Call
**POST** `/api/v2/monday/manual-booked-call`
- Purpose: Manually record booked call in Monday.com
- Body: lead_id, call_details
- Status: ✅ Active

### SMS Sync Board IDs
**GET** `/api/admin/monday/sms/sync-board-ids`
- Purpose: Configured SMS sync boards
- Status: ✅ Active

### SMS Sync
**POST** `/api/admin/monday/sms/sync`
- Purpose: Sync SMS data to Monday.com
- Body: board_id, force (optional)
- Status: ✅ Active

### SMS Sequences Sync Board IDs
**GET** `/api/admin/monday/sms-sequences/sync-board-ids`
- Purpose: Configured sequence sync boards
- Status: ✅ Active

### SMS Sequences Sync
**POST** `/api/admin/monday/sms-sequences/sync`
- Purpose: Sync sequence data to Monday.com
- Status: ✅ Active

### SMS Reports Sync Board IDs
**GET** `/api/admin/monday/sms-reports/sync-board-ids`
- Purpose: Configured report sync boards
- Status: ✅ Active

### SMS Reports Sync
**POST** `/api/admin/monday/sms-reports/sync`
- Purpose: Sync SMS reports to Monday.com
- Status: ✅ Active

---

## 13. Work Items & Streaming

### Get Work Items
**GET** `/api/work-items`
- Purpose: List active work items
- Status: ✅ Active

### Resolve Work Item
**POST** `/api/work-items/:id/resolve`
- Purpose: Mark work item complete
- Status: ✅ Active

### Assign Work Item
**POST** `/api/work-items/:id/assign`
- Purpose: Assign work item to user
- Body: assigned_to (user ID)
- Status: ✅ Active

### Stream Token
**GET** `/api/stream-token`
- Purpose: Obtain real-time event stream token
- Status: ✅ Active

### Stream Events
**GET** `/api/stream`
- Purpose: Real-time event stream (WebSocket/SSE)
- Status: ✅ Active

---

## 14. Reps & Team

### Rep Response Metrics
**GET** `/api/v2/reps/response`
- Purpose: Individual rep performance metrics
- Status: ✅ Active

---

## 15. Data History

### Changelog
**GET** `/api/v2/changelog`
- Purpose: System changes and version history
- Status: ✅ Active

---

## Error Handling

All endpoints implement standard HTTP status codes:
- **200** - Success
- **400** - Bad request
- **401** - Unauthorized
- **403** - Forbidden
- **404** - Not found
- **500** - Server error

Responses follow envelope structure:
```json
{
  "data": { /* Response data */ },
  "error": { /* Error details if applicable */ }
}
```

---

## Authentication

All endpoints (except health/oauth) require valid authentication via:
1. OAuth token
2. Session cookie
3. API key (for service accounts)

---

## Rate Limiting

- Standard endpoints: 100 requests/minute per user
- Batch endpoints: 10 requests/minute
- Streaming: Persistent connection allowed

---

## Last Updated
March 20, 2026 - Production ready with all endpoints functional

