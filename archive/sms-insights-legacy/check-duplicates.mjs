import { getPrismaClient } from './services/prisma.ts';
import { queryBoardItems } from './services/monday-client.ts';

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
 * Check for duplicates on Monday board
 */
async function checkForDuplicates() {
  log.title('🔍 CHECKING FOR DUPLICATES ON MONDAY BOARD');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }
  
  log.info(`Fetching items from Monday board ${boardId}...`);
  
  // Get all items from Monday board (paginated)
  let allItems = [];
  let cursor = null;
  let pageCount = 0;
  
  do {
    const page = await queryBoardItems(boardId, cursor);
    if (page.items && page.items.length > 0) {
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
      pageCount++;
      log.data(`Fetched page ${pageCount}: ${page.items.length} items (total: ${allItems.length})`);
    } else {
      break;
    }
    // Safety limit
    if (pageCount >= 20) {
      log.warn('Reached page limit, stopping...');
      break;
    }
  } while (cursor);
  
  const boardItems = allItems;
  log.success(`Found ${boardItems.length} total items on Monday board`);
  
  // Get all synced pushes from database
  const syncedPushes = await prisma.monday_booked_call_pushes.findMany({
    where: {
      board_id: boardId,
      status: 'synced',
      monday_item_id: { not: null }
    },
    orderBy: { pushed_at: 'desc' }
  });
  
  log.info(`Found ${syncedPushes.length} synced calls in database`);
  
  // Check if Monday items exist
  const mondayItemIds = new Set(boardItems.map(item => item.id));
  const dbItemIds = syncedPushes.map(p => p.monday_item_id);
  
  log.data(`\nMonday board item IDs (sample): ${Array.from(mondayItemIds).slice(0, 5).join(', ')}...`);
  log.data(`Database tracked IDs (sample): ${dbItemIds.slice(0, 5).join(', ')}...`);
  
  // Find items in DB but not on board
  const missingFromBoard = dbItemIds.filter(id => !mondayItemIds.has(id));
  
  // Find items on board not in DB
  const notTrackedInDb = Array.from(mondayItemIds).filter(id => !dbItemIds.includes(id));
  
  log.title('📊 SYNC STATUS');
  log.success(`${dbItemIds.filter(id => mondayItemIds.has(id)).length} items properly synced`);
  
  if (missingFromBoard.length > 0) {
    log.warn(`${missingFromBoard.length} items in DB but not found on Monday board (may have been deleted)`);
    log.data('Sample missing IDs:');
    missingFromBoard.slice(0, 5).forEach(id => log.data(`  - ${id}`));
  }
  
  if (notTrackedInDb.length > 0) {
    log.info(`${notTrackedInDb.length} items on Monday board not tracked in sync database (manual entries)`);
  }
  
  // Check for duplicate names (potential duplicates)
  log.title('🔄 CHECKING FOR POTENTIAL DUPLICATES BY NAME');
  
  const nameCount = {};
  boardItems.forEach(item => {
    const name = item.name.trim().toLowerCase();
    if (!nameCount[name]) {
      nameCount[name] = [];
    }
    nameCount[name].push(item);
  });
  
  const duplicates = Object.entries(nameCount).filter(([name, items]) => items.length > 1);
  
  if (duplicates.length === 0) {
    log.success('No duplicate names found on Monday board!');
  } else {
    log.warn(`Found ${duplicates.length} duplicate names on Monday board:`);
    duplicates.slice(0, 10).forEach(([name, items]) => {
      log.data(`\n  "${name}" (${items.length} items):`);
      items.forEach(item => {
        const tracked = dbItemIds.includes(item.id);
        const marker = tracked ? `${colors.cyan}[TRACKED]${colors.reset}` : `${colors.yellow}[MANUAL]${colors.reset}`;
        log.data(`    ${marker} ID: ${item.id} - Created: ${item.created_at || 'Unknown'}`);
      });
    });
    
    if (duplicates.length > 10) {
      log.data(`\n  ... and ${duplicates.length - 10} more duplicate names`);
    }
  }
  
  // Recent syncs
  log.title('📅 RECENT SYNC ACTIVITY');
  
  const recentSyncs = syncedPushes.slice(0, 15);
  log.info(`Last ${recentSyncs.length} synced calls:`);
  
  recentSyncs.forEach((sync, idx) => {
    const existsOnBoard = mondayItemIds.has(sync.monday_item_id);
    const marker = existsOnBoard ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    log.data(`${idx + 1}. ${marker} Item ${sync.monday_item_id} - Pushed: ${new Date(sync.pushed_at).toLocaleString()}`);
  });
  
  return {
    totalBoardItems: boardItems.length,
    totalTracked: syncedPushes.length,
    duplicateNames: duplicates.length,
    missingFromBoard: missingFromBoard.length,
    notTracked: notTrackedInDb.length,
  };
}

/**
 * Check pending calls details
 */
async function checkPendingDetails() {
  log.title('📋 PENDING CALLS DETAILS');
  
  const lookbackDays = 14;
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  
  // Get all booked calls
  const allCalls = await prisma.booked_calls.findMany({
    where: { event_ts: { gte: from } },
    orderBy: { event_ts: 'desc' }
  });
  
  // Get attribution for each
  const attributions = await prisma.booked_call_attribution.findMany({
    where: {
      booked_call_id: { in: allCalls.map(c => c.id) }
    }
  });
  
  const attrMap = new Map(attributions.map(a => [a.booked_call_id, a]));
  
  // Get push status
  const pushes = await prisma.monday_booked_call_pushes.findMany({
    where: {
      slack_channel_id: { in: allCalls.map(c => c.slack_channel_id) },
      slack_message_ts: { in: allCalls.map(c => c.slack_message_ts) }
    }
  });
  
  const pushMap = new Map(
    pushes.map(p => [`${p.slack_channel_id}:${p.slack_message_ts}`, p])
  );
  
  const targetBucket = process.env.MONDAY_PERSONAL_SETTER_BUCKET || 'jack';
  
  log.info(`Analyzing ${allCalls.length} calls from last ${lookbackDays} days`);
  log.info(`Your setter bucket: ${targetBucket}\n`);
  
  const pending = [];
  const synced = [];
  const errors = [];
  const wrongBucket = [];
  const noAttribution = [];
  
  allCalls.forEach(call => {
    const key = `${call.slack_channel_id}:${call.slack_message_ts}`;
    const push = pushMap.get(key);
    const attr = attrMap.get(call.id);
    
    if (!attr) {
      noAttribution.push(call);
      return;
    }
    
    if (attr.setter_final !== targetBucket && attr.setter_hint !== targetBucket) {
      wrongBucket.push({ call, attr });
      return;
    }
    
    if (!push) {
      pending.push({ call, attr });
    } else if (push.status === 'synced') {
      synced.push({ call, attr, push });
    } else if (push.status === 'error') {
      errors.push({ call, attr, push });
    } else {
      pending.push({ call, attr });
    }
  });
  
  log.data(`${colors.green}✓ Synced:${colors.reset}          ${synced.length}`);
  log.data(`${colors.yellow}⚠ Pending:${colors.reset}         ${pending.length}`);
  log.data(`${colors.red}✗ Errors:${colors.reset}          ${errors.length}`);
  log.data(`${colors.blue}ℹ Wrong bucket:${colors.reset}    ${wrongBucket.length} (for other setters)`);
  log.data(`${colors.cyan}? No attribution:${colors.reset}  ${noAttribution.length}`);
  
  if (pending.length > 0) {
    log.title('⚠️  PENDING CALLS (Not Yet Synced)');
    pending.slice(0, 10).forEach(({ call, attr }, idx) => {
      log.data(`${idx + 1}. ${new Date(call.event_ts).toLocaleString()}`);
      log.data(`   Text: ${call.text?.substring(0, 60) || 'N/A'}`);
      log.data(`   Setter: ${attr.setter_final || attr.setter_hint || 'Unknown'}`);
      log.data(`   Channel: ${call.slack_channel_id}`);
    });
    if (pending.length > 10) {
      log.data(`   ... and ${pending.length - 10} more`);
    }
  }
  
  if (wrongBucket.length > 0) {
    log.title('ℹ️  CALLS FOR OTHER SETTERS');
    const bucketCount = {};
    wrongBucket.forEach(({ attr }) => {
      const bucket = attr.setter_final || attr.setter_hint || 'unknown';
      bucketCount[bucket] = (bucketCount[bucket] || 0) + 1;
    });
    Object.entries(bucketCount).forEach(([bucket, count]) => {
      log.data(`${bucket}: ${count} calls`);
    });
  }
  
  if (errors.length > 0) {
    log.title('❌ SYNC ERRORS');
    errors.forEach(({ call, push }, idx) => {
      log.data(`${idx + 1}. ${new Date(call.event_ts).toLocaleString()}`);
      log.data(`   Error: ${push.error}`);
      log.data(`   Text: ${call.text?.substring(0, 50) || 'N/A'}`);
    });
  }
}

/**
 * Main
 */
async function main() {
  try {
    console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║           MONDAY BOARD DUPLICATE CHECK & ANALYSIS             ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
    
    await checkForDuplicates();
    await checkPendingDetails();
    
    log.title('✅ ANALYSIS COMPLETE');
    
  } catch (error) {
    log.error(`Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
