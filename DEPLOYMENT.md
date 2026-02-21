# Deployment Guide: Vercel + Railway

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
```

(Replace with your actual Railway URL from Step 1.4)

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
