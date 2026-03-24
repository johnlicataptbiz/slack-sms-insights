/**
 * useInboxState - Consolidated state management for InboxV2
 * Replaces 40+ scattered useState calls with unified state management
 *
 * This hook consolidates all component state into a single, predictable interface
 * making the component easier to test, debug, and extend.
 */

import { useCallback, useState } from 'react';
import type { CallOutcomeV2, QualificationStateV2 } from '../../api/v2-types';

// State type definitions
export interface InboxFilters {
  statusFilter: '' | 'open' | 'closed' | 'dnc';
  needsReplyOnly: boolean;
  ownerFilter: 'all' | 'jack' | 'brandon' | 'unassigned';
  sortMode: 'recent' | 'oldest' | 'urgent' | 'needs_reply';
  search: string;
}

export type QualificationState = QualificationStateV2;

export interface EscalationState {
  level: 1 | 2 | 3 | 4;
  reason: string;
}

export interface UIState {
  isComposerModalOpen: boolean;
  selectedConversationId: string | null;
  selectedDraftId: string | null;
  selectedLineKey: string;
  composerText: string;
  crmNotesText: string;
  flashMessage: string | null;
  pendingMessageText: string | null;
  showTemplates: boolean;
  manualPanelOpen: boolean;
  isGuardrailModalOpen: boolean;
  showDoublePitchWarning: boolean;
  sendStatus: 'idle' | 'sending' | 'sent' | 'error';
  isEmojiPickerOpen: boolean;
  isNarrowComposerViewport: boolean;
}

export interface SelectionState {
  localObjectionTags: string[];
  localCallOutcome: CallOutcomeV2 | null;
}

export const useInboxState = () => {
  // Conversation filters
  const [filters, setFilters] = useState<InboxFilters>({
    statusFilter: 'open',
    needsReplyOnly: true,
    ownerFilter: 'all',
    sortMode: 'recent',
    search: '',
  });

  // UI state
  const [uiState, setUIState] = useState<UIState>({
    isComposerModalOpen: false,
    selectedConversationId: null,
    selectedDraftId: null,
    selectedLineKey: '',
    composerText: '',
    crmNotesText: '',
    flashMessage: null,
    pendingMessageText: null,
    showTemplates: false,
    manualPanelOpen: false,
    isGuardrailModalOpen: false,
    showDoublePitchWarning: false,
    sendStatus: 'idle',
    isEmojiPickerOpen: false,
    isNarrowComposerViewport: false,
  });

  // Qualification state
  const [qualificationState, setQualificationState] = useState<QualificationState>({
    fullOrPartTime: 'unknown',
    niche: null,
    revenueMix: 'unknown',
    deliveryModel: 'unknown',
    coachingInterest: 'unknown',
    progressStep: 0,
  });

  // Escalation state
  const [escalationState, setEscalationState] = useState<EscalationState>({
    level: 1,
    reason: '',
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

  const updateQualification = useCallback((updates: Partial<QualificationState>) => {
    setQualificationState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateEscalation = useCallback((updates: Partial<EscalationState>) => {
    setEscalationState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateSelectionState = useCallback((updates: Partial<SelectionState>) => {
    setSelectionState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Shortcut functions for common operations
  const selectConversation = useCallback(
    (conversationId: string | null) => {
      updateUIState({ selectedConversationId: conversationId });
      // Reset composer and qualification when switching conversations
      updateUIState({
        pendingMessageText: null,
        composerText: '',
        crmNotesText: '',
        selectedDraftId: null,
      });
      setQualificationState({
        fullOrPartTime: 'unknown',
        niche: null,
        revenueMix: 'unknown',
        deliveryModel: 'unknown',
        coachingInterest: 'unknown',
        progressStep: 0,
      });
      setEscalationState({ level: 1, reason: '' });
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
      composerText: '',
      crmNotesText: '',
      pendingMessageText: null,
      selectedDraftId: null,
      selectedLineKey: '',
      sendStatus: 'idle',
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
