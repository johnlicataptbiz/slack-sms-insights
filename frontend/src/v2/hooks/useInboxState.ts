/**
 * useInboxState - Consolidated state management for InboxV2
 * Replaces 40+ scattered useState calls with unified state management
 *
 * This hook consolidates all component state into a single, predictable interface
 * making the component easier to test, debug, and extend.
 */

import { useState, useCallback } from "react";

// State type definitions
export interface InboxFilters {
  statusFilter: "all" | "open" | "closed" | "dnc";
  needsReplyOnly: boolean;
  ownerFilter: string | null;
  sortMode: "recent" | "oldest" | "urgent" | "needs_reply";
  search: string;
}

export interface QualificationState {
  fullOrPartTime: string | null;
  niche: string | null;
  revenueMix: string | null;
  coachingInterest: boolean;
}

export interface EscalationState {
  level: number;
  reason: string;
}

export interface UIState {
  selectedConversationId: string | null;
  selectedDraftId: string | null;
  selectedLineKey: string | null;
  composerText: string;
  crmNotesText: string;
  flashMessage: string | null;
  showTemplates: boolean;
  manualPanelOpen: boolean;
  isGuardrailModalOpen: boolean;
  showDoublePitchWarning: boolean;
  sendStatus: "idle" | "sending" | "error";
  isEmojiPickerOpen: boolean;
  isNarrowComposerViewport: boolean;
}

export interface SelectionState {
  localObjectionTags: string[];
  localCallOutcome: string | null;
}

export const useInboxState = () => {
  // Conversation filters
  const [filters, setFilters] = useState<InboxFilters>({
    statusFilter: "all",
    needsReplyOnly: false,
    ownerFilter: null,
    sortMode: "recent",
    search: "",
  });

  // UI state
  const [uiState, setUIState] = useState<UIState>({
    selectedConversationId: null,
    selectedDraftId: null,
    selectedLineKey: null,
    composerText: "",
    crmNotesText: "",
    flashMessage: null,
    showTemplates: false,
    manualPanelOpen: false,
    isGuardrailModalOpen: false,
    showDoublePitchWarning: false,
    sendStatus: "idle",
    isEmojiPickerOpen: false,
    isNarrowComposerViewport: false,
  });

  // Qualification state
  const [qualificationState, setQualificationState] =
    useState<QualificationState>({
      fullOrPartTime: null,
      niche: null,
      revenueMix: null,
      coachingInterest: false,
    });

  // Escalation state
  const [escalationState, setEscalationState] = useState<EscalationState>({
    level: 0,
    reason: "",
  });

  // Selection state (tags, outcomes)
  const [selectionState, setSelectionState] = useState<SelectionState>({
    localObjectionTags: [],
    localCallOutcome: null,
  });

  // Unified updater functions
  const updateFilters = useCallback((updates: Partial<InboxFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateUIState = useCallback((updates: Partial<UIState>) => {
    setUIState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateQualification = useCallback(
    (updates: Partial<QualificationState>) => {
      setQualificationState((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const updateEscalation = useCallback((updates: Partial<EscalationState>) => {
    setEscalationState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateSelectionState = useCallback(
    (updates: Partial<SelectionState>) => {
      setSelectionState((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // Shortcut functions for common operations
  const selectConversation = useCallback(
    (conversationId: string | null) => {
      updateUIState({ selectedConversationId: conversationId });
      // Reset composer and qualification when switching conversations
      updateUIState({
        composerText: "",
        crmNotesText: "",
        selectedDraftId: null,
      });
      setQualificationState({
        fullOrPartTime: null,
        niche: null,
        revenueMix: null,
        coachingInterest: false,
      });
      setEscalationState({ level: 0, reason: "" });
      setSelectionState({ localObjectionTags: [], localCallOutcome: null });
    },
    [updateUIState],
  );

  const setFlashMessage = useCallback(
    (message: string | null) => {
      updateUIState({ flashMessage: message });
    },
    [updateUIState],
  );

  const clearComposer = useCallback(() => {
    updateUIState({
      composerText: "",
      crmNotesText: "",
      selectedDraftId: null,
      selectedLineKey: null,
      sendStatus: "idle",
    });
  }, [updateUIState]);

  return {
    // State objects
    filters,
    uiState,
    qualificationState,
    escalationState,
    selectionState,

    // Update functions
    updateFilters,
    updateUIState,
    updateQualification,
    updateEscalation,
    updateSelectionState,

    // Shortcut functions
    selectConversation,
    setFlashMessage,
    clearComposer,
  };
};

export type UseInboxStateReturn = ReturnType<typeof useInboxState>;
