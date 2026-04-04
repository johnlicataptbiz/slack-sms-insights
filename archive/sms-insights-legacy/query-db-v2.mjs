import { getPrismaClient } from './services/prisma.ts';

async function queryDatabase() {
  try {
    console.log('🔌 Connecting to database via project Prisma client...\n');
    
    const prisma = getPrismaClient();
    
    // Get counts of main tables
    const [
      conversationCount,
      smsEventCount,
      bookedCallCount,
      workItemCount,
      contactCount
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.sms_events.count(),
      prisma.booked_calls.count(),
      prisma.work_items.count(),
      prisma.inbox_contact_profiles.count()
    ]);
    
    console.log('✅ Database connection successful!\n');
    console.log('📊 Table Counts:');
    console.log(`   Conversations: ${conversationCount.toLocaleString()}`);
    console.log(`   SMS Events: ${smsEventCount.toLocaleString()}`);
    console.log(`   Booked Calls: ${bookedCallCount.toLocaleString()}`);
    console.log(`   Work Items: ${workItemCount.toLocaleString()}`);
    console.log(`   Contacts: ${contactCount.toLocaleString()}`);
    console.log('');
    
    // Get some recent SMS events
    console.log('📨 Recent SMS Events (last 5):');
    const recentSMS = await prisma.sms_events.findMany({
      take: 5,
      orderBy: { event_ts: 'desc' },
      select: {
        event_ts: true,
        direction: true,
        contact_name: true,
        contact_phone: true,
        body: true,
        sequence: true
      }
    });
    
    recentSMS.forEach((sms, idx) => {
      console.log(`\n   ${idx + 1}. ${sms.direction} - ${sms.event_ts.toISOString()}`);
      console.log(`      Contact: ${sms.contact_name || 'Unknown'} (${sms.contact_phone || 'N/A'})`);
      console.log(`      Sequence: ${sms.sequence || 'N/A'}`);
      console.log(`      Message: ${sms.body?.substring(0, 100)}${sms.body?.length > 100 ? '...' : ''}`);
    });
    
    console.log('\n');
    
    // Get some conversation stats
    const conversationStats = await prisma.conversation.groupBy({
      by: ['status'],
      _count: true
    });
    
    console.log('💬 Conversations by Status:');
    conversationStats.forEach(stat => {
      console.log(`   ${stat.status}: ${stat._count}`);
    });
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
}

queryDatabase();
