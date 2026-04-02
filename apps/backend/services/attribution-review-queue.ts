import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export type AttributionReviewQueueItem = {
  id: string;
  booked_call_id: string;
  priority: number;
  issue_type: string | null;
  issue_summary: string | null;
  candidate_sequences: unknown;
  status: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type UnresolvedAttributionRow = {
  booked_call_id: string;
  booked_event_ts: Date;
  attribution_status: string | null;
  needs_review: boolean | null;
  review_reason: string | null;
  mapper_version: string | null;
  conversation_id: string | null;
  resolved_sequence_id: string | null;
  resolved_sequence_label: string | null;
  created_at: Date | null;
};

export type SequenceFunnelRow = {
  day: Date;
  sequence_id: string;
  rep_id: string;
  new_leads_contacted: number;
  leads_replied: number;
  qualified_leads: number;
  booked_calls: number;
  opt_outs: number;
};

export type AttributionMethodDailyRow = {
  day: Date;
  matched_calls: number;
  manual_direct_calls: number;
  unattributed_calls: number;
  sms_phone_match_calls: number;
  fuzzy_match_calls: number;
  reply_linked_calls: number;
};

export type RepResponseDailyRow = {
  day: Date;
  rep_id: string;
  new_leads_contacted: number;
  leads_replied: number;
  booked_calls: number;
  median_reply_time_minutes: number | null;
  median_book_time_days: number | null;
};

export const listOpenAttributionReviewItems = async (take = 50): Promise<AttributionReviewQueueItem[]> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        id,
        booked_call_id,
        priority,
        issue_type,
        issue_summary,
        candidate_sequences,
        status,
        resolved_by,
        resolved_at,
        created_at,
        updated_at
      FROM attribution_review_queue
      WHERE status IN ('open','pending','needs_review')
      ORDER BY priority DESC, created_at DESC
      LIMIT $1
    `,
    take,
  )) as AttributionReviewQueueItem[];
  return rows;
};

export const upsertAttributionReviewItem = async (input: {
  booked_call_id: string;
  priority: number;
  issue_type: string;
  issue_summary: string;
  candidate_sequences: unknown;
  status?: string;
  resolved_by?: string | null;
  resolved_at?: Date | null;
}): Promise<AttributionReviewQueueItem> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO attribution_review_queue (
        booked_call_id,
        priority,
        issue_type,
        issue_summary,
        candidate_sequences,
        status,
        resolved_by,
        resolved_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
      ON CONFLICT (booked_call_id)
      DO UPDATE SET
        priority = EXCLUDED.priority,
        issue_type = EXCLUDED.issue_type,
        issue_summary = EXCLUDED.issue_summary,
        candidate_sequences = EXCLUDED.candidate_sequences,
        status = EXCLUDED.status,
        resolved_by = EXCLUDED.resolved_by,
        resolved_at = EXCLUDED.resolved_at,
        updated_at = NOW()
      RETURNING
        id,
        booked_call_id,
        priority,
        issue_type,
        issue_summary,
        candidate_sequences,
        status,
        resolved_by,
        resolved_at,
        created_at,
        updated_at
    `,
    input.booked_call_id,
    input.priority,
    input.issue_type,
    input.issue_summary,
    JSON.stringify(input.candidate_sequences ?? null),
    input.status || 'open',
    input.resolved_by ?? null,
    input.resolved_at ?? null,
  )) as AttributionReviewQueueItem[];
  if (!rows[0]) throw new Error('Failed to upsert attribution review item');
  return rows[0];
};

export const listUnresolvedAttributions = async (take = 100): Promise<UnresolvedAttributionRow[]> => {
  const prisma = getPrisma();
  return prisma.$queryRawUnsafe<UnresolvedAttributionRow[]>(
    `SELECT
      booked_call_id,
      booked_event_ts,
      attribution_status,
      needs_review,
      review_reason,
      mapper_version,
      conversation_id,
      resolved_sequence_id,
      resolved_sequence_label,
      created_at
    FROM booked_call_attribution
    WHERE COALESCE(needs_review, false) = true OR attribution_status IS NULL
    ORDER BY booked_event_ts DESC
    LIMIT $1`,
    take,
  );
};

export const listSequenceFunnelDaily = async (params: {
  from: Date;
  to: Date;
  sequenceId?: string | null;
}): Promise<SequenceFunnelRow[]> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        day,
        sequence_id,
        rep_id,
        new_leads_contacted,
        leads_replied,
        qualified_leads,
        booked_calls,
        opt_outs
      FROM fact_sequence_funnel_daily
      WHERE day >= $1 AND day <= $2
        AND ($3::text IS NULL OR sequence_id = $3)
      ORDER BY day ASC, sequence_id ASC, rep_id ASC
    `,
    params.from,
    params.to,
    params.sequenceId ?? null,
  )) as SequenceFunnelRow[];
  return rows;
};

export const listAttributionMethodDaily = async (params: {
  from: Date;
  to: Date;
}): Promise<AttributionMethodDailyRow[]> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        day,
        matched_calls,
        manual_direct_calls,
        unattributed_calls,
        sms_phone_match_calls,
        fuzzy_match_calls,
        reply_linked_calls
      FROM fact_attribution_method_daily
      WHERE day >= $1 AND day <= $2
      ORDER BY day ASC
    `,
    params.from,
    params.to,
  )) as AttributionMethodDailyRow[];
  return rows;
};

export const listRepResponseDaily = async (params: { from: Date; to: Date }): Promise<RepResponseDailyRow[]> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        day,
        rep_id,
        new_leads_contacted,
        leads_replied,
        booked_calls,
        median_reply_time_minutes,
        median_book_time_days
      FROM fact_rep_response_daily
      WHERE day >= $1 AND day <= $2
      ORDER BY day ASC, rep_id ASC
    `,
    params.from,
    params.to,
  )) as Array<
    Omit<RepResponseDailyRow, 'median_reply_time_minutes' | 'median_book_time_days'> & {
      median_reply_time_minutes: { toNumber?: () => number } | number | null;
      median_book_time_days: { toNumber?: () => number } | number | null;
    }
  >;
  return rows.map((row) => ({
    ...row,
    median_reply_time_minutes:
      typeof row.median_reply_time_minutes === 'number'
        ? row.median_reply_time_minutes
        : row.median_reply_time_minutes?.toNumber?.() ?? null,
    median_book_time_days:
      typeof row.median_book_time_days === 'number' ? row.median_book_time_days : row.median_book_time_days?.toNumber?.() ?? null,
  }));
};
