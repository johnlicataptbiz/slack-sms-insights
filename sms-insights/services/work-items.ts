import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

export type WorkItemListRow = {
  id: string;
  type: string;
  severity: 'low' | 'med' | 'high';
  due_at: string;
  created_at: string;
  resolved_at: string | null;

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

export const listOpenWorkItems = async (
  params: { type?: string; repId?: string; limit: number; offset: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<WorkItemListRow[]> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const where: string[] = ['wi.resolved_at IS NULL'];
    const values: any[] = [];
    let i = 1;

    if (params.type) {
      where.push(`wi.type = $${i++}`);
      values.push(params.type);
    }
    if (params.repId) {
      where.push(`wi.rep_id = $${i++}`);
      values.push(params.repId);
    }

    values.push(params.limit);
    const limitParam = `$${i++}`;
    values.push(params.offset);
    const offsetParam = `$${i++}`;

    const sql = `
      SELECT
        wi.id,
        wi.type,
        wi.severity,
        wi.due_at,
        wi.created_at,
        wi.resolved_at,
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
      ORDER BY wi.due_at ASC
      LIMIT ${limitParam}
      OFFSET ${offsetParam};
    `;

    const result = await client.query<WorkItemListRow>(sql, values);
    return result.rows;
  } catch (err) {
    logger?.error('listOpenWorkItems failed', err);
    throw err;
  } finally {
    client.release();
  }
};
