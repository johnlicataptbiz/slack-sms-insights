import { getPool } from './db.js';
import { DEFAULT_BUSINESS_TIMEZONE } from './time-range.js';

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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  const { rows } = await pool.query<{
    line: string;
    messages_sent: string;
    replies_received: string;
    opt_outs: string;
    booking_signals: string;
    unique_contacts: string;
  }>(
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
      o.messages_sent::text,
      COALESCE(i.replies_received, 0)::text AS replies_received,
      COALESCE(i.opt_outs, 0)::text AS opt_outs,
      COALESCE(i.booking_signals, 0)::text AS booking_signals,
      o.unique_contacts::text
    FROM outbound_stats o
    LEFT JOIN inbound_stats i ON o.line = i.line
    ORDER BY o.messages_sent DESC
    `,
    [fromIso, toIso],
  );

  const lines: LinePerformanceRow[] = rows.map((row) => {
    const messagesSent = Number.parseInt(row.messages_sent, 10);
    const repliesReceived = Number.parseInt(row.replies_received, 10);
    const optOuts = Number.parseInt(row.opt_outs, 10);

    return {
      line: row.line,
      messagesSent,
      repliesReceived,
      replyRatePct: messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0,
      optOuts,
      optOutRatePct: messagesSent > 0 ? (optOuts / messagesSent) * 100 : 0,
      bookingSignals: Number.parseInt(row.booking_signals, 10),
      uniqueContacts: Number.parseInt(row.unique_contacts, 10),
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const { rows: funnelRows } = await pool.query<{
    total_conversations: string;
    qualified_conversations: string;
    full_time: string;
    part_time: string;
    employment_unknown: string;
    mostly_cash: string;
    mostly_insurance: string;
    balanced: string;
    revenue_unknown: string;
    high_interest: string;
    medium_interest: string;
    low_interest: string;
    interest_unknown: string;
    level_1: string;
    level_2: string;
    level_3: string;
    level_4: string;
    cadence_idle: string;
    cadence_podcast_sent: string;
    cadence_call_offered: string;
    cadence_nurture_pool: string;
  }>(`
    SELECT
      COUNT(DISTINCT c.id)::text AS total_conversations,
      COUNT(DISTINCT cs.conversation_id)::text AS qualified_conversations,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'full_time' THEN cs.conversation_id END)::text AS full_time,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'part_time' THEN cs.conversation_id END)::text AS part_time,
      COUNT(DISTINCT CASE WHEN cs.qualification_full_or_part_time = 'unknown' OR cs.qualification_full_or_part_time IS NULL THEN cs.conversation_id END)::text AS employment_unknown,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'mostly_cash' THEN cs.conversation_id END)::text AS mostly_cash,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'mostly_insurance' THEN cs.conversation_id END)::text AS mostly_insurance,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'balanced' THEN cs.conversation_id END)::text AS balanced,
      COUNT(DISTINCT CASE WHEN cs.qualification_revenue_mix = 'unknown' OR cs.qualification_revenue_mix IS NULL THEN cs.conversation_id END)::text AS revenue_unknown,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'high' THEN cs.conversation_id END)::text AS high_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'medium' THEN cs.conversation_id END)::text AS medium_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'low' THEN cs.conversation_id END)::text AS low_interest,
      COUNT(DISTINCT CASE WHEN cs.qualification_coaching_interest = 'unknown' OR cs.qualification_coaching_interest IS NULL THEN cs.conversation_id END)::text AS interest_unknown,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 1 THEN cs.conversation_id END)::text AS level_1,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 2 THEN cs.conversation_id END)::text AS level_2,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 3 THEN cs.conversation_id END)::text AS level_3,
      COUNT(DISTINCT CASE WHEN cs.escalation_level = 4 THEN cs.conversation_id END)::text AS level_4,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'idle' THEN cs.conversation_id END)::text AS cadence_idle,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'podcast_sent' THEN cs.conversation_id END)::text AS cadence_podcast_sent,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'call_offered' THEN cs.conversation_id END)::text AS cadence_call_offered,
      COUNT(DISTINCT CASE WHEN cs.cadence_status = 'nurture_pool' THEN cs.conversation_id END)::text AS cadence_nurture_pool
    FROM conversations c
    LEFT JOIN conversation_state cs ON c.id = cs.conversation_id
  `);

  const row = funnelRows[0];
  const totalConversations = Number.parseInt(row.total_conversations, 10);
  const qualifiedConversations = Number.parseInt(row.qualified_conversations, 10);

  // Calculate conversion rates by interest level
  const { rows: conversionRows } = await pool.query<{
    coaching_interest: string;
    total: string;
    booked: string;
  }>(`
    SELECT
      cs.qualification_coaching_interest AS coaching_interest,
      COUNT(*)::text AS total,
      COUNT(CASE WHEN cs.escalation_level >= 3 THEN 1 END)::text AS booked
    FROM conversation_state cs
    WHERE cs.qualification_coaching_interest IN ('high', 'medium', 'low')
    GROUP BY cs.qualification_coaching_interest
  `);

  const conversionByInterest: Record<string, { total: number; booked: number }> = {};
  for (const cr of conversionRows) {
    conversionByInterest[cr.coaching_interest] = {
      total: Number.parseInt(cr.total, 10),
      booked: Number.parseInt(cr.booked, 10),
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
        fullTime: Number.parseInt(row.full_time, 10),
        partTime: Number.parseInt(row.part_time, 10),
        unknown: Number.parseInt(row.employment_unknown, 10),
      },
      revenueMix: {
        mostlyCash: Number.parseInt(row.mostly_cash, 10),
        mostlyInsurance: Number.parseInt(row.mostly_insurance, 10),
        balanced: Number.parseInt(row.balanced, 10),
        unknown: Number.parseInt(row.revenue_unknown, 10),
      },
      coachingInterest: {
        high: Number.parseInt(row.high_interest, 10),
        medium: Number.parseInt(row.medium_interest, 10),
        low: Number.parseInt(row.low_interest, 10),
        unknown: Number.parseInt(row.interest_unknown, 10),
      },
    },
    escalationDistribution: {
      level1: Number.parseInt(row.level_1, 10),
      level2: Number.parseInt(row.level_2, 10),
      level3: Number.parseInt(row.level_3, 10),
      level4: Number.parseInt(row.level_4, 10),
    },
    cadenceDistribution: {
      idle: Number.parseInt(row.cadence_idle, 10),
      podcastSent: Number.parseInt(row.cadence_podcast_sent, 10),
      callOffered: Number.parseInt(row.cadence_call_offered, 10),
      nurturePool: Number.parseInt(row.cadence_nurture_pool, 10),
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  // Overall stats
  const { rows: overallRows } = await pool.query<{
    total_drafts: string;
    accepted_drafts: string;
    edited_drafts: string;
    generic_tone_drafts: string;
    setter_anchored_drafts: string;
    avg_lint_score: string;
    avg_structural_score: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS total_drafts,
      COUNT(CASE WHEN accepted = true THEN 1 END)::text AS accepted_drafts,
      COUNT(CASE WHEN edited = true THEN 1 END)::text AS edited_drafts,
      COUNT(
        CASE
          WHEN COALESCE((raw->>'genericToneDetected')::boolean, false) = true
          THEN 1
        END
      )::text AS generic_tone_drafts,
      COUNT(
        CASE
          WHEN COALESCE((raw->>'styleAnchorCount')::int, 0) > 0
          THEN 1
        END
      )::text AS setter_anchored_drafts,
      COALESCE(AVG(lint_score), 0)::text AS avg_lint_score,
      COALESCE(AVG(structural_score), 0)::text AS avg_structural_score
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
  `,
    [fromIso, toIso],
  );

  const overall = overallRows[0];
  const totalDrafts = Number.parseInt(overall.total_drafts, 10);
  const acceptedDrafts = Number.parseInt(overall.accepted_drafts, 10);
  const editedDrafts = Number.parseInt(overall.edited_drafts, 10);
  const genericToneDrafts = Number.parseInt(overall.generic_tone_drafts, 10);
  const setterAnchoredDrafts = Number.parseInt(overall.setter_anchored_drafts, 10);
  const rejectedDrafts = Math.max(0, totalDrafts - acceptedDrafts);
  const setterLikeDrafts = Math.max(0, setterAnchoredDrafts - genericToneDrafts);

  // Score by outcome
  const { rows: outcomeRows } = await pool.query<{
    outcome: string;
    avg_lint: string;
    avg_structural: string;
  }>(
    `
    SELECT
      CASE
        WHEN accepted = true THEN 'accepted'
        WHEN edited = true THEN 'edited'
        ELSE 'rejected'
      END AS outcome,
      COALESCE(AVG(lint_score), 0)::text AS avg_lint,
      COALESCE(AVG(structural_score), 0)::text AS avg_structural
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
  `,
    [fromIso, toIso],
  );

  const scoreByOutcome = {
    accepted: { avgLint: 0, avgStructural: 0 },
    edited: { avgLint: 0, avgStructural: 0 },
    rejected: { avgLint: 0, avgStructural: 0 },
  };

  for (const row of outcomeRows) {
    if (row.outcome in scoreByOutcome) {
      scoreByOutcome[row.outcome as keyof typeof scoreByOutcome] = {
        avgLint: Number.parseFloat(row.avg_lint),
        avgStructural: Number.parseFloat(row.avg_structural),
      };
    }
  }

  // Trend by day
  const { rows: trendRows } = await pool.query<{
    day: string;
    total: string;
    accepted: string;
    edited: string;
    avg_lint_score: string;
  }>(
    `
    SELECT
      TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
      COUNT(*)::text AS total,
      COUNT(CASE WHEN accepted = true THEN 1 END)::text AS accepted,
      COUNT(CASE WHEN edited = true THEN 1 END)::text AS edited,
      COALESCE(AVG(lint_score), 0)::text AS avg_lint_score
    FROM draft_suggestions
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY 1
  `,
    [fromIso, toIso],
  );

  const trendByDay = trendRows.map((row) => ({
    day: row.day,
    total: Number.parseInt(row.total, 10),
    accepted: Number.parseInt(row.accepted, 10),
    edited: Number.parseInt(row.edited, 10),
    avgLintScore: Number.parseFloat(row.avg_lint_score),
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
    avgLintScore: Number.parseFloat(overall.avg_lint_score),
    avgStructuralScore: Number.parseFloat(overall.avg_structural_score),
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  // Overall SLA stats
  const { rows: overallRows } = await pool.query<{
    total_work_items: string;
    resolved_on_time: string;
    resolved_late: string;
    pending: string;
    avg_resolution_minutes: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS total_work_items,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END)::text AS resolved_on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END)::text AS resolved_late,
      COUNT(CASE WHEN resolved_at IS NULL THEN 1 END)::text AS pending,
      COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0)::text AS avg_resolution_minutes
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
  `,
    [fromIso, toIso],
  );

  const overall = overallRows[0];
  const totalWorkItems = Number.parseInt(overall.total_work_items, 10);
  const resolvedOnTime = Number.parseInt(overall.resolved_on_time, 10);
  const resolvedLate = Number.parseInt(overall.resolved_late, 10);
  const pending = Number.parseInt(overall.pending, 10);
  const resolved = resolvedOnTime + resolvedLate;

  // By rep
  const { rows: repRows } = await pool.query<{
    rep_id: string;
    total: string;
    on_time: string;
    late: string;
    pending: string;
  }>(
    `
    SELECT
      COALESCE(rep_id, 'Unassigned') AS rep_id,
      COUNT(*)::text AS total,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END)::text AS on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END)::text AS late,
      COUNT(CASE WHEN resolved_at IS NULL THEN 1 END)::text AS pending
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY COUNT(*) DESC
  `,
    [fromIso, toIso],
  );

  const byRep = repRows.map((row) => {
    const total = Number.parseInt(row.total, 10);
    const onTime = Number.parseInt(row.on_time, 10);
    const late = Number.parseInt(row.late, 10);
    const repResolved = onTime + late;
    return {
      repId: row.rep_id,
      total,
      onTime,
      late,
      pending: Number.parseInt(row.pending, 10),
      complianceRate: repResolved > 0 ? (onTime / repResolved) * 100 : 0,
    };
  });

  // By type
  const { rows: typeRows } = await pool.query<{
    type: string;
    total: string;
    on_time: string;
    late: string;
    avg_resolution_minutes: string;
  }>(
    `
    SELECT
      type,
      COUNT(*)::text AS total,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= due_at THEN 1 END)::text AS on_time,
      COUNT(CASE WHEN resolved_at IS NOT NULL AND resolved_at > due_at THEN 1 END)::text AS late,
      COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0)::text AS avg_resolution_minutes
    FROM work_items
    WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
    GROUP BY 1
    ORDER BY COUNT(*) DESC
  `,
    [fromIso, toIso],
  );

  const byType = typeRows.map((row) => ({
    type: row.type,
    total: Number.parseInt(row.total, 10),
    onTime: Number.parseInt(row.on_time, 10),
    late: Number.parseInt(row.late, 10),
    avgResolutionMinutes: Number.parseFloat(row.avg_resolution_minutes),
  }));

  return {
    totalWorkItems,
    resolvedOnTime,
    resolvedLate,
    pending,
    slaComplianceRate: resolved > 0 ? (resolvedOnTime / resolved) * 100 : 0,
    avgResolutionTimeMinutes: Number.parseFloat(overall.avg_resolution_minutes),
    byRep,
    byType,
  };
};
