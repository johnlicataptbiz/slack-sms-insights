import type { Logger } from '@slack/bolt';
import { insertSmsEvent } from './sms-event-store.js';
import { upsertConversationFromEvent } from './conversation-projector.js';
import { upsertInboxContactProfile } from './inbox-contact-profiles.js';
import { enrichContactProfileFromAloware } from './inbox-contact-enrichment.js';
import { updateConversationStatus } from './inbox-store.js';
import { detectOptOutIntent } from './lead-watcher.js';
import { resolveNeedsReplyOnOutbound, upsertNeedsReplyWorkItem } from './work-item-engine.js';
import {
  recordAlowareIngestSeen,
  recordAlowareIngestSuccess,
  recordAlowareIngestSkip,
  maybeLogAlowareIngestWarnings,
} from './aloware-ingest-monitor.js';

/**
 * Aloware webhook payload structure.
 * Aloware sends different payloads per event type. This type covers the common fields
 * and allows arbitrary additional fields for event-specific data.
 */
export type AlowareWebhookPayload = {
  // Common fields across all event types
  event_type?: string;
  event?: string;
  type?: string;

  // Contact fields
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;

  // Communication/SMS fields
  direction?: string;
  body?: string;
  message?: string;
  text?: string;
  line_id?: string | number;
  line_label?: string;
  line_phone_number?: string;
  sequence_id?: string | number;
  sequence_label?: string;
  sequence_name?: string;
  user_id?: string;
  user_name?: string;
  agent_name?: string;
  timestamp?: string;
  created_at?: string;
  event_ts?: string;
  message_id?: string;
  delivery_status?: string;
  media_urls?: string[];
  recording_url?: string;
  transcription?: string;
  call_duration?: number;
  call_status?: string;

  // Arbitrary additional fields
  [key: string]: unknown;
};

export type WebhookIngestResult = {
  status: 'success' | 'skipped' | 'error';
  eventId?: string;
  conversationId?: string;
  reason?: string;
};

const slackTsFromDate = (dateStr?: string): string => {
  if (!dateStr) return `${Date.now() / 1000}`;
  const ts = Date.parse(dateStr);
  if (Number.isFinite(ts)) return `${ts / 1000}`;
  return `${Date.now() / 1000}`;
};

const normalizeDirection = (payload: AlowareWebhookPayload): 'inbound' | 'outbound' | 'unknown' => {
  // Check explicit direction field
  if (payload.direction) {
    const lower = payload.direction.toLowerCase();
    if (lower.includes('inbound') || lower.includes('received') || lower === 'in') return 'inbound';
    if (lower.includes('outbound') || lower.includes('sent') || lower === 'out') return 'outbound';
  }

  // Infer from event type
  const eventType = (payload.event_type || payload.event || payload.type || '').toLowerCase();
  if (eventType.includes('inbound') || eventType.includes('received')) return 'inbound';
  if (eventType.includes('outbound') || eventType.includes('sent')) return 'outbound';

  // Communication events: check for direction indicators
  if (eventType.includes('communication')) {
    if (payload.line_phone_number && payload.contact_phone) {
      // If we have both, it's likely an SMS event - check body for clues
      return 'unknown'; // Will be determined by body analysis
    }
  }

  return 'unknown';
};

const inferDirectionFromBody = (body?: string): 'inbound' | 'outbound' | 'unknown' => {
  if (!body) return 'unknown';
  // Aloware SMS logs in Slack have patterns like "has received an SMS" or "has sent an SMS"
  if (/\b(received|inbound|incoming)\b/i.test(body)) return 'inbound';
  if (/\b(sent|outbound|outgoing)\b/i.test(body)) return 'outbound';
  return 'unknown';
};

const getWebhookChannelId = (): string => {
  return (process.env.ALOWARE_CHANNEL_ID || 'C09ULGH1BEC').trim();
};

const getWebhookSecret = (): string | undefined => {
  return process.env.ALOWARE_WEBHOOK_SECRET?.trim() || undefined;
};

export const validateWebhookSignature = (payload: string, signature?: string): boolean => {
  const secret = getWebhookSecret();
  if (!secret) return true; // Skip validation if no secret configured
  if (!signature) return false;
  return true;
};

/**
 * Extract phone number from any field in the payload.
 */
const extractPhone = (payload: AlowareWebhookPayload): string | null => {
  return (
    payload.contact_phone ||
    payload.phone_number ||
    payload.line_phone_number ||
    null
  );
};

/**
 * Extract contact name from any field in the payload.
 */
const extractName = (payload: AlowareWebhookPayload): string | null => {
  if (payload.contact_name) return payload.contact_name;
  const parts = [payload.first_name, payload.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (payload.user_name) return payload.user_name;
  if (payload.agent_name) return payload.agent_name;
  return null;
};

/**
 * Extract message body from any field in the payload.
 */
const extractBody = (payload: AlowareWebhookPayload): string | null => {
  return (
    payload.body ||
    payload.message ||
    payload.text ||
    payload.transcription ||
    null
  );
};

/**
 * Extract timestamp from any field in the payload.
 */
const extractTimestamp = (payload: AlowareWebhookPayload): string | null => {
  return (
    payload.timestamp ||
    payload.created_at ||
    payload.event_ts ||
    null
  );
};

/**
 * Check if this webhook event is SMS-relevant.
 * Aloware sends many event types; we only care about SMS communications.
 */
const isSmsRelevantEvent = (payload: AlowareWebhookPayload): boolean => {
  const eventType = (payload.event_type || payload.event || payload.type || '').toLowerCase();

  // Direct SMS communication events
  if (eventType.includes('communication')) return true;
  if (eventType.includes('sms')) return true;
  if (eventType.includes('message')) return true;
  if (eventType.includes('text')) return true;

  // If there's a message body and phone number, it's likely SMS
  if (extractBody(payload) && extractPhone(payload)) return true;

  // Contact lifecycle events are not SMS events but may be useful for contact sync
  if (eventType.includes('contact')) return false;
  if (eventType.includes('appointment')) return false;
  if (eventType.includes('call')) return false;
  if (eventType.includes('voicemail')) return false;
  if (eventType.includes('recording')) return false;
  if (eventType.includes('transcription')) return false;
  if (eventType.includes('summarized')) return false;

  // Default: accept if it has message content
  return !!extractBody(payload);
};

export const handleAlowareWebhook = async (
  payload: AlowareWebhookPayload,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<WebhookIngestResult> => {
  recordAlowareIngestSeen();

  const eventType = payload.event_type || payload.event || payload.type || 'unknown';
  logger?.debug?.('Aloware webhook received', { eventType, payloadKeys: Object.keys(payload) });

  // Check if this is an SMS-relevant event
  if (!isSmsRelevantEvent(payload)) {
    recordAlowareIngestSkip({
      reason: 'other_app_post',
      channelId: getWebhookChannelId(),
      text: `Event: ${eventType}`,
    });
    maybeLogAlowareIngestWarnings(logger);
    return { status: 'skipped', reason: `Non-SMS event type: ${eventType}` };
  }

  // Extract normalized fields
  const direction = normalizeDirection(payload);
  const phone = extractPhone(payload);
  const name = extractName(payload);
  const body = extractBody(payload);
  const timestamp = extractTimestamp(payload);

  // Validate we have at least a phone number or contact ID
  const contactId = payload.contact_id ? String(payload.contact_id) : null;
  if (!contactId && !phone) {
    recordAlowareIngestSkip({
      reason: 'missing_contact',
      channelId: getWebhookChannelId(),
      text: body || '',
    });
    maybeLogAlowareIngestWarnings(logger);
    return { status: 'skipped', reason: 'Missing contact info' };
  }

  // If direction is unknown, try to infer from body
  const finalDirection = direction === 'unknown' ? inferDirectionFromBody(body || undefined) : direction;
  if (finalDirection === 'unknown') {
    recordAlowareIngestSkip({
      reason: 'unknown_direction',
      channelId: getWebhookChannelId(),
      text: body || '',
    });
    maybeLogAlowareIngestWarnings(logger);
    return { status: 'skipped', reason: 'Unknown direction' };
  }

  const channelId = getWebhookChannelId();
  const messageTs = slackTsFromDate(timestamp);

  try {
    const eventRow = await insertSmsEvent(
      {
        slackTeamId: 'aloware-webhook',
        slackChannelId: channelId,
        slackMessageTs: messageTs,
        eventTs: timestamp ? new Date(timestamp) : new Date(),
        direction: finalDirection,
        contactId: contactId,
        contactPhone: phone,
        contactName: name,
        alowareUser: payload.user_name || payload.agent_name || null,
        body: body,
        line: payload.line_label || payload.line_phone_number || null,
        sequence: payload.sequence_label || payload.sequence_name || null,
        raw: payload,
      },
      logger,
    );

    if (!eventRow) {
      return { status: 'skipped', reason: 'Event insert returned null' };
    }

    recordAlowareIngestSuccess();

    // Project conversation
    const conversation = await upsertConversationFromEvent(eventRow, logger);
    if (!conversation) {
      return { status: 'success', eventId: eventRow.id, reason: 'No conversation projected' };
    }

    // Upsert contact profile
    await upsertInboxContactProfile(
      {
        contactKey: conversation.contact_key,
        conversationId: conversation.id,
        contactId: eventRow.contact_id,
        name: eventRow.contact_name,
        phone: eventRow.contact_phone,
      },
      logger,
    );

    // Enrich from Aloware API (fire and forget)
    if (eventRow.contact_phone) {
      void enrichContactProfileFromAloware(
        {
          contactKey: conversation.contact_key,
          conversationId: conversation.id,
          phoneNumber: eventRow.contact_phone,
          fallbackName: eventRow.contact_name,
          contactId: eventRow.contact_id,
        },
        logger,
      ).catch((error) => {
        logger?.warn('Contact enrichment failed', error);
      });
    }

    // Handle work items based on direction
    if (eventRow.direction === 'inbound') {
      await upsertNeedsReplyWorkItem(conversation, eventRow, logger);

      if (eventRow.body) {
        const optOut = detectOptOutIntent(eventRow.body);
        if (optOut.isOptOut) {
          logger?.info(`Opt-out detected for conversation ${conversation.id}: matched "${optOut.matchedPattern}"`);
          await updateConversationStatus(conversation.id, 'dnc', logger);
        }
      }
    } else if (eventRow.direction === 'outbound') {
      await resolveNeedsReplyOnOutbound(conversation.id, eventRow, logger);
    }

    return {
      status: 'success',
      eventId: eventRow.id,
      conversationId: conversation.id,
    };
  } catch (error) {
    logger?.error('Aloware webhook ingest failed', error);
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};
