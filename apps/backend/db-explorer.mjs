import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  title: (text) => console.log(`\n${colors.bright}${colors.cyan}${text}${colors.reset}`),
  success: (text) => console.log(`${colors.green}✓${colors.reset} ${text}`),
  error: (text) => console.log(`${colors.red}✗${colors.reset} ${text}`),
  info: (text) => console.log(`${colors.blue}ℹ${colors.reset} ${text}`),
  data: (text) => console.log(`  ${colors.dim}${text}${colors.reset}`),
  header: (text) => console.log(`\n${colors.bright}${text}${colors.reset}`),
  separator: () => console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}`),
};

// Helper to format numbers
const fmt = (num) => num?.toLocaleString() || '0';

// Helper to format dates
const fmtDate = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

async function getOverview() {
  log.title('📊 DATABASE OVERVIEW');

  const [
    conversationCount,
    smsEventCount,
    bookedCallCount,
    workItemCount,
    contactCount,
    sequenceCount,
    draftCount,
    sendAttemptCount,
  ] = await Promise.all([
    prisma.conversation.count(),
    prisma.sms_events.count(),
    prisma.booked_calls.count(),
    prisma.work_items.count(),
    prisma.inbox_contact_profiles.count(),
    prisma.sequence_registry.count(),
    prisma.draft_suggestions.count(),
    prisma.send_attempts.count(),
  ]);

  log.header('Main Tables:');
  log.data(`Conversations:      ${fmt(conversationCount)}`);
  log.data(`SMS Events:         ${fmt(smsEventCount)}`);
  log.data(`Booked Calls:       ${fmt(bookedCallCount)}`);
  log.data(`Work Items:         ${fmt(workItemCount)}`);
  log.data(`Contacts:           ${fmt(contactCount)}`);
  log.data(`Sequences:          ${fmt(sequenceCount)}`);
  log.data(`Draft Suggestions:  ${fmt(draftCount)}`);
  log.data(`Send Attempts:      ${fmt(sendAttemptCount)}`);

  // Conversation breakdown
  log.header('Conversation Status Breakdown:');
  const convStats = await prisma.conversation.groupBy({
    by: ['status'],
    _count: true,
    orderBy: { _count: { status: 'desc' } },
  });
  convStats.forEach((stat) => {
    log.data(`${stat.status.padEnd(15)} ${fmt(stat._count)}`);
  });

  // Work items breakdown
  log.header('Work Items by Type:');
  const workStats = await prisma.work_items.groupBy({
    by: ['type'],
    _count: true,
    where: { resolved_at: null },
  });
  workStats.forEach((stat) => {
    log.data(`${stat.type.padEnd(15)} ${fmt(stat._count)} (unresolved)`);
  });
}

async function getRecentActivity() {
  log.title('📨 RECENT SMS ACTIVITY');

  const recentSMS = await prisma.sms_events.findMany({
    take: 10,
    orderBy: { event_ts: 'desc' },
    select: {
      event_ts: true,
      direction: true,
      contact_name: true,
      contact_phone: true,
      body: true,
      sequence: true,
      aloware_user: true,
    },
  });

  recentSMS.forEach((sms, idx) => {
    log.separator();
    const dir = sms.direction === 'inbound' ? '📥' : '📤';
    log.header(`${idx + 1}. ${dir} ${sms.direction.toUpperCase()} - ${fmtDate(sms.event_ts)}`);
    log.data(`Contact:  ${sms.contact_name || 'Unknown'} (${sms.contact_phone || 'N/A'})`);
    if (sms.aloware_user) log.data(`User:     ${sms.aloware_user}`);
    if (sms.sequence) log.data(`Sequence: ${sms.sequence}`);
    log.data(`Message:  ${sms.body?.substring(0, 150)}${sms.body?.length > 150 ? '...' : ''}`);
  });
}

async function getBookedCallStats() {
  log.title('📞 BOOKED CALLS ANALYSIS');

  // Recent booked calls
  const recentCalls = await prisma.booked_calls.findMany({
    take: 10,
    orderBy: { event_ts: 'desc' },
    select: {
      event_ts: true,
      text: true,
      first_sms_touch_at: true,
    },
  });

  log.header('Recent Booked Calls (Last 10):');
  recentCalls.forEach((call, idx) => {
    log.separator();
    log.header(`${idx + 1}. ${fmtDate(call.event_ts)}`);
    if (call.first_sms_touch_at) {
      const touchDiff = Math.floor(
        (new Date(call.event_ts) - new Date(call.first_sms_touch_at)) / (1000 * 60 * 60 * 24),
      );
      log.data(`First SMS Touch: ${fmtDate(call.first_sms_touch_at)} (${touchDiff} days before booking)`);
    }
    log.data(`Text: ${call.text?.substring(0, 120)}${call.text?.length > 120 ? '...' : ''}`);
  });

  // Calls by date
  const callsByDate = await prisma.$queryRaw`
    SELECT 
      DATE(event_ts) as date,
      COUNT(*) as count
    FROM booked_calls
    WHERE event_ts >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(event_ts)
    ORDER BY date DESC
    LIMIT 10
  `;

  log.header('\nBooked Calls - Last 30 Days:');
  callsByDate.forEach((row) => {
    log.data(`${new Date(row.date).toLocaleDateString().padEnd(15)} ${fmt(row.count)} calls`);
  });
}

async function getSequencePerformance() {
  log.title('🎯 SEQUENCE PERFORMANCE');

  const sequences = await prisma.sequence_registry.findMany({
    where: { status: 'active' },
    select: {
      label: true,
      normalized_label: true,
      owner_rep: true,
      is_manual_bucket: true,
      sms_events: {
        where: {
          event_ts: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: {
          direction: true,
        },
      },
    },
    take: 15,
  });

  log.header('Active Sequences (Last 30 days activity):');
  sequences.forEach((seq, idx) => {
    const outbound = seq.sms_events.filter((e) => e.direction === 'outbound').length;
    const inbound = seq.sms_events.filter((e) => e.direction === 'inbound').length;
    const total = seq.sms_events.length;

    if (total > 0) {
      log.separator();
      log.header(`${idx + 1}. ${seq.label}`);
      log.data(`Owner: ${seq.owner_rep || 'N/A'} | Manual: ${seq.is_manual_bucket ? 'Yes' : 'No'}`);
      log.data(
        `Total: ${fmt(total)} | Outbound: ${fmt(outbound)} | Inbound: ${fmt(inbound)} | Reply Rate: ${total > 0 ? ((inbound / outbound) * 100).toFixed(1) : 0}%`,
      );
    }
  });
}

async function getWorkItemsSummary() {
  log.title('📋 WORK ITEMS SUMMARY');

  const openItems = await prisma.work_items.findMany({
    where: { resolved_at: null },
    orderBy: { due_at: 'asc' },
    take: 15,
    select: {
      type: true,
      severity: true,
      due_at: true,
      created_at: true,
      rep_id: true,
      conversations: {
        select: {
          contact_phone: true,
          contactKey: true,
        },
      },
    },
  });

  log.header('Open Work Items (Next 15 due):');
  openItems.forEach((item, idx) => {
    const overdue = new Date(item.due_at) < new Date();
    const dueLabel = overdue ? `${colors.red}OVERDUE${colors.reset}` : fmtDate(item.due_at);

    log.separator();
    log.header(`${idx + 1}. ${item.type.toUpperCase()} - ${dueLabel}`);
    log.data(`Severity: ${item.severity} | Rep: ${item.rep_id || 'Unassigned'}`);
    log.data(`Contact: ${item.conversations?.contact_phone || item.conversations?.contactKey || 'N/A'}`);
    log.data(`Created: ${fmtDate(item.created_at)}`);
  });
}

async function getContactQuality() {
  log.title('👥 CONTACT & LEAD QUALITY');

  // Revenue mix breakdown
  const revenueMix = await prisma.inbox_contact_profiles.groupBy({
    by: ['revenue_mix_category'],
    _count: true,
    orderBy: { _count: { revenue_mix_category: 'desc' } },
  });

  log.header('Revenue Mix Categories:');
  revenueMix.forEach((cat) => {
    log.data(`${cat.revenue_mix_category.padEnd(20)} ${fmt(cat._count)}`);
  });

  // Employment status
  const employment = await prisma.inbox_contact_profiles.groupBy({
    by: ['employment_status'],
    _count: true,
    orderBy: { _count: { employment_status: 'desc' } },
  });

  log.header('\nEmployment Status:');
  employment.forEach((emp) => {
    log.data(`${emp.employment_status.padEnd(20)} ${fmt(emp._count)}`);
  });

  // Coaching interest
  const interest = await prisma.inbox_contact_profiles.groupBy({
    by: ['coaching_interest'],
    _count: true,
    orderBy: { _count: { coaching_interest: 'desc' } },
  });

  log.header('\nCoaching Interest Level:');
  interest.forEach((int) => {
    log.data(`${int.coaching_interest.padEnd(20)} ${fmt(int._count)}`);
  });

  // Recent engagements
  const recentContacts = await prisma.inbox_contact_profiles.findMany({
    where: {
      last_engagement_at: { not: null },
    },
    orderBy: { last_engagement_at: 'desc' },
    take: 10,
    select: {
      name: true,
      phone: true,
      last_engagement_at: true,
      lead_source: true,
      coaching_interest: true,
      employment_status: true,
    },
  });

  log.header('\nRecently Engaged Contacts:');
  recentContacts.forEach((contact, idx) => {
    log.separator();
    log.header(`${idx + 1}. ${contact.name || 'Unknown'} (${contact.phone || 'N/A'})`);
    log.data(`Last Engaged: ${fmtDate(contact.last_engagement_at)}`);
    log.data(
      `Source: ${contact.lead_source || 'N/A'} | Interest: ${contact.coaching_interest} | Employment: ${contact.employment_status}`,
    );
  });
}

async function getDailyMetrics() {
  log.title('📈 DAILY METRICS (Last 7 Days)');

  const dailyData = await prisma.$queryRaw`
    SELECT 
      DATE(event_ts) as date,
      direction,
      COUNT(*) as count
    FROM sms_events
    WHERE event_ts >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(event_ts), direction
    ORDER BY date DESC, direction
  `;

  // Group by date
  const byDate = {};
  dailyData.forEach((row) => {
    const dateStr = new Date(row.date).toLocaleDateString();
    if (!byDate[dateStr]) {
      byDate[dateStr] = { inbound: 0, outbound: 0 };
    }
    byDate[dateStr][row.direction] = Number(row.count);
  });

  log.header('SMS Activity:');
  Object.entries(byDate).forEach(([date, data]) => {
    const total = data.inbound + data.outbound;
    log.data(
      `${date.padEnd(15)} Total: ${fmt(total).padEnd(8)} | Out: ${fmt(data.outbound).padEnd(8)} | In: ${fmt(data.inbound).padEnd(8)} | Reply Rate: ${data.outbound > 0 ? ((data.inbound / data.outbound) * 100).toFixed(1) : 0}%`,
    );
  });
}

// Main execution
async function main() {
  try {
    console.log(
      `\n${colors.bright}${colors.magenta}╔═══════════════════════════════════════════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(
      `${colors.bright}${colors.magenta}║                    SMS INSIGHTS DATABASE EXPLORER                             ║${colors.reset}`,
    );
    console.log(
      `${colors.bright}${colors.magenta}╚═══════════════════════════════════════════════════════════════════════════════╝${colors.reset}`,
    );

    log.success('Connected to database via Prisma Accelerate\n');

    // Run all queries
    await getOverview();
    await getDailyMetrics();
    await getRecentActivity();
    await getBookedCallStats();
    await getSequencePerformance();
    await getWorkItemsSummary();
    await getContactQuality();

    log.title('✨ QUERY COMPLETE');
    log.success('All data retrieved successfully!\n');
  } catch (error) {
    log.error(`Database error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
