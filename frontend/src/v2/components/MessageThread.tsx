/**
 * MessageThread.tsx - Message display with deduplication
 * React 19: ref-as-prop, useOptimistic for real-time updates, auto-scroll
 */

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { UseInboxMessagesReturn } from "@/v2/hooks/useInboxMessages";

interface MessageThreadProps {
  messages: UseInboxMessagesReturn;
  selectedLineKey: string | null;
  onLineSelect: (lineKey: string) => void;
  pendingMessage?: string | null;
  ref?: React.Ref<HTMLDivElement>;
}

function MessageBubble({
  text,
  direction,
  timestamp,
  isPending = false,
  onSelect,
}: {
  text: string;
  direction: "inbound" | "outbound";
  timestamp: number;
  isPending?: boolean;
  onSelect?: () => void;
}) {
  const isOutbound = direction === "outbound";

  return (
    <div className={cn("flex gap-2", isOutbound && "justify-end")}>
      <div
        className={cn(
          "max-w-xs rounded-bubble px-3 py-2 text-sm transition-opacity duration-normal",
          isOutbound
            ? "bg-ds-primary-500 text-white"
            : "bg-ds-neutral-100 text-ds-neutral-900",
          isPending && "opacity-60",
        )}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.()}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
      >
        <p>{text}</p>
        <p className="mt-0.5 text-xs opacity-60">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {isPending && " · sending…"}
        </p>
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  selectedLineKey: _selectedLineKey,
  onLineSelect,
  pendingMessage,
  ref,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const baseMessages = messages.deduplicatedMessages ?? [];

  // Optimistic: surface any in-flight message immediately
  const [optimisticMessages, addOptimistic] = useOptimistic(
    baseMessages,
    (current, newText: string) => [
      ...current,
      {
        id: `opt-${Date.now()}`,
        conversationId: "",
        text: newText,
        timestamp: Date.now(),
        senderPhone: "",
        direction: "outbound" as const,
        isPending: true,
      },
    ],
  );

  // Expose addOptimistic for parent via imperative handle pattern
  useEffect(() => {
    if (pendingMessage) {
      startTransition(() => {
        addOptimistic(pendingMessage);
      });
    }
  }, [pendingMessage, addOptimistic]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [optimisticMessages.length]);

  if (optimisticMessages.length === 0) {
    return (
      <div
        ref={ref}
        className="flex h-full items-center justify-center text-muted-foreground"
      >
        <p className="text-sm">No messages yet. Send one to get started.</p>
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        // Support both the scroll ref and any forwarded ref
        (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="flex flex-col gap-2 overflow-y-auto p-4"
    >
      {optimisticMessages.map((message, index) => (
        <MessageBubble
          key={message.id || `msg-${index}`}
          text={message.text}
          direction={message.direction}
          timestamp={message.timestamp}
          isPending={"isPending" in message ? Boolean(message.isPending) : false}
          onSelect={() => message.id && onLineSelect(message.id)}
        />
      ))}
    </div>
  );
}

export default MessageThread;
