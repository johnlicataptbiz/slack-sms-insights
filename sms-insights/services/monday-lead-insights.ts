import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';
import { type MondayLeadScope, resolveMondayLeadScope } from './monday-governed-analytics.js';

type MondayLeadInsightsParams = {
  fromDay: string;
  toDay: string;
  timeZone: string;
  scope?: MondayLeadScope;
  boardIds?: string[];
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
    scope: MondayLeadScope;
  };
  includedBoards: string[];
  excludedBoards: string[];
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
  dataQuality: {
    attributionRows: number;
    sourceCoveragePct: number;
    campaignCoveragePct: number;
    setByCoveragePct: number;
    touchpointsCoveragePct: number;
    staleBoards: number;
    erroredBoards: number;
    emptyBoards: number;
  };
};

type QuerySpec = {
  clause: string;
  values: Array<unknown>;
};

const buildBoardFilter = (boardIds: string[], placeholderIndex: number): QuerySpec => {
  if (!boardIds.length) return { clause: ' AND FALSE', values: [] };
  return {
    clause: ` AND board_id = ANY($${placeholderIndex}::text[])`,
    values: [boardIds],
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
  const requestedScope: MondayLeadScope = params.scope || 'curated';
  const pool = getPool();
  const scopeResolution = await resolveMondayLeadScope(
    {
      scope: requestedScope,
      boardIds: params.boardIds,
    },
    logger,
  );
  const includedBoards = scopeResolution.includedBoardIds;
  const excludedBoards = scopeResolution.excludedBoardIds;

  if (!pool) {
    return {
      window: {
        fromDay: params.fromDay,
        toDay: params.toDay,
        timeZone: params.timeZone,
        scope: requestedScope,
      },
      includedBoards,
      excludedBoards,
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
      dataQuality: {
        attributionRows: 0,
        sourceCoveragePct: 0,
        campaignCoveragePct: 0,
        setByCoveragePct: 0,
        touchpointsCoveragePct: 0,
        staleBoards: 0,
        erroredBoards: 0,
        emptyBoards: 0,
      },
    };
  }

  const sourceLimit = toPositiveInt(params.sourceLimit, 12, 50);
  const setterLimit = toPositiveInt(params.setterLimit, 12, 50);
  const boardFilter = buildBoardFilter(includedBoards, 3);
  const baseValues = [params.fromDay, params.toDay, ...boardFilter.values];

  try {
    const [totalsResult, outcomesResult, sourcesResult, settersResult, activityResult, syncStateResult, qualityResult] =
      await Promise.all([
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
        ${includedBoards.length ? 'WHERE board_id = ANY($1::text[])' : 'WHERE FALSE'}
        ORDER BY updated_at DESC
        LIMIT 10
        `,
          includedBoards.length ? [includedBoards] : [],
        ),
        pool.query<{
          attribution_rows: number;
          source_populated: number;
          campaign_populated: number;
          set_by_populated: number;
          touchpoints_populated: number;
          stale_boards: number;
          errored_boards: number;
          empty_boards: number;
        }>(
          `
        WITH board_set AS (
          SELECT UNNEST($1::text[]) AS board_id
        ),
        attribution AS (
          SELECT
            COUNT(*)::int AS attribution_rows,
            COUNT(*) FILTER (
              WHERE source IS NOT NULL AND BTRIM(source) <> '' AND LOWER(BTRIM(source)) <> 'unknown'
            )::int AS source_populated,
            COUNT(*) FILTER (
              WHERE campaign IS NOT NULL AND BTRIM(campaign) <> '' AND LOWER(BTRIM(campaign)) <> 'unknown'
            )::int AS campaign_populated,
            COUNT(*) FILTER (WHERE set_by IS NOT NULL AND BTRIM(set_by) <> '')::int AS set_by_populated
          FROM lead_attribution
          WHERE board_id IN (SELECT board_id FROM board_set)
            AND COALESCE(call_date, item_updated_at::date) BETWEEN $2::date AND $3::date
        ),
        touchpoints AS (
          SELECT COUNT(*)::int AS touchpoints_populated
          FROM monday_call_column_latest c
          WHERE c.board_id IN (SELECT board_id FROM board_set)
            AND c.column_title = 'Touchpoints'
            AND c.text_value IS NOT NULL
            AND BTRIM(c.text_value) <> ''
        ),
        sync_health AS (
          SELECT
            COUNT(*) FILTER (
              WHERE ms.last_sync_at IS NULL OR ms.last_sync_at < (NOW() - INTERVAL '24 hours')
            )::int AS stale_boards,
            COUNT(*) FILTER (WHERE ms.status = 'error')::int AS errored_boards,
            COUNT(*) FILTER (WHERE COALESCE(sn.snapshot_count, 0) = 0)::int AS empty_boards
          FROM board_set b
          LEFT JOIN monday_sync_state ms ON ms.board_id = b.board_id
          LEFT JOIN (
            SELECT board_id, COUNT(*)::int AS snapshot_count
            FROM monday_call_snapshots
            GROUP BY board_id
          ) sn ON sn.board_id = b.board_id
        )
        SELECT
          COALESCE(a.attribution_rows, 0) AS attribution_rows,
          COALESCE(a.source_populated, 0) AS source_populated,
          COALESCE(a.campaign_populated, 0) AS campaign_populated,
          COALESCE(a.set_by_populated, 0) AS set_by_populated,
          COALESCE(t.touchpoints_populated, 0) AS touchpoints_populated,
          COALESCE(s.stale_boards, 0) AS stale_boards,
          COALESCE(s.errored_boards, 0) AS errored_boards,
          COALESCE(s.empty_boards, 0) AS empty_boards
        FROM attribution a
        CROSS JOIN touchpoints t
        CROSS JOIN sync_health s
        `,
          [includedBoards, params.fromDay, params.toDay],
        ),
      ]);

    const totalsRow = totalsResult.rows[0];
    const qualityRow = qualityResult.rows[0];
    const attributionRows = qualityRow?.attribution_rows || 0;
    const toPct = (numerator: number, denominator: number): number => {
      if (denominator <= 0) return 0;
      return Math.round((numerator / denominator) * 10000) / 100;
    };
    return {
      window: {
        fromDay: params.fromDay,
        toDay: params.toDay,
        timeZone: params.timeZone,
        scope: requestedScope,
      },
      includedBoards,
      excludedBoards,
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
      dataQuality: {
        attributionRows,
        sourceCoveragePct: toPct(qualityRow?.source_populated || 0, attributionRows),
        campaignCoveragePct: toPct(qualityRow?.campaign_populated || 0, attributionRows),
        setByCoveragePct: toPct(qualityRow?.set_by_populated || 0, attributionRows),
        touchpointsCoveragePct: toPct(qualityRow?.touchpoints_populated || 0, attributionRows),
        staleBoards: qualityRow?.stale_boards || 0,
        erroredBoards: qualityRow?.errored_boards || 0,
        emptyBoards: qualityRow?.empty_boards || 0,
      },
    };
  } catch (error) {
    logger?.warn?.('Failed to build monday lead insights', error);
    throw error;
  }
};
