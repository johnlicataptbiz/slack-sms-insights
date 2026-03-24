import { getPrismaClient } from './services/prisma.ts';
import { getBookedCallAttributionSources } from './services/booked-calls.ts';

const prisma = getPrismaClient();

async function checkCallData() {
  console.log('\n🔍 Checking what data we have for this call...\n');
  
  const slackChannelId = 'C07B7R1290F';
  const slackMessageTs = '1773708101.282999';
  
  // Get the booked call
  const call = await prisma.booked_calls.findUnique({
    where: {
      slack_channel_id_slack_message_ts: {
        slack_channel_id: slackChannelId,
        slack_message_ts: slackMessageTs,
      }
    }
  });
  
  if (!call) {
    console.log('Call not found\n');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Booked Call:`)
  console.log(`  ID: ${call.id}`);
  console.log(`  Event TS: ${call.event_ts}`);
  console.log(`  Text: ${call.text}`);
  console.log('');
  
  // Get attribution
  const attribution = await prisma.booked_call_attribution.findUnique({
    where: { booked_call_id: call.id }
  });
  
  console.log(`Attribution:`)
  if (attribution) {
    console.log(`  Line: ${attribution.line || 'NULL'}`);
    console.log(`  First Conversion: ${attribution.first_conversion || 'NULL'}`);
    console.log(`  Contact Name: ${attribution.contact_name || 'NULL'}`);
    console.log(`  Contact Phone: ${attribution.contact_phone || 'NULL'}`);
  } else {
    console.log(`  NO ATTRIBUTION DATA FOUND!`);
  }
  console.log('');
  
  // Get the attribution source (what the sync code uses)
  const sources = await getBookedCallAttributionSources({
    from: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    to: new Date(),
    channelId: slackChannelId,
    slackMessageTs: slackMessageTs,
  });
  
  if (sources.length > 0) {
    const source = sources[0];
    console.log(`Attribution Source (what sync uses):`);
    console.log(`  line: ${source.line || 'NULL'}`);
    console.log(`  firstConversion: ${source.firstConversion || 'NULL'}`);
    console.log(`  contactName: ${source.contactName || 'NULL'}`);
    console.log(`  contactPhone: ${source.contactPhone || 'NULL'}`);
    console.log(`  bucket: ${source.bucket}`);
    console.log('');
    
    // Show what the mapping functions WOULD return
    console.log(`What mapping functions would return:`);
    const line = source.line || '';
    const fc = source.firstConversion || '';
    console.log(`  mapLineToChannel("${line}"):`);
    console.log(`    → Would check: ${line.toLowerCase()}`);
    console.log(`  mapSourceToMondaySource("${fc}"):`);
    console.log(`    → Would check: ${fc.toLowerCase()}`);
  } else {
    console.log(`NO ATTRIBUTION SOURCE FOUND!`);
  }
  
  await prisma.$disconnect();
}

checkCallData().catch(console.error);
