# Inbox V2 + CI Recovery TODO

## Completed This Pass
- [x] Audit recent commits, workflow runs, and failing GitHub Actions logs
- [x] Reproduce frontend failure locally with `npm run typecheck:v2`
- [x] Reproduce backend failure locally with `npm run build`
- [x] Identify scheduled report workflow env failure (`DATABASE_PUBLIC_URL` secret missing)

## Frontend (Highest Priority)
- [x] Fix `frontend/src/v2/pages/InboxV2.tsx` missing symbol errors (state/setter refs)
- [x] Fix action type mismatch in `frontend/src/v2/components/MessageThreadModernized.tsx`
- [x] Fix hook/data typing regressions in:
  - `frontend/src/v2/hooks/useInboxMessages.ts`
  - `frontend/src/v2/hooks/useInboxSubscription.ts`
- [x] Remove/resolve unused imports/variables causing TS6133 failures
- [x] Re-run `cd frontend && npm run typecheck:v2`
- [x] Re-run `cd frontend && npm run build`

## Backend
- [x] Fix `sms-insights/services/inbox-send.ts` type mismatch (`object` assigned to `string`)
- [x] Resolve Prisma model field mismatch in `sms-insights/src/services/ui-state-manager.ts` (`uiState` vs generated client field)
- [x] Fix missing module paths in:
  - `sms-insights/src/ui/components/PersonalizedDashboard.ts`
  - `sms-insights/src/webhooks/aloware.ts`
- [x] Re-run `cd sms-insights && npm run build`
- [ ] Fix broken/missing imports and typings in `sms-insights/src/middleware/security.ts` (still pending hardening pass)

## Workflow/Secrets
- [ ] Set repo secret `DATABASE_PUBLIC_URL` (or change workflow to tolerate missing DB URL)
- [ ] Re-run `Generate Live Database Report` workflow and verify success
- [x] Add workflow guard to skip live report generation when DB secret is missing

## Follow-up Hygiene
- [ ] Reduce duplicate CI overlap between `.github/workflows/main.yml` and `.github/workflows/ci-cd.yml`
- [ ] Address Node 20 GitHub Actions deprecation warning before June 2, 2026
