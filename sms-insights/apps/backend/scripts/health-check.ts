/**
 * Production health check script for V2 API endpoints.
 * Run periodically to monitor endpoint health and alert on failures.
 *
 * Usage:
 *   npx tsx scripts/health-check.ts          # Single run
 *   npx tsx scripts/health-check.ts --watch   # Run every 5 minutes
 */

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

interface EndpointCheck {
  name: string;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  error?: string;
}

const ENDPOINTS = [
  { name: 'insights/summary', path: '/api/v2/insights/summary?range=7d' },
  { name: 'inbox/conversations', path: '/api/v2/inbox/conversations' },
  { name: 'inbox/send-config', path: '/api/v2/inbox/send-config' },
  { name: 'inbox/templates', path: '/api/v2/inbox/templates' },
  { name: 'runs', path: '/api/v2/runs?daysBack=7' },
  { name: 'channels', path: '/api/v2/channels' },
  { name: 'sequences/deep', path: '/api/v2/sequences/deep?range=30d' },
  { name: 'sequences/funnel', path: '/api/v2/sequences/funnel?range=30d' },
  { name: 'sequences/qualification', path: '/api/v2/sequences/qualification?range=30d' },
  { name: 'attribution/health', path: '/api/v2/attribution/health' },
  { name: 'attribution/methods', path: '/api/v2/attribution/methods?range=30d' },
  { name: 'attribution/review-queue', path: '/api/v2/attribution/review-queue' },
  { name: 'attribution/unresolved', path: '/api/v2/attribution/unresolved' },
  { name: 'reps/response', path: '/api/v2/reps/response?range=7d' },
] as const;

async function checkEndpoint(endpoint: (typeof ENDPOINTS)[number]): Promise<EndpointCheck> {
  const url = `${BASE_URL}${endpoint.path}`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;

    return {
      name: endpoint.name,
      path: endpoint.path,
      status: response.status,
      ok: response.status === 200,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    return {
      name: endpoint.name,
      path: endpoint.path,
      status: 0,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatResults(results: EndpointCheck[]): string {
  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const slow = results.filter((r) => r.durationMs > 1000);

  const lines: string[] = [
    '',
    `=== V2 API Health Check — ${new Date().toISOString()} ===`,
    `Base URL: ${BASE_URL}`,
    `Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length} | Slow (>1s): ${slow.length}`,
    '',
  ];

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const slowTag = r.durationMs > 1000 ? ' 🐌' : '';
    const statusStr = r.status > 0 ? `${r.status}` : 'ERR';
    lines.push(`${icon} ${r.name.padEnd(30)} ${statusStr.padStart(4)}  ${r.durationMs}ms${slowTag}${r.error ? ` — ${r.error}` : ''}`);
  }

  if (failed.length > 0) {
    lines.push('', '⚠️  FAILED ENDPOINTS:');
    for (const f of failed) {
      lines.push(`   - ${f.name}: ${f.error || `HTTP ${f.status}`}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export async function runHealthCheck(): Promise<EndpointCheck[]> {
  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
  console.log(formatResults(results));
  return results;
}

// CLI entry point
if (process.argv[1]?.endsWith('health-check.ts')) {
  const isWatch = process.argv.includes('--watch');

  if (isWatch) {
    console.log('Starting health check monitor (every 5 minutes)...');
    void runHealthCheck();
    setInterval(runHealthCheck, 5 * 60 * 1000);
  } else {
    void runHealthCheck().then((results) => {
      const failed = results.filter((r) => !r.ok);
      process.exit(failed.length > 0 ? 1 : 0);
    });
  }
}
