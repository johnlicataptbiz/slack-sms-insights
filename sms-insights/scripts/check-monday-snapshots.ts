/**
 * Check whether Monday snapshots exist in the DB and how recent they are.
 *
 * Usage:
 *   node --import tsx scripts/check-monday-snapshots.ts
 *
 * Notes:
 * - Uses the same DB init as the rest of sms-insights scripts.
 * - Prints counts and recency for monday_call_snapshots.
 */

import type { Logger } from '@slack/bolt';
import { initDatabase, getPool } from '../services/db.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const main = async () => {
  await initDatabase(logger);
  const pool = getPool();
  if (!pool) {
    throw new Error('Database connection failed');
  }

  const overall = await pool.query<{
    n: number;
    max_updated: string | null;
    max_synced: string | null;
  }>(`
    SELECT
      COUNT(*)::int AS n,
      MAX(updated_at)::text AS max_updated,
      MAX(synced_at)::text AS max_synced
    FROM monday_call_snapshots;
  `);

  const booked = await pool.query<{
    n: number;
    max_updated: string | null;
    max_synced: string | null;
  }>(`
    SELECT
      COUNT(*)::int AS n,
      MAX(updated_at)::text AS max_updated,
      MAX(synced_at)::text AS max_synced
    FROM monday_call_snapshots
    WHERE is_booked = true;
  `);

  const missingContactKey = await pool.query<{ n: number }>(`
    SELECT COUNT(*)::int AS n
    FROM monday_call_snapshots
    WHERE contact_key IS NULL OR contact_key = '';
  `);

  console.log({
    overall: overall.rows[0],
    booked: booked.rows[0],
    missingContactKey: missingContactKey.rows[0],
  });
};

main().catch((err) => {
  logger.error('check-monday-snapshots failed', err);
  process.exit(1);
});
