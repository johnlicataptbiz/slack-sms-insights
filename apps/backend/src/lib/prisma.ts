import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaCompatStore?: CompatStore;
};

type PrismaMode = 'accelerate' | 'direct' | 'local';

type CompatUser = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  department: string | null;
  teamId: string | null;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CompatSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  deviceInfo: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type CompatPasswordResetToken = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

type CompatSystemConfig = {
  id: string;
  category: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
};

type CompatAuditLog = {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
};

type CompatStore = {
  users: CompatUser[];
  sessions: CompatSession[];
  passwordResetTokens: CompatPasswordResetToken[];
  systemConfigs: CompatSystemConfig[];
  auditLogs: CompatAuditLog[];
};

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

  return { mode: 'local' };
};

const getCompatStore = (): CompatStore => {
  if (!globalForPrisma.prismaCompatStore) {
    globalForPrisma.prismaCompatStore = {
      users: [],
      sessions: [],
      passwordResetTokens: [],
      systemConfigs: [],
      auditLogs: [],
    };
  }

  return globalForPrisma.prismaCompatStore;
};

const applySelect = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => {
  if (!select) {
    return row;
  }

  const selected = {} as Record<string, unknown>;
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      selected[key] = row[key];
    }
  }

  return selected;
};

const containsInsensitive = (value: string | null | undefined, needle: string) => {
  return (value || '').toLowerCase().includes(needle.toLowerCase());
};

const applyOrdering = <T extends Record<string, unknown>>(rows: T[], orderBy?: Record<string, 'asc' | 'desc'>) => {
  if (!orderBy) {
    return rows;
  }

  const [field, direction] = Object.entries(orderBy)[0] || [];
  if (!field || !direction) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) {
      return 0;
    }
    if (left === undefined || left === null) {
      return direction === 'asc' ? -1 : 1;
    }
    if (right === undefined || right === null) {
      return direction === 'asc' ? 1 : -1;
    }
    return left < right ? (direction === 'asc' ? -1 : 1) : (direction === 'asc' ? 1 : -1);
  });
};

const applyPagination = <T>(rows: T[], skip?: number, take?: number) => {
  const from = Math.max(skip || 0, 0);
  const to = take === undefined ? undefined : from + Math.max(take, 0);
  return rows.slice(from, to);
};

const attachCompatDelegates = (client: PrismaClient): PrismaClient => {
  const prismaAny = client as any;
  const store = getCompatStore();

  // Bridge legacy camelCase delegate usage to current snake_case Prisma models.
  const delegateAliases: Array<[legacy: string, current: string]> = [
    ['conversation', 'conversations'],
    ['sequenceRegistry', 'sequence_registry'],
    ['dailyRun', 'daily_runs'],
    ['mondaySyncState', 'monday_sync_state'],
    ['mondayColumnMapping', 'monday_column_mappings'],
    ['mondayBoardRegistry', 'monday_board_registry'],
    ['mondayBookedCallPushes', 'monday_booked_call_pushes'],
    ['mondayCallSnapshots', 'monday_call_snapshots'],
    ['mondayWeeklyReports', 'monday_weekly_reports'],
    ['mondayMetricFacts', 'monday_metric_facts'],
    ['actorDirectory', 'actor_directory'],
    ['leadOutcomes', 'lead_outcomes'],
    ['leadAttribution', 'lead_attribution'],
    ['setterActivity', 'setter_activity'],
    ['mondayCallColumnLatest', 'monday_call_column_latest'],
    ['mondayCallColumnHistory', 'monday_call_column_history'],
    ['workItem', 'work_items'],
    ['smsEvent', 'sms_events'],
  ];

  for (const [legacy, current] of delegateAliases) {
    if (!prismaAny[legacy] && prismaAny[current]) {
      prismaAny[legacy] = prismaAny[current];
    }
  }

  if (!prismaAny.user) {
    const matchesUserWhere = (user: CompatUser, where: any = {}) => {
      if (where.id) {
        if (typeof where.id === 'string' && user.id !== where.id) {
          return false;
        }
        if (where.id.in && Array.isArray(where.id.in) && !where.id.in.includes(user.id)) {
          return false;
        }
      }

      if (where.email && user.email !== where.email) {
        return false;
      }

      if (where.role && user.role !== where.role) {
        return false;
      }

      if (where.status && user.status !== where.status) {
        return false;
      }

      if (where.OR && Array.isArray(where.OR)) {
        const matchesOr = where.OR.some((candidate: any) => {
          if (candidate.email?.contains) {
            return containsInsensitive(user.email, candidate.email.contains);
          }
          if (candidate.firstName?.contains) {
            return containsInsensitive(user.firstName, candidate.firstName.contains);
          }
          if (candidate.lastName?.contains) {
            return containsInsensitive(user.lastName, candidate.lastName.contains);
          }
          return false;
        });

        if (!matchesOr) {
          return false;
        }
      }

      return true;
    };

    prismaAny.user = {
      async create(args: any) {
        const now = new Date();
        const user: CompatUser = {
          id: args?.data?.id || randomUUID(),
          email: args?.data?.email,
          passwordHash: args?.data?.passwordHash,
          firstName: args?.data?.firstName || '',
          lastName: args?.data?.lastName || '',
          role: args?.data?.role || 'user',
          status: args?.data?.status || 'active',
          department: args?.data?.department ?? null,
          teamId: args?.data?.teamId ?? null,
          lastLogin: args?.data?.lastLogin ?? null,
          createdAt: args?.data?.createdAt || now,
          updatedAt: args?.data?.updatedAt || now,
        };

        store.users.push(user);
        return user;
      },
      async createMany(args: any) {
        const rows = Array.isArray(args?.data) ? args.data : [args?.data].filter(Boolean);
        for (const row of rows) {
          await this.create({ data: row });
        }
        return { count: rows.length };
      },
      async findUnique(args: any) {
        return (
          store.users.find((user) => {
            if (args?.where?.id) {
              return user.id === args.where.id;
            }
            if (args?.where?.email) {
              return user.email === args.where.email;
            }
            return false;
          }) || null
        );
      },
      async findMany(args: any = {}) {
        const filtered = store.users.filter((user) => matchesUserWhere(user, args.where));
        const ordered = applyOrdering(filtered, args.orderBy);
        const paged = applyPagination(ordered, args.skip, args.take);
        return paged.map((user) => applySelect(user, args.select));
      },
      async count(args: any = {}) {
        return store.users.filter((user) => matchesUserWhere(user, args.where)).length;
      },
      async update(args: any) {
        const user = store.users.find((row) => row.id === args?.where?.id);
        if (!user) {
          throw new Error('User not found');
        }

        Object.assign(user, Object.fromEntries(Object.entries(args?.data || {}).filter(([, value]) => value !== undefined)));
        user.updatedAt = new Date();
        return user;
      },
      async updateMany(args: any) {
        const rows = store.users.filter((user) => matchesUserWhere(user, args.where));
        for (const row of rows) {
          Object.assign(row, Object.fromEntries(Object.entries(args?.data || {}).filter(([, value]) => value !== undefined)));
          row.updatedAt = new Date();
        }
        return { count: rows.length };
      },
      async deleteMany(args: any = {}) {
        if (!args.where) {
          const count = store.users.length;
          store.users = [];
          return { count };
        }

        const keep = store.users.filter((user) => !matchesUserWhere(user, args.where));
        const count = store.users.length - keep.length;
        store.users = keep;
        return { count };
      },
    };
  }

  if (!prismaAny.session) {
    const matchesSessionWhere = (session: CompatSession, where: any = {}) => {
      if (where.userId && session.userId !== where.userId) {
        return false;
      }
      if (where.status && session.status !== where.status) {
        return false;
      }
      if (where.deviceInfo?.contains && !containsInsensitive(session.deviceInfo, where.deviceInfo.contains)) {
        return false;
      }
      return true;
    };

    prismaAny.session = {
      async create(args: any) {
        const now = new Date();
        const session: CompatSession = {
          id: args?.data?.id || randomUUID(),
          userId: args?.data?.userId,
          token: args?.data?.token || randomUUID(),
          expiresAt: args?.data?.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
          deviceInfo: args?.data?.deviceInfo || 'Unknown',
          status: args?.data?.status || 'active',
          createdAt: args?.data?.createdAt || now,
          updatedAt: args?.data?.updatedAt || now,
        };
        store.sessions.push(session);
        return session;
      },
      async findMany(args: any = {}) {
        const filtered = store.sessions.filter((session) => matchesSessionWhere(session, args.where));
        const ordered = applyOrdering(filtered, args.orderBy);
        const paged = applyPagination(ordered, args.skip, args.take);
        return paged.map((session) => applySelect(session, args.select));
      },
      async count(args: any = {}) {
        return store.sessions.filter((session) => matchesSessionWhere(session, args.where)).length;
      },
      async deleteMany(args: any = {}) {
        if (!args.where) {
          const count = store.sessions.length;
          store.sessions = [];
          return { count };
        }
        const keep = store.sessions.filter((session) => !matchesSessionWhere(session, args.where));
        const count = store.sessions.length - keep.length;
        store.sessions = keep;
        return { count };
      },
    };
  }

  if (!prismaAny.passwordResetToken) {
    prismaAny.passwordResetToken = {
      async create(args: any) {
        const token: CompatPasswordResetToken = {
          id: args?.data?.id || randomUUID(),
          userId: args?.data?.userId,
          token: args?.data?.token,
          expiresAt: args?.data?.expiresAt,
          createdAt: args?.data?.createdAt || new Date(),
        };
        store.passwordResetTokens.push(token);
        return token;
      },
      async findFirst(args: any = {}) {
        const where = args.where || {};
        const token =
          store.passwordResetTokens.find((row) => {
            if (where.token && row.token !== where.token) {
              return false;
            }
            if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) {
              return false;
            }
            return true;
          }) || null;

        if (!token) {
          return null;
        }

        if (args.include?.user) {
          return {
            ...token,
            user: store.users.find((user) => user.id === token.userId) || null,
          };
        }

        return token;
      },
      async delete(args: any) {
        const index = store.passwordResetTokens.findIndex((row) => row.id === args?.where?.id);
        if (index === -1) {
          throw new Error('Password reset token not found');
        }
        const [deleted] = store.passwordResetTokens.splice(index, 1);
        return deleted;
      },
      async deleteMany() {
        const count = store.passwordResetTokens.length;
        store.passwordResetTokens = [];
        return { count };
      },
    };
  }

  if (!prismaAny.systemConfig) {
    const matchesSystemConfigWhere = (config: CompatSystemConfig, where: any = {}) => {
      if (where.category && config.category !== where.category) {
        return false;
      }
      if (where.key && config.key !== where.key) {
        return false;
      }
      return true;
    };

    prismaAny.systemConfig = {
      async createMany(args: any) {
        const rows = Array.isArray(args?.data) ? args.data : [args?.data].filter(Boolean);
        for (const row of rows) {
          const now = new Date();
          store.systemConfigs.push({
            id: row.id || randomUUID(),
            category: row.category,
            key: row.key,
            value: row.value,
            createdAt: row.createdAt || now,
            updatedAt: row.updatedAt || now,
          });
        }
        return { count: rows.length };
      },
      async findMany(args: any = {}) {
        const filtered = store.systemConfigs.filter((row) => matchesSystemConfigWhere(row, args.where));
        const paged = applyPagination(filtered, args.skip, args.take);
        return paged.map((row) => applySelect(row, args.select));
      },
      async count(args: any = {}) {
        return store.systemConfigs.filter((row) => matchesSystemConfigWhere(row, args.where)).length;
      },
      async upsert(args: any) {
        const category = args?.where?.category_key?.category;
        const key = args?.where?.category_key?.key;
        const existing = store.systemConfigs.find((row) => row.category === category && row.key === key);
        if (existing) {
          Object.assign(existing, Object.fromEntries(Object.entries(args.update || {}).filter(([, value]) => value !== undefined)));
          existing.updatedAt = new Date();
          return existing;
        }

        const created: CompatSystemConfig = {
          id: args?.create?.id || randomUUID(),
          category: args?.create?.category,
          key: args?.create?.key,
          value: args?.create?.value,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.systemConfigs.push(created);
        return created;
      },
      async deleteMany() {
        const count = store.systemConfigs.length;
        store.systemConfigs = [];
        return { count };
      },
    };
  }

  if (!prismaAny.auditLog) {
    const matchesAuditLogWhere = (log: CompatAuditLog, where: any = {}) => {
      if (where.userId && log.userId !== where.userId) {
        return false;
      }
      if (where.action && log.action !== where.action) {
        return false;
      }
      if (where.resourceType && log.resourceType !== where.resourceType) {
        return false;
      }
      if (where.ipAddress && log.ipAddress !== where.ipAddress) {
        return false;
      }
      if (where.createdAt?.gte && log.createdAt < where.createdAt.gte) {
        return false;
      }
      if (where.createdAt?.lte && log.createdAt > where.createdAt.lte) {
        return false;
      }
      return true;
    };

    prismaAny.auditLog = {
      async createMany(args: any) {
        const rows = Array.isArray(args?.data) ? args.data : [args?.data].filter(Boolean);
        for (const row of rows) {
          store.auditLogs.push({
            id: row.id || randomUUID(),
            userId: row.userId ?? null,
            action: row.action,
            resourceType: row.resourceType,
            resourceId: row.resourceId || '',
            details: row.details || {},
            ipAddress: row.ipAddress ?? null,
            createdAt: row.createdAt || new Date(),
          });
        }
        return { count: rows.length };
      },
      async findMany(args: any = {}) {
        const filtered = store.auditLogs.filter((row) => matchesAuditLogWhere(row, args.where));
        const ordered = applyOrdering(filtered, args.orderBy);
        const paged = applyPagination(ordered, args.skip, args.take);
        return paged.map((row) => applySelect(row, args.select));
      },
      async count(args: any = {}) {
        return store.auditLogs.filter((row) => matchesAuditLogWhere(row, args.where)).length;
      },
      async deleteMany() {
        const count = store.auditLogs.length;
        store.auditLogs = [];
        return { count };
      },
    };
  }

  return client;
};

const createPrismaClient = (): PrismaClient => {
  const config = resolvePrismaConfig();

  if (config.mode === 'accelerate' && config.url) {
    const client = new PrismaClient({ accelerateUrl: config.url });
    return attachCompatDelegates(client.$extends(withAccelerate()) as unknown as PrismaClient);
  }

  if (config.mode === 'direct' && config.url) {
    const pool = new Pool({ connectionString: config.url });
    const adapter = new PrismaPg(pool);
    return attachCompatDelegates(
      new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      }),
    );
  }

  const localPool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public',
  });
  const localAdapter = new PrismaPg(localPool);

  return attachCompatDelegates(
    new PrismaClient({
      adapter: localAdapter,
      log: ['warn', 'error'],
    }),
  );
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
    const client = getPrismaClient() as any;
    if (client.conversations) {
      await client.conversations.findMany({ select: { id: true }, take: 1 });
    } else if (client.conversation) {
      await client.conversation.findMany({ select: { id: true }, take: 1 });
    }

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
