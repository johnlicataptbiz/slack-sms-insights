import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

// ─── Line Performance Analytics ────────────────────────────────────────────────

export type LinePerformanceRow = {
  line: string;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  optOuts: number;
  optOutRatePct: number;
  bookingSignals: number;
  uniqueContacts: number;
};

export type LinePerformanceAnalytics = {
  timeRange: { from: string; to: string };
  lines: LinePerformanceRow[];
  totals: {
    totalLines: number;
    totalMessages: number;
    totalReplies: number;
    overallReplyRate: number;
    totalOptOuts: number;
  };
};

export const getLinePerformanceAnalytics = async (params: {
  from: Date;
  to: Date;
  timeZone?: string;
}): Promise<LinePerformanceAnalytics> => {
  const prisma = getPrisma();

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  const rows = await prisma.$queryRawUnsafe<{
    line: string;
    messages_sent: number | bigint;
    replies_received: number | bigint;
    opt_outs: number | bigint;
    booking_signals: number | bigint;
    unique_contacts: number | bigint;
  }[]>(
    `
    WITH outbound_stats AS (
      SELECT
        COALESCE(NULLIF(TRIM(line), ''), 'Unknown Line') AS line,
        COUNT(*) AS messages_sent,
        COUNT(DISTINCT COALESCE(contact_id, contact_phone)) AS unique_contacts
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts <= $2::timestamptz
      GROUP BY 1
    ),
    inbound_stats AS (
      SELECT
        COALESCE(NULLIF(TRIM(e_out.line), ''), 'Unknown Line') AS line,
        COUNT(DISTINCT e_in.contact_phone) AS replies_received,
        COUNT(DISTINCT CASE
          WHEN LOWER(e_in.body) ~ '(stop|cancel|unsubscribe|remove me|delete me)'
          THEN e_in.contact_phone
        END) AS opt_outs,
        COUNT(DISTINCT CASE
          WHEN LOWER(e_in.body) ~ '(booked|appointment|call scheduled|strategy call)'
          THEN e_in.contact_phone
        END) AS booking_signals
      FROM sms_events e_in
      JOIN sms_events e_out ON e_in.contact_phone = e_out.contact_phone
        AND e_out.direction = 'outbound'
        AND e_out.event_ts < e_in.event_ts
        AND e_in.event_ts - e_out.event_ts < INTERVAL '14 days'
      WHERE e_in.direction = 'inbound'
        AND e_in.event_ts >= $1::timestamptz
        AND e_in.event_ts <= $2::timestamptz
      GROUP BY 1
    )
    SELECT
      o.line,
      o.messages_sent,
      COALESCE(i.replies_received, 0) AS replies_received,
      COALESCE(i.opt_outs, 0) AS opt_outs,
      COALESCE(i.booking_signals, 0) AS booking_signals,
      o.unique_contacts
    FROM outbound_stats o
    LEFT JOIN inbound_stats i ON o.line = i.line
    ORDER BY o.messages_sent DESC
    `,
    fromIso,
    toIso,
  );

  const lines: LinePerformanceRow[] = rows.map((row) => {
    const messagesSent = Number(row.messages_sent);
    const repliesReceived = Number(row.replies_received);
    const optOuts = Number(row.opt_outs);

    return {
      line: row.line,
      messagesSent,
      repliesReceived,
      replyRatePct: messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0,
      optOuts,
      optOutRatePct: messagesSent > 0 ? (optOuts / messagesSent) * 100 : 0,
      bookingSignals: Number(row.booking_signals),
      uniqueContacts: Number(row.unique_contacts),
    };
  });

  const totals = {
    totalLines: lines.length,
    totalMessages: lines.reduce((sum, l) => sum + l.messagesSent, 0),
    totalReplies: lines.reduce((sum, l) => sum + l.repliesReceived, 0),
    overallReplyRate: 0,
    totalOptOuts: lines.reduce((sum, l) => sum + l.optOuts, 0),
  };
  totals.overallReplyRate = totals.totalMessages > 0 ? (totals.totalReplies / totals.totalMessages) * 100 : 0;

  return {
    timeRange: { from: fromIso, to: toIso },
    lines,
    totals,
  };
};

// ─── Qualification Funnel Analytics ────────────────────────────────────────────

export type QualificationFunnelStep = {
  step: string;
  count: number;
  percentage: number;
  conversionRate: number;
};

export type QualificationFunnelAnalytics = {
  totalConversations: number;
  qualifiedConversations: number;
  funnel: {
    employmentStatus: { fullTime: number; partTime: number; unknown: number };
    revenueMix: { mostlyCash: number; mostlyInsurance: number; balanced: number; unknown: number };
    coachingInterest: { high: number; medium: number; low: number; unknown: number };
  };
  escalationDistribution: { level1: number; level2: number; level3: number; level4: number };
  cadenceDistribution: { idle: number; podcastSent: number; callOffered: number; nurturePool: number };
  conversionByQualification: {
    highInterestConversionRate: number;
    mediumInterestConversionRate: number;
    lowInterestConversionRate: number;
  };
};

export const getQualificationFunnelAnalytics = async (): Promise<QualificationFunnelAnalytics> => {
  const prisma = getPrisma();

  const funnelRows = await prisma.$queryRawUnsafe<{
    total_conversations: number | bigint;
    qualified_conversations: number | bigint;
    full_time: number | bigint;
    part_time: number | bigint;
    employment_unknown: number | bigint;
    mostly_cash: number | bigint;
    mostly_insurance: number | bigint;
    balanced: number | bigint;
    revenue_unknown: number | bigint;
    high_interest: number | bigint;
    medium_interest: number | bigint;
    low_interest: number | bigint;
    interest_unknown: number | bigint;
    level_1: number | bigint;
    level_2: number | bigint;
    level_3: number | bigint;
    level_4: number | bigint;
    cadence_idle: number | bigint;
    cadence_podcast_sent: number | bigint;
    cadence_call_offered: number | bigint;
    cadence_nurture_pool: number | bigint;
  }[]>(`
    SELECT
      COUNT(DISTINCT c.id) AS total_conversations,
      COUNT(DISTINCT cs.conversation_id) AS qualified_conversations,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'full_time' THEN cs.conversation_id END) AS full_time,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'part_time' THEN cs.conversation_id END) AS part_time,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'unknown' OR cs.qualification_full_or_part_time IS NULL THEN cs.conversation_id END) AS employment_unknown,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'mostly_cash' THEN cs.conversation_id END) AS mostly_cash,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'mostly_insurance' THEN cs.conversation_id END) AS mostly_insurance,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'balanced' THEN cs.conversation_id END) AS balanced,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'unknown' OR cs.qualification_revenue_mix IS NULL THEN cs.conversation_id END) AS revenue_unknown,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'high' THEN cs.conversation_id END) AS high_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'medium' THEN cs.conversation_id END) AS medium_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'low' THEN cs.conversation_id END) AS low_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'unknown' OR cs.qualification_coaching_interest IS NULL THEN cs.conversation_id END) AS interest_unknown,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 1 THEN cs.conversation_id END) AS level_1,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 2 THEN cs.conversation_id END) AS level_2,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 3 THEN cs.conversation_id END) AS level_3,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 4 THEN cs.conversation_id END) AS level_4,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'idle' THEN cs.conversation_id END) AS cadence_idle,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'podcast_sent' THEN cs.conversation_id END) AS cadence_podcast_sent,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'call_offered' THEN cs.conversation_id END) AS cadence_call_offered,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'nurture_pool' THEN cs.conversation_id END) AS cadence_nurture_pool
    FROM conversations c
    LEFT JOIN conversation_state cs ON c.id = cs.conversation_id
  `);

  const row = funnelRows[0];
  const totalConversations = Number(row.total_conversations);
  const qualifiedConversations = Number(row.qualified_conversations);

  // Calculate conversion rates by interest level
  const conversionRows = await prisma.$queryRawUnsafe<{
    coaching_interest: string;
    total: number | bigint;
    booked: number | bigint;
  }[]>(`
    SELECT
      cs.qualification_coaching_interest AS coaching_interest,
      COUNT(*) AS total,
      COUNT(CASE WHEN cs.escalation_level >= 3 THEN 1 END) AS booked
    FROM conversation_state cs
    WHERE cs.qualification_coaching_interest IN ('high', 'medium', 'low')
    GROUP BY cs.qualification_coaching_interest
  `);

  const conversionByInterest: Record<string, { total: number; booked: number }> = {};
  for (const cr of conversionRows) {
    conversionByInterest[cr.coaching_interest] = {
      total: Number(cr.total),
      booked: Number(cr.booked),
    };
  }

  const calcConversionRate = (interest: string) => {
    const data = conversionByInterest[interest];
    if (!data || data.total === 0) return 0;
    return (data.booked / data.total) * 100;
  };

  return {
    totalConversations,
    qualifiedConversations,
    funnel: {
      employmentStatus: {
        fullTime: Number(row.full_time),
        partTime: Number(row.part_time),
        unknown: Number(row.employment_unknown),
      },
      revenueMix: {
        mostlyCash: Number(row.mostly_cash),
        mostlyInsurance: Number(row.mostly_insurance),
        balanced: Number(row.balanced),
        unknown: Number(row.revenue_unknown),
      },
      coachingInterest: {
        high: Number(row.high_interest),
        medium: Number(row.medium_interest),
        low: Number(row.low_interest),
        unknown: Number(row.interest_unknown),
      },
    },
    escalationDistribution: {
      level1: Number(row.level_1),
      level2: Number(row.level_2),
      level3: Number(row.level_3),
      level4: Number(row.level_4),
    },
    cadenceDistribution: {
      idle: Number(row.cadence_idle),
      podcastSent: Number(row.cadence_podcast_sent),
      callOffered: Number(row.cadence_call_offered),
      nurturePool: Number(row.cadence_nurture_pool),
    },
    conversionByQualification: {
      highInterestConversionRate: calcConversionRate('high'),
      mediumInterestConversionRate: calcConversionRate('medium'),
      lowInterestConversionRate: calcConversionRate('low'),
    },
  };
};

// ─── Draft AI Performance Analytics ────────────────────────────────────────────

export type DraftAIPerformanceAnalytics = {
  totalDrafts: number;
  acceptedDrafts: number;
  editedDrafts: number;
  rejectedDrafts: number;
  genericToneDrafts: number;
  setterAnchoredDrafts: number;
  setterAnchorCoverageRate: number;
  genericToneRate: number;
  setterLikeRate: number;
  acceptanceRate: number;
  editRate: number;
  avgLintScore: number;
  avgStructuralScore: number;
  scoreByOutcome: {
    accepted: { avgLint: number; avgStructural: number };
    edited: { avgLint: number; avgStructural: number };
    rejected: { avgLint: number; avgStructural: number };
  };
  trendByDay: Array<{
    day: string;
    total: number;
    accepted: number;
    edited: number;
    avgLintScore: number;
  }>;
};

export const getDraftAIPerformanceAnalytics = async (params: {
  from: Date;
  to: Date;
}): Promise<DraftAIPerformanceAnalytics> => {
  const prisma = getPrisma();

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  // Overall stats
  const overallRows = await prisma.$queryRawUnsafe<{
    total_drafts: number | bigint;
    accepted_drafts: number | bigint;
    edited_drafts: number | bigint;
    generic_tone_drafts: number | bigint;
    setter_anchored_drafts: number | bigint;
    avg_lint_score: number | string;
    avg_structural_score: number | string;
  }[]>(
    `
    SELECT
      COUNT(*) AS total_drafts,
      COUNT(CASE WHEN accepted = true THEN 1 END) AS accepted_drafts,
      COUNT(CASE WHEN edited = true THEN 1 END) AS edited_drafts,
      COUNT(
        CASE
          WHEN COALESCE((raw->>'genericToneDetected')::boolean, false) = true
          THEN 1
        END
      ) AS generic_tone_drafts,
      COUNT(
        CASE
          WHEN COALESCE((raw->>'styleAnchorCount')::int, 0) > 0
          THEN 1
        END
      ) AS setter_anchored_drafts,
      COALESCE(AVG(lint_score), 0) AS avg_lint_score,
      COALESCE(AVG(structural_score), 0) AS avg_structural_score
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
  `,
    fromIso,
    toIso,
  );

  const overall = overallRows[0];
  const totalDrafts = Number(overall.total_drafts);
  const acceptedDrafts = Number(overall.accepted_drafts);
  const editedDrafts = Number(overall.edited_drafts);
  const genericToneDrafts = Number(overall.generic_tone_drafts);
  const setterAnchoredDrafts = Number(overall.setter_anchored_drafts);
  const rejectedDrafts = Math.max(0, totalDrafts - acceptedDrafts);
  const setterLikeDrafts = Math.max(0, setterAnchoredDrafts - genericToneDrafts);

  // Score by outcome
  const outcomeRows = await prisma.$queryRawUnsafe<{
    outcome: string;
    avg_lint: number | string;
    avg_structural: number | string;
  }[]>(
    `
    SELECT
      CASE
        WHEN accepted = true THEN 'accepted'
        WHEN edited = true THEN 'edited'
        ELSE 'rejected'
      END AS outcome,
      COALESCE(AVG(lint_score), 0) AS avg_lint,
      COALESCE(AVG(structural_score), 0) AS avg_structural
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
  `,
    fromIso,
    toIso,
  );

  const scoreByOutcome = {
    accepted: { avgLint: 0, avgStructural: 0 },
    edited: { avgLint: 0, avgStructural: 0 },
    rejected: { avgLint: 0, avgStructural: 0 },
  };

  for (const row of outcomeRows) {
    if (row.outcome in scoreByOutcome) {
      scoreByOutcome[row.outcome as keyof typeof scoreByOutcome] = {
        avgLint: Number(row.avg_lint),
        avgStructural: Number(row.avg_structural),
      };
    }
  }

  // Trend by day
  const trendRows = await prisma.$queryRawUnsafe<{
    day: string;
    total: number | bigint;
    accepted: number | bigint;
    edited: number | bigint;
    avg_lint_score: number | string;
  }[]>(
    `
    SELECT
      TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
      COUNT(*) AS total,
      COUNT(CASE WHEN accepted = true THEN 1 END) AS accepted,
      COUNT(CASE WHEN edited = true THEN 1 END) AS edited,
      COALESCE(AVG(lint_score), 0) AS avg_lint_score
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY 1
  `,
    fromIso,
    toIso,
  );

  const trendByDay = trendRows.map((row) => ({
    day: row.day,
    total: Number(row.total),
    accepted: Number(row.accepted),
    edited: Number(row.edited),
    avgLintScore: Number(row.avg_lint_score),
  }));

  return {
    totalDrafts,
    acceptedDrafts,
    editedDrafts,
    rejectedDrafts,
    genericToneDrafts,
    setterAnchoredDrafts,
    setterAnchorCoverageRate: totalDrafts > 0 ? (setterAnchoredDrafts / totalDrafts) * 100 : 0,
    genericToneRate: totalDrafts > 0 ? (genericToneDrafts / totalDrafts) * 100 : 0,
    setterLikeRate: totalDrafts > 0 ? (setterLikeDrafts / totalDrafts) * 100 : 0,
    acceptanceRate: totalDrafts > 0 ? (acceptedDrafts / totalDrafts) * 100 : 0,
    editRate: totalDrafts > 0 ? (editedDrafts / totalDrafts) * 100 : 0,
    avgLintScore: Number(overall.avg_lint_score),
    avgStructuralScore: Number(overall.avg_structural_score),
    scoreByOutcome,
    trendByDay,
  };
};

// ─── Follow-up SLA Analytics ───────────────────────────────────────────────────

export type FollowUpSLAAnalytics = {
  totalWorkItems: number;
  resolvedOnTime: number;
  resolvedLate: number;
  pending: number;
  slaComplianceRate: number;
  avgResolutionTimeMinutes: number;
  byRep: Array<{
    repId: string;
    total: number;
    onTime: number;
    late: number;
    pending: number;
    complianceRate: number;
  }>;
  byType: Array<{
    type: string;
    total: number;
    onTime: number;
    late: number;
    avgResolutionMinutes: number;
  }>;
};

export const getFollowUpSLAAnalytics = async (params: { from: Date; to: Date }): Promise<FollowUpSLAAnalytics> => {
  const prisma = getPrisma();

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  // Overall SLA stats
  const overallRows = await prisma.$queryRawUnsafe<{
    total_work_items: number | bigint;
    resolved_on_time: number | bigint;
    resolved_late: number | bigint;
    pending: number | bigint;
    avg_resolution_minutes: number | string;
  }[]>(
    `
    SELECT
      COUNT(*) AS total_work_items,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END) AS resolved_on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END) AS resolved_late,
      COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) AS pending,
      COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0) AS avg_resolution_minutes
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
  `,
    fromIso,
    toIso,
  );

  const overall = overallRows[0];
  const totalWorkItems = Number(overall.total_work_items);
  const resolvedOnTime = Number(overall.resolved_on_time);
  const resolvedLate = Number(overall.resolved_late);
  const pending = Number(overall.pending);
  const resolved = resolvedOnTime + resolvedLate;

  // By rep
  const repRows = await prisma.$queryRawUnsafe<{
    rep_id: string;
    total: number | bigint;
    on_time: number | bigint;
    late: number | bigint;
    pending: number | bigint;
  }[]>(
    `
    SELECT
      COALESCE(rep_id, 'Unassigned') AS rep_id,
      COUNT(*) AS total,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END) AS on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END) AS late,
      COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) AS pending
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY COUNT(*) DESC
  `,
    fromIso,
    toIso,
  );

  const byRep = repRows.map((row) => {
    const total = Number(row.total);
    const onTime = Number(row.on_time);
    const late = Number(row.late);
    const repResolved = onTime + late;
    return {
      repId: row.rep_id,
      total,
      onTime,
      late,
      pending: Number(row.pending),
      complianceRate: repResolved > 0 ? (onTime / repResolved) * 100 : 0,
    };
  });

  // By type
  const typeRows = await prisma.$queryRawUnsafe<{
    type: string;
    total: number | bigint;
    on_time: number | bigint;
    late: number | bigint;
    avg_resolution_minutes: number | string;
  }[]>(
    `
    SELECT
      type,
      COUNT(*) AS total,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END) AS on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END) AS late,
      COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0) AS avg_resolution_minutes
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY COUNT(*) DESC
  `,
    fromIso,
    toIso,
  );

  const byType = typeRows.map((row) => ({
    type: row.type,
    total: Number(row.total),
    onTime: Number(row.on_time),
    late: Number(row.late),
    avgResolutionMinutes: Number(row.avg_resolution_minutes),
  }));

  return {
    totalWorkItems,
    resolvedOnTime,
    resolvedLate,
    pending,
    slaComplianceRate: resolved > 0 ? (resolvedOnTime / resolved) * 100 : 0,
    avgResolutionTimeMinutes: Number(overall.avg_resolution_minutes),
    byRep,
    byType,
  };
};
