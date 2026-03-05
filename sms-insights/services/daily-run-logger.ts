import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { publishRealtimeEvent } from './realtime.js';

const getPrisma = () => getPrismaClient();

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
    const run = await prisma.daily_runs.create({
      data: {
        channel_id: input.channelId,
        channel_name: input.channelName || null,
        report_date: input.reportDate ? new Date(input.reportDate) : null,
        report_type: input.reportType,
        status: input.status,
        error_message: input.errorMessage || null,
        summary_text: input.summaryText || null,
        full_report: input.fullReport || null,
        duration_ms: input.durationMs || null,
        is_legacy: input.isLegacy === true,
      },
      select: { id: true },
    });

    const runId = run.id;
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
  const prisma = getPrisma();

  try {

    if (options.raw) {
      const where: any = {};
      if (options.channelId) where.channel_id = options.channelId;
      if (options.daysBack) {
        where.timestamp = {
          gt: new Date(Date.now() - options.daysBack * 24 * 60 * 60 * 1000),
        };
      }
      const legacyMode = options.legacyMode || 'exclude';
      if (legacyMode === 'exclude') where.is_legacy = false;
      else if (legacyMode === 'only') where.is_legacy = true;

      const results = await prisma.daily_runs.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit,
        skip: options.offset,
      });
      return results as unknown as DailyRunRow[];
    }

    // Use $queryRaw for complex window function
    // We'll build the WHERE clause manually for $queryRaw
    let rawWhere = 'WHERE 1=1';
    const rawParams: any[] = [];
    if (options.channelId) {
      rawParams.push(options.channelId);
      rawWhere += ` AND channel_id = $${rawParams.length}`;
    }
    if (options.daysBack) {
      rawWhere += ` AND timestamp > NOW() - INTERVAL '${options.daysBack} days'`;
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
    const result = await prisma.daily_runs.findUnique({
      where: { id },
    });
    return result as unknown as DailyRunRow | null;
  } catch (error) {
    logger?.warn('Failed to fetch daily run by ID:', error);
    return null;
  }
};

export const getChannelsWithRuns = async (logger?: Pick<Logger, 'warn'>): Promise<ChannelWithRunsRow[]> => {
  const prisma = getPrisma();

  try {
    const result = await prisma.daily_runs.groupBy({
      by: ['channel_id', 'channel_name'],
      where: {
        is_legacy: false,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          channel_id: 'desc',
        },
      },
    });

    return result.map(r => ({
      channel_id: r.channel_id,
      channel_name: r.channel_name,
      run_count: String(r._count._all),
    }));
  } catch (error) {
    logger?.warn('Failed to fetch channels with runs:', error);
    return [];
  }
};
