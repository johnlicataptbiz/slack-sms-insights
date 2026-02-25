# Daily Report Dashboard - Architecture Summary

## 🏗️ System Architecture

```
Slack App (Socket Mode)
    ↓
Node.js Backend (Bolt.js)
    ├── Reports generated for channels
    ├── Logs to PostgreSQL via daily-run-logger
    ├── Serves API endpoints
    └── Serves React frontend (SPA)
         ↓
    React Dashboard (Vercel deployment)
    ├── Login with Slack OAuth
    ├── View past 7 days of reports
    ├── Filter by channel & status
    └── Click to see full report details
```

## 📁 Project Structure

```
SlackCLI/
├── sms-insights/                    # Main backend (deploys to Railway)
│   ├── app.ts                       # Entry point, HTTP server setup
│   ├── listeners/
│   │   └── events/
│   │       └── app-mention.ts      # Intercepts mentions, logs reports
│   ├── services/
│   │   ├── db.ts                   # PostgreSQL connection pool
│   │   ├── daily-run-logger.ts     # Insert/query report logs
│   │   ├── aloware-analytics.ts    # (existing) SMS analytics
│   │   └── ...other services
│   ├── api/
│   │   └── routes.ts               # API endpoints (OAuth, runs, channels)
│   ├── package.json                # Backend dependencies
│   └── dist/                        # Compiled JS (generated)
│
├── frontend/                        # React dashboard (deploys to Vercel)
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Auth & router
│   │   ├── pages/
│   │   │   └── Dashboard.tsx       # Main dashboard page
│   │   ├── components/
│   │   │   ├── Login.tsx           # OAuth login button
│   │   │   ├── RunList.tsx         # Table of reports
│   │   │   └── RunDetail.tsx       # Full report viewer
│   │   └── styles/                 # CSS files
│   ├── package.json                # Frontend dependencies
│   ├── vite.config.ts              # Vite build config
│   └── dist/                        # Built static files (generated)
│
├── vercel.json                      # Vercel deployment config
├── railway.toml                     # Railway deployment config
├── DEPLOYMENT.md                    # Production deployment guide
├── LOCAL_DEV.md                     # Local development setup
└── .gitignore                       # Git ignore patterns
```

## 🔄 Data Flow

### 1. Report Generation
```
User mentions @Aloware → app-mention listener intercepts
→ Generate analytics report
→ Post to Slack thread
→ Log to database via logDailyRun()
```

### 2. Dashboard View
```
User visits dashboard → Slack OAuth login
→ Frontend gets token
→ Fetches GET /api/runs with Authorization header
→ Backend queries PostgreSQL
→ Returns runs to frontend
→ Dashboard renders table
```

### 3. Report Lookup
```
User clicks run in table
→ Frontend fetches GET /api/runs/:id
→ Shows full_report text
→ Displays error_message if status=error
```

## 🗄️ Database Schema

### `daily_runs` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| timestamp | TIMESTAMPTZ | When report was generated |
| channel_id | TEXT | Slack channel ID |
| channel_name | TEXT | Cached channel name |
| report_type | TEXT | 'daily', 'manual', or 'test' |
| status | TEXT | 'success' or 'error' |
| error_message | TEXT | Error details if failed |
| summary_text | TEXT | First 500 chars of report |
| full_report | TEXT | Complete report content |
| duration_ms | INTEGER | Generation time |
| created_at | TIMESTAMPTZ | Record creation timestamp |

**Indexes:**
- `channel_id, timestamp DESC` (for fast queries)
- `timestamp DESC` (for ordering)

## 🔐 API Endpoints

### Authentication
- `GET /api/oauth/start` - Redirects to Slack OAuth
- `GET /api/oauth/callback` - Handles OAuth callback
- `GET /api/auth/verify` - Verify token (requires Bearer token)

### Runs (all require Bearer token)
- `GET /api/runs?daysBack=7&channelId=C123&limit=50` - List runs
- `GET /api/runs/:id` - Get single run

### Channels (requires Bearer token)
- `GET /api/channels` - List channels with run counts

### Bot Logging (requires x-bot-token header)
- `POST /api/runs` - Log a report run (from bot)

## 🚀 Deployment Strategy

### Development
1. Local: Node.js + Vite dev server + local/Railway PostgreSQL
2. Test changes locally first

### Production
1. **Backend** → Railway
   - Node.js app with Slack bot
   - API server
   - PostgreSQL database
   - Logs all reports

2. **Frontend** → Vercel
   - React SPA dashboard
   - Points to Railway API via VITE_API_URL
   - Fast CDN delivery

## 📊 Environment Variables

### Railway Backend
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:pass@host/db
VITE_API_URL=https://your-railway-url.up.railway.app
DASHBOARD_AUTH_REDIRECT_URI=https://your-railway-url.up.railway.app/api/oauth/callback
```

### Vercel Frontend
```
VITE_API_URL=https://your-railway-url.up.railway.app
```

## 🔧 Key Technologies

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend | Node.js + TypeScript | Fast async, type safety |
| Slack Integration | @slack/bolt | Official, Socket Mode support |
| Frontend | React + Vite | Fast dev experience, small bundle |
| Database | PostgreSQL | Reliable relational data |
| Task Scheduling | Node.js native | Built-in, minimal deps |
| Deployment | Railway + Vercel | Seamless GitHub integration |

## ✅ What's Implemented

### v1 (Daily Runs Dashboard)
- ✅ Database connection pool with retry logic
- ✅ OAuth 2.0 Slack authentication
- ✅ Report logging on success and error
- ✅ Dashboard with filters (date, channel, status)
- ✅ Full report viewer with error details
- ✅ Real-time polling (10s refresh)
- ✅ API with token-based auth
- ✅ TypeScript throughout
- ✅ Graceful error handling (logging failures don't break Slack replies)
- ✅ Responsive UI

### v2 foundation (Operational Command Center)
- ✅ Additive DB tables: `sms_events`, `conversations`, `work_items`
- ✅ Slack message ingestion for Aloware channel → normalized `sms_events`
- ✅ Conversation projection + basic SLA work item generation (`needs_reply`)
- ✅ New API endpoint: `GET /api/work-items`
- ✅ New frontend view: **Inbox** (polls work items every 10s)

## 📝 Next Steps

1. **Local Testing**: Follow [`LOCAL_DEV.md`](./LOCAL_DEV.md)
2. **Deploy to Production**: Follow [`DEPLOYMENT.md`](./DEPLOYMENT.md)
3. **Monitor**: Check Railway logs and Vercel dashboard
4. **Integrate**: Dashboard is live, reports auto-log!
