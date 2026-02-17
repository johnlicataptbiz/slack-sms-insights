import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import type { AlowareMessageFields } from './aloware-parser.js';

export const FEEDBACK_REQUEST_MARKER = '*Setter Coaching Feedback Request*';
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

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
};

// In-memory dedupe cache to prevent repeated setter-feedback posts for the same
// thread/message. Keyed by `channelId:ts`. TTL controlled by
// ALOWARE_SETTER_FEEDBACK_DEDUPE_MINUTES (default 10 minutes).
const setterFeedbackCache = new Map<string, number>();

export const __resetSetterFeedbackCacheForTests = (): void => {
  setterFeedbackCache.clear();
};

const getSetterFeedbackDedupeMinutes = (): number => {
  return parsePositiveInt(process.env.ALOWARE_SETTER_FEEDBACK_DEDUPE_MINUTES, 10);
};

const isPersistentDedupeEnabled = (): boolean => {
  const raw = (process.env.ALOWARE_SETTER_FEEDBACK_PERSISTENT_DEDUPE ?? '').trim().toLowerCase();
  if (!raw) {
    // default: enabled if a DB pool is available at runtime (checked lazily)
    return true;
  }
  return raw === 'true';
};

const isFeedbackEnabled = (): boolean => {
  return parseBoolean(process.env.ALOWARE_SETTER_FEEDBACK_ENABLED, DEFAULT_FEEDBACK_ENABLED);
};

const getAssistantTargets = (): AssistantTarget[] => {
  const claudeId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || '';

  // Defensive: treat explicit sentinel values as "disabled" so accidental
  // mentions cannot be posted (production may set CLAUDE_ASSISTANT_USER_ID=DISABLED).
  const sentinel = claudeId.toLowerCase();
  if (!claudeId || sentinel === 'disabled' || sentinel === 'none' || sentinel === 'false') {
    return [];
  }

  // Protect against accidental self-tagging: if the configured Claude ID
  // matches a watcher (Jack/Brandon), do not treat it as an AI assistant.
  const watcherIds = [
    process.env.ALOWARE_WATCHER_JACK_USER_ID?.trim(),
    process.env.ALOWARE_WATCHER_BRANDON_USER_ID?.trim(),
  ].filter(Boolean);

  if (watcherIds.includes(claudeId)) {
    // configured CLAUDE_ASSISTANT_USER_ID appears to be a human/watcher — ignore it
    return [];
  }

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

  // Skip automated sequence messages — feedback is only for manual outbound messages
  if (fields.sequence && fields.sequence.trim().length > 0) {
    logger.info(`Setter Feedback: skipping automated sequence message (sequence=${fields.sequence}).`);
    return;
  }

  // Identify Jack only — Brandon is excluded from auto-feedback
  const userName = fields.user.toLowerCase();
  const isJack = userName.includes('jack');

  if (!isJack) return;

  // Additional check to ensure it's a manual message from Jack
  if (fields.user !== 'Jack Licata' || (fields.sequence && fields.sequence.trim().length > 0)) {
    return;
  }

  const setterName = 'Jack';
  const setterUserId = process.env.ALOWARE_WATCHER_JACK_USER_ID;

  const dedupeKey = `${channelId}:${ts}`;
  const dedupeMinutes = getSetterFeedbackDedupeMinutes();

  // 1) check persistent store (DB) when enabled
  if (isPersistentDedupeEnabled()) {
    try {
      // lazy import to avoid circular deps in environments without DB
      const { hasRecentPersistentFeedback } = await import('./setter-feedback-store.js');
      // if DB says there's a recent feedback for this thread, suppress
      const persisted = await hasRecentPersistentFeedback({ channelId, threadTs: ts, dedupeMinutes });
      if (persisted) {
        logger.info(`Setter Feedback: suppressed by persistent dedupe for ${dedupeKey} (within ${dedupeMinutes}m).`);
        return;
      }
    } catch (err) {
      // ignore DB errors and fall back to in-memory
      logger.debug('Setter Feedback: persistent dedupe check failed, falling back to in-memory.', err);
    }
  }

  // 2) in-memory dedupe fallback
  const now = Date.now();
  const lastTs = setterFeedbackCache.get(dedupeKey) || 0;
  if (now - lastTs < dedupeMinutes * 60_000) {
    logger.info(`Setter Feedback: suppressed duplicate request for ${dedupeKey} (within ${dedupeMinutes}m).`);
    return;
  }

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

      // mark dedupe on successful post (both persistent + in-memory)
      setterFeedbackCache.set(dedupeKey, Date.now());

      if (isPersistentDedupeEnabled()) {
        try {
          const { insertPersistentFeedback } = await import('./setter-feedback-store.js');
          // fire-and-forget persistence; failure shouldn't block normal flow
          insertPersistentFeedback({ channelId, threadTs: ts, messageTs: ts }).catch((e) =>
            logger.debug('Setter Feedback: failed to persist dedupe record', e),
          );
        } catch (err) {
          logger.debug('Setter Feedback: persistent dedupe insert failed', err);
        }
      }

      logger.info(`Setter Feedback requested for ${setterName} from ${assistant.label} via ${source}`);
      return;
    } catch (error) {
      logger.error(`Failed to post setter feedback request via ${source}: ${error}`);
    }
  }
};
