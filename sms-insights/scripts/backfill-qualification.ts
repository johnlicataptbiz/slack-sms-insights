/**
 * Backfill qualification fields AND escalation level from historical SMS events.
 * 
 * Usage:
 *   node --import tsx scripts/backfill-qualification.ts [--limit N] [--dry-run]
 * 
 * Options:
 *   --limit N    Only process N conversations (default: all)
 *   --dry-run    Show what would be updated without making changes
 */

import type { Logger } from '@slack/bolt';
import { initDatabase, initializeSchema } from '../services/db.js';
import { syncQualificationFromConversationText } from '../services/qualification-sync.js';
import { getPool } from '../services/db.js';
import type { CadenceStatus, ConversationStateRow } from '../services/inbox-store.js';
import { listMessagesForConversation, updateConversationState } from '../services/inbox-store.js';
import { classifyEscalationLevel } from '../services/inbox-draft-engine.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

type ConversationWithState = {
  id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  state_id: string | null;
  qualification_full_or_part_time: string | null;
  qualification_niche: string | null;
  qualification_revenue_mix: string | null;
  qualification_coaching_interest: string | null;
  qualification_progress_step: number | null;
  escalation_level: number | null;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { limit, dryRun };
};

const getConversationsNeedingQualification = async (limit?: number): Promise<ConversationWithState[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const client = await pool.connect();
  try {
    // Get conversations that have inbound messages but incomplete qualification
    const query = `
      SELECT 
        c.id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        cs.conversation_id as state_id,
        cs.qualification_full_or_part_time,
        cs.qualification_niche,
        cs.qualification_revenue_mix,
        cs.qualification_coaching_interest,
        cs.qualification_progress_step,
        cs.escalation_level
      FROM conversations c
      LEFT JOIN conversation_state cs ON cs.conversation_id = c.id
      WHERE c.status = 'open'
        AND (
          cs.conversation_id IS NULL
          OR cs.qualification_full_or_part_time = 'unknown'
          OR cs.qualification_niche IS NULL
          OR cs.qualification_revenue_mix = 'unknown'
          OR cs.qualification_coaching_interest = 'unknown'
          OR cs.qualification_progress_step < 4
        )
        AND EXISTS (
          SELECT 1 FROM sms_events se 
          WHERE se.conversation_id = c.id 
            AND se.direction = 'inbound'
            AND se.body IS NOT NULL
            AND LENGTH(se.body) > 10
        )
      ORDER BY c.updated_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await client.query<ConversationWithState>(query);
    return result.rows;
  } finally {
    client.release();
  }
};

const backfillQualification = async (dryRun: boolean, limit?: number) => {
  logger.info('Starting qualification backfill...', { dryRun, limit });

  const conversations = await getConversationsNeedingQualification(limit);
  logger.info(`Found ${conversations.length} conversations needing qualification backfill`);

  if (conversations.length === 0) {
    logger.info('No conversations need qualification backfill');
    return;
  }

  let processed = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const conv of conversations) {
    try {
      // Get messages for this conversation
      const messages = await listMessagesForConversation(conv.id, 250, logger);
      
      if (!messages || messages.length === 0) {
        unchanged++;
        continue;
      }

      const inboundCount = messages.filter(m => m.direction === 'inbound').length;
      if (inboundCount === 0) {
        unchanged++;
        continue;
      }

      if (dryRun) {
        // In dry-run mode, just show what we would do
        const currentState: ConversationStateRow | null = conv.state_id
          ? ({
              conversation_id: conv.id,
              qualification_full_or_part_time: (conv.qualification_full_or_part_time ?? 'unknown') as
                | 'full_time'
                | 'part_time'
                | 'unknown',
              qualification_niche: conv.qualification_niche,
              qualification_revenue_mix: (conv.qualification_revenue_mix ?? 'unknown') as
                | 'mostly_cash'
                | 'mostly_insurance'
                | 'balanced'
                | 'unknown',
              qualification_coaching_interest: (conv.qualification_coaching_interest ?? 'unknown') as
                | 'high'
                | 'medium'
                | 'low'
                | 'unknown',
              qualification_progress_step: conv.qualification_progress_step || 0,
              escalation_level: ((conv.escalation_level || 1) as 1 | 2 | 3 | 4) ?? 1,
              escalation_reason: null,
              escalation_overridden: false,
              last_podcast_sent_at: null,
              next_followup_due_at: null,
              cadence_status: 'idle' as CadenceStatus,
              objection_tags: [],
              guardrail_override_count: 0,
              call_outcome: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } satisfies ConversationStateRow)
          : null;

        const result = await syncQualificationFromConversationText(
          {
            conversationId: conv.id,
            contactKey: conv.contact_key,
            contactId: conv.contact_id,
            triggerDirection: 'inbound',
            currentState,
            messages,
          },
          logger,
        );

        // Also classify escalation level
        const escalationResult = classifyEscalationLevel(messages, currentState);
        const escalationChanged = escalationResult.level !== (currentState?.escalation_level || 1);

        if (result.changed || escalationChanged) {
          updated++;
          logger.info(`[DRY-RUN] Would update conversation ${conv.id}:`, {
            qualificationUpdates: result.inference,
            progressStep: (result as any).snapshot?.progressStep,
            escalationLevel: escalationResult.level,
            escalationReason: escalationResult.reason,
          });
        } else {
          unchanged++;
        }
      } else {
        // Actually perform the update
        const result = await syncQualificationFromConversationText(
          {
            conversationId: conv.id,
            contactKey: conv.contact_key,
            contactId: conv.contact_id,
            triggerDirection: 'inbound',
            messages,
          },
          logger,
        );

        // Also classify and update escalation level
        const currentState = result.state;
        const escalationResult = classifyEscalationLevel(messages, currentState);
        
        if (escalationResult.level !== (currentState?.escalation_level || 1)) {
          await updateConversationState(conv.id, {
            escalationLevel: escalationResult.level,
            escalationReason: escalationResult.reason,
          }, logger);
          logger.info(`Updated escalation for ${conv.id}: ${escalationResult.level} (${escalationResult.reason})`);
        }

        if (result.changed || escalationResult.level !== (currentState?.escalation_level || 1)) {
          updated++;
          logger.info(`Updated conversation ${conv.id}`, {
            progressStep: (result as any).snapshot?.progressStep,
            escalationLevel: escalationResult.level,
          });
        } else {
          unchanged++;
        }
      }

      processed++;

      // Progress logging every 100
      if (processed % 100 === 0) {
        logger.info(`Progress: ${processed}/${conversations.length} processed, ${updated} updated, ${unchanged} unchanged, ${errors} errors`);
      }
    } catch (error) {
      errors++;
      logger.error(`Failed to process conversation ${conv.id}:`, error);
    }
  }

  logger.info('Backfill complete!', {
    processed,
    updated,
    unchanged,
    errors,
    dryRun,
  });

  if (dryRun) {
    logger.info('This was a dry-run. Run without --dry-run to apply changes.');
  }
};

const main = async () => {
  const { limit, dryRun } = parseArgs();

  try {
    await initDatabase(logger);
    await initializeSchema();

    if (!getPool()) {
      throw new Error('Database connection failed');
    }

    await backfillQualification(dryRun, limit);
  } catch (error) {
    logger.error('Backfill failed:', error);
    process.exit(1);
  }
};

main();
