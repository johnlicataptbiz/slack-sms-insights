/**
 * Composer.tsx - Always-visible message composition UI
 * Moved from modal-based to persistent sidebar component
 */

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { UseInboxStateReturn } from "@/v2/hooks/useInboxState";
import type { MutationHandlers } from "@/v2/hooks/useInboxMutations";

interface ComposerProps {
  state: UseInboxStateReturn;
  mutations: MutationHandlers;
  isLoading: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  state,
  mutations,
  isLoading,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [charCount, setCharCount] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);

  // Stage gating: warn if trying to send link on low stages
  const canSendLink = (state.escalationState.level || 0) >= 2;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    state.updateUIState({ composerText: text });
    setCharCount(text.length);
  };

  const handleSend = async () => {
    const text = state.uiState.composerText.trim();
    if (!text) return;

    // Validation: Check for Calendly link on too-early stage
    if (text.includes("calendly.com") && !canSendLink) {
      state.setFlashMessage(
        `⚠️ Escalate to Stage ${2 - (state.escalationState.level || 0)} before sending scheduling links`,
      );
      return;
    }

    try {
      await mutations.onSend(text);
    } catch (error) {
      state.setFlashMessage(
        `Send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
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
        <p>Select a conversation to compose a message</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t p-4">
      {/* Flash message */}
      {state.uiState.flashMessage && (
        <div className="rounded bg-blue-50 p-2 text-sm text-blue-900">
          {state.uiState.flashMessage}
        </div>
      )}

      {/* Stage warning badge */}
      {state.escalationState.level <= 1 && (
        <Badge variant="outline" className="w-fit">
          ⚠️ Stage {state.escalationState.level} - No scheduling links yet
        </Badge>
      )}

      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        value={state.uiState.composerText}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder="Type message... (Cmd/Ctrl + Enter to send)"
        className="resize-none"
        rows={3}
        disabled={isLoading}
      />

      {/* Char count */}
      <div className="text-right text-xs text-muted-foreground">
        {charCount} characters
      </div>

      {/* Button row */}
      <div className="flex gap-2">
        <Button
          onClick={handleSend}
          disabled={!state.uiState.composerText.trim() || isLoading}
          className="flex-1"
        >
          {state.uiState.sendStatus === "sending" ? "Sending..." : "Send"}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          Templates
        </Button>

        <Button
          variant="ghost"
          onClick={() => state.clearComposer()}
          disabled={!state.uiState.composerText}
        >
          Clear
        </Button>
      </div>

      {/* Templates dropdown */}
      {showTemplates && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Quick templates:
          </p>
          {[
            "What specific challenges are you facing",
            "Let me send you a booking link: https://calendly.com/",
            "When would be the best time to chat?",
            "Thanks for your interest! Here's more info: ",
          ].map((template, i) => (
            <button
              key={i}
              onClick={() => insertTemplate(template)}
              className="w-full rounded bg-muted p-2 text-left text-sm hover:bg-muted-foreground/20"
            >
              {template}
            </button>
          ))}
        </div>
      )}

      {/* CRM Notes (secondary textarea for internal notes) */}
      <details className="border-t pt-2">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          CRM Notes (internal only)
        </summary>
        <Textarea
          value={state.uiState.crmNotesText}
          onChange={(e) =>
            state.updateUIState({ crmNotesText: e.target.value })
          }
          placeholder="Internal notes visible only to your team..."
          className="mt-2 resize-none"
          rows={2}
        />
      </details>
    </div>
  );
};

export default Composer;
