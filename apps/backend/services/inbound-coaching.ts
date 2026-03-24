import type { Logger } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { generateAiResponse } from './ai-response.js';
import type { AlowareMessageFields } from './aloware-parser.js';

const INBOUND_COACHING_MARKER = '*Inbound Lead Analysis*';
const DEFAULT_INBOUND_COACHING_ENABLED = false;
const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || (normalized !== 'false' && fallback);
};

const isInboundCoachingEnabled = (): boolean => {
  return parseBoolean(process.env.ALOWARE_INBOUND_COACHING_ENABLED, DEFAULT_INBOUND_COACHING_ENABLED);
};

const buildCoachingPrompt = ({ messageBody, contactName }: { messageBody: string; contactName: string }): string => {
  return [
    'You are a sales strategy analyst for Physical Therapy Biz.',
    'Write an INTERNAL coaching note only.',
    'Do not write an exact message script and do not use quotation marks with send-ready copy.',
    'Do not mention AI, assistants, models, prompts, or tooling.',
    'Keep it concise and practical.',
    '',
    `Lead: ${contactName}`,
    `Inbound message: "${messageBody}"`,
    '',
    'Return exactly this format:',
    'Lead Intent: <one sentence>',
    'Conversion Direction: <one sentence>',
    'Risk To Avoid: <one sentence>',
    'Next Action: <one sentence>',
  ].join('\n');
};

export const requestInboundCoaching = async ({
  client,
  fields,
  logger,
  ts,
  channelId,
  assigneeUserId,
}: {
  client: WebClient;
  fields: AlowareMessageFields;
  logger: Logger;
  ts: string;
  channelId: string;
  assigneeUserId?: string;
}): Promise<void> => {
  if (!isInboundCoachingEnabled()) return;
  if (fields.direction !== 'inbound') return;

  const prompt = buildCoachingPrompt({
    messageBody: fields.body,
    contactName: fields.contactName,
  });

  try {
    const analysis = (await generateAiResponse(prompt)).trim();
    if (!analysis || analysis === OPENAI_MISSING_KEY_MESSAGE) {
      logger.warn('Inbound coaching skipped: OpenAI is not configured.');
      return;
    }

    const assigneeLine = assigneeUserId ? `Owner: <@${assigneeUserId}>` : 'Owner: team';
    const text = [INBOUND_COACHING_MARKER, `Lead: ${fields.contactName}`, assigneeLine, '', analysis].join('\n');

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: ts,
      text,
      link_names: Boolean(assigneeUserId),
    });
    logger.info(`Inbound coaching posted for ${fields.contactName}`);
  } catch (error) {
    logger.error(`Failed to post inbound coaching: ${error}`);
  }
};
