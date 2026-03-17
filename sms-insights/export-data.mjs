import { getPrismaClient } from './services/prisma.ts';
import { writeFileSync } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

const prisma = getPrismaClient();

/**
 * Export conversations with full details to CSV
 */
export async function exportConversations(options = {}) {
  const {
    status = null,
    startDate = null,
    endDate = null,
    limit = 1000,
    outputFile = 'conversations_export.csv'
  } = options;

  const where = {};
  if (status) where.status = status;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const conversations = await prisma.conversation.findMany({
    where,
    take: limit,
    orderBy: { last_touch_at: 'desc' },
    include: {
      inbox_contact_profiles: true,
      conversation_state: true,
      work_items: true,
      sms_events: {
        orderBy: { event_ts: 'desc' },
        take: 5,
      }
    }
  });

  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'id', title: 'Conversation ID' },
      { id: 'contactKey', title: 'Contact Key' },
      { id: 'contact_phone', title: 'Phone' },
      { id: 'contact_name', title: 'Contact Name' },
      { id: 'status', title: 'Status' },
      { id: 'current_rep_id', title: 'Current Rep' },
      { id: 'last_inbound_at', title: 'Last Inbound' },
      { id: 'last_outbound_at', title: 'Last Outbound' },
      { id: 'last_touch_at', title: 'Last Touch' },
      { id: 'unreplied_inbound_count', title: 'Unreplied Count' },
      { id: 'cadence_status', title: 'Cadence Status' },
      { id: 'qualification_coaching_interest', title: 'Coaching Interest' },
      { id: 'qualification_revenue_mix', title: 'Revenue Mix' },
      { id: 'escalation_level', title: 'Escalation Level' },
      { id: 'has_work_items', title: 'Has Work Items' },
      { id: 'sms_count', title: 'SMS Count' },
      { id: 'lead_source', title: 'Lead Source' },
    ]
  });

  const records = conversations.map(conv => ({
    id: conv.id,
    contactKey: conv.contactKey,
    contact_phone: conv.contact_phone || conv.inbox_contact_profiles?.[0]?.phone || 'N/A',
    contact_name: conv.inbox_contact_profiles?.[0]?.name || 'Unknown',
    status: conv.status,
    current_rep_id: conv.current_rep_id || 'Unassigned',
    last_inbound_at: conv.last_inbound_at?.toISOString() || 'N/A',
    last_outbound_at: conv.last_outbound_at?.toISOString() || 'N/A',
    last_touch_at: conv.last_touch_at?.toISOString() || 'N/A',
    unreplied_inbound_count: conv.unreplied_inbound_count,
    cadence_status: conv.conversation_state?.cadence_status || 'N/A',
    qualification_coaching_interest: conv.conversation_state?.qualification_coaching_interest || 'unknown',
    qualification_revenue_mix: conv.conversation_state?.qualification_revenue_mix || 'unknown',
    escalation_level: conv.conversation_state?.escalation_level || 1,
    has_work_items: conv.work_items ? 'Yes' : 'No',
    sms_count: conv.sms_events?.length || 0,
    lead_source: conv.inbox_contact_profiles?.[0]?.lead_source || 'N/A',
  }));

  await csvWriter.writeRecords(records);
  console.log(`✅ Exported ${records.length} conversations to ${outputFile}`);
  return records;
}

/**
 * Export SMS events to CSV
 */
export async function exportSMSEvents(options = {}) {
  const {
    startDate = null,
    endDate = null,
    direction = null,
    sequence = null,
    limit = 5000,
    outputFile = 'sms_events_export.csv'
  } = options;

  const where = {};
  if (direction) where.direction = direction;
  if (sequence) where.sequence = { contains: sequence };
  if (startDate || endDate) {
    where.event_ts = {};
    if (startDate) where.event_ts.gte = new Date(startDate);
    if (endDate) where.event_ts.lte = new Date(endDate);
  }

  const events = await prisma.sms_events.findMany({
    where,
    take: limit,
    orderBy: { event_ts: 'desc' },
  });

  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'id', title: 'Event ID' },
      { id: 'event_ts', title: 'Timestamp' },
      { id: 'direction', title: 'Direction' },
      { id: 'contact_id', title: 'Contact ID' },
      { id: 'contact_phone', title: 'Phone' },
      { id: 'contact_name', title: 'Contact Name' },
      { id: 'aloware_user', title: 'Aloware User' },
      { id: 'sequence', title: 'Sequence' },
      { id: 'body', title: 'Message Body' },
      { id: 'line', title: 'Line' },
      { id: 'conversation_id', title: 'Conversation ID' },
    ]
  });

  const records = events.map(event => ({
    id: event.id,
    event_ts: event.event_ts.toISOString(),
    direction: event.direction,
    contact_id: event.contact_id || 'N/A',
    contact_phone: event.contact_phone || 'N/A',
    contact_name: event.contact_name || 'Unknown',
    aloware_user: event.aloware_user || 'N/A',
    sequence: event.sequence || 'N/A',
    body: event.body || '',
    line: event.line || 'N/A',
    conversation_id: event.conversation_id || 'N/A',
  }));

  await csvWriter.writeRecords(records);
  console.log(`✅ Exported ${records.length} SMS events to ${outputFile}`);
  return records;
}

/**
 * Export booked calls with attribution data
 */
export async function exportBookedCalls(options = {}) {
  const {
    startDate = null,
    endDate = null,
    limit = 500,
    outputFile = 'booked_calls_export.csv'
  } = options;

  const where = {};
  if (startDate || endDate) {
    where.event_ts = {};
    if (startDate) where.event_ts.gte = new Date(startDate);
    if (endDate) where.event_ts.lte = new Date(endDate);
  }

  const calls = await prisma.booked_calls.findMany({
    where,
    take: limit,
    orderBy: { event_ts: 'desc' },
  });

  // Get attribution data for these calls
  const attributions = await prisma.booked_call_attribution.findMany({
    where: {
      booked_call_id: { in: calls.map(c => c.id) }
    }
  });

  const attributionMap = new Map(attributions.map(a => [a.booked_call_id, a]));

  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'id', title: 'Call ID' },
      { id: 'event_ts', title: 'Booked Timestamp' },
      { id: 'text', title: 'Call Text' },
      { id: 'first_sms_touch_at', title: 'First SMS Touch' },
      { id: 'slack_channel_id', title: 'Slack Channel' },
      { id: 'slack_message_ts', title: 'Slack Message TS' },
      { id: 'setter_final', title: 'Setter' },
      { id: 'closer_final', title: 'Closer' },
      { id: 'source_bucket', title: 'Source' },
      { id: 'conversation_id', title: 'Conversation ID' },
      { id: 'mapping_method', title: 'Mapping Method' },
    ]
  });

  const records = calls.map(call => {
    const attr = attributionMap.get(call.id);
    return {
      id: call.id,
      event_ts: call.event_ts.toISOString(),
      text: call.text || 'N/A',
      first_sms_touch_at: call.first_sms_touch_at?.toISOString() || 'N/A',
      slack_channel_id: call.slack_channel_id,
      slack_message_ts: call.slack_message_ts,
      setter_final: attr?.setter_final || 'N/A',
      closer_final: attr?.closer_final || 'N/A',
      source_bucket: attr?.source_bucket || 'N/A',
      conversation_id: attr?.conversation_id || 'N/A',
      mapping_method: attr?.mapping_method || 'N/A',
    };
  });

  await csvWriter.writeRecords(records);
  console.log(`✅ Exported ${records.length} booked calls to ${outputFile}`);
  return records;
}

/**
 * Export sequence performance metrics
 */
export async function exportSequencePerformance(options = {}) {
  const {
    days = 30,
    outputFile = 'sequence_performance_export.csv'
  } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const sequences = await prisma.sequence_registry.findMany({
    where: { status: 'active' },
    include: {
      sms_events: {
        where: {
          event_ts: { gte: startDate }
        }
      },
      facts_sms: {
        where: {
          day: { gte: startDate }
        }
      }
    }
  });

  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'sequence_label', title: 'Sequence' },
      { id: 'normalized_label', title: 'Normalized Label' },
      { id: 'owner_rep', title: 'Owner' },
      { id: 'is_manual', title: 'Is Manual' },
      { id: 'total_messages', title: 'Total Messages' },
      { id: 'outbound', title: 'Outbound' },
      { id: 'inbound', title: 'Inbound' },
      { id: 'reply_rate', title: 'Reply Rate %' },
      { id: 'unique_contacts', title: 'Unique Contacts' },
      { id: 'avg_daily_volume', title: 'Avg Daily Volume' },
    ]
  });

  const records = sequences.map(seq => {
    const outbound = seq.sms_events.filter(e => e.direction === 'outbound').length;
    const inbound = seq.sms_events.filter(e => e.direction === 'inbound').length;
    const total = seq.sms_events.length;
    const replyRate = outbound > 0 ? ((inbound / outbound) * 100).toFixed(2) : '0.00';
    
    const uniqueContacts = new Set(seq.sms_events.map(e => e.contact_phone).filter(Boolean)).size;
    const avgDaily = (total / days).toFixed(1);

    return {
      sequence_label: seq.label,
      normalized_label: seq.normalized_label,
      owner_rep: seq.owner_rep || 'N/A',
      is_manual: seq.is_manual_bucket ? 'Yes' : 'No',
      total_messages: total,
      outbound,
      inbound,
      reply_rate: replyRate,
      unique_contacts: uniqueContacts,
      avg_daily_volume: avgDaily,
    };
  });

  await csvWriter.writeRecords(records);
  console.log(`✅ Exported ${records.length} sequences to ${outputFile}`);
  return records;
}

/**
 * Main CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'conversations':
        await exportConversations({
          status: args[1],
          startDate: args[2],
          endDate: args[3],
          outputFile: args[4] || 'conversations_export.csv'
        });
        break;

      case 'sms':
        await exportSMSEvents({
          direction: args[1],
          startDate: args[2],
          endDate: args[3],
          outputFile: args[4] || 'sms_events_export.csv'
        });
        break;

      case 'calls':
        await exportBookedCalls({
          startDate: args[1],
          endDate: args[2],
          outputFile: args[3] || 'booked_calls_export.csv'
        });
        break;

      case 'sequences':
        await exportSequencePerformance({
          days: parseInt(args[1]) || 30,
          outputFile: args[2] || 'sequence_performance_export.csv'
        });
        break;

      default:
        console.log(`
📊 Database Export Tool

Usage:
  railway run node --import tsx export-data.mjs <command> [options]

Commands:
  conversations [status] [startDate] [endDate] [outputFile]
    Export conversations with full details
    Example: railway run node --import tsx export-data.mjs conversations open 2026-03-01

  sms [direction] [startDate] [endDate] [outputFile]
    Export SMS events
    Example: railway run node --import tsx export-data.mjs sms inbound 2026-03-01

  calls [startDate] [endDate] [outputFile]
    Export booked calls with attribution
    Example: railway run node --import tsx export-data.mjs calls 2026-03-01

  sequences [days] [outputFile]
    Export sequence performance metrics
    Example: railway run node --import tsx export-data.mjs sequences 30
        `);
    }
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
