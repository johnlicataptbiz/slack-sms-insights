/**
 * useInboxMessages - Message rendering and deduplication logic
 * Consolidates message filtering, deduplication, and intent detection
 */

import { useMemo } from "react";

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  timestamp: number;
  senderPhone: string;
  senderName?: string;
  direction: "inbound" | "outbound";
}

export interface InboxMessage extends Message {
  intent?: "objection" | "coaching_interest" | "deal_update" | null;
  tags?: string[];
}

export const useInboxMessages = (rawMessages: InboxMessage[] | undefined) => {
  // M1: Deduplicate messages by ID to prevent duplicates on refetch
  // This fixes the issue where polling collisions create duplicate message renders
  const deduplicatedMessages = useMemo(() => {
    if (!rawMessages) return [];

    const seen = new Map<string, boolean>();
    const result = [];

    for (const msg of rawMessages) {
      if (msg?.id && !seen.has(msg.id)) {
        seen.set(msg.id, true);
        result.push(msg);
      } else if (!msg?.id) {
        // Include messages without IDs (edge case: local optimistic updates)
        result.push(msg);
      }
    }
    return result;
  }, [rawMessages]);

  // M2: Find latest inbound message for intent detection and auto-reply UI
  // Used to populate "latest setter inquiry" and trigger intent detection
  const latestInboundMessage = useMemo(() => {
    // Use deduplicatedMessages to avoid analyzing stale duplicates
    for (let i = deduplicatedMessages.length - 1; i >= 0; i--) {
      const msg = deduplicatedMessages[i];
      if (msg && msg.direction === "inbound") {
        return msg;
      }
    }
    return null;
  }, [deduplicatedMessages]);

  // M3: Filter messages for display (thread messages only, not SMS status)
  const threadMessages = useMemo(() => {
    return deduplicatedMessages.filter((msg) => {
      return msg && msg.direction !== "internal"; // Exclude internal status messages
    });
  }, [deduplicatedMessages]);

  // M4: Group messages by date for chronological display
  const messagesByDate = useMemo(() => {
    const grouped = new Map<string, InboxMessage[]>();

    for (const msg of threadMessages) {
      const date = new Date(msg.timestamp);
      const dateKey = date.toLocaleDateString();

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(msg);
    }

    return Array.from(grouped.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });
  }, [threadMessages]);

  // M5: Check if there are unread messages
  const hasUnreadMessages = useMemo(() => {
    return threadMessages.some((msg) => msg?.unread === true);
  }, [threadMessages]);

  return {
    // Core deduplicated message array
    deduplicatedMessages,

    // Computed values for UI
    latestInboundMessage,
    threadMessages,
    messagesByDate,
    hasUnreadMessages,

    // Stats
    messageCount: deduplicatedMessages.length,
    threadMessageCount: threadMessages.length,
  };
};

export type UseInboxMessagesReturn = ReturnType<typeof useInboxMessages>;
