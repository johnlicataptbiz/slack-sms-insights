import { getPrismaClient } from './services/prisma.ts';
import { queryBoardColumns } from './services/monday-client.ts';
import { getMondayColumnMapping } from './services/monday-store.ts';
import { readPersonalMappingFromEnv } from './services/monday-personal-writeback.ts';

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
 * Check what data fields are available from booked calls and what's missing
 */
async function checkMissingFields() {
  log.title('🔍 CHECKING MONDAY BOARD FIELD MAPPING');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID || '';
  if (!boardId) {
    log.error('MONDAY_PERSONAL_BOARD_ID not configured');
    return;
  }
  
  // Get board columns
  const columns = await queryBoardColumns(boardId);
  
  // Get current mapping from database
  const dbMapping = await getMondayColumnMapping(boardId);
  
  // Get environment override
  const envMapping = readPersonalMappingFromEnv();
  
  // Define what fields we want to map from SMS/Slack data
  const desiredFields = {
    callDateColumnId: {
      description: 'Date when the call was booked',
      dataSource: 'booked_calls.event_ts',
      required: true,
      columnType: 'date',
    },
    contactNameColumnId: {
      description: 'Contact name from SMS events',
      dataSource: 'sms_events.contact_name or booked_call_attribution',
      required: true,
      columnType: 'text',
    },
    phoneColumnId: {
      description: 'Contact phone number',
      dataSource: 'sms_events.contact_phone',
      required: true,
      columnType: 'phone',
    },
    setterColumnId: {
      description: 'Rep who set the call (Jack/Brandon)',
      dataSource: 'booked_call_attribution.setter_final',
      required: true,
      columnType: 'people or text',
    },
    stageColumnId: {
      description: 'Call stage/status',
      dataSource: 'Static: "Booked" or lead_outcomes.stage',
      required: false,
      columnType: 'status',
    },
    firstConversionColumnId: {
      description: 'First conversion/campaign source',
      dataSource: 'booked_call_attribution.first_conversion',
      required: false,
      columnType: 'text',
    },
    lineColumnId: {
      description: 'Phone line used',
      dataSource: 'sms_events.line',
      required: false,
      columnType: 'text',
    },
    sourceColumnId: {
      description: 'Source type (Slack booked call)',
      dataSource: 'booked_call_attribution.source_bucket',
      required: false,
      columnType: 'text or status',
    },
    slackLinkColumnId: {
      description: 'Link to Slack message',
      dataSource: 'booked_calls.slack_channel_id + slack_message_ts',
      required: false,
      columnType: 'link',
    },
    notesColumnId: {
      description: 'Call notes/details from Slack message',
      dataSource: 'booked_calls.text',
      required: false,
      columnType: 'long_text',
    },
  };
  
  log.info(`Board: https://physical-therapy-biz.monday.com/boards/${boardId}`);
  log.info(`Found ${columns.length} columns on board\n`);
  
  // Check each desired field
  log.title('📋 FIELD MAPPING STATUS');
  
  const missing = [];
  const configured = [];
  const mismatched = [];
  
  for (const [fieldKey, fieldInfo] of Object.entries(desiredFields)) {
    const dbValue = dbMapping?.[fieldKey];
    const envValue = envMapping?.[fieldKey];
    const mappedColumnId = envValue || dbValue;
    
    const requiredLabel = fieldInfo.required ? `${colors.red}[REQUIRED]${colors.reset}` : '[optional]';
    
    if (!mappedColumnId) {
      missing.push({ fieldKey, fieldInfo });
      log.error(`${fieldKey.padEnd(30)} ${requiredLabel}`);
      log.data(`${colors.yellow}Not mapped${colors.reset}`);
      log.data(`Expected type: ${fieldInfo.columnType}`);
      log.data(`Data source: ${fieldInfo.dataSource}`);
      log.data(`Description: ${fieldInfo.description}\n`);
    } else {
      const column = columns.find(c => c.id === mappedColumnId);
      if (!column) {
        mismatched.push({ fieldKey, fieldInfo, mappedColumnId });
        log.warn(`${fieldKey.padEnd(30)} ${requiredLabel}`);
        log.data(`${colors.red}Column not found: ${mappedColumnId}${colors.reset}\n`);
      } else {
        configured.push({ fieldKey, fieldInfo, column });
        log.success(`${fieldKey.padEnd(30)} ${requiredLabel}`);
        log.data(`→ ${column.title} [${column.id}] (${column.type})`);
        log.data(`Source: ${envValue ? 'Environment override' : 'Database mapping'}\n`);
      }
    }
  }
  
  // Show available columns that could be used
  log.title('📊 AVAILABLE MONDAY BOARD COLUMNS');
  log.info('These columns are available on your board:\n');
  
  columns.forEach((col, idx) => {
    const isMapped = Object.values(dbMapping || {}).includes(col.id) || 
                     Object.values(envMapping || {}).includes(col.id);
    const marker = isMapped ? `${colors.green}[MAPPED]${colors.reset}` : '        ';
    log.data(`${(idx + 1).toString().padStart(2)}. ${marker} ${col.title.padEnd(35)} [${col.id}] (${col.type})`);
  });
  
  // Summary
  log.title('📈 SUMMARY');
  log.success(`${configured.length} fields configured`);
  log.warn(`${missing.length} fields not mapped`);
  if (mismatched.length > 0) {
    log.error(`${mismatched.length} fields mapped to non-existent columns`);
  }
  
  if (missing.length > 0) {
    log.data('\n' + colors.yellow + 'Missing required fields:' + colors.reset);
    missing.filter(m => m.fieldInfo.required).forEach(m => {
      log.data(`  - ${m.fieldKey}: ${m.fieldInfo.description}`);
    });
  }
  
  // Show what data we can get from a sample booked call
  log.title('📨 SAMPLE DATA FROM RECENT BOOKED CALL');
  
  const sampleCall = await prisma.booked_calls.findFirst({
    orderBy: { event_ts: 'desc' },
    include: {
      booked_call_reactions: true,
    }
  });
  
  if (sampleCall) {
    const attribution = await prisma.booked_call_attribution.findUnique({
      where: { booked_call_id: sampleCall.id }
    });
    
    const smsEvents = await prisma.sms_events.findMany({
      where: {
        OR: [
          { slack_channel_id: sampleCall.slack_channel_id },
          { 
            conversation_id: attribution?.conversation_id,
            event_ts: {
              gte: new Date(sampleCall.event_ts.getTime() - 7 * 24 * 60 * 60 * 1000),
              lte: sampleCall.event_ts
            }
          }
        ]
      },
      orderBy: { event_ts: 'desc' },
      take: 5,
    });
    
    log.data(`Booked Call ID: ${sampleCall.id}`);
    log.data(`Event Timestamp: ${sampleCall.event_ts.toISOString()}`);
    log.data(`Slack Channel: ${sampleCall.slack_channel_id}`);
    log.data(`Slack Message TS: ${sampleCall.slack_message_ts}`);
    log.data(`Text: ${sampleCall.text || 'N/A'}`);
    log.data(`First SMS Touch: ${sampleCall.first_sms_touch_at?.toISOString() || 'N/A'}`);
    
    if (attribution) {
      log.data(`\nAttribution Data:`);
      log.data(`  Setter: ${attribution.setter_final || 'N/A'}`);
      log.data(`  Closer: ${attribution.closer_final || 'N/A'}`);
      log.data(`  Source Bucket: ${attribution.source_bucket || 'N/A'}`);
      log.data(`  First Conversion: ${attribution.first_conversion || 'N/A'}`);
      log.data(`  Conversation ID: ${attribution.conversation_id || 'N/A'}`);
      log.data(`  Mapping Method: ${attribution.mapping_method || 'N/A'}`);
    }
    
    if (smsEvents.length > 0) {
      log.data(`\nRelated SMS Events (${smsEvents.length}):`);
      smsEvents.forEach((sms, idx) => {
        log.data(`  ${idx + 1}. ${sms.direction} - ${sms.event_ts.toISOString()}`);
        log.data(`     Contact: ${sms.contact_name || 'Unknown'} (${sms.contact_phone || 'N/A'})`);
        log.data(`     Sequence: ${sms.sequence || 'N/A'}`);
        log.data(`     Line: ${sms.line || 'N/A'}`);
      });
    }
  }
  
  // Recommendations
  log.title('💡 RECOMMENDATIONS');
  
  if (missing.length > 0) {
    log.info('To fix missing field mappings, you can either:');
    log.data('');
    log.data('1. Add columns to your Monday board and re-run this check');
    log.data('   Recommended column types:');
    missing.forEach(m => {
      log.data(`   - ${m.fieldKey}: ${m.fieldInfo.columnType}`);
    });
    log.data('');
    log.data('2. Set environment variable MONDAY_PERSONAL_COLUMN_MAP_JSON with mapping:');
    log.data('   Example JSON:');
    const exampleMapping = {};
    Object.keys(desiredFields).forEach(key => {
      exampleMapping[key] = '<column_id>';
    });
    log.data(`   ${JSON.stringify(exampleMapping, null, 2)}`);
    log.data('');
    log.data('3. Run the sync anyway and let the system auto-detect columns');
    log.data('   The system will try to match columns by name');
  }
  
  return {
    configured,
    missing,
    mismatched,
    columns,
  };
}

/**
 * Main
 */
async function main() {
  try {
    console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║       MONDAY BOARD FIELD MAPPING DIAGNOSTIC                   ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
    
    await checkMissingFields();
    
  } catch (error) {
    log.error(`Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
