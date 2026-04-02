/**
 * MessageThread.tsx - Message display with deduplication
 * React 19: ref-as-prop, useOptimistic for real-time updates, auto-scroll
 */

import { cn } from '@/lib/utils';
import type { UseInboxMessagesReturn } from '@/v2/hooks/useInboxMessages';
import { useEffect, useOptimistic, useRef, useTransition } from 'react';

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
  direction: 'inbound' | 'outbound';
  timestamp: number;
  isPending?: boolean;
  onSelect?: () => void;
}) {
  const isOutbound = direction === 'outbound';

  return (
    <div
      className={cn(
        'flex gap-2 animate-message-in',
        isOutbound ? 'justify-end' : 'justify-start',
      )}
      style={{
        animation:
          'messageSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        opacity: 0,
      }}
    >
      <div
        className={cn(
          'max-w-xs rounded-bubble px-4 py-2.5 text-sm transition-all duration-200',
          'hover:scale-[1.01] hover:shadow-lg cursor-pointer',
          isOutbound
            ? 'bg-gradient-to-br from-ds-primary-500 to-ds-primary-600 text-white shadow-md shadow-ds-primary-500/20'
            : 'bg-ds-neutral-100 text-ds-neutral-900 shadow-sm hover:bg-ds-neutral-50',
          isPending && 'opacity-60 animate-pulse-subtle',
        )}
        onClick={onSelect}
        onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
      >
        <p className="leading-relaxed">{text}</p>
        <p className="mt-1 text-xs opacity-70 flex items-center gap-1">
          {isOutbound && !isPending && (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
          {new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {isPending && ' · sending…'}
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
        conversationId: '',
        text: newText,
        timestamp: Date.now(),
        senderPhone: '',
        direction: 'outbound' as const,
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
        if (typeof ref === 'function') ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="flex flex-col gap-2 overflow-y-auto p-4"
    >
      {optimisticMessages.map((message, index) => (
        <MessageBubble
          key={message.id || `msg-${index}`}
          text={message.text}
          direction={message.direction}
          timestamp={message.timestamp}
          isPending={
            'isPending' in message ? Boolean(message.isPending) : false
          }
          onSelect={() => message.id && onLineSelect(message.id)}
        />
      ))}
    </div>
  );
}

export default MessageThread;
