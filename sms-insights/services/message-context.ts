/**
 * Message Context Service
 *
 * Loads recent message history from Slack channels to give Derek
 * context about team members, their communication style, topics discussed.
 * Enables satirical roasting with insider knowledge.
 */

import type { App } from "@slack/bolt";
import { logger } from "./logger.js";

export interface UserContext {
  userId: string;
  displayName: string;
  realName: string;
  messageCount: number;
  recentMessages: string[];
  topics: string[];
  activityLevel: "quiet" | "normal" | "active" | "chatty";
  lastAnalyzed: number;
}

export interface ChannelContext {
  channelId: string;
  channelName: string;
  userContexts: Map<string, UserContext>;
  messageTypes: {
    questions: number;
    updates: number;
    jokes: number;
    complaints: number;
  };
  lastUpdated: number;
}

interface GlobalTeamContext {
  channels: Map<string, ChannelContext>;
  allUsers: Map<string, UserContext>;
  lastRefresh: number;
}

const MESSAGE_LIMIT = parseInt(process.env.MESSAGE_CONTEXT_LIMIT || "100", 10);
const CACHE_TTL_MS =
  parseInt(process.env.CONTEXT_CACHE_TTL_MINUTES || "60", 10) * 60 * 1000;

// Global cache
let globalContext: GlobalTeamContext = {
  channels: new Map(),
  allUsers: new Map(),
  lastRefresh: 0,
};

/**
 * Loads recent messages from a channel and identifies user patterns
 */
export const loadChannelContext = async (
  app: App,
  channelId: string,
  channelName: string,
): Promise<ChannelContext> => {
  try {
    // Fetch recent messages
    const result = await app.client.conversations.history({
      channel: channelId,
      limit: MESSAGE_LIMIT,
    });

    const messages = result.messages || [];
    const userMessages = new Map<
      string,
      {
        messages: string[];
        count: number;
      }
    >();

    // Group messages by user
    for (const msg of messages) {
      // Skip bot messages and reactions
      if (msg.type !== "message" || msg.subtype === "message_deleted") continue;
      if (msg.bot_id || !msg.user || !msg.text) continue;

      if (!userMessages.has(msg.user)) {
        userMessages.set(msg.user, { messages: [], count: 0 });
      }

      const userData = userMessages.get(msg.user)!;
      userData.messages.push(msg.text);
      userData.count++;
    }

    // Analyze message patterns for each user
    const userContexts = new Map<string, UserContext>();

    for (const [userId, data] of userMessages) {
      // Get user info
      const userInfo = await app.client.users
        .info({ user: userId })
        .catch(() => null);

      userContexts.set(userId, {
        userId,
        displayName:
          userInfo?.user?.profile?.display_name ||
          userInfo?.user?.name ||
          userId,
        realName: userInfo?.user?.real_name || "",
        messageCount: data.count,
        recentMessages: data.messages.slice(0, 10), // Store last 10 messages as context
        topics: extractTopics(data.messages),
        activityLevel: deriveActivityLevel(data.count, MESSAGE_LIMIT),
        lastAnalyzed: Date.now(),
      });
    }

    // Analyze message types
    const messagePatterns = {
      questions: messages.filter((m) => m.text?.includes("?")).length,
      updates: messages.filter((m) =>
        m.text?.match(/\b(update|updated|synced|complete)\b/i),
      ).length,
      jokes: messages.filter((m) => m.text?.match(/😂|😄|lol|haha/i)).length,
      complaints: messages.filter((m) =>
        m.text?.match(/\b(broken|error|issue|problem|help)\b/i),
      ).length,
    };

    const channelContext: ChannelContext = {
      channelId,
      channelName,
      userContexts,
      messageTypes: messagePatterns,
      lastUpdated: Date.now(),
    };

    // Cache it
    globalContext.channels.set(channelId, channelContext);

    // Merge into global user context
    for (const [userId, userCtx] of userContexts) {
      if (globalContext.allUsers.has(userId)) {
        // Merge: keep most recent context
        const existing = globalContext.allUsers.get(userId)!;
        if (userCtx.lastAnalyzed > existing.lastAnalyzed) {
          globalContext.allUsers.set(userId, userCtx);
        }
      } else {
        globalContext.allUsers.set(userId, userCtx);
      }
    }

    logger.app.info(
      `[message-context] Loaded context for ${userContexts.size} users in #${channelName}`,
    );

    return channelContext;
  } catch (error) {
    logger.app.debug(
      `[message-context] Error loading channel context: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      channelId,
      channelName,
      userContexts: new Map(),
      messageTypes: { questions: 0, updates: 0, jokes: 0, complaints: 0 },
      lastUpdated: Date.now(),
    };
  }
};

/**
 * Extract topics/keywords from messages
 */
function extractTopics(messages: string[]): string[] {
  const keywords = new Map<string, number>();

  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "is",
    "it",
    "to",
    "of",
    "in",
    "for",
    "that",
    "this",
    "we",
    "i",
    "you",
    "they",
    "what",
    "lol",
    "hey",
  ]);

  for (const msg of messages) {
    const words = msg.toLowerCase().split(/\s+/);
    for (const word of words) {
      // Clean word
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (clean.length > 3 && !stopwords.has(clean)) {
        keywords.set(clean, (keywords.get(clean) || 0) + 1);
      }
    }
  }

  // Get top 5 topics
  return Array.from(keywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Derive activity level from message count
 */
function deriveActivityLevel(
  count: number,
  limit: number,
): "quiet" | "normal" | "active" | "chatty" {
  const percentage = count / limit;
  if (percentage < 0.1) return "quiet";
  if (percentage < 0.3) return "normal";
  if (percentage < 0.6) return "active";
  return "chatty";
}

/**
 * Get cached context for a user (across all channels)
 */
export const getUserContext = (userId: string): UserContext | undefined => {
  return globalContext.allUsers.get(userId);
};

/**
 * Get cached context for a user in specific channel
 */
export const getUserContextInChannel = (
  channelId: string,
  userId: string,
): UserContext | undefined => {
  return globalContext.channels.get(channelId)?.userContexts.get(userId);
};

/**
 * Get all cached user contexts
 */
export const getAllUserContexts = (): UserContext[] => {
  return Array.from(globalContext.allUsers.values());
};

/**
 * Get channel context
 */
export const getChannelContext = (
  channelId: string,
): ChannelContext | undefined => {
  const context = globalContext.channels.get(channelId);
  // Check cache freshness
  if (context && Date.now() - context.lastUpdated > CACHE_TTL_MS) {
    globalContext.channels.delete(channelId);
    return undefined;
  }
  return context;
};

/**
 * Refresh context for channels (load recent messages)
 */
export const refreshTeamContext = async (
  app: App,
  channelIds: string[],
): Promise<Map<string, ChannelContext>> => {
  const contexts = new Map<string, ChannelContext>();

  // Fetch user list for display names
  try {
    const userList = await app.client.users.list({});
    // Can use this for lookups if needed

    for (const channelId of channelIds) {
      // Get channel info
      const channelInfo = await app.client.conversations
        .info({ channel: channelId })
        .catch(() => null);
      const channelName = channelInfo?.channel?.name || channelId;

      const context = await loadChannelContext(app, channelId, channelName);
      contexts.set(channelId, context);
    }
  } catch (error) {
    logger.app.debug(
      `[message-context] Error refreshing team context: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  globalContext.lastRefresh = Date.now();
  return contexts;
};

/**
 * Format user context for Derek's reasoning
 */
export const formatUserContextForDerek = (userId: string): string => {
  const context = getUserContext(userId);
  if (!context) return "";

  const fragment = `${context.displayName} (${context.activityLevel} - ${context.messageCount} msgs)`;
  if (context.topics.length > 0) {
    return `${fragment}, talks about: ${context.topics.join(", ")}`;
  }
  return fragment;
};

/**
 * Format channel context for Derek's reasoning
 */
export const formatChannelContextForDerek = (
  channelId: string,
  includeUsers = 3,
): string => {
  const context = getChannelContext(channelId);
  if (!context) return "";

  const topUsers = Array.from(context.userContexts.values())
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, includeUsers);

  const userSummary = topUsers
    .map((u) => `${u.displayName} (${u.activityLevel})`)
    .join(", ");

  return `#${context.channelName}: mostly ${context.messageTypes.questions > context.messageTypes.updates ? "Q&A" : "updates"}, active members: ${userSummary}`;
};

export default {
  loadChannelContext,
  getUserContext,
  getUserContextInChannel,
  getAllUserContexts,
  getChannelContext,
  refreshTeamContext,
  formatUserContextForDerek,
  formatChannelContextForDerek,
};
