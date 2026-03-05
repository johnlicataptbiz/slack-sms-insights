import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

type PrismaMode = 'accelerate' | 'direct';

type PrismaRuntimeClient = PrismaClient;

let prismaAccelerate: PrismaRuntimeClient | undefined;
let prismaDirect: PrismaRuntimeClient | undefined;
let prismaMode: PrismaMode | undefined;
let prismaDetail: string | undefined;

const resolvePrismaConfig = (): { url: string; mode: PrismaMode; detail?: string } => {
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
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = config.url;
  }
  if (config.mode === 'accelerate' && !process.env.PRISMA_ACCELERATE_URL) {
    process.env.PRISMA_ACCELERATE_URL = config.url;
  }

  const prismaClientOptions: any = {
    datasources: {
      db: {
        url: config.url,
      },
    },
  };

  if (config.mode === 'accelerate') {
    return (new PrismaClient(prismaClientOptions) as any).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  return new PrismaClient(prismaClientOptions);
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
