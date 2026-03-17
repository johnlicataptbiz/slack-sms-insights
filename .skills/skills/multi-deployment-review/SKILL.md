---
name: multi-deployment-review
description: Discovers and reviews multiple deployment configurations environment files CI/CD pipelines and different project variants within the workspace.
version: 1.0.0
author: Blackbox AI
category: devops
tags:
  - deployment
  - cicd
  - environment-management
  - infrastructure
  - release-process
---

# Multi Deployment Review Skill

## Overview

This skill discovers and reviews multiple deployment configurations, environment files, CI/CD pipelines, and project variants within a workspace. It identifies inconsistencies, risks, and gaps, then provides a unified improvement plan.

## What This Skill Audits

- Deployment platforms (Vercel, Railway, Render, Docker, Kubernetes, etc.)
- Environment file strategy (`.env*`)
- CI/CD workflows and branching policies
- Build/test/deploy scripts
- Variant projects (staging/prod forks, legacy/new versions)
- Secrets handling and configuration hygiene

## Instructions

### Step 1: Discover Deployment Artifacts

Scan workspace for:

1. Platform configs:
   - `vercel.json`, `railway.json`, `render.yaml`, `fly.toml`, `netlify.toml`
2. Containerization:
   - `Dockerfile`, `docker-compose.yml`, `.dockerignore`
3. Orchestration:
   - `k8s/`, `helm/`, `charts/`, `*.yaml` deployment manifests
4. CI/CD:
   - `.github/workflows/*.yml`
   - `.gitlab-ci.yml`
   - `azure-pipelines.yml`
   - `Jenkinsfile`
5. Infra as code:
   - Terraform/Pulumi/CloudFormation markers

### Step 2: Map Projects to Deployment Targets

For each project:

1. Identify app/service name and runtime.
2. Map detected deployment configurations to project.
3. Note environment targets:
   - local
   - development
   - staging
   - production

### Step 3: Environment File and Config Review

1. Discover `.env`, `.env.local`, `.env.development`, `.env.production`, etc.
2. Check consistency:
   - Required variables present across environments
   - Naming conventions aligned
3. Detect risk patterns:
   - Secrets accidentally committed
   - Placeholder vs real values
   - Drift between frontend/backend expectations

### Step 4: CI/CD Pipeline Quality Assessment

For each pipeline:

1. Trigger strategy:
   - push, pull_request, manual, tag-based
2. Job stages:
   - lint, test, build, deploy
3. Environment promotion flow:
   - dev -> staging -> prod
4. Deployment safety checks:
   - approvals, branch protection, rollback
5. Artifact/versioning strategy:
   - immutable tags, build metadata

### Step 5: Variant and Fork Detection

Identify multiple variants:

- Legacy/new app versions.
- Parallel deployment configs for same service.
- Region-specific variants.
- Tenant/client-specific deployments.

Assess whether variants are intentional or accidental drift.

### Step 6: Risk and Drift Analysis

Flag:

1. Inconsistent runtime versions across deploy targets.
2. Missing test gates before deploy.
3. Prod deploys from non-protected branches.
4. Different environment variable names for same concept.
5. Hardcoded endpoints or secrets.
6. Missing rollback or health checks.
7. Duplicate/incompatible deployment pipelines.

### Step 7: Consolidation Recommendations

Provide:

1. Canonical deployment architecture.
2. Standard environment variable contract.
3. Unified CI/CD template strategy.
4. Secret management policy recommendations.
5. Rollback and incident-response improvements.

### Step 8: Prioritized Action Plan

Create roadmap:

- **Immediate (P0)**: security and production safety fixes.
- **Short-term (P1)**: consistency and reliability upgrades.
- **Mid-term (P2)**: consolidation and automation quality.
- **Long-term (P3)**: optimization and governance.

### Step 9: Final Deliverable

Produce a structured report with:

1. Deployment inventory matrix.
2. Environment variable consistency findings.
3. CI/CD pipeline audit summary.
4. Drift/risk register.
5. Prioritized implementation plan.

## Deployment Inventory Matrix (Template)

```text
Project | Runtime | Deploy Targets | CI/CD File | Env Files | Risks
------- | ------- | -------------- | ---------- | --------- | -----
api     | Node18  | Railway, Docker| ci-api.yml | .env,.env.prod | missing rollback
web     | Next.js | Vercel         | ci-web.yml | .env.local     | inconsistent API URL var
```

## Examples

### Example 1: Backend + Frontend Split Deployments

**Observed**
- Backend uses Railway with `railway.json`.
- Frontend uses Vercel with `vercel.json`.
- CI present for backend only.
- Different env names for backend URL:
  - `API_BASE_URL` in web
  - `BACKEND_URL` in scripts

**Recommendations**
1. Standardize on `API_BASE_URL`.
2. Add frontend CI with lint/test/build gates.
3. Enforce branch protection before production deploys.

### Example 2: Docker + Platform Drift

**Observed**
- Dockerfile uses Node 20.
- Platform runtime pinned to Node 18.
- Build passes locally, fails in cloud.

**Recommendations**
1. Align runtime versions across Docker and platform.
2. Add CI check to assert runtime parity.
3. Introduce version policy in docs.

### Example 3: Multiple Environment Files with Missing Keys

**Observed**
- `.env.production` missing critical auth variables.
- `.env.staging` has outdated DB variable names.
- Secrets leaked in committed `.env`.

**Recommendations**
1. Rotate leaked secrets immediately.
2. Add `.env.example` as canonical contract.
3. Add startup validation for required env keys.
4. Add secret scanning in CI.

## Best Practices

- Keep deployment config close to code ownership boundaries.
- Use immutable artifacts/tags for release traceability.
- Ensure production deploys require approvals.
- Centralize environment variable schema.
- Treat rollback strategy as mandatory, not optional.
- Keep CI/CD definitions DRY with reusable templates.

## Success Metrics

- Zero secret leaks in repository scans.
- 100% services with CI lint/test/build gates.
- Consistent env contract across all environments.
- Reduced deployment failures from config drift.
- Documented and tested rollback path for each service.

## Limitations

- Static file review cannot verify external platform dashboards.
- Secret validity cannot be confirmed without external access.
- Runtime behavior still needs post-deploy observability checks.
