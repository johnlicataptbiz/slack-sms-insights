# PTBizSMS Production Smoke Checks

## Quick Run

```bash
./scripts/ops/production-smoke-check.sh
```

Optional custom base URL:

```bash
./scripts/ops/production-smoke-check.sh https://ptbizsms.com
```

## What It Verifies
- `/` returns `200`
- `/v2/insights` returns `200`
- `/api/health` returns `200`
- `/api/auth/verify` returns `401` for unauthenticated request

## Manual Realtime Verification
1. Open dashboard and authenticate with password.
2. Confirm `/api/stream-token` returns `200` in browser network tools.
3. Confirm `EventSource` stream is established on `/api/stream?token=...`.
4. Confirm no repeated reconnect loop in browser console.
