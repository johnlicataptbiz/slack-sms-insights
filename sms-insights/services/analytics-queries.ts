import { getPrismaClient } from "./prisma.js";
import type { Logger } from "pino";

/**
 * Analytics Queries — Historical trend data for reporting and dashboards
 * Retrieves aggregated metrics for SMS performance, team efficiency, and conversions
 */

interface TrendDataPoint {
  date: string;
  value: number;
  label: string;
}

interface ConversionTrend {
  date: string;
  bookedCalls: number;
  conversations: number;
  conversionRate: number;
}

interface TeamPerformanceTrend {
  date: string;
  avgResponseTime: number;
  totalMessages: number;
  activeSetters: number;
}

interface SLAMetricsTrend {
  date: string;
  avgFirstResponse: number;
  avgResolution: number;
  slaCompliance: number;
}

/**
 * Get conversion trend data for last N days
 * Used for: Conversion funnel charts, forecasting, performance analysis
 */
export const getConversionTrends = async (
  days: number = 30,
  logger?: Logger,
): Promise<ConversionTrend[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const conversationCounts = await prisma.$queryRawUnsafe<
      Array<{ date: string; count: bigint }>
    >(
      `
      SELECT 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        COUNT(DISTINCT c.id) as count
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date DESC
      `,
      [fromDate],
    );

    const bookedCallCounts = await prisma.$queryRawUnsafe<
      Array<{ date: string; count: bigint }>
    >(
      `
      SELECT 
        DATE(bc.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        COUNT(DISTINCT bc.id) as count
      FROM booked_calls bc
      WHERE bc.created_at >= $1
      GROUP BY DATE(bc.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date DESC
      `,
      [fromDate],
    );

    // Build a map of conversions and booked calls by date
    const convMap = new Map<string, number>();
    const bookedMap = new Map<string, number>();

    conversationCounts.forEach((row) => {
      convMap.set(row.date, Number(row.count));
    });

    bookedCallCounts.forEach((row) => {
      bookedMap.set(row.date, Number(row.count));
    });

    // Merge and calculate conversion rates
    const trends: ConversionTrend[] = [];
    const allDates = new Set([...convMap.keys(), ...bookedMap.keys()]);

    for (const date of Array.from(allDates).sort().reverse()) {
      const conversations = convMap.get(date) || 0;
      const bookedCalls = bookedMap.get(date) || 0;
      const conversionRate =
        conversations > 0 ? (bookedCalls / conversations) * 100 : 0;

      trends.push({
        date,
        bookedCalls,
        conversations,
        conversionRate: Math.round(conversionRate * 100) / 100,
      });
    }

    return trends;
  } catch (error) {
    logger?.error(
      `[analytics-queries] getConversionTrends failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get team performance trends for last N days
 * Used for: Setter performance tracking, team efficiency reports
 */
export const getTeamPerformanceTrends = async (
  days: number = 30,
  logger?: Logger,
): Promise<TeamPerformanceTrend[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const data = await prisma.$queryRawUnsafe<
      Array<{
        date: string;
        avg_response_time: number | null;
        total_messages: bigint;
        active_setters: bigint;
      }>
    >(
      `
      SELECT 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))::int as avg_response_time,
        COUNT(DISTINCT e.id) as total_messages,
        COUNT(DISTINCT c.current_rep_id) FILTER (WHERE c.current_rep_id IS NOT NULL) as active_setters
      FROM conversations c
      LEFT JOIN sms_events e ON e.conversation_id = c.id AND e.direction = 'outbound'
      WHERE c.created_at >= $1
      GROUP BY DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date DESC
      `,
      [fromDate],
    );

    return data.map((row) => ({
      date: row.date,
      avgResponseTime: row.avg_response_time || 0,
      totalMessages: Number(row.total_messages),
      activeSetters: Number(row.active_setters),
    }));
  } catch (error) {
    logger?.error(
      `[analytics-queries] getTeamPerformanceTrends failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get SLA compliance trends for last N days
 * Used for: Service level reporting, compliance tracking, quality metrics
 */
export const getSLATrends = async (
  days: number = 30,
  logger?: Logger,
): Promise<SLAMetricsTrend[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const data = await prisma.$queryRawUnsafe<
      Array<{
        date: string;
        avg_first_response: number | null;
        avg_resolution: number | null;
        compliance_count: bigint;
        total_count: bigint;
      }>
    >(
      `
      SELECT 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))::int as avg_first_response,
        AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)))::int as avg_resolution,
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)) <= 3600
        ) as compliance_count,
        COUNT(*) as total_count
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date DESC
      `,
      [fromDate],
    );

    return data.map((row) => ({
      date: row.date,
      avgFirstResponse: Math.round(Number(row.avg_first_response) || 0),
      avgResolution: Math.round(Number(row.avg_resolution) || 0),
      slaCompliance:
        Number(row.total_count) > 0
          ? Math.round(
              (Number(row.compliance_count) / Number(row.total_count)) * 100,
            )
          : 0,
    }));
  } catch (error) {
    logger?.error(
      `[analytics-queries] getSLATrends failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get workload metrics for current week
 * Used for: Weekly planning, resource allocation, capacity analysis
 */
export const getWeeklyWorkload = async (
  logger?: Logger,
): Promise<TrendDataPoint[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);

    const data = await prisma.$queryRawUnsafe<
      Array<{ date: string; open_count: bigint; overdue_count: bigint }>
    >(
      `
      SELECT 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        COUNT(*) FILTER (WHERE c.status = 'open') as open_count,
        COUNT(*) FILTER (WHERE c.status = 'open' AND NOW() - c.last_touch_at > INTERVAL '48 hours') as overdue_count
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date ASC
      `,
      [fromDate],
    );

    return data.map((row) => ({
      date: row.date,
      value: Number(row.open_count),
      label: `${row.open_count} open (${row.overdue_count} overdue)`,
    }));
  } catch (error) {
    logger?.error(
      `[analytics-queries] getWeeklyWorkload failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get lead scoring distribution (e.g., qual vs unqual)
 * Used for: Lead quality tracking, qualification metrics
 */
export const getLeadQualificationTrends = async (
  days: number = 30,
  logger?: Logger,
): Promise<TrendDataPoint[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const data = await prisma.$queryRawUnsafe<
      Array<{ date: string; qual: bigint; unqual: bigint }>
    >(
      `
      SELECT 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as date,
        COUNT(*) FILTER (WHERE c.lead_score >= 70) as qual,
        COUNT(*) FILTER (WHERE c.lead_score < 70) as unqual
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
      ORDER BY date DESC
      `,
      [fromDate],
    );

    return data.map((row) => ({
      date: row.date,
      value: Number(row.qual),
      label: `Qual: ${row.qual}, Unqual: ${row.unqual}`,
    }));
  } catch (error) {
    logger?.error(
      `[analytics-queries] getLeadQualificationTrends failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get setter performance breakdown (aggregate stats per setter)
 * Used for: Leaderboard, individual performance tracking
 */
export const getSetterPerformance = async (
  days: number = 30,
  logger?: Logger,
): Promise<
  Array<{
    setterId: string;
    setterName: string;
    bookedCalls: number;
    totalConversations: number;
    conversionRate: number;
    avgResponseTime: number;
  }>
> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const data = await prisma.$queryRawUnsafe<
      Array<{
        setter_id: string;
        setter_name: string;
        booked_calls: bigint;
        total_conversations: bigint;
        avg_response_time: number | null;
      }>
    >(
      `
      SELECT 
        c.current_rep_id as setter_id,
        c.current_rep_name as setter_name,
        COUNT(DISTINCT bc.id) as booked_calls,
        COUNT(DISTINCT c.id) as total_conversations,
        AVG(EXTRACT(EPOCH FROM (c.first_reply_at - c.created_at)))::int as avg_response_time
      FROM conversations c
      LEFT JOIN booked_calls bc ON bc.conversation_id = c.id
      WHERE c.created_at >= $1 AND c.current_rep_id IS NOT NULL
      GROUP BY c.current_rep_id, c.current_rep_name
      ORDER BY booked_calls DESC
      `,
      [fromDate],
    );

    return data.map((row) => {
      const totalConversations = Number(row.total_conversations);
      const bookedCalls = Number(row.booked_calls);

      return {
        setterId: row.setter_id,
        setterName: row.setter_name,
        bookedCalls,
        totalConversations,
        conversionRate:
          totalConversations > 0
            ? Math.round((bookedCalls / totalConversations) * 100 * 100) / 100
            : 0,
        avgResponseTime: row.avg_response_time || 0,
      };
    });
  } catch (error) {
    logger?.error(
      `[analytics-queries] getSetterPerformance failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

/**
 * Get hourly distribution of incoming conversations
 * Used for: Staffing analysis, peak hour identification
 */
export const getHourlyDistribution = async (
  days: number = 7,
  logger?: Logger,
): Promise<TrendDataPoint[]> => {
  try {
    const prisma = getPrismaClient();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const data = await prisma.$queryRawUnsafe<
      Array<{ hour: number; count: bigint }>
    >(
      `
      SELECT 
        EXTRACT(HOUR FROM c.created_at AT TIME ZONE 'America/Chicago')::int as hour,
        COUNT(*) as count
      FROM conversations c
      WHERE c.created_at >= $1
      GROUP BY EXTRACT(HOUR FROM c.created_at AT TIME ZONE 'America/Chicago')
      ORDER BY hour ASC
      `,
      [fromDate],
    );

    return data.map((row) => ({
      date: `${String(row.hour).padStart(2, "0")}:00`,
      value: Number(row.count),
      label: `${row.hour}:00 CT`,
    }));
  } catch (error) {
    logger?.error(
      `[analytics-queries] getHourlyDistribution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};
