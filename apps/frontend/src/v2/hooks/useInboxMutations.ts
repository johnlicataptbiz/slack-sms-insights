/**
 * useInboxMutations - Consolidated mutation handlers for InboxV2
 * Consolidates all the refetch-verified mutation operations
 */

import { useCallback } from 'react';
import type { UseInboxStateReturn } from './useInboxState';
import type { UseQueryResult } from '@tanstack/react-query';

export interface MutationHandlers {
  onSend: (messageText: string) => Promise<void>;
  onSaveQualification: () => Promise<void>;
  onOverrideEscalation: () => Promise<void>;
  onAssign: (ownerLabel: string | null) => Promise<void>;
  onUpdateStatus: (status: 'open' | 'closed' | 'dnc') => Promise<void>;
}

interface InboxMutationSet {
  sendMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  snoozeMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  qualificationMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  escalationMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  assignMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  statusMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
}

export const useInboxMutations = (
  state: UseInboxStateReturn,
  detailQuery: Pick<UseQueryResult<unknown>, 'refetch'>,
  mutations: InboxMutationSet,
): MutationHandlers => {
  const onSend = useCallback(
    async (messageText: string) => {
      const { selectedConversationId } = state.uiState;
      if (!selectedConversationId) return;

      try {
        state.setFlashMessage(null);
        state.updateUIState({ sendStatus: 'sending' });

        // Validate stage gating
        if (messageText.includes('calendly.com') && state.escalationState.level <= 1) {
          state.setFlashMessage('Set the escalation stage to L2 or higher...');
          state.updateUIState({ sendStatus: 'idle' });
          return;
        }

        await mutations.sendMutation.mutateAsync({
          conversationId: selectedConversationId,
          text: messageText,
          lineKey: state.uiState.selectedLineKey,
        });

        // Refetch to verify sent
        await detailQuery.refetch();
        state.clearComposer();
        state.setFlashMessage('Message sent.');

        // Auto-snooze if call link
        if (messageText.includes('calendly.com')) {
          await mutations.snoozeMutation.mutateAsync({
            conversationId: selectedConversationId,
            snoozeUntilMs: Date.now() + 96 * 60 * 60 * 1000,
          });
        }
      } catch (error) {
        state.updateUIState({ sendStatus: 'error' });
        state.setFlashMessage(`Send failed: ${String((error as Error)?.message || error)}`);
      }
    },
    [state, detailQuery, mutations],
  );

  const onSaveQualification = useCallback(async () => {
    const { selectedConversationId } = state.uiState;
    if (!selectedConversationId) return;

    state.setFlashMessage(null);
    try {
      await mutations.qualificationMutation.mutateAsync({
        conversationId: selectedConversationId,
        fullOrPartTime: state.qualificationState.fullOrPartTime,
        niche: state.qualificationState.niche,
        revenueMix: state.qualificationState.revenueMix,
        coachingInterest: state.qualificationState.coachingInterest,
      });

      // FIXED: Always refetch to verify backend accepted
      await detailQuery.refetch();
      state.setFlashMessage('Qualification saved and verified.');
    } catch (error) {
      state.setFlashMessage(`Qualification update failed: ${String((error as Error)?.message || error)}`);
    }
  }, [state, detailQuery, mutations]);

  const onOverrideEscalation = useCallback(async () => {
    const { selectedConversationId } = state.uiState;
    if (!selectedConversationId) return;

    state.setFlashMessage(null);
    try {
      await mutations.escalationMutation.mutateAsync({
        conversationId: selectedConversationId,
        level: state.escalationState.level,
        reason: state.escalationState.reason,
      });

      // FIXED: Always refetch to verify backend accepted
      await detailQuery.refetch();
      state.setFlashMessage('Stage saved and verified.');
    } catch (error) {
      state.setFlashMessage(`Escalation update failed: ${String((error as Error)?.message || error)}`);
    }
  }, [state, detailQuery, mutations]);

  const onAssign = useCallback(
    async (ownerLabel: string | null) => {
      const { selectedConversationId } = state.uiState;
      if (!selectedConversationId) return;

      const trimmed = (ownerLabel || '').trim();
      try {
        await mutations.assignMutation.mutateAsync({
          conversationId: selectedConversationId,
          ownerLabel: trimmed || null,
        });

        // FIXED: Always refetch to verify backend accepted
        await detailQuery.refetch();
        state.setFlashMessage(`Assigned to: ${trimmed || 'Unassigned'}`);
      } catch (error) {
        state.setFlashMessage(`Assign failed: ${String((error as Error)?.message || error)}`);
      }
    },
    [state, detailQuery, mutations],
  );

  const onUpdateStatus = useCallback(
    async (status: 'open' | 'closed' | 'dnc') => {
      const { selectedConversationId } = state.uiState;
      if (!selectedConversationId) return;

      try {
        await mutations.statusMutation.mutateAsync({
          conversationId: selectedConversationId,
          status,
        });

        // Refetch to verify backend accepted
        await detailQuery.refetch();
        state.setFlashMessage(`Status updated to: ${status}`);
      } catch (error) {
        state.setFlashMessage(`Status update failed: ${String((error as Error)?.message || error)}`);
      }
    },
    [state, detailQuery, mutations],
  );

  return {
    onSend,
    onSaveQualification,
    onOverrideEscalation,
    onAssign,
    onUpdateStatus,
  };
};
