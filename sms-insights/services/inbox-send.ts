import { randomUUID } from 'node:crypto';
import type { Logger } from '@slack/bolt';
import { sendAlowareSms } from './aloware-client.js';
import type { ConversationRow } from './conversation-projector.js';
import { upsertConversationFromEvent } from './conversation-projector.js';
import type { InboxContactProfileRow } from './inbox-contact-profiles.js';
import {
  getConversationState,
  getSendAttemptByIdempotency,
  type InsertSendAttemptInput,
  reserveSendAttemptIdempotency,
  insertSendAttempt,
  type SendAttemptRow,
} from './inbox-store.js';
import { insertSmsEvent, linkSmsEventToConversation, type SmsEventRow } from './sms-event-store.js';
import { resolveNeedsReplyOnOutbound } from './work-item-engine.js';

const normalizeDigits = (value: string): string => value.replace(/\D/g, '');

const getAllowedSenderIds = (): Set<string> => {
  return new Set(
    (process.env.ALOWARE_SEND_ALLOWED_REP_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
};

const getAllowedSenderEmails = (): Set<string> => {
  return new Set(
    (process.env.ALOWARE_SEND_ALLOWED_REP_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
};

const evaluateAllowlist = (senderUserId?: string | null, senderEmail?: string | null) => {
  const allowedIds = getAllowedSenderIds();
  const allowedEmails = getAllowedSenderEmails();

  if (allowedIds.size === 0 && allowedEmails.size === 0) {
    return {
      allowed: true,
      reason: 'allowlist disabled',
    };
  }

  const id = (senderUserId || '').trim();
  const email = (senderEmail || '').trim().toLowerCase();

  const idAllowed = id.length > 0 && allowedIds.has(id);
  const emailAllowed = email.length > 0 && allowedEmails.has(email);

  return {
    allowed: idAllowed || emailAllowed,
    reason: idAllowed || emailAllowed ? 'sender in allowlist' : 'sender not in allowlist',
  };
};

const inferFromNumber = (lineId?: number | null, fromNumber?: string | null): string | null => {
  if (lineId != null) return null;
  if (!fromNumber) return null;
  const digits = normalizeDigits(fromNumber);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
};

const CALL_LINK_PATTERNS = [
  'calendly.com',
  'cal.com',
  'acuityscheduling.com',
  'oncehub.com',
  'hubspot.com/meetings',
  'tidycal.com',
  'savvycal.com',
  'physicaltherapybiz.com/call-booked',
];

const containsCallLink = (text: string): boolean => {
  const lower = text.toLowerCase();
  return CALL_LINK_PATTERNS.some((pattern) => lower.includes(pattern));
};

type SendContext = {
  conversation: ConversationRow;
  profile: InboxContactProfileRow | null;
  body: string;
  lineId?: number | null;
  fromNumber?: string | null;
  senderUserId?: string | null;
  senderEmail?: string | null;
  senderIdentity?: string | null;
  idempotencyKey?: string | null;
};

export type SendInboxMessageResult = {
  status: 'sent' | 'blocked' | 'failed' | 'duplicate';
  reason: string;
  sendAttempt: SendAttemptRow;
  outboundEvent: SmsEventRow | null;
};

const createSendAttemptRecord = async (
  base: Omit<InsertSendAttemptInput, 'status'>,
  status: InsertSendAttemptInput['status'],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow> => {
  return insertSendAttempt(
    {
      ...base,
      status,
    },
    logger,
  );
};

// Minimum escalation level required to send call links
// Level 1-2: Not qualified enough, should not send call links
// Level 3-4: Qualified leads, can send call links
const MIN_ESCALATION_FOR_CALL_LINK = 3;

const isStageGatingEnabled = (): boolean => {
  const value = (process.env.STAGE_GATING_ENABLED || 'true').trim().toLowerCase();
  return value === 'true' || value === '1';
};

export const sendInboxMessage = async (
  context: SendContext,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendInboxMessageResult> => {
  // Phase 2: Stage Gating (Backend Validation)
  // Check if message contains a call link and validate escalation level
  if (containsCallLink(context.body) && isStageGatingEnabled()) {
    const state = await getConversationState(context.conversation.id, logger);
    const escalationLevel = state?.escalation_level ?? 1;

    if (escalationLevel < MIN_ESCALATION_FOR_CALL_LINK) {
      logger?.warn(
        `Blocking call link send: conversation ${context.conversation.id} has escalation level ${escalationLevel} (min required: ${MIN_ESCALATION_FOR_CALL_LINK})`,
      );

      const sendAttempt = await createSendAttemptRecord(
        {
          conversationId: context.conversation.id,
          messageBody: context.body,
          senderIdentity: context.senderIdentity || context.senderUserId || null,
          lineId: context.lineId != null ? String(context.lineId) : null,
          fromNumber: context.fromNumber ?? null,
          allowlistDecision: false,
          dncDecision: false,
          idempotencyKey: context.idempotencyKey ?? null,
          requestPayload: {
            to: context.profile?.phone || context.conversation.contact_phone,
            escalationLevel,
            blockedReason: 'stage_gating',
          },
          responsePayload: null,
          errorMessage: `Call links require escalation level ${MIN_ESCALATION_FOR_CALL_LINK}+ (current: ${escalationLevel})`,
        },
        'blocked',
        logger,
      );

      return {
        status: 'blocked',
        reason: `stage_gating: escalation level ${escalationLevel} < ${MIN_ESCALATION_FOR_CALL_LINK}`,
        sendAttempt,
        outboundEvent: null,
      };
    }

    logger?.info(
      `Call link allowed for conversation ${context.conversation.id} with escalation level ${escalationLevel}`,
    );
  }

  const toNumber = normalizeDigits(context.profile?.phone || context.conversation.contact_phone || '');
  if (!toNumber) {
    const sendAttempt = await createSendAttemptRecord(
      {
        conversationId: context.conversation.id,
        messageBody: context.body,
        senderIdentity: context.senderIdentity || context.senderUserId || null,
        lineId: context.lineId != null ? String(context.lineId) : null,
        fromNumber: context.fromNumber ?? null,
        allowlistDecision: false,
        dncDecision: true,
        idempotencyKey: context.idempotencyKey ?? null,
        requestPayload: null,
        responsePayload: null,
        errorMessage: 'Missing recipient phone number',
      },
      'blocked',
      logger,
    );

    return {
      status: 'blocked',
      reason: 'missing recipient phone number',
      sendAttempt,
      outboundEvent: null,
    };
  }

  const allowlist = evaluateAllowlist(context.senderUserId, context.senderEmail);
  const dnc = context.conversation.status === 'dnc' || context.profile?.dnc === true;

  const commonAttemptPayload: Omit<InsertSendAttemptInput, 'status'> = {
    conversationId: context.conversation.id,
    messageBody: context.body,
    senderIdentity: context.senderIdentity || context.senderUserId || null,
    lineId: context.lineId != null ? String(context.lineId) : null,
    fromNumber: context.fromNumber ?? null,
    allowlistDecision: allowlist.allowed,
    dncDecision: dnc,
    idempotencyKey: context.idempotencyKey ?? null,
    requestPayload: {
      to: toNumber,
      from: inferFromNumber(context.lineId ?? null, context.fromNumber ?? null),
      lineId: context.lineId ?? null,
      senderUserId: context.senderUserId ?? null,
      senderEmail: context.senderEmail ?? null,
    },
    responsePayload: null,
  };

  if (context.idempotencyKey) {
    const reservation = await reserveSendAttemptIdempotency(
      {
        ...commonAttemptPayload,
        idempotencyKey: context.idempotencyKey,
      },
      logger,
    );
    if (!reservation) {
      const existing = await getSendAttemptByIdempotency(context.conversation.id, context.idempotencyKey, logger);
      if (existing) {
        return {
          status: 'duplicate',
          reason:
            existing.status === 'queued'
              ? 'idempotency key already in progress'
              : 'idempotency key already processed',
          sendAttempt: existing,
          outboundEvent: null,
        };
      }
    }
  }

  if (!allowlist.allowed) {
    const sendAttempt = await createSendAttemptRecord(
      {
        ...commonAttemptPayload,
        errorMessage: allowlist.reason,
      },
      'blocked',
      logger,
    );
    return {
      status: 'blocked',
      reason: allowlist.reason,
      sendAttempt,
      outboundEvent: null,
    };
  }

  if (dnc) {
    const sendAttempt = await createSendAttemptRecord(
      {
        ...commonAttemptPayload,
        errorMessage: 'contact is marked DNC',
      },
      'blocked',
      logger,
    );

    return {
      status: 'blocked',
      reason: 'contact is marked DNC',
      sendAttempt,
      outboundEvent: null,
    };
  }

  try {
    const response = await sendAlowareSms(
      {
        to: toNumber,
        message: context.body,
        lineId: context.lineId ?? undefined,
        from: inferFromNumber(context.lineId ?? null, context.fromNumber ?? null) || undefined,
      },
      logger,
    );

    const sendAttempt = await createSendAttemptRecord(
      {
        ...commonAttemptPayload,
        responsePayload: response,
      },
      'sent',
      logger,
    );

    const outboundEvent = await insertSmsEvent(
      {
        slackTeamId: 'internal',
        slackChannelId: 'aloware-api',
        slackMessageTs: `api-send:${context.idempotencyKey || randomUUID()}`,
        eventTs: new Date(),
        direction: 'outbound',
        contactId: context.conversation.contact_id || context.profile?.contact_id || null,
        contactPhone: toNumber,
        contactName: context.profile?.name || null,
        alowareUser: context.senderIdentity || context.senderUserId || null,
        body: context.body,
        line: context.lineId != null ? String(context.lineId) : context.fromNumber || null,
        sequence: null,
        conversationId: context.conversation.id,
        raw: {
          source: 'aloware_api_send',
          sendAttemptId: sendAttempt.id,
          response,
        },
      },
      logger,
    );

    if (outboundEvent) {
      const projectedConversation = await upsertConversationFromEvent(outboundEvent, logger);
      if (projectedConversation) {
        await linkSmsEventToConversation(outboundEvent.id, projectedConversation.id, logger);
        await resolveNeedsReplyOnOutbound(projectedConversation.id, outboundEvent, logger);
      }
    }

    return {
      status: 'sent',
      reason: 'message sent',
      sendAttempt,
      outboundEvent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const sendAttempt = await createSendAttemptRecord(
      {
        ...commonAttemptPayload,
        responsePayload: {
          error: message,
        },
        errorMessage: message,
      },
      'failed',
      logger,
    );

    return {
      status: 'failed',
      reason: message,
      sendAttempt,
      outboundEvent: null,
    };
  }
};
