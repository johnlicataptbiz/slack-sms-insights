/**
 * MessageThread.tsx - Message display with deduplication
 * Renders all messages in chronological order with deduplication built-in
 */

import React, { useMemo } from "react";
import { VirtualizedList } from "@/components/virtualized-list";
import { cn } from "@/lib/utils";
import type { UseInboxMessagesReturn } from "@/v2/hooks/useInboxMessages";

interface MessageThreadProps {
  messages: UseInboxMessagesReturn;
  selectedLineKey: string | null;
  onLineSelect: (lineKey: string) => void;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  messages,
  selectedLineKey,
  onLineSelect,
}) => {
  // Use deduplicatedMessages from hook - guarantees no duplicates
  const threadMessages = messages.deduplicatedMessages;

  if (!threadMessages || threadMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No messages yet. Send one to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      {threadMessages.map((message, index) => (
        <div
          key={message.id || `msg-${index}`}
          className={cn(
            "flex gap-2",
            message.direction === "outbound" && "justify-end",
          )}
        >
          <div
            className={cn(
              "max-w-xs rounded-lg px-3 py-2",
              message.direction === "inbound"
                ? "bg-muted"
                : "bg-blue-100 text-blue-900",
            )}
            onClick={() => onLineSelect(message.id)}
            role="button"
            tabIndex={0}
          >
            <p className="text-sm">{message.text}</p>
            <p className="text-xs opacity-60">
              {new Date(message.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageThread;
