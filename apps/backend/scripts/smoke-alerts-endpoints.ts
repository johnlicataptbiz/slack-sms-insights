/**
 * Smoke test for /api/alerts/* endpoints.
 *
 * Usage:
 *   BACKEND_BASE_URL=https://your-backend.example.com node --import tsx scripts/smoke-alerts-endpoints.ts
 */

type SmokeResult = {
  name: string;
  ok: boolean;
  status: number;
  body: unknown;
};

const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3000')
  .trim()
  .replace(/\/+$/, '');

const toJson = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const runCheck = async (
  name: string,
  path: string,
  init?: RequestInit,
): Promise<SmokeResult> => {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await toJson(res);
  return {
    name,
    ok: res.ok,
    status: res.status,
    body,
  };
};

const main = async (): Promise<void> => {
  console.log(`🔎 Running alerts smoke checks against ${baseUrl}`);

  const checks = await Promise.all([
    runCheck('status', '/api/alerts/status'),
    runCheck('webhook', '/api/alerts/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        checkType: 'health',
        alertTriggered: false,
        metricValue: 1,
        alertMessage: 'Smoke test health check',
        severity: 'info',
        timestamp: new Date().toISOString(),
      }),
    }),
    runCheck('inbox', '/api/alerts/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        critical: 0,
        stale: 1,
        unassigned: 0,
        needsReply: 3,
      }),
    }),
    runCheck('attribution', '/api/alerts/attribution', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lagHours: 2,
        maxBookedCallsTs: new Date().toISOString(),
        maxAttributionTs: new Date().toISOString(),
      }),
    }),
  ]);

  let failures = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`✅ ${check.name}: ${check.status}`);
    } else {
      failures += 1;
      console.error(`❌ ${check.name}: ${check.status}`);
      console.error(check.body);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }

  console.log('✅ Alerts smoke checks passed');
};

main().catch((error) => {
  console.error(
    'alerts smoke check failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
