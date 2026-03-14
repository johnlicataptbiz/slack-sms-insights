# PT Biz SMS Insights Dashboard

[![Deploy](https://img.shields.io/badge/deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)
[![Backend](https://img.shields.io/badge/backend-Railway-0B0D0E?style=flat-square&logo=railway)](https://railway.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A real-time SMS analytics dashboard for PT Biz, integrated with Slack, Aloware, Monday.com, and HubSpot. Provides daily reports, conversation insights, AI-assisted drafting, and sales metrics for SMS marketing campaigns.

## 🎯 What is this?

PT Biz SMS Insights is a comprehensive analytics platform that:

- **Monitors SMS campaigns** in real-time through Slack integration
- **Generates daily reports** with sales metrics, response rates, and booked calls
- **Tracks conversations** across multiple channels with SLA monitoring
- **Syncs with Monday.com** for lead management and call tracking
- **Provides a modern dashboard** with interactive charts and KPIs

## 🏗️ System Architecture

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
│  │ work_items  │ │booked_calls │ │ sessions    │          │
│  │   (SLA)     │ │   (calls)   │ │ (password)  │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Clone and install
git clone <your-repo-url>
cd slack-sms-insights

# 2. Install dependencies
cd sms-insights && npm install
cd ../frontend && npm install

# 3. Configure environment
cd ../sms-insights
cp .env.example .env
# Edit .env — see docs/setup/ENV_REFERENCE.md

# 4. Start development (run in separate terminals)
cd sms-insights && npm run dev      # Terminal 1: Backend
cd frontend && npm run dev          # Terminal 2: Frontend
```

**Open browser:** http://localhost:5173

📚 **[Full Onboarding Guide →](docs/setup/ONBOARDING.md)**  
📚 **[Quick Start Guide →](docs/setup/QUICK_START.md)**  
📚 **[Local Development →](docs/setup/LOCAL_DEV.md)**

## 📁 Project Structure

```
slack-sms-insights/
├── sms-insights/              # Backend (Node.js/TypeScript)
│   ├── app.ts                 # Entry point, HTTP + Slack bot server
│   ├── api/                   # API routes
│   │   ├── routes.ts          # Route handlers
│   │   └── v2-contract.ts     # Shared API types/contracts
│   ├── listeners/             # Slack event listeners
│   │   ├── events/            # App mention & message handlers
│   │   ├── commands/          # Slash command handlers
│   │   └── actions/           # Interactive component handlers
│   ├── services/              # Business logic layer
│   │   ├── db.ts              # PostgreSQL connection pool
│   │   ├── daily-run-logger.ts # Report logging service
│   │   ├── aloware-analytics.ts # SMS analytics (Aloware)
│   │   ├── monday-sync.ts     # Monday.com CRM sync
│   │   ├── ai-response.ts     # OpenAI-powered AI drafting
│   │   ├── inbox-*.ts         # Inbox management services
│   │   ├── conversation-*.ts  # Conversation projection
│   │   ├── sequence-*.ts      # Sequence management
│   │   └── scheduler.ts       # Cron-style task scheduler
│   ├── prisma/                # Database schema & migrations
│   │   ├── schema.prisma      # Prisma schema (30+ models)
│   │   └── migrations/        # SQL migration history
│   └── scripts/               # Utility & maintenance scripts
│       ├── backfill-*.ts      # Data backfill scripts
│       ├── migrate-*.ts       # Schema migration scripts
│       └── seed-*.ts          # Sample data scripts
│
├── frontend/                  # Frontend (React 19/Vite)
│   ├── src/
│   │   ├── App.tsx            # Root component & routing
│   │   ├── api/               # API client & TanStack Query hooks
│   │   ├── components/        # React components
│   │   │   ├── ui/            # shadcn/ui base components
│   │   │   ├── v2/            # V2 dashboard components
│   │   │   └── insights/      # Legacy dashboard components
│   │   ├── pages/             # Page-level components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Shared utilities
│   └── api/
│       └── stream.ts          # Vercel edge streaming handler
│
├── sms-insights-workflow/     # Slack Workflow App (Deno)
│   ├── manifest.ts            # Slack app manifest
│   ├── functions/             # Custom Slack functions
│   ├── workflows/             # Workflow definitions
│   └── triggers/              # Scheduled/event triggers
│
├── sms-insights-workflow-ref/ # Reference workflow implementation
├── infra/                     # Infrastructure config
│   ├── docker-compose.yml     # Local services
│   └── observability/         # Monitoring stack
├── docs/                      # All documentation
├── railway.toml               # Railway deployment config
└── vercel.json                # Vercel deployment config
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[ONBOARDING.md](docs/setup/ONBOARDING.md)** | Comprehensive setup and development guide |
| **[QUICK_START.md](docs/setup/QUICK_START.md)** | 5-minute quick start |
| **[LOCAL_DEV.md](docs/setup/LOCAL_DEV.md)** | Detailed local development setup |
| **[DEPLOYMENT.md](docs/setup/DEPLOYMENT.md)** | Production deployment guide |
| **[ENV_REFERENCE.md](docs/setup/ENV_REFERENCE.md)** | Complete environment variable reference |
| **[API.md](docs/architecture/API.md)** | API endpoint documentation |
| **[CONTRIBUTING.md](docs/development/CONTRIBUTING.md)** | Development workflow & standards |
| **[DASHBOARD_OVERVIEW.md](docs/architecture/DASHBOARD_OVERVIEW.md)** | System architecture details |

## 🔧 Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend runtime | Node.js 22 + TypeScript 5.9 | API server, Slack bot |
| Slack integration | @slack/bolt v4 | Slack app framework (Socket Mode) |
| ORM | Prisma 7 | Type-safe database access, migrations |
| Database | PostgreSQL 15 | Primary data store (30+ models) |
| Validation | Zod 4 | Runtime schema validation |
| Logging | Pino | Structured JSON logging |
| Linting | Biome | Fast lint + format (replaces ESLint/Prettier) |
| Frontend runtime | React 19 + Vite 7 | Dashboard UI |
| Styling | Tailwind CSS v4 | Utility-first CSS |
| Components | shadcn/ui + Radix UI | Accessible UI primitives |
| Charts | Recharts 3 | Data visualization |
| State | TanStack Query v5 | Server state management & caching |
| Tables | TanStack Table v8 | Headless table logic |
| Animation | Framer Motion | UI transitions |
| AI | OpenAI (via `ai` SDK) | AI-assisted SMS drafting |
| Auth | Slack OAuth 2.0 | Dashboard authentication |
| CRM sync | Monday.com API | Lead management & call tracking |
| SMS platform | Aloware API | SMS campaign data source |
| CRM | HubSpot API | Contact enrichment |
| Realtime | Firebase | Live data sync |
| Workflow | Deno + Slack SDK | Scheduled automation |
| Deployment | Railway + Vercel | Backend hosting + frontend CDN |

## 🎨 Dashboard Features

### V2 Dashboard (Modern)
- **Real-time KPIs** with sparkline trends
- **Interactive charts** (sales trends, response times)
- **Campaign table** with filtering and sorting
- **Dark mode** support
- **Mobile responsive** design
- **Password-based** authentication

### Legacy Dashboard
- Daily runs list with status indicators
- Report detail view
- Channel filtering
- Basic analytics

## 🔐 Authentication

The dashboard uses **Slack OAuth 2.0** for authentication:

1. User clicks "Sign in with Slack" on the dashboard
2. Redirected to Slack OAuth (`GET /api/oauth/start`)
3. Slack redirects back with an auth code (`GET /api/oauth/callback`)
4. Backend exchanges code for a user token and creates a session
5. Frontend verifies session via `GET /api/auth/verify` on each load
6. CSRF tokens are required for protected write operations

> **Local development:** Set `ALLOW_DUMMY_AUTH_TOKEN=true` in `.env` to bypass OAuth and use a static test token.

## 📊 Data Flow

### Report Generation
```
User mentions @Aloware in Slack
    ↓
Slack bot receives mention
    ↓
Generate analytics report
    ↓
Post to Slack thread
    ↓
Log to database (daily_runs)
    ↓
Dashboard polls API
    ↓
Display in real-time
```

### Dashboard Data Flow
```
User visits dashboard
    ↓
Password login
    ↓
Frontend verifies session
    ↓
Fetches /api/runs
    ↓
Backend queries PostgreSQL
    ↓
Returns JSON response
    ↓
React Query caches data
    ↓
Dashboard renders
```

## 🗄️ Database

The project uses **PostgreSQL** via **Prisma ORM**. The schema (`sms-insights/prisma/schema.prisma`) contains 30+ models organized into these domains:

| Domain | Key Tables | Description |
|--------|-----------|-------------|
| Reporting | `daily_runs` | Daily SMS report logs from Slack bot |
| Conversations | `conversations`, `sms_events` | SMS thread tracking & event ingestion |
| Inbox | `work_items`, `inbox_contact_profiles` | Agent inbox & SLA management |
| AI Drafting | `draft_suggestions`, `conversion_examples` | AI-generated reply suggestions |
| Monday.com | `monday_call_snapshots`, `lead_outcomes`, `lead_attribution` | CRM sync tables |
| Analytics | `fact_sms_daily`, `fact_booking_daily`, `fact_lead_quality_daily` | Pre-aggregated metric facts |
| Sequences | `sequence_registry`, `sequence_aliases` | SMS sequence management |
| Booked Calls | `booked_calls`, `booked_call_attribution` | Call booking tracking |

```bash
# Generate Prisma client after schema changes
cd sms-insights
npm run prisma:generate

# Push schema changes to database (dev)
npx prisma db push

# Open Prisma Studio (GUI browser)
npx prisma studio
```

## 🚀 Deployment

### Backend (Railway)
```bash
cd sms-insights
railway login
railway up
```

### Frontend (Vercel)
```bash
cd frontend
vercel --prod
```

### Slack Workflow (Slack Infrastructure)
```bash
cd sms-insights-workflow
slack deploy
```

See [DEPLOYMENT.md](docs/setup/DEPLOYMENT.md) for detailed instructions including environment variable setup.

## 🧪 Development

### Running Tests
```bash
# Backend: build + lint + test suite
cd sms-insights
npm test

# Frontend unit tests (Vitest)
cd frontend
npx vitest run
```

### Code Quality
```bash
# Lint backend (Biome)
cd sms-insights
npm run lint

# Lint + auto-fix
npm run lint:fix

# Type check frontend (v2 tsconfig)
cd frontend
npm run typecheck:v2
```

### Database Operations
```bash
# Connect to Railway database
railway db:connect

# Generate Prisma client
cd sms-insights
npm run prisma:generate

# Run a specific script with a custom DATABASE_URL
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-slack-events.ts
```

## 🐛 Troubleshooting

### Common Issues

**"DATABASE_URL not set"**
- Check `.env` file exists and has DATABASE_URL
- Verify database is accessible

**"Frontend can't reach API"**
- Check `VITE_API_URL` in frontend/.env
- Ensure backend is running on correct port
- Check CORS configuration

**"Password login fails"**
- Verify `DASHBOARD_PASSWORD` is set on the backend
- Check backend logs for rate-limit or session-store errors

See [LOCAL_DEV.md](docs/setup/LOCAL_DEV.md) for more troubleshooting.

## 📈 Monitoring

- **Railway Logs**: `railway logs --follow`
- **Vercel Analytics**: Dashboard → Analytics
- **Database**: Railway dashboard → PostgreSQL

## 🧭 Usage Guide

### Common Local Workflows

**Start backend only**
```bash
cd sms-insights
npm run dev
```

**Start frontend only**
```bash
cd frontend
npm run dev
```

**Build backend + frontend bundle**
```bash
cd sms-insights
npm run build
```

**Frontend production build**
```bash
cd frontend
npm run build
```

**Preview frontend production build locally**
```bash
cd frontend
npm run preview
```

**Run backend lint and tests**
```bash
cd sms-insights
npm run lint
npm test
```

### Data & Sync Scripts (backend)

Run all of the following from `sms-insights/`:

| Command | Purpose |
|---------|---------|
| `npm run backfill:slack` | Backfill SMS events from Slack history |
| `npm run backfill:booked-calls` | Backfill booked call records |
| `npm run backfill:contact-profiles` | Backfill Aloware contact profiles |
| `npm run backfill:contact-profiles-lrn` | Backfill LRN (line type) data |
| `npm run sync:monday` | Sync Monday.com board data |
| `npm run check:monday:lead-normalization` | Audit Monday lead normalization |
| `npm run rebuild:monday:governed` | Rebuild governed Monday analytics |
| `npm run refresh:booked-attribution` | Refresh booked call attribution |
| `npm run regenerate:runs` | Regenerate daily run logs |

### Ad-hoc Scripts

```bash
cd sms-insights
DATABASE_URL="postgresql://..." npx tsx scripts/<script-name>.ts
```

See [AGENTS.md](AGENTS.md) for a full table of available scripts.

## ⚙️ Environment Variables (Quick Reference)

The backend requires a `.env` file in `sms-insights/`. Copy the template:

```bash
cd sms-insights
cp .env.example .env
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-...`) |
| `SLACK_SIGNING_SECRET` | Slack request signing secret |
| `SLACK_CLIENT_ID` | Slack OAuth app client ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth app client secret |
| `OPENAI_API_KEY` | OpenAI API key for AI drafting |
| `DASHBOARD_AUTH_REDIRECT_URI` | OAuth callback URL |
| `DASHBOARD_AUTH_SUCCESS_URL` | Post-login redirect URL |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

**Optional integrations:**

| Variable | Description |
|----------|-------------|
| `MONDAY_API_TOKEN` | Monday.com API token |
| `ALOWARE_API_KEY` | Aloware API key |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app token |
| `FIREBASE_PROJECT_ID` | Firebase project ID |

> See **[docs/setup/ENV_REFERENCE.md](docs/setup/ENV_REFERENCE.md)** for the complete reference with all variables, defaults, and descriptions.

## 🤝 Contributing

Follow [CONTRIBUTING.md](docs/development/CONTRIBUTING.md) for branch strategy, coding standards, and PR workflow.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Slack Bolt](https://slack.dev/bolt-js/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)

---

**Questions?** Check the [documentation](docs/) or open an issue.
