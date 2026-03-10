# PTBizSMS Weekly Drift Checklist

Use this checklist weekly (or before any production release) to keep GitHub, Vercel, Railway, and production aligned.

## 1) GitHub
- `main` is the release branch.
- Latest `main` commit matches deployed SHA in Vercel and Railway.
- Main CI is green (frontend build, backend test, secret scan).

## 2) Vercel
- Project name is `sms-insights-dashboard`.
- Production domain is `ptbizsms.com` (and `www.ptbizsms.com` if used).
- Required env vars are present in Production and Preview:
  - `RAILWAY_API_BASE_URL`
- `/api/*` rewrites target the active Railway API service.

## 3) Railway
- API service is healthy and on the same commit SHA as Vercel production.
- No orphan public domains are attached to non-web services.
- Required env vars are set:
  - `DATABASE_URL`
  - `DASHBOARD_PASSWORD`
  - `STREAM_TOKEN_SECRET`
  - `SLACK_BOT_TOKEN`
  - `SLACK_APP_TOKEN`
  - `ALLOWED_ORIGINS`
- Logs show no repeating `invalid_auth` or stream-token errors.

## 4) Production Behavior
- Smoke check script passes:
  - `scripts/ops/production-smoke-check.sh`
- `/api/health` returns `ok: true` and `checks.stream_token_config.status=ok`.
- Realtime stream connects on authenticated dashboard session.

## 5) Slack App
- Manifest redirect URLs include:
  - `https://localhost:3000/api/oauth/callback`
  - `https://ptbizsms.com/api/oauth/callback`
- Commands are present and functional:
  - `/ask`
  - `/sms-report`
  - `/sms-scoreboard`
