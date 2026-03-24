import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

type PrismaMode = 'accelerate' | 'direct';

type PrismaRuntimeClient = PrismaClient;

let prismaAccelerate: PrismaRuntimeClient | undefined;
let prismaDirect: PrismaRuntimeClient | undefined;
let prismaMode: PrismaMode | undefined;
let prismaDetail: string | undefined;

const resolvePrismaConfig = (): {
  url: string;
  mode: PrismaMode;
  detail?: string;
} => {
  const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  if (accelerateUrl) {
    if (accelerateUrl.startsWith('prisma+postgres://')) {
      return { url: accelerateUrl, mode: 'accelerate' };
    }
    if (databaseUrl) {
      return {
        url: databaseUrl,
        mode: databaseUrl.startsWith('prisma+postgres://') ? 'accelerate' : 'direct',
        detail: 'PRISMA_ACCELERATE_URL ignored (expected prisma+postgres://), using DATABASE_URL',
      };
    }
    throw new Error('PRISMA_ACCELERATE_URL must start with prisma+postgres://');
  }

  if (databaseUrl) {
    return {
      url: databaseUrl,
      mode: databaseUrl.startsWith('prisma+postgres://') ? 'accelerate' : 'direct',
    };
  }

  throw new Error('Missing PRISMA_ACCELERATE_URL or DATABASE_URL');
};

const createPrismaClient = (config: { url: string; mode: PrismaMode }) => {
  if (config.mode === 'accelerate') {
    // Prisma 7 client engine expects accelerateUrl rather than the old datasourceUrl option.
    const clientOptions = { accelerateUrl: config.url } as unknown as Prisma.PrismaClientOptions;
    return (new PrismaClient(clientOptions) as PrismaClient).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  // Direct connection - For Prisma 7, we need to provide an accelerateUrl even for direct connections
  // or use an adapter. Since we don't have an adapter, we'll tell it to use accelerate mode
  // but with the regular DATABASE_URL
  if (config.url.startsWith('postgresql://')) {
    // Convert to accelerate format for Prisma 7 compatibility
    const accelerateUrl = config.url.replace('postgresql://', 'prisma+postgres://');
    const clientOptions = { accelerateUrl } as unknown as Prisma.PrismaClientOptions;
    return (new PrismaClient(clientOptions) as PrismaClient).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  // Fallback: try direct connection with minimal config
  return new PrismaClient({
    log: ['error', 'warn'],
  });
};

export const getPrismaClient = (): PrismaRuntimeClient => {
  if (prismaMode === 'accelerate' && prismaAccelerate) {
    return prismaAccelerate;
  }
  if (prismaMode === 'direct' && prismaDirect) {
    return prismaDirect;
  }

  const config = resolvePrismaConfig();
  prismaMode = config.mode;
  prismaDetail = config.detail;
  const client = createPrismaClient(config);
  if (config.mode === 'accelerate') {
    prismaAccelerate = client as PrismaRuntimeClient;
    return prismaAccelerate;
  }
  prismaDirect = client as PrismaRuntimeClient;
  return prismaDirect;
};
export const getPrisma = getPrismaClient;

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
    if (prismaMode === 'accelerate') {
      await client.conversation.findMany({
        ...queryArgs,
        cacheStrategy: { ttl: 60 },
      } as Parameters<typeof client.conversation.findMany>[0]);
    } else {
      await client.conversation.findMany(queryArgs);
    }
    const baseDetail =
      prismaMode === 'accelerate' ? 'Prisma Accelerate query check passed (cached)' : 'Prisma query check passed';
    return {
      status: 'ok',
      configured: true,
      detail: prismaDetail ? `${baseDetail} · ${prismaDetail}` : baseDetail,
    };
  } catch (error) {
    console.error('Prisma runtime status check failed:', error);
    if (error instanceof Error) {
      if (error.message.includes('prisma+postgres://')) {
        return {
          status: 'warn',
          configured: false,
          detail: error.message,
        };
      }
      if (error.message.includes('Missing PRISMA_ACCELERATE_URL')) {
        return {
          status: 'warn',
          configured: false,
          detail: error.message,
        };
      }
      if (
        error.message.includes('PrismaClient') &&
        (error.message.includes('PrismaClientOptions') || error.message.includes('datasourceUrl'))
      ) {
        return {
          status: 'warn',
          configured: true,
          detail: `Prisma runtime configuration warning: ${error.message}`,
        };
      }
    }
    return {
      status: 'error',
      configured: true,
      detail: `Prisma query failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
