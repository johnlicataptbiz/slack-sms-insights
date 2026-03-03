import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

export type SequenceVersionStatus = 'active' | 'testing' | 'rewrite' | 'archived';

export type SequenceVersionDecisionRow = {
  sequence_label: string;
  status: SequenceVersionStatus;
  updated_by: string | null;
  updated_at: string;
};

const VALID_STATUSES: SequenceVersionStatus[] = ['active', 'testing', 'rewrite', 'archived'];

export const isSequenceVersionStatus = (value: string): value is SequenceVersionStatus => {
  return VALID_STATUSES.includes(value as SequenceVersionStatus);
};

export const listSequenceVersionDecisions = async (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SequenceVersionDecisionRow[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query<SequenceVersionDecisionRow>(
      `
      SELECT sequence_label, status, updated_by, updated_at::text
      FROM sequence_version_decisions
      ORDER BY updated_at DESC
      `,
    );
    return result.rows;
  } catch (error) {
    logger?.error?.('listSequenceVersionDecisions failed', error);
    throw error;
  } finally {
    client.release();
  }
};

export const upsertSequenceVersionDecision = async (
  sequenceLabel: string,
  status: SequenceVersionStatus,
  updatedBy: string | null,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SequenceVersionDecisionRow> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query<SequenceVersionDecisionRow>(
      `
      INSERT INTO sequence_version_decisions (sequence_label, status, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (sequence_label)
      DO UPDATE SET
        status = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING sequence_label, status, updated_by, updated_at::text
      `,
      [sequenceLabel, status, updatedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert sequence version decision');
    return row;
  } catch (error) {
    logger?.error?.('upsertSequenceVersionDecision failed', error);
    throw error;
  } finally {
    client.release();
  }
};
