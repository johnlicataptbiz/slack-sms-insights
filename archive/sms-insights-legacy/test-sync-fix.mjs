import { getPrismaClient } from './services/prisma.ts';
import { syncRecentSetterBookedCallsToMonday } from './services/monday-personal-writeback.ts';

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

async function testSyncWithFix() {
  log.title('🧪 TESTING SYNC WITH FIX (TEMPORARY OVERRIDE)');
  
  log.info('This will:');
  log.data('1. Temporarily enable sync flags (in-memory only)');
  log.data('2. Sync ONE recent call to Monday');
  log.data('3. Check if status columns populate correctly');
  log.data('');
  
  // Temporarily override env vars for this test
  const originalSync = process.env.MONDAY_PERSONAL_SYNC_ENABLED;
  const originalWrite = process.env.MONDAY_AUTO_WRITE_ENABLED;
  const originalOutbound = process.env.MONDAY_OUTBOUND_ENABLED;
  const originalLookback = process.env.MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS;
  
  try {
    log.warn('Enabling sync temporarily for test...');
    process.env.MONDAY_PERSONAL_SYNC_ENABLED = 'true';
    process.env.MONDAY_AUTO_WRITE_ENABLED = 'true';
    process.env.MONDAY_OUTBOUND_ENABLED = 'true';
    process.env.MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS = '1'; // Only sync last 24 hours
    
    log.info('Starting sync...');
    
    const result = await syncRecentSetterBookedCallsToMonday({
      info: (msg) => log.info(msg),
      debug: (msg) => console.log(msg),
      warn: (msg) => log.warn(msg),
      error: (msg) => log.error(msg),
    });
    
    if (result.status === 'skipped') {
      log.warn('Sync was skipped (this should not happen in test mode)');
    } else {
      log.success(`✅ Synced ${result.pushed} out of ${result.checked} calls`);
    }
    
    log.title('\n📋 NEXT STEPS');
    log.data('1. Go to your Monday board: https://physical-therapy-biz.monday.com/boards/10029059942');
    log.data('2. Look for the most recent entry (should be from last 24 hours)');
    log.data('3. Check if these columns are filled:');
    log.data('   - Source?: Should NOT be empty');
    log.data('   - Channel?: Should NOT be empty');
    log.data('   - Swing?: Should say "First Swing"');
    log.data('');
    log.info('If all columns are filled ✅ → Fix works! Can re-enable permanently');
    log.warn('If columns are still empty ❌ → Need to investigate further');
    
  } finally {
    // Restore original env vars
    process.env.MONDAY_PERSONAL_SYNC_ENABLED = originalSync;
    process.env.MONDAY_AUTO_WRITE_ENABLED = originalWrite;
    process.env.MONDAY_OUTBOUND_ENABLED = originalOutbound;
    process.env.MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS = originalLookback;
    
    await prisma.$disconnect();
  }
}

testSyncWithFix().catch(console.error);
