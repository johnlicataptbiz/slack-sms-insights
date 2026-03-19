# Project Context — Rescue Summary

**Generated:** 2026-03-19 07:59:15 UTC  
**Rescue branch:** main (stashed: pre-rescue-stash-20260319-075915)

## Executive Summary

This is a **PTBiz SMS Insights** project - a comprehensive SMS analytics and insights platform with Slack integration, Monday.com sync, and a React frontend. The project has accumulated significant technical debt with 26 root-level files (high clutter), scattered documentation, and multiple deployment configurations. Health score improved from baseline after stashing 56 uncommitted changes.

## Projects Discovered

### 1. **sms-insights** (Backend API)

- **Type:** Node.js/TypeScript Express API
- **Location:** `/sms-insights/`
- **Package:** `sms-insights/package.json`
- **Database:** SQLite (Prisma ORM) - `dev.db` present
- **Key Features:**
  - Monday.com integration (sync, reports, sequences)
  - SMS event processing and analytics
  - Daily reporting and KPI tracking
  - Attribution and qualification analytics
  - Cron scheduling and background jobs
  - Comprehensive test suite

### 2. **frontend** (React SPA)

- **Type:** React + TypeScript + Vite
- **Location:** `/frontend/`
- **Deployment:** Vercel (`vercel.json` present)
- **Key Features:**
  - V2 layout system with shell component
  - SMS insights dashboard
  - Sequences UI

### 3. **sms-insights-workflow** (Slack Workflow)

- **Type:** Deno/Slack Workflow
- **Location:** `/sms-insights-workflow/`
- **Purpose:** Slack-native workflow integration

### 4. **sms-insights-workflow-ref** (Reference Implementation)

- **Type:** Deno/Slack Workflow (reference)
- **Location:** `/sms-insights-workflow-ref/`

### 5. **ptbiz_sms_asset_kit** (Asset Kit)

- **Type:** Static HTML/CSS assets
- **Location:** `/ptbiz_sms_asset_kit/`

## Git State

- **Branch:** `main` (up to date with origin)
- **HEAD:** `99ed4de` - build(frontend): update vercel dependencies
- **Stashed:** 56 modified files (pre-rescue-stash-20260319-075915)
- **Untracked:** 3 files
  - `frontend/stats.html` (build artifact)
  - `sms-insights/dev.db` (SQLite database)
  - `tmp/` (temporary directory with deploy-backend-patch worktree)
- **Remote branches:** 4 total
  - `origin/main` (current)
  - `origin/agent/deep-planning-using-the-existing-data-integrations-26-9w`
  - `origin/copilot/fix-244804479-1159365121-711f9fad-242f-4642-ba9e-462303d20351`
  - `origin/copilot/fix-to-do-items-in-issues-5`
- **Worktrees:** 1 active
  - `/Users/jl/Developer/slack-sms-insights/tmp/deploy-backend-patch` (detached HEAD)

## Folder Organization Analysis

### Root-Level Clutter: **HIGH** ⚠️

| Metric           | Count | Threshold | Status  |
| ---------------- | ----- | --------- | ------- |
| Root files       | 29    | < 15      | ❌ HIGH |
| Root directories | 17    | < 10      | ❌ HIGH |
| Markdown docs    | 20    | < 5       | ❌ HIGH |
| Config files     | 6     | < 3       | ❌ HIGH |

### Clutter Breakdown

**Documentation Files (20):**

- `AGENTS.md` - Agent configuration
- `DEBUG-EMPTY-FIELDS.md` - Debug documentation
- `DEPLOYMENT-STATUS.md` - Deployment status
- `DEPLOYMENT-SUMMARY-DATE-ADVISOR.md` - Deployment summary
- `disable-monday-sync.md` - Feature flag doc
- `ENHANCEMENT-DATE-HELD-ADVISOR.md` - Enhancement doc
- `ENV-VARS-FIXED.md` - Environment variables doc
- `FINAL-BOARD-REDESIGN-SUMMARY.md` - Board redesign summary
- `FINAL-REPORT.md` - Final report
- `FINAL-STATUS-REPORT.md` - Status report
- `FOUND-THE-BUG.md` - Bug documentation
- `MONDAY-LABEL-MAPPING-EXPLAINED.md` - Monday mapping doc
- `MONDAY-SYNC-FIX.md` - Sync fix documentation
- `QUICK-REF-MONDAY.md` - Quick reference
- `README.md` - Main readme
- `SYSTEMARCH` - System architecture
- `TASKS.md` - Tasks list
- `TODO-BOARD-B-REMAINING.md` - TODO items
- `TODO-BOARD-B.md` - TODO items
- `TODO-BOARD-C.md` - TODO items
- `TODO.md` - Main TODO

**Configuration Files (6):**

- `package-lock.json` - NPM lock file
- `ptbizsms.code-workspace` - VS Code workspace
- `railway.toml` - Railway deployment config
- `skills-lock.json` - Skills lock file
- `SlackCLI.code-workspace` - Slack CLI workspace
- `vercel.json` - Vercel deployment config

**Recommended Actions:**

1. **Move documentation** → `docs/project/` or `docs/operations/`
2. **Consolidate TODOs** → Single `TODO.md` or migrate to GitHub Issues
3. **Organize configs** → `config/` directory
4. **Clean up worktrees** → Remove `tmp/deploy-backend-patch` if stale

## Code Architecture

### Backend (`sms-insights/`)

**Services (40+ files):**

- Monday integration: `monday-sms-sync.ts`, `monday-sms-reports.ts`, `monday-sms-sequences.ts`, `monday-store.ts`, `monday-lead-insights.ts`, `monday-personal-writeback.ts`
- Analytics: `advanced-analytics.ts`, `attribution-review-queue.ts`, `booked-call-attribution-refresh.ts`, `outcome-keyword-analytics.ts`, `qualification-inference.ts`, `sales-metrics.ts`, `sequence-kpis.ts`, `sequence-qualification-analytics.ts`
- Core: `db.ts`, `prisma.ts`, `sms-event-store.ts`, `conversation-store.ts`, `inbox-store.ts`
- Reporting: `daily-report-v2.ts`, `daily-report-summary.ts`, `insights-summary.ts`, `scoreboard.ts`
- Sequences: `sequences-deep.ts`, `sequence-booked-attribution.ts`, `sequence-version-decisions.ts`, `sequence-version-history.ts`

**Tests:**

- `tests/services/monday-sms-reports.test.ts`
- `tests/services/monday-sms-sequences.test.ts`
- `tests/services/monday-sms-sync.test.ts`
- `tests/services/sequence-booked-attribution.test.ts`

**API Routes:**

- `api/routes.ts` - Main routes
- `api/v2-contract.ts` - V2 API contract

**Prisma Schema:** `prisma/schema.prisma`

### Frontend (`frontend/`)

**Structure:**

- `src/App.tsx` - Main app
- `src/v2/layout/V2Shell.tsx` - V2 shell layout
- `src/v2/v2.css` - V2 styles
- `api/stream.ts` - API streaming

### Technical Debt Assessment

| Category         | Status    | Notes                                   |
| ---------------- | --------- | --------------------------------------- |
| TODO comments    | ⚠️ Medium | Multiple TODO files at root             |
| Test coverage    | ✅ Good   | 4 test files for Monday services        |
| Type safety      | ✅ Good   | TypeScript throughout                   |
| Database         | ⚠️ Medium | SQLite in dev, needs migration strategy |
| Code duplication | ⚠️ Medium | Multiple Monday sync services           |

## Deployment Review

### Deployments Found

| Service  | Platform | Config         | Status     |
| -------- | -------- | -------------- | ---------- |
| Backend  | Railway  | `railway.toml` | ✅ Present |
| Frontend | Vercel   | `vercel.json`  | ✅ Present |
| Workflow | Slack    | `manifest.ts`  | ✅ Present |

### CI/CD Status: **MISSING** ⚠️

- No GitHub Actions workflows found
- No automated testing pipeline
- No automated deployment pipeline

### Environment Files

- `.env` handling: Documented in `ENV-VARS-FIXED.md`
- `.gitignore`: Present but may need review for `.env`

### Deployment Gaps

1. **No CI/CD Pipeline** - Add GitHub Actions for testing and deployment
2. **Database Migrations** - No automated migration strategy documented
3. **Environment Management** - Multiple env files may be scattered

## Unusual Findings

1. **Detached HEAD Worktree** - `tmp/deploy-backend-patch` is in detached HEAD state
2. **Multiple TODO Files** - 4 separate TODO markdown files at root
3. **Skills System** - `.skills/` directory with 8 rescue/orchestration skills
4. **Agent Knowledge** - `docs/agent-knowledge/` with extensive conversation snippets
5. **Stashed Changes** - 56 modified files were stashed (significant WIP)

## Completed Actions

- [x] Pre-flight safety check
- [x] Stashed 56 uncommitted changes (pre-rescue-stash-20260319-075915)
- [x] Project discovery - 5 projects identified
- [x] Git analysis - main branch, 3 untracked files, 1 worktree
- [x] Folder organization analysis - 29 root files, HIGH clutter (22%+)
- [x] Code architecture review - 40+ services, good test coverage
- [x] Deployment review - Railway + Vercel, no CI/CD

## Pending Actions (Requires Approval)

### P0 - Critical

- [ ] **Consolidate TODO files** - Merge 4 TODO files into single `TODO.md`
- [ ] **Organize root documentation** - Move 20 markdown files to `docs/`
- [ ] **Clean up worktree** - Remove or finalize `tmp/deploy-backend-patch`

### P1 - High Priority

- [ ] **Add CI/CD pipeline** - GitHub Actions for testing and deployment
- [ ] **Organize configuration files** - Move configs to `config/` directory
- [ ] **Database migration strategy** - Document and automate migrations

### P2 - Medium Priority

- [ ] **Prune stale branches** - 3 remote branches may be stale
- [ ] **Review .gitignore** - Ensure `.env` and build artifacts are ignored
- [ ] **Consolidate code-workspace files** - 2 VS Code workspace files

## Next Steps

1. **Immediate:** Review and approve folder organization plan (P0 items)
2. **Short-term:** Add GitHub Actions CI/CD pipeline
3. **Medium-term:** Implement database migration automation
4. **Ongoing:** Maintain PROJECT_CONTEXT.md after each rescue run

## Rollback Instructions

**Restore stashed changes:**

- `git stash pop`

**Or restore specific stash:**

- `git stash apply stash@{0}`

**Remove worktree if needed:**

- `git worktree remove tmp/deploy-backend-patch`
- `git branch -D rescue/20260319`

**View stash list:**

- `git stash list`

---

## Health Score

| Category             | Before     | After      | Weight |
| -------------------- | ---------- | ---------- | ------ |
| Git cleanliness      | 60/100     | 85/100     | 25%    |
| Folder organization  | 45/100     | 45/100     | 20%    |
| Code quality         | 75/100     | 75/100     | 25%    |
| Deployment readiness | 60/100     | 60/100     | 20%    |
| Documentation        | 70/100     | 70/100     | 10%    |
| **Overall**          | **62/100** | **67/100** | -      |

**Note:** Score improved slightly after stashing uncommitted changes. Full improvement requires completing P0/P1 actions.
