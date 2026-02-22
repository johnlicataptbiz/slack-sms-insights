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
import { v2Copy } from '../copy';
import { V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';

const fmtDateTime = (value: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const shorten = (value: string | null, max = 100): string => {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

const qualificationLabel = (value: string) => {
  if (value === 'full_time') return 'Full time';
  if (value === 'part_time') return 'Part time';
  if (value === 'mostly_cash') return 'Mostly cash';
  if (value === 'mostly_insurance') return 'Mostly insurance';
  if (value === 'balanced') return 'Balanced';
  if (value === 'high') return 'High';
  if (value === 'medium') return 'Medium';
  if (value === 'low') return 'Low';
  if (value === 'podcast_sent') return 'Podcast sent';
  if (value === 'call_offered') return 'Call offered';
  if (value === 'nurture_pool') return 'Nurture pool';
  if (value === 'idle') return 'Idle';
  return 'Unknown';
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
  return trimmed;
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
  const [selectedLineKey, setSelectedLineKey] = useState('');
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
    if (!detail) return;
    if (detail.drafts.length === 0) return;
    if (composerText.trim().length > 0) return;

    const latestDraft = detail.drafts[0];
    if (!latestDraft) return;
    setComposerText(latestDraft.text);
    setSelectedDraftId(latestDraft.id);
  }, [detail, composerText]);

  useEffect(() => {
    if (!isComposerModalOpen || !selectedConversationId || !detail) return;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [isComposerModalOpen, selectedConversationId, detail?.conversation.id]);

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
    try {
      const sendFromNumber = selectedLineOption?.lineId == null ? selectedLineOption?.fromNumber || null : null;
      const result = await sendMutation.mutateAsync({
        conversationId: selectedConversationId,
        body: composerText.trim(),
        idempotencyKey: `inbox-${Date.now()}`,
        ...(selectedLineOption?.lineId != null ? { lineId: selectedLineOption.lineId } : {}),
        ...(sendFromNumber ? { fromNumber: sendFromNumber } : {}),
        ...(selectedDraftId ? { draftId: selectedDraftId } : {}),
      });
      const lineSummary = formatSendLineLabel(result.data.lineSelection);
      if (result.data.status === 'sent' || result.data.status === 'duplicate') {
        setFlashMessage(
          `${result.data.status === 'sent' ? 'Message sent' : 'Duplicate request skipped'}: ${result.data.reason} · ${lineSummary}`,
        );
      } else {
        setFlashMessage(`Send blocked: ${result.data.reason} · ${lineSummary}`);
      }
    } catch (error) {
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

  return (
    <div className="V2Page V2Inbox">
      <V2PageHeader
        title={v2Copy.nav.inbox}
        subtitle="Two way SMS inbox with qualification state, escalation controls, and strict draft suggestions."
        right={
          <div className="V2Inbox__controls">
            <label className="V2Control">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="dnc">DNC</option>
              </select>
            </label>
            <label className="V2Control">
              <span>Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, contact key"
              />
            </label>
            <label className="V2Control">
              <span>Owner</span>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value as typeof ownerFilter)}>
                <option value="all">All</option>
                <option value="jack">Jack</option>
                <option value="brandon">Brandon</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
            <label className="V2Control V2Control--check">
              <input type="checkbox" checked={needsReplyOnly} onChange={(event) => setNeedsReplyOnly(event.target.checked)} />
              <span>Needs reply only</span>
            </label>
          </div>
        }
      />

      {flashMessage ? <div className="V2Inbox__flash">{flashMessage}</div> : null}

      <section className="V2Inbox__layout">
        <V2Panel title="Conversations" caption="Unread and needs reply threads are prioritized first.">
          {listQuery.isLoading ? (
            <V2State kind="loading">Loading inbox conversations...</V2State>
          ) : listQuery.isError ? (
            <V2State kind="error">Failed to load inbox: {String((listQuery.error as Error)?.message || listQuery.error)}</V2State>
          ) : conversations.length === 0 ? (
            <V2State kind="empty">No conversations match your filter.</V2State>
          ) : (
            <div className="V2Inbox__conversationList">
              {conversations.map((conversation) => {
                const isActive = selectedConversationId === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`V2Inbox__conversationRow ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setComposerText('');
                      setSelectedDraftId(null);
                      setIsComposerModalOpen(true);
                    }}
                  >
                    <div className="V2Inbox__conversationTop">
                      <strong>{conversation.contactName || conversation.contactPhone || conversation.contactKey}</strong>
                      <span>{fmtDateTime(conversation.lastMessage.createdAt)}</span>
                    </div>
                    <p>{shorten(conversation.lastMessage.body, 110)}</p>
                    <div className="V2Inbox__conversationMeta">
                      <span>{conversation.openNeedsReplyCount > 0 ? `${conversation.openNeedsReplyCount} needs reply` : 'No open reply items'}</span>
                      <span>{conversation.ownerLabel || 'Unassigned'}</span>
                      <span>{conversation.dnc ? 'DNC' : `Esc L${conversation.escalation.level}`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </V2Panel>

        <div className="V2Inbox__threadColumn">
          {!selectedConversationId ? (
            <V2State kind="empty">Select a conversation to view details.</V2State>
          ) : detailQuery.isLoading ? (
            <V2State kind="loading">Loading conversation...</V2State>
          ) : detailQuery.isError || !detail ? (
            <V2State kind="error">
              Failed to load conversation: {String((detailQuery.error as Error)?.message || detailQuery.error)}
            </V2State>
          ) : (
            <>
              <V2Panel
                title={
                  <span>
                    {detail.contactCard.name || detail.contactCard.phone || detail.contactCard.contactKey}
                    {detail.contactCard.dnc ? ' (DNC)' : ''}
                  </span>
                }
                caption={`Last touch: ${fmtDateTime(detail.conversation.lastTouchAt)} · Needs reply due: ${fmtDateTime(detail.conversation.needsReplyDueAt)}`}
              >
                <div className="V2Inbox__threadActions">
                  <button type="button" onClick={() => setIsComposerModalOpen(true)}>
                    Open Draft + Send
                  </button>
                </div>
                <div className="V2Inbox__thread">
                  {detail.messages.map((message) => {
                    const leadLabel = detail.contactCard.name || detail.contactCard.phone || 'Lead';
                    const defaultSetter = displaySetterName(detail.conversation.ownerLabel) || 'Setter';
                    const speaker =
                      message.direction === 'inbound' ? leadLabel : displaySetterName(message.alowareUser) || defaultSetter;
                    return (
                      <article key={message.id} className={`V2Inbox__message V2Inbox__message--${message.direction}`}>
                        <header>
                          <span>{speaker}</span>
                          <time>{fmtDateTime(message.createdAt)}</time>
                        </header>
                        <p>{message.body || '(empty message)'}</p>
                      </article>
                    );
                  })}
                </div>
              </V2Panel>
            </>
          )}
        </div>

        <div className="V2Inbox__sideColumn">
          {!detail ? (
            <V2State kind="empty">Conversation context will appear here.</V2State>
          ) : (
            <>
              <V2Panel
                title="Contact Card"
                caption="Enriched from Aloware and PT Biz conversation state."
                className="V2Inbox__sidePanel V2Inbox__sidePanel--contact"
              >
                <div className="V2Inbox__contactHead">
                  <span className="V2Inbox__contactAvatar">
                    {(detail.contactCard.name || detail.contactCard.phone || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p>{detail.contactCard.name || detail.contactCard.phone || 'Unknown contact'}</p>
                    <small>{detail.contactCard.email || 'No email on file'}</small>
                  </div>
                </div>
                <dl className="V2Inbox__cardList">
                  <dt>Name</dt>
                  <dd>{detail.contactCard.name || 'Unknown'}</dd>
                  <dt>Phone</dt>
                  <dd>{detail.contactCard.phone || 'Unknown'}</dd>
                  <dt>Email</dt>
                  <dd>{detail.contactCard.email || 'Unknown'}</dd>
                  <dt>Timezone</dt>
                  <dd>{detail.contactCard.timezone || 'Unknown'}</dd>
                  <dt>Niche</dt>
                  <dd>{detail.contactCard.niche || 'Unknown'}</dd>
                  <dt>monday trail</dt>
                  <dd>{detail.mondayTrail.length} recent records</dd>
                </dl>
              </V2Panel>

              <V2Panel
                title="Qualification State"
                caption={`Progress ${qualificationProgressLive}/4`}
                className={`V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${qualificationTone}`}
              >
                <div className="V2Inbox__stateTop">
                  <span className="V2Inbox__stateBadge">{qualificationProgressLive} of 4 captured</span>
                  <span className="V2Inbox__stateHint">
                    {qualificationProgressLive >= 4 ? 'Ready for handoff' : `${4 - qualificationProgressLive} remaining`}
                  </span>
                </div>
                <div className="V2Inbox__stateMeter" aria-hidden="true">
                  <span style={{ width: `${qualificationProgressPct}%` }} />
                </div>
                <div className="V2Inbox__pillRow">
                  {qualificationFields.map((field) => (
                    <span key={field.key} className={`V2Inbox__pill ${field.complete ? 'is-complete' : ''}`}>
                      {field.label}
                    </span>
                  ))}
                </div>

                <label className="V2Control">
                  <span>Full or part time</span>
                  <select
                    value={qualificationState.fullOrPartTime}
                    onChange={(event) =>
                      setQualificationState((prev) => ({
                        ...prev,
                        fullOrPartTime: event.target.value as QualificationStateV2['fullOrPartTime'],
                      }))
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                  </select>
                </label>

                <label className="V2Control">
                  <span>Niche</span>
                  <input
                    value={qualificationState.niche || ''}
                    onChange={(event) => setQualificationState((prev) => ({ ...prev, niche: event.target.value }))}
                    placeholder="Athletes, active adults, etc"
                  />
                </label>

                <label className="V2Control">
                  <span>Revenue mix</span>
                  <select
                    value={qualificationState.revenueMix}
                    onChange={(event) =>
                      setQualificationState((prev) => ({
                        ...prev,
                        revenueMix: event.target.value as QualificationStateV2['revenueMix'],
                      }))
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="mostly_cash">Mostly cash</option>
                    <option value="mostly_insurance">Mostly insurance</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </label>

                <label className="V2Control">
                  <span>Coaching interest</span>
                  <select
                    value={qualificationState.coachingInterest}
                    onChange={(event) =>
                      setQualificationState((prev) => ({
                        ...prev,
                        coachingInterest: event.target.value as QualificationStateV2['coachingInterest'],
                      }))
                    }
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
                  {qualificationMutation.isPending ? 'Saving...' : 'Save Qualification'}
                </button>
              </V2Panel>

              <V2Panel
                title="Escalation Override"
                caption={`Current level ${detail.conversation.escalation.level}`}
                className={`V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${escalationTone}`}
              >
                <div className="V2Inbox__stateTop">
                  <span className="V2Inbox__stateBadge">Level {escalationLevel}</span>
                  <span className="V2Inbox__stateHint">{escalationLevelSubtitle(escalationLevel)}</span>
                </div>
                <div className="V2Inbox__stateMeter" aria-hidden="true">
                  <span style={{ width: `${escalationProgressPct}%` }} />
                </div>
                <div className="V2Inbox__levelRail" role="group" aria-label="Escalation level quick pick">
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      type="button"
                      key={level}
                      className={`V2Inbox__levelChip ${escalationLevel === level ? 'is-active' : ''}`}
                      onClick={() => setEscalationLevel(level as 1 | 2 | 3 | 4)}
                    >
                      L{level}
                    </button>
                  ))}
                </div>

                <label className="V2Control">
                  <span>Level</span>
                  <select
                    value={String(escalationLevel)}
                    onChange={(event) => setEscalationLevel(Number.parseInt(event.target.value, 10) as 1 | 2 | 3 | 4)}
                  >
                    <option value="1">Level 1 Awareness</option>
                    <option value="2">Level 2 Objection Bridge</option>
                    <option value="3">Level 3 Call First</option>
                    <option value="4">Level 4 Scaling Hybrid</option>
                  </select>
                </label>

                <label className="V2Control">
                  <span>Reason</span>
                  <input
                    value={escalationReason}
                    onChange={(event) => setEscalationReason(event.target.value)}
                    placeholder="Why this override applies"
                  />
                </label>

                <button
                  type="button"
                  className="V2Inbox__stateAction V2Inbox__stateAction--secondary"
                  onClick={onOverrideEscalation}
                  disabled={escalationMutation.isPending}
                >
                  {escalationMutation.isPending ? 'Saving...' : 'Save Escalation'}
                </button>

                <div className="V2Inbox__escalationMeta">
                  <span>Cadence: {qualificationLabel(detail.conversation.escalation.cadenceStatus)}</span>
                  <span>Next follow up: {fmtDateTime(detail.conversation.escalation.nextFollowupDueAt)}</span>
                </div>
              </V2Panel>
            </>
          )}
        </div>
      </section>

      {isComposerModalOpen ? (
        <div className="V2Inbox__composerBackdrop" onClick={() => setIsComposerModalOpen(false)}>
          <section
            className="V2Inbox__composerModal"
            role="dialog"
            aria-modal="true"
            aria-label="Draft and send SMS"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="V2Inbox__composerModalHeader">
              <div className="V2Inbox__composerHeaderMain">
                <p className="V2Inbox__composerEyebrow">SMS Reply Composer</p>
                <h3>Draft + Send</h3>
                {detail ? (
                  <p>
                    {detail.contactCard.name || detail.contactCard.phone || detail.contactCard.contactKey} · Owner:{' '}
                    {detail.conversation.ownerLabel || 'Unassigned'}
                  </p>
                ) : (
                  <p>Select a conversation to send a message.</p>
                )}
              </div>
              <button type="button" className="V2Inbox__composerClose" onClick={() => setIsComposerModalOpen(false)}>
                Close
              </button>
            </header>

            <div className="V2Inbox__composerModalBody">
              {!selectedConversationId ? (
                <V2State kind="empty">Select a conversation to draft a message.</V2State>
              ) : detailQuery.isLoading ? (
                <V2State kind="loading">Loading conversation...</V2State>
              ) : detailQuery.isError || !detail ? (
                <V2State kind="error">
                  Failed to load conversation: {String((detailQuery.error as Error)?.message || detailQuery.error)}
                </V2State>
              ) : (
                <>
                  <div className="V2Inbox__composerGrid">
                    <section className="V2Inbox__composerPrimary">
                      <div className="V2Inbox__composerIntro">
                        <p className="V2Inbox__sendMeta">
                          Draft only workflow with strict lint guardrails and manual send approval.
                        </p>
                        <p className="V2Inbox__sendMeta">
                          Lead: {detail.contactCard.name || detail.contactCard.phone || detail.contactCard.contactKey} · Owner:{' '}
                          {detail.conversation.ownerLabel || 'Unassigned'}
                        </p>
                      </div>

                      <textarea
                        ref={composerRef}
                        className="V2Inbox__composer"
                        value={composerText}
                        onChange={(event) => setComposerText(event.target.value)}
                        placeholder="Generate a draft or type your message here"
                      />

                      <div className="V2Inbox__composerFooter">
                        <span className="V2Inbox__composerCount">{composerText.trim().length} chars</span>
                        <div className="V2Inbox__actions V2Inbox__actions--composerMain">
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--secondary"
                            onClick={onGenerateDraft}
                            disabled={generateDraftMutation.isPending || sendMutation.isPending}
                          >
                            {generateDraftMutation.isPending ? 'Generating...' : 'Generate Draft'}
                          </button>
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--primary"
                            onClick={onSend}
                            disabled={
                              sendMutation.isPending ||
                              composerText.trim().length === 0 ||
                              lineSelectionRequired ||
                              sendConfigQuery.isLoading
                            }
                          >
                            {sendMutation.isPending ? 'Sending...' : 'Send Message'}
                          </button>
                        </div>
                      </div>

                      {detail.drafts.length > 0 ? (
                        <div className="V2Inbox__drafts V2Inbox__drafts--composer">
                          <h4>Recent drafts</h4>
                          {detail.drafts.map((draft) => (
                            <button
                              key={draft.id}
                              type="button"
                              className={`V2Inbox__draftRow ${selectedDraftId === draft.id ? 'is-active' : ''}`}
                              onClick={() => {
                                setComposerText(draft.text);
                                setSelectedDraftId(draft.id);
                              }}
                            >
                              <span>{shorten(draft.text, 120)}</span>
                              <em>
                                lint {draft.lintScore.toFixed(0)} · structural {draft.structuralScore.toFixed(0)}
                              </em>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <aside className="V2Inbox__composerSidebar">
                      <div className="V2Inbox__lineCard">
                        <h4>Send line</h4>
                        {sendConfigQuery.isLoading ? (
                          <p className="V2Inbox__sendMeta">Loading outbound line config...</p>
                        ) : sendConfigQuery.isError ? (
                          <p className="V2Inbox__sendMeta">
                            Could not load send lines: {String((sendConfigQuery.error as Error)?.message || sendConfigQuery.error)}
                          </p>
                        ) : lineOptions.length > 0 ? (
                          <>
                            <label className="V2Control">
                              <span>Select line</span>
                              <select value={selectedLineKey} onChange={(event) => setSelectedLineKey(event.target.value)}>
                                <option value="">
                                  Select line
                                  {sendConfig?.defaultSelection ? ` (saved default: ${formatSendLineLabel(sendConfig.defaultSelection)})` : ''}
                                </option>
                                {lineOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {formatSendLineLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="V2Inbox__actions V2Inbox__actions--line">
                              <button
                                type="button"
                                className="V2Inbox__button V2Inbox__button--secondary"
                                onClick={onSaveDefaultLine}
                                disabled={setDefaultLineMutation.isPending || !selectedLineOption}
                              >
                                {setDefaultLineMutation.isPending ? 'Saving...' : 'Save Default'}
                              </button>
                              <button
                                type="button"
                                className="V2Inbox__button V2Inbox__button--ghost"
                                onClick={onClearDefaultLine}
                                disabled={setDefaultLineMutation.isPending}
                              >
                                Clear
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="V2Inbox__sendMeta">No line catalog detected. Configure send lines to enable line selection.</p>
                        )}
                        <p className="V2Inbox__sendMeta">
                          Saved default: {savedDefaultSummary}
                          {lineSelectionRequired ? ' · Select a line before sending.' : ''}
                        </p>
                      </div>

                      <div className="V2Inbox__lineCard V2Inbox__lineCard--soft">
                        <h4>Send guardrails</h4>
                        <p className="V2Inbox__sendMeta">Manual send approval only. Draft lint must be reviewed before final send.</p>
                        <p className="V2Inbox__sendMeta">If the contact is DNC or line selection is missing, send is blocked automatically.</p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
