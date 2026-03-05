# AGENTS

Operational command reference for this repository.

## Verified Working Directories

- Backend: `sms-insights/`
- Frontend: `frontend/`
- Slack workflow app: `sms-insights-workflow/`
- Documentation: `docs/`

## Local Development

### Backend (`sms-insights`)

Development server with auto-reload:

```bash
cd sms-insights
npm run dev
```

Production build and start:

```bash
cd sms-insights
npm run build
npm start
```

Watch mode for TypeScript compilation:

```bash
cd sms-insights
npm run build:watch
```

### Frontend (`frontend`)

Development server with hot reload:

```bash
cd frontend
npm run dev
```

Production build:

```bash
cd frontend
npm run build
```

Preview production build locally:

```bash
cd frontend
npm run preview
```

## Build And Quality Checks

### Backend

Run linter with auto-fix:

```bash
cd sms-insights
npm run lint:fix
```

Run linter check only:

```bash
cd sms-insights
npm run lint
```

Run tests:

```bash
cd sms-insights
npm test
```

Generate Prisma client:

```bash
cd sms-insights
npm run prisma:generate
```

### Frontend

TypeScript type checking (v2 codebase):

```bash
cd frontend
npm run typecheck:v2
```

## Data And Sync Workflows (Backend)

Run from `sms-insights/`:

### HubSpot Integration

```bash
cd sms-insights
npm run backfill:hubspot
```

### Slack Integration

```bash
cd sms-insights
npm run backfill:slack
```

### Booked Calls

```bash
cd sms-insights
npm run backfill:booked-calls
```

### Contact Profiles

```bash
cd sms-insights
npm run backfill:contact-profiles
npm run backfill:contact-profiles-lrn
```

### Monday.com Integration

```bash
cd sms-insights
npm run sync:monday
npm run check:monday:lead-normalization
npm run rebuild:monday:governed
```

### Daily Runs

```bash
cd sms-insights
npm run regenerate:runs
```

## Ad-hoc Scripts

For running specific scripts under `sms-insights/scripts/`:

```bash
cd sms-insights
DATABASE_URL="<connection_string>" npx tsx scripts/<script-name>.ts
```

### Commonly Used Scripts

| Script | Purpose |
|--------|---------|
| `apply-all-fixes.ts` | Apply all database fixes |
| `audit-booked-calls.ts` | Audit booked calls data |
| `backfill-daily-runs.ts` | Backfill daily run logs |
| `cleanup-booked-calls-dupes.ts` | Remove duplicate booked calls |
| `export-conversions.ts` | Export conversion data |
| `migrate-data-enhancements.ts` | Run data enhancement migrations |
| `seed-sample-data.ts` | Seed sample data for testing |
| `sync-monday.ts` | Sync data with Monday.com |
| `trigger-historical-reports.ts` | Generate historical reports |
| `verify-sales-metrics.ts` | Verify sales metrics integrity |

### Migration Scripts

```bash
cd sms-insights
npx tsx scripts/run-migrations.ts
npx tsx scripts/migrate-phase2-tables.ts
npx tsx scripts/migrate-phase3-tables.ts
```

## Slack Workflow App (`sms-insights-workflow`)

```bash
cd sms-insights-workflow
slack run
slack deploy
```

Create the deployed daily report trigger (production opt-in):

```bash
SMS_REPORT_USE_PRODUCTION_CHANNEL=true slack trigger create --trigger-def triggers/daily_sms_report_scheduled_trigger.ts -a deployed
```

## Deploy + Ops

### Railway (Backend)

```bash
railway up
railway logs --follow
railway db:connect
```

Note: after env var changes on Railway, prefer `railway up` instead of `railway redeploy`.

### Vercel (Frontend)

```bash
cd frontend
vercel --prod
```

### Quick Deploy Commands

```bash
# Deploy backend only
cd sms-insights && npm run build && railway up

# Deploy frontend only
cd frontend && vercel --prod
```

## Optional Local Background Runtime

From `sms-insights/`:

```bash
pm2 start "npm run dev" --name slack-bot
pm2 status
pm2 logs slack-bot
pm2 restart slack-bot
pm2 stop slack-bot
```

Prevent Mac sleep while running local processes:

```bash
caffeinate -dis
```

## Database Management

### Prisma Commands

```bash
cd sms-insights
npx prisma generate --config prisma.config.ts
npx prisma db push
npx prisma migrate dev
npx prisma studio  # Open GUI for database browsing
```

### Direct Database Connection

```bash
# Connect to Railway production database
railway db:connect

# Connect with psql
psql $DATABASE_URL
```

## Documentation References

- [Architecture Overview](docs/architecture/API.md)
- [Dashboard Overview](docs/architecture/DASHBOARD_OVERVIEW.md)
- [Unified Analytics](docs/architecture/UNIFIED_ANALYTICS.md)
- [Development Guide](docs/development/CONTRIBUTING.md)
- [Code Improvements](docs/development/CODE_IMPROVEMENTS.md)
- [Operations Checklist](docs/operations/DRIFT_CHECKLIST.md)
- [Production Smoke Checks](docs/operations/PRODUCTION_SMOKE_CHECKS.md)
- [Local Dev Setup](docs/setup/LOCAL_DEV.md)
- [Deployment Guide](docs/setup/DEPLOYMENT.md)
- [Onboarding](docs/setup/ONBOARDING.md)
- [Quick Start](docs/setup/QUICK_START.md)

## Key Services Overview

The backend (`sms-insights/`) contains several major service modules:

| Service | Purpose |
|---------|---------|
| `hubspot-sync.ts` | HubSpot CRM synchronization |
| `aloware-*.ts` | Aloware call/SMS integration |
| `inbox-*.ts` | Inbox management and AI drafting |
| `monday-*.ts` | Monday.com integration |
| `booked-calls.ts` | Booked calls tracking |
| `conversation-*.ts` | Conversation projection |
| `daily-report-summary.ts` | Daily reporting |
| `sequence-*.ts` | Sequence management |
| `metrics.ts` | Metrics and telemetry |
| `scheduler.ts` | Task scheduling |

## CI Status Note

In `.github/workflows/main.yml`, Railway and Vercel deploy steps are currently commented out pending token refresh.

## Environment Variables

Key environment variables required for development:

```
DATABASE_URL=<railway-postgres-connection-string>
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
MONDAY_API_KEY=...
HUBSPOT_ACCESS_TOKEN=...
ALOWARE_API_KEY=...
FIREBASE_PROJECT_ID=...
```

See `.env.example` or Railway dashboard for complete variable list.

