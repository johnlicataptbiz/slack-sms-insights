import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

export type QualificationMetric = {
  count: number;
  pct: number;
  sampleQuote: string | null;
};

export type SequenceQualificationBreakdown = {
  sequenceLabel: string;
  totalConversations: number;
  // Employment status
  fullTime: QualificationMetric;
  partTime: QualificationMetric;
  unknownEmployment: QualificationMetric;
  // Revenue mix
  mostlyCash: QualificationMetric;
  mostlyInsurance: QualificationMetric;
  balancedMix: QualificationMetric;
  unknownRevenue: QualificationMetric;
  // Coaching interest
  highInterest: QualificationMetric;
  mediumInterest: QualificationMetric;
  lowInterest: QualificationMetric;
  unknownInterest: QualificationMetric;
  // Niches
  topNiches: Array<{ niche: string; count: number; pct: number }>;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

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
  const pool = getDbOrThrow();

  logger?.debug?.('[sequence-qualification] Building breakdown', { from, to, timezone });

  const result = await pool.query<{
    sequence_label: string;
    total_conversations: number;
    full_time_count: number;
    part_time_count: number;
    unknown_employment_count: number;
    mostly_cash_count: number;
    mostly_insurance_count: number;
    balanced_mix_count: number;
    unknown_revenue_count: number;
    high_interest_count: number;
    medium_interest_count: number;
    low_interest_count: number;
    unknown_interest_count: number;
  }>(
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
        cs.qualification_coaching_interest,
        cs.qualification_niche
      FROM sequence_first_touch sft
      JOIN conversation_state cs ON cs.conversation_id = sft.conversation_id
      WHERE cs.updated_at >= $1::timestamptz
        AND cs.updated_at < $2::timestamptz
    )
    SELECT 
      sequence_label,
      COUNT(*) as total_conversations,
      COUNT(*) FILTER (WHERE qualification_full_or_part_time = 'full_time') as full_time_count,
      COUNT(*) FILTER (WHERE qualification_full_or_part_time = 'part_time') as part_time_count,
      COUNT(*) FILTER (WHERE qualification_full_or_part_time = 'unknown') as unknown_employment_count,
      COUNT(*) FILTER (WHERE qualification_revenue_mix = 'mostly_cash') as mostly_cash_count,
      COUNT(*) FILTER (WHERE qualification_revenue_mix = 'mostly_insurance') as mostly_insurance_count,
      COUNT(*) FILTER (WHERE qualification_revenue_mix = 'balanced') as balanced_mix_count,
      COUNT(*) FILTER (WHERE qualification_revenue_mix = 'unknown') as unknown_revenue_count,
      COUNT(*) FILTER (WHERE qualification_coaching_interest = 'high') as high_interest_count,
      COUNT(*) FILTER (WHERE qualification_coaching_interest = 'medium') as medium_interest_count,
      COUNT(*) FILTER (WHERE qualification_coaching_interest = 'low') as low_interest_count,
      COUNT(*) FILTER (WHERE qualification_coaching_interest = 'unknown') as unknown_interest_count
    FROM conversations_with_qualification
    GROUP BY sequence_label
    HAVING COUNT(*) >= $3
    ORDER BY total_conversations DESC
    `,
    [from, to, minConversations],
  );

  // Fetch sample quotes for each category
  const breakdowns: SequenceQualificationBreakdown[] = [];

  for (const row of result.rows) {
    const total = Number(row.total_conversations);

    // Get sample quotes for each qualification category
    const [
      fullTimeQuote,
      partTimeQuote,
      cashQuote,
      insuranceQuote,
      balancedQuote,
      highInterestQuote,
      mediumInterestQuote,
      lowInterestQuote,
      topNiches,
    ] = await Promise.all([
      fetchSampleQuote(pool, row.sequence_label, 'full_time', 'qualification_full_or_part_time', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'part_time', 'qualification_full_or_part_time', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'mostly_cash', 'qualification_revenue_mix', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'mostly_insurance', 'qualification_revenue_mix', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'balanced', 'qualification_revenue_mix', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'high', 'qualification_coaching_interest', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'medium', 'qualification_coaching_interest', from, to),
      fetchSampleQuote(pool, row.sequence_label, 'low', 'qualification_coaching_interest', from, to),
      fetchTopNiches(pool, row.sequence_label, from, to),
    ]);

    breakdowns.push({
      sequenceLabel: row.sequence_label,
      totalConversations: total,
      fullTime: {
        count: Number(row.full_time_count),
        pct: (Number(row.full_time_count) / total) * 100,
        sampleQuote: fullTimeQuote,
      },
      partTime: {
        count: Number(row.part_time_count),
        pct: (Number(row.part_time_count) / total) * 100,
        sampleQuote: partTimeQuote,
      },
      unknownEmployment: {
        count: Number(row.unknown_employment_count),
        pct: (Number(row.unknown_employment_count) / total) * 100,
        sampleQuote: null,
      },
      mostlyCash: {
        count: Number(row.mostly_cash_count),
        pct: (Number(row.mostly_cash_count) / total) * 100,
        sampleQuote: cashQuote,
      },
      mostlyInsurance: {
        count: Number(row.mostly_insurance_count),
        pct: (Number(row.mostly_insurance_count) / total) * 100,
        sampleQuote: insuranceQuote,
      },
      balancedMix: {
        count: Number(row.balanced_mix_count),
        pct: (Number(row.balanced_mix_count) / total) * 100,
        sampleQuote: balancedQuote,
      },
      unknownRevenue: {
        count: Number(row.unknown_revenue_count),
        pct: (Number(row.unknown_revenue_count) / total) * 100,
        sampleQuote: null,
      },
      highInterest: {
        count: Number(row.high_interest_count),
        pct: (Number(row.high_interest_count) / total) * 100,
        sampleQuote: highInterestQuote,
      },
      mediumInterest: {
        count: Number(row.medium_interest_count),
        pct: (Number(row.medium_interest_count) / total) * 100,
        sampleQuote: mediumInterestQuote,
      },
      lowInterest: {
        count: Number(row.low_interest_count),
        pct: (Number(row.low_interest_count) / total) * 100,
        sampleQuote: lowInterestQuote,
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
async function fetchSampleQuote(
  pool: Pool,
  sequenceLabel: string,
  value: string,
  column: string,
  from: string,
  to: string,
): Promise<string | null> {
  const result = await pool.query<{ body: string }>(
    `
    WITH sequence_first_touch AS (
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sequence as sequence_label
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts < $2::timestamptz
        AND sequence = $3
      ORDER BY conversation_id, event_ts ASC
    )
    SELECT se.body
    FROM sequence_first_touch sft
    JOIN conversation_state cs ON cs.conversation_id = sft.conversation_id
    JOIN sms_events se ON se.conversation_id = sft.conversation_id
    WHERE cs.${column} = $4
      AND se.direction = 'inbound'
      AND se.body IS NOT NULL
      AND se.body != ''
    ORDER BY se.event_ts DESC
    LIMIT 1
    `,
    [from, to, sequenceLabel, value],
  );

  if (result.rows.length === 0) return null;

  // Clean up the quote - truncate and remove newlines
  const quote = result.rows[0].body.replace(/\n/g, ' ').trim();
  return quote.length > 120 ? `${quote.slice(0, 117)}...` : quote;
}

/**
 * Fetch top niches mentioned for a sequence.
 */
async function fetchTopNiches(
  pool: Pool,
  sequenceLabel: string,
  from: string,
  to: string,
): Promise<Array<{ niche: string; count: number; pct: number }>> {
  const result = await pool.query<{ niche: string; count: string }>(
    `
    WITH sequence_first_touch AS (
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sequence as sequence_label
      FROM sms_events
      WHERE direction = 'outbound'
        AND event_ts >= $1::timestamptz
        AND event_ts < $2::timestamptz
        AND sequence = $3
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
    )
    SELECT 
      niche,
      COUNT(*) as count
    FROM conversations_with_niche
    GROUP BY niche
    ORDER BY count DESC
    LIMIT 5
    `,
    [from, to, sequenceLabel],
  );

  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);

  return result.rows.map((row) => ({
    niche: row.niche,
    count: Number(row.count),
    pct: (Number(row.count) / total) * 100,
  }));
}
