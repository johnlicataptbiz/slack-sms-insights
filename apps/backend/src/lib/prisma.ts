import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

type PrismaMode = 'accelerate' | 'direct' | 'local';

const resolvePrismaConfig = (): { mode: PrismaMode; url?: string } => {
  const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  if (accelerateUrl && accelerateUrl.startsWith('prisma+postgres://')) {
    return { mode: 'accelerate', url: accelerateUrl };
  }

  if (databaseUrl && databaseUrl.startsWith('prisma+postgres://')) {
    return { mode: 'accelerate', url: databaseUrl };
  }

  if (databaseUrl) {
    return { mode: 'direct', url: databaseUrl };
  }

  // Fallback to local (no DATABASE_URL set)
  return { mode: 'local' };
};

const createPrismaClient = (): PrismaClient => {
  const config = resolvePrismaConfig();

  if (config.mode === 'accelerate' && config.url) {
    // Prisma Accelerate requires $extends pattern; type assertion is necessary
    // because the Accelerate extension adds methods not in the base PrismaClient type
    const client = new PrismaClient({ accelerateUrl: config.url });
    return client.$extends(withAccelerate()) as unknown as PrismaClient;
  }

  if (config.mode === 'direct' && config.url) {
    const pool = new Pool({ connectionString: config.url });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }

  // Local mode: plain PrismaClient
  return new PrismaClient({ log: ['warn', 'error'] });
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const getPrismaClient = () => prisma;
export const getPrisma = getPrismaClient;

export const connectPrisma = async () => {
  await prisma.$connect();
};

export default prisma;

export type PrismaStatus = {
  status: 'ok' | 'warn' | 'error';
  configured: boolean;
  detail: string;
};

export const getPrismaRuntimeStatus = async (): Promise<PrismaStatus> => {
  const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const configured = accelerateUrl || databaseUrl;

  if (!configured) {
    return {
      status: 'warn',
      configured: false,
      detail: 'Prisma database URL is not configured',
    };
  }

  try {
    const client = getPrismaClient();
    const queryArgs = { select: { id: true }, take: 1 };
    await client.conversation.findMany(queryArgs);
    return {
      status: 'ok',
      configured: true,
      detail: 'Prisma query check passed',
    };
  } catch (error) {
    console.error('Prisma runtime status check failed:', error);
    return {
      status: 'error',
      configured: true,
      detail: `Prisma query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
