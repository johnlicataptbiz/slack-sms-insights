---
name: scattered-code-refactor
description: Analyzes scattered patterns duplication messy architecture and technical debt in development projects and generates practical refactoring and organization plans.
version: 1.0.0
author: Blackbox AI
category: architecture
tags:
  - refactor
  - architecture
  - technical-debt
  - duplication
  - code-organization
---

# Scattered Code Refactor Skill

## Overview

This skill analyzes scattered patterns, duplication, messy architecture, and technical debt across projects, then generates practical, staged refactoring and organization plans with concrete file-level actions.

## Outcomes

- Clear map of structural problems.
- Prioritized refactor opportunities.
- Low-risk phased execution plan.
- Target architecture and migration strategy.

## Instructions

### Step 1: Discover Architecture Surface Area

1. Identify project boundaries and modules:
   - apps/services/packages/libs
   - backend vs frontend vs shared code
2. Collect key architectural files:
   - README, architecture docs, dependency manifests
3. Build an initial component/module map.

### Step 2: Detect Scattered Patterns

Look for these signals:

1. Repeated utility logic across directories.
2. Similar business rules implemented in multiple services.
3. Multiple API clients for same backend.
4. Duplicated validation schemas/types.
5. Repeated constants/config fragments.
6. Circular imports and unstable dependency directions.
7. “God files” (very large multi-responsibility files).

Use `search_files` with targeted regex patterns:
- `TODO|FIXME|HACK|XXX`
- repeated function names/patterns
- duplicate literal strings for statuses/roles/routes

### Step 3: Duplication and Drift Analysis

1. Group duplicate logic by domain:
   - auth
   - analytics
   - data transforms
   - formatting utilities
2. Identify “near duplicates”:
   - same behavior, small naming differences
3. Track drift risks:
   - same concept represented by different enums/types
   - inconsistent API response models

### Step 4: Dependency and Coupling Review

1. Read imports in critical files to map coupling.
2. Identify high fan-in and fan-out files.
3. Flag anti-patterns:
   - UI importing deep infra details
   - routes calling persistence directly without service layer
   - duplicated side-effect code

### Step 5: Technical Debt Scoring

Score issues using:
- **Impact** (user/business/system)
- **Risk** (change breakage)
- **Effort** (S/M/L)
- **Frequency** (how often area changes)

Create priority classes:
- P0: high impact/high risk debt
- P1: high impact/medium risk
- P2: medium impact or strategic cleanup
- P3: polish/long-tail cleanup

### Step 6: Produce Refactor Strategy

For each priority item, define:

1. Problem statement
2. Target design
3. Files to touch
4. Migration steps
5. Test strategy
6. Rollback strategy

Prefer incremental refactors over big-bang rewrites.

### Step 7: Build Practical Execution Plan

Structure in phases:

- **Phase 1: Safe extraction**
  - create shared modules and adapters
- **Phase 2: Replace duplicates**
  - move call sites progressively
- **Phase 3: Enforce boundaries**
  - lint/import rules and folder contracts
- **Phase 4: Cleanup**
  - remove deprecated paths, dead code

Include checkpoints after each phase.

### Step 8: Define Guardrails

1. Add tests before risky moves.
2. Keep backward-compatible interfaces temporarily.
3. Use feature flags for behavior changes if needed.
4. Require CI green after each phase.
5. Avoid simultaneous architecture + feature rewrites.

### Step 9: Output Refactor Report

Output should include:

1. Current-state diagnosis.
2. Duplication matrix.
3. Architecture anti-patterns list.
4. Prioritized refactor backlog.
5. Phase-by-phase implementation plan.
6. Success metrics and definition of done.

## Suggested Report Format

```text
Refactor Assessment Summary
- Projects analyzed: <n>
- Major issues: <n>
- Highest priority: <item>

Key Findings
1) <finding> (Impact/Risk/Effort)

Duplication Matrix
- Domain: <domain>
  - Source A: <path>
  - Source B: <path>
  - Consolidation target: <path>

Refactor Plan
Phase 1 ...
Phase 2 ...
...

Metrics
- Duplicate modules reduced from X to Y
- Shared type coverage from A% to B%
- Build/test stability maintained
```

## Examples

### Example 1: Duplicated Validation and Types

**Observed**
- Separate validation schemas in backend routes and frontend forms.
- Conflicting enum values for status fields.

**Plan**
1. Create `shared/schemas` and `shared/types`.
2. Move canonical schema definitions.
3. Update frontend and backend imports.
4. Keep temporary compatibility mapping.
5. Add contract tests for API payloads.

### Example 2: Scattered Auth Logic

**Observed**
- Token parsing repeated in middleware, route handlers, and utility files.
- Role checks duplicated with inconsistent behavior.

**Plan**
1. Introduce centralized auth service:
   - token parsing
   - permission checks
2. Replace direct logic in route handlers.
3. Add route-level guard wrappers.
4. Remove dead auth helpers.

### Example 3: Messy Frontend Architecture

**Observed**
- Components directly fetching APIs with duplicated error handling.
- Inconsistent state management between pages.

**Plan**
1. Introduce shared data-access layer (`hooks/services`).
2. Normalize API client and error model.
3. Migrate high-traffic pages first.
4. Add lint rules to block direct fetch in components.

## Refactoring Principles

- Prefer composition over copy-paste inheritance.
- Consolidate by domain, not by arbitrary utility dumping.
- Keep module boundaries explicit.
- Introduce abstractions only when duplication is proven.
- Ensure every refactor is measurable.

## Metrics to Track

- Duplicate code hotspots removed.
- Number of source-of-truth models consolidated.
- Reduced cross-layer imports.
- Build/test pass rate during migration.
- Defect rate post-refactor.

## Limitations

- Static analysis cannot capture all runtime coupling.
- Domain intent may require stakeholder confirmation.
- Large migrations may need staged release windows.
