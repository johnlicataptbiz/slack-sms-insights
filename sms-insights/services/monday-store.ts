import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export type MondaySyncStatus = 'idle' | 'running' | 'success' | 'error';
export type MondayBoardClass =
  | 'lead_funnel'
  | 'personal_calls'
  | 'sales_scorecard'
  | 'marketing_scorecard'
  | 'retention_scorecard'
  | 'other'
  | 'inactive';
export type MondayMetricGrain = 'lead_item' | 'aggregate_metric';

export type MondaySyncStateRow = {
  board_id: string;
  cursor: string | null;
  last_sync_at: string | null;
  status: MondaySyncStatus | null;
  error: string | null;
  updated_at: string;
};

export type MondayBoardRegistryRow = {
  board_id: string;
  board_label: string;
  board_class: MondayBoardClass;
  metric_grain: MondayMetricGrain;
  include_in_funnel: boolean;
  include_in_exec: boolean;
  active: boolean;
  owner_team: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ActorDirectoryRow = {
  canonical_name: string;
  role: 'setter' | 'closer' | 'other';
  aliases: string[];
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MondayCallDisposition = 'booked' | 'no_show' | 'cancelled' | 'other';

export type MondayCallSnapshotInput = {
  boardId: string;
  itemId: string;
  itemName?: string | null;
  updatedAt: Date;
  callDate?: string | null;
  setter?: string | null;
  stage?: string | null;
  disposition?: MondayCallDisposition | null;
  isBooked?: boolean;
  contactKey?: string | null;
  raw?: unknown | null;
};

export type MondayCallColumnValueInput = {
  columnId: string;
  columnTitle?: string | null;
  columnType?: string | null;
  textValue?: string | null;
  valueJson?: unknown | null;
};

export type MondayMetricFactInput = {
  boardId: string;
  itemId: string;
  itemUpdatedAt: Date;
  callDate?: string | null;
  setter?: string | null;
  columns: MondayCallColumnValueInput[];
  raw?: unknown | null;
};

export type MondayCallColumnValuesUpsertInput = {
  boardId: string;
  itemId: string;
  itemUpdatedAt: Date;
  values: MondayCallColumnValueInput[];
};

export type MondayCallSnapshotRow = {
  board_id: string;
  item_id: string;
  item_name: string | null;
  updated_at: string;
  call_date: string | null;
  setter: string | null;
  stage: string | null;
  disposition: MondayCallDisposition | null;
  is_booked: boolean;
  contact_key: string | null;
  raw: unknown | null;
  synced_at: string;
};

export type MondayWeeklyReportRow = {
  week_start: string;
  source_board_id: string | null;
  summary_json: unknown;
  monday_item_id: string | null;
  synced_at: string;
};

export type MondayBookedCallPushStatus = 'pending' | 'synced' | 'error' | 'skipped';
export type MondayOutcomeCategory =
  | 'closed_won'
  | 'closed_lost'
  | 'bad_timing'
  | 'bad_fit'
  | 'no_show'
  | 'cancelled'
  | 'booked'
  | 'other'
  | 'unknown';

export type MondayBookedCallPushRow = {
  board_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  setter_bucket: string;
  monday_item_id: string | null;
  status: MondayBookedCallPushStatus;
  error: string | null;
  payload_json: unknown;
  pushed_at: string | null;
  updated_at: string;
};

export type MondayNormalizedLeadInput = {
  boardId: string;
  itemId: string;
  itemName?: string | null;
  itemUpdatedAt: Date;
  callDate?: string | null;
  contactKey?: string | null;
  setter?: string | null;
  stage?: string | null;
  disposition?: MondayCallDisposition | null;
  isBooked?: boolean;
  columns: MondayCallColumnValueInput[];
  raw?: unknown | null;
};

// getDb and getPool removal; using getPrisma instead.

const normalizeText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeForMatch = (value: string | null | undefined): string => (value || '').trim().toLowerCase();

const parseIsoDate = (candidate: string | null | undefined): string | null => {
  const text = normalizeText(candidate);
  if (!text) return null;
  const direct = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (direct?.[1]) return direct[1];
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseNumericMetric = (value: string | null | undefined): number | null => {
  const text = normalizeText(value);
  if (!text) return null;
  const normalized = text.replace(/,/g, '').replace(/\$/g, '').replace(/%/g, '').trim();
  if (!normalized) return null;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseDateFromColumn = (column: MondayCallColumnValueInput | null): string | null => {
  if (!column) return null;
  const fromText = parseIsoDate(column.textValue ?? null);
  if (fromText) return fromText;
  if (!column.valueJson || typeof column.valueJson !== 'object') return null;
  const payload = column.valueJson as Record<string, unknown>;
  const fromDate = typeof payload.date === 'string' ? parseIsoDate(payload.date) : null;
  if (fromDate) return fromDate;
  const fromChangedAt = typeof payload.changed_at === 'string' ? parseIsoDate(payload.changed_at) : null;
  if (fromChangedAt) return fromChangedAt;
  return null;
};

const findColumnBySignals = (
  columns: MondayCallColumnValueInput[],
  signals: string[],
): MondayCallColumnValueInput | null => {
  const normalizedSignals = signals.map((signal) => signal.toLowerCase());
  for (const column of columns) {
    const haystack = `${normalizeForMatch(column.columnTitle)} ${normalizeForMatch(column.columnId)} ${normalizeForMatch(column.columnType)}`;
    if (normalizedSignals.some((signal) => haystack.includes(signal))) {
      return column;
    }
  }
  return null;
};

const findTextBySignals = (columns: MondayCallColumnValueInput[], signals: string[]): string | null => {
  return normalizeText(findColumnBySignals(columns, signals)?.textValue ?? null);
};

const classifyOutcomeCategory = (
  stage: string | null,
  outcomeLabel: string | null,
  outcomeReason: string | null,
  disposition: MondayCallDisposition | null | undefined,
  isBooked: boolean,
): MondayOutcomeCategory => {
  const text = `${stage || ''} ${outcomeLabel || ''} ${outcomeReason || ''}`.toLowerCase();

  if (/\bbad timing\b/.test(text)) return 'bad_timing';
  if (/\bbad fit\b/.test(text)) return 'bad_fit';
  if (/\bclosed won\b|\bwon\b|\bsale\b|\bsigned\b|\benrolled\b/.test(text)) return 'closed_won';
  if (/\bclosed lost\b|\blost\b/.test(text)) return 'closed_lost';
  if (disposition === 'no_show' || /\bno[\s-]?show\b/.test(text)) return 'no_show';
  if (disposition === 'cancelled' || /\bcancel|cancelled|canceled|resched/i.test(text)) return 'cancelled';
  if (disposition === 'booked' || isBooked || /\bbooked|appointment|strategy call\b/.test(text)) return 'booked';
  if (!text.trim()) return 'unknown';
  return 'other';
};

export const getMondaySyncState = async (
  boardId: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondaySyncStateRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_sync_state.findUnique({
      where: { board_id: boardId },
    });
    return result as unknown as MondaySyncStateRow | null;
  } catch (error) {
    logger?.warn?.('Failed to read monday sync state', error);
    return null;
  }
};

export const getMondayBoardRegistry = async (
  boardId: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayBoardRegistryRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_board_registry.findUnique({
      where: { board_id: boardId },
    });
    return result as unknown as MondayBoardRegistryRow | null;
  } catch (error) {
    logger?.warn?.('Failed to read monday board registry row', error);
    return null;
  }
};

export const upsertMondayBoardRegistry = async (
  params: {
    boardId: string;
    boardLabel: string;
    boardClass: MondayBoardClass;
    metricGrain: MondayMetricGrain;
    includeInFunnel?: boolean;
    includeInExec?: boolean;
    active?: boolean;
    ownerTeam?: string | null;
    notes?: string | null;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_board_registry.upsert({
      where: { board_id: params.boardId },
      update: {
        board_label: params.boardLabel,
        board_class: params.boardClass,
        metric_grain: params.metricGrain,
        include_in_funnel: params.includeInFunnel === true,
        include_in_exec: params.includeInExec === true,
        active: params.active !== false,
        owner_team: params.ownerTeam ?? null,
        notes: params.notes ?? null,
        updated_at: new Date(),
      },
      create: {
        board_id: params.boardId,
        board_label: params.boardLabel,
        board_class: params.boardClass,
        metric_grain: params.metricGrain,
        include_in_funnel: params.includeInFunnel === true,
        include_in_exec: params.includeInExec === true,
        active: params.active !== false,
        owner_team: params.ownerTeam ?? null,
        notes: params.notes ?? null,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday board registry row', error);
  }
};

export const listPendingMondayBookedCallPushes = async (
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayBookedCallPushRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_booked_call_pushes.findMany({
      where: { status: 'pending' },
      orderBy: { updated_at: 'asc' },
    });
    return result as unknown as MondayBookedCallPushRow[];
  } catch (error) {
    logger?.warn?.('Failed to list pending monday booked call pushes', error);
    return [];
  }
};

export const listMondayBoardRegistry = async (logger?: Pick<Logger, 'warn'>): Promise<MondayBoardRegistryRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_board_registry.findMany({
      orderBy: [
        { board_label: 'asc' },
        { board_id: 'asc' },
      ],
    });
    return result as unknown as MondayBoardRegistryRow[];
  } catch (error) {
    logger?.warn?.('Failed to list monday board registry', error);
    return [];
  }
};

export const listMondayActorDirectory = async (logger?: Pick<Logger, 'warn'>): Promise<ActorDirectoryRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.actor_directory.findMany({
      where: { active: true },
      orderBy: [
        { role: 'asc' },
        { canonical_name: 'asc' },
      ],
    });
    return result as unknown as ActorDirectoryRow[];
  } catch (error) {
    logger?.warn?.('Failed to list actor directory', error);
    return [];
  }
};

export const upsertMondaySyncState = async (
  params: {
    boardId: string;
    cursor?: string | null;
    lastSyncAt?: Date | null;
    status?: MondaySyncStatus | null;
    error?: string | null;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_sync_state.upsert({
      where: { board_id: params.boardId },
      update: {
        cursor: params.cursor ?? null,
        last_sync_at: params.lastSyncAt ?? null,
        status: params.status ?? null,
        error: params.error ?? null,
        updated_at: new Date(),
      },
      create: {
        board_id: params.boardId,
        cursor: params.cursor ?? null,
        last_sync_at: params.lastSyncAt ?? null,
        status: params.status ?? null,
        error: params.error ?? null,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday sync state', error);
  }
};

export const saveMondayColumnMapping = async (
  boardId: string,
  mapping: unknown,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_column_mappings.upsert({
      where: { board_id: boardId },
      update: {
        mapping_json: (mapping ?? {}) as any,
        updated_at: new Date(),
      },
      create: {
        board_id: boardId,
        mapping_json: (mapping ?? {}) as any,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to save monday column mapping', error);
  }
};

export const getMondayColumnMapping = async (
  boardId: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<unknown | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_column_mappings.findUnique({
      where: { board_id: boardId },
      select: { mapping_json: true },
    });
    return result?.mapping_json ?? null;
  } catch (error) {
    logger?.warn?.('Failed to read monday column mapping', error);
    return null;
  }
};

export const deleteMondayCallSnapshots = async (
  boardId: string,
  itemIds: string[],
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  if (!itemIds.length) return;
  try {
    await prisma.monday_call_snapshots.deleteMany({
      where: {
        board_id: boardId,
        item_id: { in: itemIds },
      } as any,
    });
  } catch (error) {
    logger?.warn?.('Failed to delete monday call snapshots', error);
  }
};
export const upsertMondayCallSnapshot = async (
  input: MondayCallSnapshotInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_call_snapshots.upsert({
      where: {
        board_id_item_id: {
          board_id: input.boardId,
          item_id: input.itemId,
        },
      },
      update: {
        item_name: input.itemName ?? null,
        updated_at: input.updatedAt,
        call_date: input.callDate ?? null,
        setter: input.setter ?? null,
        stage: input.stage ?? null,
        disposition: input.disposition ?? null,
        is_booked: input.isBooked === true,
        contact_key: input.contactKey ?? null,
        raw: (input.raw ?? null) as any,
        synced_at: new Date(),
      },
      create: {
        board_id: input.boardId,
        item_id: input.itemId,
        item_name: input.itemName ?? null,
        updated_at: input.updatedAt,
        call_date: input.callDate ?? null,
        setter: input.setter ?? null,
        stage: input.stage ?? null,
        disposition: input.disposition ?? null,
        is_booked: input.isBooked === true,
        contact_key: input.contactKey ?? null,
        raw: (input.raw ?? null) as any,
        synced_at: new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday call snapshot', error);
  }
};

export const upsertMondayCallColumnValues = async (
  input: MondayCallColumnValuesUpsertInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  if (!input.values.length) return;

  const payload = input.values.map((value) => ({
    column_id: value.columnId,
    column_title: value.columnTitle ?? null,
    column_type: value.columnType ?? null,
    text_value: value.textValue ?? null,
    value_json: value.valueJson ?? null,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS t(
            column_id TEXT,
            column_title TEXT,
            column_type TEXT,
            text_value TEXT,
            value_json JSONB
          )
        )
        INSERT INTO monday_call_column_latest (
          board_id,
          item_id,
          column_id,
          column_title,
          column_type,
          text_value,
          value_json,
          item_updated_at,
          synced_at
        )
        SELECT
          $2,
          $3,
          incoming.column_id,
          incoming.column_title,
          incoming.column_type,
          incoming.text_value,
          incoming.value_json,
          $4,
          CURRENT_TIMESTAMP
        FROM incoming
        ON CONFLICT (board_id, item_id, column_id)
        DO UPDATE SET
          column_title = EXCLUDED.column_title,
          column_type = EXCLUDED.column_type,
          text_value = EXCLUDED.text_value,
          value_json = EXCLUDED.value_json,
          item_updated_at = EXCLUDED.item_updated_at,
          synced_at = CURRENT_TIMESTAMP
        `,
        JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt
      );

      await tx.$queryRawUnsafe(
        `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS t(
            column_id TEXT,
            column_title TEXT,
            column_type TEXT,
            text_value TEXT,
            value_json JSONB
          )
        )
        INSERT INTO monday_call_column_history (
          board_id,
          item_id,
          column_id,
          column_title,
          column_type,
          text_value,
          value_json,
          item_updated_at,
          synced_at
        )
        SELECT
          $2,
          $3,
          incoming.column_id,
          incoming.column_title,
          incoming.column_type,
          incoming.text_value,
          incoming.value_json,
          $4,
          CURRENT_TIMESTAMP
        FROM incoming
        ON CONFLICT (board_id, item_id, column_id, item_updated_at)
        DO UPDATE SET
          column_title = EXCLUDED.column_title,
          column_type = EXCLUDED.column_type,
          text_value = EXCLUDED.text_value,
          value_json = EXCLUDED.value_json,
          synced_at = CURRENT_TIMESTAMP
        `,
        JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt
      );
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday call column values', error);
  }
};

export const upsertNormalizedMondayLeadRecords = async (
  input: MondayNormalizedLeadInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();

  const outcomeLabel =
    findTextBySignals(input.columns, ['outcome', 'result', 'disposition', 'status']) || input.stage || null;
  const outcomeReason = findTextBySignals(input.columns, ['reason', 'lost reason', 'disqual', 'close reason', 'notes']);
  const source = findTextBySignals(input.columns, ['lead source', 'source', 'channel', 'utm']);
  const setBy = findTextBySignals(input.columns, ['set by', 'booked by', 'setter']);
  const setter = normalizeText(input.setter) || setBy;
  const stage = normalizeText(input.stage);
  const campaign = findTextBySignals(input.columns, ['campaign', 'offer', 'adset', 'ad set', 'funnel']);
  const sequence = findTextBySignals(input.columns, ['sequence', 'cadence']);
  const leadStatus = findTextBySignals(input.columns, ['lead status', 'status']) || stage;

  const firstTouchDate =
    parseDateFromColumn(
      findColumnBySignals(input.columns, ['first touch', 'created date', 'lead date', 'inbound date']),
    ) || null;
  const callDate =
    normalizeText(input.callDate) ||
    parseDateFromColumn(findColumnBySignals(input.columns, ['call date', 'appointment date', 'meeting date'])) ||
    null;
  const closedDate = parseDateFromColumn(
    findColumnBySignals(input.columns, ['closed date', 'won date', 'lost date', 'decision date']),
  );

  const outcomeCategory = classifyOutcomeCategory(
    stage,
    outcomeLabel,
    outcomeReason,
    input.disposition,
    input.isBooked === true,
  );
  const activityDate = callDate || closedDate || firstTouchDate || input.itemUpdatedAt.toISOString().slice(0, 10);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `
        INSERT INTO lead_outcomes (
          board_id,
          item_id,
          lead_name,
          contact_key,
          call_date,
          setter,
          set_by,
          source,
          stage,
          outcome_label,
          outcome_reason,
          outcome_category,
          is_booked,
          item_updated_at,
          raw,
          synced_at
        )
        VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,CURRENT_TIMESTAMP)
        ON CONFLICT (board_id, item_id)
        DO UPDATE SET
          lead_name = EXCLUDED.lead_name,
          contact_key = EXCLUDED.contact_key,
          call_date = EXCLUDED.call_date,
          setter = EXCLUDED.setter,
          set_by = EXCLUDED.set_by,
          source = EXCLUDED.source,
          stage = EXCLUDED.stage,
          outcome_label = EXCLUDED.outcome_label,
          outcome_reason = EXCLUDED.outcome_reason,
          outcome_category = EXCLUDED.outcome_category,
          is_booked = EXCLUDED.is_booked,
          item_updated_at = EXCLUDED.item_updated_at,
          raw = EXCLUDED.raw,
          synced_at = CURRENT_TIMESTAMP
        `,
        input.boardId,
        input.itemId,
        normalizeText(input.itemName),
        normalizeText(input.contactKey),
        callDate,
        setter,
        setBy,
        source,
        stage,
        outcomeLabel,
        outcomeReason,
        outcomeCategory,
        input.isBooked === true,
        input.itemUpdatedAt,
        JSON.stringify(input.raw ?? null)
      );

      await tx.$queryRawUnsafe(
        `
        INSERT INTO lead_attribution (
          board_id,
          item_id,
          lead_name,
          contact_key,
          source,
          setter,
          set_by,
          campaign,
          sequence,
          lead_status,
          first_touch_date,
          call_date,
          closed_date,
          item_updated_at,
          raw,
          synced_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,$13::date,$14,$15::jsonb,CURRENT_TIMESTAMP)
        ON CONFLICT (board_id, item_id)
        DO UPDATE SET
          lead_name = EXCLUDED.lead_name,
          contact_key = EXCLUDED.contact_key,
          source = EXCLUDED.source,
          setter = EXCLUDED.setter,
          set_by = EXCLUDED.set_by,
          campaign = EXCLUDED.campaign,
          sequence = EXCLUDED.sequence,
          lead_status = EXCLUDED.lead_status,
          first_touch_date = EXCLUDED.first_touch_date,
          call_date = EXCLUDED.call_date,
          closed_date = EXCLUDED.closed_date,
          item_updated_at = EXCLUDED.item_updated_at,
          raw = EXCLUDED.raw,
          synced_at = CURRENT_TIMESTAMP
        `,
        input.boardId,
        input.itemId,
        normalizeText(input.itemName),
        normalizeText(input.contactKey),
        source,
        setter,
        setBy,
        campaign,
        sequence,
        leadStatus,
        firstTouchDate,
        callDate,
        closedDate,
        input.itemUpdatedAt,
        JSON.stringify(input.raw ?? null)
      );

      await tx.$queryRawUnsafe(
        `
        INSERT INTO setter_activity (
          board_id,
          item_id,
          activity_date,
          setter,
          set_by,
          source,
          stage,
          outcome_category,
          is_booked,
          is_closed_won,
          is_closed_lost,
          is_bad_timing,
          is_bad_fit,
          is_no_show,
          is_cancelled,
          item_updated_at,
          raw,
          synced_at
        )
        VALUES (
          $1,$2,$3::date,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,
          $16,$17::jsonb,CURRENT_TIMESTAMP
        )
        ON CONFLICT (board_id, item_id)
        DO UPDATE SET
          activity_date = EXCLUDED.activity_date,
          setter = EXCLUDED.setter,
          set_by = EXCLUDED.set_by,
          source = EXCLUDED.source,
          stage = EXCLUDED.stage,
          outcome_category = EXCLUDED.outcome_category,
          is_booked = EXCLUDED.is_booked,
          is_closed_won = EXCLUDED.is_closed_won,
          is_closed_lost = EXCLUDED.is_closed_lost,
          is_bad_timing = EXCLUDED.is_bad_timing,
          is_bad_fit = EXCLUDED.is_bad_fit,
          is_no_show = EXCLUDED.is_no_show,
          is_cancelled = EXCLUDED.is_cancelled,
          item_updated_at = EXCLUDED.item_updated_at,
          raw = EXCLUDED.raw,
          synced_at = CURRENT_TIMESTAMP
        `,
        input.boardId,
        input.itemId,
        activityDate,
        setter,
        setBy,
        source,
        stage,
        outcomeCategory,
        input.isBooked === true,
        outcomeCategory === 'closed_won',
        outcomeCategory === 'closed_lost',
        outcomeCategory === 'bad_timing',
        outcomeCategory === 'bad_fit',
        outcomeCategory === 'no_show',
        outcomeCategory === 'cancelled',
        input.itemUpdatedAt,
        JSON.stringify(input.raw ?? null)
      );
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert normalized monday lead records', error);
  }
};

const IGNORED_SCORECARD_METRIC_TITLES = new Set([
  'subitems',
  'date',
  'metric owner',
  'playbook',
  'progress',
  'plan to correct',
]);

export const upsertMondayMetricFacts = async (
  input: MondayMetricFactInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();

  const metricDate =
    parseIsoDate(input.callDate) ||
    parseDateFromColumn(findColumnBySignals(input.columns, ['date', 'week', 'day', 'period'])) ||
    null;
  const metricOwner =
    normalizeText(input.setter) || findTextBySignals(input.columns, ['metric owner', 'owner', 'setter']);

  const payload = input.columns
    .map((column) => {
      const metricName = normalizeText(column.columnTitle);
      const metricNameNormalized = normalizeForMatch(metricName);
      if (!metricName || IGNORED_SCORECARD_METRIC_TITLES.has(metricNameNormalized)) return null;

      const metricText = normalizeText(column.textValue);
      const metricNumber = parseNumericMetric(metricText);
      const statusValue =
        metricText && (column.columnType === 'status' || column.columnType === 'dropdown' || metricNumber === null)
          ? metricText
          : null;

      if (!metricText && !column.valueJson) return null;

      return {
        metric_name: metricName,
        metric_value_num: metricNumber,
        metric_value_text: metricText,
        status_value: statusValue,
        raw: {
          columnId: column.columnId,
          columnTitle: column.columnTitle ?? null,
          columnType: column.columnType ?? null,
          textValue: column.textValue ?? null,
          valueJson: column.valueJson ?? null,
        },
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!payload.length) return;

  try {
    await prisma.$queryRawUnsafe(
      `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS t(
          metric_name TEXT,
          metric_value_num DOUBLE PRECISION,
          metric_value_text TEXT,
          status_value TEXT,
          raw JSONB
        )
      )
      INSERT INTO monday_metric_facts (
        board_id,
        item_id,
        metric_date,
        metric_owner,
        metric_name,
        metric_value_num,
        metric_value_text,
        status_value,
        item_updated_at,
        raw,
        synced_at
      )
      SELECT
        $2,
        $3,
        $4::date,
        $5,
        incoming.metric_name,
        incoming.metric_value_num,
        incoming.metric_value_text,
        incoming.status_value,
        $6,
        incoming.raw,
        CURRENT_TIMESTAMP
      FROM incoming
      ON CONFLICT (board_id, item_id, metric_name, item_updated_at)
      DO UPDATE SET
        metric_date = EXCLUDED.metric_date,
        metric_owner = EXCLUDED.metric_owner,
        metric_value_num = EXCLUDED.metric_value_num,
        metric_value_text = EXCLUDED.metric_value_text,
        status_value = EXCLUDED.status_value,
        raw = EXCLUDED.raw,
        synced_at = CURRENT_TIMESTAMP
      `,
      JSON.stringify(payload),
      input.boardId,
      input.itemId,
      metricDate,
      metricOwner,
      input.itemUpdatedAt
    );
  } catch (error) {
    logger?.warn?.('Failed to upsert monday metric facts', error);
  }
};

export const purgeMondayNormalizedRowsForNonFunnelBoards = async (
  logger?: Pick<Logger, 'warn'>,
): Promise<{ leadOutcomesDeleted: number; leadAttributionDeleted: number; setterActivityDeleted: number }> => {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const leadOutcomes = await tx.$queryRawUnsafe<{ count: string }>(`
        DELETE FROM lead_outcomes lo
        WHERE EXISTS (
          SELECT 1
          FROM monday_board_registry br
          WHERE br.board_id = lo.board_id
            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)
        )
        RETURNING 1
      `);
      const leadAttribution = await tx.$queryRawUnsafe<{ count: string }>(`
        DELETE FROM lead_attribution la
        WHERE EXISTS (
          SELECT 1
          FROM monday_board_registry br
          WHERE br.board_id = la.board_id
            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)
        )
        RETURNING 1
      `);
      const setterActivity = await tx.$queryRawUnsafe<{ count: string }>(`
        DELETE FROM setter_activity sa
        WHERE EXISTS (
          SELECT 1
          FROM monday_board_registry br
          WHERE br.board_id = sa.board_id
            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)
        )
        RETURNING 1
      `);

      return {
        leadOutcomesDeleted: Array.isArray(leadOutcomes) ? leadOutcomes.length : 0,
        leadAttributionDeleted: Array.isArray(leadAttribution) ? leadAttribution.length : 0,
        setterActivityDeleted: Array.isArray(setterActivity) ? setterActivity.length : 0,
      };
    });
  } catch (error) {
    logger?.warn?.('Failed to purge non-funnel monday normalized rows', error);
    return { leadOutcomesDeleted: 0, leadAttributionDeleted: 0, setterActivityDeleted: 0 };
  }
};

export const listMondayCallSnapshotsInRange = async (
  params: {
    boardId?: string;
    from: Date;
    to: Date;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayCallSnapshotRow[]> => {
  const prisma = getPrisma();
  try {
    const where: any = {
      updated_at: {
        gte: params.from,
        lte: params.to,
      },
    };
    if (params.boardId) where.board_id = params.boardId;

    const result = await prisma.monday_call_snapshots.findMany({
      where,
      orderBy: { updated_at: 'desc' },
    });
    return result as unknown as MondayCallSnapshotRow[];
  } catch (error) {
    logger?.warn?.('Failed to list monday call snapshots', error);
    return [];
  }
};

export const getLatestMondaySyncStatus = async (
  boardId?: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondaySyncStateRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_sync_state.findMany({
      where: boardId ? { board_id: boardId } : {},
      orderBy: { updated_at: 'desc' },
      take: 1,
    });
    return (result[0] as unknown as MondaySyncStateRow) || null;
  } catch (error) {
    logger?.warn?.('Failed to read monday sync status', error);
    return null;
  }
};

export const upsertMondayWeeklyReport = async (
  params: {
    weekStart: string;
    sourceBoardId?: string | null;
    summaryJson: unknown;
    mondayItemId?: string | null;
    syncedAt?: Date;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_weekly_reports.upsert({
      where: { week_start: new Date(params.weekStart) },
      update: {
        source_board_id: params.sourceBoardId ?? null,
        summary_json: (params.summaryJson ?? {}) as any,
        monday_item_id: params.mondayItemId ?? null,
        synced_at: params.syncedAt ?? new Date(),
      },
      create: {
        week_start: new Date(params.weekStart),
        source_board_id: params.sourceBoardId ?? null,
        summary_json: (params.summaryJson ?? {}) as any,
        monday_item_id: params.mondayItemId ?? null,
        synced_at: params.syncedAt ?? new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday weekly report', error);
  }
};

export const getMondayWeeklyReport = async (
  weekStart: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayWeeklyReportRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_weekly_reports.findUnique({
      where: { week_start: new Date(weekStart) },
    });
    return result as unknown as MondayWeeklyReportRow | null;
  } catch (error) {
    logger?.warn?.('Failed to read monday weekly report', error);
    return null;
  }
};

export const getMondayBookedCallPush = async (
  slackChannelId: string,
  slackMessageTs: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayBookedCallPushRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.monday_booked_call_pushes.findFirst({
      where: {
        slack_channel_id: slackChannelId,
        slack_message_ts: slackMessageTs,
      },
    });
    return result as unknown as MondayBookedCallPushRow | null;
  } catch (error) {
    logger?.warn?.('Failed to read monday booked call push', error);
    return null;
  }
};

export const upsertMondayBookedCallPush = async (
  params: {
    boardId: string;
    slackChannelId: string;
    slackMessageTs: string;
    setterBucket: string;
    mondayItemId?: string | null;
    status: MondayBookedCallPushStatus;
    error?: string | null;
    payloadJson: unknown;
    pushedAt?: Date | null;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const prisma = getPrisma();
  try {
    await prisma.monday_booked_call_pushes.upsert({
      where: {
        board_id_slack_channel_id_slack_message_ts: {
          board_id: params.boardId,
          slack_channel_id: params.slackChannelId,
          slack_message_ts: params.slackMessageTs,
        },
      },
      update: {
        setter_bucket: params.setterBucket,
        monday_item_id: params.mondayItemId ?? null,
        status: params.status,
        error: params.error ?? null,
        payload_json: (params.payloadJson ?? {}) as any,
        pushed_at: params.pushedAt ?? null,
        updated_at: new Date(),
      },
      create: {
        board_id: params.boardId,
        slack_channel_id: params.slackChannelId,
        slack_message_ts: params.slackMessageTs,
        setter_bucket: params.setterBucket,
        monday_item_id: params.mondayItemId ?? null,
        status: params.status,
        error: params.error ?? null,
        payload_json: (params.payloadJson ?? {}) as any,
        pushed_at: params.pushedAt ?? null,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    logger?.warn?.('Failed to upsert monday booked call push', error);
  }
};
