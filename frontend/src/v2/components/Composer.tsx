/**
 * Composer.tsx - SMS composition with React 19 form patterns
 * React 19: useActionState for send action, useFormStatus for button state
 */

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UseInboxStateReturn } from "@/v2/hooks/useInboxState";
import type { MutationHandlers } from "@/v2/hooks/useInboxMutations";

const SMS_CHAR_LIMIT = 160;
const SMS_MULTIPART_LIMIT = 306;

interface ComposerProps {
  state: UseInboxStateReturn;
  mutations: MutationHandlers;
  isLoading: boolean;
}

const QUICK_TEMPLATES = [
  "What specific challenges are you facing?",
  "Let me send you a booking link: https://calendly.com/",
  "When would be the best time to chat?",
  "Thanks for your interest! Here's more info: ",
] as const;

// ── Send Button — uses useFormStatus (must be inside <form>) ──────────────
function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      className="flex-1"
    >
      {pending ? "Sending…" : "Send"}
    </Button>
  );
}

// ── Char counter with SMS segment awareness ───────────────────────────────
function CharCounter({ count }: { count: number }) {
  const segments = Math.ceil(count / SMS_CHAR_LIMIT) || 1;
  const isOver = count > SMS_MULTIPART_LIMIT;
  return (
    <span
      className={cn(
        "text-xs tabular-nums transition-colors",
        count > SMS_CHAR_LIMIT && "text-ds-warning-600",
        isOver && "text-ds-error-600 font-semibold",
      )}
    >
      {count}/{SMS_CHAR_LIMIT}
      {count > SMS_CHAR_LIMIT && ` (${segments} SMS)`}
    </span>
  );
}

export function Composer({ state, mutations, isLoading }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const canSendLink = (state.escalationState.level || 0) >= 2;

  // useActionState wraps the send mutation with pending/error tracking
  const [sendState, sendAction] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      const text = (formData.get("message") as string)?.trim();
      if (!text) return { error: "Message cannot be empty" };

      if (text.includes("calendly.com") && !canSendLink) {
        return {
          error: `⚠️ Escalate to Stage ${2 - (state.escalationState.level || 0)} before sending scheduling links`,
        };
      }

      try {
        await mutations.onSend(text);
        state.updateUIState({ composerText: "", sendStatus: "sent" });
        return {};
      } catch (err) {
        return {
          error: `Send failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    {} as { error?: string },
  );

  const charCount = state.uiState.composerText.length;
  const canSend = charCount > 0 && !isLoading;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      // Submit the form programmatically on Cmd/Ctrl+Enter
      const form = e.currentTarget.form;
      if (form && canSend) form.requestSubmit();
    }
  };

  const insertTemplate = (template: string) => {
    state.updateUIState({
      composerText: (state.uiState.composerText + "\n" + template).trim(),
    });
    setShowTemplates(false);
    textareaRef.current?.focus();
  };

  if (!state.uiState.selectedConversationId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">Select a conversation to compose a message</p>
      </div>
    );
  }

  const errorMessage = sendState.error || state.uiState.flashMessage;

  return (
    <div className="flex flex-col gap-3 border-t p-4">
      {/* Error / flash */}
      {errorMessage && (
        <div
          role="alert"
          className={cn(
            "rounded-control p-2 text-sm",
            sendState.error
              ? "bg-ds-error-50 text-ds-error-900"
              : "bg-ds-primary-50 text-ds-primary-900",
          )}
        >
          {errorMessage}
        </div>
      )}

      {/* Stage warning */}
      {state.escalationState.level <= 1 && (
        <Badge variant="outline" className="w-fit text-ds-warning-700">
          ⚠️ Stage {state.escalationState.level} — no scheduling links yet
        </Badge>
      )}

      {/* Main form — enables useFormStatus in SendButton */}
      <form action={sendAction} className="flex flex-col gap-3">
        <input
          type="hidden"
          name="message"
          value={state.uiState.composerText}
        />
        <Textarea
          ref={textareaRef}
          value={state.uiState.composerText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => state.updateUIState({ composerText: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="Type message… (⌘↵ to send)"
          className="resize-none"
          rows={3}
          disabled={isLoading}
          aria-label="Message text"
        />

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2">
          <CharCounter count={charCount} />
          <div className="flex gap-2">
            <SendButton disabled={!canSend} />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTemplates((v) => !v)}
            >
              Templates
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => state.clearComposer()}
              disabled={charCount === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </form>

      {/* Templates */}
      {showTemplates && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Quick templates
          </p>
          {QUICK_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => insertTemplate(template)}
              className="w-full rounded-control bg-muted p-2 text-left text-sm hover:bg-muted-foreground/20 transition-colors"
            >
              {template}
            </button>
          ))}
        </div>
      )}

      {/* CRM Notes */}
      <details className="border-t pt-2">
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">
          CRM Notes (internal only)
        </summary>
        <Textarea
          value={state.uiState.crmNotesText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => state.updateUIState({ crmNotesText: e.target.value })}
          placeholder="Internal notes visible only to your team…"
          className="mt-2 resize-none"
          rows={2}
        />
      </details>
    </div>
  );
}

export default Composer;


