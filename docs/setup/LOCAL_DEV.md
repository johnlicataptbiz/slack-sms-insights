# Local Development Guide

Get the dashboard running locally with a test database.

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (or use Railway PostgreSQL)
- Slack app credentials (.env file)

## Option A: Local PostgreSQL

### 1. Install PostgreSQL

```bash
brew install postgresql@15  # macOS
# Start service:
brew services start postgresql@15
```

### 2. Create database

```bash
createdb sms_insights
```

### 3. Get connection string

```bash
echo "postgresql://$(whoami):@localhost:5432/sms_insights"
```

## Option B: Railway PostgreSQL (Recommended for quick testing)

```bash
# Connect to Railway project
cd /Users/jl/Desktop/SlackCLI
railway link

# Get the public URL (needed for connections from outside Railway)
railway variables --service sms-insights --json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL',''))"
# Copy the value — use this as DATABASE_URL in your local .env
```

> ⚠️ **Public vs Private URL**
> - `DATABASE_PRIVATE_URL` (`postgres.railway.internal`) — only reachable **inside** Railway's network. Use this for the production `DATABASE_URL` env var on the Railway service.
> - `DATABASE_PUBLIC_URL` (`crossover.proxy.rlwy.net`) — reachable from your laptop. Use this in your local `.env` or when running scripts locally.
>
> Never hardcode either URL in source files — always read from `process.env.DATABASE_URL`.

Note: if you copy/paste commands from a web page and see `&&` or `<<` in your terminal, those are HTML-escaped operators.
Replace them with the real shell operators (`&&`, `<<`) or the command will fail in zsh with a parse error.

## Setup & Run

### 1. Install dependencies

```bash
cd /Users/jl/Desktop/SlackCLI/sms-insights

# Install backend deps
npm install

# Install frontend deps
cd frontend
npm install
cd ..
```

### 2. Configure .env

```bash
cp .env.sample .env
# Edit .env and fill in:
# - DATABASE_URL (from above — use the public Railway URL for local dev)
# - SLACK_BOT_TOKEN
# - SLACK_APP_TOKEN
# - SLACK_CLIENT_ID
# - SLACK_CLIENT_SECRET
# - OPENAI_API_KEY
# - DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
# - DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
# - DASHBOARD_OAUTH_USER_SCOPES=users:read
# - ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
# - ALLOW_DUMMY_AUTH_TOKEN=false
# - VITE_API_URL=http://localhost:3000
# - VITE_UI_VERSION=legacy
# Optional monday mapping overrides (JSON):
# - MONDAY_ACQ_COLUMN_MAP_JSON={"callDateColumnId":"date4","setterColumnId":"people","stageColumnId":"status","outcomeColumnId":"text_mkrrha4q","phoneColumnId":"phone","contactIdColumnId":"text_mkrqz1wd"}
# - MONDAY_PERSONAL_COLUMN_MAP_JSON={"callDateColumnId":"date4","contactNameColumnId":"name","phoneColumnId":"phone","setterColumnId":"person","stageColumnId":"status","firstConversionColumnId":"text_first_conversion","lineColumnId":"text_line","sourceColumnId":"text_source","slackLinkColumnId":"link","notesColumnId":"long_text"}
# Optional extra monday boards to read-sync:
# - MONDAY_SYNC_EXTRA_BOARD_IDS=5753238048,5753199181,5753276147,5753287414
```

### 3. Start backend + API server

```bash
npm run dev
```

You should see:
```
✅ Database connection pool initialized
🌐 HTTP server listening on port 3000
⚡️ Bolt app is running via Socket Mode!
```

### 4. Start frontend dev server (in another terminal)

```bash
cd /Users/jl/Desktop/SlackCLI/frontend
npm run dev
```

This starts Vite dev server. Visit:
```
http://localhost:5173
```

### 5. Test the integration

1. **Local frontend** → http://localhost:5173
2. **API directly** (if needed) → http://localhost:3000/api/runs (requires token in header)
3. **Slack bot** → Mention `@Aloware SMS Insights populate daily report for today` in your test channel
4. Check the dashboard for new entries

## Database Debugging

### Connect to your database

```bash
# Railway
railway db:connect

# Or local PostgreSQL
psql sms_insights
```

### Check tables

```sql
\dt  -- List tables
SELECT * FROM daily_runs LIMIT 5;
SELECT COUNT(*) FROM daily_runs;
```

### Clear test data

```sql
DELETE FROM daily_runs WHERE report_type = 'test';
```

## Build & Test Production Build

```bash
# Build everything
npm run build

# You should see:
# - dist/app.js (compiled backend)
# - frontend/dist/ (built React app)
```

## Troubleshooting

**"Cannot find module '@slack/web-api'"**
```bash
cd /Users/jl/Desktop/SlackCLI/sms-insights
npm install
```

**"DATABASE_URL not set"**
- API endpoints will return 503
- Check your `.env` file has `DATABASE_URL` set to the **public** Railway URL (for local dev)
- Check database is accessible

**"database does not exist" error on startup**
- Your `DATABASE_URL` may be a doubled/concatenated value
- Verify with: `railway variables --service sms-insights --json | python3 -c "import json,sys; print(json.load(sys.stdin).get('DATABASE_URL',''))"`
- Fix by re-setting it explicitly (see `DEPLOYMENT.md` troubleshooting)

**Running scripts locally (e.g. `investigate-bookings.ts`)**
- Scripts read `DATABASE_URL` from the environment — pass the public URL:
  ```bash
  DATABASE_URL="postgresql://postgres:<password>@crossover.proxy.rlwy.net:56263/railway" \
    npx tsx scripts/investigate-bookings.ts
  ```

**Frontend can't reach API**
- Check VITE_API_URL in .env (should be http://localhost:3000)
- Check backend is running on port 3000
- Check browser console for CORS errors

**OAuth flow breaks locally**
- Make sure DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
- Slack app must have http://localhost:3000/api/oauth/callback in redirect URIs

## Next: Deploy

Once local testing works, follow [`DEPLOYMENT.md`](./DEPLOYMENT.md) to push to production.
