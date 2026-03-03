import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

export type MondaySyncStatus = 'idle' | 'running' | 'success' | 'error';

export type MondaySyncStateRow = {
  board_id: string;
  cursor: string | null;
  last_sync_at: string | null;
  status: MondaySyncStatus | null;
  error: string | null;
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

const getDb = () => getPool();

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

const findColumnBySignals = (columns: MondayCallColumnValueInput[], signals: string[]): MondayCallColumnValueInput | null => {
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
  const pool = getDb();
  if (!pool) return null;
  try {
    const result = await pool.query<MondaySyncStateRow>('SELECT * FROM monday_sync_state WHERE board_id = $1 LIMIT 1', [
      boardId,
    ]);
    return result.rows[0] || null;
  } catch (error) {
    logger?.warn?.('Failed to read monday sync state', error);
    return null;
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
  const pool = getDb();
  if (!pool) return;

  try {
    await pool.query(
      `
      INSERT INTO monday_sync_state (board_id, cursor, last_sync_at, status, error, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (board_id)
      DO UPDATE SET
        cursor = EXCLUDED.cursor,
        last_sync_at = EXCLUDED.last_sync_at,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        updated_at = CURRENT_TIMESTAMP
      `,
      [params.boardId, params.cursor ?? null, params.lastSyncAt ?? null, params.status ?? null, params.error ?? null],
    );
  } catch (error) {
    logger?.warn?.('Failed to upsert monday sync state', error);
  }
};

export const saveMondayColumnMapping = async (
  boardId: string,
  mapping: unknown,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const pool = getDb();
  if (!pool) return;

  try {
    await pool.query(
      `
      INSERT INTO monday_column_mappings (board_id, mapping_json, updated_at)
      VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (board_id)
      DO UPDATE SET
        mapping_json = EXCLUDED.mapping_json,
        updated_at = CURRENT_TIMESTAMP
      `,
      [boardId, JSON.stringify(mapping ?? {})],
    );
  } catch (error) {
    logger?.warn?.('Failed to save monday column mapping', error);
  }
};

export const getMondayColumnMapping = async (
  boardId: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<unknown | null> => {
  const pool = getDb();
  if (!pool) return null;
  try {
    const result = await pool.query<{ mapping_json: unknown }>(
      'SELECT mapping_json FROM monday_column_mappings WHERE board_id = $1 LIMIT 1',
      [boardId],
    );
    return result.rows[0]?.mapping_json ?? null;
  } catch (error) {
    logger?.warn?.('Failed to read monday column mapping', error);
    return null;
  }
};

export const upsertMondayCallSnapshot = async (
  input: MondayCallSnapshotInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const pool = getDb();
  if (!pool) return;

  try {
    await pool.query(
      `
      INSERT INTO monday_call_snapshots (
        board_id,
        item_id,
        item_name,
        updated_at,
        call_date,
        setter,
        stage,
        disposition,
        is_booked,
        contact_key,
        raw,
        synced_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,CURRENT_TIMESTAMP)
      ON CONFLICT (board_id, item_id)
      DO UPDATE SET
        item_name = EXCLUDED.item_name,
        updated_at = EXCLUDED.updated_at,
        call_date = EXCLUDED.call_date,
        setter = EXCLUDED.setter,
        stage = EXCLUDED.stage,
        disposition = EXCLUDED.disposition,
        is_booked = EXCLUDED.is_booked,
        contact_key = EXCLUDED.contact_key,
        raw = EXCLUDED.raw,
        synced_at = CURRENT_TIMESTAMP
      `,
      [
        input.boardId,
        input.itemId,
        input.itemName ?? null,
        input.updatedAt,
        input.callDate ?? null,
        input.setter ?? null,
        input.stage ?? null,
        input.disposition ?? null,
        input.isBooked === true,
        input.contactKey ?? null,
        JSON.stringify(input.raw ?? null),
      ],
    );
  } catch (error) {
    logger?.warn?.('Failed to upsert monday call snapshot', error);
  }
};

export const upsertMondayCallColumnValues = async (
  input: MondayCallColumnValuesUpsertInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const pool = getDb();
  if (!pool) return;
  if (!input.values.length) return;

  const payload = input.values.map((value) => ({
    column_id: value.columnId,
    column_title: value.columnTitle ?? null,
    column_type: value.columnType ?? null,
    text_value: value.textValue ?? null,
    value_json: value.valueJson ?? null,
  }));

  try {
    await pool.query('BEGIN');
    await pool.query(
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
      [JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt],
    );

    await pool.query(
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
      [JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt],
    );

    await pool.query('COMMIT');
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // no-op
    }
    logger?.warn?.('Failed to upsert monday call column values', error);
  }
};

export const upsertNormalizedMondayLeadRecords = async (
  input: MondayNormalizedLeadInput,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const pool = getDb();
  if (!pool) return;

  const outcomeLabel = findTextBySignals(input.columns, ['outcome', 'result', 'disposition', 'status']) || input.stage || null;
  const outcomeReason = findTextBySignals(input.columns, ['reason', 'lost reason', 'disqual', 'close reason', 'notes']);
  const source = findTextBySignals(input.columns, ['lead source', 'source', 'channel', 'utm']);
  const setBy = findTextBySignals(input.columns, ['set by', 'booked by', 'setter']);
  const setter = normalizeText(input.setter) || setBy;
  const stage = normalizeText(input.stage);
  const campaign = findTextBySignals(input.columns, ['campaign', 'offer', 'adset', 'ad set', 'funnel']);
  const sequence = findTextBySignals(input.columns, ['sequence', 'cadence']);
  const leadStatus = findTextBySignals(input.columns, ['lead status', 'status']) || stage;

  const firstTouchDate =
    parseDateFromColumn(findColumnBySignals(input.columns, ['first touch', 'created date', 'lead date', 'inbound date'])) || null;
  const callDate =
    normalizeText(input.callDate) ||
    parseDateFromColumn(findColumnBySignals(input.columns, ['call date', 'appointment date', 'meeting date'])) ||
    null;
  const closedDate = parseDateFromColumn(findColumnBySignals(input.columns, ['closed date', 'won date', 'lost date', 'decision date']));

  const outcomeCategory = classifyOutcomeCategory(stage, outcomeLabel, outcomeReason, input.disposition, input.isBooked === true);
  const activityDate = callDate || closedDate || firstTouchDate || input.itemUpdatedAt.toISOString().slice(0, 10);

  try {
    await pool.query('BEGIN');

    await pool.query(
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
      [
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
        JSON.stringify(input.raw ?? null),
      ],
    );

    await pool.query(
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
      [
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
        JSON.stringify(input.raw ?? null),
      ],
    );

    await pool.query(
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
      [
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
        JSON.stringify(input.raw ?? null),
      ],
    );

    await pool.query('COMMIT');
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // no-op
    }
    logger?.warn?.('Failed to upsert normalized monday lead records', error);
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
  const pool = getDb();
  if (!pool) return [];

  const values: Array<string | Date> = [params.from, params.to];
  let where = 'WHERE updated_at >= $1::timestamptz AND updated_at <= $2::timestamptz';
  if (params.boardId) {
    values.push(params.boardId);
    where += ` AND board_id = $${values.length}`;
  }

  try {
    const result = await pool.query<MondayCallSnapshotRow>(
      `
      SELECT
        board_id,
        item_id,
        item_name,
        updated_at,
        call_date,
        setter,
        stage,
        disposition,
        is_booked,
        contact_key,
        raw,
        synced_at
      FROM monday_call_snapshots
      ${where}
      ORDER BY updated_at DESC
      `,
      values,
    );
    return result.rows;
  } catch (error) {
    logger?.warn?.('Failed to list monday call snapshots', error);
    return [];
  }
};

export const getLatestMondaySyncStatus = async (
  boardId?: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondaySyncStateRow | null> => {
  const pool = getDb();
  if (!pool) return null;

  const values: string[] = [];
  let where = '';
  if (boardId) {
    values.push(boardId);
    where = `WHERE board_id = $${values.length}`;
  }

  try {
    const result = await pool.query<MondaySyncStateRow>(
      `
      SELECT *
      FROM monday_sync_state
      ${where}
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      values,
    );
    return result.rows[0] || null;
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
  const pool = getDb();
  if (!pool) return;

  try {
    await pool.query(
      `
      INSERT INTO monday_weekly_reports (week_start, source_board_id, summary_json, monday_item_id, synced_at)
      VALUES ($1::date, $2, $3::jsonb, $4, $5)
      ON CONFLICT (week_start)
      DO UPDATE SET
        source_board_id = EXCLUDED.source_board_id,
        summary_json = EXCLUDED.summary_json,
        monday_item_id = EXCLUDED.monday_item_id,
        synced_at = EXCLUDED.synced_at
      `,
      [
        params.weekStart,
        params.sourceBoardId ?? null,
        JSON.stringify(params.summaryJson ?? {}),
        params.mondayItemId ?? null,
        params.syncedAt ?? new Date(),
      ],
    );
  } catch (error) {
    logger?.warn?.('Failed to upsert monday weekly report', error);
  }
};

export const getMondayWeeklyReport = async (
  weekStart: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayWeeklyReportRow | null> => {
  const pool = getDb();
  if (!pool) return null;
  try {
    const result = await pool.query<MondayWeeklyReportRow>(
      `
      SELECT week_start::text, source_board_id, summary_json, monday_item_id, synced_at
      FROM monday_weekly_reports
      WHERE week_start = $1::date
      LIMIT 1
      `,
      [weekStart],
    );
    return result.rows[0] || null;
  } catch (error) {
    logger?.warn?.('Failed to read monday weekly report', error);
    return null;
  }
};

export const getMondayBookedCallPush = async (
  params: {
    boardId: string;
    slackChannelId: string;
    slackMessageTs: string;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<MondayBookedCallPushRow | null> => {
  const pool = getDb();
  if (!pool) return null;

  try {
    const result = await pool.query<MondayBookedCallPushRow>(
      `
      SELECT
        board_id,
        slack_channel_id,
        slack_message_ts,
        setter_bucket,
        monday_item_id,
        status,
        error,
        payload_json,
        pushed_at,
        updated_at
      FROM monday_booked_call_pushes
      WHERE board_id = $1
        AND slack_channel_id = $2
        AND slack_message_ts = $3
      LIMIT 1
      `,
      [params.boardId, params.slackChannelId, params.slackMessageTs],
    );
    return result.rows[0] || null;
  } catch (error) {
    logger?.warn?.('Failed to read monday booked call push state', error);
    return null;
  }
};

export const upsertMondayBookedCallPush = async (
  params: {
    boardId: string;
    slackChannelId: string;
    slackMessageTs: string;
    setterBucket: string;
    status: MondayBookedCallPushStatus;
    mondayItemId?: string | null;
    error?: string | null;
    payloadJson?: unknown;
    pushedAt?: Date | null;
  },
  logger?: Pick<Logger, 'warn'>,
): Promise<void> => {
  const pool = getDb();
  if (!pool) return;

  try {
    await pool.query(
      `
      INSERT INTO monday_booked_call_pushes (
        board_id,
        slack_channel_id,
        slack_message_ts,
        setter_bucket,
        monday_item_id,
        status,
        error,
        payload_json,
        pushed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (board_id, slack_channel_id, slack_message_ts)
      DO UPDATE SET
        setter_bucket = EXCLUDED.setter_bucket,
        monday_item_id = EXCLUDED.monday_item_id,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        payload_json = EXCLUDED.payload_json,
        pushed_at = EXCLUDED.pushed_at,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        params.boardId,
        params.slackChannelId,
        params.slackMessageTs,
        params.setterBucket,
        params.mondayItemId ?? null,
        params.status,
        params.error ?? null,
        JSON.stringify(params.payloadJson ?? null),
        params.pushedAt ?? null,
      ],
    );
  } catch (error) {
    logger?.warn?.('Failed to upsert monday booked call push state', error);
  }
};
