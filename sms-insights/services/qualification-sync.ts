import type { Logger } from '@slack/bolt';
import { upsertInboxContactProfile } from './inbox-contact-profiles.js';
import {
  type ConversationStateRow,
  ensureConversationState,
  type InboxMessageRow,
  listMessagesForConversation,
  updateConversationState,
} from './inbox-store.js';
import { inferQualificationStateFromMessages, type QualificationInferenceResult } from './qualification-inference.js';

type SyncQualificationParams = {
  conversationId: string;
  contactKey: string;
  contactId: string | null;
  triggerDirection?: InboxMessageRow['direction'];
  currentState?: ConversationStateRow | null;
  messages?: InboxMessageRow[] | null;
  messageLimit?: number;
};

export type SyncQualificationResult = {
  state: ConversationStateRow | null;
  changed: boolean;
  inference: QualificationInferenceResult | null;
};

export const syncQualificationFromConversationText = async (
  params: SyncQualificationParams,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SyncQualificationResult> => {
  const direction = params.triggerDirection || 'unknown';

  // Real-time inference should react to newly ingested inbound lead messages.
  if (direction !== 'inbound') {
    return {
      state: params.currentState || null,
      changed: false,
      inference: null,
    };
  }

  const fallbackState = params.currentState || (await ensureConversationState(params.conversationId, logger));

  const messages =
    params.messages && params.messages.length > 0
      ? params.messages
      : await listMessagesForConversation(params.conversationId, params.messageLimit || 250, logger);
  if (!messages || messages.length === 0) {
    return {
      state: fallbackState,
      changed: false,
      inference: null,
    };
  }

  const inference = inferQualificationStateFromMessages(fallbackState, messages, logger);
  if (!inference.changed) {
    return {
      state: fallbackState,
      changed: false,
      inference,
    };
  }

  const nextState = await updateConversationState(params.conversationId, inference.updates, logger);

  await upsertInboxContactProfile(
    {
      contactKey: params.contactKey,
      conversationId: params.conversationId,
      contactId: params.contactId,
      niche: nextState.qualification_niche,
      employmentStatus: nextState.qualification_full_or_part_time,
      revenueMixCategory: nextState.qualification_revenue_mix,
      coachingInterest: nextState.qualification_coaching_interest,
    },
    logger,
  );

  logger?.info?.('Auto qualification state updated from conversation text', {
    conversationId: params.conversationId,
    updates: inference.updates,
  });

  return {
    state: nextState,
    changed: true,
    inference,
  };
};
