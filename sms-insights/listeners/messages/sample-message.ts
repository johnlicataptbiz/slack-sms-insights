import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { parseAlowareMessage } from '../../services/aloware-parser.js';
import { isAlowareChannel } from '../../services/aloware-policy.js';
import { isChannelAllowed } from '../../services/channel-access.js';
import { requestDailyAnalysisHandoff } from '../../services/daily-analysis-handoff.js';
import { buildDailyReportSummary, isDailySnapshotReport } from '../../services/daily-report-summary.js';
import { getHubSpotConfig, syncLeadNoteToHubSpot } from '../../services/hubspot-sync.js';
import { requestInboundCoaching } from '../../services/inbound-coaching.js';
import {
  buildLeadWatcherAlert,
  getHubSpotSyncData,
  type LeadWatcherAttachment,
  shouldBroadcastLeadWatcherAlerts,
} from '../../services/lead-watcher.js';
import { requestSetterFeedback } from '../../services/setter-feedback.js';

const IGNORED_SUBTYPES = new Set(['message_changed', 'message_deleted', 'channel_join', 'channel_leave']);
const DEDUPE_WINDOW_SECONDS = 6 * 60 * 60;

type WatchedMessageEvent = {
  attachments?: LeadWatcherAttachment[];
  bot_id?: string;
  channel?: string;
  hidden?: boolean;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
};

const seenMessageEventTs = new Map<string, number>();

const toNumber = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const purgeSeenMessageCache = (nowSeconds: number): void => {
  for (const [messageTs, storedAt] of seenMessageEventTs.entries()) {
    if (nowSeconds - storedAt > DEDUPE_WINDOW_SECONDS) {
      seenMessageEventTs.delete(messageTs);
    }
  }
};

const sampleMessageCallback = async ({
  client,
  context,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  try {
    const message = event as unknown as WatchedMessageEvent;
    if (!isChannelAllowed(message.channel)) {
      return;
    }
    if (message.hidden || (message.subtype && IGNORED_SUBTYPES.has(message.subtype))) {
      return;
    }

    const isAloware = isAlowareChannel(message.channel);
    const isDailySnapshot = isAloware && isDailySnapshotReport(message.text || '');
    const isFromSelf = typeof context.botUserId === 'string' && message.user === context.botUserId;

    // Ignore messages posted by OTHER Slack apps/bots — those are automated and
    // should not trigger watcher alerts or setter-feedback. However, allow
    // processing for daily snapshot reports (they may be posted by an app).
    if (message.bot_id && !isDailySnapshot && !isFromSelf) {
      logger.debug('Ignoring message from another app/bot (not a daily snapshot).', message.bot_id);
      return;
    }

    if (isFromSelf && !isDailySnapshot) {
      return;
    }

    if (isAloware) {
      const channelId = message.channel;
      if (!channelId) {
        return;
      }

      if (isDailySnapshot) {
        const summaryText = buildDailyReportSummary(message.text || '');
        const replyThreadTs = message.thread_ts || message.ts;
        if (replyThreadTs) {
          await requestDailyAnalysisHandoff({
            botClient: client,
            channelId,
            logger,
            summaryText,
            threadTs: replyThreadTs,
          });
        }
      } else {
        // 🚀 SETTER FEEDBACK (Outbound)
        const fields = parseAlowareMessage(message.text || '', message.attachments);
        if (fields.direction === 'outbound' && message.ts && message.channel) {
          await requestSetterFeedback({
            client,
            fields,
            logger,
            ts: message.ts,
            channelId,
          });
        }
      }
    }

    if (isFromSelf) {
      return;
    }

    const alert = buildLeadWatcherAlert({
      attachments: message.attachments,
      channelId: message.channel,
      text: message.text,
      threadTs: message.thread_ts,
      ts: message.ts,
    });
    if (!alert) {
      return;
    }

    const eventTs = message.ts;
    if (!eventTs) {
      return;
    }

    const nowSeconds = Math.max(toNumber(eventTs), Date.now() / 1000);
    purgeSeenMessageCache(nowSeconds);
    if (seenMessageEventTs.has(eventTs)) {
      return;
    }

    await client.chat.postMessage({
      channel: alert.channelId,
      reply_broadcast: shouldBroadcastLeadWatcherAlerts(),
      text: alert.text,
      blocks: alert.blocks,
      thread_ts: alert.threadTs,
    });

    // 🚀 SYNC TO HUBSPOT
    const syncData = getHubSpotSyncData({
      attachments: message.attachments,
      text: message.text,
    });
    if (syncData?.phoneNumber) {
      const contactId = await syncLeadNoteToHubSpot({
        phoneNumber: syncData.phoneNumber,
        contactName: syncData.contactLabel,
        noteContent: syncData.messageBody,
        tags: syncData.tags,
        logger,
      });

      if (contactId && alert.channelId) {
        const hsConfig = getHubSpotConfig();
        // Post the HubSpot link as a follow-up
        await client.chat.postMessage({
          channel: alert.channelId,
          thread_ts: alert.threadTs || message.ts,
          text: `🔗 *HubSpot Contact:* https://app.hubspot.com/contacts/${hsConfig.portalId}/record/0-1/${contactId}`,
        });
      }

      // 🚀 INBOUND COACHING for Hot Leads
      if (alert.channelId && message.ts) {
        const fields = parseAlowareMessage(message.text || '', message.attachments);
        await requestInboundCoaching({
          client,
          fields,
          logger,
          ts: message.ts,
          channelId: alert.channelId,
          assigneeUserId: alert.assigneeUserId,
        });
      }
    }

    seenMessageEventTs.set(eventTs, nowSeconds);
  } catch (error) {
    logger.error(error);
  }
};

export const __resetLeadWatcherMessageCacheForTests = (): void => {
  seenMessageEventTs.clear();
};

export { sampleMessageCallback };
