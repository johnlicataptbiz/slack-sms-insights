# AGENTS

Operational command reference for this repository.

## Verified Working Directories

- Backend: `sms-insights/`
- Frontend: `frontend/`
- Slack workflow app: `sms-insights-workflow/`

## Local Development

### Backend (`sms-insights`)

```bash
cd sms-insights
npm run dev
```

```bash
cd sms-insights
npm run build
npm start
```

### Frontend (`frontend`)

```bash
cd frontend
npm run dev
```

```bash
cd frontend
npm run build
npm run preview
```

## Build And Quality Checks

```bash
cd sms-insights
npm run lint
npm test
```

```bash
cd frontend
npm run typecheck:v2
```

Note: `npm run build` in `sms-insights` also attempts to build `../frontend` when that directory exists.

## Data And Sync Workflows (Backend)

Run from `sms-insights/`:

```bash
npm run backfill:hubspot
npm run backfill:slack
npm run backfill:booked-calls
npm run sync:monday
npm run regenerate:runs
```

For ad-hoc scripts under `sms-insights/scripts/`:

```bash
DATABASE_URL="<connection_string>" npx tsx scripts/<script-name>.ts
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

```bash
railway up
railway logs --follow
railway db:connect
```

```bash
cd frontend
vercel --prod
```

Note: after env var changes on Railway, prefer `railway up` instead of `railway redeploy`.

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

## CI Status Note

In `.github/workflows/main.yml`, Railway and Vercel deploy steps are currently commented out pending token refresh.
