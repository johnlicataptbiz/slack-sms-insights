---
name: project-folder-organizer
description: Scans messy project folder structures identifies clutter scattered files and poor organization then creates and safely applies a clean logical folder plan.
version: 1.0.0
author: Blackbox AI
category: project-organization
tags:
  - folder-cleanup
  - organization
  - clutter-detection
  - automation
  - file-management
---

# Project Folder Organizer

## Overview

This skill scans messy project folder structures, identifies clutter, scattered files, and poor organization, then creates and safely applies a clean logical folder plan. It produces a `PROJECT_FOLDER_PLAN.md` in the project root with the full plan and next steps, and offers to execute safe moves if the user approves.

## When to Use This Skill

- After onboarding to a new or inherited codebase
- When a project has accumulated clutter over time
- After running `project-discovery-onboarding` or `scattered-code-refactor` and scattered patterns are found
- When root directories contain more than 15% non-essential files
- Before major releases or handoffs to clean up the workspace
- On session start as part of an automated hygiene workflow

## Instructions

### Step 1: Enter Full Folder Analysis Mode

Scan the entire workspace recursively. For every directory and file, classify it into one of these categories:

| Category | Description | Examples |
|----------|-------------|---------|
| **Core Source** | Application code, components, routes, services | `src/`, `lib/`, `app/` |
| **Configuration** | Build, lint, deploy, environment configs | `tsconfig.json`, `.env`, `Dockerfile` |
| **Documentation** | READMEs, guides, architecture docs | `README.md`, `docs/` |
| **Assets** | Images, fonts, icons, media | `public/assets/`, `public/icons/` |
| **Tests** | Test files, fixtures, mocks | `__tests__/`, `*.test.ts` |
| **Scripts** | Build scripts, CLI tools, automation | `scripts/`, `bin/` |
| **Dependencies** | Package manager artifacts | `node_modules/`, `.venv/`, `vendor/` |
| **Generated** | Build output, compiled files | `dist/`, `.next/`, `build/` |
| **Clutter** | Temp files, orphaned artifacts, misplaced files | Root-level test scripts, stray screenshots, duplicate files |
| **Unknown** | Files that don't fit any category | Investigate and classify |

### Step 2: Report Current State

Always report the following:

1. **Current folder structure** with a tree view highlighting:
   - ⚠ Scattered files (files outside their logical home)
   - 🔁 Duplicates (same or near-identical files in multiple locations)
   - 🗑 Temp clutter (screenshots, demo files, experiment artifacts at root)
   - ❓ Illogical groupings (files that don't belong in their current directory)

2. **Clutter percentage**: Calculate `(clutter files / total files) × 100` for the root directory and each major subdirectory.

3. **Scatter map**: List files that are in the wrong location with their current path and suggested correct path.

### Step 3: Propose Clean Organization Plan

Create a detailed plan with:

1. **New folders to create** — with purpose and naming rationale
2. **Specific file moves** — source path → destination path with reason
3. **Files to delete** — only obvious artifacts (require user confirmation)
4. **Files to `.gitignore`** — generated or local-only files not yet ignored
5. **Rename suggestions** — inconsistent naming patterns to normalize

Structure the plan as a table:

```
| Action | Source | Destination | Reason |
|--------|--------|-------------|--------|
| MOVE   | /test_mem0_mcp.py | /scripts/mcp-tests/test_mem0_mcp.py | Root clutter → organized test dir |
| CREATE | — | /scripts/mcp-tests/ | Group MCP test scripts |
| IGNORE | .blackbox/ | .gitignore | Local skill configs |
| DELETE | /demo-screenshot.png | — | Temporary artifact (confirm first) |
```

### Step 4: Safety Steps

Before any file operations:

1. **Check git status** — ensure working tree state is known
2. **Recommend git stash or commit** if there are uncommitted changes
3. **Suggest git worktree** for risky reorganizations:
   ```
   git worktree add ../ptbiztools-reorg -b reorg/folder-cleanup
   ```
4. **Create backup manifest** — list all files that will be moved/deleted with their current SHA or modification time
5. **Verify .gitignore** — ensure moves won't accidentally expose or hide files

### Step 5: Generate Prioritized Action List

Organize actions by priority:

**P0 — Immediate (no risk)**
- Create new directories
- Add `.gitignore` entries
- Move obviously misplaced files

**P1 — Low risk (reversible)**
- Move scattered scripts to organized directories
- Consolidate duplicate assets
- Rename files for consistency

**P2 — Medium risk (needs review)**
- Restructure source directories
- Move files that may have import path dependencies
- Delete files (always confirm first)

**P3 — High risk (needs careful planning)**
- Rename directories referenced in configs/imports
- Move files with cross-project dependencies
- Restructure deployment configurations

### Step 6: Generate PROJECT_FOLDER_PLAN.md

Create or update `PROJECT_FOLDER_PLAN.md` in the project root containing:

1. **Analysis timestamp and scope**
2. **Current state summary** with clutter percentage
3. **Full action table** (all moves, creates, deletes, ignores)
4. **Execution checklist** with checkboxes for tracking
5. **Rollback instructions** in case of issues
6. **Post-cleanup verification steps**

### Step 7: Offer to Execute Safe Moves

If the user approves:

1. Execute P0 actions first (directory creation, .gitignore updates)
2. Execute P1 actions (file moves) one batch at a time
3. After each batch, verify:
   - No broken imports
   - Git status is clean (only expected changes)
   - Build still passes (if applicable)
4. Update `PROJECT_FOLDER_PLAN.md` checkboxes as actions complete
5. Commit with descriptive message: `chore: organize project folders — [batch description]`

## Examples

### Example 1: Basic Usage

**User says:**
> "Clean up my messy folders."

**Skill execution:**
1. Scans workspace recursively
2. Finds 12 root-level files that belong elsewhere
3. Identifies 3 duplicate image assets
4. Calculates root clutter at 22%
5. Generates plan with 18 actions
6. Creates `PROJECT_FOLDER_PLAN.md`
7. Asks: "Plan ready. Shall I execute the 8 safe P0/P1 moves now?"

**User approves → Skill executes moves, updates plan checkboxes, commits.**

### Example 2: Automation Triggers

**Trigger:** `project-discovery-onboarding` skill completes and reports:
- 71 untracked files
- Root-level test scripts
- Scattered image assets
- Experiment artifacts at root

**Automatic activation:**
> project-folder-organizer detects the discovery report findings. It automatically enters analysis mode, cross-references the discovery report's "untracked files" and "recommendations" sections, and generates a targeted cleanup plan focused on the specific clutter identified.

**Flow:**
```
project-discovery-onboarding completes
  → Findings include scattered files / clutter > 15%
  → project-folder-organizer auto-activates
  → Generates PROJECT_FOLDER_PLAN.md
  → Presents plan to user
  → Waits for approval before any moves
```

**Trigger from scattered-code-refactor:**
> If scattered-code-refactor identifies duplicated utility files, misplaced modules, or files outside their logical domain, project-folder-organizer activates to handle the physical file reorganization while scattered-code-refactor handles the code-level refactoring.

### Example 3: Chaining and Automation

**User says:**
> "Run full project analysis and cleanup chain."

**Chained execution order:**
```
1. git-deep-analysis
   → Produces git state report (branches, uncommitted changes, worktrees)
   → Identifies safe state for file operations

2. project-discovery-onboarding
   → Discovers all projects, configs, deployments
   → Identifies scattered files and clutter

3. project-folder-organizer
   → Consumes findings from steps 1 and 2
   → Generates cleanup plan
   → If clutter > 15%: auto-proposes plan, waits for approval
   → If clutter ≤ 15%: reports "workspace is clean" with minor suggestions

4. scattered-code-refactor (if needed)
   → Handles code-level consolidation after folders are organized
   → References the new clean folder structure from step 3
```

**Automatic clutter threshold:**
- If root clutter percentage exceeds 15%, the skill automatically generates the full plan and presents it for approval
- If below 15%, it reports the current state and offers optional minor improvements
- The threshold is evaluated per-directory: root, each project subdirectory, and shared directories

**Post-chain commit strategy:**
```
git add -A
git commit -m "chore: project folder reorganization

- Moved N files to organized directories
- Created X new directories
- Added Y .gitignore entries
- Removed Z temporary artifacts

Triggered by: project-discovery-onboarding → project-folder-organizer chain"
```

### Example 4: Advanced Automation — Session-Start Workflow

**User says:**
> "Run automated folder cleanup workflow."

**Blackbox behavior on every session start:**

```
Session starts
  → project-folder-organizer scans workspace (lightweight mode)
  → Compares current state against last PROJECT_FOLDER_PLAN.md
  → If new clutter detected since last scan:
      → Flags: "⚠ 5 new scattered files detected since last cleanup"
      → Shows diff of new clutter
      → If previously approved auto-cleanup rules exist:
          → Applies matching rules automatically (e.g., move *.py test scripts to scripts/)
          → Commits with message: "chore(auto): organize 5 new files per approved rules"
      → If no matching rules:
          → Proposes new actions and waits for approval
  → If workspace is clean:
      → Silent pass, no output
```

**Approved rules file** (`PROJECT_FOLDER_PLAN.md` rules section):
```markdown
## Auto-Cleanup Rules (Approved)
- [x] Move root `test_*.py` → `scripts/mcp-tests/`
- [x] Move root `*.md` summaries → `docs/integration/`
- [x] Move root `demo-*.png` → `docs/screenshots/`
- [ ] Move scattered assets → `ptbiztools-next/public/assets/` (needs review)
```

**Autonomous execution without further prompts:**
- Only applies rules marked `[x]` (user-approved)
- Rules marked `[ ]` always require confirmation
- New file patterns not matching any rule trigger a notification
- All auto-moves are committed individually with descriptive messages
- A daily summary is appended to `PROJECT_FOLDER_PLAN.md`

### Example 5: Real-World Workspace Cleanup

**Scenario:** The current ptbiztools workspace with 71 untracked files.

**Skill would produce:**

```markdown
## Proposed Actions (28 total)

### P0 — Create Directories (4 actions)
| Action | Path | Purpose |
|--------|------|---------|
| CREATE | scripts/mcp-tests/ | MCP integration test scripts |
| CREATE | docs/integration/ | Integration guides and summaries |
| CREATE | docs/screenshots/ | Demo and test screenshots |

### P1 — Move Scattered Files (15 actions)
| Source | Destination | Reason |
|--------|-------------|--------|
| test_mem0_mcp.py | scripts/mcp-tests/ | Root clutter |
| test_mem0_mcp_direct.py | scripts/mcp-tests/ | Root clutter |
| test_mem0_mcp_requests.py | scripts/mcp-tests/ | Root clutter |
| test_playwright_mcp.py | scripts/mcp-tests/ | Root clutter |
| test_playwright_mcp_demo.py | scripts/mcp-tests/ | Root clutter |
| MEM0_IMPLEMENTATION_SUMMARY.md | docs/integration/ | Root clutter |
| MEM0_INTEGRATION_GUIDE.md | docs/integration/ | Root clutter |
| MEM0_MCP_SETUP_SUMMARY.md | docs/integration/ | Root clutter |
| PLAYWRIGHT_MCP_SETUP_SUMMARY.md | docs/integration/ | Root clutter |
| SERVER_TO_SERVER_SETUP.md | docs/integration/ | Root clutter |
| ZOOM_OAUTH_FIX_SUMMARY.md | docs/integration/ | Root clutter |
| ZOOM_WEBHOOK_EVENTS.md | docs/integration/ | Root clutter |
| demo-screenshot.png | docs/screenshots/ | Root clutter |

### P1 — Update .gitignore (3 actions)
| Pattern | Reason |
|---------|--------|
| .blackbox/ | Local Blackbox AI skill configs |
| .venv/ | Python virtual environment |
| *.code-workspace | VS Code workspace files |

### P2 — Review Required (6 actions)
| Item | Notes |
|------|-------|
| Root package.json | Evaluate if needed or merge into workspace config |
| 40+ new image assets | Verify all are used, remove unused |
| .DS_Store | Add to .gitignore if not already |
```

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `project-discovery-onboarding` | Upstream — provides findings that trigger this skill |
| `git-deep-analysis` | Upstream — confirms safe git state before file operations |
| `scattered-code-refactor` | Downstream — handles code consolidation after folder cleanup |
| `multi-deployment-review` | Parallel — ensures deployment configs aren't disrupted by moves |

## Best Practices

1. **Never move files without understanding their import/reference graph**
2. **Always check git status before and after moves**
3. **Commit in small logical batches, not one giant commit**
4. **Update import paths immediately after moving source files**
5. **Run tests after each batch of moves**
6. **Keep PROJECT_FOLDER_PLAN.md updated as the single source of truth**
7. **Prefer creating new directories over deeply nesting**
8. **Use consistent naming: kebab-case for directories, descriptive names**

## Limitations

- Cannot automatically update import paths in source code (use `scattered-code-refactor` for that)
- Cannot determine if an image asset is actually used without build analysis
- File moves in deployment configs may require manual verification
- Auto-cleanup rules only apply to patterns, not semantic understanding
