import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

async function testConnection() {
  console.log('Testing Prisma Initialization Approaches...\n');

  const configs = [
    { name: 'Default (no options)', options: {} },
    { name: 'datasourceUrl (Direct)', options: { datasourceUrl: process.env.DATABASE_URL } },
    { name: 'accelerateUrl (Accelerate)', options: { accelerateUrl: process.env.PRISMA_ACCELERATE_URL } },
    { name: 'datasources.db.url', options: { datasources: { db: { url: process.env.DATABASE_URL } } } },
  ];

  for (const config of configs) {
    console.log(`--- Testing: ${config.name} ---`);
    try {
      // @ts-ignore
      const client = new PrismaClient(config.options);
      console.log(`✅ ${config.name}: Constructor accepted.`);
      
      try {
        await client.$connect();
        console.log(`✅ ${config.name}: $connect() successful.`);
      } catch (connError: any) {
        console.log(`❌ ${config.name}: $connect() failed:`, connError.message);
      } finally {
        await client.$disconnect();
      }
    } catch (err: any) {
      console.log(`❌ ${config.name}: Constructor failed:`, err.message);
    }
    console.log('');
  }
}

testConnection().catch(console.error);
