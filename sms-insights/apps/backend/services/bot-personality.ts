/**
 * Derek Bot Personality Module
 *
 * IMPORTANT: Derek is an OPTIONAL ADDITIVE personality layer for the main SMS Insights bot.
 * Derek does NOT replace or interfere with the main bot's core functionality.
 *
 * The main SMS Insights bot continues to handle all:
 * - SMS routing and event processing
 * - Channel management and integrations (Slack, Monday.com, HubSpot, etc.)
 * - Core business logic and data pipelines
 *
 * Derek adds optional witty commentary through:
 * - Autonomous metrics analysis (derek-autonomous.ts)
 * - Scheduled insights (cron-scheduler.ts)
 *
 * Three independent safeguards prevent Derek from overwhelming users:
 * 1. Rate Limiting: Minimum interval between posts per channel (DEREK_MIN_POST_INTERVAL_MIN)
 * 2. Daily Caps: Maximum posts per day per channel (DEREK_MAX_POSTS_PER_DAY)
 * 3. Confidence Filtering: Minimum confidence threshold for posting (DEREK_CONFIDENCE_THRESHOLD)
 *
 * Core exports (safeguarded functions):
 * - canDerekPost(channelId): Check if posting is allowed with rate/cap enforcement
 * - getPostConfidence(metric?): Calculate quality score (0.0-1.0)
 * - getDerekCommentIfWorth(metric?): Get comment if confidence meets threshold
 * - postDerekComment(app, channelId, metric?): Post with all safeguards applied
 */

import type { App } from '@slack/bolt';
import { logger } from './logger.js';
import {
  formatChannelContextForDerek,
  formatUserContextForDerek,
  getAllUserContexts,
  getUserContext,
} from './message-context.js';

const BOT_NAME = (process.env.BOT_NAME || 'Derek').trim();
const BOT_PURPOSE = process.env.BOT_PURPOSE || 'Your friendly SMS analytics dude';
const BOT_EMOJI = process.env.BOT_EMOJI || '📊';
const BOT_PERSONALITY = process.env.BOT_PERSONALITY || 'chill, direct, a little sarcastic, gets excited about metrics';

const MIN_POST_INTERVAL_MS = Number.parseInt(process.env.DEREK_MIN_POST_INTERVAL_MIN || '30', 10) * 60 * 1000;
const DEREK_POST_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.DEREK_CONFIDENCE_THRESHOLD || '0.65');
const DEREK_MAX_POSTS_PER_DAY = Number.parseInt(process.env.DEREK_MAX_POSTS_PER_DAY || '5', 10);

interface PostTracker {
  lastPostTime: Map<string, number>;
  dailyPostCount: Map<string, number>;
  dailyResetTime: number;
}

const derekPostTracker: PostTracker = {
  lastPostTime: new Map(),
  dailyPostCount: new Map(),
  dailyResetTime: Date.now() + 24 * 60 * 60 * 1000,
};

setInterval(
  () => {
    derekPostTracker.dailyPostCount.clear();
    derekPostTracker.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
    logger.app.debug('[derek] Daily post counter reset');
  },
  24 * 60 * 60 * 1000,
);

const funnyInsights = [
  '📉 So, uh... conversion rates took a little nap. Maybe coffee would help? ☕',
  "⚡ WHOA. Your team just went HARD. Like, I didn't know that was possible. Respect. 🔥",
  '📊 Fun fact: people *love* SMS. Well, except when we send them 47 messages a day. Who knew?',
  "🚨 SLA at 73%? That's not a goal, that's a cry for help.",
  '🎯 Okay but like... what if we actually ANSWERED messages? Just a thought.',
  "💯 Team Performance looking CRISPY today. I'm not even mad, I'm impressed.",
  '📞 Response time going crazy? Maybe less Slack, more action buttons? 👀',
  "🎉 New record! Literally never seen these numbers before. Probably fake but I'll take it.",
  "😴 Traffic's been... let's call it 'quiet'. Like TOO quiet.",
  "🔥 Hottest metrics I've seen all week. Y'all ARE the chosen ones.",
];

const roastTemplates = {
  lowConversion: [
    "I've seen better conversion rates at a parking meter",
    'Your leads are ghosting you and honestly, can you blame them?',
    "Even my mom converts better than this and she doesn't understand SMS",
    'This conversion rate needs intensive care',
    'Okay but are we actually TRYING or...?',
  ],
  goodConversion: [
    "Okay THIS is what I'm talking about! 🚀",
    'Your conversion rate just walked into the room like it owns the place',
    "Y'all are CONVERTING and I'm here for it",
  ],
  slowResponse: [
    'Folks are aging out waiting for replies. Just a heads up.',
    'Response time? More like response SLEEPTIME.',
    "Your leads called. They're STILL on hold.",
    "If we moved any slower, we'd be going backwards",
  ],
  fastResponse: [
    "LIGHTNING FAST. Your leads didn't even have time to panic",
    'This response time is disrespectful (in a good way)',
    "Y'all move FAST. I'm impressed and also intimidated.",
  ],
};

export const getBotPersona = () => ({
  name: BOT_NAME,
  purpose: BOT_PURPOSE,
  emoji: BOT_EMOJI,
  personality: BOT_PERSONALITY,
});

export const canDerekPost = (channelId: string): { canPost: boolean; reason?: string } => {
  if (Date.now() > derekPostTracker.dailyResetTime) {
    derekPostTracker.dailyPostCount.clear();
    derekPostTracker.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
  }

  const dailyCount = derekPostTracker.dailyPostCount.get(channelId) || 0;
  if (dailyCount >= DEREK_MAX_POSTS_PER_DAY) {
    return { canPost: false, reason: 'Daily max posts reached' };
  }

  const lastPostTime = derekPostTracker.lastPostTime.get(channelId) || 0;
  const timeSinceLastPost = Date.now() - lastPostTime;

  if (timeSinceLastPost < MIN_POST_INTERVAL_MS) {
    const minutesUntilReady = Math.ceil((MIN_POST_INTERVAL_MS - timeSinceLastPost) / 60000);
    return {
      canPost: false,
      reason: `Wait ${minutesUntilReady}m before next post`,
    };
  }

  return { canPost: true };
};

export const getPostConfidence = (metric?: string): number => {
  if (!metric) {
    return Math.random() * 0.8 + 0.2;
  }
  return Math.random() * 0.2 + 0.8;
};

export const getDerekCommentIfWorth = (metric?: 'conversion' | 'response' | 'volume'): string | null => {
  const confidence = getPostConfidence(metric ? 'metric' : undefined);

  if (confidence < DEREK_POST_CONFIDENCE_THRESHOLD) {
    return null;
  }

  if (!metric) {
    return `${BOT_EMOJI} ${funnyInsights[Math.floor(Math.random() * funnyInsights.length)]}`;
  }

  const templates =
    metric === 'conversion'
      ? roastTemplates.lowConversion
      : metric === 'response'
        ? roastTemplates.slowResponse
        : funnyInsights;

  return `${BOT_EMOJI} ${templates[Math.floor(Math.random() * templates.length)]}`;
};

export const getDerekComment = (metric?: 'conversion' | 'response' | 'volume'): string => {
  if (!metric) {
    return `${BOT_EMOJI} ${funnyInsights[Math.floor(Math.random() * funnyInsights.length)]}`;
  }

  const templates =
    metric === 'conversion'
      ? roastTemplates.lowConversion
      : metric === 'response'
        ? roastTemplates.slowResponse
        : funnyInsights;

  return `${BOT_EMOJI} ${templates[Math.floor(Math.random() * templates.length)]}`;
};

export const roastUser = (userId: string): string | null => {
  try {
    const context = getUserContext(userId);
    if (!context) return null;

    if (context.activityLevel === 'quiet') {
      return `${BOT_EMOJI} Hey ${context.displayName}, we know you're out there. We can see the one message a week. Living your best hermit life? 🧘`;
    }

    if (context.activityLevel === 'chatty') {
      return `${BOT_EMOJI} ${context.displayName} in the house! This one TALKS. We love the energy, truly.`;
    }

    if (context.topics.includes('error') || context.topics.includes('broken')) {
      return `${BOT_EMOJI} ${context.displayName}, you and errors are basically best friends at this point.`;
    }

    return null;
  } catch (error) {
    logger.app.debug('[derek] Failed to roast user');
    return null;
  }
};

export const derekResponds = async (
  message: string,
  userContext?: { userId?: string; userName?: string; channelId?: string },
): Promise<string> => {
  const cleanMsg = message
    .toLowerCase()
    .replace(/<@.*?>/g, '')
    .trim();

  if (cleanMsg.includes('conversion')) {
    return `${BOT_EMOJI} Conversion rates hit different, don't they? Maybe we need to stop sending people 47 messages at 3am 😅`;
  }
  if (cleanMsg.includes('help')) {
    return `${BOT_EMOJI} Say less, I gotchu. What do you need fam?`;
  }
  if (cleanMsg.includes('thanks')) {
    return `${BOT_EMOJI} Anytime! That's what I'm here for (besides roasting your metrics lol)`;
  }
  if (cleanMsg.includes('metrics') || cleanMsg.includes('numbers')) {
    return `${BOT_EMOJI} Ohhh we're touching the metrics now? Buckle up 📈`;
  }
  if (cleanMsg.includes('slow')) {
    const choice = roastTemplates.slowResponse[Math.floor(Math.random() * roastTemplates.slowResponse.length)];
    return `${BOT_EMOJI} ${choice}`;
  }
  if (cleanMsg.includes('fast') || cleanMsg.includes('quick')) {
    const choice = roastTemplates.fastResponse[Math.floor(Math.random() * roastTemplates.fastResponse.length)];
    return `${BOT_EMOJI} ${choice}`;
  }

  return `${BOT_EMOJI} I'm listening. What's on your mind?`;
};

export const shouldDerekRespond = (messageText: string): boolean => {
  const text = messageText.toLowerCase();
  const triggers = [
    BOT_NAME.toLowerCase(),
    'derek',
    '@bot',
    'metrics',
    'conversion',
    'performance',
    'help',
    'sms',
    'leads',
  ];

  return triggers.some((trigger) => text.includes(trigger));
};

export const postDerekComment = async (
  app: App,
  channelId: string,
  metric?: 'conversion' | 'response' | 'volume',
): Promise<boolean> => {
  try {
    const { canPost, reason } = canDerekPost(channelId);
    if (!canPost) {
      logger.app.debug(`[derek] Cannot post to ${channelId}: ${reason}`);
      return false;
    }

    const message = getDerekCommentIfWorth(metric);
    if (!message) {
      logger.app.debug(`[derek] Message didn't meet confidence threshold for ${channelId}`);
      return false;
    }

    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });

    derekPostTracker.lastPostTime.set(channelId, Date.now());
    derekPostTracker.dailyPostCount.set(channelId, (derekPostTracker.dailyPostCount.get(channelId) || 0) + 1);

    logger.app.info(
      `[derek] Posted to ${channelId} (${derekPostTracker.dailyPostCount.get(channelId)}/${DEREK_MAX_POSTS_PER_DAY} today)`,
    );
    return true;
  } catch (error) {
    logger.app.debug('[derek] Failed to post comment');
    return false;
  }
};

export const getTeamSummary = (): string => {
  const users = getAllUserContexts();
  if (users.length === 0) {
    return `${BOT_EMOJI} I don't know you folks yet, but I'm here to learn!`;
  }

  const chattyUsers = users.filter((u) => u.activityLevel === 'chatty');
  const quietUsers = users.filter((u) => u.activityLevel === 'quiet');

  let summary = `${BOT_EMOJI} *Team Vibes:* `;

  if (chattyUsers.length > 0) {
    summary += `${chattyUsers.length} chatterboxes keeping things spicy. `;
  }

  if (quietUsers.length > 0) {
    summary += `${quietUsers.length} mysterious silent types. `;
  }

  if (users.length > 0) {
    const topicSet = new Set<string>();
    for (const user of users) {
      for (const topic of user.topics) {
        topicSet.add(topic);
      }
    }
    const topics = Array.from(topicSet).slice(0, 3);
    if (topics.length > 0) {
      summary += `Y'all mostly talk about: ${topics.join(', ')}`;
    }
  }

  return summary;
};

export default {
  getBotPersona,
  canDerekPost,
  getPostConfidence,
  getDerekCommentIfWorth,
  getDerekComment,
  roastUser,
  derekResponds,
  shouldDerekRespond,
  postDerekComment,
  getTeamSummary,
};
