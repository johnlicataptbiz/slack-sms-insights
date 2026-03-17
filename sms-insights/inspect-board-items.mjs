import { queryBoardColumns, queryBoardItems } from './services/monday-client.ts';

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
  data: (text) => console.log(`  ${text}`),
};

async function inspectBoardItems() {
  log.title('🔍 INSPECTING MONDAY BOARD ITEMS & STATUS COLUMNS');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }
  
  log.info(`Board ID: ${boardId}`);
  
  // Get columns and items
  const columns = await queryBoardColumns(boardId);
  const { items } = await queryBoardItems(boardId);
  
  log.success(`Found ${items.length} items on board`);
  
  // Find status columns
  const statusColumns = columns.filter(col => col.type === 'color' || col.type === 'status');
  
  log.title('\n📊 STATUS COLUMNS');
  for (const col of statusColumns) {
    log.data(`\n${colors.bright}${col.title}${colors.reset} [${col.id}]`);
    log.data(`  Type: ${col.type}`);
    
    // Show what values are actually used in items
    log.data(`  ${colors.cyan}Values used in items:${colors.reset}`);
    const uniqueValues = new Set();
    items.forEach(item => {
      const colValue = item.columnValues.find(cv => cv.id === col.id);
      if (colValue?.text) {
        uniqueValues.add(colValue.text);
      }
    });
    
    if (uniqueValues.size > 0) {
      uniqueValues.forEach(val => log.data(`    - "${val}"`));
    } else {
      log.data(`    ${colors.yellow}(no values set in any items)${colors.reset}`);
    }
  }
  
  // Show what the sync code is trying to set
  log.title('\n🔧 WHAT SYNC CODE TRIES TO SET');
  const mapping = JSON.parse(process.env.MONDAY_PERSONAL_COLUMN_MAP_JSON || '{}');
  
  const mappings = [
    { key: 'sourceColumnId', label: 'Source?', value: 'Slack booked call' },
    { key: 'lineColumnId', label: 'Channel?', value: '<line from data>' },
    { key: 'stageColumnId', label: 'Swing?', value: 'Booked' },
  ];
  
  mappings.forEach(({ key, label, value }) => {
    const columnId = mapping[key];
    if (columnId) {
      const col = statusColumns.find(c => c.id === columnId);
      log.data(`\n${colors.cyan}${label}${colors.reset} [${columnId}]`);
      log.data(`  Sync tries to set: "${value}"`);
      log.data(`  Column type: ${col?.type || 'NOT FOUND'}`);
    }
  });
  
  // Show recent items
  log.title('\n📝 RECENT ITEMS (showing first 5)');
  items.slice(0, 5).forEach((item, idx) => {
    log.data(`\n${idx + 1}. ${colors.bright}${item.name}${colors.reset}`);
    log.data(`   ID: ${item.id}`);
    log.data(`   Updated: ${item.updatedAt}`);
    
    // Show only the status columns
    statusColumns.forEach(col => {
      const value = item.columnValues.find(cv => cv.id === col.id);
      const displayValue = value?.text || colors.red + '(empty)' + colors.reset;
      log.data(`   ${col.title}: ${displayValue}`);
    });
  });
}

inspectBoardItems().catch(console.error);
