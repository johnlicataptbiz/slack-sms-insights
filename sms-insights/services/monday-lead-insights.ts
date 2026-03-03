import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

type MondayLeadInsightsParams = {
  fromDay: string;
  toDay: string;
  timeZone: string;
  boardId?: string | null;
  sourceLimit?: number;
  setterLimit?: number;
};

type MondayLeadInsightsTotals = {
  leads: number;
  booked: number;
  closedWon: number;
  closedLost: number;
  badTiming: number;
  badFit: number;
  noShow: number;
  cancelled: number;
};

type MondayLeadInsights = {
  window: {
    fromDay: string;
    toDay: string;
    timeZone: string;
    boardId: string | null;
  };
  totals: MondayLeadInsightsTotals;
  outcomesByCategory: Array<{
    category: string;
    count: number;
  }>;
  topSources: Array<{
    source: string;
    count: number;
  }>;
  topSetters: Array<{
    setter: string;
    leads: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    badTiming: number;
    badFit: number;
    noShow: number;
    cancelled: number;
  }>;
  activityByDay: Array<{
    day: string;
    leads: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    badTiming: number;
    badFit: number;
    noShow: number;
    cancelled: number;
  }>;
  mondaySyncState: Array<{
    boardId: string;
    status: string | null;
    lastSyncAt: string | null;
    updatedAt: string | null;
    error: string | null;
  }>;
};

type QuerySpec = {
  clause: string;
  values: Array<string>;
};

const buildBoardFilter = (boardId: string | null | undefined, placeholderIndex: number): QuerySpec => {
  const normalized = (boardId || '').trim();
  if (!normalized) return { clause: '', values: [] };
  return {
    clause: ` AND board_id = $${placeholderIndex}`,
    values: [normalized],
  };
};

const toPositiveInt = (value: number | undefined, fallback: number, max = 100): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value as number)));
};

export const getMondayLeadInsights = async (
  params: MondayLeadInsightsParams,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayLeadInsights> => {
  const pool = getPool();
  if (!pool) {
    return {
      window: {
        fromDay: params.fromDay,
        toDay: params.toDay,
        timeZone: params.timeZone,
        boardId: (params.boardId || '').trim() || null,
      },
      totals: {
        leads: 0,
        booked: 0,
        closedWon: 0,
        closedLost: 0,
        badTiming: 0,
        badFit: 0,
        noShow: 0,
        cancelled: 0,
      },
      outcomesByCategory: [],
      topSources: [],
      topSetters: [],
      activityByDay: [],
      mondaySyncState: [],
    };
  }

  const sourceLimit = toPositiveInt(params.sourceLimit, 12, 50);
  const setterLimit = toPositiveInt(params.setterLimit, 12, 50);
  const boardFilter = buildBoardFilter(params.boardId, 3);
  const baseValues = [params.fromDay, params.toDay, ...boardFilter.values];

  try {
    const [totalsResult, outcomesResult, sourcesResult, settersResult, activityResult, syncStateResult] = await Promise.all([
      pool.query<{
        leads: number;
        booked: number;
        closed_won: number;
        closed_lost: number;
        bad_timing: number;
        bad_fit: number;
        no_show: number;
        cancelled: number;
      }>(
        `
        SELECT
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE is_booked = TRUE)::int AS booked,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_won')::int AS closed_won,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_lost')::int AS closed_lost,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_timing')::int AS bad_timing,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_fit')::int AS bad_fit,
          COUNT(*) FILTER (WHERE outcome_category = 'no_show')::int AS no_show,
          COUNT(*) FILTER (WHERE outcome_category = 'cancelled')::int AS cancelled
        FROM lead_outcomes
        WHERE COALESCE(call_date, item_updated_at::date) BETWEEN $1::date AND $2::date
        ${boardFilter.clause}
        `,
        baseValues,
      ),
      pool.query<{ category: string; count: number }>(
        `
        SELECT outcome_category AS category, COUNT(*)::int AS count
        FROM lead_outcomes
        WHERE COALESCE(call_date, item_updated_at::date) BETWEEN $1::date AND $2::date
        ${boardFilter.clause}
        GROUP BY outcome_category
        ORDER BY count DESC, outcome_category ASC
        `,
        baseValues,
      ),
      pool.query<{ source: string; count: number }>(
        `
        SELECT
          COALESCE(NULLIF(BTRIM(source), ''), 'Unknown') AS source,
          COUNT(*)::int AS count
        FROM lead_attribution
        WHERE COALESCE(call_date, item_updated_at::date) BETWEEN $1::date AND $2::date
        ${boardFilter.clause}
        GROUP BY COALESCE(NULLIF(BTRIM(source), ''), 'Unknown')
        ORDER BY count DESC, source ASC
        LIMIT $${baseValues.length + 1}
        `,
        [...baseValues, sourceLimit],
      ),
      pool.query<{
        setter: string;
        leads: number;
        booked: number;
        closed_won: number;
        closed_lost: number;
        bad_timing: number;
        bad_fit: number;
        no_show: number;
        cancelled: number;
      }>(
        `
        SELECT
          COALESCE(NULLIF(BTRIM(setter), ''), 'Unassigned') AS setter,
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE is_booked = TRUE)::int AS booked,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_won')::int AS closed_won,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_lost')::int AS closed_lost,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_timing')::int AS bad_timing,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_fit')::int AS bad_fit,
          COUNT(*) FILTER (WHERE outcome_category = 'no_show')::int AS no_show,
          COUNT(*) FILTER (WHERE outcome_category = 'cancelled')::int AS cancelled
        FROM setter_activity
        WHERE activity_date BETWEEN $1::date AND $2::date
        ${boardFilter.clause}
        GROUP BY COALESCE(NULLIF(BTRIM(setter), ''), 'Unassigned')
        ORDER BY leads DESC, setter ASC
        LIMIT $${baseValues.length + 1}
        `,
        [...baseValues, setterLimit],
      ),
      pool.query<{
        day: string;
        leads: number;
        booked: number;
        closed_won: number;
        closed_lost: number;
        bad_timing: number;
        bad_fit: number;
        no_show: number;
        cancelled: number;
      }>(
        `
        SELECT
          activity_date::text AS day,
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE is_booked = TRUE)::int AS booked,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_won')::int AS closed_won,
          COUNT(*) FILTER (WHERE outcome_category = 'closed_lost')::int AS closed_lost,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_timing')::int AS bad_timing,
          COUNT(*) FILTER (WHERE outcome_category = 'bad_fit')::int AS bad_fit,
          COUNT(*) FILTER (WHERE outcome_category = 'no_show')::int AS no_show,
          COUNT(*) FILTER (WHERE outcome_category = 'cancelled')::int AS cancelled
        FROM setter_activity
        WHERE activity_date BETWEEN $1::date AND $2::date
        ${boardFilter.clause}
        GROUP BY activity_date
        ORDER BY activity_date ASC
        `,
        baseValues,
      ),
      pool.query<{
        board_id: string;
        status: string | null;
        last_sync_at: string | null;
        updated_at: string | null;
        error: string | null;
      }>(
        `
        SELECT
          board_id,
          status,
          last_sync_at::text,
          updated_at::text,
          error
        FROM monday_sync_state
        ${params.boardId ? 'WHERE board_id = $1' : ''}
        ORDER BY updated_at DESC
        LIMIT 10
        `,
        params.boardId ? [params.boardId] : [],
      ),
    ]);

    const totalsRow = totalsResult.rows[0];
    return {
      window: {
        fromDay: params.fromDay,
        toDay: params.toDay,
        timeZone: params.timeZone,
        boardId: (params.boardId || '').trim() || null,
      },
      totals: {
        leads: totalsRow?.leads || 0,
        booked: totalsRow?.booked || 0,
        closedWon: totalsRow?.closed_won || 0,
        closedLost: totalsRow?.closed_lost || 0,
        badTiming: totalsRow?.bad_timing || 0,
        badFit: totalsRow?.bad_fit || 0,
        noShow: totalsRow?.no_show || 0,
        cancelled: totalsRow?.cancelled || 0,
      },
      outcomesByCategory: outcomesResult.rows.map((row) => ({
        category: row.category,
        count: row.count,
      })),
      topSources: sourcesResult.rows.map((row) => ({
        source: row.source,
        count: row.count,
      })),
      topSetters: settersResult.rows.map((row) => ({
        setter: row.setter,
        leads: row.leads,
        booked: row.booked,
        closedWon: row.closed_won,
        closedLost: row.closed_lost,
        badTiming: row.bad_timing,
        badFit: row.bad_fit,
        noShow: row.no_show,
        cancelled: row.cancelled,
      })),
      activityByDay: activityResult.rows.map((row) => ({
        day: row.day,
        leads: row.leads,
        booked: row.booked,
        closedWon: row.closed_won,
        closedLost: row.closed_lost,
        badTiming: row.bad_timing,
        badFit: row.bad_fit,
        noShow: row.no_show,
        cancelled: row.cancelled,
      })),
      mondaySyncState: syncStateResult.rows.map((row) => ({
        boardId: row.board_id,
        status: row.status,
        lastSyncAt: row.last_sync_at,
        updatedAt: row.updated_at,
        error: row.error,
      })),
    };
  } catch (error) {
    logger?.warn?.('Failed to build monday lead insights', error);
    throw error;
  }
};
