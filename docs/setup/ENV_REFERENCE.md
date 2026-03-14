# Environment Variable Reference

Complete reference for all environment variables used by the PT Biz SMS Insights backend (`sms-insights/`).

Copy the template to get started:

```bash
cd sms-insights
cp .env.example .env
```

---

## Table of Contents

1. [Node Environment](#1-node-environment)
2. [Database](#2-database)
3. [Slack App](#3-slack-app)
4. [Dashboard Authentication](#4-dashboard-authentication)
5. [CORS](#5-cors)
6. [Frontend Build](#6-frontend-build)
7. [OpenAI](#7-openai)
8. [Monday.com](#8-mondaycom)
9. [Aloware](#9-aloware)
10. [HubSpot](#10-hubspot)
11. [Firebase](#11-firebase)
12. [Logging](#12-logging)
13. [Frontend Variables](#13-frontend-variables-frontendenv)

---

## 1. Node Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | Runtime environment: `development`, `production`, or `test` |
| `PORT` | no | `3000` | HTTP server port |

---

## 2. Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |

### Connection string formats

**Local PostgreSQL:**
```
postgresql://<user>@localhost:5432/sms_insights
```

**Railway — local development (use PUBLIC URL):**
```
postgresql://postgres:<password>@crossover.proxy.rlwy.net:<port>/railway
```

**Railway — production (use PRIVATE URL, no egress fees):**
```
postgresql://postgres:<password>@postgres.railway.internal:5432/railway
```

> ⚠️ Never hardcode connection strings in source files. Always read from `process.env.DATABASE_URL`.

> ⚠️ After changing `DATABASE_URL` on Railway, use `railway up` (not `railway redeploy`) to pick up the new value.

---

## 3. Slack App

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | **yes** | — | Bot OAuth token (`xoxb-...`). From **OAuth & Permissions** page. |
| `SLACK_APP_TOKEN` | **yes** | — | App-level Socket Mode token (`xapp-...`). From **Basic Information** page. |
| `SLACK_SIGNING_SECRET` | **yes** | — | Request signing secret. From **Basic Information** page. |
| `SLACK_CLIENT_ID` | **yes** | — | OAuth app client ID. From **Basic Information** page. |
| `SLACK_CLIENT_SECRET` | **yes** | — | OAuth app client secret. From **Basic Information** page. |

### How to find these values

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and select your app.
2. **Basic Information** → App Credentials → copy `Signing Secret`, `Client ID`, `Client Secret`.
3. **Socket Mode** → Enable Socket Mode → generate an App-Level Token with `connections:write` scope → copy as `SLACK_APP_TOKEN`.
4. **OAuth & Permissions** → Install to workspace → copy `Bot User OAuth Token` as `SLACK_BOT_TOKEN`.

---

## 4. Dashboard Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHBOARD_AUTH_REDIRECT_URI` | **yes** | — | OAuth callback URL. Must be registered in Slack app redirect URL list. |
| `DASHBOARD_AUTH_SUCCESS_URL` | **yes** | — | Where the frontend redirects after successful login. |
| `DASHBOARD_OAUTH_USER_SCOPES` | no | `users:read` | Slack OAuth user scopes to request. |
| `ALLOW_DUMMY_AUTH_TOKEN` | no | `false` | Set `true` to bypass Slack OAuth locally with a static test token. **Never use in production.** |

### Values by environment

| Variable | Local | Production |
|----------|-------|-----------|
| `DASHBOARD_AUTH_REDIRECT_URI` | `http://localhost:3000/api/oauth/callback` | `https://your-railway-app.up.railway.app/api/oauth/callback` |
| `DASHBOARD_AUTH_SUCCESS_URL` | `http://localhost:5173` | `https://your-project.vercel.app` |
| `ALLOW_DUMMY_AUTH_TOKEN` | `true` | `false` |

> The redirect URI must be added to your Slack app under **OAuth & Permissions → Redirect URLs**.

---

## 5. CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALLOWED_ORIGINS` | **yes** | — | Comma-separated list of allowed CORS origins. |

### Values by environment

| Environment | Example value |
|-------------|--------------|
| Local | `http://localhost:5173,http://localhost:3000` |
| Production | `https://your-project.vercel.app,https://www.ptbizsms.com,https://ptbizsms.com` |

---

## 6. Frontend Build

These variables are embedded into the frontend at build time by Vite.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | **yes** | — | Backend API base URL. Used by the frontend to make API calls. |
| `VITE_UI_VERSION` | no | `legacy` | Default UI to serve: `legacy` or `v2`. |

### Values by environment

| Variable | Local | Production |
|----------|-------|-----------|
| `VITE_API_URL` | `http://localhost:3000` | `https://your-railway-app.up.railway.app` |
| `VITE_UI_VERSION` | `legacy` | `legacy` (flip to `v2` after cohort sign-off) |

### UI version rollout

- **`legacy`** (default) — serves the original dashboard.
- **`v2`** — serves the new V2 dashboard.
- Per-user override via query param: `?ui=v2` (stored in `localStorage`).
- Per-user revert: `localStorage.setItem('ptbizsms-ui-mode', 'legacy')`.

---

## 7. OpenAI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | **yes** | — | OpenAI secret key (`sk-...`). Used for AI-assisted SMS drafting. |

Get your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

---

## 8. Monday.com

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONDAY_API_TOKEN` | optional | — | Personal API token from Monday.com. |
| `MONDAY_SYNC_ENABLED` | optional | `false` | Enable Monday.com board sync. |
| `MONDAY_WRITEBACK_ENABLED` | optional | `false` | Enable writing booked calls back to Monday. |
| `MONDAY_PERSONAL_SYNC_ENABLED` | optional | `false` | Enable personal board sync. |
| `MONDAY_ACQ_BOARD_ID` | optional | — | Acquisition calls board ID. |
| `MONDAY_MY_CALLS_BOARD_ID` | optional | — | Personal calls board ID. |
| `MONDAY_PERSONAL_BOARD_ID` | optional | — | Personal tracking board ID. |
| `MONDAY_SYNC_EXTRA_BOARD_IDS` | optional | — | Comma-separated additional board IDs to ingest. |
| `MONDAY_PERSONAL_SETTER_BUCKET` | optional | — | Setter name bucket for personal board (e.g. `jack`). |
| `MONDAY_PERSONAL_SETTER_MONDAY_USER_ID` | optional | — | Monday.com user ID for the setter. |
| `MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS` | optional | `14` | Days to look back when pushing personal board data. |
| `MONDAY_SYNC_BACKFILL_DAYS` | optional | `90` | Days to backfill on initial sync. |
| `MONDAY_API_TIMEOUT_MS` | optional | `12000` | Monday API request timeout in milliseconds. |
| `MONDAY_API_MAX_RETRIES` | optional | `2` | Maximum retry attempts for Monday API calls. |
| `MONDAY_API_RETRY_BASE_MS` | optional | `500` | Base delay in ms for Monday API retry backoff. |
| `MONDAY_ACQ_COLUMN_MAP_JSON` | optional | — | JSON object mapping column roles to column IDs for the acquisition board. |
| `MONDAY_PERSONAL_COLUMN_MAP_JSON` | optional | — | JSON object mapping column roles to column IDs for the personal board. |

### Finding board IDs

Board IDs appear in the Monday.com URL: `https://your-org.monday.com/boards/<BOARD_ID>`

### Column map JSON format

```json
// MONDAY_ACQ_COLUMN_MAP_JSON
{
  "callDateColumnId": "date4",
  "setterColumnId": "people",
  "stageColumnId": "status",
  "outcomeColumnId": "text_mkrrha4q",
  "phoneColumnId": "phone",
  "contactIdColumnId": "text_mkrqz1wd"
}

// MONDAY_PERSONAL_COLUMN_MAP_JSON
{
  "callDateColumnId": "date4",
  "contactNameColumnId": "name",
  "phoneColumnId": "phone",
  "setterColumnId": "person",
  "stageColumnId": "status",
  "firstConversionColumnId": "text_first_conversion",
  "lineColumnId": "text_line",
  "sourceColumnId": "text_source",
  "slackLinkColumnId": "link",
  "notesColumnId": "long_text"
}
```

> Setting column maps explicitly is recommended in production to ensure exact board parity.

---

## 9. Aloware

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALOWARE_API_KEY` | optional | — | Aloware API key. From **Settings → API** in your Aloware account. |
| `ALOWARE_ACCOUNT_ID` | optional | — | Your Aloware account ID. |

---

## 10. HubSpot

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUBSPOT_ACCESS_TOKEN` | optional | — | HubSpot private app access token. Used for contact enrichment. |

### How to get a HubSpot access token

1. In HubSpot, go to **Settings → Integrations → Private Apps**.
2. Click **Create a private app**.
3. Under **Scopes**, add `crm.objects.contacts.read` and any other required scopes.
4. Click **Create app** and copy the access token.

---

## 11. Firebase

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | optional | — | Firebase project ID. |
| `FIREBASE_CLIENT_EMAIL` | optional | — | Service account client email. |
| `FIREBASE_PRIVATE_KEY` | optional | — | Service account private key (include `\n` line breaks). |

### How to get Firebase credentials

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Select your project → **Project Settings → Service Accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Copy `project_id` → `FIREBASE_PROJECT_ID`, `client_email` → `FIREBASE_CLIENT_EMAIL`, `private_key` → `FIREBASE_PRIVATE_KEY`.

> When setting `FIREBASE_PRIVATE_KEY` in Railway or Vercel, paste the raw value including `-----BEGIN PRIVATE KEY-----` header/footer. The `\n` characters will be interpreted correctly.

---

## 12. Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | no | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

---

## 13. Frontend Variables (`frontend/.env`)

The frontend has its own `.env` file at `frontend/.env`. These are separate from the backend variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | **yes** | — | Backend API base URL (e.g. `http://localhost:3000` or Railway URL) |
| `VITE_UI_VERSION` | no | `legacy` | Default UI version: `legacy` or `v2` |

> In production, these are set as **Vercel Environment Variables** in the Vercel project dashboard, not in a `.env` file.

---

## Quick Reference: Minimum Local Dev Setup

```bash
# sms-insights/.env — minimum required for local development
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/sms_insights
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
OPENAI_API_KEY=sk-your-openai-key
DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
VITE_API_URL=http://localhost:3000
ALLOW_DUMMY_AUTH_TOKEN=true
```

> With `ALLOW_DUMMY_AUTH_TOKEN=true`, you can skip the full Slack OAuth setup and use a static token for local testing.
