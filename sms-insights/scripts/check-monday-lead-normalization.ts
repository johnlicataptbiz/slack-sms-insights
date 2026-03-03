import type { Logger } from '@slack/bolt';
import { closeDatabase, getPool, initDatabase, initializeSchema } from '../services/db.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const main = async (): Promise<void> => {
  await initDatabase(logger);
  await initializeSchema();
  const pool = getPool();
  if (!pool) throw new Error('Database connection failed');

  const totals = await pool.query<{
    outcomes: number;
    attribution: number;
    activity: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM lead_outcomes) AS outcomes,
      (SELECT COUNT(*)::int FROM lead_attribution) AS attribution,
      (SELECT COUNT(*)::int FROM setter_activity) AS activity
  `);

  const topOutcomes = await pool.query<{
    outcome_category: string;
    n: number;
  }>(`
    SELECT outcome_category, COUNT(*)::int AS n
    FROM lead_outcomes
    GROUP BY outcome_category
    ORDER BY n DESC, outcome_category ASC
    LIMIT 12
  `);

  const topSources = await pool.query<{
    source: string | null;
    n: number;
  }>(`
    SELECT NULLIF(BTRIM(source), '') AS source, COUNT(*)::int AS n
    FROM lead_attribution
    GROUP BY NULLIF(BTRIM(source), '')
    ORDER BY n DESC
    LIMIT 12
  `);

  const recentSetterActivity = await pool.query<{
    setter: string | null;
    activity_date: string | null;
    outcome_category: string;
    is_booked: boolean;
  }>(`
    SELECT setter, activity_date::text, outcome_category, is_booked
    FROM setter_activity
    ORDER BY item_updated_at DESC
    LIMIT 20
  `);

  console.log(
    JSON.stringify(
      {
        totals: totals.rows[0] || { outcomes: 0, attribution: 0, activity: 0 },
        topOutcomes: topOutcomes.rows,
        topSources: topSources.rows,
        recentSetterActivity: recentSetterActivity.rows,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    logger.error('check-monday-lead-normalization failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
