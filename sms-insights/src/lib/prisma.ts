import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const buildPrismaClient = (): PrismaClient => {
  const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  const log =
    process.env.NODE_ENV === 'development'
      ? (['query', 'error', 'warn'] as const)
      : (['error'] as const);

  if (accelerateUrl.startsWith('prisma+postgres://')) {
    return new PrismaClient({
      log,
      accelerateUrl,
    } as Prisma.PrismaClientOptions);
  }

  if (databaseUrl.startsWith('prisma+postgres://')) {
    return new PrismaClient({
      log,
      accelerateUrl: databaseUrl,
    } as Prisma.PrismaClientOptions);
  }

  if (databaseUrl) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({
      log,
      adapter,
    } as Prisma.PrismaClientOptions);
  }

  throw new Error('Missing DATABASE_URL or PRISMA_ACCELERATE_URL');
};

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const connectPrisma = async () => {
  await prisma.$connect();
};

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};

export const healthCheck = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
};

export default prisma;
