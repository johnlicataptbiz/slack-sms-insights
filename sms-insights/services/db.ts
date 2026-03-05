import type { Logger } from '@slack/bolt';
import { Pool } from 'pg';

let pool: Pool | undefined;

export const initDatabase = async (logger?: Pick<Logger, 'info' | 'error'>): Promise<void> => {
  if (pool) {
    return;
  }

  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  logger?.info(
    `Checking DATABASE_URL: ${databaseUrl ? `Present (starts with ${databaseUrl.substring(0, 10)}...)` : 'MISSING'}`,
  );

  if (!databaseUrl) {
    logger?.error('DATABASE_URL not set; database logging disabled');
    return;
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    // Railway proxy can be latent; avoid frequent timeouts in local dev.
    connectionTimeoutMillis: Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '20000', 10),
    query_timeout: Number.parseInt(process.env.PG_QUERY_TIMEOUT_MS || '60000', 10),
    statement_timeout: Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '60000', 10),
  });

  pool.on('error', (err) => {
    logger?.error('Unexpected database pool error:', err);
  });

  try {
    const client = await pool.connect();
    client.release();
    logger?.info('✅ Database connection pool initialized');
  } catch (error) {
    logger?.error('Failed to initialize database connection pool:', error);
    pool = undefined;
  }
};

export const getPool = (): Pool | undefined => {
  return pool;
};

export const closeDatabase = async (): Promise<void> => {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = undefined;
};

export const initializeSchema = async (): Promise<void> => {};
