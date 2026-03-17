---
name: project-discovery-onboarding
description: Performs comprehensive discovery and analysis of scattered active development projects. Special focus on git state uncommitted changes branches worktrees unknown folders multiple deployments and technical debt assessment.
version: 1.0.0
author: Blackbox AI
category: development-workflow
tags:
  - project-discovery
  - git-analysis
  - codebase-assessment
  - technical-debt
  - onboarding
---

# Project Discovery & Onboarding Skill

## Overview

This skill performs comprehensive discovery and analysis of scattered active development projects. It systematically explores the workspace to identify projects, assess their state, and provide detailed insights about git status, uncommitted changes, branches, worktrees, unknown folders, multiple deployments, and technical debt.

## When to Use This Skill

Use this skill when:
- Onboarding to a new or unfamiliar codebase
- Need to understand the current state of scattered projects
- Assessing technical debt across multiple projects
- Identifying active development branches and worktrees
- Reviewing deployment configurations
- Preparing for project consolidation or refactoring
- Understanding the overall project landscape

## Instructions

### Step 1: Initial Workspace Exploration

1. **List all directories and files in the workspace**
   - Use `list_files` with recursive listing to understand the overall structure
   - Identify potential project directories (look for package.json, requirements.txt, pom.xml, etc.)
   - Note any unusual or unknown folders

2. **Identify project roots**
   - Search for common project markers:
     - `package.json` (Node.js/JavaScript)
     - `requirements.txt` or `pyproject.toml` (Python)
     - `pom.xml` or `build.gradle` (Java)
     - `Cargo.toml` (Rust)
     - `go.mod` (Go)
     - `Gemfile` (Ruby)
     - `composer.json` (PHP)
   - Document each discovered project with its path and type

### Step 2: Git Repository Analysis

For each git repository found:

1. **Check git status**
   - Run `git status` to identify:
     - Current branch
     - Uncommitted changes (modified, added, deleted files)
     - Untracked files
     - Staged changes

2. **List all branches**
   - Run `git branch -a` to show:
     - Local branches
     - Remote tracking branches
   - Identify active development branches

3. **Check for worktrees**
   - Run `git worktree list` to identify:
     - Multiple working trees
     - Their locations and associated branches

4. **Examine recent commits**
   - Run `git log --oneline -10` to understand recent activity
   - Check commit messages for context

5. **Identify remote repositories**
   - Run `git remote -v` to see:
     - Remote URLs
     - Multiple remotes if present

### Step 3: Project Configuration Analysis

For each project:

1. **Analyze configuration files**
   - Read `package.json`, `requirements.txt`, etc.
   - Identify:
     - Dependencies and their versions
     - Scripts and build commands
     - Project metadata

2. **Check for environment files**
   - Look for `.env`, `.env.local`, `.env.*` files
   - Identify environment-specific configurations
   - Note any sensitive data patterns

3. **Examine deployment configurations**
   - Search for deployment-related files:
     - `Dockerfile`, `docker-compose.yml`
     - `k8s/`, `kubernetes/` directories
     - `.github/workflows/` (GitHub Actions)
     - `.gitlab-ci.yml` (GitLab CI)
     - `vercel.json`, `netlify.toml`
     - `railway.json`, `render.yaml`

### Step 4: Technical Debt Assessment

1. **Code quality indicators**
   - Look for:
     - TODO/FIXME/HACK comments (use `search_files`)
     - Deprecated code patterns
     - Duplicate code structures
     - Large files or complex functions

2. **Dependency analysis**
   - Check for:
     - Outdated dependencies
     - Security vulnerabilities
     - Unnecessary dependencies
     - Version conflicts

3. **Documentation status**
   - Assess:
     - README files presence and quality
     - API documentation
     - Code comments
     - Architecture documentation

### Step 5: Active Development Assessment

1. **Identify active work**
   - Recent commits and branches
   - Uncommitted changes
   - Open issues or PRs (if accessible)
   - Development branches with recent activity

2. **Check for experimental features**
   - Feature branches
   - Experimental directories
   - Prototype code
   - Worktrees for parallel development

### Step 6: Multi-Deployment Review

1. **Identify deployment targets**
   - List all deployment configurations found
   - Map projects to their deployment targets
   - Note environment-specific setups

2. **Check for deployment inconsistencies**
   - Different versions across environments
   - Missing environment configurations
   - Inconsistent deployment strategies

### Step 7: Compile Comprehensive Report

Create a detailed report including:

1. **Project Inventory**
   - List all discovered projects with:
     - Project name and type
     - Path location
     - Primary technology stack
     - Git repository status

2. **Git State Summary**
   - For each repository:
     - Current branch and status
     - Uncommitted changes (count and type)
     - Active branches
     - Worktrees (if any)
     - Remote repositories

3. **Technical Debt Findings**
   - Identified issues by category
   - Severity assessment
   - Recommended actions

4. **Deployment Overview**
   - All deployment configurations
   - Environment mappings
   - Noted inconsistencies

5. **Active Development Status**
   - Projects with ongoing work
   - Branches in development
   - Recent activity summary

6. **Recommendations**
   - Prioritized action items
   - Consolidation opportunities
   - Risk areas to address

## Examples

### Example 1: Simple Monorepo Discovery

**User Request:**
```
Discover and analyze the projects in this workspace
```

**Skill Execution:**
1. List files recursively
2. Identify root `package.json` indicating monorepo
3. Check git status: clean, on `main` branch
4. List branches: `main`, `feature/auth`, `bugfix/payment`
5. No worktrees found
6. Analyze package.json: workspaces configuration
7. Identify sub-projects in `packages/` directory
8. Check for deployment: `.github/workflows/` found
9. Search for TODO comments: 15 found across codebase
10. Generate comprehensive report

**Output Report:**
```
=== Project Discovery Report ===

Projects Found:
1. Monorepo Root
   - Type: Node.js/TypeScript
   - Path: /workspace
   - Stack: Node.js, TypeScript, React
   - Git Status: Clean on main branch

Sub-projects:
- packages/frontend (React app)
- packages/backend (Express API)
- packages/shared (Common utilities)

Git State:
- Current Branch: main
- Active Branches: main, feature/auth, bugfix/payment
- Uncommitted Changes: None
- Worktrees: None

Technical Debt:
- 15 TODO comments found
- 3 outdated dependencies identified
- Missing API documentation

Deployment:
- GitHub Actions configured
- Environments: dev, staging, production
- No inconsistencies found

Recommendations:
1. Update outdated dependencies (Priority: High)
2. Complete API documentation (Priority: Medium)
3. Review TODO comments for action items (Priority: Low)
```

### Example 2: Scattered Multi-Project Workspace

**User Request:**
```
Analyze this workspace with multiple scattered projects
```

**Skill Execution:**
1. List files: finds 3 separate git repositories
2. Analyze each repository independently

**Repository 1: `api-service/`**
- Git: Dirty, 5 modified files, 2 new files
- Branch: `feature/user-auth`
- Remote: origin (GitHub)
- Worktrees: None

**Repository 2: `frontend-app/`**
- Git: Clean, on `main`
- Branch: `main`, `dev`, `feature/dashboard`
- Remote: origin, upstream (GitLab)
- Worktrees: 2 worktrees found

**Repository 3: `legacy-code/`**
- Not a git repository
- Old PHP codebase
- No package manager files

3. Check deployment configurations:
   - `api-service/`: Dockerfile, railway.json
   - `frontend-app/`: vercel.json
   - `legacy-code/`: No deployment config

4. Technical debt assessment:
   - 47 TODO comments across projects
   - Duplicate authentication logic in api and frontend
   - Legacy code has security issues

**Output Report:**
```
=== Multi-Project Discovery Report ===

Repositories Found: 3

1. api-service/
   - Type: Node.js API
   - Git Status: Dirty (5 modified, 2 new)
   - Current Branch: feature/user-auth
   - Active Branches: main, feature/user-auth
   - Remote: GitHub
   - Deployment: Docker, Railway

2. frontend-app/
   - Type: React Application
   - Git Status: Clean
   - Current Branch: main
   - Active Branches: main, dev, feature/dashboard
   - Remotes: GitHub (origin), GitLab (upstream)
   - Worktrees: 2 (feature/dashboard, experimental/ui)
   - Deployment: Vercel

3. legacy-code/
   - Type: Legacy PHP
   - Git Status: Not a git repository
   - Deployment: None configured

Technical Debt Summary:
- 47 TODO comments total
- Duplicate auth logic (api-service + frontend-app)
- Legacy security vulnerabilities
- Inconsistent coding standards

Deployment Inconsistencies:
- api-service: Docker + Railway
- frontend-app: Vercel
- legacy-code: No deployment
- No unified CI/CD strategy

Recommendations:
1. Consolidate authentication logic (Priority: High)
2. Add legacy-code to git (Priority: High)
3. Implement unified CI/CD (Priority: Medium)
4. Address security vulnerabilities (Priority: High)
5. Standardize coding conventions (Priority: Low)
```

### Example 3: Worktree Analysis

**User Request:**
```
Check for git worktrees and analyze their state
```

**Skill Execution:**
1. Run `git worktree list`
2. Found 3 worktrees:
   - `/workspace` (main branch)
   - `/workspace-worktree-feature-a` (feature/a branch)
   - `/workspace-worktree-bugfix` (bugfix/critical branch)

3. Analyze each worktree:
   - Check git status in each
   - Identify uncommitted changes
   - Check branch status vs main

**Output Report:**
```
=== Git Worktree Analysis ===

Worktrees Found: 3

1. Main Worktree: /workspace
   - Branch: main
   - Status: Clean
   - Last Commit: 2 hours ago

2. Feature Worktree: /workspace-worktree-feature-a
   - Branch: feature/a
   - Status: Dirty (3 modified files)
   - Last Commit: 1 day ago
   - Behind main by 5 commits

3. Bugfix Worktree: /workspace-worktree-bugfix
   - Branch: bugfix/critical
   - Status: Clean
   - Last Commit: 3 hours ago
   - Ahead of main by 2 commits

Recommendations:
1. Commit or stash changes in feature/a worktree
2. Rebase feature/a onto main (5 commits behind)
3. Merge bugfix/critical into main (ready to merge)
4. Consider cleaning up completed worktrees
```

## Best Practices

1. **Always start with a clean workspace exploration** before diving into specifics
2. **Document everything** as you discover it - don't rely on memory
3. **Prioritize findings** by impact and urgency
4. **Be thorough but efficient** - focus on actionable insights
5. **Provide context** for findings, not just raw data
6. **Suggest concrete next steps** based on discoveries
7. **Handle errors gracefully** - some operations may fail in non-git directories
8. **Respect sensitive data** - don't expose API keys or secrets in reports

## Common Patterns to Recognize

- **Monorepo**: Single git repo with multiple projects in subdirectories
- **Polyrepo**: Multiple independent git repositories
