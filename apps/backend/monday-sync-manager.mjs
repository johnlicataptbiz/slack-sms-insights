import { queryBoardColumns } from './services/monday-client.ts';
import {
  createManualMondayBookedCall,
  syncRecentSetterBookedCallsToMonday,
} from './services/monday-personal-writeback.ts';
import { getMondayColumnMapping } from './services/monday-store.ts';
import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  title: (text) => console.log(`\n${colors.bright}${colors.cyan}${text}${colors.reset}`),
  success: (text) => console.log(`${colors.green}✓${colors.reset} ${text}`),
  error: (text) => console.log(`${colors.red}✗${colors.reset} ${text}`),
  info: (text) => console.log(`${colors.blue}ℹ${colors.reset} ${text}`),
  warn: (text) => console.log(`${colors.yellow}⚠${colors.reset} ${text}`),
  data: (text) => console.log(`  ${text}`),
};

/**
 * Show current Monday.com board configuration
 */
async function showBoardConfig() {
  log.title('📋 MONDAY.COM BOARD CONFIGURATION');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }

  log.info(`Board ID: ${boardId}`);
  log.info(`Board URL: https://physical-therapy-biz.monday.com/boards/${boardId}`);

  // Get board columns
  const columns = await queryBoardColumns(boardId);
  log.success(`Found ${columns.length} columns on board`);

  log.data('\nBoard Columns:');
  columns.forEach((col, idx) => {
    log.data(`  ${idx + 1}. ${col.title.padEnd(30)} [${col.id}] (${col.type})`);
  });

  // Get current mapping
  const mapping = await getMondayColumnMapping(boardId);
  log.data('\nCurrent Column Mapping:');
  if (mapping) {
    Object.entries(mapping).forEach(([key, value]) => {
      if (value) {
        const col = columns.find((c) => c.id === value);
        log.data(`  ${key.padEnd(30)} → ${col?.title || value} [${value}]`);
      }
    });
  } else {
    log.warn('No column mapping found in database');
  }

  // Check environment override
  const envOverride = process.env.MONDAY_PERSONAL_COLUMN_MAP_JSON;
  if (envOverride) {
    log.data('\nEnvironment Override:');
    try {
      const parsed = JSON.parse(envOverride);
      Object.entries(parsed).forEach(([key, value]) => {
        log.data(`  ${key.padEnd(30)} → ${value}`);
      });
    } catch (e) {
      log.error('Failed to parse MONDAY_PERSONAL_COLUMN_MAP_JSON');
    }
  }
}

/**
 * Check pending booked calls that need to be synced
 */
async function checkPendingCalls() {
  log.title('📞 PENDING BOOKED CALLS TO SYNC');

  const lookbackDays = Number.parseInt(process.env.MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS || '14', 10);
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Get booked calls from the lookback period
  const bookedCalls = await prisma.booked_calls.findMany({
    where: {
      event_ts: { gte: from },
    },
    orderBy: { event_ts: 'desc' },
    take: 50,
  });

  log.info(`Found ${bookedCalls.length} booked calls in last ${lookbackDays} days`);

  // Check which ones have been pushed
  const pushStatuses = await prisma.monday_booked_call_pushes.findMany({
    where: {
      slack_channel_id: { in: bookedCalls.map((c) => c.slack_channel_id) },
      slack_message_ts: { in: bookedCalls.map((c) => c.slack_message_ts) },
    },
  });

  const pushedMap = new Map(pushStatuses.map((p) => [`${p.slack_channel_id}:${p.slack_message_ts}`, p]));

  const pending = [];
  const synced = [];
  const errors = [];

  bookedCalls.forEach((call) => {
    const key = `${call.slack_channel_id}:${call.slack_message_ts}`;
    const status = pushedMap.get(key);

    if (!status) {
      pending.push(call);
    } else if (status.status === 'synced') {
      synced.push({ call, status });
    } else if (status.status === 'error') {
      errors.push({ call, status });
    } else {
      pending.push(call);
    }
  });

  log.success(`${synced.length} already synced to Monday`);
  log.warn(`${pending.length} pending sync`);
  if (errors.length > 0) {
    log.error(`${errors.length} failed to sync`);
  }

  if (pending.length > 0) {
    log.data('\nPending Calls:');
    pending.slice(0, 10).forEach((call, idx) => {
      log.data(`  ${idx + 1}. ${new Date(call.event_ts).toLocaleString()} - ${call.text?.substring(0, 50) || 'N/A'}`);
    });
    if (pending.length > 10) {
      log.data(`  ... and ${pending.length - 10} more`);
    }
  }

  if (errors.length > 0) {
    log.data('\nFailed Calls:');
    errors.slice(0, 5).forEach(({ call, status }, idx) => {
      log.data(`  ${idx + 1}. ${new Date(call.event_ts).toLocaleString()} - Error: ${status.error}`);
    });
  }

  return { pending, synced, errors };
}

/**
 * Get attribution data for a booked call
 */
async function getCallAttribution(slackChannelId, slackMessageTs) {
  const call = await prisma.booked_calls.findUnique({
    where: {
      slack_channel_id_slack_message_ts: {
        slack_channel_id: slackChannelId,
        slack_message_ts: slackMessageTs,
      },
    },
  });

  if (!call) return null;

  const attribution = await prisma.booked_call_attribution.findUnique({
    where: { booked_call_id: call.id },
  });

  // Get SMS events around the booking time
  const smsEvents = await prisma.sms_events.findMany({
    where: {
      event_ts: {
        gte: new Date(call.event_ts.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before
        lte: call.event_ts,
      },
    },
    orderBy: { event_ts: 'desc' },
    take: 10,
  });

  return {
    call,
    attribution,
    smsEvents,
  };
}

/**
 * Sync pending calls to Monday
 */
async function syncPendingToMonday() {
  log.title('🔄 SYNCING BOOKED CALLS TO MONDAY');

  const enabled = process.env.MONDAY_PERSONAL_SYNC_ENABLED === 'true';
  const autoWrite = process.env.MONDAY_AUTO_WRITE_ENABLED === 'true';
  const outbound = process.env.MONDAY_OUTBOUND_ENABLED === 'true';

  if (!enabled || !autoWrite || !outbound) {
    log.error('Monday sync is not fully enabled');
    log.data(`  MONDAY_PERSONAL_SYNC_ENABLED: ${enabled}`);
    log.data(`  MONDAY_AUTO_WRITE_ENABLED: ${autoWrite}`);
    log.data(`  MONDAY_OUTBOUND_ENABLED: ${outbound}`);
    return;
  }

  log.info('Starting sync...');
  const result = await syncRecentSetterBookedCallsToMonday({
    info: (msg) => log.info(msg),
    debug: (msg) => console.log(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
  });

  if (result.status === 'skipped') {
    log.warn('Sync was skipped');
  } else {
    log.success(`Synced ${result.pushed} out of ${result.checked} calls`);
  }

  return result;
}

/**
 * Show recent Monday sync activity
 */
async function showSyncActivity() {
  log.title('📊 RECENT MONDAY SYNC ACTIVITY');

  const recentPushes = await prisma.monday_booked_call_pushes.findMany({
    orderBy: { updated_at: 'desc' },
    take: 20,
  });

  log.info(`Last ${recentPushes.length} sync attempts:`);

  recentPushes.forEach((push, idx) => {
    const statusIcon = push.status === 'synced' ? '✓' : push.status === 'error' ? '✗' : '⋯';
    const statusColor = push.status === 'synced' ? colors.green : push.status === 'error' ? colors.red : colors.yellow;

    log.data(
      `  ${idx + 1}. ${statusColor}${statusIcon}${colors.reset} ${push.status.padEnd(10)} - ${new Date(push.updated_at).toLocaleString()}`,
    );
    log.data(`     Setter: ${push.setter_bucket} | Monday Item: ${push.monday_item_id || 'N/A'}`);
    if (push.error) {
      log.data(`     Error: ${push.error}`);
    }
  });
}

/**
 * Test manual booking creation
 */
async function testManualBooking() {
  log.title('🧪 TEST MANUAL BOOKING');

  log.warn('This will create a TEST entry in your Monday board!');
  log.info('Creating test booking...');

  const result = await createManualMondayBookedCall(
    {
      contactName: 'Test Contact (DELETE ME)',
      contactPhone: '+15555551234',
      eventTs: new Date().toISOString(),
      line: 'Test Line',
      notes: 'This is a test booking created by the database explorer. Please delete this entry.',
      setter: 'jack',
    },
    {
      info: (msg) => log.info(msg),
      debug: (msg) => console.log(msg),
      warn: (msg) => log.warn(msg),
      error: (msg) => log.error(msg),
    },
  );

  log.success(`Created Monday item: ${result.itemId}`);
  log.info(
    `View at: https://physical-therapy-biz.monday.com/boards/${process.env.MONDAY_PERSONAL_BOARD_ID}/pulses/${result.itemId}`,
  );
}

/**
 * Main CLI
 */
async function main() {
  const command = process.argv[2];

  try {
    console.log(
      `\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(
      `${colors.bright}${colors.cyan}║          MONDAY.COM BOOKED CALLS SYNC MANAGER                 ║${colors.reset}`,
    );
    console.log(
      `${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`,
    );

    switch (command) {
      case 'config':
        await showBoardConfig();
        break;

      case 'pending':
        await checkPendingCalls();
        break;

      case 'sync':
        await syncPendingToMonday();
        break;

      case 'activity':
        await showSyncActivity();
        break;

      case 'test':
        await testManualBooking();
        break;

      case 'all':
        await showBoardConfig();
        await checkPendingCalls();
        await showSyncActivity();
        break;

      default:
        console.log(`
${colors.bright}Usage:${colors.reset}
  railway run node --import tsx monday-sync-manager.mjs <command>

${colors.bright}Commands:${colors.reset}
  ${colors.cyan}config${colors.reset}    Show Monday board configuration and column mappings
  ${colors.cyan}pending${colors.reset}   Check pending booked calls that need syncing
  ${colors.cyan}sync${colors.reset}      Sync pending calls to Monday board
  ${colors.cyan}activity${colors.reset}  Show recent Monday sync activity
  ${colors.cyan}test${colors.reset}      Create a test manual booking (will create real Monday item!)
  ${colors.cyan}all${colors.reset}       Show all information (config + pending + activity)

${colors.bright}Examples:${colors.reset}
  railway run node --import tsx monday-sync-manager.mjs config
  railway run node --import tsx monday-sync-manager.mjs sync
  railway run node --import tsx monday-sync-manager.mjs all

${colors.bright}Environment Variables:${colors.reset}
  MONDAY_PERSONAL_BOARD_ID           Your Monday board ID
  MONDAY_PERSONAL_SYNC_ENABLED       Enable automatic syncing
  MONDAY_AUTO_WRITE_ENABLED          Enable writing to Monday
  MONDAY_OUTBOUND_ENABLED            Enable outbound operations
  MONDAY_PERSONAL_SETTER_BUCKET      Which setter's calls to sync (jack/brandon)
  MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS How many days back to look (default: 14)
        `);
    }
  } catch (error) {
    log.error(`Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
