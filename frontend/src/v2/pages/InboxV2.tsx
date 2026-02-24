import { useEffect, useRef, useState } from 'react';

import {
  useV2GenerateDraft,
  useV2InboxConversationDetail,
  useV2InboxConversations,
  useV2InboxSendConfig,
  useV2OverrideEscalation,
  useV2SendInboxMessage,
  useV2SetDefaultSendLine,
  useV2UpdateQualification,
} from '../../api/v2Queries';
import type { QualificationStateV2 } from '../../api/v2-types';
import { V2State } from '../components/V2Primitives';

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

const getSetterAvatar = (name: string | null | undefined): string => {
  const setter = displaySetterName(name);
  if (setter === 'Jack') return 'J';
  if (setter === 'Brandon') return 'B';
  return '?';
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
  if (level === 2) return 'Objection bridge';
  if (level === 3) return 'Call first';
  return 'Scaling hybrid';
};

export default function InboxV2() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'dnc' | ''>('open');
  const [needsReplyOnly, setNeedsReplyOnly] = useState(true);
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
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(null);
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
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]?.id || null);
      return;
    }

    if (selectedConversationId && !conversations.some((row) => row.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0]?.id || null);
    }
  }, [conversations, selectedConversationId]);

  const detailQuery = useV2InboxConversationDetail(selectedConversationId);

  const generateDraftMutation = useV2GenerateDraft();
  const sendMutation = useV2SendInboxMessage();
  const sendConfigQuery = useV2InboxSendConfig();
  const setDefaultLineMutation = useV2SetDefaultSendLine();
  const qualificationMutation = useV2UpdateQualification();
  const escalationMutation = useV2OverrideEscalation();

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
  }, [detail]);

  useEffect(() => {
    setDraftPrefillDoneForConversation(null);
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
        setFlashMessage(`Draft generated in contextual fallback mode. ${firstWarning}`);
        return;
      }
      if (result.data.lint.passed) {
        setFlashMessage('Draft generated and passed strict lint.');
      } else {
        setFlashMessage('Draft generated with lint issues. Review before sending.');
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

    setFlashMessage(null);
    setSendStatus('sending');
    
    const messageText = composerText.trim();
    
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
        
        setTimeout(() => {
          setSendStatus('idle');
        }, 2000);
      } else {
        setSendStatus('error');
        setFlashMessage(`Send blocked: ${result.data.reason} · ${lineSummary}`);
      }
    } catch (error) {
      setSendStatus('error');
      setFlashMessage(`Send failed: ${String((error as Error)?.message || error)}`);
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
    setFlashMessage('Draft cleared. You can regenerate or type a new message.');
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
      setFlashMessage('Qualification state updated.');
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
      setFlashMessage('Escalation override saved.');
    } catch (error) {
      setFlashMessage(`Escalation update failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#13b981';
    if (score >= 60) return '#f59d0d';
    return '#ef4c62';
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
            placeholder="Search conversations..."
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
          <span>Needs reply</span>
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
            <V2State kind="error">Failed to load inbox: {String((listQuery.error as Error)?.message || listQuery.error)}</V2State>
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
                const isHovered = hoveredConversation === conversation.id;
                const hasUnread = conversation.openNeedsReplyCount > 0;
                const isUrgent = conversation.escalation.level <= 2 && hasUnread;
                const setterName = displaySetterName(conversation.ownerLabel);
                const setterColor = getSetterColor(conversation.ownerLabel);
                const setterAvatar = getSetterAvatar(conversation.ownerLabel);
                
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`V2Inbox__conversationCard ${isActive ? 'is-active' : ''} ${hasUnread ? 'has-unread' : ''} ${isUrgent ? 'is-urgent' : ''}`}
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setComposerText('');
                      setSelectedDraftId(null);
                      setDraftPrefillDoneForConversation(null);
                      setIsComposerModalOpen(true);
                    }}
                    onMouseEnter={() => setHoveredConversation(conversation.id)}
                    onMouseLeave={() => setHoveredConversation(null)}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Avatar with status */}
                    <div className="V2Inbox__cardAvatar">
                      <span>{(conversation.contactName || conversation.contactPhone || '?').slice(0, 1).toUpperCase()}</span>
                      {hasUnread && <span className="V2Inbox__unreadDot" />}
                    </div>

                    {/* Main content */}
                    <div className="V2Inbox__cardContent">
                      <div className="V2Inbox__cardHeader">
                        <h3 className="V2Inbox__cardName">
                          {conversation.contactName || conversation.contactPhone || conversation.contactKey}
                          {conversation.dnc && <span className="V2Inbox__dncBadge">DNC</span>}
                        </h3>
                        <span className="V2Inbox__cardTime">{timeAgo(conversation.lastMessage.createdAt)}</span>
                      </div>
                      
                      <p className="V2Inbox__cardPreview">
                        {shorten(conversation.lastMessage.body, 120) || (
                          <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No message preview</span>
                        )}
                      </p>
                      
                      <div className="V2Inbox__cardMeta">
                        <span 
                          className="V2Inbox__escalationBadge"
                          style={{ 
                            background: `color-mix(in srgb, ${escalationToneForLevel(conversation.escalation.level) === 'red' ? '#ef4c62' : escalationToneForLevel(conversation.escalation.level) === 'orange' ? '#f59d0d' : escalationToneForLevel(conversation.escalation.level) === 'yellow' ? '#e6b01f' : '#13b981'} 15%, transparent)`,
                            color: escalationToneForLevel(conversation.escalation.level) === 'red' ? '#ef4c62' : escalationToneForLevel(conversation.escalation.level) === 'orange' ? '#f59d0d' : escalationToneForLevel(conversation.escalation.level) === 'yellow' ? '#e6b01f' : '#13b981',
                            borderColor: escalationToneForLevel(conversation.escalation.level) === 'red' ? '#ef4c62' : escalationToneForLevel(conversation.escalation.level) === 'orange' ? '#f59d0d' : escalationToneForLevel(conversation.escalation.level) === 'yellow' ? '#e6b01f' : '#13b981'
                          }}
                        >
                          L{conversation.escalation.level}
                        </span>
                        
                        {setterName && (
                          <span className="V2Inbox__setterBadge" style={{ color: setterColor }}>
                            <span className="V2Inbox__setterDot" style={{ background: setterColor }} />
                            {setterName}
                          </span>
                        )}
                        
                        {conversation.openNeedsReplyCount > 0 && (
                          <span className="V2Inbox__replyCount">
                            {conversation.openNeedsReplyCount} needs reply
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover actions */}
                    <div className={`V2Inbox__cardActions ${isHovered ? 'is-visible' : ''}`}>
                      <button className="V2Inbox__actionBtn V2Inbox__actionBtn--primary" title="Quick reply">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>
                      </button>
                    </div>

                    {/* Unread indicator */}
                    {hasUnread && <div className="V2Inbox__unreadIndicator" />}
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
                <span className="V2Inbox__statLabel">Unread</span>
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
                <span>{unassignedCount} unassigned conversations need owners</span>
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
                    <span>{jackCount} conv.</span>
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
                    <span>{brandonCount} conv.</span>
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
                      <span>{unassignedCount} conv.</span>
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
          </div>
        </div>
      </section>

      {/* Composer Modal - Unchanged */}
      {isComposerModalOpen ? (
        <div className="V2Inbox__composerBackdrop" onClick={() => setIsComposerModalOpen(false)}>
          <section
            className="V2Inbox__composerModal"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation and SMS composer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="V2Inbox__composerModalHeader">
              <div className="V2Inbox__composerHeaderMain">
                {detail ? (
                  <>
                    <h3>{detail.contactCard.name || detail.contactCard.phone || detail.contactCard.contactKey}</h3>
                    <p className="V2Inbox__composerMeta">
                      {detail.contactCard.phone} · Owner: {detail.conversation.ownerLabel || 'Unassigned'} · Esc L{detail.conversation.escalation.level}
                    </p>
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
                  title="Refresh conversation from database"
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
                <V2State kind="empty">Select a conversation to view and reply.</V2State>
              ) : detailQuery.isLoading ? (
                <V2State kind="loading">Loading conversation...</V2State>
              ) : detailQuery.isError || !detail ? (
                <V2State kind="error">
                  Failed to load conversation: {String((detailQuery.error as Error)?.message || detailQuery.error)}
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
                          <p className="V2Inbox__chatBody">{message.body || '(empty message)'}</p>
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
                          {!justSentMessage.confirmed ? 'Sending...' : '✓ Sent'}
                        </span>
                      </article>
                    )}
                  </div>

                  {/* Composer Area */}
                  <div className="V2Inbox__chatComposer">
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
                        placeholder="Type your message..."
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
                      <span className="V2Inbox__chatCount">{composerText.trim().length} chars</span>
                      <div className="V2Inbox__chatTools">
                        {lineOptions.length > 0 && (
                          <select 
                            className="V2Inbox__chatLineSelect"
                            value={selectedLineKey} 
                            onChange={(event) => setSelectedLineKey(event.target.value)}
                            title="Select send line"
                          >
                            <option value="">Line...</option>
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
                            title="Use a previous draft"
                          >
                            <option value="">Drafts ({detail.drafts.length})</option>
                            {detail.drafts.slice(0, 5).map((draft) => (
                              <option key={draft.id} value={draft.id}>
                                {shorten(draft.text, 40)} (L{draft.lintScore.toFixed(0)})
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          className="V2Inbox__chatClear"
                          onClick={onClearDraft}
                          disabled={!selectedDraftId && composerText.length === 0}
                          title="Clear draft"
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
                        <span className="V2Inbox__stateBadge">{qualificationProgressLive}/4 fields</span>
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
                      <p className="V2Panel__title">Escalation</p>
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
                        <span>Reason / Note</span>
                        <textarea
                          value={escalationReason}
                          onChange={(e) => setEscalationReason(e.target.value)}
                          rows={2}
                          placeholder="Optional override reason…"
                        />
                      </label>
                      <button
                        type="button"
                        className="V2Inbox__stateAction V2Inbox__stateAction--primary"
                        style={{ marginTop: '0.5rem' }}
                        onClick={onOverrideEscalation}
                        disabled={escalationMutation.isPending}
                      >
                        {escalationMutation.isPending ? 'Saving…' : 'Save Escalation'}
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
