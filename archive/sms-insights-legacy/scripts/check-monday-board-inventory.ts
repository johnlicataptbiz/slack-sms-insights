import type { Logger } from '@slack/bolt';
import { closeDatabase, getPool, initDatabase, initializeSchema } from '../services/db.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

type BoardInventoryRow = {
  board_id: string;
  sync_status: string | null;
  last_sync_at: string | null;
  snapshot_count: number;
  latest_item_updated_at: string | null;
  attribution_count: number;
  activity_count: number;
  booked_count: number;
  set_by_known_count: number;
  source_known_count: number;
  campaign_known_count: number;
  touchpoints_known_count: number;
};

type BoardTopValueRow = {
  board_id: string;
  value: string | null;
  n: number;
};

const main = async (): Promise<void> => {
  await initDatabase(logger);
  await initializeSchema();
  const pool = getPool();
  if (!pool) throw new Error('Database connection failed');

  const inventory = await pool.query<BoardInventoryRow>(`
    WITH all_boards AS (
      SELECT board_id FROM monday_sync_state
      UNION
      SELECT board_id FROM monday_call_snapshots
      UNION
      SELECT board_id FROM lead_attribution
      UNION
      SELECT board_id FROM setter_activity
    ),
    snapshots AS (
      SELECT
        board_id,
        COUNT(*)::int AS snapshot_count,
        MAX(updated_at)::text AS latest_item_updated_at,
        COUNT(*) FILTER (WHERE is_booked)::int AS booked_count
      FROM monday_call_snapshots
      GROUP BY board_id
    ),
    attribution AS (
      SELECT board_id, COUNT(*)::int AS attribution_count
      FROM lead_attribution
      GROUP BY board_id
    ),
    activity AS (
      SELECT board_id, COUNT(*)::int AS activity_count
      FROM setter_activity
      GROUP BY board_id
    ),
    coverage AS (
      SELECT
        board_id,
        COUNT(*) FILTER (WHERE column_title = 'Set By:' AND text_value IS NOT NULL AND BTRIM(text_value) <> '')::int AS set_by_known_count,
        COUNT(*) FILTER (
          WHERE column_title = 'Original Source'
            AND text_value IS NOT NULL
            AND BTRIM(text_value) <> ''
            AND LOWER(BTRIM(text_value)) <> 'unknown'
        )::int AS source_known_count,
        COUNT(*) FILTER (
          WHERE column_title = 'Campaign'
            AND text_value IS NOT NULL
            AND BTRIM(text_value) <> ''
            AND LOWER(BTRIM(text_value)) <> 'unknown'
        )::int AS campaign_known_count,
        COUNT(*) FILTER (WHERE column_title = 'Touchpoints' AND text_value IS NOT NULL AND BTRIM(text_value) <> '')::int AS touchpoints_known_count
      FROM monday_call_column_latest
      GROUP BY board_id
    )
    SELECT
      b.board_id,
      ms.status AS sync_status,
      ms.last_sync_at::text AS last_sync_at,
      COALESCE(s.snapshot_count, 0) AS snapshot_count,
      s.latest_item_updated_at,
      COALESCE(a.attribution_count, 0) AS attribution_count,
      COALESCE(sa.activity_count, 0) AS activity_count,
      COALESCE(s.booked_count, 0) AS booked_count,
      COALESCE(c.set_by_known_count, 0) AS set_by_known_count,
      COALESCE(c.source_known_count, 0) AS source_known_count,
      COALESCE(c.campaign_known_count, 0) AS campaign_known_count,
      COALESCE(c.touchpoints_known_count, 0) AS touchpoints_known_count
    FROM all_boards b
    LEFT JOIN monday_sync_state ms ON ms.board_id = b.board_id
    LEFT JOIN snapshots s ON s.board_id = b.board_id
    LEFT JOIN attribution a ON a.board_id = b.board_id
    LEFT JOIN activity sa ON sa.board_id = b.board_id
    LEFT JOIN coverage c ON c.board_id = b.board_id
    ORDER BY COALESCE(ms.last_sync_at, '1970-01-01'::timestamptz) DESC, b.board_id ASC
  `);

  const topSources = await pool.query<BoardTopValueRow>(`
    SELECT board_id, NULLIF(BTRIM(text_value), '') AS value, COUNT(*)::int AS n
    FROM monday_call_column_latest
    WHERE column_title = 'Original Source'
      AND text_value IS NOT NULL
      AND BTRIM(text_value) <> ''
    GROUP BY board_id, NULLIF(BTRIM(text_value), '')
    ORDER BY board_id ASC, n DESC
  `);

  const topCampaigns = await pool.query<BoardTopValueRow>(`
    SELECT board_id, NULLIF(BTRIM(text_value), '') AS value, COUNT(*)::int AS n
    FROM monday_call_column_latest
    WHERE column_title = 'Campaign'
      AND text_value IS NOT NULL
      AND BTRIM(text_value) <> ''
    GROUP BY board_id, NULLIF(BTRIM(text_value), '')
    ORDER BY board_id ASC, n DESC
  `);

  const topOutcomes = await pool.query<BoardTopValueRow>(`
    SELECT board_id, NULLIF(BTRIM(text_value), '') AS value, COUNT(*)::int AS n
    FROM monday_call_column_latest
    WHERE column_title = 'Outcome'
      AND text_value IS NOT NULL
      AND BTRIM(text_value) <> ''
    GROUP BY board_id, NULLIF(BTRIM(text_value), '')
    ORDER BY board_id ASC, n DESC
  `);

  const pickTopValues = (rows: BoardTopValueRow[]) => {
    const byBoard = new Map<string, BoardTopValueRow[]>();
    for (const row of rows) {
      const bucket = byBoard.get(row.board_id) || [];
      if (bucket.length < 3) bucket.push(row);
      byBoard.set(row.board_id, bucket);
    }
    return byBoard;
  };

  const sourceByBoard = pickTopValues(topSources.rows);
  const campaignByBoard = pickTopValues(topCampaigns.rows);
  const outcomeByBoard = pickTopValues(topOutcomes.rows);

  const summary = inventory.rows.map((row) => ({
    ...row,
    top_sources: sourceByBoard.get(row.board_id) || [],
    top_campaigns: campaignByBoard.get(row.board_id) || [],
    top_outcomes: outcomeByBoard.get(row.board_id) || [],
  }));

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        boardCount: summary.length,
        boards: summary,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    logger.error('check-monday-board-inventory failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

