import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';
import { publishRealtimeEvent } from './realtime.js';

export type WorkItemListRow = {
  id: string;
  type: string;
  severity: 'low' | 'med' | 'high';
  due_at: string;
  created_at: string;
  resolved_at: string | null;
  rep_id: string | null;

  conversation_id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export type WorkItemCursor = {
  dueAt: string;
  id: string;
};

export type ListOpenWorkItemsParams = {
  type?: string;
  repId?: string;
  severity?: 'low' | 'med' | 'high';
  overdueOnly?: boolean;
  dueBefore?: string; // ISO timestamp
  limit: number;
  offset?: number; // legacy
  cursor?: WorkItemCursor; // new
};

export type ListOpenWorkItemsResult = {
  items: WorkItemListRow[];
  nextCursor: WorkItemCursor | null;
};

const encodeCursor = (cursor: WorkItemCursor): string => {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
};

const decodeCursor = (cursor: string): WorkItemCursor => {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = JSON.parse(raw) as { dueAt?: unknown; id?: unknown };
  if (typeof parsed?.dueAt !== 'string' || typeof parsed?.id !== 'string') {
    throw new Error('Invalid cursor');
  }
  return { dueAt: parsed.dueAt, id: parsed.id };
};

export const listOpenWorkItems = async (
  params: ListOpenWorkItemsParams,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ListOpenWorkItemsResult> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const where: string[] = ['wi.resolved_at IS NULL'];
    const values: Array<string | number | boolean | null> = [];
    let i = 1;

    if (params.type) {
      where.push(`wi.type = $${i++}`);
      values.push(params.type);
    }
    if (params.repId) {
      where.push(`wi.rep_id = $${i++}`);
      values.push(params.repId);
    }
    if (params.severity) {
      where.push(`wi.severity = $${i++}`);
      values.push(params.severity);
    }
    if (params.overdueOnly) {
      where.push('wi.due_at < NOW()');
    }
    if (params.dueBefore) {
      where.push(`wi.due_at < $${i++}`);
      values.push(params.dueBefore);
    }

    // Cursor pagination (preferred): stable ordering by (due_at, id)
    if (params.cursor) {
      // Note: this assumes we are ordering by due_at ASC.
      // If we want to paginate forward, we look for items > cursor.
      // Since due_at can be null, we need to handle that if we allow null due_at in sorting.
      // For now assuming due_at is not null for open items we care about ordering.
      where.push(`(wi.due_at, wi.id) > ($${i++}::timestamptz, $${i++}::uuid)`);
      values.push(params.cursor.dueAt, params.cursor.id);
    }

    const limit = Math.max(1, Math.min(params.limit, 200));
    // Fetch limit + 1 to know if there is a next page
    const fetchLimit = limit + 1;

    // Legacy offset pagination (fallback)
    let offsetSql = '';
    if (typeof params.offset === 'number' && !params.cursor) {
      values.push(Math.max(0, params.offset));
      const offsetParam = `$${i++}`;
      offsetSql = ` OFFSET ${offsetParam}`;
    }

    // Add limit param
    values.push(fetchLimit);
    const limitParam = `$${i++}`;

    const sql = `
      SELECT
        wi.id,
        wi.type,
        wi.severity,
        wi.due_at,
        wi.created_at,
        wi.resolved_at,
        wi.rep_id,
        c.id as conversation_id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        c.last_inbound_at,
        c.last_outbound_at,
        c.last_touch_at,
        c.unreplied_inbound_count
      FROM work_items wi
      JOIN conversations c ON c.id = wi.conversation_id
      WHERE ${where.join(' AND ')}
      ORDER BY wi.due_at ASC, wi.id ASC
      LIMIT ${limitParam}${offsetSql};
    `;

    const result = await client.query<WorkItemListRow>(sql, values);
    const rows = result.rows;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const last = items.at(-1);
    const nextCursor: WorkItemCursor | null = hasMore && last ? { dueAt: last.due_at, id: last.id } : null;

    return { items, nextCursor };
  } catch (err) {
    logger?.error('listOpenWorkItems failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const resolveWorkItem = async (
  id: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<boolean> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      UPDATE work_items
      SET resolved_at = NOW()
      WHERE id = $1 AND resolved_at IS NULL
      RETURNING id, conversation_id, type
      `,
      [id],
    );

    if (result.rowCount && result.rowCount > 0) {
      const row = result.rows[0];
      publishRealtimeEvent({
        type: 'work-item-updated',
        payload: { id: row.id, status: 'resolved', resolvedAt: new Date().toISOString() },
      });
      return true;
    }
    return false;
  } catch (err) {
    logger?.error('resolveWorkItem failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const assignWorkItem = async (
  id: string,
  repId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<boolean> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      UPDATE work_items
      SET rep_id = $2
      WHERE id = $1
      RETURNING id, rep_id
      `,
      [id, repId],
    );

    if (result.rowCount && result.rowCount > 0) {
      const row = result.rows[0];
      publishRealtimeEvent({
        type: 'work-item-updated',
        payload: { id: row.id, repId: row.rep_id },
      });
      return true;
    }
    return false;
  } catch (err) {
    logger?.error('assignWorkItem failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const encodeWorkItemCursor = (cursor: WorkItemCursor): string => encodeCursor(cursor);
export const decodeWorkItemCursor = (cursor: string): WorkItemCursor => decodeCursor(cursor);
