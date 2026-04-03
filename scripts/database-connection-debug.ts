import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('🔍 Database Connection Diagnostic Tool');
    console.log('=====================================');

    const prisma = new PrismaClient();

    try {
        console.log('\n🔌 Attempting to connect to database...');
        
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        
        console.log('✅ Database Connection Successful!');
        console.log('Current Database Time:', result);

        console.log('\n📊 Database Diagnostic Info:');
        console.log('Prisma Client Version:', prisma.constructor.name);
        
    } catch (error) {
        console.error('❌ Database Connection Failed');
        console.error('Error Details:');
        console.error(error instanceof Error ? error.message : String(error));
        
        if (error instanceof Error) {
            console.error('\nStack Trace:');
            console.error(error.stack);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);