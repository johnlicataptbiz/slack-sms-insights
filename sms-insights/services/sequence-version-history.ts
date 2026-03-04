import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';
import { parseLeadMagnetAndVersion } from './scoreboard.js';

export type SequenceVersionHistoryRow = {
  label: string;
  leadMagnet: string;
  version: string;
  canonicalBody: string | null;
  sampleBodies: string[];
  sentCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type SequenceBodyAggregate = {
  label: string;
  body: string;
  sent_count: number;
  first_seen_at: string;
  last_seen_at: string;
};

/**
 * Build canonical sequence body history from real outbound sms_events.
 * Canonical body per label = highest send count (ties => most recent).
 */
export const getSequenceVersionHistory = async (
  options?: { lookbackDays?: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SequenceVersionHistoryRow[]> => {
  const lookbackDays = Number.isFinite(options?.lookbackDays)
    ? Math.min(Math.max(Math.trunc(options?.lookbackDays ?? 365), 7), 3650)
    : 365;
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query<SequenceBodyAggregate>(
      `
      WITH normalized AS (
        SELECT
          TRIM(sequence) AS label,
          REGEXP_REPLACE(TRIM(body), 's+', ' ', 'g') AS body,
          event_ts
        FROM sms_events
        WHERE direction = 'outbound'
          AND sequence IS NOT NULL
          AND TRIM(sequence) != ''
          AND body IS NOT NULL
          AND TRIM(body) != ''
          AND event_ts >= NOW() - ($1::int * INTERVAL '1 day')
      )
      SELECT
        label,
        body,
        COUNT(*)::int AS sent_count,
        MIN(event_ts)::text AS first_seen_at,
        MAX(event_ts)::text AS last_seen_at
      FROM normalized
      GROUP BY label, body
      ORDER BY label ASC, sent_count DESC, MAX(event_ts) DESC
      `,
      [lookbackDays],
    );

    const byLabel = new Map<string, SequenceVersionHistoryRow>();
    for (const row of result.rows) {
      const parsed = parseLeadMagnetAndVersion(row.label);
      const existing = byLabel.get(row.label);
      if (!existing) {
        byLabel.set(row.label, {
          label: row.label,
          leadMagnet: parsed.leadMagnet,
          version: parsed.version,
          canonicalBody: row.body,
          sampleBodies: [row.body],
          sentCount: row.sent_count,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
        });
        continue;
      }

      if (existing.sampleBodies.length < 3) {
        existing.sampleBodies.push(row.body);
      }
      existing.sentCount += row.sent_count;
      if (existing.firstSeenAt && row.first_seen_at < existing.firstSeenAt) {
        existing.firstSeenAt = row.first_seen_at;
      }
      if (existing.lastSeenAt && row.last_seen_at > existing.lastSeenAt) {
        existing.lastSeenAt = row.last_seen_at;
      }
    }

    return [...byLabel.values()].sort((a, b) => {
      if (a.leadMagnet !== b.leadMagnet) return a.leadMagnet.localeCompare(b.leadMagnet);
      if (a.version !== b.version) return a.version.localeCompare(b.version);
      return a.label.localeCompare(b.label);
    });
  } catch (error) {
    logger?.error?.('getSequenceVersionHistory failed', error);
    throw error;
  } finally {
    client.release();
  }
};
