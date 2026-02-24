# Fix: Switch Database Connection from Public to Private Endpoint

## Goal
Remove hardcoded public Railway TCP proxy URLs from scripts and use `process.env.DATABASE_URL`
so the production app can be pointed at the private endpoint (no egress fees).

## Steps

- [x] Audit codebase for hardcoded public URLs and `DATABASE_URL` usage
- [x] Update `sms-insights/scripts/clear-bad-backfill.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Update `sms-insights/scripts/investigate-bookings.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Update `sms-insights/scripts/cleanup-booked-calls-dupes.ts` — replace hardcoded `DATABASE_PUBLIC_URL` with `process.env.DATABASE_URL`
- [x] Rebuild: `cd sms-insights && npm run build`
- [x] Fix `DATABASE_URL` Railway variable via CLI — set to private endpoint `postgres.railway.internal:5432`
- [x] Deploy via `railway up` from repo root — new deployment confirmed: ✅ Database connection pool initialized
