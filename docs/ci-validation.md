# CI Pipeline Validation

This file triggers a test run of the fixed CI/CD pipeline.

## What this validates

- Node.js 22 used for both backend and frontend test jobs
- Backend: `npm run lint` + `npm test` (no nonexistent scripts)
- Frontend: `npm run typecheck:v2` + `npm run build`
- Both deploy jobs gate on **both** test jobs passing (not just their own)
