s# Deployment Guide: Vercel + Railway

This project is split across two platforms for optimal scalability:
- **Vercel**: React frontend dashboard
- **Railway**: Node.js Slack bot, API server, and PostgreSQL database

## Prerequisites

1. GitHub account with the repo pushed
2. [Vercel account](https://vercel.com/signup)
3. [Railway account](https://railway.app?referralCode=claude) (use Railway CLI)

## Step 1: Deploy Backend to Railway

### 1.1 Install Railway CLI and authenticate

```bash
brew install railway  # macOS
# or download from https://railway.app
railway login
```

### 1.2 Link project and create database

```bash
cd /Users/jl/Desktop/SlackCLI

# Create new Railway project (or link existing)
railway init

# Add PostgreSQL database
railway add --name postgres

# Check your services
railway services
```

### 1.3 Set environment variables

> ⚠️ **Important — use the private database endpoint in production.**
> Railway exposes two database URLs:
> - `DATABASE_PRIVATE_URL` — routes over Railway's internal network (no egress fees, faster)
> - `DATABASE_PUBLIC_URL` — routes through the public TCP proxy (incurs egress fees)
>
> Always set `DATABASE_URL` to the **private** URL when the app runs inside Railway:
> ```bash
> railway variables --service sms-insights --set \
>   "DATABASE_URL=postgresql://postgres:<password>@postgres.railway.internal:5432/railway"
> ```
> Use `DATABASE_PUBLIC_URL` only when connecting **from outside Railway** (e.g. local scripts).

```bash
# Get the DATABASE_URL from Railway
railway variables

# Add your Slack credentials and other env vars
railway variables set SLACK_BOT_TOKEN=xoxb-...
railway variables set SLACK_APP_TOKEN=xapp-...
railway variables set SLACK_CLIENT_ID=...
railway variables set SLACK_CLIENT_SECRET=...
railway variables set OPENAI_API_KEY=sk-...
railway variables set VITE_API_URL=https://your-railway-app.up.railway.app
railway variables set ALLOWED_ORIGINS=https://your-project.vercel.app,https://www.ptbizsms.com,https://ptbizsms.com
railway variables set ALLOW_DUMMY_AUTH_TOKEN=false

# Add dashboard redirect URI (replace with your Railway URL)
railway variables set DASHBOARD_AUTH_REDIRECT_URI=https://your-railway-app.up.railway.app/api/oauth/callback
railway variables set DASHBOARD_AUTH_SUCCESS_URL=https://your-project.vercel.app
railway variables set DASHBOARD_OAUTH_USER_SCOPES=users:read

# monday integration (phase rollout)
railway variables set MONDAY_API_TOKEN=...
railway variables set MONDAY_SYNC_ENABLED=true
railway variables set MONDAY_WRITEBACK_ENABLED=true
railway variables set MONDAY_PERSONAL_SYNC_ENABLED=true
railway variables set MONDAY_ACQ_BOARD_ID=5077164868
railway variables set MONDAY_MY_CALLS_BOARD_ID=10029059942
railway variables set MONDAY_PERSONAL_BOARD_ID=10029059942
# Optional: add additional Monday boards to ingest (comma-separated IDs)
railway variables set MONDAY_SYNC_EXTRA_BOARD_IDS=
railway variables set MONDAY_PERSONAL_SETTER_BUCKET=jack
railway variables set MONDAY_PERSONAL_SETTER_MONDAY_USER_ID=YOUR_MONDAY_USER_ID
railway variables set MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS=14
railway variables set MONDAY_SYNC_BACKFILL_DAYS=90
railway variables set MONDAY_API_TIMEOUT_MS=12000
railway variables set MONDAY_API_MAX_RETRIES=2
railway variables set MONDAY_API_RETRY_BASE_MS=500

# Hard-map column IDs (recommended in production for exact board parity)
railway variables set MONDAY_ACQ_COLUMN_MAP_JSON='{"callDateColumnId":"date4","setterColumnId":"people","stageColumnId":"status","outcomeColumnId":"text_mkrrha4q","phoneColumnId":"phone","contactIdColumnId":"text_mkrqz1wd"}'
railway variables set MONDAY_PERSONAL_COLUMN_MAP_JSON='{"callDateColumnId":"date4","contactNameColumnId":"name","phoneColumnId":"phone","setterColumnId":"person","stageColumnId":"status","firstConversionColumnId":"text_first_conversion","lineColumnId":"text_line","sourceColumnId":"text_source","slackLinkColumnId":"link","notesColumnId":"long_text"}'
```

### 1.4 Deploy

```bash
# Push to Railway
railway up

# Monitor logs
railway logs –follow
```

After deployment, Railway will give you a URL like: `https://your-railway-app.up.railway.app`

**Save this URL** - you'll need it for Vercel.

## Step 2: Deploy Frontend to Vercel

### 2.1 Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Select your SlackCLI repo from GitHub
4. Click "Import"

### 2.2 Configure environment variables

In Vercel project settings → Environment Variables, add:

```
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_UI_VERSION=legacy
```

(Replace with your actual Railway URL from Step 1.4)

`VITE_UI_VERSION=legacy` keeps legacy as default while we cohort-test V2.

### 2.3 Configure build settings

Vercel should auto-detect these from `vercel.json`, but confirm:

- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`
- **Install Command**: (leave default)

### 2.4 Deploy

Click "Deploy". Vercel will:
1. Install dependencies in `frontend/`
2. Build the React app
3. Deploy static files to CDN

Your frontend will be live at: `https://your-project.vercel.app`

## UI rollout: legacy default + V2 cohorts

### Keep legacy default (initial rollout)

- Set `VITE_UI_VERSION=legacy` in Vercel production env vars.
- Deploy.
- Default route opens legacy unless user explicitly opts into V2.

### Cohort-enable V2

Per-user V2 enable options:

1. Query param (one-time, sticky):
   - `https://your-project.vercel.app/v2/insights?ui=v2`
   - This stores `ptbizsms-ui-mode=v2` in localStorage.
2. LocalStorage manual toggle (browser console):
   - `localStorage.setItem('ptbizsms-ui-mode', 'v2'); location.href='/v2/insights';`
3. Revert a user to legacy:
   - `localStorage.setItem('ptbizsms-ui-mode', 'legacy'); location.href='/legacy';`

### Flip default to V2 (after cohort signoff)

1. Change Vercel env var to `VITE_UI_VERSION=v2`.
2. Deploy.
3. Keep query/localStorage overrides enabled for fast rollback.

## Step 3: Verify Integration

### 3.1 Test OAuth flow

1. Visit your Vercel frontend: `https://your-project.vercel.app`
2. Click "Sign in with Slack"
3. You should be redirected to Slack OAuth, then back to dashboard
4. Check if dashboard loads recent runs

### 3.2 Test report logging

1. In the Slack channel with your bot, mention: `@Aloware SMS Insights populate daily report for today`
2. Check Railway logs: `railway logs --follow`
3. Visit the dashboard and look for the new run entry

### 3.3 Debug connection issues

If frontend can't reach backend:

```bash
# Check Railway app is running
railway logs

# Verify CORS (add if needed to app.ts)
# Test API directly:
curl https://your-railway-app.up.railway.app/api/channels \
  -H "Authorization: Bearer <your-token>"
```

## Monitoring & Logs

### Railway logs

```bash
railway logs --follow
```

### Database queries

```bash
railway db:connect  # Connect to PostgreSQL
# or via Railway web dashboard → Database → PostgreSQL → Connect
```

### Vercel logs

Dashboard in Vercel web console → Deployments → Logs

## Rollback

**Revert deployment on Vercel:**
- Dashboard → Deployments → Select previous → "Redeploy"

**Revert deployment on Railway:**
```bash
railway rollback  # Redeploy previous version
```

## Cost Notes

- **Vercel**: Free tier covers frontend (1000 daily requests)
- **Railway**: $5/month ($5 credit free monthly) for basic setup
  - Database: ~$5/month if heavily used
  - Compute: ~$2-5/month for Node.js

## Troubleshooting

**"DATABASE_URL not set"**
→ Verify Railway PostgreSQL is running and variables are synced

**"database does not exist" / doubled URL error**
→ The `DATABASE_URL` variable may have been set to a concatenated value (two URLs joined).
Fix it by explicitly setting the private URL:
```bash
railway variables --service sms-insights --set \
  "DATABASE_URL=postgresql://postgres:<password>@postgres.railway.internal:5432/railway"
railway up --service sms-insights --detach  # fresh deploy picks up new value
```
Note: `railway redeploy` reuses the old deployment snapshot — always use `railway up` after changing variables.

**"Unauthorized" on API calls**
→ Check SLACK_CLIENT_ID/SECRET are set on Railway

**"Frontend can't reach API"**
→ Ensure VITE_API_URL on Vercel matches Railway URL

**Build fails on Vercel**
→ Check `frontend/package.json` has all dependencies installed locally first:
```bash
cd frontend && npm install && npm run build
```

**Build fails on Railway**
→ Check `sms-insights/package.json` build script and logs
