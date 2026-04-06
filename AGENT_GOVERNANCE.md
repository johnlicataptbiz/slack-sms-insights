# AGENT_GOVERNANCE.md

## Purpose
This document governs required use of project skills, MCP servers, and core tools for work in `slack-sms-insights`.

Use this policy with `AGENTS.md`. If there is a conflict, this file is stricter and wins for execution behavior.

## Scope
This policy applies to all agents operating in this repository, including local IDE agents and remote coding agents.

## Inventory (Reviewed 2026-04-04)

### Active MCP servers (project-local config)
Source: `./cline_mcp_settings.json`

1. `github.com/github/github-mcp-server`
2. `github.com/modelcontextprotocol/servers/tree/main/src/filesystem`

### Available but not currently active in project-local MCP config
Observed from `./cline_mcp_settings.json.backup` and local `mcp/` contents.

1. `@modelcontextprotocol/server-sequential-thinking` (previously configured)
2. `mcp-server-git` via `uvx` (previously configured)
3. Local MCP code/vendor directories in `mcp/` including GitHub, Railway, HubSpot, browser-use, mem0, sequentialthinking, and CI enforcer implementations

### Installed skills in this repository
From `.agents/skills/*` and `.skills/skills/*`.

1. `frontend-design`
2. `cicd-debugging`
3. `project-discovery-onboarding`
4. `git-deep-analysis`
5. `project-folder-organizer`
6. `scattered-code-refactor`
7. `multi-deployment-review`
8. `post-rescue-validation`
9. `project-dependency-enhancer`
10. `project-rescue-orchestrator`
11. `project-ui-enhancer`
12. `new-skill` (template; non-production until filled in)

### Core project toolchain
From root and workspace `package.json` files.

1. `npm workspaces` orchestration
2. `Biome` for linting
3. `Vitest` and Node test runner
4. `TypeScript` typecheck
5. `Prisma` migration and client generation
6. `tsx` runtime for backend scripts

## Mandatory Usage Matrix ("When doing X, must use Y")

### Skill usage requirements
1. Frontend UI build, redesign, restyling, or visual polish:
Use `frontend-design` before implementation.
2. Deployment failures, CI failures, release incidents, or rollback work:
Use `cicd-debugging` workflow.
3. New-repo onboarding, messy codebase audit, or "what is going on here" requests:
Use `project-discovery-onboarding`.
4. Explicit full cleanup or rescue requests:
Use `project-rescue-orchestrator`.
5. Folder clutter, structure cleanup, root-level organization:
Use `project-folder-organizer`.
6. Duplication reduction or architecture cleanup:
Use `scattered-code-refactor`.
7. Multi-platform deployment/config audits:
Use `multi-deployment-review`.
8. Dependency modernization or library recommendations:
Use `project-dependency-enhancer` and require explicit user approval before any install.
9. After major refactor/reorg/rescue changes:
Use `post-rescue-validation` before final handoff.
10. Broad git state/risk review:
Use `git-deep-analysis`.

### MCP usage requirements
1. GitHub PR/issues/review/comments/actions tasks:
Use GitHub MCP server first when available; fallback to `gh` CLI only if MCP is unavailable or insufficient.
2. Workspace-wide file inspection requested by user:
Use filesystem MCP when operating through an MCP client; in terminal-native agents, use `rg`/shell equivalents.
3. If a required MCP is not active:
Report the missing server explicitly and either:
activate it if safe and possible, or continue with a documented fallback.

### Tool usage requirements
1. Any frontend code change:
Run `npm run --workspace=ptbizsms-dashboard-unified lint` and `npm run --workspace=ptbizsms-dashboard-unified typecheck`.
2. Any backend code change:
Run `npm run --workspace=ptbizsms-api lint`.
3. Any backend behavior/data-path change:
Run relevant backend tests (at minimum targeted test command for touched area).
4. Any schema or Prisma-affecting change:
Run `npm run --workspace=ptbizsms-api prisma:generate` and verify migration status before shipping.
5. Any cross-workspace refactor:
Run root `npm run lint` and targeted tests for both affected workspaces.

## Enforcement Rules
1. Agents must declare in their final summary:
skills used, MCPs used, and validation commands run.
2. If a required skill/MCP was not used, agents must provide a one-line waiver reason.
3. Agents may not silently skip required validation commands unless blocked; blockers must be reported.
4. "Quick fix" does not waive this policy.

## Minimal Handoff Template
Use this in final responses for implementation tasks.

1. Skills used: `...`
2. MCPs used: `...`
3. Validation run: `...`
4. Waivers (if any): `...`

