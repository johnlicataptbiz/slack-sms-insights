/**
 * Data Analysis Script for PTBiz SMS Insights
 *
 * Connects to the PostgreSQL database via Prisma and generates
 * a comprehensive analysis report.
 *
 * Usage: npm run analyze:data
 * Requires: DATABASE_URL environment variable
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Prisma client with pg adapter (Prisma 7)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

// Analysis configuration
const ANALYSIS_CONFIG = {
  dateRange: 'last_90_days',
  outputFormat: 'markdown',
  outputPath: join(__dirname, '..', '..', 'docs', 'reports', 'data-analysis-report.md'),
};

/**
 * Main analysis function
 */
async function runAnalysis(): Promise<void> {
  console.log('🔍 Starting data analysis...\n');

  const report: {
    title: string;
    generatedAt: string;
    sections: AnalysisSection[];
  } = {
    title: 'Data Analysis Report - PTBiz SMS Insights',
    generatedAt: new Date().toISOString(),
    sections: [],
  };

  try {
    // 1. Dataset Overview
    report.sections.push(await analyzeDatasetOverview());

    // 2. SMS Events Analysis
    report.sections.push(await analyzeSmsEvents());

    // 3. Conversations Analysis
    report.sections.push(await analyzeConversations());

    // 4. Conversation State & Journey Analysis
    report.sections.push(await analyzeConversationJourney());

    // 5. Rep Performance Analysis
    report.sections.push(await analyzeRepPerformance());

    // 6. Attribution Analysis
    report.sections.push(await analyzeAttribution());

    // 7. Monday.com Sync Analysis
    report.sections.push(await analyzeMondaySync());

    // 8. Draft Suggestions Analysis
    report.sections.push(await analyzeDraftSuggestions());

    // 9. Work Items Analysis
    report.sections.push(await analyzeWorkItems());

    // 10. Key Findings & Recommendations
    report.sections.push(await generateRecommendations(report.sections));

    // Generate output
    const output = generateMarkdownReport(report);

    // Ensure output directory exists
    const outputDir = dirname(ANALYSIS_CONFIG.outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(ANALYSIS_CONFIG.outputPath, output, 'utf-8');

    console.log(`\n✅ Analysis complete! Report saved to: ${ANALYSIS_CONFIG.outputPath}`);
    console.log('\n--- Report Preview ---');
    console.log(output.substring(0, 3000) + '...\n');
  } catch (error: unknown) {
    const err = error as { code?: string; message: string };
    console.error('❌ Analysis failed:', err.message);
    if (err.code === 'P1001') {
      console.error('\nDatabase connection failed. Ensure DATABASE_URL is set correctly.');
      console.error('Run: cd apps/backend && npm run analyze:data');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

interface AnalysisSection {
  title: string;
  content: Record<string, unknown> | unknown[];
}

/**
 * Analyze dataset overview - table sizes and date ranges
 */
async function analyzeDatasetOverview(): Promise<AnalysisSection> {
  console.log('📊 Analyzing dataset overview...');

  const tables = [
    { name: 'sms_events', model: 'sms_events' as const },
    { name: 'conversations', model: 'conversations' as const },
    { name: 'conversation_state', model: 'conversation_state' as const },
    { name: 'conversation_journey', model: 'conversation_journey' as const },
    { name: 'booked_calls', model: 'booked_calls' as const },
    { name: 'booked_call_attribution', model: 'booked_call_attribution' as const },
    { name: 'inbox_contact_profiles', model: 'inbox_contact_profiles' as const },
    { name: 'draft_suggestions', model: 'draft_suggestions' as const },
    { name: 'send_attempts', model: 'send_attempts' as const },
    { name: 'work_items', model: 'work_items' as const },
    { name: 'daily_runs', model: 'daily_runs' as const },
    { name: 'monday_metric_facts', model: 'monday_metric_facts' as const },
    { name: 'lead_attribution', model: 'lead_attribution' as const },
    { name: 'lead_outcomes', model: 'lead_outcomes' as const },
    { name: 'setter_activity', model: 'setter_activity' as const },
  ];

  const tableStats: { name: string; count: number | string }[] = [];
  for (const table of tables) {
    try {
      const count = await prisma[table.model].count();
      tableStats.push({ name: table.name, count });
    } catch {
      tableStats.push({ name: table.name, count: 'ERROR' });
    }
  }

  // Get date ranges for key tables
  let smsDateRange = 'N/A';
  try {
    const smsRange = await prisma.sms_events.findMany({
      orderBy: { event_ts: 'asc' },
      take: 1,
      select: { event_ts: true },
    });
    const smsRangeEnd = await prisma.sms_events.findMany({
      orderBy: { event_ts: 'desc' },
      take: 1,
      select: { event_ts: true },
    });
    if (smsRange.length && smsRangeEnd.length) {
      smsDateRange = `${smsRange[0].event_ts.toISOString().split('T')[0]} to ${smsRangeEnd[0].event_ts.toISOString().split('T')[0]}`;
    }
  } catch {
    /* ignore */
  }

  return {
    title: 'Dataset Overview',
    content: {
      totalTables: tables.length,
      tableStats,
      smsDateRange,
    },
  };
}

/**
 * Analyze SMS events - direction, volume, patterns
 */
async function analyzeSmsEvents(): Promise<AnalysisSection> {
  console.log('📱 Analyzing SMS events...');

  // Direction breakdown
  const directionBreakdown = await prisma.$queryRaw<
    Array<{ direction: string; count: bigint }>
  >`SELECT direction, COUNT(*) as count FROM sms_events GROUP BY direction ORDER BY count DESC`;

  // Daily volume (last 30 days)
  const dailyVolume = await prisma.$queryRaw<
    Array<{ day: Date; direction: string; count: bigint }>
  >`SELECT DATE(event_ts) as day, direction, COUNT(*) as count FROM sms_events WHERE event_ts >= NOW() - INTERVAL '30 days' GROUP BY DATE(event_ts), direction ORDER BY day DESC LIMIT 60`;

  // Top sequences by volume
  const sequenceVolume = await prisma.$queryRaw<
    Array<{
      sequence: string;
      total_messages: bigint;
      unique_contacts: bigint;
      unique_conversations: bigint;
    }>
  >`SELECT sequence, COUNT(*) as total_messages, COUNT(DISTINCT normalized_contact_key) as unique_contacts, COUNT(DISTINCT conversation_id) as unique_conversations FROM sms_events WHERE sequence IS NOT NULL GROUP BY sequence ORDER BY total_messages DESC LIMIT 10`;

  // Top reps by volume
  const repVolume = await prisma.$queryRaw<
    Array<{ rep: string; total_messages: bigint; unique_contacts: bigint }>
  >`SELECT aloware_user as rep, COUNT(*) as total_messages, COUNT(DISTINCT normalized_contact_key) as unique_contacts FROM sms_events WHERE aloware_user IS NOT NULL GROUP BY aloware_user ORDER BY total_messages DESC LIMIT 10`;

  // Average message length
  const avgMessageLength = await prisma.$queryRaw<
    Array<{
      avg_length: number;
      min_length: number;
      max_length: number;
      median_length: number;
    }>
  >`SELECT AVG(LENGTH(body)) as avg_length, MIN(LENGTH(body)) as min_length, MAX(LENGTH(body)) as max_length, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(body)) as median_length FROM sms_events`;

  return {
    title: 'SMS Events Analysis',
    content: {
      directionBreakdown: directionBreakdown.map((r) => ({
        direction: r.direction,
        count: Number(r.count),
      })),
      dailyVolumeSample: dailyVolume.slice(0, 10).map((r) => ({
        day: r.day.toISOString().split('T')[0],
        direction: r.direction,
        count: Number(r.count),
      })),
      topSequences: sequenceVolume.map((r) => ({
        sequence: r.sequence,
        total_messages: Number(r.total_messages),
        unique_contacts: Number(r.unique_contacts),
        unique_conversations: Number(r.unique_conversations),
      })),
      topReps: repVolume.map((r) => ({
        rep: r.rep,
        total_messages: Number(r.total_messages),
        unique_contacts: Number(r.unique_contacts),
      })),
      messageLengthStats: avgMessageLength[0],
    },
  };
}

/**
 * Analyze conversations - status, engagement, patterns
 */
async function analyzeConversations(): Promise<AnalysisSection> {
  console.log('💬 Analyzing conversations...');

  // Status distribution
  const statusDistribution = await prisma.$queryRaw<
    Array<{ status: string; count: bigint }>
  >`SELECT status, COUNT(*) as count FROM conversations GROUP BY status ORDER BY count DESC`;

  // Conversations with unreplied messages
  const unrepliedConversations = await prisma.$queryRaw<
    Array<{
      total_with_unreplied: bigint;
      avg_unreplied: number;
      max_unreplied: number;
    }>
  >`SELECT COUNT(*) as total_with_unreplied, AVG(unreplied_inbound_count) as avg_unreplied, MAX(unreplied_inbound_count) as max_unreplied FROM conversations WHERE unreplied_inbound_count > 0`;

  // Activity by rep
  const repActivity = await prisma.$queryRaw<
    Array<{
      rep: string;
      total_conversations: bigint;
      avg_unreplied: number;
      open_conversations: bigint;
    }>
  >`SELECT current_rep_id as rep, COUNT(*) as total_conversations, AVG(unreplied_inbound_count) as avg_unreplied, COUNT(CASE WHEN status = 'open' THEN 1 END) as open_conversations FROM conversations WHERE current_rep_id IS NOT NULL GROUP BY current_rep_id ORDER BY total_conversations DESC LIMIT 10`;

  // Contact profiles analysis
  const contactProfileStats = await prisma.$queryRaw<
    Array<{
      total_profiles: bigint;
      text_authorized: bigint;
      blocked: bigint;
      dnc: bigint;
      avg_inbound_sms: number;
      avg_outbound_sms: number;
    }>
  >`SELECT COUNT(*) as total_profiles, COUNT(CASE WHEN text_authorized = true THEN 1 END) as text_authorized, COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked, COUNT(CASE WHEN dnc = true THEN 1 END) as dnc, AVG(inbound_sms_count) as avg_inbound_sms, AVG(outbound_sms_count) as avg_outbound_sms FROM inbox_contact_profiles`;

  return {
    title: 'Conversations Analysis',
    content: {
      statusDistribution: statusDistribution.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      unrepliedConversations: unrepliedConversations[0],
      repActivity: repActivity.map((r) => ({
        rep: r.rep,
        total_conversations: Number(r.total_conversations),
        avg_unreplied: Number(r.avg_unreplied),
        open_conversations: Number(r.open_conversations),
      })),
      contactProfileStats: contactProfileStats[0],
    },
  };
}

/**
 * Analyze conversation journey and state
 */
async function analyzeConversationJourney(): Promise<AnalysisSection> {
  console.log('🛤️ Analyzing conversation journeys...');

  // Reply latency distribution
  const replyLatency = await prisma.$queryRaw<
    Array<{
      total_journeys: bigint;
      avg_reply_latency_min: number;
      median_reply_latency_min: number;
      p90_reply_latency_min: number;
      min_reply_latency_min: number;
      max_reply_latency_min: number;
    }>
  >`SELECT COUNT(*) as total_journeys, AVG(reply_latency_minutes) as avg_reply_latency_min, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY reply_latency_minutes) as median_reply_latency_min, PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reply_latency_minutes) as p90_reply_latency_min, MIN(reply_latency_minutes) as min_reply_latency_min, MAX(reply_latency_minutes) as max_reply_latency_min FROM conversation_journey WHERE reply_latency_minutes IS NOT NULL`;

  // Book latency distribution
  const bookLatency = await prisma.$queryRaw<
    Array<{
      total_booked: bigint;
      avg_book_latency_days: number;
      median_book_latency_days: number;
      p90_book_latency_days: number;
    }>
  >`SELECT COUNT(*) as total_booked, AVG(book_latency_days) as avg_book_latency_days, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY book_latency_days) as median_book_latency_days, PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY book_latency_days) as p90_book_latency_days FROM conversation_journey WHERE book_latency_days IS NOT NULL`;

  // Messages before reply/book
  const messagesAnalysis = await prisma.$queryRaw<
    Array<{
      avg_messages_before_reply: number;
      avg_messages_before_book: number;
      median_messages_before_reply: number;
      median_messages_before_book: number;
    }>
  >`SELECT AVG(messages_before_reply) as avg_messages_before_reply, AVG(messages_before_book) as avg_messages_before_book, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY messages_before_reply) as median_messages_before_reply, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY messages_before_book) as median_messages_before_book FROM conversation_journey`;

  // Conversation state distribution
  const cadenceStatus = await prisma.$queryRaw<
    Array<{ cadence_status: string; count: bigint }>
  >`SELECT cadence_status, COUNT(*) as count FROM conversation_state GROUP BY cadence_status ORDER BY count DESC`;

  const qualificationProgress = await prisma.$queryRaw<
    Array<{ qualification_progress_step: number; count: bigint }>
  >`SELECT qualification_progress_step, COUNT(*) as count FROM conversation_state GROUP BY qualification_progress_step ORDER BY qualification_progress_step`;

  return {
    title: 'Conversation Journey & State Analysis',
    content: {
      replyLatency: replyLatency[0],
      bookLatency: bookLatency[0],
      messagesAnalysis: messagesAnalysis[0],
      cadenceStatus: cadenceStatus.map((r) => ({
        cadence_status: r.cadence_status,
        count: Number(r.count),
      })),
      qualificationProgress: qualificationProgress.map((r) => ({
        step: r.qualification_progress_step,
        count: Number(r.count),
      })),
    },
  };
}

/**
 * Analyze rep performance
 */
async function analyzeRepPerformance(): Promise<AnalysisSection> {
  console.log('👥 Analyzing rep performance...');

  // Daily rep response metrics
  const repMetrics = await prisma.$queryRaw<
    Array<{
      rep_id: string;
      days_active: bigint;
      total_leads_contacted: bigint;
      total_leads_replied: bigint;
      total_booked_calls: bigint;
      avg_median_reply_min: number;
      avg_median_book_days: number;
    }>
  >`SELECT rep_id, COUNT(*) as days_active, SUM(new_leads_contacted) as total_leads_contacted, SUM(leads_replied) as total_leads_replied, SUM(booked_calls) as total_booked_calls, AVG(median_reply_time_minutes) as avg_median_reply_min, AVG(median_book_time_days) as avg_median_book_days FROM fact_rep_response_daily GROUP BY rep_id ORDER BY total_booked_calls DESC LIMIT 10`;

  // Reply rate by rep
  const replyRates = await prisma.$queryRaw<
    Array<{
      rep_id: string;
      contacted: bigint;
      replied: bigint;
      reply_rate_pct: number;
    }>
  >`SELECT rep_id, SUM(new_leads_contacted) as contacted, SUM(leads_replied) as replied, CASE WHEN SUM(new_leads_contacted) > 0 THEN ROUND(SUM(leads_replied)::numeric / SUM(new_leads_contacted) * 100, 1) ELSE 0 END as reply_rate_pct FROM fact_rep_response_daily GROUP BY rep_id HAVING SUM(new_leads_contacted) > 0 ORDER BY reply_rate_pct DESC`;

  return {
    title: 'Rep Performance Analysis',
    content: {
      repMetrics: repMetrics.map((r) => ({
        rep_id: r.rep_id,
        days_active: Number(r.days_active),
        total_leads_contacted: Number(r.total_leads_contacted),
        total_leads_replied: Number(r.total_leads_replied),
        total_booked_calls: Number(r.total_booked_calls),
        avg_median_reply_min: Number(r.avg_median_reply_min),
        avg_median_book_days: Number(r.avg_median_book_days),
      })),
      replyRates: replyRates.map((r) => ({
        rep_id: r.rep_id,
        contacted: Number(r.contacted),
        replied: Number(r.replied),
        reply_rate_pct: Number(r.reply_rate_pct),
      })),
    },
  };
}

/**
 * Analyze attribution patterns
 */
async function analyzeAttribution(): Promise<AnalysisSection> {
  console.log('🎯 Analyzing attribution...');

  // Attribution method distribution
  const attributionMethods = await prisma.$queryRaw<
    Array<{
      total_matched: bigint;
      manual_direct: bigint;
      sms_phone_match: bigint;
      fuzzy_match: bigint;
      reply_linked: bigint;
      unattributed: bigint;
    }>
  >`SELECT SUM(matched_calls) as total_matched, SUM(manual_direct_calls) as manual_direct, SUM(sms_phone_match_calls) as sms_phone_match, SUM(fuzzy_match_calls) as fuzzy_match, SUM(reply_linked_calls) as reply_linked, SUM(unattributed_calls) as unattributed FROM fact_attribution_method_daily`;

  // Attribution confidence bands
  const confidenceBands = await prisma.$queryRaw<
    Array<{ attribution_confidence_band: string; count: bigint }>
  >`SELECT attribution_confidence_band, COUNT(*) as count FROM booked_call_attribution WHERE attribution_confidence_band IS NOT NULL GROUP BY attribution_confidence_band ORDER BY count DESC`;

  // Setter attribution
  const setterAttribution = await prisma.$queryRaw<
    Array<{ setter: string; attributed_calls: bigint; canonical_bookings: bigint }>
  >`SELECT setter_final as setter, COUNT(*) as attributed_calls, COUNT(CASE WHEN canonical_booking = true THEN 1 END) as canonical_bookings FROM booked_call_attribution WHERE setter_final IS NOT NULL GROUP BY setter_final ORDER BY attributed_calls DESC LIMIT 10`;

  return {
    title: 'Attribution Analysis',
    content: {
      attributionMethods: attributionMethods[0],
      confidenceBands: confidenceBands.map((r) => ({
        band: r.attribution_confidence_band,
        count: Number(r.count),
      })),
      setterAttribution: setterAttribution.map((r) => ({
        setter: r.setter,
        attributed_calls: Number(r.attributed_calls),
        canonical_bookings: Number(r.canonical_bookings),
      })),
    },
  };
}

/**
 * Analyze Monday.com sync data
 */
async function analyzeMondaySync(): Promise<AnalysisSection> {
  console.log('📋 Analyzing Monday.com sync...');

  // Board registry
  const boards = await prisma.$queryRaw<
    Array<{
      board_label: string;
      board_class: string;
      metric_grain: string;
      include_in_funnel: boolean;
      include_in_exec: boolean;
      active: boolean;
    }>
  >`SELECT board_label, board_class, metric_grain, include_in_funnel, include_in_exec, active FROM monday_board_registry ORDER BY board_label`;

  // Lead outcomes distribution
  const outcomeDistribution = await prisma.$queryRaw<
    Array<{ outcome_label: string; outcome_category: string; count: bigint }>
  >`SELECT outcome_label, outcome_category, COUNT(*) as count FROM lead_outcomes WHERE outcome_label IS NOT NULL GROUP BY outcome_label, outcome_category ORDER BY count DESC LIMIT 15`;

  // Setter activity summary
  const setterSummary = await prisma.$queryRaw<
    Array<{
      setter: string;
      total_activities: bigint;
      booked: bigint;
      closed_won: bigint;
      no_shows: bigint;
      cancelled: bigint;
    }>
  >`SELECT setter, COUNT(*) as total_activities, SUM(CASE WHEN is_booked THEN 1 ELSE 0 END) as booked, SUM(CASE WHEN is_closed_won THEN 1 ELSE 0 END) as closed_won, SUM(CASE WHEN is_no_show THEN 1 ELSE 0 END) as no_shows, SUM(CASE WHEN is_cancelled THEN 1 ELSE 0 END) as cancelled FROM setter_activity WHERE setter IS NOT NULL GROUP BY setter ORDER BY total_activities DESC LIMIT 10`;

  return {
    title: 'Monday.com Sync Analysis',
    content: {
      boards: boards.map((r) => ({
        board_label: r.board_label,
        board_class: r.board_class,
        metric_grain: r.metric_grain,
        include_in_funnel: r.include_in_funnel,
        include_in_exec: r.include_in_exec,
        active: r.active,
      })),
      outcomeDistribution: outcomeDistribution.map((r) => ({
        outcome_label: r.outcome_label,
        outcome_category: r.outcome_category,
        count: Number(r.count),
      })),
      setterSummary: setterSummary.map((r) => ({
        setter: r.setter,
        total_activities: Number(r.total_activities),
        booked: Number(r.booked),
        closed_won: Number(r.closed_won),
        no_shows: Number(r.no_shows),
        cancelled: Number(r.cancelled),
      })),
    },
  };
}

/**
 * Analyze draft suggestions (AI-generated responses)
 */
async function analyzeDraftSuggestions(): Promise<AnalysisSection> {
  console.log('🤖 Analyzing draft suggestions...');

  // Acceptance rate
  const acceptanceRate = await prisma.$queryRaw<
    Array<{
      total_drafts: bigint;
      accepted: bigint;
      edited: bigint;
      rejected: bigint;
      avg_lint_score: number;
      avg_structural_score: number;
    }>
  >`SELECT COUNT(*) as total_drafts, COUNT(CASE WHEN accepted = true THEN 1 END) as accepted, COUNT(CASE WHEN edited = true THEN 1 END) as edited, COUNT(CASE WHEN accepted = false AND rejection_reason IS NOT NULL THEN 1 END) as rejected, AVG(lint_score) as avg_lint_score, AVG(structural_score) as avg_structural_score FROM draft_suggestions`;

  // Rejection reasons
  const rejectionReasons = await prisma.$queryRaw<
    Array<{ rejection_reason: string; count: bigint }>
  >`SELECT rejection_reason, COUNT(*) as count FROM draft_suggestions WHERE rejection_reason IS NOT NULL GROUP BY rejection_reason ORDER BY count DESC LIMIT 10`;

  return {
    title: 'Draft Suggestions (AI) Analysis',
    content: {
      acceptanceRate: acceptanceRate[0],
      rejectionReasons: rejectionReasons.map((r) => ({
        reason: r.rejection_reason,
        count: Number(r.count),
      })),
    },
  };
}

/**
 * Analyze work items (needs_reply, follow_up, hot_lead)
 */
async function analyzeWorkItems(): Promise<AnalysisSection> {
  console.log('📌 Analyzing work items...');

  // Work item distribution
  const workItemDistribution = await prisma.$queryRaw<
    Array<{
      type: string;
      severity: string;
      count: bigint;
      unresolved: bigint;
    }>
  >`SELECT type, severity, COUNT(*) as count, COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as unresolved FROM work_items GROUP BY type, severity ORDER BY count DESC`;

  // Resolution time
  const resolutionTime = await prisma.$queryRaw<
    Array<{
      type: string;
      resolved_count: bigint;
      avg_resolution_hours: number;
      median_resolution_hours: number;
    }>
  >`SELECT type, COUNT(*) as resolved_count, AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as median_resolution_hours FROM work_items WHERE resolved_at IS NOT NULL GROUP BY type`;

  return {
    title: 'Work Items Analysis',
    content: {
      workItemDistribution: workItemDistribution.map((r) => ({
        type: r.type,
        severity: r.severity,
        count: Number(r.count),
        unresolved: Number(r.unresolved),
      })),
      resolutionTime: resolutionTime.map((r) => ({
        type: r.type,
        resolved_count: Number(r.resolved_count),
        avg_resolution_hours: Number(r.avg_resolution_hours),
        median_resolution_hours: Number(r.median_resolution_hours),
      })),
    },
  };
}

/**
 * Generate recommendations based on analysis
 */
async function generateRecommendations(
  sections: AnalysisSection[],
): Promise<AnalysisSection> {
  console.log('💡 Generating recommendations...');

  const recommendations: Array<{
    priority: string;
    category: string;
    finding: string;
    recommendation: string;
  }> = [];

  // Check for high unreplied counts
  const unreplied = sections.find(
    (s) => s.title === 'Conversations Analysis',
  );
  const unrepliedData = unreplied?.content as {
    unrepliedConversations?: { max_unreplied?: number };
  };
  if (unrepliedData?.unrepliedConversations?.max_unreplied && unrepliedData.unrepliedConversations.max_unreplied > 5) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Response Management',
      finding: `Maximum ${unrepliedData.unrepliedConversations.max_unreplied} unreplied messages in a single conversation`,
      recommendation:
        'Implement automated alerts for conversations with 3+ unreplied messages',
    });
  }

  // Check reply latency
  const journey = sections.find(
    (s) => s.title === 'Conversation Journey & State Analysis',
  );
  const journeyData = journey?.content as {
    replyLatency?: { p90_reply_latency_min?: number };
  };
  if (journeyData?.replyLatency?.p90_reply_latency_min && journeyData.replyLatency.p90_reply_latency_min > 60) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Response Time',
      finding: `P90 reply latency is ${Math.round(journeyData.replyLatency.p90_reply_latency_min)} minutes`,
      recommendation:
        'Set SLA targets for response time under 30 minutes during business hours',
    });
  }

  // Check draft acceptance rate
  const drafts = sections.find(
    (s) => s.title === 'Draft Suggestions (AI) Analysis',
  );
  const draftsData = drafts?.content as {
    acceptanceRate?: { total_drafts?: number; accepted?: number };
  };
  if (draftsData?.acceptanceRate && draftsData.acceptanceRate.total_drafts && draftsData.acceptanceRate.total_drafts > 0) {
    const rate = draftsData.acceptanceRate;
    const acceptancePct = ((rate.accepted ?? 0) / rate.total_drafts * 100).toFixed(1);
    recommendations.push({
      priority: 'LOW',
      category: 'AI Assistance',
      finding: `Draft acceptance rate: ${acceptancePct}% (${rate.accepted}/${rate.total_drafts})`,
      recommendation:
        Number(acceptancePct) < 50
          ? 'Review AI prompt templates and exemplar quality to improve draft relevance'
          : 'AI drafts are performing well - consider expanding to more conversation types',
    });
  }

  // Check attribution gaps
  const attribution = sections.find(
    (s) => s.title === 'Attribution Analysis',
  );
  const attrData = attribution?.content as {
    attributionMethods?: { unattributed?: number };
  };
  if (attrData?.attributionMethods?.unattributed && attrData.attributionMethods.unattributed > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Attribution',
      finding: `${attrData.attributionMethods.unattributed} unattributed booked calls`,
      recommendation:
        'Investigate unattributed calls - consider implementing additional matching strategies',
    });
  }

  return {
    title: 'Key Findings & Recommendations',
    content: recommendations,
  };
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: {
  title: string;
  generatedAt: string;
  sections: AnalysisSection[];
}): string {
  const lines: string[] = [
    `# ${report.title}`,
    '',
    `**Generated:** ${report.generatedAt}`,
    '',
    '---',
    '',
  ];

  for (const section of report.sections) {
    lines.push(`## ${section.title}`, '');
    lines.push(...formatSectionContent(section.content));
    lines.push('', '---', '');
  }

  return lines.join('\n');
}

/**
 * Format section content as markdown
 */
function formatSectionContent(
  content: Record<string, unknown> | unknown[],
): string[] {
  const lines: string[] = [];

  if (Array.isArray(content)) {
    // Table format
    if (content.length > 0 && typeof content[0] === 'object' && content[0] !== null) {
      const headers = Object.keys(content[0] as object);
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of content) {
        const values = headers.map((h) => {
          const val = (row as Record<string, unknown>)[h];
          if (val === null || val === undefined) return 'N/A';
          if (typeof val === 'object') return JSON.stringify(val).substring(0, 50);
          return String(val);
        });
        lines.push(`| ${values.join(' | ')} |`);
      }
    }
  } else if (typeof content === 'object' && content !== null) {
    // Key-value format
    for (const [key, value] of Object.entries(content)) {
      const formattedKey = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      if (Array.isArray(value)) {
        lines.push(`### ${formattedKey}`, '');
        lines.push(...formatSectionContent(value));
        lines.push('');
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`**${formattedKey}:**`, '');
        lines.push('```json');
        lines.push(JSON.stringify(value, null, 2));
        lines.push('```', '');
      } else {
        lines.push(`**${formattedKey}:** ${value}`);
      }
    }
  }

  return lines;
}

// Run the analysis
runAnalysis();
