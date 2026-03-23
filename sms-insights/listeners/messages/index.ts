import type { App } from '@slack/bolt';
import {
  maybeLogAlowareIngestWarnings,
  recordAlowareIngestSeen,
  recordAlowareIngestSkip,
  recordAlowareIngestSuccess,
} from '../../services/aloware-ingest-monitor.js';
import { parseAlowareMessage } from '../../services/aloware-parser.js';
import { isAlowareChannel } from '../../services/aloware-policy.js';
import { upsertConversationFromEvent } from '../../services/conversation-projector.js';
import { enrichContactProfileFromAloware } from '../../services/inbox-contact-enrichment.js';
import { upsertInboxContactProfile } from '../../services/inbox-contact-profiles.js';
import { updateConversationStatus } from '../../services/inbox-store.js';
import { detectOptOutIntent } from '../../services/lead-watcher.js';
import { insertSmsEvent } from '../../services/sms-event-store.js';
import { resolveNeedsReplyOnOutbound, upsertNeedsReplyWorkItem } from '../../services/work-item-engine.js';

const slackTsToDate = (ts: string | undefined): Date => {
  // Slack ts is a string like "1700000000.1234"
  const raw = ts || `${Date.now() / 1000}`;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  return new Date();
};

const register = (app: App) => {
  // Ingest Aloware SMS log messages that are copied into Slack.
  app.message(async ({ message, logger }) => {
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const channelId = (message as any).channel as string | undefined;
    if (!isAlowareChannel(channelId)) return;

    // Ignore messages from other Slack apps/bots to avoid processing unrelated content
    // Allow: 1) Aloware bot messages (will be parsed), 2) Daily snapshots, 3) Human messages (no bot_id)
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const botId = (message as any).bot_id as string | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const text = (message as any).text as string | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const attachments = (message as any).attachments as any[] | undefined;
    const firstAttachmentTitle = attachments?.[0]?.title as string | undefined;

    // Count every message that enters the channel handler as "seen" before any early returns,
    // so the skip rate denominator includes all events (not just non-bot ones).
    recordAlowareIngestSeen();

    // If message is from a bot, check if we should skip it
    if (botId) {
      const isDailySnapshot =
        (text?.toLowerCase().includes('daily snapshot') ||
          firstAttachmentTitle?.toLowerCase().includes('daily snapshot')) &&
        (text?.toLowerCase().includes('aloware') || firstAttachmentTitle?.toLowerCase().includes('aloware'));

      if (!isDailySnapshot) {
        // Skip non-Aloware bot messages; they'll be filtered by parse stage anyway but this saves processing
        logger.debug('Skipping message from other app/bot (not Aloware daily snapshot).', { botId });
        recordAlowareIngestSkip({
          reason: 'other_app_post',
          channelId,
          text: `(from bot: ${botId})`,
          attachmentTitle: firstAttachmentTitle,
        });
        maybeLogAlowareIngestWarnings(logger);
        return;
      }
    }

    const parsed = parseAlowareMessage(text || '', attachments);

    // Only ingest messages that look like SMS events.
    if (parsed.direction === 'unknown') {
      recordAlowareIngestSkip({
        reason: 'unknown_direction',
        channelId,
        text,
        attachmentTitle: firstAttachmentTitle,
      });
      maybeLogAlowareIngestWarnings(logger);
      return;
    }
    if (!parsed.contactId && !parsed.contactPhone) {
      recordAlowareIngestSkip({
        reason: 'missing_contact',
        channelId,
        text,
        attachmentTitle: firstAttachmentTitle,
      });
      maybeLogAlowareIngestWarnings(logger);
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const slackTeamId = (message as any).team as string | undefined; // may be undefined in some events
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const slackMessageTs = (message as any).ts as string | undefined;

    if (!channelId || !slackMessageTs) {
      recordAlowareIngestSkip({
        reason: 'missing_channel_or_ts',
        channelId,
        text,
        attachmentTitle: firstAttachmentTitle,
      });
      maybeLogAlowareIngestWarnings(logger);
      return;
    }

    const eventRow = await insertSmsEvent(
      {
        slackTeamId: slackTeamId || 'unknown',
        slackChannelId: channelId,
        slackMessageTs,
        eventTs: slackTsToDate(slackMessageTs),
        direction: parsed.direction,
        contactId: parsed.contactId || null,
        contactPhone: parsed.contactPhone || null,
        contactName: parsed.contactName || null,
        alowareUser: parsed.user || null,
        body: parsed.body || null,
        line: parsed.line || null,
        sequence: parsed.sequence || null,
        raw: { text, attachments },
      },
      logger,
    );

    if (!eventRow) {
      maybeLogAlowareIngestWarnings(logger);
      return;
    }
    recordAlowareIngestSuccess();

    const conversation = await upsertConversationFromEvent(eventRow, logger);
    if (!conversation) return;
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
        logger.warn('Contact enrichment failed', error);
      });
    }

    if (eventRow.direction === 'inbound') {
      await upsertNeedsReplyWorkItem(conversation, eventRow, logger);

      // Check for opt-out intent and auto-mark as DNC
      if (eventRow.body) {
        const optOut = detectOptOutIntent(eventRow.body);
        if (optOut.isOptOut) {
          logger.info(`Opt-out detected for conversation ${conversation.id}: matched "${optOut.matchedPattern}"`);
          await updateConversationStatus(conversation.id, 'dnc', logger);
        }
      }
    } else if (eventRow.direction === 'outbound') {
      await resolveNeedsReplyOnOutbound(conversation.id, eventRow, logger);
    }
  });
};

export default { register };
