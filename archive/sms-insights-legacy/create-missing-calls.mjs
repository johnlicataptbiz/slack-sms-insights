import { getPrismaClient } from './services/prisma.ts';
import { getBookedCallAttributionSources } from './services/booked-calls.ts';
import { queryBoardItems, upsertBookedCallItem } from './services/monday-client.ts';

const prisma = getPrismaClient();

const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function manuallyCreateMissingCalls() {
  console.log(`\n${colors.cyan}🔧 Manually Creating Missing Calls on Monday${colors.reset}\n`);
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();
  
  // Get all Jack's calls
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter(s => s.bucket === 'jack');
  
  // Get all items on Monday board  
  const { items } = await queryBoardItems(boardId);
  
  // Find missing calls
  const missingCalls = [];
  for (const call of jackCalls) {
    const callDate = call.eventTs.substring(0, 10);
    const contactName = call.contactName || 'Unknown';
    const exists = items.some(item => 
      item.name.includes(contactName) && item.name.includes(callDate)
    );
    if (!exists) {
      missingCalls.push(call);
    }
  }
  
  console.log(`Found ${missingCalls.length} missing calls\n`);
  
  const token = getMondayToken();
  let created = 0;
  let failed = 0;
  
  for (const call of missingCalls) {
    const contactName = call.contactName || 'Booked Call';
    const callDate = call.eventTs.substring(0, 10);
    const itemName = `${contactName} - ${callDate}`;
    
    // Map values using our fixed functions
    const mapLineToChannel = (line) => {
      if (!line) return 'Aloware SMS';
      const normalized = line.toLowerCase();
      if (normalized.includes('aloware') || normalized.includes('sms')) return 'Aloware SMS';
      if (normalized.includes('circle')) return 'Circle DM';
      if (normalized.includes('instagram')) return 'Instagram DM';
      if (normalized.includes('email')) return 'Email Marketing';
      if (normalized.includes('self')) return 'SELF BOOK';
      return 'Aloware SMS';
    };
    
    const mapSourceToMondaySource = (firstConversion) => {
      if (!firstConversion) return 'Direct Outreach';
      const normalized = firstConversion.toLowerCase();
      if (normalized.includes('circle')) return 'Circle Group';
      if (normalized.includes('book buyer')) return 'Book Buyer';
      if (normalized.includes('checklist')) return 'Start-Up Checklist';
      if (normalized.includes('rates')) return 'Raise Your Rates';
      if (normalized.includes('space')) return 'Stand Alone Space Setup Guide';
      if (normalized.includes('email')) return 'Marketing Email';
      if (normalized.includes('social')) return 'Social Media';
      if (normalized.includes('hiring')) return 'Hiring Guide';
      if (normalized.includes('webinar')) return 'Webinar';
      if (normalized.includes('workshop')) return 'Workshop Playbook';
      if (normalized.includes('self book')) return 'Signature Self Book';
      if (normalized.includes('meeting')) return 'Direct Outreach';
      if (normalized.includes('field manual')) return 'Book Buyer';
      return 'Direct Outreach';
    };
    
    const columnValues = {
      "date_mkznycfs": { "date": callDate },
      "color_mm089dk3": { "label": "First Swing" },
      "color_mkznwqh0": { "label": mapLineToChannel(call.line) },
      "color_mkznd6kp": { "label": mapSourceToMondaySource(call.firstConversion) }
    };
    
    console.log(`${colors.blue}Creating:${colors.reset} ${itemName}`);
    console.log(`  Source: ${columnValues.color_mkznd6kp.label}`);
    console.log(`  Channel: ${columnValues.color_mkznwqh0.label}`);
    console.log(`  Swing: ${columnValues.color_mm089dk3.label}`);
    
    try {
      const mutation = `
        mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
            id
          }
        }
      `;
      
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            boardId,
            itemName,
            columnValues: JSON.stringify(columnValues)
          }
        }),
      });
      
      const result = await response.json();
      
      if (result.errors) {
        console.log(`  ${colors.red}✗ Error:${colors.reset} ${result.errors[0].message}\n`);
        failed++;
      } else {
        console.log(`  ${colors.green}✓ Created:${colors.reset} ID ${result.data.create_item.id}\n`);
        created++;
        
        // Mark as synced in database
        await prisma.monday_booked_call_pushes.upsert({
          where: {
            board_id_slack_channel_id_slack_message_ts: {
              board_id: boardId,
              slack_channel_id: call.slackChannelId,
              slack_message_ts: call.slackMessageTs,
            }
          },
          create: {
            board_id: boardId,
            slack_channel_id: call.slackChannelId,
            slack_message_ts: call.slackMessageTs,
            setter_bucket: 'jack',
            monday_item_id: result.data.create_item.id,
            status: 'synced',
            payload_json: { source: call, boardId },
            pushed_at: new Date(),
          },
          update: {
            monday_item_id: result.data.create_item.id,
            status: 'synced',
            pushed_at: new Date(),
          }
        });
      }
      
      // Wait 3 seconds between calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.log(`  ${colors.red}✗ Exception:${colors.reset} ${error.message}\n`);
      failed++;
    }
  }
  
  console.log(`\n${colors.cyan}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}✓ Created: ${created}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════${colors.reset}\n`);
  
  await prisma.$disconnect();
}

manuallyCreateMissingCalls().catch(console.error);
