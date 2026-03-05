import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

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
  conversationsWithOpenItems: number;
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
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<{
      open_work_items: string | number | bigint;
      overdue_work_items: string | number | bigint;
      open_needs_reply: string | number | bigint;
      overdue_needs_reply: string | number | bigint;
    }[]>(
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
      params.repId ?? null,
    );

    const row = result[0];
    return {
      windowDays: params.windowDays,
      openWorkItems: Number(row?.open_work_items ?? 0),
      overdueWorkItems: Number(row?.overdue_work_items ?? 0),
      openNeedsReply: Number(row?.open_needs_reply ?? 0),
      overdueNeedsReply: Number(row?.overdue_needs_reply ?? 0),
    };
  } catch (err) {
    logger?.error('getMetricsOverview failed', err);
    throw err;
  }
};

export const getSlaMetrics = async (
  params: { windowDays: number; repId?: string },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SlaMetrics> => {
  const prisma = getPrisma();
  try {
    const repIdParam: string | null = params.repId ? String(params.repId) : null;

    const result = await prisma.$queryRawUnsafe<{
      open_needs_reply: string | number | bigint;
      overdue_needs_reply: string | number | bigint;
      p50_minutes: number | null;
      p75_minutes: number | null;
      p90_minutes: number | null;
      p95_minutes: number | null;
    }[]>(
      `
      WITH _params AS (
        SELECT $1::text AS rep_id, $2::int AS window_days
      ),
      inbound AS (
        SELECT
          e.id,
          e.event_ts,
          e.contact_id,
          e.contact_phone
        FROM sms_events e
        CROSS JOIN _params p
        WHERE e.direction = 'inbound'
          AND e.event_ts >= NOW() - (p.window_days || ' days')::interval
          AND (p.rep_id IS NULL OR p.rep_id = '' OR e.aloware_user = p.rep_id)
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
      open_needs_reply_items AS (
        SELECT wi.*
        FROM work_items wi
        CROSS JOIN _params p
        WHERE wi.resolved_at IS NULL
          AND wi.type = 'needs_reply'
          AND (p.rep_id IS NULL OR wi.rep_id = p.rep_id)
      )
      SELECT
        (SELECT COUNT(*) FROM open_needs_reply_items) AS open_needs_reply,
        (SELECT COUNT(*) FROM open_needs_reply_items WHERE due_at IS NOT NULL AND due_at < NOW()) AS overdue_needs_reply,
        (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p50_minutes,
        (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p75_minutes,
        (SELECT percentile_cont(0.90) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p90_minutes,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY minutes) FROM response_times) AS p95_minutes
      ;
      `,
      repIdParam,
      params.windowDays,
    );

    const row = result[0];
    const openNeedsReply = Number(row?.open_needs_reply ?? 0);
    const overdueNeedsReply = Number(row?.overdue_needs_reply ?? 0);
    const breachRate = openNeedsReply > 0 ? overdueNeedsReply / openNeedsReply : 0;

    const bucketResult = await prisma.$queryRawUnsafe<{ bucket: string; count: string | number | bigint }[]>(
      `
      WITH _params AS (
        SELECT $1::text AS rep_id, $2::int AS window_days
      ),
      inbound AS (
        SELECT
          e.id,
          e.event_ts,
          e.contact_id,
          e.contact_phone
        FROM sms_events e
        CROSS JOIN _params p
        WHERE e.direction = 'inbound'
          AND e.event_ts >= NOW() - (p.window_days || ' days')::interval
          AND (p.rep_id IS NULL OR p.rep_id = '' OR e.aloware_user = p.rep_id)
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
      repIdParam,
      params.windowDays,
    );

    const buckets: ResponseTimeBucket[] = [
      { bucket: '0-5', count: 0 },
      { bucket: '5-15', count: 0 },
      { bucket: '15-60', count: 0 },
      { bucket: '60-180', count: 0 },
      { bucket: '180+', count: 0 },
    ];

    for (const r of bucketResult) {
      const b = buckets.find((b) => b.bucket === r.bucket);
      if (b) b.count = Number(r.count);
    }

    return {
      windowDays: params.windowDays,
      openNeedsReply,
      overdueNeedsReply,
      breachRate,
      p50Minutes: row?.p50_minutes ?? null,
      p75Minutes: row?.p75_minutes ?? null,
      p90Minutes: row?.p90_minutes ?? null,
      p95Minutes: row?.p95_minutes ?? null,
      buckets,
    };
  } catch (err) {
    logger?.error('getSlaMetrics failed', err);
    throw err;
  }
};

export const getWorkloadByRepMetrics = async (
  params: { windowDays: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<WorkloadByRepMetrics> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<{
      rep_id: string | null;
      conversations_with_open_items: string | number | bigint;
      open_work_items: string | number | bigint;
      overdue_work_items: string | number | bigint;
      open_needs_reply: string | number | bigint;
      overdue_needs_reply: string | number | bigint;
      high_severity_open: string | number | bigint;
    }[]>(
      `
      WITH open_items AS (
        SELECT wi.*
        FROM work_items wi
        WHERE wi.resolved_at IS NULL
      )
      SELECT
        rep_id,
        COUNT(DISTINCT conversation_id) AS conversations_with_open_items,
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
      rows: result.map((r) => ({
        repId: r.rep_id,
        conversationsWithOpenItems: Number(r.conversations_with_open_items),
        openWorkItems: Number(r.open_work_items),
        overdueWorkItems: Number(r.overdue_work_items),
        openNeedsReply: Number(r.open_needs_reply),
        overdueNeedsReply: Number(r.overdue_needs_reply),
        highSeverityOpen: Number(r.high_severity_open),
      })),
    };
  } catch (err) {
    logger?.error('getWorkloadByRepMetrics failed', err);
    throw err;
  }
};

export const getVolumeByDayMetrics = async (
  params: { windowDays: number },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<VolumeByDayMetrics> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<{
      day: string;
      inbound: string | number | bigint;
      outbound: string | number | bigint;
    }[]>(
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
        COALESCE(c.inbound, 0) AS inbound,
        COALESCE(c.outbound, 0) AS outbound
      FROM days d
      LEFT JOIN counts c ON c.day = d.day
      ORDER BY d.day ASC
      ;
      `,
      params.windowDays,
    );

    return {
      windowDays: params.windowDays,
      rows: result.map((r) => ({
        day: r.day,
        inbound: Number(r.inbound),
        outbound: Number(r.outbound),
      })),
    };
  } catch (err) {
    logger?.error('getVolumeByDayMetrics failed', err);
    throw err;
  }
};
