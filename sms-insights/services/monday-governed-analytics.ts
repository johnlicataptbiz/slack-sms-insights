import type { Logger } from '@slack/bolt';
import { getPrisma } from './prisma.js';

export type MondayLeadScope = 'curated' | 'all' | 'board_ids';

export type MondayScopeResolution = {
  scope: MondayLeadScope;
  requestedBoardIds: string[];
  includedBoardIds: string[];
  excludedBoardIds: string[];
};

const parseCsv = (value: string | null | undefined): string[] =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const parseScope = (value: string | null | undefined): MondayLeadScope => {
  if (value === 'all') return 'all';
  if (value === 'board_ids') return 'board_ids';
  return 'curated';
};

const normalizeBoardIds = (value: string[] | null | undefined): string[] => {
  const dedup = new Set<string>();
  for (const boardId of value || []) {
    const normalized = boardId.trim();
    if (!normalized) continue;
    dedup.add(normalized);
  }
  return [...dedup];
};

export const resolveMondayLeadScope = async (
  params: {
    scope: MondayLeadScope;
    boardIds?: string[];
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayScopeResolution> => {
  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        board_id: string;
        active: boolean;
        metric_grain: 'lead_item' | 'aggregate_metric';
        include_in_funnel: boolean;
      }>
    >(`
      SELECT board_id, active, metric_grain, include_in_funnel
      FROM monday_board_registry
      ORDER BY board_id ASC
    `);

    const activeRows = rows.filter((row) => row.active);
    const requestedBoardIds = normalizeBoardIds(params.boardIds);
    const requestedSet = new Set(requestedBoardIds);

    let includedBoardIds: string[] = [];
    if (params.scope === 'curated') {
      includedBoardIds = activeRows
        .filter((row) => row.metric_grain === 'lead_item' && row.include_in_funnel)
        .map((row) => row.board_id);
    } else if (params.scope === 'all') {
      includedBoardIds = activeRows.filter((row) => row.metric_grain === 'lead_item').map((row) => row.board_id);
    } else {
      includedBoardIds = activeRows
        .filter((row) => row.metric_grain === 'lead_item' && requestedSet.has(row.board_id))
        .map((row) => row.board_id);
    }

    const includedSet = new Set(includedBoardIds);
    const excludedBoardIds = activeRows
      .filter((row) => row.metric_grain === 'lead_item' && !includedSet.has(row.board_id))
      .map((row) => row.board_id);

    return {
      scope: params.scope,
      requestedBoardIds,
      includedBoardIds,
      excludedBoardIds,
    };
  } catch (error) {
    logger?.warn?.('Failed to resolve monday lead scope', error);
    return {
      scope: params.scope,
      requestedBoardIds: normalizeBoardIds(params.boardIds),
      includedBoardIds: [],
      excludedBoardIds: [],
    };
  }
};

export const parseBoardIdsQuery = (raw: string | null | undefined): string[] => parseCsv(raw);

export const listMondayBoardCatalog = async (
  params?: { staleThresholdHours?: number },
  logger?: Pick<Logger, 'warn'>,
): Promise<{
  generatedAt: string;
  staleThresholdHours: number;
  totals: {
    boards: number;
    active: number;
    funnelBoards: number;
    synced: number;
    stale: number;
    errored: number;
    empty: number;
  };
  boards: Array<{
    boardId: string;
    boardLabel: string;
    boardClass: string;
    metricGrain: string;
    includeInFunnel: boolean;
    includeInExec: boolean;
    active: boolean;
    ownerTeam: string | null;
    notes: string | null;
    syncStatus: string | null;
    lastSyncAt: string | null;
    syncUpdatedAt: string | null;
    syncError: string | null;
    isStale: boolean;
    snapshotCount: number;
    leadOutcomeCount: number;
    leadAttributionCount: number;
    setterActivityCount: number;
    metricFactCount: number;
    coverage: {
      sourcePopulated: number;
      campaignPopulated: number;
      setByPopulated: number;
      touchpointsPopulated: number;
    };
  }>;
}> => {
  const staleThresholdHours = Math.max(1, params?.staleThresholdHours || 24);
  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        board_id: string;
        board_label: string;
        board_class: string;
        metric_grain: string;
        include_in_funnel: boolean;
        include_in_exec: boolean;
        active: boolean;
        owner_team: string | null;
        notes: string | null;
        sync_status: string | null;
        last_sync_at: string | Date | null;
        sync_updated_at: string | Date | null;
        sync_error: string | null;
        snapshot_count: number | bigint;
        lead_outcome_count: number | bigint;
        lead_attribution_count: number | bigint;
        setter_activity_count: number | bigint;
        metric_fact_count: number | bigint;
        source_populated: number | bigint;
        campaign_populated: number | bigint;
        set_by_populated: number | bigint;
        touchpoints_populated: number | bigint;
      }>
    >(`
      SELECT *
      FROM analytics_board_registry_v
      ORDER BY board_class ASC, board_label ASC, board_id ASC
    `);

    const staleMs = staleThresholdHours * 60 * 60 * 1000;
    const now = Date.now();
    const boards = rows.map((row) => {
      const lastSyncMs = row.last_sync_at ? new Date(row.last_sync_at).getTime() : Number.NaN;
      const isStale = !Number.isFinite(lastSyncMs) || now - lastSyncMs > staleMs;
      return {
        boardId: row.board_id,
        boardLabel: row.board_label,
        boardClass: row.board_class,
        metricGrain: row.metric_grain,
        includeInFunnel: row.include_in_funnel,
        includeInExec: row.include_in_exec,
        active: row.active,
        ownerTeam: row.owner_team,
        notes: row.notes,
        syncStatus: row.sync_status,
        lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
        syncUpdatedAt: row.sync_updated_at ? new Date(row.sync_updated_at).toISOString() : null,
        syncError: row.sync_error,
        isStale,
        snapshotCount: Number(row.snapshot_count || 0),
        leadOutcomeCount: Number(row.lead_outcome_count || 0),
        leadAttributionCount: Number(row.lead_attribution_count || 0),
        setterActivityCount: Number(row.setter_activity_count || 0),
        metricFactCount: Number(row.metric_fact_count || 0),
        coverage: {
          sourcePopulated: Number(row.source_populated || 0),
          campaignPopulated: Number(row.campaign_populated || 0),
          setByPopulated: Number(row.set_by_populated || 0),
          touchpointsPopulated: Number(row.touchpoints_populated || 0),
        },
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      staleThresholdHours,
      totals: {
        boards: boards.length,
        active: boards.filter((row) => row.active).length,
        funnelBoards: boards.filter((row) => row.includeInFunnel && row.metricGrain === 'lead_item' && row.active)
          .length,
        synced: boards.filter((row) => row.syncStatus === 'success').length,
        stale: boards.filter((row) => row.active && row.isStale).length,
        errored: boards.filter((row) => row.syncStatus === 'error').length,
        empty: boards.filter((row) => row.snapshotCount === 0).length,
      },
      boards,
    };
  } catch (error) {
    logger?.warn?.('Failed to list monday board catalog', error);
    return {
      generatedAt: new Date().toISOString(),
      staleThresholdHours,
      totals: { boards: 0, active: 0, funnelBoards: 0, synced: 0, stale: 0, errored: 0, empty: 0 },
      boards: [],
    };
  }
};

export const getMondayScorecards = async (
  params: {
    fromDay: string;
    toDay: string;
    timeZone: string;
    boardClass?: string | null;
    metricOwner?: string | null;
    metricName?: string | null;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<{
  window: { fromDay: string; toDay: string; timeZone: string };
  filters: { boardClass: string | null; metricOwner: string | null; metricName: string | null };
  totals: { rows: number; boards: number; metrics: number };
  metrics: Array<{
    metricName: string;
    rowCount: number;
    boards: number;
    totalValue: number | null;
    avgValue: number | null;
  }>;
  trendByDay: Array<{ day: string; metricName: string; value: number | null; rowCount: number }>;
  byOwner: Array<{
    metricOwner: string;
    role: 'setter' | 'closer' | 'other';
    rowCount: number;
    totalValue: number | null;
  }>;
}> => {
  const prisma = getPrisma();

  const values: any[] = [params.fromDay, params.toDay];
  const where: string[] = ['metric_date BETWEEN $1::date AND $2::date'];
  if ((params.boardClass || '').trim()) {
    values.push((params.boardClass || '').trim());
    where.push(`board_class = $${values.length}`);
  }
  if ((params.metricOwner || '').trim()) {
    values.push(`%${(params.metricOwner || '').trim()}%`);
    where.push(`metric_owner ILIKE $${values.length}`);
  }
  if ((params.metricName || '').trim()) {
    values.push(`%${(params.metricName || '').trim()}%`);
    where.push(`metric_name ILIKE $${values.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [totalsResult, metricsResult, trendResult, ownersResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ rows: number | bigint; boards: number | bigint; metrics: number | bigint }>>(
        `
        SELECT
          COUNT(*)::int AS rows,
          COUNT(DISTINCT board_id)::int AS boards,
          COUNT(DISTINCT metric_name)::int AS metrics
        FROM analytics_monday_scorecard_fact_v
        ${whereSql}
      `,
        ...values,
      ),
      prisma.$queryRawUnsafe<
        Array<{
          metric_name: string;
          row_count: number | bigint;
          boards: number | bigint;
          total_value: number | bigint | null;
          avg_value: number | bigint | null;
        }>
      >(
        `
        SELECT
          metric_name,
          COUNT(*)::int AS row_count,
          COUNT(DISTINCT board_id)::int AS boards,
          SUM(metric_value_num)::double precision AS total_value,
          AVG(metric_value_num)::double precision AS avg_value
        FROM analytics_monday_scorecard_fact_v
        ${whereSql}
        GROUP BY metric_name
        ORDER BY row_count DESC, metric_name ASC
        LIMIT 50
      `,
        ...values,
      ),
      prisma.$queryRawUnsafe<
        Array<{ day: string | Date; metric_name: string; value: number | bigint | null; row_count: number | bigint }>
      >(
        `
        SELECT
          metric_date::text AS day,
          metric_name,
          SUM(metric_value_num)::double precision AS value,
          COUNT(*)::int AS row_count
        FROM analytics_monday_scorecard_fact_v
        ${whereSql}
        GROUP BY metric_date, metric_name
        ORDER BY metric_date ASC, metric_name ASC
        LIMIT 1000
      `,
        ...values,
      ),
      prisma.$queryRawUnsafe<
        Array<{
          metric_owner: string;
          role: 'setter' | 'closer' | 'other';
          row_count: number | bigint;
          total_value: number | bigint | null;
        }>
      >(
        `
        WITH actor_match AS (
          SELECT
            m.metric_owner,
            COALESCE((
              SELECT ad.role
              FROM actor_directory ad
              WHERE ad.active = TRUE
                AND (
                  LOWER(COALESCE(m.metric_owner, '')) = LOWER(ad.canonical_name)
                  OR EXISTS (
                    SELECT 1
                    FROM unnest(ad.aliases) alias
                    WHERE LOWER(alias) = LOWER(COALESCE(m.metric_owner, ''))
                  )
                )
              LIMIT 1
            ), 'other') AS role,
            m.metric_value_num
          FROM analytics_monday_scorecard_fact_v m
          ${whereSql}
        )
        SELECT
          COALESCE(NULLIF(BTRIM(metric_owner), ''), 'Unassigned') AS metric_owner,
          role,
          COUNT(*)::int AS row_count,
          SUM(metric_value_num)::double precision AS total_value
        FROM actor_match
        GROUP BY COALESCE(NULLIF(BTRIM(metric_owner), ''), 'Unassigned'), role
        ORDER BY row_count DESC, metric_owner ASC
        LIMIT 50
      `,
        ...values,
      ),
    ]);

    const totalsRow = totalsResult[0];

    return {
      window: { fromDay: params.fromDay, toDay: params.toDay, timeZone: params.timeZone },
      filters: {
        boardClass: params.boardClass || null,
        metricOwner: params.metricOwner || null,
        metricName: params.metricName || null,
      },
      totals: {
        rows: Number(totalsRow?.rows || 0),
        boards: Number(totalsRow?.boards || 0),
        metrics: Number(totalsRow?.metrics || 0),
      },
      metrics: metricsResult.map((row) => ({
        metricName: row.metric_name,
        rowCount: Number(row.row_count),
        boards: Number(row.boards),
        totalValue: row.total_value !== null ? Number(row.total_value) : null,
        avgValue: row.avg_value !== null ? Number(row.avg_value) : null,
      })),
      trendByDay: trendResult.map((row) => ({
        day: row.day instanceof Date ? row.day.toISOString().split('T')[0] : String(row.day),
        metricName: row.metric_name,
        value: row.value !== null ? Number(row.value) : null,
        rowCount: Number(row.row_count),
      })),
      byOwner: ownersResult.map((row) => ({
        metricOwner: row.metric_owner,
        role: row.role,
        rowCount: Number(row.row_count),
        totalValue: row.total_value !== null ? Number(row.total_value) : null,
      })),
    };
  } catch (error) {
    logger?.warn?.('Failed to fetch monday scorecards', error);
    return {
      window: { fromDay: params.fromDay, toDay: params.toDay, timeZone: params.timeZone },
      filters: {
        boardClass: params.boardClass || null,
        metricOwner: params.metricOwner || null,
        metricName: params.metricName || null,
      },
      totals: { rows: 0, boards: 0, metrics: 0 },
      metrics: [],
      trendByDay: [],
      byOwner: [],
    };
  }
};
