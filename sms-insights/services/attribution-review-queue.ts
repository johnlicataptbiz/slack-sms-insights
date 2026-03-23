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
  return prisma.attribution_review_queue.findMany({
    where: { status: { in: ['open', 'pending', 'needs_review'] } },
    orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
    take,
  });
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
  return prisma.attribution_review_queue.upsert({
    where: { booked_call_id: input.booked_call_id },
    create: {
      booked_call_id: input.booked_call_id,
      priority: input.priority,
      issue_type: input.issue_type,
      issue_summary: input.issue_summary,
      candidate_sequences: input.candidate_sequences as never,
      status: input.status || 'open',
      resolved_by: input.resolved_by ?? null,
      resolved_at: input.resolved_at ?? null,
    },
    update: {
      priority: input.priority,
      issue_type: input.issue_type,
      issue_summary: input.issue_summary,
      candidate_sequences: input.candidate_sequences as never,
      status: input.status || 'open',
      resolved_by: input.resolved_by ?? null,
      resolved_at: input.resolved_at ?? null,
    },
  });
};

export const listUnresolvedAttributions = async (take = 100): Promise<UnresolvedAttributionRow[]> => {
  const prisma = getPrisma();
  // Validate take is a safe integer to prevent SQL injection in LIMIT clause
  if (!Number.isInteger(take) || take <= 0) {
    throw new Error('Invalid take parameter: must be a positive integer');
  }
  return prisma.$queryRaw<UnresolvedAttributionRow[]>`
    SELECT booked_call_id, booked_event_ts, attribution_status, needs_review, review_reason,
           mapper_version, conversation_id, resolved_sequence_id, resolved_sequence_label, created_at
    FROM analytics_unresolved_attribution_v
    ORDER BY booked_event_ts DESC
    LIMIT ${take}
  `;
};

export const listSequenceFunnelDaily = async (params: {
  from: Date;
  to: Date;
  sequenceId?: string | null;
}): Promise<SequenceFunnelRow[]> => {
  const prisma = getPrisma();
  return prisma.fact_sequence_funnel_daily.findMany({
    where: {
      day: { gte: params.from, lte: params.to },
      ...(params.sequenceId ? { sequence_id: params.sequenceId } : {}),
    },
    orderBy: [{ day: 'asc' }, { sequence_id: 'asc' }, { rep_id: 'asc' }],
  });
};

export const listAttributionMethodDaily = async (params: {
  from: Date;
  to: Date;
}): Promise<AttributionMethodDailyRow[]> => {
  const prisma = getPrisma();
  return prisma.fact_attribution_method_daily.findMany({
    where: { day: { gte: params.from, lte: params.to } },
    orderBy: { day: 'asc' },
  });
};

export const listRepResponseDaily = async (params: { from: Date; to: Date }): Promise<RepResponseDailyRow[]> => {
  const prisma = getPrisma();
  const rows = await prisma.fact_rep_response_daily.findMany({
    where: { day: { gte: params.from, lte: params.to } },
    orderBy: [{ day: 'asc' }, { rep_id: 'asc' }],
  });
  return rows.map((row) => ({
    ...row,
    median_reply_time_minutes: row.median_reply_time_minutes?.toNumber?.() ?? null,
    median_book_time_days: row.median_book_time_days?.toNumber?.() ?? null,
  }));
};
