import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import type { AlowareMessageFields } from './aloware-parser.js';

const FEEDBACK_REQUEST_MARKER = '*Setter Coaching Feedback Request*';
const DEFAULT_FEEDBACK_ENABLED = true;

type AssistantTarget = {
  label: string;
  userId: string;
};

type PostingClient = {
  client: WebClient;
  source: 'bot' | 'user';
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || (normalized !== 'false' && fallback);
};

const isFeedbackEnabled = (): boolean => {
  return parseBoolean(process.env.ALOWARE_SETTER_FEEDBACK_ENABLED, DEFAULT_FEEDBACK_ENABLED);
};

const getAssistantTargets = (): AssistantTarget[] => {
  const claudeId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || '';
  const targets: AssistantTarget[] = [];
  if (claudeId) targets.push({ label: 'Claude', userId: claudeId });

  return targets;
};

const getPostingClients = (botClient: WebClient): PostingClient[] => {
  const clients: PostingClient[] = [];
  const userToken = process.env.SLACK_USER_TOKEN?.trim() || '';
  if (userToken) {
    clients.push({ client: new WebClient(userToken), source: 'user' });
  }
  clients.push({ client: botClient, source: 'bot' });
  return clients;
};

const buildFeedbackPrompt = ({
  assistant,
  setterName,
  setterUserId,
  messageBody,
  contactName,
}: {
  assistant: AssistantTarget;
  setterName: string;
  setterUserId?: string;
  messageBody: string;
  contactName: string;
}): string => {
  const setterTag = setterUserId ? `<@${setterUserId}>` : setterName;
  return [
    FEEDBACK_REQUEST_MARKER,
    `<@${assistant.userId}>, high-performance coaching mode for ${setterTag}: Score this message to ${contactName}.`,
    '',
    'CRITICAL INSTRUCTIONS:',
    '1. FOCUS: Lead conversion for Physical Therapy business growth. You are a scaling specialist.',
    '2. SUPPRESS REPO MODE: NEVER mention repositories, code, GitHub, development, or technical tasks. This is a sales floor, not a dev environment.',
    "3. TONE: Supportive, punchy, and tactical. Identify the 'Win' and the 'Move'.",
    '',
    "Setter's Outbound Message:",
    `> "${messageBody}"`,
    '',
    '_Win:_ <tactical compliment on what worked>',
    '_Move:_ <one specific phrasing pivot to drive the booking faster>',
    '_Energy:_ <1 emoji matching the vibe>',
  ].join('\n');
};

export const requestSetterFeedback = async ({
  client,
  fields,
  logger,
  ts,
  channelId,
}: {
  client: WebClient;
  fields: AlowareMessageFields;
  logger: Logger;
  ts: string;
  channelId: string;
}): Promise<void> => {
  if (!isFeedbackEnabled()) return;
  if (fields.direction !== 'outbound') return;

  // Identify Jack only — Brandon is excluded from auto-feedback
  const userName = fields.user.toLowerCase();
  const isJack = userName.includes('jack');

  if (!isJack) return;

  const setterName = 'Jack';
  const setterUserId = process.env.ALOWARE_WATCHER_JACK_USER_ID;

  const assistants = getAssistantTargets();
  if (assistants.length === 0) return;

  // We only tag ONE assistant for immediate feedback to avoid clutter.
  const assistant = assistants[0];
  const postingClients = getPostingClients(client);

  const text = buildFeedbackPrompt({
    assistant,
    setterName,
    setterUserId,
    messageBody: fields.body,
    contactName: fields.contactName,
  });

  for (const { client: pClient, source } of postingClients) {
    try {
      await pClient.chat.postMessage({
        channel: channelId,
        thread_ts: ts,
        text,
        link_names: true,
      });
      logger.info(`Setter Feedback requested for ${setterName} from ${assistant.label} via ${source}`);
      return;
    } catch (error) {
      logger.error(`Failed to post setter feedback request via ${source}: ${error}`);
    }
  }
};
