/**
 * Conversation Context Service
 *
 * Maintains multi-turn conversation history for the /ask command.
 * Stores conversation history per user per channel with configurable TTL.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationContext {
  userId: string;
  channelId: string;
  messages: ConversationMessage[];
  lastUpdated: number;
}

type AiProvider = 'openai' | 'xai';

// In-memory store (per-process, good enough for single-instance deployments)
// For multi-instance, consider Redis with TTL
const conversations = new Map<string, ConversationContext>();

const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_MESSAGES = 20; // Keep last N messages
const MAX_CONTEXT_CHARS = 12_000; // Max chars for context injection

const getContextKey = (userId: string, channelId: string): string => `${channelId}:${userId}`;

/**
 * Clean up expired conversations (call periodically)
 */
export const cleanupExpiredConversations = (): number => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, context] of conversations.entries()) {
    if (now - context.lastUpdated > CONTEXT_TTL_MS) {
      conversations.delete(key);
      cleaned++;
    }
  }

  return cleaned;
};

/**
 * Get conversation context for a user in a channel
 */
export const getConversationContext = (userId: string, channelId: string): ConversationContext | null => {
  const key = getContextKey(userId, channelId);
  const context = conversations.get(key);

  if (!context) return null;

  // Check if expired
  if (Date.now() - context.lastUpdated > CONTEXT_TTL_MS) {
    conversations.delete(key);
    return null;
  }

  return context;
};

/**
 * Add a user message to the conversation history
 */
export const addUserMessage = (userId: string, channelId: string, content: string): void => {
  const key = getContextKey(userId, channelId);
  let context = conversations.get(key);

  if (!context) {
    context = {
      userId,
      channelId,
      messages: [],
      lastUpdated: Date.now(),
    };
    conversations.set(key, context);
  }

  context.messages.push({
    role: 'user',
    content,
    timestamp: Date.now(),
  });

  // Trim to max messages
  if (context.messages.length > MAX_MESSAGES) {
    context.messages = context.messages.slice(-MAX_MESSAGES);
  }

  context.lastUpdated = Date.now();
};

/**
 * Add an assistant response to the conversation history
 */
export const addAssistantMessage = (userId: string, channelId: string, content: string): void => {
  const key = getContextKey(userId, channelId);
  const context = conversations.get(key);

  if (!context) return; // Should have been created by addUserMessage

  context.messages.push({
    role: 'assistant',
    content,
    timestamp: Date.now(),
  });

  // Trim to max messages
  if (context.messages.length > MAX_MESSAGES) {
    context.messages = context.messages.slice(-MAX_MESSAGES);
  }

  context.lastUpdated = Date.now();
};

/**
 * Build a conversation string for AI context injection
 * Returns the conversation history formatted for prompt injection
 */
export const buildConversationPrompt = (userId: string, channelId: string): string => {
  const context = getConversationContext(userId, channelId);

  if (!context || context.messages.length === 0) {
    return '';
  }

  // Format messages as conversation
  const formattedMessages = context.messages.map((msg) => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${msg.content}`;
  });

  const conversation = formattedMessages.join('\n\n');

  // Truncate if too long
  if (conversation.length > MAX_CONTEXT_CHARS) {
    const truncated = conversation.slice(-MAX_CONTEXT_CHARS);
    const cutIndex = truncated.indexOf('\n\n');
    return truncated.slice(cutIndex + 2);
  }

  return conversation;
};

/**
 * Clear conversation context for a user in a channel
 */
export const clearConversationContext = (userId: string, channelId: string): boolean => {
  const key = getContextKey(userId, channelId);
  return conversations.delete(key);
};

/**
 * Get conversation stats (for monitoring)
 */
export const getConversationStats = (): {
  activeConversations: number;
  totalMessages: number;
} => {
  let totalMessages = 0;

  for (const context of conversations.values()) {
    totalMessages += context.messages.length;
  }

  return {
    activeConversations: conversations.size,
    totalMessages,
  };
};

// System prompt for multi-turn conversations
export const CONVERSATION_SYSTEM_PROMPT = `You are an intelligent SMS analytics assistant for PT Biz SMS Insights.
You have access to real-time SMS campaign data including bookings, reply rates, opt-outs, and sequence performance.

When answering questions:
- Be specific with numbers and dates
- Provide context about trends (improving, declining, stable)
- Compare metrics against goals when relevant
- Suggest actionable recommendations when appropriate
- Keep responses concise but informative

If you don't have enough data to answer a question, say so honestly.
`;
