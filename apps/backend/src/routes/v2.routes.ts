import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../../services/logger.js';

// Import services
import { getSalesMetricsSummary } from '../../services/sales-metrics.js';
import { getInsightsSummary } from '../../services/insights-summary.js';
import { listInboxConversations } from '../../services/inbox-store.js';
import { listSendLineOptions } from '../../services/send-line-catalog.js';
import { listMessageTemplates } from '../../services/inbox-store.js';
import { getDailyRuns, getChannelsWithRuns } from '../../services/daily-run-logger.js';
import { getSequencesDeep } from '../../services/sequences-deep.js';
import { getSequenceKpis } from '../../services/sequence-kpis.js';
import { getAttributionLagStatus } from '../../services/attribution-health.js';
import {
  listOpenAttributionReviewItems,
  listUnresolvedAttributions,
  listSequenceFunnelDaily,
  listAttributionMethodDaily,
  listRepResponseDaily,
} from '../../services/attribution-review-queue.js';
import { buildSequenceQualificationBreakdown } from '../../services/sequence-qualification-analytics.js';
import { resolveMetricsRange } from '../../services/time-range.js';

const router = Router();

// Error wrapper for consistent error handling
const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// ─── Insights Endpoints ────────────────────────────────────────────────────

/**
 * GET /api/v2/insights/summary
 * Returns KPI summary for a given time range
 */
router.get('/insights/summary', asyncHandler(async (req, res) => {
  const { range = '7d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await getInsightsSummary(
      { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
      logger.app,
    );
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch insights summary', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch insights summary',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sales-metrics
 * Returns sales metrics for a given time range
 */
router.get('/sales-metrics', asyncHandler(async (req, res) => {
  const { range = '7d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await getSalesMetricsSummary(
      { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
      logger.app,
    );
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch sales metrics', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales metrics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Inbox Endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/v2/inbox/conversations
 * Returns list of conversations with optional filtering
 */
router.get('/inbox/conversations', asyncHandler(async (req, res) => {
  const { status, repId, needsReplyOnly = 'false', search, limit = '50', offset = '0' } = req.query;

  try {
    const data = await listInboxConversations(
      {
        status: status ? (status as 'open' | 'closed' | 'dnc') : undefined,
        repId: repId ? String(repId) : undefined,
        needsReplyOnly: needsReplyOnly === 'true',
        search: search ? String(search) : undefined,
        limit: Math.min(Number(limit) || 50, 100),
        offset: Number(offset) || 0,
      },
      logger.app,
    );

    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch inbox conversations', { error, status, repId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox conversations',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/inbox/send-config
 * Returns available send lines and configuration
 */
router.get('/inbox/send-config', asyncHandler(async (req, res) => {
  try {
    const data = listSendLineOptions();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch inbox send config', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox send config',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/inbox/templates
 * Returns available message templates
 */
router.get('/inbox/templates', asyncHandler(async (req, res) => {
  try {
    const data = await listMessageTemplates(logger.app);
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch inbox templates', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox templates',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Runs Endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/v2/runs
 * Returns daily automation runs
 */
router.get('/runs', asyncHandler(async (req, res) => {
  const { daysBack = '7', channelId, limit = '50', offset = '0' } = req.query;

  try {
    const data = await getDailyRuns(
      {
        daysBack: Number(daysBack) || 7,
        channelId: channelId ? String(channelId) : undefined,
        limit: Math.min(Number(limit) || 50, 100),
        offset: Number(offset) || 0,
      },
      logger.app,
    );

    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch runs', { error, daysBack });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch runs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/channels
 * Returns available channels
 */
router.get('/channels', asyncHandler(async (req, res) => {
  try {
    const data = await getChannelsWithRuns(logger.app);
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch channels', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Sequences Endpoints ───────────────────────────────────────────────────

/**
 * GET /api/v2/sequences/deep
 * Returns deep sequence analytics
 */
router.get('/sequences/deep', asyncHandler(async (req, res) => {
  const { range = '30d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await getSequencesDeep(
      { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
      logger.app,
    );
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch sequences deep', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences deep',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sequences/funnel
 * Returns sequence funnel analysis
 */
router.get('/sequences/funnel', asyncHandler(async (req, res) => {
  const { range = '30d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await listSequenceFunnelDaily({
      from: resolved.from,
      to: resolved.to,
    });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch sequences funnel', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences funnel',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/sequences/qualification
 * Returns sequence qualification analysis
 */
router.get('/sequences/qualification', asyncHandler(async (req, res) => {
  const { range = '30d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await buildSequenceQualificationBreakdown({
      from: resolved.from.toISOString(),
      to: resolved.to.toISOString(),
      timezone: resolved.timeZone,
      logger: logger.app,
    });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch sequences qualification', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sequences qualification',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Attribution Endpoints ─────────────────────────────────────────────────

/**
 * GET /api/v2/attribution/health
 * Returns attribution system health
 */
router.get('/attribution/health', asyncHandler(async (req, res) => {
  try {
    const data = await getAttributionLagStatus();
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch attribution health', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution health',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/methods
 * Returns available attribution methods
 */
router.get('/attribution/methods', asyncHandler(async (req, res) => {
  const { range = '30d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await listAttributionMethodDaily({
      from: resolved.from,
      to: resolved.to,
    });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch attribution methods', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution methods',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/review-queue
 * Returns attribution review queue
 */
router.get('/attribution/review-queue', asyncHandler(async (req, res) => {
  const { limit = '50' } = req.query;

  try {
    const data = await listOpenAttributionReviewItems(Math.min(Number(limit) || 50, 100));
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch attribution review queue', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution review queue',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

/**
 * GET /api/v2/attribution/unresolved
 * Returns unresolved attribution items
 */
router.get('/attribution/unresolved', asyncHandler(async (req, res) => {
  const { limit = '50' } = req.query;

  try {
    const data = await listUnresolvedAttributions(Math.min(Number(limit) || 50, 100));
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: 'America/Chicago',
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch attribution unresolved', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution unresolved',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

// ─── Reps Endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/v2/reps/response
 * Returns rep response metrics
 */
router.get('/reps/response', asyncHandler(async (req, res) => {
  const { range = '7d', tz } = req.query;

  try {
    const resolved = resolveMetricsRange({ range: String(range), tz: tz ? String(tz) : null });
    const data = await listRepResponseDaily({
      from: resolved.from,
      to: resolved.to,
    });
    res.status(200).json({
      success: true,
      data,
      meta: {
        schemaVersion: '2026.1',
        generatedAt: new Date().toISOString(),
        timeZone: resolved.timeZone,
      },
    });
  } catch (error) {
    logger.app.error('Failed to fetch reps response', { error, range });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reps response',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}));

export default router;
