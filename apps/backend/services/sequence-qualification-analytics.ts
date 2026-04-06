import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { hasTableColumn, isMissingSchemaError } from './schema-compat.js';

export type QualificationMetric = {
  count: number;
  pct: number;
  sampleQuote: string | null;
};

export type SequenceQualificationBreakdown = {
  sequenceLabel: string;
  totalConversations: number;
  mondayOutcomes: {
    linkedContacts: number;
    totalOutcomes: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    noShow: number;
    cancelled: number;
    badTiming: number;
    badFit: number;
    other: number;
    unknown: number;
    bookedPct: number;
    closedWonPct: number;
    noShowPct: number;
    cancelledPct: number;
  };
  // Employment status
  fullTime: QualificationMetric;
  partTime: QualificationMetric;
  unknownEmployment: QualificationMetric;
  // Revenue mix
  mostlyCash: QualificationMetric;
  mostlyInsurance: QualificationMetric;
  balancedMix: QualificationMetric;
  unknownRevenue: QualificationMetric;
  // Delivery model
  brickAndMortar: QualificationMetric;
  mobile: QualificationMetric;
  online: QualificationMetric;
  hybrid: QualificationMetric;
  unknownDelivery: QualificationMetric;
  // Coaching interest
  highInterest: QualificationMetric;
  mediumInterest: QualificationMetric;
  lowInterest: QualificationMetric;
  unknownInterest: QualificationMetric;
  // Niches
  topNiches: Array<{ niche: string; count: number; pct: number }>;
};

const getPrisma = () => getPrismaClient();

const SAMPLE_QUOTE_METRICS = [
  {
    key: 'fullTime',
    column: 'qualification_full_or_part_time',
    value: 'full_time',
  },
  {
    key: 'partTime',
    column: 'qualification_full_or_part_time',
    value: 'part_time',
  },
  {
    key: 'mostlyCash',
    column: 'qualification_revenue_mix',
    value: 'mostly_cash',
  },
  {
    key: 'mostlyInsurance',
    column: 'qualification_revenue_mix',
    value: 'mostly_insurance',
  },
  {
    key: 'balancedMix',
    column: 'qualification_revenue_mix',
    value: 'balanced',
  },
  {
    key: 'brickAndMortar',
    column: 'qualification_delivery_model',
    value: 'brick_and_mortar',
  },
  {
    key: 'mobile',
    column: 'qualification_delivery_model',
    value: 'mobile',
  },
  {
    key: 'online',
    column: 'qualification_delivery_model',
    value: 'online',
  },
  {
    key: 'hybrid',
    column: 'qualification_delivery_model',
    value: 'hybrid',
  },
  {
    key: 'highInterest',
    column: 'qualification_coaching_interest',
    value: 'high',
  },
  {
    key: 'mediumInterest',
    column: 'qualification_coaching_interest',
    value: 'medium',
  },
  {
    key: 'lowInterest',
    column: 'qualification_coaching_interest',
    value: 'low',
  },
] as const;

type SampleQuoteMetricKey = (typeof SAMPLE_QUOTE_METRICS)[number]['key'];
type TopNicheRow = { niche: string; count: number; pct: number };

/**
 * Build qualification breakdown per sequence for a given time window.
 * Aggregates conversation_state data grouped by the sequence that initiated contact.
 */
export const buildSequenceQualificationBreakdown = async (params: {
  from: string; // ISO date
  to: string; // ISO date
  timezone: string;
  minConversations?: number;
  logger?: Pick<Logger, 'debug' | 'warn'>;
}): Promise<SequenceQualificationBreakdown[]> => {
  const { from, to, timezone, minConversations = 5, logger } = params;
  const prisma = getPrisma();
  const hasQualificationDeliveryModel = await hasTableColumn(
    prisma,
    'conversation_state',
    'qualification_delivery_model',
  ).catch(() => false);
  const deliveryModelExpr = hasQualificationDeliveryModel ? 'cs.qualification_delivery_model' : `'unknown'::text`;

  logger?.debug?.('[sequence-qualification] Building breakdown', { from, to, timezone });

  let rows: any[] = [];
  try {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `
    WITH sequence_first_touch AS (
      -- Find the first outbound message per conversation and its sequence
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sequence as sequence_label
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts < $2::timestamptz
        AND sequence IS NOT NULL
        AND sequence != ''
      ORDER BY conversation_id, event_ts ASC
    ),
    conversations_with_qualification AS (
      SELECT 
        sft.sequence_label,
        cs.conversation_id,
        cs.qualification_full_or_part_time,
        cs.qualification_revenue_mix,
        ${deliveryModelExpr} AS qualification_delivery_model,
        cs.qualification_coaching_interest,
        cs.qualification_niche
      FROM sequence_first_touch sft
      JOIN conversation_state cs ON cs.conversation_id = sft.conversation_id
    ),
    sequence_contacts AS (
      SELECT DISTINCT
        sft.sequence_label,
        c.contact_key
      FROM sequence_first_touch sft
      JOIN conversations c ON c.id = sft.conversation_id
      WHERE c.contact_key IS NOT NULL
        AND c.contact_key != ''
    ),
    monday_outcomes_by_sequence AS (
      SELECT
        sc.sequence_label,
        COUNT(DISTINCT lo.contact_key)::int AS monday_linked_contacts,
        COUNT(lo.item_id)::int AS monday_total_outcomes,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'booked')::int AS monday_booked_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'closed_won')::int AS monday_closed_won_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'closed_lost')::int AS monday_closed_lost_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'no_show')::int AS monday_no_show_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'cancelled')::int AS monday_cancelled_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'bad_timing')::int AS monday_bad_timing_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'bad_fit')::int AS monday_bad_fit_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'other')::int AS monday_other_count,
        COUNT(*) FILTER (WHERE lo.outcome_category = 'unknown')::int AS monday_unknown_count
      FROM sequence_contacts sc
      LEFT JOIN lead_outcomes lo
        ON lo.contact_key = sc.contact_key
       AND lo.call_date >= ($1::timestamptz AT TIME ZONE $4)::date
       AND lo.call_date < ($2::timestamptz AT TIME ZONE $4)::date
       AND EXISTS (
         SELECT 1
         FROM monday_board_registry br
         WHERE br.board_id = lo.board_id
           AND br.active = TRUE
           AND br.metric_grain = 'lead_item'
           AND br.include_in_funnel = TRUE
       )
      GROUP BY sc.sequence_label
    )
    SELECT 
      cwq.sequence_label,
      COUNT(*) as total_conversations,
      COALESCE(MAX(mos.monday_linked_contacts), 0)::int AS monday_linked_contacts,
      COALESCE(MAX(mos.monday_total_outcomes), 0)::int AS monday_total_outcomes,
      COALESCE(MAX(mos.monday_booked_count), 0)::int AS monday_booked_count,
      COALESCE(MAX(mos.monday_closed_won_count), 0)::int AS monday_closed_won_count,
      COALESCE(MAX(mos.monday_closed_lost_count), 0)::int AS monday_closed_lost_count,
      COALESCE(MAX(mos.monday_no_show_count), 0)::int AS monday_no_show_count,
      COALESCE(MAX(mos.monday_cancelled_count), 0)::int AS monday_cancelled_count,
      COALESCE(MAX(mos.monday_bad_timing_count), 0)::int AS monday_bad_timing_count,
      COALESCE(MAX(mos.monday_bad_fit_count), 0)::int AS monday_bad_fit_count,
      COALESCE(MAX(mos.monday_other_count), 0)::int AS monday_other_count,
      COALESCE(MAX(mos.monday_unknown_count), 0)::int AS monday_unknown_count,
      COUNT(*) FILTER (WHERE cwq.qualification_full_or_part_time = 'full_time') as full_time_count,
      COUNT(*) FILTER (WHERE cwq.qualification_full_or_part_time = 'part_time') as part_time_count,
      COUNT(*) FILTER (WHERE cwq.qualification_full_or_part_time = 'unknown') as unknown_employment_count,
      COUNT(*) FILTER (WHERE cwq.qualification_revenue_mix = 'mostly_cash') as mostly_cash_count,
      COUNT(*) FILTER (WHERE cwq.qualification_revenue_mix = 'mostly_insurance') as mostly_insurance_count,
      COUNT(*) FILTER (WHERE cwq.qualification_revenue_mix = 'balanced') as balanced_mix_count,
      COUNT(*) FILTER (WHERE cwq.qualification_revenue_mix = 'unknown') as unknown_revenue_count,
      COUNT(*) FILTER (WHERE cwq.qualification_delivery_model = 'brick_and_mortar') as brick_and_mortar_count,
      COUNT(*) FILTER (WHERE cwq.qualification_delivery_model = 'mobile') as mobile_count,
      COUNT(*) FILTER (WHERE cwq.qualification_delivery_model = 'online') as online_count,
      COUNT(*) FILTER (WHERE cwq.qualification_delivery_model = 'hybrid') as hybrid_count,
      COUNT(*) FILTER (WHERE cwq.qualification_delivery_model = 'unknown') as unknown_delivery_count,
      COUNT(*) FILTER (WHERE cwq.qualification_coaching_interest = 'high') as high_interest_count,
      COUNT(*) FILTER (WHERE cwq.qualification_coaching_interest = 'medium') as medium_interest_count,
      COUNT(*) FILTER (WHERE cwq.qualification_coaching_interest = 'low') as low_interest_count,
      COUNT(*) FILTER (WHERE cwq.qualification_coaching_interest = 'unknown') as unknown_interest_count
    FROM conversations_with_qualification cwq
    LEFT JOIN monday_outcomes_by_sequence mos ON mos.sequence_label = cwq.sequence_label
    GROUP BY cwq.sequence_label
    HAVING COUNT(*) >= $3
    ORDER BY total_conversations DESC
    `,
      from,
      to,
      minConversations,
      timezone,
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error;
    }
    logger?.warn?.('[sequence-qualification] Schema not ready; returning empty qualification breakdown');
    return [];
  }

  const [sampleQuotesBySequence, topNichesBySequence] = await Promise.all([
    fetchSampleQuotesBySequence(from, to),
    fetchTopNichesBySequence(from, to),
  ]);

  const breakdowns: SequenceQualificationBreakdown[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      continue;
    }
    const sampleQuotes = sampleQuotesBySequence.get(row.sequence_label) ?? {};
    const topNiches = topNichesBySequence.get(row.sequence_label) ?? [];
    const total = Number(row.total_conversations);
    const mondayTotalOutcomes = Number(row.monday_total_outcomes);
    const mondayBooked = Number(row.monday_booked_count);
    const mondayClosedWon = Number(row.monday_closed_won_count);
    const mondayNoShow = Number(row.monday_no_show_count);
    const mondayCancelled = Number(row.monday_cancelled_count);
    const mondayPct = (count: number): number => (mondayTotalOutcomes > 0 ? (count / mondayTotalOutcomes) * 100 : 0);

    breakdowns.push({
      sequenceLabel: row.sequence_label,
      totalConversations: total,
      mondayOutcomes: {
        linkedContacts: Number(row.monday_linked_contacts),
        totalOutcomes: mondayTotalOutcomes,
        booked: mondayBooked,
        closedWon: mondayClosedWon,
        closedLost: Number(row.monday_closed_lost_count),
        noShow: mondayNoShow,
        cancelled: mondayCancelled,
        badTiming: Number(row.monday_bad_timing_count),
        badFit: Number(row.monday_bad_fit_count),
        other: Number(row.monday_other_count),
        unknown: Number(row.monday_unknown_count),
        bookedPct: mondayPct(mondayBooked),
        closedWonPct: mondayPct(mondayClosedWon),
        noShowPct: mondayPct(mondayNoShow),
        cancelledPct: mondayPct(mondayCancelled),
      },
      fullTime: {
        count: Number(row.full_time_count),
        pct: (Number(row.full_time_count) / total) * 100,
        sampleQuote: sampleQuotes.fullTime ?? null,
      },
      partTime: {
        count: Number(row.part_time_count),
        pct: (Number(row.part_time_count) / total) * 100,
        sampleQuote: sampleQuotes.partTime ?? null,
      },
      unknownEmployment: {
        count: Number(row.unknown_employment_count),
        pct: (Number(row.unknown_employment_count) / total) * 100,
        sampleQuote: null,
      },
      mostlyCash: {
        count: Number(row.mostly_cash_count),
        pct: (Number(row.mostly_cash_count) / total) * 100,
        sampleQuote: sampleQuotes.mostlyCash ?? null,
      },
      mostlyInsurance: {
        count: Number(row.mostly_insurance_count),
        pct: (Number(row.mostly_insurance_count) / total) * 100,
        sampleQuote: sampleQuotes.mostlyInsurance ?? null,
      },
      balancedMix: {
        count: Number(row.balanced_mix_count),
        pct: (Number(row.balanced_mix_count) / total) * 100,
        sampleQuote: sampleQuotes.balancedMix ?? null,
      },
      unknownRevenue: {
        count: Number(row.unknown_revenue_count),
        pct: (Number(row.unknown_revenue_count) / total) * 100,
        sampleQuote: null,
      },
      brickAndMortar: {
        count: Number(row.brick_and_mortar_count),
        pct: (Number(row.brick_and_mortar_count) / total) * 100,
        sampleQuote: sampleQuotes.brickAndMortar ?? null,
      },
      mobile: {
        count: Number(row.mobile_count),
        pct: (Number(row.mobile_count) / total) * 100,
        sampleQuote: sampleQuotes.mobile ?? null,
      },
      online: {
        count: Number(row.online_count),
        pct: (Number(row.online_count) / total) * 100,
        sampleQuote: sampleQuotes.online ?? null,
      },
      hybrid: {
        count: Number(row.hybrid_count),
        pct: (Number(row.hybrid_count) / total) * 100,
        sampleQuote: sampleQuotes.hybrid ?? null,
      },
      unknownDelivery: {
        count: Number(row.unknown_delivery_count),
        pct: (Number(row.unknown_delivery_count) / total) * 100,
        sampleQuote: null,
      },
      highInterest: {
        count: Number(row.high_interest_count),
        pct: (Number(row.high_interest_count) / total) * 100,
        sampleQuote: sampleQuotes.highInterest ?? null,
      },
      mediumInterest: {
        count: Number(row.medium_interest_count),
        pct: (Number(row.medium_interest_count) / total) * 100,
        sampleQuote: sampleQuotes.mediumInterest ?? null,
      },
      lowInterest: {
        count: Number(row.low_interest_count),
        pct: (Number(row.low_interest_count) / total) * 100,
        sampleQuote: sampleQuotes.lowInterest ?? null,
      },
      unknownInterest: {
        count: Number(row.unknown_interest_count),
        pct: (Number(row.unknown_interest_count) / total) * 100,
        sampleQuote: null,
      },
      topNiches,
    });
  }

  logger?.debug?.('[sequence-qualification] Built breakdown for sequences', {
    count: breakdowns.length,
  });

  return breakdowns;
};

/**
 * Fetch a sample quote from an inbound message that demonstrates the qualification signal.
 */
async function fetchSampleQuotesBySequence(
  from: string,
  to: string,
): Promise<Map<string, Partial<Record<SampleQuoteMetricKey, string>>>> {
  const prisma = getPrisma();
  const hasQualificationDeliveryModel = await hasTableColumn(
    prisma,
    'conversation_state',
    'qualification_delivery_model',
  ).catch(() => false);
  const deliveryModelExpr = hasQualificationDeliveryModel ? 'cs.qualification_delivery_model' : `'unknown'::text`;
  const metricSql = SAMPLE_QUOTE_METRICS.map(
    (metric) => `
      SELECT
        qi.sequence_label,
        '${metric.key}' AS metric_key,
        qi.body,
        qi.event_ts
      FROM qualified_inbound qi
      WHERE qi.${metric.column} = '${metric.value}'
    `,
  ).join('\nUNION ALL\n');

  let results: Array<{ sequence_label: string; metric_key: SampleQuoteMetricKey; body: string }> = [];
  try {
    results = await prisma.$queryRawUnsafe<
      Array<{ sequence_label: string; metric_key: SampleQuoteMetricKey; body: string }>
    >(
      `
    WITH sequence_first_touch AS (
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sequence as sequence_label
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts < $2::timestamptz
        AND sequence IS NOT NULL
        AND sequence != ''
      ORDER BY conversation_id, event_ts ASC
    ),
    qualified_inbound AS (
      SELECT
        sft.sequence_label,
        cs.qualification_full_or_part_time,
        cs.qualification_revenue_mix,
        ${deliveryModelExpr} AS qualification_delivery_model,
        cs.qualification_coaching_interest,
        se.body,
        se.event_ts
      FROM sequence_first_touch sft
      JOIN conversation_state cs ON cs.conversation_id = sft.conversation_id
      JOIN sms_events se ON se.conversation_id = sft.conversation_id
      WHERE se.direction = 'inbound'
        AND se.body IS NOT NULL
        AND se.body != ''
        AND se.event_ts >= $1::timestamptz
        AND se.event_ts < $2::timestamptz
    ),
    metric_candidates AS (
      ${metricSql}
    ),
    ranked AS (
      SELECT DISTINCT ON (sequence_label, metric_key)
        sequence_label,
        metric_key,
        body
      FROM metric_candidates
      ORDER BY sequence_label, metric_key, event_ts DESC
    )
    SELECT sequence_label, metric_key, body
    FROM ranked
    `,
      from,
      to,
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error;
    }
    return new Map();
  }

  const quotesBySequence = new Map<string, Partial<Record<SampleQuoteMetricKey, string>>>();
  for (const row of results) {
    const existing = quotesBySequence.get(row.sequence_label) ?? {};
    const quote = row.body.replace(/\n/g, ' ').trim();
    existing[row.metric_key] = quote.length > 120 ? `${quote.slice(0, 117)}...` : quote;
    quotesBySequence.set(row.sequence_label, existing);
  }
  return quotesBySequence;
}

/**
 * Fetch top niches mentioned for a sequence.
 */
async function fetchTopNichesBySequence(from: string, to: string): Promise<Map<string, TopNicheRow[]>> {
  const prisma = getPrisma();
  const results = await prisma.$queryRawUnsafe<
    Array<{ sequence_label: string; niche: string; count: number; total: number }>
  >(
    `
    WITH sequence_first_touch AS (
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sequence as sequence_label
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts < $2::timestamptz
        AND sequence IS NOT NULL
        AND sequence != ''
      ORDER BY conversation_id, event_ts ASC
    ),
    conversations_with_niche AS (
      SELECT 
        sft.sequence_label,
        cs.qualification_niche as niche
      FROM sequence_first_touch sft
      JOIN conversation_state cs ON cs.conversation_id = sft.conversation_id
      WHERE cs.qualification_niche IS NOT NULL
        AND cs.qualification_niche != ''
    ),
    niche_counts AS (
      SELECT
        sequence_label,
        niche,
        COUNT(*)::int as count
      FROM conversations_with_niche
      GROUP BY sequence_label, niche
    ),
    ranked AS (
      SELECT
        sequence_label,
        niche,
        count,
        SUM(count) OVER (PARTITION BY sequence_label)::int AS total,
        ROW_NUMBER() OVER (PARTITION BY sequence_label ORDER BY count DESC, niche ASC) AS rank
      FROM niche_counts
    )
    SELECT 
      sequence_label,
      niche,
      count,
      total
    FROM ranked
    WHERE rank <= 5
    ORDER BY sequence_label ASC, count DESC, niche ASC
    `,
    from,
    to,
  );

  const topNichesBySequence = new Map<string, TopNicheRow[]>();
  for (const row of results) {
    const items = topNichesBySequence.get(row.sequence_label) ?? [];
    items.push({
      niche: row.niche,
      count: Number(row.count),
      pct: Number(row.total) > 0 ? (Number(row.count) / Number(row.total)) * 100 : 0,
    });
    topNichesBySequence.set(row.sequence_label, items);
  }
  return topNichesBySequence;
}
