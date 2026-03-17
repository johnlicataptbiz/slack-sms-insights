---
name: git-deep-analysis
description: Provides in depth git analysis including current branch full status uncommitted staged unstaged untracked changes local branches remote branches and git worktrees.
version: 1.0.0
author: Blackbox AI
category: version-control
tags:
  - git
  - repository-analysis
  - branches
  - worktrees
  - change-tracking
---

# Git Deep Analysis Skill

## Overview

This skill provides in-depth git analysis for one or more repositories. It reports current branch, full status, uncommitted/staged/unstaged/untracked changes, local and remote branches, remotes, recent commit history, and git worktrees.

## Primary Goals

1. Establish an accurate repository state snapshot.
2. Detect risky or inconsistent git states.
3. Expose active parallel work across branches/worktrees.
4. Provide clear actionable recommendations.

## Instructions

### Step 1: Confirm Repository Context

1. Determine whether current directory is a git repository:
   - `git rev-parse --is-inside-work-tree`
2. If not, identify nearby repositories by searching for `.git` directories.
3. Build repository list to analyze.

### Step 2: Gather High-Signal Repository Metadata

For each repository:

1. Repository root:
   - `git rev-parse --show-toplevel`
2. Current branch or detached HEAD state:
   - `git branch --show-current`
   - `git rev-parse --short HEAD`
3. Upstream branch mapping:
   - `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (if available)

### Step 3: Deep Status Inspection

1. Full status:
   - `git status --short --branch`
2. Split changes by type:
   - Staged changes: `git diff --cached --name-status`
   - Unstaged changes: `git diff --name-status`
   - Untracked files: `git ls-files --others --exclude-standard`
3. Optional quantitative summary:
   - `git diff --shortstat`
   - `git diff --cached --shortstat`

### Step 4: Branch Topology Analysis

1. Local branches:
   - `git branch -vv`
2. Remote branches:
   - `git branch -r`
3. All branches:
   - `git branch -a`
4. Ahead/behind analysis:
   - Compare current branch to upstream and mainline where relevant.

### Step 5: Worktree Analysis

1. Enumerate worktrees:
   - `git worktree list --porcelain`
2. For each worktree, extract:
   - Path
   - Associated branch or detached commit
   - Prunable state

### Step 6: Remote and Synchronization Review

1. List remotes:
   - `git remote -v`
2. Fetch freshness check (if allowed):
   - `git fetch --all --prune`
3. Detect stale tracking branches and orphaned refs.

### Step 7: Recent Activity Context

1. Recent commits:
   - `git log --oneline --decorate -n 15`
2. Optional author/activity insight:
   - `git shortlog -sn -n`

### Step 8: Risk Detection Heuristics

Detect and flag:

- Long-lived dirty working tree.
- Large untracked asset sets.
- Detached HEAD.
- Branch without upstream.
- Branch significantly behind main.
- Conflicting parallel changes across worktrees.
- Stale or dead remote references.

### Step 9: Output Structured Report

Produce:

1. Executive summary.
2. Current branch + status health.
3. Changes breakdown:
   - staged / unstaged / untracked.
4. Branch inventory + ahead/behind.
5. Worktree inventory.
6. Risk findings.
7. Recommended next actions (ordered by priority).

## Suggested Output Template

```text
Repository: <name>
Path: <path>
Current: <branch|detached> @ <sha>
Upstream: <upstream|none>

Status:
- Staged: <count/files>
- Unstaged: <count/files>
- Untracked: <count/files>

Branches:
- Local: <n>
- Remote: <n>
- Ahead/Behind: <details>

Worktrees:
- <path> -> <branch/sha>
- ...

Risks:
- [High|Med|Low] <finding>

Actions:
1. <action>
2. <action>
```

## Examples

### Example 1: Single Repository with Dirty State

**Input request**
- “Run deep git analysis on this repo.”

**Representative findings**
- Current branch: `feature/mem0-integration`
- Staged: 2 files
- Unstaged: 5 files
- Untracked: 3 files
- Upstream exists; branch is ahead by 4 commits
- One additional worktree on `bugfix/auth-timeout`

**Recommended actions**
1. Commit staged changes with focused message.
2. Review unstaged edits and split into logical commits.
3. Add/ignore untracked artifacts.
4. Rebase branch before merge if behind main.

### Example 2: Detached HEAD + No Upstream

**Input request**
- “Tell me why this repo feels broken.”

**Representative findings**
- Detached HEAD at `a1b2c3d`
- Local branch `hotfix/session` exists but not checked out
- No upstream tracking for current state
- Untracked patch files present

**Recommended actions**
1. Create or checkout a branch from detached commit.
2. Set upstream tracking.
3. Commit or stash patch files to avoid loss.

### Example 3: Multi-Worktree Active Development

**Input request**
- “Analyze all branches and worktrees.”

**Representative findings**
- Main worktree on `main` clean
- Worktree A on `feature/ui-refresh` dirty
- Worktree B on `feature/scoring-v2` clean and ahead by 8
- Remote has stale branch refs

**Recommended actions**
1. Prune stale remotes.
2. Sync `main`, then rebase active feature branches.
3. Resolve dirty state in UI worktree before cross-branch cherry-picks.

## Best Practices

- Always separate facts from recommendations.
- Use machine-verifiable command output when possible.
- Do not auto-modify state during analysis unless asked.
- Include exact file paths in change summaries.
- Flag destructive-risk commands before suggesting them.

## Limitations

- Analysis accuracy depends on repository accessibility and permissions.
- Remote freshness requires network access.
- Submodule states require separate explicit checks.
