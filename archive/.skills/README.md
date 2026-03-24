# Blackbox Skill Suite
### Project Rescue & Analysis System

> A complete set of 8 reusable Blackbox AI skills that work together to discover, analyze, organize, refactor, validate, enhance dependencies, and maintain any development project.

---

## Table of Contents

1. [Overview](#overview)
2. [The 8 Skills](#the-8-skills)
3. [Complete Skill List (8 Skills)](#complete-skill-list-8-skills)
4. [How the Skills Work Together](#how-the-skills-work-together)
5. [Safety Rules](#safety-rules)

---

## Overview

This suite supports project rescue, structure cleanup, refactor planning, deployment review, post-rescue validation, and dependency enhancement.

Core flow:

```text
Discover → Analyze Git → Organize Folders → Refactor Code → Review Deployments → Validate → Enhance Dependencies
```

---

## The 8 Skills

- `project-discovery-onboarding`
- `git-deep-analysis`
- `scattered-code-refactor`
- `multi-deployment-review`
- `project-folder-organizer`
- `project-rescue-orchestrator`
- `post-rescue-validation`
- `project-dependency-enhancer`

---

## Complete Skill List (8 Skills)

| Skill Name                    | Short Description                                      | Best Used When                          | Example Trigger Phrase                  |
|-------------------------------|--------------------------------------------------------|-----------------------------------------|-----------------------------------------|
| project-discovery-onboarding  | Full project discovery and analysis                    | New or messy projects                   | "Onboard me" or "Run full rescue"       |
| git-deep-analysis             | Deep git status, branches and worktrees                | Checking git state                      | "Check git status"                      |
| scattered-code-refactor       | Finds duplication and creates refactor plans           | Scattered or messy code                 | "Fix scattered code"                    |
| multi-deployment-review       | Discovers and reviews all deployments & configs        | Multiple envs or deployments            | "Find all deployments"                  |
| project-folder-organizer      | Cleans and organizes messy folder structure            | Root-level clutter                      | "Organize folders"                      |
| project-rescue-orchestrator   | Master skill that chains the entire rescue workflow    | Full project cleanup                    | "Run full rescue workflow"              |
| post-rescue-validation        | Builds, tests and validates after changes              | After any big changes                   | "Validate after rescue"                 |
| project-dependency-enhancer   | Analyzes stack and recommends + installs better libraries | Missing features or low health score   | "Enhance dependencies"                  |

---

## How the Skills Work Together

### Recommended chain

1. `project-discovery-onboarding`
2. `git-deep-analysis`
3. `project-folder-organizer`
4. `scattered-code-refactor`
5. `multi-deployment-review`
6. `post-rescue-validation`
7. `project-dependency-enhancer` (optional but recommended after rescue)

The `project-rescue-orchestrator` can run the core chain automatically.

---

## Safety Rules

- Never install dependencies without explicit approval.
- Never modify production-critical files without separate approval.
- Always keep changes reversible via git commits.
- Always run validation after major project updates.

---

The newest skill `project-dependency-enhancer` is ready to chain after any rescue run or when you say "Enhance dependencies in this project" or "Run full rescue and enhance dependencies".
