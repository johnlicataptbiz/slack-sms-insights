import { withAccelerate } from '@prisma/extension-accelerate';
import { PrismaClient } from '@prisma/client';

let prisma: ReturnType<typeof createPrismaClient> | undefined;

const resolvePrismaUrl = (): string => {
  const configured = (
    process.env.PRISMA_ACCELERATE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  if (!configured) {
    throw new Error('Missing PRISMA_ACCELERATE_URL or DATABASE_URL');
  }
  if (!configured.startsWith('prisma+postgres://')) {
    throw new Error('Prisma Accelerate requires a prisma+postgres:// connection string');
  }
  return configured;
};

const createPrismaClient = () => {
  return new PrismaClient({
    accelerateUrl: resolvePrismaUrl(),
  }).$extends(withAccelerate());
};

export const getPrismaClient = () => {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
};

export type PrismaStatus = {
  status: 'ok' | 'warn' | 'error';
  configured: boolean;
  detail: string;
};

export const getPrismaRuntimeStatus = async (): Promise<PrismaStatus> => {
  const configured = (
    process.env.PRISMA_ACCELERATE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  if (!configured) {
    return {
      status: 'warn',
      configured: false,
      detail: 'Prisma Accelerate URL is not configured',
    };
  }
  if (!configured.startsWith('prisma+postgres://')) {
    return {
      status: 'warn',
      configured: false,
      detail: 'Prisma Accelerate disabled (expected prisma+postgres:// URL)',
    };
  }

  try {
    await getPrismaClient().conversation.findMany({
      select: { id: true },
      take: 1,
      cacheStrategy: { ttl: 60 },
    });
    return {
      status: 'ok',
      configured: true,
      detail: 'Prisma Accelerate query check passed (cached)',
    };
  } catch (error) {
    return {
      status: 'error',
      configured: true,
      detail: `Prisma Accelerate query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
