/**
 * Modernized Message Thread Component (React 19.2)
 *
 * Demonstrates:
 * - use() hook for async data fetching
 * - useOptimistic for real-time message updates
 * - useFormStatus for send button state
 * - useActionState for form submission with optimistic UI
 * - Suspense boundaries with skeleton loading
 * - React 19 ref as prop (no forwardRef needed!)
 */

import {
  Suspense,
  use,
  useCallback,
  useOptimistic,
  useRef,
  useActionState,
} from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface Message {
  id: string;
  text: string;
  smsId: string;
  direction: "inbound" | "outbound";
  timestamp: Date;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  senderId: string;
  senderName?: string;
}

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  messages: Message[];
  lastMessageAt: Date;
}

interface MessageThreadProps {
  conversationPromise: Promise<Conversation>;
  onSendMessage: (
    text: string,
  ) => Promise<{ success: boolean; message: Message }>;
  ref?: React.Ref<HTMLDivElement>;
}

// ============================================
// MESSAGE BUBBLE COMPONENT
// ============================================

interface MessageBubbleProps {
  message: Message;
  isOptimistic?: boolean;
}

function MessageBubble({ message, isOptimistic }: MessageBubbleProps) {
  const isInbound = message.direction === "inbound";

  return (
    <div
      className={cn(
        "flex gap-2 mb-4",
        isInbound ? "flex-row" : "flex-row-reverse",
      )}
    >
      {/* Status indicator */}
      <div className="flex items-end">
        <div
          className={cn("w-2 h-2 rounded-full", {
            "bg-green-500": message.status === "delivered",
            "bg-purple-500": message.status === "read",
            "bg-amber-500": message.status === "pending" || isOptimistic,
            "bg-red-500": message.status === "failed",
            "bg-blue-500": isInbound,
          })}
          title={message.status}
        />
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-xs px-4 py-2 rounded-lg",
          isInbound
            ? "bg-neutral-100 text-neutral-900 rounded-bl-none"
            : "bg-blue-500 text-white rounded-br-none",
        )}
      >
        <p className="text-sm break-words">{message.text}</p>
        <p
          className={cn(
            "text-xs mt-1",
            isInbound ? "text-neutral-600" : "text-blue-100",
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>

      {isOptimistic && (
        <div className="flex items-center">
          <span className="text-xs text-amber-600">Sending...</span>
        </div>
      )}
    </div>
  );
}

// ============================================
// MESSAGE INPUT FORM
// ============================================

interface MessageFormProps {
  onSubmit: (prevState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  disabled?: boolean;
}

function MessageForm({ onSubmit, disabled }: MessageFormProps) {
  const [state, formAction] = useActionState(onSubmit, {});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="border-t border-neutral-200 p-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            name="message"
            placeholder="Type your message..."
            disabled={disabled}
            rows={2}
            className={cn(
              "flex-1 p-3 border rounded-lg resize-none",
              "focus:outline-none focus:ring-2 focus:ring-blue-500",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          />
          <SubmitButton disabled={disabled ?? false} />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        {/* Character count */}
        <CharacterCounter />
      </div>
    </form>
  );
}

// ============================================
// SUBMIT BUTTON WITH FORM STATUS
// ============================================

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "px-4 py-3 bg-blue-500 text-white rounded-lg font-medium",
        "hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500",
        "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
      )}
    >
      {pending ? "Sending..." : "Send"}
    </button>
  );
}

// ============================================
// CHARACTER COUNTER
// ============================================

function CharacterCounter() {
  return (
    <div className="text-xs text-neutral-600">
      <span id="char-count">0</span> / 160 characters
    </div>
  );
}

// ============================================
// SKELETON LOADER
// ============================================

function MessageThreadSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header skeleton */}
      <div className="border-b border-neutral-200 p-4">
        <div className="h-6 bg-neutral-200 rounded w-1/3 mb-2 animate-pulse" />
        <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse" />
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn("flex gap-2", i % 2 === 0 && "flex-row-reverse")}
          >
            <div className="w-24 h-16 bg-neutral-200 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className="border-t border-neutral-200 p-4 space-y-2">
        <div className="h-20 bg-neutral-200 rounded animate-pulse" />
        <div className="h-10 bg-neutral-200 rounded w-20 animate-pulse" />
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT WITH SUSPENSE
// ============================================

export function MessageThread({
  conversationPromise,
  onSendMessage,
  ref,
}: MessageThreadProps) {
  return (
    <div
      ref={ref}
      className="flex flex-col h-full bg-white rounded-lg border border-neutral-200"
    >
      <Suspense fallback={<MessageThreadSkeleton />}>
        <MessageThreadContent
          conversationPromise={conversationPromise}
          onSendMessage={onSendMessage}
        />
      </Suspense>
    </div>
  );
}

// ============================================
// INNER COMPONENT USING USE() HOOK
// ============================================

interface MessageThreadContentProps {
  conversationPromise: Promise<Conversation>;
  onSendMessage: (
    text: string,
  ) => Promise<{ success: boolean; message: Message }>;
}

function MessageThreadContent({
  conversationPromise,
  onSendMessage,
}: MessageThreadContentProps) {
  // React 19 use() hook: unwraps the promise and suspends if not ready
  const conversation = use(conversationPromise);

  // Optimistic UI for local message additions
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    conversation.messages,
    (state, newMessage: Message) => [...state, newMessage],
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle form submission with optimistic UI
  const handleSendMessage = useCallback(
    async (_prevState: { error?: string }, formData: FormData) => {
      const text = formData.get("message") as string;

      if (!text?.trim()) {
        return { error: "Message cannot be empty" };
      }

      // Create optimistic message
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        text: text.trim(),
        smsId: "",
        direction: "outbound",
        timestamp: new Date(),
        status: "pending",
        senderId: "current-user",
      };

      // Add optimistically to state
      addOptimisticMessage(optimisticMessage);

      try {
        const result = await onSendMessage(text.trim());

        if (!result.success) {
          return { error: "Failed to send message" };
        }

        // Optional: Scroll to bottom after sending
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        return { success: true };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    [addOptimisticMessage],
  );

  return (
    <>
      {/* Header */}
      <div className="border-b border-neutral-200 p-4">
        <h3 className="font-semibold text-neutral-900">
          {conversation.contactName}
        </h3>
        <p className="text-sm text-neutral-600">{conversation.contactPhone}</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4">
        {optimisticMessages.map((message) => {
          const isOptimistic = message.id.startsWith("temp-");
          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOptimistic={isOptimistic}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <MessageForm onSubmit={handleSendMessage} />
    </>
  );
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
// In a parent component:
import { Suspense } from 'react';

async function fetchConversation(id: string) {
  const res = await fetch(`/api/conversations/${id}`);
  return res.json();
}

export function Page({ conversationId }: { conversationId: string }) {
  const conversationPromise = fetchConversation(conversationId);

  return (
    <MessageThread
      conversationPromise={conversationPromise}
      onSendMessage={async (text) => {
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        return res.json();
      }}
    />
  );
}
*/
