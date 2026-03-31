import { queryBoardColumns } from './services/monday-client.ts';

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

async function checkStatusColumns() {
  log.title('🔍 CHECKING MONDAY STATUS COLUMNS');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }

  log.info(`Board ID: ${boardId}`);

  const columns = await queryBoardColumns(boardId);

  // Filter for status columns
  const statusColumns = columns.filter((col) => col.type === 'color' || col.type.includes('status'));

  log.success(`Found ${statusColumns.length} status columns`);

  for (const col of statusColumns) {
    log.data(`\n${colors.bright}${col.title}${colors.reset} [${col.id}]`);
    log.data(`  Type: ${col.type}`);

    // Check if settings_str contains label information
    if (col.settings_str) {
      try {
        const settings = JSON.parse(col.settings_str);
        if (settings.labels) {
          log.data(`  ${colors.cyan}Available Labels:${colors.reset}`);
          Object.entries(settings.labels).forEach(([key, value]) => {
            log.data(`    - "${value}" (index: ${key})`);
          });
        }
        if (settings.labels_colors) {
          log.data(`  ${colors.cyan}Label Colors:${colors.reset}`);
          Object.entries(settings.labels_colors).forEach(([key, value]) => {
            log.data(`    - ${key}: ${value}`);
          });
        }
      } catch (e) {
        log.warn(`  Could not parse settings: ${e.message}`);
      }
    }
  }

  // Show current mapping
  log.title('\n📋 CURRENT COLUMN MAPPING');
  const envMapping = process.env.MONDAY_PERSONAL_COLUMN_MAP_JSON;
  if (envMapping) {
    try {
      const mapping = JSON.parse(envMapping);
      log.data('Status column mappings:');
      log.data(`  sourceColumnId: ${mapping.sourceColumnId || 'NOT SET'}`);
      log.data(`  lineColumnId: ${mapping.lineColumnId || 'NOT SET'}`);
      log.data(`  stageColumnId: ${mapping.stageColumnId || 'NOT SET'}`);

      // Match with actual columns
      if (mapping.sourceColumnId) {
        const col = statusColumns.find((c) => c.id === mapping.sourceColumnId);
        log.data(`\n  ${colors.cyan}Source Column:${colors.reset} ${col ? col.title : 'NOT FOUND'}`);
      }
      if (mapping.lineColumnId) {
        const col = statusColumns.find((c) => c.id === mapping.lineColumnId);
        log.data(`  ${colors.cyan}Line Column:${colors.reset} ${col ? col.title : 'NOT FOUND'}`);
      }
      if (mapping.stageColumnId) {
        const col = statusColumns.find((c) => c.id === mapping.stageColumnId);
        log.data(`  ${colors.cyan}Stage Column:${colors.reset} ${col ? col.title : 'NOT FOUND'}`);
      }
    } catch (e) {
      log.error(`Could not parse MONDAY_PERSONAL_COLUMN_MAP_JSON: ${e.message}`);
    }
  } else {
    log.warn('MONDAY_PERSONAL_COLUMN_MAP_JSON not set');
  }
}

checkStatusColumns().catch(console.error);
