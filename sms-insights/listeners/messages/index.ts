import type { App } from '@slack/bolt';
import { parseAlowareMessage } from '../../services/aloware-parser.js';
import { isAlowareChannel } from '../../services/aloware-policy.js';
import { upsertConversationFromEvent } from '../../services/conversation-projector.js';
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

    // Ignore bot messages to avoid loops (Aloware integration messages are typically bot/app messages,
    // but we still want them. So only ignore *this* app's bot messages if present.)
    // Bolt message has subtype sometimes; keep permissive for now.
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const text = (message as any).text as string | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const attachments = (message as any).attachments as any[] | undefined;

    const parsed = parseAlowareMessage(text || '', attachments);

    // Only ingest messages that look like SMS events.
    if (parsed.direction === 'unknown') return;
    if (!parsed.contactId && !parsed.contactPhone) return;

    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const slackTeamId = (message as any).team as string | undefined; // may be undefined in some events
    // biome-ignore lint/suspicious/noExplicitAny: Slack message event payload is a union; we narrow via runtime checks.
    const slackMessageTs = (message as any).ts as string | undefined;

    if (!channelId || !slackMessageTs) return;

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

    if (!eventRow) return;

    const conversation = await upsertConversationFromEvent(eventRow, logger);
    if (!conversation) return;

    if (eventRow.direction === 'inbound') {
      await upsertNeedsReplyWorkItem(conversation, eventRow, logger);
    } else if (eventRow.direction === 'outbound') {
      await resolveNeedsReplyOnOutbound(conversation.id, eventRow, logger);
    }
  });
};

export default { register };
