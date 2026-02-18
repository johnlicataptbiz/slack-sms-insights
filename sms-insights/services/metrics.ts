import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export type MetricsOverview = {
  windowDays: number;
  openWorkItems: number;
  overdueWorkItems: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
};

export type ResponseTimeBucket = {
  bucket: '0-5' | '5-15' | '15-60' | '60-180' | '180+';
  count: number;
};

export type SlaMetrics = {
  windowDays: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
  breachRate: number; // overdue / open (0..1)
  p50Minutes: number | null;
  p75Minutes: number | null;
  p90Minutes: number | null;
  p95Minutes: number | null;
  buckets: ResponseTimeBucket[];
};

export type WorkloadByRepRow = {
  repId: string | null;
  openWorkItems: number;
  overdueWorkItems: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
  highSeverityOpen: number;
};

export type WorkloadByRepMetrics = {
  windowDays: number;
  rows: WorkloadByRepRow[];
};

export type VolumeByDayRow = {
  day: string; // YYYY-MM-DD
  inbound: number;
  outbound: number;
};

export type VolumeByDayMetrics = {
  windowDays: number;
  rows: VolumeByDayRow[];
};

export const getMetricsOverview = async (
  params: { windowDays: number; repId?: string },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<MetricsOverview> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<{
      open_work_items: string;
      overdue_work_items: string;
      open_needs_reply: string;
      overdue_needs_reply: string;
    }>(
      `
      WITH open_items AS (
        SELECT wi.*
        FROM work_items wi
        WHERE wi.resolved_at IS NULL
          AND ($1::text IS NULL OR wi.rep_id = $1::text)
      )
      SELECT
        (SELECT COUNT(*) FROM open_items) AS open_work_items,
        (SELECT COUNT(*) FROM open_items WHERE due_at IS NOT NULL AND due_at < NOW()) AS overdue_work_items,
        (SELECT COUNT(*) FROM open_items WHERE type = 'needs_reply') AS open_needs_reply,
        (SELECT COUNT(*) FROM open_items WHERE type = 'needs_reply' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue_needs_reply
      ;
      `,
      [params.repId ?? null],
    );

    const row = result.rows[0];
    return {
      windowDays: params.windowDays,
      openWorkItems: Number.parseInt(row?.open_work_items ?? '0', 10),
      overdueWorkItems: Number.parseInt(row?.overdue_work_items ?? '0', 10),
      openNeedsReply: Number.parseInt(row?.open_needs_reply ?? '0', 10),
      overdueNeedsReply: Number.parseInt(row?.overdue_needs_reply ?? '0', 10),
    };
  } catch (err) {
    logger?.error('getMetricsOverview failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getSlaMetrics = async (
  params: { windowDays: number; repId?: string },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SlaMetrics> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    // Approximate response time:
    // For each inbound event in window, find the first outbound event after it for the same contact_id/phone.
    // This is a v1 approximation until sms_events has conversation_id and we can do exact pairing.
    const result = await client.query<{
      open_needs_reply: string;
      overdue_needs_reply: string;
      p50_minutes: number | null;
      p75_minutes: number | null;
      p90_minutes: number | null;
      p95_minutes: number | null;
    }>(
      `
      WITH inbound AS (
        SELECT
          e.id,
          e.event_ts,
          e.contact_id,
          e.contact_phone
        FROM sms_events e
        WHERE e.direction = 'inbound'
          AND e.event_ts >= NOW() - ($2::int || ' days')::interval
      ),
      response_times AS (
        SELECT
          EXTRACT(EPOCH FROM (o.event_ts - i.event_ts)) / 60.0 AS minutes
        FROM inbound i
        JOIN LATERAL (
          SELECT e2.event_ts
          FROM sms_events e2
          WHERE e2.direction = 'outbound'
            AND e2.event_ts > i.event_ts
            AND (
              (i.contact_id IS NOT NULL AND e2.contact_id = i.contact_id)
              OR (i.contact_id IS NULL AND i.contact_phone IS NOT NULL AND e2.contact_phone = i.contact_phone)
            )
          ORDER BY e2.event_ts ASC
          LIMIT 1
        ) o ON TRUE
      ),
      open_needs_reply AS (
        SELECT wi.*
        FROM work_items wi
        WHERE wi.resolved_at IS NULL
          AND wi.type = 'needs_reply'
          AND ($1::text IS NULL OR wi.rep_id = $1::text)
      )
      SELECT
        (SELECT COUNT(*) FROM open_needs_reply) AS open_needs_reply,
        (SELECT COUNT(*) FROM open_needs_reply WHERE due_at IS NOT NULL AND due_at < NOW()) AS overdue_needs_reply,
        (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p50_minutes,
        (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p75_minutes,
        (SELECT percentile_cont(0.90) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p90_minutes,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p95_minutes
      ;
      `,
      [params.repId ?? null, params.windowDays],
    );

    const row = result.rows[0];
    const openNeedsReply = Number.parseInt(row?.open_needs_reply ?? '0', 10);
    const overdueNeedsReply = Number.parseInt(row?.overdue_needs_reply ?? '0', 10);
    const breachRate = openNeedsReply > 0 ? overdueNeedsReply / openNeedsReply : 0;

    // Calculate buckets from response_times
    const bucketResult = await client.query<{ bucket: string; count: string }>(
      `
      WITH inbound AS (
        SELECT
          e.id,
          e.event_ts,
          e.contact_id,
          e.contact_phone
        FROM sms_events e
        WHERE e.direction = 'inbound'
          AND e.event_ts >= NOW() - ($2::int || ' days')::interval
      ),
      response_times AS (
        SELECT
          EXTRACT(EPOCH FROM (o.event_ts - i.event_ts)) / 60.0 AS minutes
        FROM inbound i
        JOIN LATERAL (
          SELECT e2.event_ts
          FROM sms_events e2
          WHERE e2.direction = 'outbound'
            AND e2.event_ts > i.event_ts
            AND (
              (i.contact_id IS NOT NULL AND e2.contact_id = i.contact_id)
              OR (i.contact_id IS NULL AND i.contact_phone IS NOT NULL AND e2.contact_phone = i.contact_phone)
            )
          ORDER BY e2.event_ts ASC
          LIMIT 1
        ) o ON TRUE
      )
      SELECT
        CASE
          WHEN minutes <= 5 THEN '0-5'
          WHEN minutes <= 15 THEN '5-15'
          WHEN minutes <= 60 THEN '15-60'
          WHEN minutes <= 180 THEN '60-180'
          ELSE '180+'
        END AS bucket,
        COUNT(*) AS count
      FROM response_times
      GROUP BY 1;
      `,
      [params.repId ?? null, params.windowDays],
    );

    const buckets: ResponseTimeBucket[] = [
      { bucket: '0-5', count: 0 },
      { bucket: '5-15', count: 0 },
      { bucket: '15-60', count: 0 },
      { bucket: '60-180', count: 0 },
      { bucket: '180+', count: 0 },
    ];

    for (const r of bucketResult.rows) {
      const b = buckets.find((b) => b.bucket === r.bucket);
      if (b) b.count = Number.parseInt(r.count, 10);
    }

    return {
      windowDays: params.windowDays,
      openNeedsReply,
      overdueNeedsReply,
      breachRate,
      p50Minutes: row?.p50_minutes ? Number.parseFloat(row.p50_minutes as any) : null,
      p75Minutes: row?.p75_minutes ? Number.parseFloat(row.p75_minutes as any) : null,
      p90Minutes: row?.p90_minutes ? Number.parseFloat(row.p90_minutes as any) : null,
      p95Minutes: row?.p95_minutes ? Number.parseFloat(row.p95_minutes as any) : null,
      buckets,
    };
  } catch (err) {
    logger?.error('getSlaMetrics failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getWorkloadByRepMetrics = async (
  params: { windowDays: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<WorkloadByRepMetrics> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<{
      rep_id: string | null;
      open_work_items: string;
      overdue_work_items: string;
      open_needs_reply: string;
      overdue_needs_reply: string;
      high_severity_open: string;
    }>(
      `
      WITH open_items AS (
        SELECT wi.*
        FROM work_items wi
        WHERE wi.resolved_at IS NULL
      )
      SELECT
        rep_id,
        COUNT(*) AS open_work_items,
        COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW()) AS overdue_work_items,
        COUNT(*) FILTER (WHERE type = 'needs_reply') AS open_needs_reply,
        COUNT(*) FILTER (WHERE type = 'needs_reply' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue_needs_reply,
        COUNT(*) FILTER (WHERE severity = 'high') AS high_severity_open
      FROM open_items
      GROUP BY rep_id
      ORDER BY
        COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW()) DESC,
        COUNT(*) DESC,
        rep_id NULLS LAST
      ;
      `,
    );

    return {
      windowDays: params.windowDays,
      rows: result.rows.map((r) => ({
        repId: r.rep_id,
        openWorkItems: Number.parseInt(r.open_work_items ?? '0', 10),
        overdueWorkItems: Number.parseInt(r.overdue_work_items ?? '0', 10),
        openNeedsReply: Number.parseInt(r.open_needs_reply ?? '0', 10),
        overdueNeedsReply: Number.parseInt(r.overdue_needs_reply ?? '0', 10),
        highSeverityOpen: Number.parseInt(r.high_severity_open ?? '0', 10),
      })),
    };
  } catch (err) {
    logger?.error('getWorkloadByRepMetrics failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getVolumeByDayMetrics = async (
  params: { windowDays: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<VolumeByDayMetrics> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<{
      day: string;
      inbound: string;
      outbound: string;
    }>(
      `
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', NOW() - ($1::int || ' days')::interval),
          date_trunc('day', NOW()),
          interval '1 day'
        )::date AS day
      ),
      counts AS (
        SELECT
          date_trunc('day', event_ts)::date AS day,
          COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
          COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound
        FROM sms_events
        WHERE event_ts >= NOW() - ($1::int || ' days')::interval
        GROUP BY 1
      )
      SELECT
        d.day::text AS day,
        COALESCE(c.inbound, 0)::text AS inbound,
        COALESCE(c.outbound, 0)::text AS outbound
      FROM days d
      LEFT JOIN counts c ON c.day = d.day
      ORDER BY d.day ASC
      ;
      `,
      [params.windowDays],
    );

    return {
      windowDays: params.windowDays,
      rows: result.rows.map((r) => ({
        day: r.day,
        inbound: Number.parseInt(r.inbound ?? '0', 10),
        outbound: Number.parseInt(r.outbound ?? '0', 10),
      })),
    };
  } catch (err) {
    logger?.error('getVolumeByDayMetrics failed', err);
    throw err;
  } finally {
    client.release();
  }
};
