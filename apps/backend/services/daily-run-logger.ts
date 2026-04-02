import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { publishRealtimeEvent } from './realtime.js';

const getPrisma = () => getPrismaClient();

type DailyRunQueryPool = {
  query: (sql: string, params?: Array<string | number>) => Promise<{ rows: DailyRunRow[] }>;
};

let getPoolForTests: (() => DailyRunQueryPool) | null = null;

export const __setGetPoolForTests = (factory: (() => DailyRunQueryPool) | null): void => {
  getPoolForTests = factory;
};

export const __resetGetPoolForTests = (): void => {
  getPoolForTests = null;
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
  isLegacy?: boolean;
};
export const logDailyRun = async (
  input: DailyRunInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<string | null> => {
  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO daily_runs (
          channel_id,
          channel_name,
          report_date,
          report_type,
          status,
          error_message,
          summary_text,
          full_report,
          duration_ms,
          is_legacy
        ) VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      input.channelId,
      input.channelName || null,
      input.reportDate || null,
      input.reportType,
      input.status,
      input.errorMessage || null,
      input.summaryText || null,
      input.fullReport || null,
      input.durationMs || null,
      input.isLegacy === true,
    );

    const runId = rows[0]?.id || null;
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
  is_legacy: boolean | null;
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
    legacyMode?: 'exclude' | 'only' | 'include';
  } = {},
  logger?: Pick<Logger, 'warn'>,
): Promise<DailyRunRow[]> => {
  if (getPoolForTests) {
    const pool = getPoolForTests();
    const rawParams: Array<string | number> = [];
    let rawWhere = 'WHERE 1=1';

    if (options.channelId) {
      rawParams.push(options.channelId);
      rawWhere += ` AND channel_id = $${rawParams.length}`;
    }
    if (options.daysBack) {
      const safeDaysBack = Math.max(1, Math.floor(Number(options.daysBack)));
      rawParams.push(safeDaysBack);
      rawWhere += ` AND timestamp > NOW() - INTERVAL '1 day' * $${rawParams.length}`;
    }
    const legacyMode = options.legacyMode || 'exclude';
    if (legacyMode === 'exclude') {
      rawWhere += ' AND COALESCE(is_legacy, FALSE) = FALSE';
    } else if (legacyMode === 'only') {
      rawWhere += ' AND COALESCE(is_legacy, FALSE) = TRUE';
    }

    if (options.raw) {
      const query = [
        'SELECT * FROM daily_runs',
        rawWhere,
        'ORDER BY timestamp DESC',
        options.limit ? `LIMIT ${options.limit}` : '',
        options.offset ? `OFFSET ${options.offset}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const result = await pool.query(query, rawParams);
      return result.rows;
    }

    const query = `
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
        ${rawWhere}
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
        is_legacy,
        created_at
      FROM ranked
      WHERE rn = 1
      ORDER BY timestamp DESC
      ${options.limit ? `LIMIT ${options.limit}` : ''}
      ${options.offset ? `OFFSET ${options.offset}` : ''}
    `;
    const result = await pool.query(query, rawParams);
    return result.rows;
  }

  const prisma = getPrisma();

  try {
    if (options.raw) {
      const rawParams: Array<string | number> = [];
      let rawWhere = 'WHERE 1=1';
      if (options.channelId) {
        rawParams.push(options.channelId);
        rawWhere += ` AND channel_id = $${rawParams.length}`;
      }
      if (options.daysBack) {
        const safeDaysBack = Math.max(1, Math.floor(Number(options.daysBack)));
        rawParams.push(safeDaysBack);
        rawWhere += ` AND timestamp > NOW() - INTERVAL '1 day' * $${rawParams.length}`;
      }
      const legacyMode = options.legacyMode || 'exclude';
      if (legacyMode === 'exclude') rawWhere += ' AND COALESCE(is_legacy, FALSE) = FALSE';
      else if (legacyMode === 'only') rawWhere += ' AND COALESCE(is_legacy, FALSE) = TRUE';

      const query = [
        `SELECT id, timestamp, channel_id, channel_name, report_date, report_type, status, error_message, summary_text, full_report, duration_ms, is_legacy, created_at FROM daily_runs`,
        rawWhere,
        'ORDER BY timestamp DESC',
        options.limit ? `LIMIT ${options.limit}` : '',
        options.offset ? `OFFSET ${options.offset}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return await prisma.$queryRawUnsafe<DailyRunRow[]>(query, ...rawParams);
    }

    // Use $queryRaw for complex window function
    // We'll build the WHERE clause manually for $queryRaw
    let rawWhere = 'WHERE 1=1';
    const rawParams: Array<string | number | boolean | null> = [];
    if (options.channelId) {
      rawParams.push(options.channelId);
      rawWhere += ` AND channel_id = $${rawParams.length}`;
    }
    if (options.daysBack) {
      const safeDaysBack = Math.max(1, Math.floor(Number(options.daysBack)));
      rawParams.push(safeDaysBack);
      rawWhere += ` AND timestamp > NOW() - INTERVAL '1 day' * $${rawParams.length}`;
    }
    const legacyMode = options.legacyMode || 'exclude';
    if (legacyMode === 'exclude') {
      rawWhere += ' AND COALESCE(is_legacy, FALSE) = FALSE';
    } else if (legacyMode === 'only') {
      rawWhere += ' AND COALESCE(is_legacy, FALSE) = TRUE';
    }

    const query = `
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
        ${rawWhere}
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
        is_legacy,
        created_at
      FROM ranked
      WHERE rn = 1
      ORDER BY timestamp DESC
      ${options.limit ? `LIMIT ${options.limit}` : ''}
      ${options.offset ? `OFFSET ${options.offset}` : ''}
    `;

    const result = await prisma.$queryRawUnsafe<DailyRunRow[]>(query, ...rawParams);
    return result;
  } catch (error) {
    logger?.warn('Failed to fetch daily runs:', error);
    return [];
  }
};

export const getDailyRunById = async (id: string, logger?: Pick<Logger, 'warn'>): Promise<DailyRunRow | null> => {
  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<DailyRunRow[]>(
      `
        SELECT
          id, timestamp, channel_id, channel_name, report_date, report_type, status,
          error_message, summary_text, full_report, duration_ms, is_legacy, created_at
        FROM daily_runs
        WHERE id = $1
        LIMIT 1
      `,
      id,
    );
    return rows[0] || null;
  } catch (error) {
    logger?.warn('Failed to fetch daily run by ID:', error);
    return null;
  }
};

export const getChannelsWithRuns = async (logger?: Pick<Logger, 'warn'>): Promise<ChannelWithRunsRow[]> => {
  const prisma = getPrisma();

  try {
    return await prisma.$queryRawUnsafe<ChannelWithRunsRow[]>(
      `
        SELECT
          channel_id,
          channel_name,
          COUNT(*)::text AS run_count
        FROM daily_runs
        WHERE COALESCE(is_legacy, FALSE) = FALSE
        GROUP BY channel_id, channel_name
        ORDER BY COUNT(*) DESC
      `,
    );
  } catch (error) {
    logger?.warn('Failed to fetch channels with runs:', error);
    return [];
  }
};
