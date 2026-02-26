import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  useV2AddConversationNote,
  useV2AssignConversation,
  useV2ConversationNotes,
  useV2CreateTemplate,
  useV2DeleteTemplate,
  useV2GenerateDraft,
  useV2InboxConversationDetail,
  useV2InboxConversations,
  useV2InboxSendConfig,
  useV2InboxTemplates,
  useV2IncrementGuardrailOverride,
  useV2ObjectionFrequency,
  useV2OverrideEscalation,
  useV2SendInboxMessage,
  useV2SetDefaultSendLine,
  useV2SnoozeConversation,
  useV2StageConversion,
  useV2UpdateCallOutcome,
  useV2UpdateConversationStatus,
  useV2UpdateObjectionTags,
  useV2UpdateQualification,
} from '../../api/v2Queries';
import { CALL_OUTCOME_LABELS } from '../../api/v2-types';
import type { CallOutcomeV2, QualificationStateV2 } from '../../api/v2-types';
import { V2State } from '../components/V2Primitives';
import { useToast } from '../hooks/useToast';

const fmtDateTime = (value: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const timeAgo = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const shorten = (value: string | null, max = 100): string => {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

// ---------------------------------------------------------------------------
// Link Detection
// ---------------------------------------------------------------------------
const CALL_LINK_PATTERNS = [
  'calendly.com',
  'cal.com',
  'acuityscheduling.com',
  'oncehub.com',
  'hubspot.com/meetings',
  'tidycal.com',
  'savvycal.com',
  'physicaltherapybiz.com/call-booked',
];

const PODCAST_LINK_PATTERNS = [
  'ptbizinsider.com',
  'spotify.com',
  'podcasts.apple.com',
  'anchor.fm',
  'buzzsprout.com',
  'physicaltherapybiz.com/blog',
  'drdannymatta.com',
];

const containsCallLink = (text: string): boolean => {
  const lower = text.toLowerCase();
  return CALL_LINK_PATTERNS.some((pattern) => lower.includes(pattern));
};

const containsPodcastLink = (text: string): boolean => {
  const lower = text.toLowerCase();
  return PODCAST_LINK_PATTERNS.some((pattern) => lower.includes(pattern));
};

// ---------------------------------------------------------------------------
// SMS segment counter
// GSM-7: 160 chars single / 153 chars per segment in multi-part
// Unicode (UCS-2): 70 chars single / 67 chars per segment in multi-part
// ---------------------------------------------------------------------------
const getSmsSegmentInfo = (text: string) => {
  const len = text.length;
  if (len === 0) return { segments: 0, charsRemaining: 160, isUnicode: false };
  // Detect characters outside the GSM-7 basic + extended set
  const isUnicode = /[^\u0000-\u00FF\u20AC]/.test(text);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  const segments = len <= singleLimit ? 1 : Math.ceil(len / multiLimit);
  const charsRemaining = segments === 1 ? singleLimit - len : segments * multiLimit - len;
  return { segments, charsRemaining, isUnicode };
};

// ---------------------------------------------------------------------------
// Aloware / carrier error code → human-readable tooltip
// ---------------------------------------------------------------------------
const ALOWARE_ERROR_MAP: Record<string, string> = {
  landline: 'Landline — this number cannot receive SMS',
  voip: 'VoIP number — delivery not guaranteed',
  invalid: 'Invalid number — check formatting',
  blocked: 'Blocked by carrier — number may be on DNC list',
  dnc: 'Do Not Contact — number is on the DNC list',
  'opt-out': 'Opted out — contact has unsubscribed',
  unsubscribed: 'Opted out — contact has unsubscribed',
  spam: 'Flagged as spam by carrier',
  carrier: 'Carrier violation — message content may be blocked',
  duplicate: 'Duplicate — identical message sent recently',
  'rate-limit': 'Rate limited — too many messages sent too quickly',
  'no-line': 'No send line configured',
  disabled: 'Sending disabled for this contact',
};

const humanizeAlowareError = (reason: string | null | undefined): string => {
  if (!reason) return 'Unknown error';
  const lower = reason.toLowerCase();
  for (const [key, label] of Object.entries(ALOWARE_ERROR_MAP)) {
    if (lower.includes(key)) return label;
  }
  return reason;
};

const formatSendLineLabel = (params: {
  label?: string | null;
  lineId?: number | null;
  fromNumber?: string | null;
}): string => {
  const parts: string[] = [];
  if (params.label && params.label.trim().length > 0) {
    parts.push(params.label.trim());
  }
  if (params.lineId != null) {
    parts.push(`line ${params.lineId}`);
  }
  if (params.fromNumber) {
    parts.push(params.fromNumber);
  }
  if (parts.length === 0) return 'Account default line';
  return parts.join(' · ');
};

const displaySetterName = (value: string | null | undefined): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes('jack')) return 'Jack';
  if (lower.includes('brandon')) return 'Brandon';
  // Filter out system/dashboard/automated users
  if (
    lower.includes('dashboard') ||
    lower.includes('password') ||
    lower.includes('system') ||
    lower.includes('bot') ||
    lower.includes('automated')
  ) return null;
  return trimmed;
};

const getSetterColor = (name: string | null | undefined): string => {
  const setter = displaySetterName(name);
  if (setter === 'Jack') return '#11b8d6';
  if (setter === 'Brandon') return '#13b981';
  return '#56607a';
};

type StateTone = 'red' | 'orange' | 'yellow' | 'green';

const computeQualificationProgress = (state: QualificationStateV2): number => {
  let score = 0;
  if (state.fullOrPartTime !== 'unknown') score += 1;
  if ((state.niche || '').trim().length > 0) score += 1;
  if (state.revenueMix !== 'unknown') score += 1;
  if (state.coachingInterest !== 'unknown') score += 1;
  return score;
};

const qualificationToneForProgress = (progress: number): StateTone => {
  if (progress <= 0) return 'red';
  if (progress === 1) return 'orange';
  if (progress === 2) return 'yellow';
  return 'green';
};

const escalationToneForLevel = (level: 1 | 2 | 3 | 4): StateTone => {
  if (level <= 1) return 'red';
  if (level === 2) return 'orange';
  if (level === 3) return 'yellow';
  return 'green';
};

const escalationLevelSubtitle = (level: 1 | 2 | 3 | 4): string => {
  if (level === 1) return 'Awareness';
  if (level === 2) return 'Objection Bridge';
  if (level === 3) return 'Call First';
  return 'Scaling Hybrid';
};

export default function InboxV2() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'dnc' | ''>('open');
  const [needsReplyOnly, setNeedsReplyOnly] = useState(true);
  const toast = useToast();
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'jack' | 'brandon' | 'unassigned'>('all');
  const [search, setSearch] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftPrefillDoneForConversation, setDraftPrefillDoneForConversation] = useState<string | null>(null);
  const [selectedLineKey, setSelectedLineKey] = useState('');
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [justSentMessage, setJustSentMessage] = useState<{text: string; timestamp: string; confirmed?: boolean} | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);

  const [qualificationState, setQualificationState] = useState<QualificationStateV2>({
    fullOrPartTime: 'unknown',
    niche: '',
    revenueMix: 'unknown',
    coachingInterest: 'unknown',
    progressStep: 0,
  });
  const [escalationLevel, setEscalationLevel] = useState<1 | 2 | 3 | 4>(1);
  const [escalationReason, setEscalationReason] = useState('');

  // Phase 2 — Team Collaboration
  const [noteText, setNoteText] = useState('');
  const [snoozeDate, setSnoozeDate] = useState('');
  const [assignLabel, setAssignLabel] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');

  // Phase 3 state
  const [objectionTagInput, setObjectionTagInput] = useState('');
  const [localObjectionTags, setLocalObjectionTags] = useState<string[]>([]);
  const [localCallOutcome, setLocalCallOutcome] = useState<CallOutcomeV2 | null>(null);

  // Phase 2 Guardrail Modal state
  const [isGuardrailModalOpen, setIsGuardrailModalOpen] = useState(false);
  const [guardrailChecks, setGuardrailChecks] = useState<Record<string, boolean>>({});
  const [pendingMessageText, setPendingMessageText] = useState<string | null>(null);
  // Double Pitch Protection banner
  const [showDoublePitchWarning, setShowDoublePitchWarning] = useState(false);

  const qualificationProgressLive = computeQualificationProgress(qualificationState);
  const qualificationTone = qualificationToneForProgress(qualificationProgressLive);
  const qualificationProgressPct = Math.round((qualificationProgressLive / 4) * 100);
  const escalationTone = escalationToneForLevel(escalationLevel);
  const escalationProgressPct = Math.round((escalationLevel / 4) * 100);
  const qualificationFields = [
    { key: 'full', label: 'Full or part time', complete: qualificationState.fullOrPartTime !== 'unknown' },
    { key: 'niche', label: 'Niche', complete: (qualificationState.niche || '').trim().length > 0 },
    { key: 'mix', label: 'Revenue mix', complete: qualificationState.revenueMix !== 'unknown' },
    { key: 'coach', label: 'Coaching interest', complete: qualificationState.coachingInterest !== 'unknown' },
  ];

  const listQuery = useV2InboxConversations({
    ...(statusFilter ? { status: statusFilter } : {}),
    needsReplyOnly,
    search,
    limit: 75,
    offset: 0,
  });

  const conversationsRaw = listQuery.data?.data.items || [];
  const conversations = conversationsRaw.filter((conversation) => {
    if (ownerFilter === 'all') return true;
    const owner = (conversation.ownerLabel || '').toLowerCase();
    if (ownerFilter === 'jack') return owner === 'jack';
    if (ownerFilter === 'brandon') return owner === 'brandon';
    if (ownerFilter === 'unassigned') return owner.length === 0;
    return true;
  });

  // Analytics calculations
  const totalConversations = conversations.length;
  const unreadCount = conversations.filter(c => c.openNeedsReplyCount > 0).length;
  const urgentCount = conversations.filter(c => c.escalation.level <= 2 && c.openNeedsReplyCount > 0).length;
  const jackCount = conversations.filter(c => displaySetterName(c.ownerLabel) === 'Jack').length;
  const brandonCount = conversations.filter(c => displaySetterName(c.ownerLabel) === 'Brandon').length;
  const unassignedCount = conversations.filter(c => !c.ownerLabel).length;
  const inboxHealth = Math.max(0, Math.min(100, 100 - (urgentCount * 10) - (unassignedCount * 5)));

  useEffect(() => {
    // Do NOT auto-switch while the composer modal is open.
    // When needsReplyOnly is true, a conversation drops out of the filtered list
    // the moment you reply to it — without this guard the effect would immediately
    // snap selectedConversationId to conversations[0] (a completely different
    // contact) while the user is still looking at the modal they just sent from.
    if (isComposerModalOpen) return;

    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]?.id || null);
      return;
    }

    if (selectedConversationId && !conversations.some((row) => row.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0]?.id || null);
    }
  }, [conversations, selectedConversationId, isComposerModalOpen]);

  const detailQuery = useV2InboxConversationDetail(selectedConversationId);

  const generateDraftMutation = useV2GenerateDraft();
  const sendMutation = useV2SendInboxMessage();
  const sendConfigQuery = useV2InboxSendConfig();
  const setDefaultLineMutation = useV2SetDefaultSendLine();
  const qualificationMutation = useV2UpdateQualification();
  const escalationMutation = useV2OverrideEscalation();
  const statusMutation = useV2UpdateConversationStatus();

  // Phase 2 hooks
  const notesQuery = useV2ConversationNotes(selectedConversationId);
  const addNoteMutation = useV2AddConversationNote();
  const snoozeMutation = useV2SnoozeConversation();
  const assignMutation = useV2AssignConversation();
  const templatesQuery = useV2InboxTemplates();
  const createTemplateMutation = useV2CreateTemplate();
  const deleteTemplateMutation = useV2DeleteTemplate();

  // Phase 3 hooks
  const stageConversionQuery = useV2StageConversion();
  const objectionFrequencyQuery = useV2ObjectionFrequency();
  const updateObjectionTagsMutation = useV2UpdateObjectionTags();
  const updateCallOutcomeMutation = useV2UpdateCallOutcome();
  const incrementGuardrailOverrideMutation = useV2IncrementGuardrailOverride();

  const detail = detailQuery.data?.data || null;
  const sendConfig = sendConfigQuery.data?.data || null;
  const lineOptions = sendConfig?.lines || [];
  const selectedLineOption = lineOptions.find((option) => option.key === selectedLineKey) || null;
  const lineSelectionRequired = Boolean(sendConfig?.requiresSelection) && !selectedLineOption;
  const savedDefaultSummary = sendConfig?.defaultSelection
    ? formatSendLineLabel(sendConfig.defaultSelection)
    : 'No saved default line';

  useEffect(() => {
    if (!sendConfig) return;
    if (selectedLineKey && lineOptions.some((option) => option.key === selectedLineKey)) return;

    if (sendConfig.defaultSelection?.key && lineOptions.some((option) => option.key === sendConfig.defaultSelection?.key)) {
      setSelectedLineKey(sendConfig.defaultSelection.key);
      return;
    }

    if (lineOptions.length === 1) {
      const onlyOption = lineOptions[0];
      if (onlyOption) {
        setSelectedLineKey(onlyOption.key);
      }
      return;
    }

    setSelectedLineKey('');
  }, [lineOptions, selectedLineKey, sendConfig]);

  useEffect(() => {
    if (!detail) return;

    setQualificationState(detail.conversation.qualification);
    setEscalationLevel(detail.conversation.escalation.level);
    setEscalationReason(detail.conversation.escalation.reason || '');
    setAssignLabel(detail.conversation.ownerLabel || '');
    setLocalObjectionTags(detail.conversation.objectionTags ?? []);
    setLocalCallOutcome(detail.conversation.callOutcome ?? null);
  }, [detail]);

  useEffect(() => {
    setDraftPrefillDoneForConversation(null);
    // Clear the optimistic sent-message bubble so it doesn't bleed into the
    // next conversation's thread when the user switches contacts.
    setJustSentMessage(null);
    setShowDoublePitchWarning(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!detail) return;
    if (!selectedConversationId) return;
    if (draftPrefillDoneForConversation === selectedConversationId) return;

    const latestDraft = detail.drafts[0];
    if (!latestDraft) return;

    if (composerText.trim().length === 0) {
      setComposerText(latestDraft.text);
      setSelectedDraftId(latestDraft.id);
    }
    setDraftPrefillDoneForConversation(selectedConversationId);
  }, [detail, composerText, selectedConversationId, draftPrefillDoneForConversation]);

  useEffect(() => {
    if (!isComposerModalOpen || !selectedConversationId || !detail) return;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [isComposerModalOpen, selectedConversationId, detail?.conversation.id]);

  // Auto-scroll chat thread to bottom whenever messages load or a new message is sent
  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [detail?.messages, justSentMessage]);

  useEffect(() => {
    if (!isComposerModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsComposerModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isComposerModalOpen]);

  const onGenerateDraft = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      const result = await generateDraftMutation.mutateAsync({
        conversationId: selectedConversationId,
      });
      setComposerText(result.data.text);
      setSelectedDraftId(result.data.id);
      setDraftPrefillDoneForConversation(selectedConversationId);
      if (result.data.generationMode === 'contextual_fallback') {
        const firstWarning = result.data.generationWarnings[0] || 'AI generation unavailable';
        setFlashMessage(`Draft generated in fallback mode. ${firstWarning}`);
        return;
      }
      if (result.data.lint.passed) {
        setFlashMessage('Draft generated and passed quality check.');
      } else {
        setFlashMessage('Draft generated with quality issues. Review before sending.');
      }
    } catch (error) {
      setFlashMessage(`Draft generation failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onSend = async () => {
    if (!selectedConversationId || composerText.trim().length === 0) return;
    if (lineSelectionRequired) {
      setFlashMessage('Select a send line before sending.');
      return;
    }

    const messageText = composerText.trim();

    // Phase 2: Stage Gating
    if (containsCallLink(messageText) && escalationLevel <= 1) {
      setFlashMessage('Set the escalation stage to L2 or higher before sending a call link.');
      return;
    }

    // Phase 2: Double Pitch Protection — detect prior outbound call link with no inbound reply since
    if (containsCallLink(messageText) && detail?.messages) {
      const msgs = detail.messages;
      // Find the last outbound call link index
      let lastCallLinkOutboundIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].direction === 'outbound' && msgs[i].body && containsCallLink(msgs[i].body!)) {
          lastCallLinkOutboundIdx = i;
          break;
        }
      }
      if (lastCallLinkOutboundIdx !== -1) {
        // Check if there's any inbound reply AFTER that outbound call link
        const hasReplyAfter = msgs.slice(lastCallLinkOutboundIdx + 1).some(m => m.direction === 'inbound');
        if (!hasReplyAfter) {
          // Show the banner and block send — user must dismiss or it stays visible
          setShowDoublePitchWarning(true);
          return;
        }
      }
    }

    // Phase 2: Guardrail Checklist (L3/L4)
    if (containsCallLink(messageText) && escalationLevel >= 3) {
      setPendingMessageText(messageText);
      setIsGuardrailModalOpen(true);
      return;
    }

    await executeSend(messageText);
  };

  const executeSend = async (messageText: string) => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    setSendStatus('sending');

    try {
      const sendFromNumber = selectedLineOption?.lineId == null ? selectedLineOption?.fromNumber || null : null;
      const result = await sendMutation.mutateAsync({
        conversationId: selectedConversationId,
        body: messageText,
        idempotencyKey: `inbox-${Date.now()}`,
        ...(selectedLineOption?.lineId != null ? { lineId: selectedLineOption.lineId } : {}),
        ...(sendFromNumber ? { fromNumber: sendFromNumber } : {}),
        ...(selectedDraftId ? { draftId: selectedDraftId } : {}),
      });
      const lineSummary = formatSendLineLabel(result.data.lineSelection);
      
      if (result.data.status === 'sent' || result.data.status === 'duplicate') {
        setSendStatus('sent');
        setJustSentMessage({ text: messageText, timestamp: new Date().toISOString(), confirmed: true });
        
        setComposerText('');
        setSelectedDraftId(null);
        toast.success('Message sent successfully');
        
        // Phase 2: Auto-Snooze
        if (containsPodcastLink(messageText)) {
          const snoozeUntil = new Date();
          snoozeUntil.setHours(snoozeUntil.getHours() + 72); // 72 hours
          await snoozeMutation.mutateAsync({ conversationId: selectedConversationId, snoozedUntil: snoozeUntil.toISOString() });
          toast.info('Podcast link sent. Snoozed for 72 hours.');
        } else if (containsCallLink(messageText)) {
          const snoozeUntil = new Date();
          snoozeUntil.setHours(snoozeUntil.getHours() + 96); // 96 hours (4 days)
          await snoozeMutation.mutateAsync({ conversationId: selectedConversationId, snoozedUntil: snoozeUntil.toISOString() });
          toast.info('Call link sent. Snoozed for 4 days.');
        }

        setTimeout(() => {
          setSendStatus('idle');
        }, 2000);
      } else {
        setSendStatus('error');
        toast.error(`Send blocked: ${humanizeAlowareError(result.data.reason)} · ${lineSummary}`);
      }
    } catch (error) {
      setSendStatus('error');
      toast.error(`Send failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onSaveDefaultLine = async () => {
    if (!selectedLineOption) {
      setFlashMessage('Choose a line before saving default.');
      return;
    }

    setFlashMessage(null);
    try {
      const defaultFromNumber = selectedLineOption.fromNumber || null;
      await setDefaultLineMutation.mutateAsync({
        ...(selectedLineOption?.lineId != null ? { lineId: selectedLineOption.lineId } : {}),
        ...(defaultFromNumber ? { fromNumber: defaultFromNumber } : {}),
      });
      setFlashMessage(`Default send line saved: ${formatSendLineLabel(selectedLineOption)}`);
    } catch (error) {
      setFlashMessage(`Failed to save default line: ${String((error as Error)?.message || error)}`);
    }
  };

  const onClearDefaultLine = async () => {
    setFlashMessage(null);
    try {
      await setDefaultLineMutation.mutateAsync({ clear: true });
      setFlashMessage('Default send line cleared.');
    } catch (error) {
      setFlashMessage(`Failed to clear default line: ${String((error as Error)?.message || error)}`);
    }
  };

  const onClearDraft = () => {
    if (!selectedConversationId) return;
    setComposerText('');
    setSelectedDraftId(null);
    setDraftPrefillDoneForConversation(selectedConversationId);
    setFlashMessage('Draft cleared.');
  };

  const onSaveQualification = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      await qualificationMutation.mutateAsync({
        conversationId: selectedConversationId,
        fullOrPartTime: qualificationState.fullOrPartTime,
        niche: qualificationState.niche,
        revenueMix: qualificationState.revenueMix,
        coachingInterest: qualificationState.coachingInterest,
      });
      setFlashMessage('Qualification saved.');
    } catch (error) {
      setFlashMessage(`Qualification update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onOverrideEscalation = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      await escalationMutation.mutateAsync({
        conversationId: selectedConversationId,
        level: escalationLevel,
        reason: escalationReason,
      });
      setFlashMessage('Stage saved.');
    } catch (error) {
      setFlashMessage(`Escalation update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onUpdateStatus = async (status: 'open' | 'closed' | 'dnc') => {
    if (!selectedConversationId) return;
    try {
      await statusMutation.mutateAsync({ conversationId: selectedConversationId, status });
      toast.success(`Conversation marked as ${status.toUpperCase()}`);
    } catch (error) {
      toast.error(`Status update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  // ── Phase 3 handlers ──────────────────────────────────────────────────────

  const onAddObjectionTag = async () => {
    const tag = objectionTagInput.trim();
    if (!tag || !selectedConversationId) return;
    const next = localObjectionTags.includes(tag) ? localObjectionTags : [...localObjectionTags, tag];
    setLocalObjectionTags(next);
    setObjectionTagInput('');
    try {
      await updateObjectionTagsMutation.mutateAsync({ conversationId: selectedConversationId, tags: next });
    } catch (error) {
      setFlashMessage(`Objection tag update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onRemoveObjectionTag = async (tag: string) => {
    if (!selectedConversationId) return;
    const next = localObjectionTags.filter((t) => t !== tag);
    setLocalObjectionTags(next);
    try {
      await updateObjectionTagsMutation.mutateAsync({ conversationId: selectedConversationId, tags: next });
    } catch (error) {
      setFlashMessage(`Objection tag update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onSetCallOutcome = async (outcome: CallOutcomeV2 | null) => {
    if (!selectedConversationId) return;
    setLocalCallOutcome(outcome);
    try {
      await updateCallOutcomeMutation.mutateAsync({ conversationId: selectedConversationId, outcome });
    } catch (error) {
      setFlashMessage(`Call outcome update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onIncrementGuardrailOverride = async () => {
    if (!selectedConversationId) return;
    try {
      await incrementGuardrailOverrideMutation.mutateAsync(selectedConversationId);
      setFlashMessage('Override recorded.');
    } catch (error) {
      setFlashMessage(`Guardrail override failed: ${String((error as Error)?.message || error)}`);
    }
  };

  // ── Phase 2 handlers ──────────────────────────────────────────────────────

  const onAddNote = async () => {
    if (!selectedConversationId || noteText.trim().length === 0) return;
    try {
      await addNoteMutation.mutateAsync({ conversationId: selectedConversationId, author: 'agent', text: noteText.trim() });
      setNoteText('');
    } catch (error) {
      setFlashMessage(`Note failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onSnooze = async () => {
    if (!selectedConversationId || !snoozeDate) return;
    try {
      await snoozeMutation.mutateAsync({ conversationId: selectedConversationId, snoozedUntil: snoozeDate });
      setSnoozeDate('');
      setFlashMessage('Conversation snoozed.');
    } catch (error) {
      setFlashMessage(`Snooze failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onClearSnooze = async () => {
    if (!selectedConversationId) return;
    try {
      await snoozeMutation.mutateAsync({ conversationId: selectedConversationId, snoozedUntil: null });
      setFlashMessage('Snooze cleared.');
    } catch (error) {
      setFlashMessage(`Clear snooze failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onAssign = async () => {
    if (!selectedConversationId) return;
    try {
      await assignMutation.mutateAsync({
        conversationId: selectedConversationId,
        ownerLabel: assignLabel.trim() || null,
      });
      setFlashMessage(`Assigned to: ${assignLabel.trim() || 'Unassigned'}`);
    } catch (error) {
      setFlashMessage(`Assign failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onInsertTemplate = (body: string) => {
    const name = detail?.contactCard.name || '';
    const filled = body.replace(/\{\{name\}\}/gi, name);
    setComposerText(filled);
    setShowTemplates(false);
  };

  const onCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateBody.trim()) return;
    try {
      await createTemplateMutation.mutateAsync({
        name: newTemplateName.trim(),
        body: newTemplateBody.trim(),
      });
      setNewTemplateName('');
      setNewTemplateBody('');
    } catch (error) {
      setFlashMessage(`Template save failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplateMutation.mutateAsync(id);
    } catch (error) {
      setFlashMessage(`Template delete failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#13b981';
    if (score >= 60) return '#f59d0d';
    return '#ef4c62';
  };

  const GUARDRAIL_SIGNALS = [
    { id: 'timeline', label: 'Timeline — Has a clear start date in mind' },
    { id: 'cash', label: 'Cash Intent — Expressed desire to go cash-pay' },
    { id: 'revenue', label: 'Revenue Ambition — Mentioned revenue goal or frustration with current income' },
    { id: 'frustration', label: 'Frustration — Expressed frustration with current situation' },
    { id: 'complexity', label: 'Complexity — Has a complex case (multiple staff, insurance transition)' },
    { id: 'engagement', label: 'Engagement — Replied 3+ times in this thread' },
    { id: 'howto', label: 'How-To Question — Asked a how-to or implementation question' },
  ];

  const checkedGuardrailsCount = Object.values(guardrailChecks).filter(Boolean).length;
  const canPassGuardrails = checkedGuardrailsCount >= 2;

  const canOverrideGuardrails = checkedGuardrailsCount >= 1;

  const onConfirmGuardrails = async () => {
    if (!selectedConversationId || !pendingMessageText) return;
    
    if (!canPassGuardrails) {
      if (!canOverrideGuardrails) {
        setFlashMessage('Not enough signals. Check at least 1 to override.');
        return;
      }
      // Log override
      try {
        await incrementGuardrailOverrideMutation.mutateAsync(selectedConversationId);
      } catch (error) {
        console.error('Failed to log override', error);
      }
    }

    setIsGuardrailModalOpen(false);
    setGuardrailChecks({});
    await executeSend(pendingMessageText);
    setPendingMessageText(null);
  };

  return (
    <div className="V2Page V2Inbox">
      {/* Floating Filter Bar */}
      <div className="V2Inbox__filterBar">
        <div className="V2Inbox__filterGroup">
          <button 
            className={`V2Inbox__filterChip ${statusFilter === 'open' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')}
          >
            <span className="V2Inbox__filterDot" style={{ background: '#13b981' }} />
            Open
          </button>
          <button 
            className={`V2Inbox__filterChip ${statusFilter === 'closed' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'closed' ? '' : 'closed')}
          >
            <span className="V2Inbox__filterDot" style={{ background: '#56607a' }} />
            Closed
          </button>
          <button 
            className={`V2Inbox__filterChip ${statusFilter === 'dnc' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'dnc' ? '' : 'dnc')}
          >
            <span className="V2Inbox__filterDot" style={{ background: '#ef4c62' }} />
            DNC
          </button>
        </div>

        <div className="V2Inbox__searchBox">
          <svg className="V2Inbox__searchIcon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="V2Inbox__filterGroup">
          <button 
            className={`V2Inbox__ownerChip ${ownerFilter === 'jack' ? 'is-active' : ''}`}
            onClick={() => setOwnerFilter(ownerFilter === 'jack' ? 'all' : 'jack')}
            style={{ '--owner-color': '#11b8d6' } as React.CSSProperties}
          >
            <span className="V2Inbox__ownerAvatar">J</span>
            Jack
          </button>
          <button 
            className={`V2Inbox__ownerChip ${ownerFilter === 'brandon' ? 'is-active' : ''}`}
            onClick={() => setOwnerFilter(ownerFilter === 'brandon' ? 'all' : 'brandon')}
            style={{ '--owner-color': '#13b981' } as React.CSSProperties}
          >
            <span className="V2Inbox__ownerAvatar">B</span>
            Brandon
          </button>
          <button 
            className={`V2Inbox__ownerChip ${ownerFilter === 'unassigned' ? 'is-active' : ''}`}
            onClick={() => setOwnerFilter(ownerFilter === 'unassigned' ? 'all' : 'unassigned')}
          >
            <span className="V2Inbox__ownerAvatar">?</span>
            Unassigned
          </button>
        </div>

        <label className={`V2Inbox__needsReplyToggle ${needsReplyOnly ? 'is-active' : ''}`}>
          <input 
            type="checkbox" 
            checked={needsReplyOnly}
            onChange={(e) => setNeedsReplyOnly(e.target.checked)}
          />
          <span className="V2Inbox__toggleSlider" />
          <span>Needs Reply</span>
        </label>
      </div>

      {flashMessage ? <div className="V2Inbox__flash">{flashMessage}</div> : null}
      
      {/* Success Toast */}
      {sendStatus === 'sent' && (
        <div className="V2Inbox__successToast">
          <span className="V2Inbox__successIcon">✓</span>
          <span>Message sent successfully!</span>
        </div>
      )}

      <section className="V2Inbox__newLayout">
        {/* Left: Enhanced Conversation List */}
        <div className="V2Inbox__conversationColumn">
          <div className="V2Inbox__listHeader">
            <h2>Conversations</h2>
            <span className="V2Inbox__listCount">{totalConversations} total</span>
          </div>

          {listQuery.isLoading ? (
            <div className="V2Inbox__skeletonList">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="V2Inbox__skeletonRow" style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          ) : listQuery.isError ? (
            <V2State kind="error">Failed to load conversations: {String((listQuery.error as Error)?.message || listQuery.error)}</V2State>
          ) : conversations.length === 0 ? (
            <div className="V2Inbox__emptyState">
              <div className="V2Inbox__emptyIcon">📭</div>
              <h3>No conversations</h3>
              <p>Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <div className="V2Inbox__conversationList V2Inbox__conversationList--enhanced">
              {conversations.map((conversation, index) => {
                const isActive = selectedConversationId === conversation.id;
                const hasUnread = conversation.openNeedsReplyCount > 0;
                const isUrgent = conversation.escalation.level <= 2 && hasUnread;
                const setterName = displaySetterName(conversation.ownerLabel);
                const setterColor = getSetterColor(conversation.ownerLabel);
                
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`V2Inbox__convCard ${isActive ? 'is-active' : ''} ${hasUnread ? 'has-unread' : ''} ${isUrgent ? 'is-urgent' : ''}`}
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setComposerText('');
                      setSelectedDraftId(null);
                      setDraftPrefillDoneForConversation(null);
                      setIsComposerModalOpen(true);
                    }}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Row 1: name + time */}
                    <div className="V2Inbox__convRow">
                      <div className="V2Inbox__convNameWrap">
                        {hasUnread && <span className="V2Inbox__convPip" />}
                        <span className="V2Inbox__convName">
                          {conversation.contactName || conversation.contactPhone || conversation.contactKey}
                          {conversation.dnc && <span className="V2Inbox__dncBadge">DNC</span>}
                          {conversation.mondayBooked && <span className="V2Inbox__mondayBadge">📅 Booked</span>}
                        </span>
                      </div>
                      <span className="V2Inbox__convTime">{timeAgo(conversation.lastMessage.createdAt)}</span>
                    </div>

                    {/* Row 2: direction + preview */}
                    <p className="V2Inbox__convPreview">
                      <span className="V2Inbox__convDir" data-dir={conversation.lastMessage.direction}>
                        {conversation.lastMessage.direction === 'inbound' ? '←' : '→'}
                      </span>
                      {shorten(conversation.lastMessage.body, 85) || <em>No preview</em>}
                    </p>

                    {/* Row 3: tags — always visible */}
                    <div className="V2Inbox__convTags">
                      <span className="V2Inbox__convEscTag" data-tone={escalationToneForLevel(conversation.escalation.level)}>
                        L{conversation.escalation.level}
                      </span>
                      {setterName && (
                        <span className="V2Inbox__convOwnerTag" style={{ '--c': setterColor } as React.CSSProperties}>
                          <span className="V2Inbox__convOwnerDot" />
                          {setterName}
                        </span>
                      )}
                      {conversation.openNeedsReplyCount > 0 && (
                        <span className="V2Inbox__convReplyTag">
                          {conversation.openNeedsReplyCount} needs reply
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Analytics Dashboard */}
        <div className="V2Inbox__analyticsColumn">
          <div className="V2Inbox__analyticsPanel">
            <h3 className="V2Inbox__analyticsTitle">Inbox Health</h3>
            
            <div className="V2Inbox__healthScore">
              <div 
                className="V2Inbox__healthRing"
                style={{ 
                  background: `conic-gradient(${getHealthColor(inboxHealth)} ${inboxHealth * 3.6}deg, rgba(7, 19, 36, 0.08) 0deg)` 
                }}
              >
                <span>{Math.round(inboxHealth)}</span>
              </div>
              <p className="V2Inbox__healthLabel">
                {inboxHealth >= 80 ? 'Healthy' : inboxHealth >= 60 ? 'Needs attention' : 'Critical'}
              </p>
            </div>

            <div className="V2Inbox__statGrid">
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue" style={{ color: unreadCount > 0 ? '#f59d0d' : '#13b981' }}>
                  {unreadCount}
                </span>
                <span className="V2Inbox__statLabel">Needs Reply</span>
              </div>
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue" style={{ color: urgentCount > 0 ? '#ef4c62' : '#13b981' }}>
                  {urgentCount}
                </span>
                <span className="V2Inbox__statLabel">Urgent</span>
              </div>
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue">{jackCount}</span>
                <span className="V2Inbox__statLabel">Jack</span>
              </div>
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue">{brandonCount}</span>
                <span className="V2Inbox__statLabel">Brandon</span>
              </div>
            </div>

            {unassignedCount > 0 && (
              <div className="V2Inbox__alertBanner">
                <span className="V2Inbox__alertIcon">⚠️</span>
                <span>{unassignedCount} conversations need an owner</span>
              </div>
            )}

            <div className="V2Inbox__workloadSection">
              <h4>Team Workload</h4>
              <div className="V2Inbox__workloadBars">
                <div className="V2Inbox__workloadItem">
                  <div className="V2Inbox__workloadHeader">
                    <span className="V2Inbox__workloadName">
                      <span className="V2Inbox__workloadAvatar" style={{ background: '#11b8d6' }}>J</span>
                      Jack
                    </span>
                    <span>{jackCount} convos</span>
                  </div>
                  <div className="V2Inbox__workloadBar">
                    <div 
                      className="V2Inbox__workloadFill" 
                      style={{ 
                        width: `${totalConversations > 0 ? (jackCount / totalConversations) * 100 : 0}%`,
                        background: '#11b8d6'
                      }} 
                    />
                  </div>
                </div>
                <div className="V2Inbox__workloadItem">
                  <div className="V2Inbox__workloadHeader">
                    <span className="V2Inbox__workloadName">
                      <span className="V2Inbox__workloadAvatar" style={{ background: '#13b981' }}>B</span>
                      Brandon
                    </span>
                    <span>{brandonCount} convos</span>
                  </div>
                  <div className="V2Inbox__workloadBar">
                    <div 
                      className="V2Inbox__workloadFill" 
                      style={{ 
                        width: `${totalConversations > 0 ? (brandonCount / totalConversations) * 100 : 0}%`,
                        background: '#13b981'
                      }} 
                    />
                  </div>
                </div>
                {unassignedCount > 0 && (
                  <div className="V2Inbox__workloadItem">
                    <div className="V2Inbox__workloadHeader">
                      <span className="V2Inbox__workloadName">
                        <span className="V2Inbox__workloadAvatar" style={{ background: '#56607a' }}>?</span>
                        Unassigned
                      </span>
                      <span>{unassignedCount} convos</span>
                    </div>
                    <div className="V2Inbox__workloadBar">
                      <div 
                        className="V2Inbox__workloadFill" 
                        style={{ 
                          width: `${totalConversations > 0 ? (unassignedCount / totalConversations) * 100 : 0}%`,
                          background: '#ef4c62'
                        }} 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Phase 3: Stage → Call Conversion */}
            <div className="V2Inbox__analyticsSection">
              <h4 className="V2Inbox__analyticsSectionTitle">Stage-to-Call Conversion</h4>
              {stageConversionQuery.isLoading ? (
                <p className="V2Inbox__analyticsHint">Loading…</p>
              ) : stageConversionQuery.isError ? (
                <p className="V2Inbox__analyticsHint">Failed to load</p>
              ) : !stageConversionQuery.data || stageConversionQuery.data.length === 0 ? (
                <p className="V2Inbox__analyticsHint">No conversion data yet</p>
              ) : (
                <table className="V2Inbox__conversionTable">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Total</th>
                      <th>Offered</th>
                      <th>Outcome</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageConversionQuery.data.map((row) => (
                      <tr key={row.escalation_level}>
                        <td>L{row.escalation_level}</td>
                        <td>{row.total_conversations}</td>
                        <td>{row.call_offered_count}</td>
                        <td>{row.call_outcome_count}</td>
                        <td>
                          <span
                            className="V2Inbox__conversionRate"
                            style={{
                              color: Number(row.conversion_rate_pct) >= 50
                                ? 'var(--v2-positive)'
                                : Number(row.conversion_rate_pct) >= 25
                                  ? 'var(--v2-warning)'
                                  : 'var(--v2-critical)',
                            }}
                          >
                            {Number(row.conversion_rate_pct).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Phase 3: Objection Frequency */}
            <div className="V2Inbox__analyticsSection">
              <h4 className="V2Inbox__analyticsSectionTitle">Top Objections</h4>
              {objectionFrequencyQuery.isLoading ? (
                <p className="V2Inbox__analyticsHint">Loading…</p>
              ) : objectionFrequencyQuery.isError ? (
                <p className="V2Inbox__analyticsHint">Failed to load</p>
              ) : !objectionFrequencyQuery.data || objectionFrequencyQuery.data.length === 0 ? (
                <p className="V2Inbox__analyticsHint">No objection tags recorded yet</p>
              ) : (
                <div className="V2Inbox__objectionBars">
                  {(() => {
                    const maxCount = Math.max(...objectionFrequencyQuery.data!.map((r) => r.count), 1);
                    return objectionFrequencyQuery.data!.slice(0, 8).map((row) => (
                      <div key={row.tag} className="V2Inbox__objectionRow">
                        <span className="V2Inbox__objectionTag">{row.tag}</span>
                        <div className="V2Inbox__objectionBarWrap">
                          <div
                            className="V2Inbox__objectionBar"
                            style={{ width: `${(row.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="V2Inbox__objectionCount">{row.count}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* Guardrail Checklist Modal */}
      {isGuardrailModalOpen && (
        <div className="V2Inbox__composerBackdrop" style={{ zIndex: 1000 }}>
          <div className="V2Panel" style={{ width: '400px', margin: '10vh auto', background: 'var(--v2-surface)', padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Buying Signal Checklist</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--v2-muted)', marginBottom: '1rem' }}>
              You're sending a call link at L{escalationLevel}. Confirm at least 2 buying signals before proceeding.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {GUARDRAIL_SIGNALS.map((signal) => (
                <label key={signal.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={guardrailChecks[signal.id] || false}
                    onChange={(e) => setGuardrailChecks(prev => ({ ...prev, [signal.id]: e.target.checked }))}
                  />
                  {signal.label}
                </label>
              ))}
            </div>

            {!canPassGuardrails && (
              <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(239, 76, 98, 0.1)', borderRadius: '4px', border: '1px solid var(--v2-critical)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--v2-critical)' }}>
                  ⚠ Not enough signals. Consider sending a podcast episode first.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="V2Inbox__button"
                onClick={() => {
                  setIsGuardrailModalOpen(false);
                  setPendingMessageText(null);
                  setGuardrailChecks({});
                }}
              >
                Cancel
              </button>
              {canPassGuardrails ? (
                <button
                  type="button"
                  className="V2Inbox__button V2Inbox__button--primary"
                  onClick={onConfirmGuardrails}
                >
                  Send Anyway
                </button>
              ) : (
                <button
                  type="button"
                  className="V2Inbox__button V2Inbox__button--primary"
                  onClick={onConfirmGuardrails}
                  disabled={!canOverrideGuardrails}
                  title={!canOverrideGuardrails ? 'Check at least 1 signal to override' : 'Override and send'}
                >
                  Override &amp; Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Composer Modal - Unchanged */}
      {isComposerModalOpen ? (
        <div className="V2Inbox__composerBackdrop" onClick={() => setIsComposerModalOpen(false)}>
          <section
            className="V2Inbox__composerModal"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation and message composer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="V2Inbox__composerModalHeader">
              <div className="V2Inbox__composerHeaderMain">
                {detail ? (
                  <>
                    <h3>{detail.contactCard.name || detail.contactCard.phone || detail.contactCard.contactKey}</h3>
                    <p className="V2Inbox__composerMeta">
                      {detail.contactCard.phone} · Owner: {detail.conversation.ownerLabel || 'Unassigned'} · Stage: L{detail.conversation.escalation.level}
                    </p>
                    <div className="V2Inbox__statusRow">
                      <span className={`V2Inbox__statusBadge V2Inbox__statusBadge--${detail.conversation.status}`}>
                        {detail.conversation.status === 'open' ? '● Open' : detail.conversation.status === 'closed' ? '✓ Closed' : '⊘ DNC'}
                      </span>
                      {detail.conversation.status !== 'closed' && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus('closed')}
                          disabled={statusMutation.isPending}
                          title="Mark as closed"
                        >
                          Close
                        </button>
                      )}
                      {detail.conversation.status === 'closed' && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus('open')}
                          disabled={statusMutation.isPending}
                          title="Reopen conversation"
                        >
                          Reopen
                        </button>
                      )}
                      {detail.conversation.status !== 'dnc' && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small V2Inbox__button--danger"
                          onClick={() => onUpdateStatus('dnc')}
                          disabled={statusMutation.isPending}
                          title="Mark as Do Not Contact — removes from active inbox"
                        >
                          DNC
                        </button>
                      )}
                      {detail.conversation.status === 'dnc' && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus('open')}
                          disabled={statusMutation.isPending}
                          title="Remove DNC flag and reopen"
                        >
                          Remove DNC
                        </button>
                      )}
                    </div>
                    {/* Assignment + Snooze row */}
                    <div className="V2Inbox__statusRow V2Inbox__statusRow--meta">
                      <span className="V2Inbox__metaLabel">Assign to:</span>
                      <input
                        type="text"
                        className="V2Inbox__assignInput"
                        value={assignLabel}
                        onChange={(e) => setAssignLabel(e.target.value)}
                        placeholder="Rep name…"
                        onKeyDown={(e) => { if (e.key === 'Enter') void onAssign(); }}
                      />
                      <button
                        type="button"
                        className="V2Inbox__button V2Inbox__button--small"
                        onClick={onAssign}
                        disabled={assignMutation.isPending}
                      >
                        {assignMutation.isPending ? '…' : 'Assign'}
                      </button>
                      <span className="V2Inbox__metaLabel">Snooze:</span>
                      <input
                        type="datetime-local"
                        className="V2Inbox__snoozeInput"
                        aria-label="Snooze until date and time"
                        value={snoozeDate}
                        onChange={(e) => setSnoozeDate(e.target.value)}
                      />
                      <button
                        type="button"
                        className="V2Inbox__button V2Inbox__button--small"
                        onClick={onSnooze}
                        disabled={snoozeMutation.isPending || !snoozeDate}
                      >
                        {snoozeMutation.isPending ? '…' : 'Snooze'}
                      </button>
                      {detail.conversation.escalation.nextFollowupDueAt && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={onClearSnooze}
                          disabled={snoozeMutation.isPending}
                          title="Clear snooze"
                        >
                          ✕ Snooze
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <h3>Conversation</h3>
                )}
              </div>
              <div className="V2Inbox__composerHeaderActions">
                <button
                  type="button"
                  className="V2Inbox__button V2Inbox__button--small"
                  onClick={() => void detailQuery.refetch()}
                  disabled={detailQuery.isFetching}
                  title="Refresh messages"
                >
                  {detailQuery.isFetching ? '↻ Syncing…' : '↻ Refresh'}
                </button>
                <button type="button" className="V2Inbox__composerClose" onClick={() => setIsComposerModalOpen(false)}>
                  ✕
                </button>
              </div>
            </header>

            <div className="V2Inbox__composerModalBody">
              {!selectedConversationId ? (
                <V2State kind="empty">Select a conversation to open it.</V2State>
              ) : detailQuery.isLoading ? (
                <V2State kind="loading">Loading messages…</V2State>
              ) : detailQuery.isError || !detail ? (
                <V2State kind="error">
                  Failed to load messages: {String((detailQuery.error as Error)?.message || detailQuery.error)}
                </V2State>
              ) : (
                <div className="V2Inbox__composerGrid">
                  <div className="V2Inbox__composerPrimary">
                  {/* Conversation Thread - Chat Style */}
                  <div className="V2Inbox__chatThread" ref={chatThreadRef}>
{detail.messages.map((message) => {
                      const leadLabel = detail.contactCard.name || detail.contactCard.phone || 'Lead';
                      // For outbound messages: prefer inferring from message body (e.g., "Jack with PT Biz")
                      // Fall back to alowareUser field, then to default setter
                      const defaultSetter = displaySetterName(detail.conversation.ownerLabel) || 'Setter';
                      let speaker: string;
                      if (message.direction === 'inbound') {
                        speaker = leadLabel;
                      } else {
                        // Try to infer from message body for sequence messages
                        const bodySenderMatch = message.body?.match(/^Hey.*?,\s*(\w+(?:\s+\w+)?)\s+with\s+PT/i);
                        const bodySender = bodySenderMatch?.[1] || null;
                        speaker = displaySetterName(bodySender) || displaySetterName(message.alowareUser) || defaultSetter;
                      }
                      return (
                        <article key={message.id} className={`V2Inbox__chatMessage V2Inbox__chatMessage--${message.direction}`}>
                          <div className="V2Inbox__chatMessageHeader">
                            <span className="V2Inbox__chatSpeaker">{speaker}</span>
                            <time className="V2Inbox__chatTime">{fmtDateTime(message.createdAt)}</time>
                          </div>
                          <p className="V2Inbox__chatBody">{message.body || '(empty)'}</p>
                        </article>
                      );
                    })}
                    
                    {/* Optimistic sent message */}
                    {justSentMessage && (
                      <article className={`V2Inbox__chatMessage V2Inbox__chatMessage--outbound ${!justSentMessage.confirmed ? 'V2Inbox__chatMessage--sending' : 'V2Inbox__chatMessage--confirmed'}`}>
                        <div className="V2Inbox__chatMessageHeader">
                          <span className="V2Inbox__chatSpeaker">You</span>
                          <time className="V2Inbox__chatTime">{fmtDateTime(justSentMessage.timestamp)}</time>
                        </div>
                        <p className="V2Inbox__chatBody">{justSentMessage.text}</p>
                        <span className="V2Inbox__sendingIndicator">
                          {!justSentMessage.confirmed ? 'Sending…' : '✓ Sent'}
                        </span>
                      </article>
                    )}
                  </div>

                  {/* Composer Area */}
                  <div className="V2Inbox__chatComposer">
                    {/* Double Pitch Protection Banner */}
                    {showDoublePitchWarning && (
                      <div style={{
                        background: 'rgba(245, 157, 13, 0.12)',
                        border: '1px solid #f59d0d',
                        borderRadius: '4px',
                        padding: '0.5rem 0.75rem',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        color: '#f59d0d',
                      }}>
                        <span>⚠ Call link already sent — no reply yet. Try a follow-up question instead.</span>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#f59d0d', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.25rem' }}
                          onClick={() => setShowDoublePitchWarning(false)}
                          title="Dismiss and send anyway"
                        >
                          Send anyway ✕
                        </button>
                      </div>
                    )}
                    <div className="V2Inbox__chatInputRow">
                      <textarea
                        ref={composerRef}
                        className="V2Inbox__chatInput"
                        value={composerText}
                        onChange={(event) => {
                          const nextText = event.target.value;
                          setComposerText(nextText);
                          if (selectedDraftId) {
                            const selectedDraft = detail.drafts.find((draft) => draft.id === selectedDraftId);
                            if (!selectedDraft || selectedDraft.text !== nextText) {
                              setSelectedDraftId(null);
                            }
                          }
                        }}
                        placeholder="Type your message…"
                        rows={3}
                      />
                      <div className="V2Inbox__chatActions">
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--secondary V2Inbox__button--small"
                          onClick={onGenerateDraft}
                          disabled={generateDraftMutation.isPending || sendMutation.isPending}
                          title="Generate AI draft"
                        >
                          {generateDraftMutation.isPending ? '...' : '✨'}
                        </button>
                        <button
                          type="button"
                          className={`V2Inbox__button V2Inbox__button--primary V2Inbox__button--small ${sendStatus === 'sending' ? 'V2Inbox__button--sending' : ''} ${sendStatus === 'sent' ? 'V2Inbox__button--success' : ''}`}
                          onClick={onSend}
                          disabled={
                            sendMutation.isPending ||
                            composerText.trim().length === 0 ||
                            lineSelectionRequired ||
                            sendConfigQuery.isLoading
                          }
                        >
                          {sendStatus === 'sending' ? (
                            <span className="V2Inbox__buttonSpinner" />
                          ) : sendStatus === 'sent' ? (
                            'Sent!'
                          ) : (
                            'Send'
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="V2Inbox__chatFooter">
                      {(() => {
                        const { segments, charsRemaining, isUnicode } = getSmsSegmentInfo(composerText);
                        const warn = segments >= 2;
                        const danger = segments >= 4;
                        return (
                          <span
                            className={`V2Inbox__chatCount${danger ? ' V2Inbox__chatCount--danger' : warn ? ' V2Inbox__chatCount--warn' : ''}`}
                            title={isUnicode ? 'Message contains Unicode characters — reduced segment size (70/67 chars)' : 'GSM-7 encoding — 160 chars single / 153 per segment'}
                          >
                            {composerText.length === 0
                              ? '160 chars left'
                              : `${charsRemaining} left · ${segments} SMS${isUnicode ? ' ⚠ unicode' : ''}`}
                          </span>
                        );
                      })()}
                      <div className="V2Inbox__chatTools">
                        {lineOptions.length > 0 && (
                          <select 
                            className="V2Inbox__chatLineSelect"
                            value={selectedLineKey} 
                            onChange={(event) => setSelectedLineKey(event.target.value)}
                            title="Select send line"
                          >
                            <option value="">Line…</option>
                            {lineOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {formatSendLineLabel(option)}
                              </option>
                            ))}
                          </select>
                        )}
                        {detail.drafts.length > 0 && (
                          <select
                            className="V2Inbox__chatDraftSelect"
                            value={selectedDraftId || ''}
                            onChange={(event) => {
                              const draftId = event.target.value;
                              if (draftId) {
                                const draft = detail.drafts.find((d) => d.id === draftId);
                                if (draft) {
                                  setComposerText(draft.text);
                                  setSelectedDraftId(draft.id);
                                }
                              }
                            }}
                            title="Use a saved draft"
                          >
                            <option value="">Drafts ({detail.drafts.length})</option>
                            {detail.drafts.slice(0, 5).map((draft) => (
                              <option key={draft.id} value={draft.id}>
                                {shorten(draft.text, 40)} (L{draft.lintScore.toFixed(0)})
                              </option>
                            ))}
                          </select>
                        )}
                        {/* Templates */}
                        <div className="V2Inbox__templateWrapper">
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--small"
                            onClick={() => setShowTemplates((prev) => !prev)}
                            title="Insert template"
                          >
                            Templates
                          </button>
                          {showTemplates && (
                            <div className="V2Inbox__templateDropdown">
                              {templatesQuery.data && templatesQuery.data.length > 0 ? (
                                templatesQuery.data.map((tpl) => (
                                  <div key={tpl.id} className="V2Inbox__templateItem">
                                    <button
                                      type="button"
                                      className="V2Inbox__templateInsert"
                                      onClick={() => onInsertTemplate(tpl.body)}
                                      title={tpl.body}
                                    >
                                      {tpl.name}
                                    </button>
                                    <button
                                      type="button"
                                      className="V2Inbox__templateDelete"
                                      onClick={() => void onDeleteTemplate(tpl.id)}
                                      title="Delete template"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="V2Inbox__templateEmpty">No templates saved yet.</p>
                              )}
                              <div className="V2Inbox__templateCreate">
                                <input
                                  type="text"
                                  className="V2Inbox__templateNameInput"
                                  value={newTemplateName}
                                  onChange={(e) => setNewTemplateName(e.target.value)}
                                  placeholder="Template name…"
                                />
                                <textarea
                                  className="V2Inbox__templateBodyInput"
                                  value={newTemplateBody}
                                  onChange={(e) => setNewTemplateBody(e.target.value)}
                                  rows={2}
                                  placeholder="Message body… use {{name}} for contact name"
                                />
                                <button
                                  type="button"
                                  className="V2Inbox__button V2Inbox__button--small V2Inbox__button--primary"
                                  onClick={onCreateTemplate}
                                  disabled={createTemplateMutation.isPending || !newTemplateName.trim() || !newTemplateBody.trim()}
                                >
                                  {createTemplateMutation.isPending ? 'Saving…' : '+ Save Template'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="V2Inbox__chatClear"
                          onClick={onClearDraft}
                          disabled={!selectedDraftId && composerText.length === 0}
                          title="Clear message"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                  </div>

                  {/* Sidebar: Qualification, Escalation, Send Line */}
                  <div className="V2Inbox__composerSidebar V2Inbox__sideColumn">

                    {/* Qualification Panel */}
                    <div className={`V2Panel V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${qualificationTone}`}>
                      <p className="V2Panel__title">Qualification</p>
                      <div className="V2Inbox__stateTop">
                        <span className="V2Inbox__stateBadge">{qualificationProgressLive} of 4 fields</span>
                        <span className="V2Inbox__stateHint">{qualificationProgressPct}% complete</span>
                      </div>
                      <div className="V2Inbox__stateMeter">
                        <span style={{ width: `${qualificationProgressPct}%` }} />
                      </div>
                      <div className="V2Inbox__pillRow">
                        {qualificationFields.map((field) => (
                          <span key={field.key} className={`V2Inbox__pill ${field.complete ? 'is-complete' : ''}`}>
                            {field.label}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <label className="V2Control">
                          <span>Full or Part Time</span>
                          <select
                            value={qualificationState.fullOrPartTime}
                            onChange={(e) => setQualificationState((prev) => ({ ...prev, fullOrPartTime: e.target.value as QualificationStateV2['fullOrPartTime'] }))}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="full_time">Full Time</option>
                            <option value="part_time">Part Time</option>
                          </select>
                        </label>
                        <label className="V2Control">
                          <span>Niche</span>
                          <input
                            type="text"
                            value={qualificationState.niche || ''}
                            onChange={(e) => setQualificationState((prev) => ({ ...prev, niche: e.target.value }))}
                            placeholder="e.g. Sports performance"
                          />
                        </label>
                        <label className="V2Control">
                          <span>Revenue Mix</span>
                          <select
                            value={qualificationState.revenueMix}
                            onChange={(e) => setQualificationState((prev) => ({ ...prev, revenueMix: e.target.value as QualificationStateV2['revenueMix'] }))}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="mostly_cash">Mostly Cash</option>
                            <option value="mostly_insurance">Mostly Insurance</option>
                            <option value="balanced">Balanced</option>
                          </select>
                        </label>
                        <label className="V2Control">
                          <span>Coaching Interest</span>
                          <select
                            value={qualificationState.coachingInterest}
                            onChange={(e) => setQualificationState((prev) => ({ ...prev, coachingInterest: e.target.value as QualificationStateV2['coachingInterest'] }))}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="V2Inbox__stateAction V2Inbox__stateAction--primary"
                          onClick={onSaveQualification}
                          disabled={qualificationMutation.isPending}
                        >
                          {qualificationMutation.isPending ? 'Saving…' : 'Save Qualification'}
                        </button>
                      </div>
                    </div>

                    {/* Escalation Panel */}
                    <div className={`V2Panel V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${escalationTone}`}>
                      <p className="V2Panel__title">Escalation Stage</p>
                      <div className="V2Inbox__stateTop">
                        <span className="V2Inbox__stateBadge">L{escalationLevel} · {escalationLevelSubtitle(escalationLevel)}</span>
                        <span className="V2Inbox__stateHint">{escalationProgressPct}%</span>
                      </div>
                      <div className="V2Inbox__stateMeter">
                        <span style={{ width: `${escalationProgressPct}%` }} />
                      </div>
                      <div className="V2Inbox__levelRail">
                        {([1, 2, 3, 4] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`V2Inbox__levelChip ${escalationLevel === level ? 'is-active' : ''}`}
                            onClick={() => setEscalationLevel(level)}
                          >
                            L{level}
                          </button>
                        ))}
                      </div>
                      <label className="V2Control" style={{ marginTop: '0.5rem' }}>
                        <span>Override Reason</span>
                        <textarea
                          value={escalationReason}
                          onChange={(e) => setEscalationReason(e.target.value)}
                          rows={2}
                          placeholder="Why are you overriding? (optional)"
                        />
                      </label>
                      <button
                        type="button"
                        className="V2Inbox__stateAction V2Inbox__stateAction--primary"
                        style={{ marginTop: '0.5rem' }}
                        onClick={onOverrideEscalation}
                        disabled={escalationMutation.isPending}
                      >
                        {escalationMutation.isPending ? 'Saving…' : 'Save Stage'}
                      </button>
                    </div>

                    {/* Send Line Panel */}
                    {lineOptions.length > 0 && (
                      <div className="V2Panel V2Inbox__sidePanel">
                        <p className="V2Panel__title">Send Line</p>
                        <p className="V2Panel__caption" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                          Default: {savedDefaultSummary}
                        </p>
                        <label className="V2Control">
                          <span>Active Line</span>
                          <select value={selectedLineKey} onChange={(e) => setSelectedLineKey(e.target.value)}>
                            <option value="">Select a line…</option>
                            {lineOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {formatSendLineLabel(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--primary V2Inbox__button--small"
                            onClick={onSaveDefaultLine}
                            disabled={setDefaultLineMutation.isPending || !selectedLineOption}
                          >
                            Save as Default
                          </button>
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--small"
                            onClick={onClearDefaultLine}
                            disabled={setDefaultLineMutation.isPending}
                          >
                            Clear Default
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Whisper Notes Panel */}
                    <div className="V2Panel V2Inbox__sidePanel">
                      <p className="V2Panel__title">Internal Notes</p>
                      <p className="V2Panel__caption" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--v2-muted)' }}>
                        Not visible to the lead
                      </p>
                      <div className="V2Inbox__notesList">
                        {notesQuery.isLoading && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--v2-muted)' }}>Loading…</p>
                        )}
                        {notesQuery.data && notesQuery.data.length === 0 && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--v2-muted)' }}>No notes yet.</p>
                        )}
                        {notesQuery.data?.map((note) => (
                          <div key={note.id} className="V2Inbox__noteItem">
                            <div className="V2Inbox__noteHeader">
                              <span className="V2Inbox__noteAuthor">{note.author}</span>
                              <span className="V2Inbox__noteTime">
                                {new Date(note.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="V2Inbox__noteBody">{note.text}</p>
                          </div>
                        ))}
                      </div>
                      <div className="V2Inbox__noteComposer">
                        <textarea
                          className="V2Inbox__noteInput"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={2}
                          placeholder="Add a note… (⌘↵ to save)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void onAddNote();
                          }}
                        />
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small V2Inbox__button--primary"
                          onClick={onAddNote}
                          disabled={addNoteMutation.isPending || noteText.trim().length === 0}
                        >
                          {addNoteMutation.isPending ? 'Saving…' : '+ Note'}
                        </button>
                      </div>
                    </div>

                    {/* Phase 3: Call Outcome & Objections Panel */}
                    <div className="V2Panel V2Inbox__sidePanel">
                      <p className="V2Panel__title">Call Outcome &amp; Objections</p>

                      {/* Call Outcome chips */}
                      <p className="V2Panel__caption" style={{ fontSize: '0.72rem', marginBottom: '0.4rem' }}>Call Outcome</p>
                      <div className="V2Inbox__outcomeChips">
                        {(['not_a_fit', 'too_early', 'budget', 'joined', 'ghosted'] as CallOutcomeV2[]).map((outcome) => (
                          <button
                            key={outcome}
                            type="button"
                            className={`V2Inbox__outcomeChip${localCallOutcome === outcome ? ' is-active' : ''}`}
                            data-outcome={outcome}
                            onClick={() => void onSetCallOutcome(localCallOutcome === outcome ? null : outcome)}
                            disabled={updateCallOutcomeMutation.isPending}
                            title={CALL_OUTCOME_LABELS[outcome]}
                          >
                            {CALL_OUTCOME_LABELS[outcome]}
                          </button>
                        ))}
                      </div>

                      {/* Objection Tags */}
                      <p className="V2Panel__caption" style={{ fontSize: '0.72rem', marginTop: '0.75rem', marginBottom: '0.4rem' }}>Objection Tags</p>
                      <div className="V2Inbox__objectionTagChips">
                        {localObjectionTags.length === 0 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--v2-muted)' }}>No tags yet</span>
                        )}
                        {localObjectionTags.map((tag) => (
                          <span key={tag} className="V2Inbox__objectionTagChip">
                            {tag}
                            <button
                              type="button"
                              className="V2Inbox__objectionTagRemove"
                              onClick={() => void onRemoveObjectionTag(tag)}
                              disabled={updateObjectionTagsMutation.isPending}
                              title="Remove tag"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="V2Inbox__objectionTagInput">
                        <input
                          type="text"
                          className="V2Inbox__assignInput"
                          value={objectionTagInput}
                          onChange={(e) => setObjectionTagInput(e.target.value)}
                          placeholder="Add tag… (e.g. price, timing)"
                          title="Add objection tag"
                          onKeyDown={(e) => { if (e.key === 'Enter') void onAddObjectionTag(); }}
                        />
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={onAddObjectionTag}
                          disabled={updateObjectionTagsMutation.isPending || !objectionTagInput.trim()}
                        >
                          + Tag
                        </button>
                      </div>

                      {/* Guardrail Override */}
                      <div style={{ marginTop: '0.75rem' }}>
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small V2Inbox__button--danger"
                          onClick={onIncrementGuardrailOverride}
                          disabled={incrementGuardrailOverrideMutation.isPending}
                          title="Record that a guardrail was overridden for this conversation"
                        >
                          {incrementGuardrailOverrideMutation.isPending ? '…' : '⚠ Log Override'}
                        </button>
                        <p style={{ fontSize: '0.68rem', color: 'var(--v2-muted)', marginTop: '0.25rem' }}>
                          Overrides: {detail?.conversation.guardrailOverrideCount ?? 0}
                        </p>
                      </div>
                    </div>

                    {/* Monday Booked Calls Panel */}
                    {detail && detail.mondayTrail.length > 0 && (
                      <div className="V2Panel V2Inbox__sidePanel">
                        <p className="V2Panel__title">📅 Monday Booked Calls</p>
                        <div className="V2Inbox__mondayTrail">
                          {detail.mondayTrail.map((snap) => (
                            <div key={snap.itemId} className="V2Inbox__mondayTrailRow">
                              <div className="V2Inbox__mondayTrailName">
                                {snap.itemName || '—'}
                                {snap.isBooked && <span className="V2Inbox__mondayBadge V2Inbox__mondayBadge--inline">Booked</span>}
                              </div>
                              <div className="V2Inbox__mondayTrailMeta">
                                {snap.stage && <span className="V2Inbox__mondayTrailStage">{snap.stage}</span>}
                                {snap.callDate && <span className="V2Inbox__mondayTrailDate">{snap.callDate}</span>}
                                {snap.disposition && <span className="V2Inbox__mondayTrailDisp">{snap.disposition}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
