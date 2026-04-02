import { queryBoardItems } from './services/monday-client.ts';

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

async function findIncompleteAutoSyncedItems() {
  log.title('🔍 FINDING INCOMPLETE AUTO-SYNCED ITEMS');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }
  
  log.info(`Board ID: ${boardId}`);
  log.info('Fetching all items...');
  
  // Get all items
  const { items } = await queryBoardItems(boardId);
  
  // Filter for items that look auto-synced (have " - 2026-" format) and have empty status columns
  const incompleteItems = items.filter(item => {
    // Check if name matches auto-sync pattern: "Name - YYYY-MM-DD"
    const hasDatePattern = / - \d{4}-\d{2}-\d{2}$/.test(item.name);
    if (!hasDatePattern) return false;
    
    // Check if status columns are empty
    const statusColumns = ['color_mkznsang', 'color_mkznd6kp', 'color_mkznwqh0', 'color_mm089dk3'];
    const allEmpty = statusColumns.every(colId => {
      const colValue = item.columnValues.find(cv => cv.id === colId);
      return !colValue?.text || colValue.text.trim() === '';
    });
    
    return allEmpty;
  });
  
  log.success(`Found ${incompleteItems.length} incomplete auto-synced items`);
  
  if (incompleteItems.length === 0) {
    log.info('No cleanup needed! 🎉');
    return;
  }
  
  // Group by date
  const byDate = {};
  incompleteItems.forEach(item => {
    const match = item.name.match(/ - (\d{4}-\d{2}-\d{2})$/);
    const date = match ? match[1] : 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(item);
  });
  
  log.title('\n📅 INCOMPLETE ITEMS GROUPED BY DATE');
  Object.entries(byDate).sort().forEach(([date, items]) => {
    log.data(`\n${colors.bright}${date}${colors.reset} (${items.length} items)`);
    items.forEach((item, idx) => {
      const nameOnly = item.name.replace(/ - \d{4}-\d{2}-\d{2}$/, '');
      log.data(`  ${idx + 1}. ${nameOnly} [ID: ${item.id}]`);
    });
  });
  
  // Show items from March 4th and 17th specifically
  const march4 = byDate['2026-03-04'] || [];
  const march17 = byDate['2026-03-17'] || [];
  
  log.title('\n🎯 ITEMS TO REVIEW');
  if (march4.length > 0) {
    log.warn(`March 4th: ${march4.length} incomplete items`);
  }
  if (march17.length > 0) {
    log.warn(`March 17th: ${march17.length} incomplete items`);
  }
  
  log.title('\n💡 NEXT STEPS');
  log.data('These items were auto-synced BEFORE the fix was deployed.');
  log.data('They have empty status columns because the old code used invalid values.');
  log.data('');
  log.data('Options:');
  log.data('  1. Delete them (if they\'re duplicates of manual entries)');
  log.data('  2. Keep them (they still have Name and Date Set populated)');
  log.data('  3. Re-sync them after deploying the fix');
  log.data('');
  log.info('To delete specific items, use: delete-auto-synced-items.mjs');
}

findIncompleteAutoSyncedItems().catch(console.error);
