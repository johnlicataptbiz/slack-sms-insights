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
 * Compare duplicate entries to see if they're identical
 */
async function compareDuplicates() {
  log.title('🔍 COMPARING DUPLICATE ENTRIES');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  
  // Fetch all items
  let allItems = [];
  let cursor = null;
  
  do {
    const page = await queryBoardItems(boardId, cursor);
    if (page.items && page.items.length > 0) {
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
    } else {
      break;
    }
  } while (cursor);
  
  // Get tracked items
  const syncedPushes = await prisma.monday_booked_call_pushes.findMany({
    where: {
      board_id: boardId,
      status: 'synced',
      monday_item_id: { not: null }
    }
  });
  
  const trackedIds = new Set(syncedPushes.map(p => p.monday_item_id));
  
  // Find duplicates by name
  const nameMap = {};
  allItems.forEach(item => {
    const name = item.name.trim().toLowerCase();
    if (!nameMap[name]) {
      nameMap[name] = [];
    }
    nameMap[name].push({
      ...item,
      isTracked: trackedIds.has(item.id)
    });
  });
  
  const duplicates = Object.entries(nameMap).filter(([name, items]) => items.length > 1);
  
  log.info(`Found ${duplicates.length} sets of duplicates\n`);
  
  const duplicatesToDelete = [];
  
  for (const [name, items] of duplicates) {
    const tracked = items.filter(i => i.isTracked);
    const manual = items.filter(i => !i.isTracked);
    
    if (tracked.length === 0 || manual.length === 0) {
      continue; // Skip if not a tracked/manual pair
    }
    
    log.title(`📋 ${name.toUpperCase()}`);
    log.data(`Total items: ${items.length} (${tracked.length} tracked, ${manual.length} manual)\n`);
    
    // Compare each pair
    for (const manualItem of manual) {
      for (const trackedItem of tracked) {
        log.info(`Comparing:`);
        log.data(`  TRACKED ID: ${trackedItem.id}`);
        log.data(`  MANUAL ID:  ${manualItem.id}\n`);
        
        // Compare column values
        const trackedCols = new Map(
          trackedItem.column_values?.map(c => [c.id, c]) || []
        );
        const manualCols = new Map(
          manualItem.column_values?.map(c => [c.id, c]) || []
        );
        
        const differences = [];
        const allColIds = new Set([...trackedCols.keys(), ...manualCols.keys()]);
        
        for (const colId of allColIds) {
          const trackedCol = trackedCols.get(colId);
          const manualCol = manualCols.get(colId);
          
          const trackedText = trackedCol?.text || '';
          const manualText = manualCol?.text || '';
          
          // Skip empty comparisons and certain columns
          if (!trackedText && !manualText) continue;
          if (colId === 'name') continue; // Already matched by name
          
          if (trackedText !== manualText) {
            differences.push({
              columnId: colId,
              columnTitle: trackedCol?.type || manualCol?.type || 'unknown',
              tracked: trackedText || '(empty)',
              manual: manualText || '(empty)'
            });
          }
        }
        
        if (differences.length === 0) {
          log.success('Items are IDENTICAL - safe to delete manual entry');
          duplicatesToDelete.push({
            name,
            manualId: manualItem.id,
            trackedId: trackedItem.id,
            reason: 'identical'
          });
        } else if (differences.length <= 3) {
          log.warn(`Items have ${differences.length} minor difference(s):`);
          differences.forEach(diff => {
            log.data(`  Column: ${diff.columnTitle} [${diff.columnId}]`);
            log.data(`    Tracked: "${diff.tracked}"`);
            log.data(`    Manual:  "${diff.manual}"`);
          });
          
          // Check if differences are just empty vs populated
          const onlyEmptyDiffs = differences.every(d => 
            d.tracked === '(empty)' || d.manual === '(empty)'
          );
          
          if (onlyEmptyDiffs) {
            log.success('Differences are just empty fields - SAFE to delete manual');
            duplicatesToDelete.push({
              name,
              manualId: manualItem.id,
              trackedId: trackedItem.id,
              reason: 'only_empty_differences'
            });
          } else {
            log.error('Items have substantive differences - DO NOT delete automatically');
            log.data(`${colors.yellow}Manual review recommended${colors.reset}\n`);
          }
        } else {
          log.error(`Items have ${differences.length} MAJOR differences - DO NOT delete`);
          log.data('Sample differences:');
          differences.slice(0, 5).forEach(diff => {
            log.data(`  ${diff.columnTitle}: "${diff.tracked}" vs "${diff.manual}"`);
          });
          log.data(`${colors.red}Keep both and manually review${colors.reset}\n`);
        }
      }
    }
  }
  
  // Summary
  log.title('📊 DELETION SUMMARY');
  log.info(`Safe to delete: ${duplicatesToDelete.length} manual entries\n`);
  
  if (duplicatesToDelete.length > 0) {
    log.data('Manual entries to delete:');
    duplicatesToDelete.forEach((dup, idx) => {
      log.data(`${idx + 1}. ${dup.name} - ID: ${dup.manualId} (${dup.reason})`);
    });
    
    log.title('🗑️  DELETION COMMAND');
    log.info('To delete these items, you can:');
    log.data('');
    log.data('Option 1: Delete manually in Monday.com UI');
    log.data('');
    log.data('Option 2: Use Monday API (I can create a script)');
    log.data('');
    log.warn('Would you like me to create a deletion script?');
  } else {
    log.warn('No safe duplicates found to auto-delete');
    log.data('Manual review of all duplicates is recommended');
  }
  
  await prisma.$disconnect();
  
  return duplicatesToDelete;
}

compareDuplicates();
