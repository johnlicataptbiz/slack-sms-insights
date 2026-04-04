#!/usr/bin/env tsx
/**
 * Backfill SMS Events Analytics Columns
 *
 * This script backfills the new analytics columns for historical SMS events
 * that were recorded before the schema update. It populates fields like:
 * - thread_id: Group messages by conversation thread
 * - delivery_status: Set default status based on direction
 * - ai_classification: Basic classification based on content patterns
 * - sentiment_score: Simple sentiment estimation
 * - is_booking_signal: Detect booking-related keywords
 * - media_urls: Extract from raw JSON if available
 * - link_clicks: Default to 0 for historical data
 *
 * Usage:
 *   npx tsx scripts/backfill-sms-events-analytics.ts [--days 90] [--dry-run]
 *
 * @example
 *   npx tsx scripts/backfill-sms-events-analytics.ts --dry-run
 *   npx tsx scripts/backfill-sms-events-analytics.ts --days 30
 *   npx tsx scripts/backfill-sms-events-analytics.ts --days 90
 */

import { getPrisma } from '../services/prisma.js';

const args = process.argv.slice(2);
const daysParam = args.find((arg) => arg.startsWith('--days='));
const isDryRun = args.includes('--dry-run');

const daysBack = daysParam ? Number.parseInt(daysParam.split('=')[1], 10) : 90;

// Expanded booking signal keywords
const BOOKING_KEYWORDS = [
  'book',
  'schedule',
  'appointment',
  'call',
  'meeting',
  'demo',
  'consultation',
  'calendar',
  'time',
  'available',
  'slot',
  'reserve',
  'confirm',
  'when are you',
  'free time',
  'booking',
  'availability',
  'set up',
  'discuss',
  'talk about',
  'interested in meeting',
  'want to schedule',
];

// Expanded positive sentiment keywords
const POSITIVE_KEYWORDS = [
  'great',
  'awesome',
  'excellent',
  'perfect',
  'thank',
  'thanks',
  'appreciate',
  'love',
  'yes',
  'interested',
  'ready',
  'amazing',
  'fantastic',
  'wonderful',
  'super',
  'cool',
  'nice',
  'good',
  'helpful',
  'excited',
  'looking forward',
  'sounds good',
  'sounds great',
  'absolutely',
  'definitely',
  'sure',
  'happy',
  'pleased',
];

// Expanded negative sentiment keywords
const NEGATIVE_KEYWORDS = [
  'not interested',
  'no thanks',
  'stop',
  'remove',
  'unsubscribe',
  'opt out',
  'dont contact',
  'dont call',
  'angry',
  'upset',
  'terrible',
  'worst',
  'bad',
  'horrible',
  'awful',
  'disappointing',
  'frustrated',
  'annoyed',
  'mad',
  'cancel',
  'not now',
  'later',
  'busy',
  'no time',
  'not possible',
  'not interested right now',
  'leave me alone',
  'go away',
  'not now',
  'never',
];

interface SmsEvent {
  id: string;
  body: string | null;
  direction: string;
  raw: unknown;
  thread_id: string | null;
  delivery_status: string;
  ai_classification: string | null;
  sentiment_score: number | null;
  is_booking_signal: boolean;
  media_urls: unknown;
  link_clicks: number;
  event_ts: Date;
}

interface UpdatePayload {
  thread_id?: string | null;
  delivery_status?: string;
  ai_classification?: string | null;
  sentiment_score?: number | null;
  is_booking_signal?: boolean;
  media_urls?: unknown;
  link_clicks?: number;
}

function classifyMessage(body: string | null): {
  ai_classification: string | null;
  sentiment_score: number | null;
  is_booking_signal: boolean;
} {
  if (!body || body.trim().length === 0) {
    return {
      ai_classification: null,
      sentiment_score: null,
      is_booking_signal: false,
    };
  }

  const lowerBody = body.toLowerCase();

  // Check for booking signals
  const isBookingSignal = BOOKING_KEYWORDS.some((keyword) => lowerBody.includes(keyword));

  // Calculate sentiment score (-1 to 1)
  let sentimentScore = 0;
  let positiveMatches = 0;
  let negativeMatches = 0;

  POSITIVE_KEYWORDS.forEach((keyword) => {
    if (lowerBody.includes(keyword)) {
      positiveMatches++;
    }
  });

  NEGATIVE_KEYWORDS.forEach((keyword) => {
    if (lowerBody.includes(keyword)) {
      negativeMatches++;
    }
  });

  if (positiveMatches > 0 || negativeMatches > 0) {
    sentimentScore = (positiveMatches - negativeMatches) / (positiveMatches + negativeMatches);
    sentimentScore = Math.round(sentimentScore * 1000) / 1000; // Round to 3 decimals
  }

  // Simple AI classification
  let aiClassification: string | null = null;
  if (isBookingSignal) {
    aiClassification = 'booking_intent';
  } else if (negativeMatches > 0) {
    aiClassification = 'opt_out_request';
  } else if (positiveMatches > 0 && lowerBody.includes('?')) {
    aiClassification = 'positive_inquiry';
  } else if (body.trim().length > 100) {
    aiClassification = 'detailed_message';
  } else if (body.trim().length < 10) {
    aiClassification = 'short_response';
  }

  return {
    ai_classification: aiClassification,
    sentiment_score: sentimentScore !== 0 ? sentimentScore : null,
    is_booking_signal: isBookingSignal,
  };
}

function extractMediaUrls(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const rawRecord = raw as Record<string, unknown>;
  const mediaUrls: string[] = [];

  // Try common media URL fields
  const possibleFields = ['mediaUrls', 'media_urls', 'attachments', 'media', 'images'];
  for (const field of possibleFields) {
    const value = rawRecord[field];
    if (Array.isArray(value)) {
      mediaUrls.push(...value.filter((url) => typeof url === 'string' && url.length > 0));
    } else if (typeof value === 'string' && value.length > 0) {
      mediaUrls.push(value);
    }
  }

  return mediaUrls;
}

function generateThreadId(event: SmsEvent): string | null {
  // For now, use conversation_id as thread_id if available
  // In a more sophisticated implementation, this could group related messages
  // For historical data, we'll leave it null and let future messages set it properly
  return null;
}

function determineDeliveryStatus(direction: string): string {
  // Historical data doesn't have delivery tracking, so we set sensible defaults
  if (direction === 'outbound') {
    return 'sent';
  }
  if (direction === 'inbound') {
    return 'delivered';
  }
  return 'sent';
}

async function main() {
  const prisma = getPrisma();
  const logger = {
    info: (msg: string, data?: Record<string, unknown>) => {
      console.log('ℹ️  [INFO]', msg, data ? JSON.stringify(data) : '');
    },
    debug: (msg: string, data?: Record<string, unknown>) => {
      console.log('🔍 [DEBUG]', msg, data ? JSON.stringify(data) : '');
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      console.log('⚠️  [WARN]', msg, data ? JSON.stringify(data) : '');
    },
    error: (msg: string, data?: Record<string, unknown>) => {
      console.error('❌ [ERROR]', msg, data ? JSON.stringify(data) : '');
    },
  };

  console.log('🚀 Starting SMS Events Analytics Backfill');
  console.log(`📅 Days back: ${daysBack}`);
  console.log(`🔍 Dry run: ${isDryRun ? 'YES (no changes will be made)' : 'NO (changes will be applied)'}`);
  console.log('');

  try {
    // Get the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);
    logger.info('Cutoff date', { cutoffDate: cutoffDate.toISOString() });

    // Fetch SMS events that need backfilling using raw query to avoid Prisma validation issues
    const events = await prisma.$queryRaw<Array<{
      id: string;
      body: string | null;
      direction: string;
      raw: unknown;
      thread_id: string | null;
      delivery_status: string | null;
      ai_classification: string | null;
      sentiment_score: number | null;
      is_booking_signal: boolean | null;
      media_urls: unknown;
      link_clicks: number | null;
      event_ts: Date;
    }>>`
      SELECT id, body, direction, raw, thread_id, delivery_status, ai_classification,
             sentiment_score, is_booking_signal, media_urls, link_clicks, event_ts
      FROM sms_events
      WHERE event_ts >= ${cutoffDate}
        AND (thread_id IS NULL
             OR delivery_status IS NULL
             OR ai_classification IS NULL
             OR sentiment_score IS NULL
             OR is_booking_signal IS NULL
             OR media_urls IS NULL)
    `;

    logger.info('Found SMS events needing backfill', { count: events.length });

    if (events.length === 0) {
      console.log('✅ No events need backfilling');
      return;
    }

    // Process events in batches
    const batchSize = 100;
    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const updates: Array<{ id: string; update: UpdatePayload }> = [];

      for (const event of batch) {
        const classification = classifyMessage(event.body);
        const mediaUrls = extractMediaUrls(event.raw);
        const threadId = generateThreadId(event);
        const deliveryStatus = determineDeliveryStatus(event.direction);

        const update: UpdatePayload = {};

        // Only update fields that are null or need correction
        if (event.thread_id === null && threadId !== null) {
          update.thread_id = threadId;
        }

        if (!event.delivery_status || event.delivery_status === 'sent') {
          update.delivery_status = deliveryStatus;
        }

        if (event.ai_classification === null && classification.ai_classification !== null) {
          update.ai_classification = classification.ai_classification;
        }

        if (event.sentiment_score === null && classification.sentiment_score !== null) {
          update.sentiment_score = classification.sentiment_score;
        }

        if (event.is_booking_signal === null || event.is_booking_signal === false) {
          update.is_booking_signal = classification.is_booking_signal;
        }

        if (!event.media_urls || JSON.stringify(event.media_urls) === '[]') {
          update.media_urls = mediaUrls.length > 0 ? mediaUrls : [];
        }

        if (event.link_clicks === null || event.link_clicks === undefined) {
          update.link_clicks = 0;
        }

        // Only add to updates if there are actual changes
        if (Object.keys(update).length > 0) {
          updates.push({ id: event.id, update });
        } else {
          skippedCount++;
        }
      }

      if (updates.length > 0) {
        if (isDryRun) {
          logger.info(`[DRY RUN] Would update ${updates.length} events in this batch`);
          updatedCount += updates.length;
        } else {
            // Execute batch update using raw SQL to avoid Prisma schema validation issues
            for (const { id, update } of updates) {
              const setClauses: string[] = [];
              const values: unknown[] = [];
              let paramIndex = 1;
  
              if (update.thread_id !== undefined) {
                setClauses.push(`thread_id = $${paramIndex++}`);
                values.push(update.thread_id);
              }
              if (update.delivery_status !== undefined) {
                setClauses.push(`delivery_status = $${paramIndex++}`);
                values.push(update.delivery_status);
              }
              if (update.ai_classification !== undefined) {
                setClauses.push(`ai_classification = $${paramIndex++}`);
                values.push(update.ai_classification);
              }
              if (update.sentiment_score !== undefined) {
                setClauses.push(`sentiment_score = $${paramIndex++}`);
                values.push(update.sentiment_score);
              }
              if (update.is_booking_signal !== undefined) {
                setClauses.push(`is_booking_signal = $${paramIndex++}`);
                values.push(update.is_booking_signal);
              }
              if (update.media_urls !== undefined) {
                setClauses.push(`media_urls = $${paramIndex++}::jsonb`);
                values.push(JSON.stringify(update.media_urls));
              }
              if (update.link_clicks !== undefined) {
                setClauses.push(`link_clicks = $${paramIndex++}`);
                values.push(update.link_clicks);
              }
  
              if (setClauses.length > 0) {
                values.push(id);
                await prisma.$executeRawUnsafe(
                  `UPDATE sms_events SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
                  ...values,
                );
              }
            }
  
            updatedCount += updates.length;
            logger.info(`Batch ${Math.floor(i / batchSize) + 1} completed`, {
              updated: updates.length,
              totalSoFar: updatedCount,
            });
          }
      }

      // Small delay to avoid overwhelming the database
      if (!isDryRun) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    console.log('');
    console.log('📊 Backfill Summary:');
    console.log(`   Total events processed: ${events.length}`);
    console.log(`   Events updated: ${updatedCount}`);
    console.log(`   Events skipped (no changes needed): ${skippedCount}`);
    console.log(`   Dry run: ${isDryRun ? 'YES' : 'NO'}`);

    if (!isDryRun) {
      console.log('');
      console.log('✅ SMS Events Analytics backfill completed successfully!');
    } else {
      console.log('');
      console.log('🔍 Dry run complete. Run without --dry-run to apply changes.');
    }
  } catch (error) {
    logger.error('Backfill failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
