import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

async function testDatabaseConnection() {
  console.log('🔍 Database Connection Diagnostic');
  console.log('--------------------------------');

  // Check DATABASE_URL environment variable
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL is not set in environment');
    console.log('Please set DATABASE_URL in .env file');
    process.exit(1);
  }

  console.log('✅ DATABASE_URL is configured');

  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Successfully connected to database');

    // Perform a simple query to verify read access
    const boardCount = await prisma.mondayBoardRegistry.count();
    console.log(`📊 Total Board Registries: ${boardCount}`);

    // Check database provider
    console.log(`💾 Database Provider: PostgreSQL`);
  } catch (error) {
    console.error('❌ Database Connection Failed');
    console.error('Detailed Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseConnection().catch(console.error);