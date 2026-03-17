---
name: project-rescue-orchestrator
description: Intelligently runs the full scattered project rescue workflow by chaining project-discovery-onboarding, git-deep-analysis, project-folder-organizer, scattered-code-refactor and multi-deployment-review in the optimal order with safety checks.
version: 1.0.0
author: Blackbox AI
category: orchestration
tags:
  - orchestration
  - rescue
  - cleanup
  - chaining
  - automation
  - full-workflow
---

# Project Rescue Orchestrator

## Overview

This is the master orchestration skill that intelligently chains all project analysis and cleanup skills in the optimal order with safety checks at every stage. It runs the full scattered project rescue workflow: discovery → git analysis → folder organization → code refactor → deployment review. It produces a `PROJECT_CONTEXT.md` file with the complete rescue summary and next steps.

## Trigger Keywords

This skill automatically activates when the user says any of:
- "rescue", "rescue this project", "run full rescue"
- "cleanup", "clean up this mess", "fix this mess"
- "onboard and organize", "analyze and clean"
- "scattered codebase", "messy project"
- "enable full auto rescue mode", "run complete project cleanup"
- Opens a new or unfamiliar workspace for the first time

## When to Use This Skill

- Taking over a new or inherited codebase
- Returning to a project after a long absence
- Before a major release or handoff
- When a project has accumulated significant technical debt
- When multiple issues are present simultaneously (clutter + code debt + deployment inconsistencies)
- As a periodic project health check (monthly/quarterly)

## Instructions

### Step 1: Pre-Flight Safety Check

Before running any analysis or making any changes:

1. **Verify git repository state**
   - Check if the directory is a git repository
   - If not, warn the user and offer to initialize one before proceeding
   - If yes, note the current branch and HEAD commit

2. **Check for uncommitted changes**
   - Run `git status --short`
   - If uncommitted changes exist:
     - **PAUSE** and inform the user
     - Offer options:
       a. Stash changes: `git stash push -m "pre-rescue-stash"`
       b. Commit changes: `git commit -am "wip: pre-rescue checkpoint"`
       c. Continue read-only (analysis only, no file moves)
     - Wait for user decision before proceeding

3. **Create rescue worktree (recommended for risky workspaces)**
   ```
   git worktree add ../[project-name]-rescue -b rescue/[date]
   ```
   - Offer this as an option for large or complex reorganizations
   - Proceed in the worktree to keep main branch clean

4. **Record baseline state**
   - Capture `git log --oneline -5` as baseline
   - Note total file count: `find . -not -path "*/node_modules/*" -not -path "*/.git/*" -type f | wc -l`
   - Note root-level file count for clutter baseline

### Step 2: Run project-discovery-onboarding

**Purpose:** Understand what projects exist, their state, and overall landscape.

Execute the `project-discovery-onboarding` skill and collect:
- List of all projects/sub-projects discovered
- Technology stacks identified
- Deployment configurations found
- Documentation status
- Initial technical debt signals

**Gate check after Step 2:**
- If no git repository found → warn and offer to initialize
- If multiple disconnected repositories found → note for separate handling
- If project appears to be a monorepo → adjust subsequent steps accordingly

### Step 3: Run git-deep-analysis

**Purpose:** Get precise git state before any file operations.

Execute the `git-deep-analysis` skill and collect:
- Current branch and upstream status
- Staged / unstaged / untracked file breakdown
- All local and remote branches
- Worktree inventory
- Recent commit history
- Risk flags (detached HEAD, stale branches, large untracked sets)

**Gate check after Step 3:**
- If detached HEAD → **PAUSE**, require user to checkout a branch before proceeding
- If branch is significantly behind remote → recommend pull/rebase before file operations
- If large number of untracked files (>50) → flag for folder organizer priority
- If stale branches exist → add to cleanup recommendations

### Step 4: Run project-folder-organizer

**Purpose:** Clean up physical folder structure before code-level refactoring.

Execute the `project-folder-organizer` skill with context from Steps 2 and 3:
- Pass the discovery findings as context
- Pass the git state (untracked files list) as input
- Generate the folder cleanup plan

**Gate check after Step 4:**
- If clutter percentage > 15% → **PAUSE**, present plan, require approval before moves
- If clutter percentage ≤ 15% → note findings, continue without blocking
- If any moves would affect import paths → flag for Step 5 (scattered-code-refactor)
- Execute approved P0/P1 moves, commit: `chore: organize project folders [rescue phase 1]`

### Step 5: Run scattered-code-refactor

**Purpose:** Analyze and plan code-level consolidation after folders are clean.

Execute the `scattered-code-refactor` skill with context from all previous steps:
- Reference the new clean folder structure from Step 4
- Identify duplicated logic, scattered patterns, architectural debt
- Generate phased refactor plan

**Gate check after Step 5:**
- If refactor scope is large (>20 files affected) → present phased plan, require approval per phase
- If refactor involves import path changes → ensure tests pass after each batch
- If no significant code debt found → note "code architecture is healthy" and continue

### Step 6: Run multi-deployment-review

**Purpose:** Ensure deployment configurations are consistent and complete.

Execute the `multi-deployment-review` skill with context from all previous steps:
- Review all deployment configs found in Step 2
- Check environment file completeness
- Identify CI/CD gaps
- Verify deployment consistency across environments

**Gate check after Step 6:**
- If missing CI/CD pipeline → add to recommendations with template suggestion
- If environment files are inconsistent → flag as high priority
- If deployment configs reference moved files (from Step 4) → update configs

### Step 7: Compile PROJECT_CONTEXT.md

Create or update `PROJECT_CONTEXT.md` in the project root with the complete rescue summary:

```markdown
# Project Context — Rescue Summary
Generated: [timestamp]
Rescue branch: [branch or worktree]

## Executive Summary
[2-3 sentence overview of what was found and what was done]

## Projects Discovered
[From project-discovery-onboarding]

## Git State
[From git-deep-analysis]

## Folder Organization
[From project-folder-organizer — what was moved, what remains]

## Code Architecture
[From scattered-code-refactor — findings and plan]

## Deployment Review
[From multi-deployment-review — configs, gaps, recommendations]

## Unusual Findings
[Anything unexpected or requiring special attention]

## Completed Actions
- [x] Pre-flight safety check
- [x] project-discovery-onboarding
- [x] git-deep-analysis
- [x] project-folder-organizer
- [x] scattered-code-refactor
- [x] multi-deployment-review

## Pending Actions (Requires Approval)
- [ ] [action 1]
- [ ] [action 2]

## Next Steps
1. [Highest priority action]
2. [Second priority]
3. [Third priority]

## Rollback Instructions
git stash pop  # if stash was used
# or
git worktree remove ../[project-name]-rescue
git branch -D rescue/[date]
```

### Step 8: Final Summary and Handoff

Present a concise final summary to the user:

1. **What was analyzed** — scope of the rescue
2. **What was found** — key issues discovered
3. **What was done** — actions taken (with git commit hashes)
4. **What remains** — pending approvals and next steps
5. **Health score** — overall project health before and after rescue

## Examples

### Example 1: Basic Usage

**User says:**
> "Run full rescue on this project."

**Orchestrator execution:**
```
[1/6] Pre-flight: git status clean ✓ — proceeding
[2/6] project-discovery-onboarding: 2 projects found (backend + frontend)
[3/6] git-deep-analysis: main branch, 10 unstaged, 71 untracked ⚠
      → Pausing: 71 untracked files detected. Approve folder cleanup plan? [Y/n]
[4/6] project-folder-organizer: 28 actions planned, 8 P0/P1 approved and executed
      → Committed: chore: organize project folders [rescue phase 1]
[5/6] scattered-code-refactor: 1 TODO found, auth logic clean, low debt ✓
[6/6] multi-deployment-review: Railway + Vercel configs found, no CI/CD ⚠
      → Recommendation: Add GitHub Actions pipeline

PROJECT_CONTEXT.md created ✓

Rescue complete. Health: 72/100 → 89/100
```

### Example 2: Automation Triggers

**Trigger: User opens a new workspace**

When Blackbox detects a workspace it hasn't seen before (no `PROJECT_CONTEXT.md` exists):
```
New workspace detected: /Users/dev/client-project
→ project-rescue-orchestrator auto-activates in read-only mode
→ Runs Steps 2-3 (discovery + git analysis) silently
→ Presents: "New workspace analyzed. Found 3 projects, 2 deployment configs,
   47 untracked files. Run full rescue? [Y/n]"
→ If Y: proceeds with full chain
→ If N: saves discovery report only
```

**Trigger: User says "fix this mess"**
```
Keyword "mess" detected
→ project-rescue-orchestrator activates immediately
→ Asks: "Running full project rescue. Proceed? [Y/n]"
→ Executes full chain on approval
```

**Trigger: Another skill detects high clutter**
```
project-discovery-onboarding completes
→ Reports: 71 untracked files, clutter > 15%
→ project-rescue-orchestrator auto-activates
→ Skips Steps 2-3 (already done by discovery)
→ Continues from Step 4 (folder organizer)
```

### Example 3: Chaining and Automation

**Full chain execution with decision points:**

```
project-rescue-orchestrator starts
│
├─ [STEP 1] Pre-flight safety check
│   ├─ git status: 10 unstaged files
│   ├─ PAUSE: "Uncommitted changes found. Stash, commit, or continue read-only?"
│   ├─ User: "stash"
│   └─ git stash push -m "pre-rescue-stash" ✓
│
├─ [STEP 2] project-discovery-onboarding
│   ├─ Found: ptbiztools-backend (Express/Railway)
│   ├─ Found: ptbiztools-next (Next.js/Vercel)
│   ├─ Found: .venv (Python environment)
│   └─ Deployment: Railway + Vercel, no CI/CD
│
├─ [STEP 3] git-deep-analysis
│   ├─ Branch: main (up to date with origin)
│   ├─ Untracked: 71 files
│   ├─ Stale branches: 2 (blackboxai/deploy-104, codex/restore-backend)
│   └─ Risk: HIGH untracked count
│
├─ [STEP 4] project-folder-organizer
│   ├─ Clutter: 22% (exceeds 15% threshold)
│   ├─ PAUSE: "28 actions planned. Review and approve?"
│   ├─ User approves P0/P1 (22 actions)
│   ├─ Executes moves, creates dirs
│   └─ Commits: "chore: organize project folders [rescue phase 1]"
│
├─ [STEP 5] scattered-code-refactor
│   ├─ 1 TODO found (route.js:17)
│   ├─ Auth logic: clean
│   ├─ Duplicate patterns: none significant
│   └─ Verdict: Low debt, no blocking refactor needed
│
├─ [STEP 6] multi-deployment-review
│   ├─ Backend: Railway (Docker) ✓
│   ├─ Frontend: Vercel ✓
│   ├─ CI/CD: MISSING ⚠
│   ├─ Env files: present but .env not in .gitignore ⚠
│   └─ Recommendation: Add GitHub Actions + fix .gitignore
│
└─ [STEP 7] PROJECT_CONTEXT.md created
    └─ git stash pop (restore original changes)

Final health score: 68/100 → 84/100
Time elapsed: ~4 minutes
```

**Chaining with uncommitted changes and heavy clutter:**
```
If uncommitted changes found:
  → Offer stash/commit/read-only
  → Wait for approval

If clutter > 15%:
  → Auto-generate folder plan
  → PAUSE for approval before any moves
  → Execute only approved actions

If code debt is high (>20 files affected):
  → Generate phased refactor plan
  → Present Phase 1 only
  → Wait for approval before Phase 2

If deployment configs are broken:
  → Flag as CRITICAL
  → Do not auto-fix deployment configs
  → Always require manual review
```

### Example 4: Advanced Automation — Full Auto Rescue Mode

**User says:**
> "Enable full auto rescue mode"

**Blackbox behavior:**

```
Full auto rescue mode activated.

Phase 1: Analysis (no changes)
→ Running all analysis skills silently...
→ Discovery complete: 2 projects, 71 untracked, 10 unstaged
→ Git analysis complete: main branch, 2 stale branches
→ Folder analysis complete: 22% clutter, 28 actions planned
→ Code analysis complete: low debt
→ Deployment analysis complete: missing CI/CD

Phase 2: Safe auto-execution (pre-approved categories only)
→ Creating directories: scripts/mcp-tests/, docs/integration/, docs/screenshots/
→ Moving root test scripts → scripts/mcp-tests/ (5 files)
→ Moving root markdown summaries → docs/integration/ (8 files)
→ Updating .gitignore: .blackbox/, .venv/, *.code-workspace
→ Committing: "chore(auto): rescue phase 1 — folder organization"

Phase 3: Requires approval (presenting for review)
→ 6 actions require manual review:
  1. Root package.json — evaluate or merge
  2. 40+ image assets — verify usage
  3. Stale branches — prune?
  4. Add GitHub Actions CI/CD pipeline?
  5. Fix .env in .gitignore?
  6. Refactor route.js:17 TODO?

PROJECT_CONTEXT.md created with full summary.

Auto rescue complete. 22 actions executed automatically.
6 actions pending your review (see PROJECT_CONTEXT.md).
Health score: 68/100 → 84/100
```

**Rules for auto-execution (no prompts):**
- ✅ Create new directories
- ✅ Move root-level test scripts to `scripts/`
- ✅ Move root-level markdown summaries to `docs/`
- ✅ Add safe `.gitignore` entries
- ✅ Prune stale remote tracking refs
- ❌ Never auto-delete files
- ❌ Never auto-modify deployment configs
- ❌ Never auto-move source code files
- ❌ Never auto-commit unstaged changes
- ❌ Never auto-merge or rebase branches

### Example 5: Periodic Health Check Mode

**User says:**
> "Run monthly project health check"

**Orchestrator runs in diff mode:**
```
Comparing against last rescue: PROJECT_CONTEXT.md (2 weeks ago)

Changes since last rescue:
+ 12 new untracked files (mostly assets)
+ 3 new TODO comments added
+ 1 new deployment config (staging environment)
~ 2 stale branches still not pruned

Health score: 84/100 → 81/100 (slight regression)

Recommended actions:
1. Commit or organize 12 new untracked files
2. Review 3 new TODOs
3. Prune 2 stale branches
4. Document new staging environment config

Run mini-rescue for these items? [Y/n]
```

## Skill Chain Map

```
project-rescue-orchestrator
├── project-discovery-onboarding  (Step 2)
├── git-deep-analysis              (Step 3)
├── project-folder-organizer       (Step 4)
├── scattered-code-refactor        (Step 5)
└── multi-deployment-review        (Step 6)
```

## Safety Guarantees

| Scenario | Behavior |
|----------|----------|
| Uncommitted changes | Always pause and ask before proceeding |
| Clutter > 15% | Always pause and show plan before moves |
| Deployment config changes | Never auto-apply, always require review |
| Source code moves | Always check import paths, require approval |
| File deletions | Never auto-delete, always require explicit confirmation |
| Detached HEAD | Block all file operations until resolved |
| No git repository | Warn and offer to initialize before proceeding |

## Output Files

| File | Purpose |
|------|---------|
| `PROJECT_CONTEXT.md` | Master rescue summary, updated after each run |
| `PROJECT_FOLDER_PLAN.md` | Folder organization plan (from project-folder-organizer) |
| `PROJECT_DISCOVERY_REPORT.md` | Discovery findings (from project-discovery-onboarding) |

## Health Score Calculation

| Category | Weight | Signals |
|----------|--------|---------|
| Git cleanliness | 25% | Uncommitted changes, stale branches, untracked files |
| Folder organization | 20% | Clutter percentage, logical grouping |
| Code quality | 25% | TODO count, duplication, architectural debt |
| Deployment readiness | 20% | CI/CD presence, env file completeness, config consistency |
| Documentation | 10% | README quality, architecture docs, inline comments |

## Limitations

- Cannot resolve merge conflicts automatically
- Cannot update import paths in source code without explicit approval
- Cannot access private CI/CD pipeline status
- Cannot assess runtime performance or production issues
- Deployment config fixes always require manual review
- Health score is heuristic-based, not a guarantee of code quality
