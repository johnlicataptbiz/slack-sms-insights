# API Reference

Complete reference for the PT Biz SMS Insights API.

## Base URL

```
Development: http://localhost:3000
Production: https://your-railway-app.up.railway.app
```

## Authentication

All API endpoints (except OAuth) require Bearer token authentication:

```http
Authorization: Bearer <slack-oauth-token>
```

Obtain a token through the Slack OAuth flow:
1. `GET /api/oauth/start` - Initiates OAuth
2. `GET /api/oauth/callback` - Handles callback, returns token

## Endpoints

### Authentication

#### Start OAuth Flow
```http
GET /api/oauth/start
```

Redirects to Slack OAuth authorization page.

**Response:** 302 Redirect to Slack

---

#### OAuth Callback
```http
GET /api/oauth/callback?code=<auth-code>&state=<state>
```

Handles OAuth callback from Slack.

**Response:**
```json
{
  "ok": true,
  "token": "<slack-user-token>",
  "user": {
    "id": "U123456",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "invalid_code",
  "message": "The provided code is invalid or expired"
}
```

---

#### Verify Token
```http
GET /api/auth/verify
Authorization: Bearer <token>
```

Verifies if the current token is valid.

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": "U123456",
    "name": "John Doe"
  }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

---

### Daily Runs

#### List Runs
```http
GET /api/runs?daysBack=7&channelId=C123&limit=50
Authorization: Bearer <token>
```

Retrieve daily report runs with optional filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| daysBack | number | 7 | Days to look back (1-90) |
| channelId | string | - | Filter by Slack channel ID |
| limit | number | 50 | Max results (1-100) |

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2024-01-15T10:30:00Z",
        "channelId": "C1234567890",
        "channelName": "aloware-alerts",
        "reportType": "daily",
        "status": "success",
        "summaryText": "Daily SMS Report for 2024-01-15...",
        "fullReport": "Complete report text...",
        "durationMs": 2450,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 150,
    "hasMore": true
  }
}
```

**Error Responses:**
- `400` - Invalid query parameters
- `401` - Unauthorized (missing/invalid token)
- `503` - Database unavailable

---

#### Get Single Run
```http
GET /api/runs/:id
Authorization: Bearer <token>
```

Retrieve a specific run by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Run ID |

**Response:**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00Z",
    "channelId": "C1234567890",
    "channelName": "aloware-alerts",
    "reportType": "daily",
    "status": "success",
    "errorMessage": null,
    "summaryText": "Daily SMS Report for 2024-01-15...",
    "fullReport": "Complete report text with all metrics...",
    "durationMs": 2450,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `400` - Invalid ID format
- `401` - Unauthorized
- `404` - Run not found

---

#### Create Run (Bot Only)
```http
POST /api/runs
x-bot-token: <bot-secret>
```

Log a new report run (used by Slack bot).

**Request Body:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "channelId": "C1234567890",
  "channelName": "aloware-alerts",
  "reportType": "daily",
  "status": "success",
  "summaryText": "Report summary...",
  "fullReport": "Complete report...",
  "durationMs": 2450
}
```

**Response:**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `400` - Invalid request body
- `401` - Invalid bot token
- `503` - Database error

---

### Channels

#### List Channels
```http
GET /api/channels
Authorization: Bearer <token>
```

Retrieve all channels with run counts.

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "C1234567890",
        "name": "aloware-alerts",
        "runCount": 45,
        "lastRunAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### Sales Metrics (V2)

#### Get Sales Metrics
```http
GET /api/v2/sales-metrics?range=7d
Authorization: Bearer <token>
```

Retrieve aggregated sales metrics for dashboard.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| range | string | "7d" | Time range: "1d", "7d", "30d", "90d" |

**Response:**
```json
{
  "data": {
    "totals": {
      "messagesSent": 1250,
      "peopleContacted": 450,
      "repliesReceived": 180,
      "replyRatePct": 40.0,
      "canonicalBookedCalls": 25
    },
    "trendByDay": [
      {
        "day": "2024-01-09",
        "messagesSent": 180,
        "peopleContacted": 65,
        "repliesReceived": 28,
        "replyRatePct": 43.1,
        "canonicalBookedCalls": 4
      }
    ],
    "byRep": [
      {
        "rep": "John Doe",
        "messagesSent": 400,
        "peopleContacted": 150,
        "repliesReceived": 60,
        "replyRatePct": 40.0,
        "canonicalBookedCalls": 8
      }
    ],
    "range": "7d",
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `400` - Invalid range parameter
- `401` - Unauthorized
- `503` - Database not initialized

---

### Work Items (Inbox)

#### List Work Items
```http
GET /api/work-items?status=needs_reply&limit=50
Authorization: Bearer <token>
```

Retrieve work items for the inbox view.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | Filter by status: "needs_reply", "waiting", "closed" |
| limit | number | 50 | Max results (1-100) |
| offset | number | 0 | Pagination offset |

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "wi-123",
        "conversationId": "conv-456",
        "contactName": "Jane Smith",
        "contactPhone": "+1234567890",
        "status": "needs_reply",
        "priority": "high",
        "createdAt": "2024-01-15T09:00:00Z",
        "dueAt": "2024-01-15T10:00:00Z",
        "lastMessageAt": "2024-01-15T09:30:00Z"
      }
    ],
    "total": 25,
    "hasMore": false
  }
}
```

---

### Event Stream

#### Connect to Event Stream
```http
GET /api/events/stream
Authorization: Bearer <token>
```

Server-sent events endpoint for real-time updates.

**Response:** `text/event-stream`

```text
event: connected
data: {"clientId": "abc123"}

event: run.created
data: {"runId": "550e8400...", "channelId": "C123..."}

event: metrics.updated
data: {"range": "7d", "timestamp": "2024-01-15T10:30:00Z"}
```

**Events:**
- `connected` - Initial connection established
- `run.created` - New report run logged
- `metrics.updated` - Sales metrics recalculated
- `work-item.created` - New work item created
- `work-item.updated` - Work item status changed
- `ping` - Keepalive (every 30s)

---

## Error Handling

### Error Response Format

All errors follow this structure:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {}, // Optional additional context
  "requestId": "req-uuid-for-tracing"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Missing or invalid token |
| `forbidden` | 403 | Valid token but insufficient permissions |
| `not_found` | 404 | Resource doesn't exist |
| `invalid_input` | 400 | Request validation failed |
| `rate_limited` | 429 | Too many requests |
| `database_error` | 503 | Database unavailable |
| `internal_error` | 500 | Unexpected server error |

### Rate Limiting

API requests are rate limited:
- 100 requests per minute per token
- 10 concurrent connections per token

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## Types

### TypeScript Interfaces

```typescript
// Run Types
interface DailyRun {
  id: string;
  timestamp: string;
  channelId: string;
  channelName: string | null;
  reportType: 'daily' | 'manual' | 'test';
  status: 'success' | 'error';
  errorMessage: string | null;
  summaryText: string;
  fullReport: string;
  durationMs: number;
  createdAt: string;
}

// Sales Metrics Types
interface SalesMetricsV2 {
  totals: {
    messagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
  };
  trendByDay: Array<{
    day: string;
    messagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
  }>;
  byRep: Array<{
    rep: string;
    messagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
  }>;
  range: string;
  generatedAt: string;
}

// Work Item Types
interface WorkItem {
  id: string;
  conversationId: string;
  contactName: string;
  contactPhone: string;
  status: 'needs_reply' | 'waiting' | 'closed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  dueAt: string;
  lastMessageAt: string;
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
// Using fetch
async function getRuns(token: string, daysBack = 7) {
  const response = await fetch(
    `${API_URL}/api/runs?daysBack=${daysBack}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}

// Using EventSource for real-time updates
function connectToEventStream(token: string) {
  const eventSource = new EventSource(
    `${API_URL}/api/events/stream`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  eventSource.addEventListener('run.created', (event) => {
    const data = JSON.parse(event.data);
    console.log('New run:', data);
  });
  
  return eventSource;
}
```

### cURL

```bash
# Get runs
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.example.com/api/runs?daysBack=7"

# Create run (bot only)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-bot-token: $BOT_TOKEN" \
  -d '{
    "timestamp": "2024-01-15T10:30:00Z",
    "channelId": "C123",
    "reportType": "daily",
    "status": "success",
    "summaryText": "Summary",
    "fullReport": "Full report",
    "durationMs": 2450
  }' \
  "https://api.example.com/api/runs"
```

---

## Changelog

### v2.0.0 (2024-01-15)
- Added V2 sales metrics endpoint
- Added work items (inbox) API
- Added event stream for real-time updates
- Deprecated v1 metrics endpoint

### v1.1.0 (2024-01-01)
- Added channel listing endpoint
- Added filtering to runs endpoint
- Improved error responses

### v1.0.0 (2023-12-01)
- Initial API release
- Basic runs CRUD
- Slack OAuth integration
