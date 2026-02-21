import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';
import { publishRealtimeEvent } from './realtime.js';

let getPoolImpl: typeof getPool = getPool;

export const __setGetPoolForTests = (next: typeof getPool): void => {
  getPoolImpl = next;
};

export const __resetGetPoolForTests = (): void => {
  getPoolImpl = getPool;
};

export type DailyRunInput = {
  channelId: string;
  channelName?: string;
  reportDate?: string;
  reportType: 'daily' | 'manual' | 'test';
  status: 'success' | 'error' | 'pending';
  errorMessage?: string | null;
  summaryText?: string;
  fullReport?: string;
  durationMs?: number;
};

export const logDailyRun = async (
  input: DailyRunInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<string | null> => {
  const pool = getPoolImpl();
  if (!pool) {
    logger?.debug('Database not initialized; skipping run log');
    return null;
  }

  try {
    const result = await pool.query(
      `INSERT INTO daily_runs (channel_id, channel_name, report_date, report_type, status, error_message, summary_text, full_report, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.channelId,
        input.channelName || null,
        input.reportDate || null,
        input.reportType,
        input.status,
        input.errorMessage || null,
        input.summaryText || null,
        input.fullReport || null,
        input.durationMs || null,
      ],
    );

    const runId = result.rows[0]?.id;
    logger?.debug(`Logged daily run: ${runId}`);

    if (runId) {
      // Notify SSE subscribers (dashboard) that runs have changed.
      // Frontend can invalidate/refetch runs immediately.
      publishRealtimeEvent({
        type: 'runs-updated',
        ts: new Date().toISOString(),
        payload: { runId, channelId: input.channelId, reportType: input.reportType, status: input.status },
      });
    }

    return runId;
  } catch (error) {
    logger?.warn('Failed to log daily run to database:', error);
    return null;
  }
};

export type DailyRunRow = {
  id: string;
  timestamp: string;
  channel_id: string;
  channel_name: string | null;
  report_date: string | null;
  report_type: DailyRunInput['reportType'];
  status: DailyRunInput['status'];
  error_message: string | null;
  summary_text: string | null;
  full_report: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type ChannelWithRunsRow = {
  channel_id: string;
  channel_name: string | null;
  run_count: string;
};

export const getDailyRuns = async (
  options: {
    channelId?: string;
    limit?: number;
    offset?: number;
    daysBack?: number;
    raw?: boolean;
  } = {},
  logger?: Pick<Logger, 'warn'>,
): Promise<DailyRunRow[]> => {
  const pool = getPoolImpl();
  if (!pool) {
    return [];
  }

  try {
    const params: Array<string | number> = [];

    // Base filter (applies to both raw + canonical)
    let where = 'WHERE 1=1';

    if (options.channelId) {
      params.push(options.channelId);
      where += ` AND channel_id = $${params.length}`;
    }

    if (options.daysBack) {
      // Keep this as a literal interval to avoid parameter type issues.
      where += ` AND timestamp > NOW() - INTERVAL '${options.daysBack} days'`;
    }

    // Raw mode: preserve existing behavior for debugging/back-compat.
    if (options.raw) {
      let query = `SELECT * FROM daily_runs ${where} ORDER BY timestamp DESC`;

      if (options.limit) {
        params.push(options.limit);
        query += ` LIMIT $${params.length}`;
      }

      if (options.offset) {
        params.push(options.offset);
        query += ` OFFSET $${params.length}`;
      }

      const result = await pool.query<DailyRunRow>(query, params);
      return result.rows;
    }

    // Canonical mode: 1 run per (channel_id, report_type, day)
    // day = COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date)
    // Ranking:
    //   1) non-placeholder over placeholder
    //   2) status: success > pending > error
    //   3) latest timestamp
    //   4) stable tie-breaker by id
    const canonicalQuery = `
      WITH ranked AS (
        SELECT
          *,
          COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date) AS canonical_day,
          CASE
            WHEN COALESCE(summary_text, '') ILIKE 'backfilled placeholder%' THEN 1
            WHEN COALESCE(full_report, '') ILIKE 'backfilled placeholder%' THEN 1
            ELSE 0
          END AS is_placeholder,
          CASE status
            WHEN 'success' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'error' THEN 2
            ELSE 3
          END AS status_rank,
          ROW_NUMBER() OVER (
            PARTITION BY channel_id, report_type, COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date)
            ORDER BY
              CASE
                WHEN COALESCE(summary_text, '') ILIKE 'backfilled placeholder%' THEN 1
                WHEN COALESCE(full_report, '') ILIKE 'backfilled placeholder%' THEN 1
                ELSE 0
              END ASC,
              CASE status
                WHEN 'success' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'error' THEN 2
                ELSE 3
              END ASC,
              timestamp DESC,
              id DESC
          ) AS rn
        FROM daily_runs
        ${where}
      )
      SELECT
        id,
        timestamp,
        channel_id,
        channel_name,
        report_date,
        report_type,
        status,
        error_message,
        summary_text,
        full_report,
        duration_ms,
        created_at
      FROM ranked
      WHERE rn = 1
      ORDER BY timestamp DESC
    `;

    // Apply pagination to canonical results.
    let pagedQuery = canonicalQuery;

    if (options.limit) {
      params.push(options.limit);
      pagedQuery += ` LIMIT $${params.length}`;
    }

    if (options.offset) {
      params.push(options.offset);
      pagedQuery += ` OFFSET $${params.length}`;
    }

    const result = await pool.query<DailyRunRow>(pagedQuery, params);
    return result.rows;
  } catch (error) {
    logger?.warn('Failed to fetch daily runs:', error);
    return [];
  }
};

export const getDailyRunById = async (id: string, logger?: Pick<Logger, 'warn'>): Promise<DailyRunRow | null> => {
  const pool = getPoolImpl();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query<DailyRunRow>('SELECT * FROM daily_runs WHERE id = $1', [id]);
    return result.rows[0] || null;
  } catch (error) {
    logger?.warn('Failed to fetch daily run by ID:', error);
    return null;
  }
};

export const getChannelsWithRuns = async (logger?: Pick<Logger, 'warn'>): Promise<ChannelWithRunsRow[]> => {
  const pool = getPoolImpl();
  if (!pool) {
    return [];
  }

  try {
    const result = await pool.query<ChannelWithRunsRow>(
      `SELECT DISTINCT channel_id, channel_name, COUNT(*) as run_count
       FROM daily_runs
       GROUP BY channel_id, channel_name
       ORDER BY COUNT(*) DESC`,
    );
    return result.rows;
  } catch (error) {
    logger?.warn('Failed to fetch channels with runs:', error);
    return [];
  }
};
