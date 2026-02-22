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

const getDb = () => getPool();

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
