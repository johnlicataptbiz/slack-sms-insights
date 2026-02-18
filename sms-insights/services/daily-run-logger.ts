import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

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
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>,
): Promise<string | null> => {
  const pool = getPool();
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
  } = {},
  logger?: Pick<Logger, 'warn'>,
): Promise<DailyRunRow[]> => {
  const pool = getPool();
  if (!pool) {
    return [];
  }

  try {
    let query = 'SELECT * FROM daily_runs WHERE 1=1';
    const params: Array<string | number> = [];

    if (options.channelId) {
      params.push(options.channelId);
      query += ` AND channel_id = $${params.length}`;
    }

    if (options.daysBack) {
      query += ` AND timestamp > NOW() - INTERVAL '${options.daysBack} days'`;
    }

    query += ' ORDER BY timestamp DESC';

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
  } catch (error) {
    logger?.warn('Failed to fetch daily runs:', error);
    return [];
  }
};

export const getDailyRunById = async (id: string, logger?: Pick<Logger, 'warn'>): Promise<DailyRunRow | null> => {
  const pool = getPool();
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
  const pool = getPool();
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
