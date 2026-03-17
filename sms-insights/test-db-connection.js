import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful!');
    
    // Get a count of some tables to verify we can query
    const conversationCount = await prisma.conversation.count();
    const smsEventCount = await prisma.sms_events.count();
    
    console.log(`📊 Found ${conversationCount} conversations`);
    console.log(`📊 Found ${smsEventCount} SMS events`);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
