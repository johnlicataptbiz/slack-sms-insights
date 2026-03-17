---
name: post-rescue-validation
description: Runs comprehensive post rescue checks to verify the project still builds imports work tests pass and no references are broken after folder organization or refactor steps.
version: 1.0.0
author: Blackbox AI
category: validation
tags:
  - validation
  - post-rescue
  - build-check
  - import-verification
  - test-runner
  - health-check
---

# Post Rescue Validation

## Overview

This skill runs comprehensive post-rescue checks to verify the project is fully functional after any folder organization, code refactoring, or deployment configuration changes. It confirms builds succeed, imports resolve, tests pass, configs are intact, and no references are broken. Results are written to `PROJECT_CONTEXT.md` with an overall health score.

## Trigger Keywords

This skill automatically activates when:
- User says "validate after rescue", "check if the project still works"
- User says "run full rescue and validate", "rescue and verify"
- `project-rescue-orchestrator` completes any phase
- `project-folder-organizer` executes file moves
- `scattered-code-refactor` executes code changes
- Any skill reports file moves or import path changes

## When to Use This Skill

- Immediately after `project-rescue-orchestrator` completes
- After `project-folder-organizer` moves files
- After `scattered-code-refactor` applies changes
- Before merging a rescue branch into main
- As a standalone health check at any time
- Before a production deployment following cleanup work

## Instructions

### Step 1: Git State Verification

1. **Confirm clean or expected git state**
   - Run `git status --short`
   - Expected states after rescue:
     - Clean (all changes committed) ✅
     - Staged only (ready to commit) ⚠ — note but continue
     - Unstaged changes ⚠ — warn user
     - Untracked files remaining — note count
   - Run `git log --oneline -3` to confirm rescue commits are present
   - Verify no merge conflicts: `git diff --check`

2. **Check worktree state if applicable**
   - If rescue was run in a worktree, confirm which tree is being validated
   - Run `git worktree list` to orient

### Step 2: Detect Project Types and Build Commands

For each project/sub-project discovered:

1. **Node.js / JavaScript / TypeScript projects**
   - Detect: `package.json` present
   - Read `scripts` section to identify:
     - Build: `npm run build` / `yarn build` / `pnpm build`
     - Type check: `npm run typecheck` / `tsc --noEmit`
     - Lint: `npm run lint`
     - Test: `npm test` / `npm run test` / `vitest` / `jest`

2. **Python projects**
   - Detect: `requirements.txt`, `pyproject.toml`, `setup.py`
   - Build/check: `python -m py_compile` on key files
   - Test: `pytest` / `python -m unittest`

3. **Other project types**
   - Rust: `cargo check`, `cargo test`
   - Go: `go build ./...`, `go test ./...`
   - Java: `mvn compile`, `gradle build`
   - PHP: `composer install`, `php -l`

### Step 3: Run Build Commands

For each detected project, execute build in order:

1. **Install dependencies (if node_modules missing or package.json changed)**
   ```
   npm install  # or yarn / pnpm
   ```

2. **TypeScript type check (fastest signal)**
   ```
   npx tsc --noEmit
   ```
   - Capture all type errors with file paths and line numbers
   - A type error here often signals a broken import path

3. **Full build**
   ```
   npm run build
   ```
   - Capture exit code
   - Capture first 50 lines of error output if failed
   - Note: Next.js, Vite, webpack, etc. — adapt command accordingly

4. **Lint check**
   ```
   npm run lint
   ```
   - Note errors vs warnings
   - Errors block, warnings are informational

**Gate check after Step 3:**
- If build fails → **PAUSE**, report exact errors, offer targeted fixes
- If type errors found → list each broken import with suggested correction
- If lint errors found → list and offer auto-fix where safe

### Step 4: Scan for Broken Import Paths

Perform static analysis to detect broken references:

1. **TypeScript/JavaScript import scan**
   - Search for imports referencing moved paths:
     ```
     search_files for: import.*from ['"]\.\.?/
     ```
   - Cross-reference against actual file locations
   - Flag any import where the target file no longer exists at that path

2. **Relative path audit**
   - Check `require()` calls
   - Check dynamic imports: `import()`
   - Check path aliases in `tsconfig.json` / `jsconfig.json` / `vite.config.ts`

3. **Asset reference check**
   - Scan for hardcoded asset paths in source files
   - Verify referenced images, fonts, and static files exist at declared paths

4. **Config file cross-references**
   - `next.config.ts` / `vite.config.ts` — check `alias`, `resolve`, `publicDir`
   - `tsconfig.json` — check `paths`, `baseUrl`, `rootDir`
   - `package.json` — check `main`, `exports`, `bin` fields

### Step 5: Execute Available Tests

1. **Unit tests**
   ```
   npm test
   # or
   npx vitest run
   # or
   npx jest --passWithNoTests
   ```
   - Capture: total tests, passed, failed, skipped
   - On failure: capture test name, file, and error message

2. **Integration tests (if present)**
   - Detect test directories: `__tests__/`, `tests/`, `test/`, `e2e/`
   - Run if available and not time-prohibitive

3. **Type-level tests**
   - `tsc --noEmit` (already run in Step 3, reference results)

**Gate check after Step 5:**
- If tests fail → **PAUSE**, list failing tests with file locations
- If no tests exist → note "No test suite found" as a recommendation
- If tests pass → ✅ confirm

### Step 6: Verify Key Configs and Environment Files

1. **Environment files**
   - Check `.env`, `.env.local`, `.env.example` exist
   - Verify `.env` is in `.gitignore` (security check)
   - Compare `.env.example` keys against `.env` keys — flag missing vars

2. **Deployment configs**
   - `Dockerfile` — verify `COPY` and `WORKDIR` paths still valid after moves
   - `docker-compose.yml` — verify volume mounts and service paths
   - `vercel.json` — verify `outputDirectory`, `buildCommand`, `installCommand`
   - `railway.json` — verify `build.builder`, `deploy.startCommand`
   - `.github/workflows/*.yml` — verify paths in `working-directory` and `run` steps

3. **Package manager integrity**
   - Verify `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` is present
   - Check for `node_modules` presence (warn if missing, suggest install)

4. **Database/ORM configs (if applicable)**
   - Prisma: verify `schema.prisma` path in `package.json` scripts
   - Sequelize/TypeORM: verify migration paths

### Step 7: Compile Validation Report

Produce a structured validation report:

```
=== Post-Rescue Validation Report ===
Timestamp: [ISO timestamp]
Projects validated: [n]

Git State:
  ✅ Clean / ⚠ [n] unstaged / ⚠ [n] untracked

Build Results:
  [project-name]:
    Install:    ✅ / ❌ [error]
    TypeCheck:  ✅ / ❌ [n errors]
    Build:      ✅ / ❌ [error summary]
    Lint:       ✅ / ⚠ [n warnings] / ❌ [n errors]

Import Scan:
  ✅ No broken imports / ❌ [n] broken references:
    - [file]:[line] → [missing path]

Test Results:
  ✅ [n] passed / ❌ [n] failed / ⚠ No tests found
  Failed tests:
    - [test name] in [file]

Config Verification:
  .env:         ✅ / ⚠ [missing keys]
  Dockerfile:   ✅ / ❌ [broken path]
  vercel.json:  ✅ / ❌ [issue]
  railway.json: ✅ / ❌ [issue]

Overall Health Score: [n]/100

Issues Requiring Attention:
  [CRITICAL] [issue]
  [HIGH]     [issue]
  [MEDIUM]   [issue]

Suggested Fixes:
  1. [fix]
  2. [fix]
```

### Step 8: Update PROJECT_CONTEXT.md

Append a `## Validation Results` section to `PROJECT_CONTEXT.md`:

```markdown
## Validation Results
Validated: [timestamp]

### Build Status
- ptbiztools-backend: ✅ Build passed
- ptbiztools-next: ✅ Build passed

### Test Status
- Backend: 12/12 tests passed
- Frontend: 8/8 tests passed

### Import Integrity
- ✅ No broken imports detected

### Config Integrity
- ✅ All deployment configs valid
- ⚠ .env missing 2 keys vs .env.example

### Health Score
Before rescue: 68/100
After rescue:  84/100
After validation: 84/100 (confirmed)

### Validation Issues
- [MEDIUM] .env missing ZOOM_WEBHOOK_SECRET vs .env.example
```

### Step 9: Handle Failures with Targeted Fixes

If any validation step fails:

1. **Broken import path fix**
   - Identify the old path and new path from the folder organizer log
   - Generate the exact sed/find-replace command:
     ```
     find src -name "*.ts" -exec sed -i 's|../old/path|../new/path|g' {} +
     ```
   - Offer to apply automatically or show for manual review

2. **Build failure fix**
   - Parse error output for file + line
   - Cross-reference with recent file moves
   - Suggest targeted fix

3. **Missing env var fix**
   - List missing keys
   - Offer to add placeholder values to `.env` from `.env.example`

4. **Config path fix**
   - Show exact line in config file
   - Suggest corrected path

5. **Rollback option**
   - If validation fails critically and fixes are unclear:
     ```
     git revert HEAD  # revert rescue commit
     # or
     git stash pop    # restore pre-rescue stash
     ```
   - Always offer rollback as a safe exit

## Examples

### Example 1: Basic Usage

**User says:**
> "Validate after rescue."

**Skill execution:**
```
[1/8] Git state: clean ✅ (rescue commit present)
[2/8] Detected projects: ptbiztools-backend, ptbiztools-next
[3/8] Build check:
      → backend: tsc --noEmit ✅, npm run build ✅
      → frontend: tsc --noEmit ✅, npm run build ✅
[4/8] Import scan: 0 broken imports ✅
[5/8] Tests:
      → backend: 12/12 passed ✅
      → frontend: 8/8 passed ✅
[6/8] Config check:
      → .env: ⚠ missing ZOOM_WEBHOOK_SECRET
      → Dockerfile: ✅
      → vercel.json: ✅
      → railway.json: ✅
[7/8] Validation report compiled
[8/8] PROJECT_CONTEXT.md updated

Health score: 84/100 ✅ (1 medium issue)
Validation PASSED with 1 warning.
```

### Example 2: Automation Triggers

**Trigger: project-rescue-orchestrator completes**
```
project-rescue-orchestrator: Phase 7 complete (PROJECT_CONTEXT.md written)
→ post-rescue-validation auto-activates
→ Runs silently in background
→ Reports: "Validation complete. Build ✅ Tests ✅ Imports ✅ Health: 84/100"
→ Appends results to PROJECT_CONTEXT.md
```

**Trigger: project-folder-organizer moves files**
```
project-folder-organizer: 22 files moved, 6 directories created
→ post-rescue-validation auto-activates (import scan mode)
→ Runs targeted import scan only (skips full build for speed)
→ Reports: "Import scan complete. 0 broken references. ✅"
→ If broken imports found: "3 broken imports detected. Auto-fix? [Y/n]"
```

**Trigger: scattered-code-refactor applies changes**
```
scattered-code-refactor: Phase 1 applied (8 files modified)
→ post-rescue-validation auto-activates (build + test mode)
→ Runs: tsc --noEmit + npm test
→ Reports: "TypeCheck ✅ Tests 12/12 ✅ — refactor is safe to continue"
→ If tests fail: "2 tests failed after refactor. Flagging scattered-code-refactor for rollback."
```

### Example 3: Chaining and Automation

**Full chain with validation:**

```
project-rescue-orchestrator
│
├─ [Steps 1-6] Full rescue chain executes...
│
├─ [Step 7] PROJECT_CONTEXT.md written
│
└─ post-rescue-validation (auto-chained)
    │
    ├─ Git state: clean ✅
    ├─ Build: backend ✅, frontend ✅
    ├─ Imports: 0 broken ✅
    ├─ Tests: 20/20 ✅
    ├─ Configs: 1 warning (.env)
    └─ Health: 84/100 ✅
        │
        └─ PROJECT_CONTEXT.md updated with Validation Results
```

**Validation failure → rollback trigger:**
```
post-rescue-validation detects:
  ❌ 3 broken imports in ptbiztools-next/src/components/
  ❌ Build failed: Cannot find module '../old/path/utils'

→ Auto-flag: project-folder-organizer (source of file moves)
→ Offer options:
  a. Auto-fix imports (generate sed commands, apply with approval)
  b. Rollback folder moves: git revert HEAD~1
  c. Manual fix: show exact broken lines

User selects: "Auto-fix imports"
→ Generates fix commands
→ Applies with approval
→ Re-runs validation
→ Build ✅ — validation passes
→ PROJECT_CONTEXT.md updated: "Validation passed after import fix"
```

### Example 4: Advanced Automation — Full Rescue and Validate

**User says:**
> "Run full rescue and validate."

**Blackbox executes entire chain autonomously:**

```
Full rescue + validation chain activated.

Phase 1: Rescue
→ project-discovery-onboarding ✅
→ git-deep-analysis ✅
→ project-folder-organizer: 22 moves executed ✅
→ scattered-code-refactor: low debt, no changes needed ✅
→ multi-deployment-review: Railway + Vercel ✅
→ PROJECT_CONTEXT.md written ✅

Phase 2: Validation (auto-chained)
→ Git state: clean ✅
→ Backend build: ✅
→ Frontend build: ✅
→ Import scan: 0 broken ✅
→ Tests: 20/20 ✅
→ Configs: ⚠ .env missing 1 key

Phase 3: Final Report
→ PROJECT_CONTEXT.md updated with Validation Results

=== FINAL STATUS ===
Rescue:     COMPLETE ✅
Validation: PASSED ✅ (1 warning)
Health:     68/100 → 84/100

1 item requires attention:
  [MEDIUM] .env missing ZOOM_WEBHOOK_SECRET
  → Add to .env: ZOOM_WEBHOOK_SECRET=<your-secret>

No further prompts needed. All done.
```

### Example 5: Standalone Health Check

**User says:**
> "Check if the project still works."

**Skill runs in standalone mode (no rescue context needed):**

```
Standalone validation mode (no rescue context)

Detecting projects...
→ ptbiztools-backend (Node.js/TypeScript)
→ ptbiztools-next (Next.js/TypeScript)

Running checks...
→ Backend: tsc ✅ build ✅ tests 12/12 ✅
→ Frontend: tsc ✅ build ✅ tests 8/8 ✅
→ Imports: 0 broken ✅
→ .env: ⚠ 1 missing key
→ Dockerfile: ✅
→ vercel.json: ✅

Health Score: 91/100

Project is healthy. 1 minor issue found.
See validation report above for details.
```

## Skill Chain Position

```
project-rescue-orchestrator
├── project-discovery-onboarding
├── git-deep-analysis
├── project-folder-organizer
├── scattered-code-refactor
├── multi-deployment-review
└── post-rescue-validation  ← runs last, validates everything
```

## Validation Checklist

| Check | Command | Pass Condition |
|-------|---------|----------------|
| Git state | `git status --short` | Clean or staged only |
| TypeScript | `tsc --noEmit` | 0 errors |
| Build | `npm run build` | Exit code 0 |
| Lint | `npm run lint` | 0 errors (warnings OK) |
| Tests | `npm test` | All pass |
| Imports | Static scan | 0 broken references |
| .env keys | Key diff | All keys present |
| Dockerfile paths | Path check | All COPY targets exist |
| vercel.json | Path check | outputDirectory exists |
| railway.json | Path check | startCommand valid |

## Health Score Impact

| Validation Result | Score Impact |
|------------------|-------------|
| Build passes | +20 |
| All tests pass | +20 |
| 0 broken imports | +15 |
| TypeCheck clean | +15 |
| Configs valid | +15 |
| .env complete | +10 |
| Git state clean | +5 |

## Limitations

- Cannot validate runtime behavior (only static and build-time checks)
- Cannot test authenticated API endpoints without credentials
- Cannot validate database migrations without a live database connection
- Build times vary — large projects may take several minutes
- Some test suites require environment variables to run
