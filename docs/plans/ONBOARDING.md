# PT Biz SMS Insights — Complete Onboarding Guide

Welcome to the PT Biz SMS Insights project! This guide will take you from zero to a fully running development environment.

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start (5 Minutes)](#3-quick-start-5-minutes)
4. [Detailed Setup](#4-detailed-setup)
5. [Integration Configuration](#5-integration-configuration)
6. [Development Workflow](#6-development-workflow)
7. [Database Operations](#7-database-operations)
8. [Troubleshooting](#8-troubleshooting)
9. [Next Steps](#9-next-steps)

---

## 1. Project Overview

PT Biz SMS Insights is a real-time SMS analytics platform integrated with Slack, Aloware, Monday.com, and HubSpot. It provides daily reports, conversation insights, AI-assisted drafting, and sales metrics for SMS marketing campaigns.

### Key Features

- **Real-time SMS Campaign Monitoring:** Track campaigns through Slack integration
- **Daily Analytics Reports:** Generate daily reports with sales metrics, response rates, and booked calls
- **Conversation Tracking:** Monitor conversations across multiple channels with SLA monitoring
- **AI-Assisted Drafting:** OpenAI-powered reply suggestions for agents in the inbox
- **CRM Integration:** Sync with Monday.com and HubSpot for lead management and call tracking
- **Modern Dashboard:** An interactive web UI with charts, KPIs, and real-time data

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Slack App  │  │   Dashboard  │  │   Monday.com │       │
│  │   (Mentions) │  │   (Web UI)   │  │   (Sync)     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Railway)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js + Express Server                │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │  Slack Bot  │ │   REST API  │ │   WebSocket │   │   │
│  │  │  (Bolt.js)  │ │   (Routes)  │ │   (Stream)  │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Service Layer                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │   │
│  │  │ Aloware  │ │  Monday  │ │  Slack   │ │  AI    │ │   │
│  │  │  Client  │ │   Sync   │ │  Client  │ │Response│ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer (PostgreSQL)                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ daily_runs  │ │ sms_events  │ │conversations│          │
│  │  (reports)  │ │  (events)   │ │   (threads) │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ work_items  │ │booked_calls │ │   users     │          │
│  │   (SLA)     │ │   (calls)   │ │  (oauth)    │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites

### Required Software

| Tool | Version | Check Command | Install |
|------|---------|---------------|---------|
| Node.js | 22+ | `node --version` | [nodejs.org](https://nodejs.org) |
| npm | 9+ | `npm --version` | Included with Node.js |
| PostgreSQL | 15+ | `psql --version` | [postgresql.org](https://postgresql.org) |
| Git | 2.x | `git --version` | [git-scm.com](https://git-scm.com) |

### Optional Tools

| Tool | Purpose | Install |
|------|---------|---------|
| Railway CLI | Cloud database & deployment | `brew install railway` |
| Slack CLI | Workflow development | [Slack CLI Guide](https://api.slack.com/automation/quickstart) |
| Vercel CLI | Frontend deployment | `npm i -g vercel` |

### Accounts Needed

- **GitHub** — Repository access
- **Slack Workspace** — For bot development (paid plan recommended)
- **Railway** — For cloud database (optional, can use local PostgreSQL)
- **Vercel** — For frontend deployment (optional for local dev)

---

## 3. Quick Start (5 Minutes)

If you want to get running immediately with minimal setup:

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd slack-sms-insights

# 2. Install backend dependencies
cd sms-insights
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Configure environment (minimum for local dev)
cd ../sms-insights
cp .env.example .env

# Quick setup for dummy auth mode (local testing only)
cat > .env << 'EOF'
NODE_ENV=development
SLACK_BOT_TOKEN=xoxb-dummy-token
SLACK_SIGNING_SECRET=dummy-secret
DATABASE_URL=postgresql://$(whoami)@localhost:5432/sms_insights
VITE_API_URL=http://localhost:3000
DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
ALLOW_DUMMY_AUTH_TOKEN=true
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
EOF

# 5. Create local database
createdb sms_insights

# 6. Initialize database schema
npm run prisma:generate
npx prisma db push

# 7. Start development (run in separate terminals)
# Terminal 1 - Backend:
npm run dev

# Terminal 2 - Frontend (in new terminal):
cd ../frontend
npm run dev
```

**Open browser:** http://localhost:5173

> ⚠️ **Note:** The dummy auth mode (`ALLOW_DUMMY_AUTH_TOKEN=true`) bypasses Slack OAuth for local testing. Never use this in production!

---

## 4. Detailed Setup

### 4.1 Repository Structure

```
slack-sms-insights/
├── sms-insights/          # Backend API & Slack bot
├── frontend/              # React dashboard
├── sms-insights-workflow/ # Slack workflow automation
├── docs/                  # Documentation
├── infra/                 # Docker & infrastructure
└── scripts/               # Utility scripts
```

### 4.2 Backend Setup (sms-insights/)

#### Step 1: Install Dependencies

```bash
cd sms-insights
npm install
```

#### Step 2: Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values. Here's a template for local development:

```env
# ==========================================
# Required Core Settings
# ==========================================

NODE_ENV=development
PORT=3000

# Database (Local PostgreSQL)
DATABASE_URL=postgresql://username:password@localhost:5432/sms_insights

# Or use Railway PostgreSQL (recommended for team development)
# DATABASE_URL=postgresql://postgres:password@crossover.proxy.rlwy.net:port/railway

# ==========================================
# Slack App Credentials
# ==========================================

# Get these from https://api.slack.com/apps → Your App → Basic Information / OAuth
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret

# ==========================================
# Dashboard Authentication
# ==========================================

DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
DASHBOARD_OAUTH_USER_SCOPES=users:read

# Set to true for local testing without Slack OAuth
ALLOW_DUMMY_AUTH_TOKEN=false

# ==========================================
# CORS & Security
# ==========================================

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ==========================================
# Optional Integrations
# ==========================================

# OpenAI (for AI drafting)
OPENAI_API_KEY=sk-your-openai-key

# Monday.com (for CRM sync)
MONDAY_API_TOKEN=your-monday-token
MONDAY_SYNC_ENABLED=true
MONDAY_ACQ_BOARD_ID=5077164868

# Aloware (for SMS data)
ALOWARE_API_KEY=your-aloware-key
ALOWARE_ACCOUNT_ID=your-account-id

# HubSpot (for contact enrichment)
HUBSPOT_ACCESS_TOKEN=your-hubspot-token

# Firebase (for realtime features)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY="your-private-key"
```

#### Step 3: Database Setup

**Option A: Local PostgreSQL**

```bash
# Create database
createdb sms_insights

# Verify connection
psql sms_insights -c "SELECT 1"

# Generate Prisma client and push schema
npm run prisma:generate
npx prisma db push
```

**Option B: Railway PostgreSQL (Recommended)**

```bash
# Install Railway CLI
brew install railway

# Login and link project
railway login
railway link

# Get database URL
railway variables | grep DATABASE_PUBLIC_URL

# Copy the DATABASE_PUBLIC_URL to your .env file as DATABASE_URL
# Then generate Prisma client
npm run prisma:generate
npx prisma db push
```

> ⚠️ **Important:** Use `DATABASE_PUBLIC_URL` for local development (connects from your laptop). Use `DATABASE_PRIVATE_URL` for production (connects within Railway's network).

#### Step 4: Verify Backend

```bash
npm run dev
```

You should see:
```
✅ Database connection pool initialized
🌐 HTTP server listening on port 3000
⚡️ Bolt app is running via Socket Mode!
```

Test the health endpoint:
```bash
curl http://localhost:3000/api/health
```

### 4.3 Frontend Setup (frontend/)

#### Step 1: Install Dependencies

```bash
cd frontend
npm install
```

#### Step 2: Environment Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Backend API URL
VITE_API_URL=http://localhost:3000

# UI Version: 'legacy' or 'v2'
VITE_UI_VERSION=legacy
```

#### Step 3: Start Development Server

```bash
npm run dev
```

The Vite dev server will start at `http://localhost:5173`

### 4.4 Slack Workflow Setup (Optional)

For scheduled automation workflows:

```bash
cd sms-insights-workflow

# Install Slack CLI first: https://api.slack.com/automation/quickstart
slack login

# Run locally
slack run

# Create a trigger (first run only)
SMS_REPORT_CHANNEL_ID=C0123456789 slack trigger create \
  --trigger-def triggers/daily_sms_report_scheduled_trigger.ts
```

---

## 5. Integration Configuration

### 5.1 Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app (or use existing)
3. Configure the following:

**Basic Information:**
- Copy **Signing Secret** → `SLACK_SIGNING_SECRET`

**Socket Mode:**
- Enable Socket Mode
- Generate **App-Level Token** (`xapp-...`) → `SLACK_APP_TOKEN`
- Add scopes: `connections:write`, `authorizations:read`

**OAuth & Permissions:**
- Add Bot Token Scopes:
  - `app_mentions:read`
  - `channels:history`
  - `channels:read`
  - `chat:write`
  - `chat:write.public`
  - `groups:history`
  - `groups:read`
  - `im:history`
  - `im:read`
  - `mpim:history`
  - `mpim:read`
  - `users:read`
- Install app to workspace
- Copy **Bot Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`
- Copy **Client ID** and **Client Secret** → `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

**Redirect URLs:**
- Add: `http://localhost:3000/api/oauth/callback` (local)
- Add: `https://your-railway-app.up.railway.app/api/oauth/callback` (production)

### 5.2 Aloware Setup

1. Log in to [Aloware](https://aloware.com)
2. Navigate to **Settings → API**
3. Generate API key → `ALOWARE_API_KEY`
4. Note your Account ID → `ALOWARE_ACCOUNT_ID`

### 5.3 Monday.com Setup

1. Go to [monday.com](https://monday.com) → **Profile → Developers → My Access Tokens**
2. Generate token → `MONDAY_API_TOKEN`
3. Find board IDs from URLs:
   - Acquisition board: `https://your-org.monday.com/boards/5077164868` → `MONDAY_ACQ_BOARD_ID=5077164868`
   - Personal calls board: `MONDAY_MY_CALLS_BOARD_ID=10029059942`
   - Personal tracking board: `MONDAY_PERSONAL_BOARD_ID=10029059942`

### 5.4 HubSpot Setup

1. In HubSpot, go to **Settings → Integrations → Private Apps**
2. Create a private app with scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
3. Copy access token → `HUBSPOT_ACCESS_TOKEN`

### 5.5 OpenAI Setup

1. Go to [platform.openai.com](https://platform.openai.com) → **API Keys**
2. Create new secret key → `OPENAI_API_KEY`

### 5.6 Firebase Setup (Optional)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create/select a project
3. **Project Settings → Service Accounts**
4. Generate new private key
5. Set:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

---

## 6. Development Workflow

### 6.1 Daily Development Commands

```bash
# Terminal 1: Start backend
cd sms-insights
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev

# Terminal 3: (Optional) Slack workflow
cd sms-insights-workflow
slack run
```

### 6.2 Code Quality Checks

```bash
# Backend
cd sms-insights
npm run lint          # Check code style
npm run lint:fix      # Auto-fix issues
npm test              # Run tests

# Frontend
cd frontend
npm run typecheck:v2  # TypeScript check
npx vitest run        # Run tests
```

### 6.3 Database Operations

```bash
cd sms-insights

# Generate Prisma client (after schema changes)
npm run prisma:generate

# Open Prisma Studio (GUI)
npx prisma studio

# Create migration
npx prisma migrate dev --name descriptive_name

# Push schema (development only)
npx prisma db push

# Reset database (⚠️ Destroys data!)
npx prisma migrate reset
```

### 6.4 Utility Scripts

| Command | Purpose |
|---------|---------|
| `npm run backfill:slack` | Backfill SMS events from Slack |
| `npm run backfill:booked-calls` | Backfill call records |
| `npm run backfill:contact-profiles` | Backfill contact profiles |
| `npm run sync:monday` | Sync Monday.com data |
| `npm run regenerate:runs` | Regenerate daily reports |

Run scripts with custom database URL:
```bash
DATABASE_URL="postgresql://..." npx tsx scripts/script-name.ts
```

---

## 7. Database Operations

### 7.1 Connecting to Database

**Local PostgreSQL:**
```bash
psql sms_insights
```

**Railway PostgreSQL:**
```bash
railway db:connect
```

### 7.2 Common Queries

```sql
-- List all tables
\dt

-- Check daily runs
SELECT * FROM daily_runs ORDER BY created_at DESC LIMIT 5;

-- Count records
SELECT COUNT(*) FROM daily_runs;
SELECT COUNT(*) FROM sms_events;

-- Check conversations
SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 5;

-- Clear test data
DELETE FROM daily_runs WHERE report_type = 'test';
```

### 7.3 Prisma Studio

GUI for database management:
```bash
cd sms-insights
npx prisma studio
```

Opens at `http://localhost:5555`

---

## 8. Troubleshooting

### Common Issues

#### "DATABASE_URL not set"
```bash
# Check .env file exists
cat sms-insights/.env | grep DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### "Cannot find module '@slack/web-api'"
```bash
cd sms-insights
rm -rf node_modules
npm install
```

#### "Port 3000 already in use"
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

#### "Frontend can't reach API"
```bash
# Check VITE_API_URL
cat frontend/.env | grep VITE_API_URL

# Should be http://localhost:3000
# Check backend is running
curl http://localhost:3000/api/health
```

#### "OAuth flow fails"
- Verify `DASHBOARD_AUTH_REDIRECT_URI` matches Slack app redirect URLs
- Check `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` are correct
- Ensure `ALLOWED_ORIGINS` includes frontend URL

#### "Prisma schema push fails"
```bash
# Reset and regenerate
cd sms-insights
npx prisma generate
npx prisma db push --force-reset  # ⚠️ Destroys data!
```

#### "Build fails on Vercel"
```bash
# Test build locally first
cd frontend
npm install
npm run build
```

### Getting Help

1. Check [docs/development/IMPROVEMENTS_SUMMARY.md](../development/IMPROVEMENTS_SUMMARY.md) for known issues
2. Review [docs/development/CODE_IMPROVEMENTS.md](../development/CODE_IMPROVEMENTS.md) for code quality tips
3. Open an issue with:
   - Error message
   - Steps to reproduce
   - Environment details (Node version, OS)

---

## 9. Next Steps

### Deployment

Ready to deploy? See:
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Production deployment to Railway + Vercel

### Development

Ready to contribute? See:
- **[CONTRIBUTING.md](../development/CONTRIBUTING.md)** — Development workflow & standards
- **[API.md](../architecture/API.md)** — API documentation

### Learning

- Review [docs/architecture/DASHBOARD_OVERVIEW.md](../architecture/DASHBOARD_OVERVIEW.md) for system details
- Check [docs/planning/ROADMAP.md](../planning/ROADMAP.md) for upcoming features
- Read [AGENTS.md](../../AGENTS.md) for available scripts and tools

---

## 📚 Quick Reference

| Task | Command |
|------|---------|
| Start backend | `cd sms-insights && npm run dev` |
| Start frontend | `cd frontend && npm run dev` |
| Run tests | `cd sms-insights && npm test` |
| Lint code | `cd sms-insights && npm run lint` |
| Database GUI | `cd sms-insights && npx prisma studio` |
| Build production | `cd sms-insights && npm run build` |

---

**Happy coding! 🎉**

For questions or issues, check the documentation or open a GitHub issue.
