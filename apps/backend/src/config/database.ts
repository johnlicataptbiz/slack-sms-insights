import { config } from '../config/index.js';

export interface DatabaseConfig {
  url: string;
  connectionLimit: number;
  connectionTimeoutMillis: number;
  queryTimeout: number;
  idleTimeoutMillis: number;
  maxUses: number;
  maxLifetimeMillis: number;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const isProduction = config.nodeEnv === 'production';

  return {
    url: config.databaseUrl,
    // Connection pool settings
    connectionLimit: isProduction ? 20 : 5,
    connectionTimeoutMillis: 10000, // 10 seconds
    queryTimeout: 30000, // 30 seconds
    idleTimeoutMillis: 30000, // 30 seconds
    maxUses: 7500, // Reset connection after 7500 uses
    maxLifetimeMillis: 1000 * 60 * 60, // 1 hour
  };
};

export const getPrismaClientConfig = () => {
  const dbConfig = getDatabaseConfig();
  const isProduction = config.nodeEnv === 'production';

  return {
    datasources: {
      db: {
        url: dbConfig.url,
      },
    },
    log: isProduction ? (['error', 'warn'] as const) : (['query', 'error', 'warn'] as const),
  };
};

// Database URL validation
export const validateDatabaseUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'postgresql:' || parsedUrl.protocol === 'postgres:';
  } catch {
    return false;
  }
};

// Connection string utilities
export const parseConnectionString = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    return {
      host: parsedUrl.hostname,
      port: Number.parseInt(parsedUrl.port) || 5432,
      database: parsedUrl.pathname.slice(1),
      username: parsedUrl.username,
      password: parsedUrl.password,
      ssl: parsedUrl.searchParams.get('sslmode') === 'require',
    };
  } catch (error) {
    throw new Error(`Invalid database URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
