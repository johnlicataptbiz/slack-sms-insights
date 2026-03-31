# SMS Insights Backend Fix - Schema Drift & Body Validation

## Completed
- [x] 1. Fix sms-event-store.ts body coercion logic

## Pending
- [ ] 2. Generate Prisma migration for schema.unified.prisma (add is_manual_bucket, fact_sms_daily stub)
- [ ] 3. Add graceful fallbacks to insights-summary.ts, sequences-deep.ts
- [ ] 4. Local test: npm run dev + webhook simulation
- [ ] 5. Deploy to Railway: git push
- [ ] 6. Verify logs + attempt_completion

