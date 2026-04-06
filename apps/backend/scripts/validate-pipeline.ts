#!/usr/bin/env node
/**
 * Pipeline Validation Script
 * 
 * Validates that the data ingestion pipeline is working correctly by:
 * 1. Checking database connectivity
 * 2. Verifying SMS events are being ingested
 * 3. Confirming contact profiles are being created
 * 4. Checking conversation projections
 * 5. Validating Monday.com sync status
 * 6. Reporting dashboard metric readiness
 * 
 * Usage: npx tsx scripts/validate-pipeline.ts
 */

import 'dotenv/config';
import { getPrismaClient } from '../src/lib/prisma.js';
import { getPool } from '../services/db.js';
import { getAlowarePollingState } from '../services/aloware-sms-poller.js';
import { listMondaySmsSyncBoardIds } from '../services/monday-sms-sync.js';
import { mondayConfig } from '../services/monday-sync.js';

type CheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown>;
};

const results: CheckResult[] = [];

const check = (name: string, fn: () => Promise<CheckResult>) => {
  return fn().then((r) => {
    results.push(r);
    return r;
  });
};

const formatStatus = (status: string): string => {
  if (status === 'pass') return '✅';
  if (status === 'warn') return '⚠️';
  return '❌';
};

// ─── Checks ──────────────────────────────────────────────────────────────────

await check('Database Connection', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.sms_events.count();
    return {
      name: 'Database Connection',
      status: 'pass',
      message: `Connected. SMS events count: ${count}`,
      details: { smsEventsCount: count },
    };
  } catch (error) {
    return {
      name: 'Database Connection',
      status: 'fail',
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('SMS Events Ingestion', async () => {
  try {
    const prisma = getPrismaClient();
    const totalCount = await prisma.sms_events.count();
    const last24h = await prisma.sms_events.count({
      where: { event_ts: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const last7d = await prisma.sms_events.count({
      where: { event_ts: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });

    const status = totalCount === 0 ? 'warn' : 'pass';
    return {
      name: 'SMS Events Ingestion',
      status,
      message: `Total: ${totalCount}, Last 24h: ${last24h}, Last 7d: ${last7d}`,
      details: { totalCount, last24h, last7d },
    };
  } catch (error) {
    return {
      name: 'SMS Events Ingestion',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Contact Profiles', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.inbox_contact_profiles.count();
    const status = count === 0 ? 'warn' : 'pass';
    return {
      name: 'Contact Profiles',
      status,
      message: `Total contact profiles: ${count}`,
      details: { count },
    };
  } catch (error) {
    return {
      name: 'Contact Profiles',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Conversations', async () => {
  try {
    const prisma = getPrismaClient();
    const totalCount = await prisma.conversations.count();
    const openCount = await prisma.conversations.count({ where: { status: 'open' } });
    const status = totalCount === 0 ? 'warn' : 'pass';
    return {
      name: 'Conversations',
      status,
      message: `Total: ${totalCount}, Open: ${openCount}`,
      details: { totalCount, openCount },
    };
  } catch (error) {
    return {
      name: 'Conversations',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Booked Calls', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.booked_calls.count();
    const status = count === 0 ? 'warn' : 'pass';
    return {
      name: 'Booked Calls',
      status,
      message: `Total booked calls: ${count}`,
      details: { count },
    };
  } catch (error) {
    return {
      name: 'Booked Calls',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Booked Call Attribution', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.booked_call_attribution.count();
    const attributed = await prisma.booked_call_attribution.count({
      where: { setter_final: { not: null } },
    });
    const status = count === 0 ? 'warn' : 'pass';
    return {
      name: 'Booked Call Attribution',
      status,
      message: `Total: ${count}, Attributed: ${attributed}`,
      details: { count, attributed },
    };
  } catch (error) {
    return {
      name: 'Booked Call Attribution',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Aloware Polling Status', async () => {
  const state = getAlowarePollingState();
  const status = state.enabled ? 'pass' : 'warn';
  return {
    name: 'Aloware Polling',
    status,
    message: state.enabled
      ? `Enabled. Ingested: ${state.totalIngested}, Errors: ${state.totalErrors}`
      : 'Disabled. Set ALOWARE_POLLING_ENABLED=true to enable.',
    details: state,
  };
});

await check('Monday.com Sync Status', async () => {
  const mondayEnabled = mondayConfig.syncEnabled;
  const smsSyncBoards = listMondaySmsSyncBoardIds();
  const status = mondayEnabled ? 'pass' : 'warn';
  return {
    name: 'Monday.com Sync',
    status,
    message: mondayEnabled
      ? `Enabled. Boards: ${mondayConfig.acqBoardId}, SMS boards: ${smsSyncBoards.join(', ') || 'none configured'}`
      : 'Disabled. Set MONDAY_SYNC_ENABLED=true to enable.',
    details: {
      mondayEnabled,
      acqBoardId: mondayConfig.acqBoardId,
      smsSyncBoards,
    },
  };
});

await check('Environment Variables', async () => {
  const required = ['DATABASE_URL', 'ALOWARE_API_TOKEN'];
  const optional = [
    'ALOWARE_POLLING_ENABLED',
    'ALOWARE_CHANNEL_ID',
    'MONDAY_API_TOKEN',
    'MONDAY_SYNC_ENABLED',
    'HUBSPOT_ACCESS_TOKEN',
  ];

  const missing = required.filter((key) => !process.env[key]?.trim());
  const configured = optional.filter((key) => process.env[key]?.trim());

  const status = missing.length === 0 ? 'pass' : 'fail';
  return {
    name: 'Environment Variables',
    status,
    message: missing.length === 0
      ? `All required vars present. Optional configured: ${configured.join(', ') || 'none'}`
      : `Missing required: ${missing.join(', ')}`,
    details: { missing, configured },
  };
});

await check('Daily Runs', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.daily_runs.count();
    const last24h = await prisma.daily_runs.count({
      where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const status = count === 0 ? 'warn' : 'pass';
    return {
      name: 'Daily Runs',
      status,
      message: `Total: ${count}, Last 24h: ${last24h}`,
      details: { count, last24h },
    };
  } catch (error) {
    return {
      name: 'Daily Runs',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

await check('Sequence Registry', async () => {
  try {
    const prisma = getPrismaClient();
    const count = await prisma.sequence_registry.count();
    const active = await prisma.sequence_registry.count({ where: { status: 'active' } });
    const status = count === 0 ? 'warn' : 'pass';
    return {
      name: 'Sequence Registry',
      status,
      message: `Total: ${count}, Active: ${active}`,
      details: { count, active },
    };
  } catch (error) {
    return {
      name: 'Sequence Registry',
      status: 'fail',
      message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  PTBiz SMS Insights - Pipeline Validation Report');
console.log('═══════════════════════════════════════════════════════\n');

for (const result of results) {
  console.log(`${formatStatus(result.status)} ${result.name}`);
  console.log(`   ${result.message}`);
  if (result.details) {
    console.log(`   Details: ${JSON.stringify(result.details)}`);
  }
  console.log();
}

const passCount = results.filter((r) => r.status === 'pass').length;
const warnCount = results.filter((r) => r.status === 'warn').length;
const failCount = results.filter((r) => r.status === 'fail').length;

console.log('───────────────────────────────────────────────────────');
console.log(`Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
console.log('───────────────────────────────────────────────────────\n');

if (failCount > 0) {
  console.log('⚠️  Pipeline validation FAILED. Fix the issues above before deploying.');
  process.exit(1);
} else if (warnCount > 0) {
  console.log('⚠️  Pipeline validation passed with warnings. Some features may show zero values.');
  console.log('   This is expected if no SMS events have been ingested yet.');
  process.exit(0);
} else {
  console.log('✅ Pipeline validation PASSED. All systems operational.');
  process.exit(0);
}
