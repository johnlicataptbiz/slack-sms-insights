export type RequestedMode = 'day' | 'range' | 'from-to';

export type ApiEnvelopeMeta = {
  schemaVersion: '2026.1';
  generatedAt: string;
  timeZone: string;
  requestedMode?: RequestedMode;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: ApiEnvelopeMeta;
};

export type SalesMetricsV2 = {
  processing: {
    model: 'live_rolling_metrics';
    source: 'continuous_sms_events_and_booked_calls';
  };
  timeRange: { from: string; to: string };
  totals: {
    messagesSent: number;
    manualMessagesSent: number;
    sequenceMessagesSent: number;
    peopleContacted: number;
    manualPeopleContacted: number;
    sequencePeopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    manualRepliesReceived: number;
    manualReplyRatePct: number;
    sequenceRepliesReceived: number;
    sequenceReplyRatePct: number;
    canonicalBookedCalls: number;
    optOuts: number;
  };
  bookedCredit: {
    total: number;
    jack: number;
    brandon: number;
    selfBooked: number;
  };
  trendByDay: Array<{
    day: string;
    messagesSent: number;
    manualMessagesSent: number;
    sequenceMessagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    manualRepliesReceived: number;
    sequenceRepliesReceived: number;
    canonicalBookedCalls: number;
    optOuts: number;
  }>;
  sequences: Array<{
    label: string;
    firstSeenAt: string | null;
    messagesSent: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    canonicalBookedAfterSmsReply: number;
    canonicalBookedJack: number;
    canonicalBookedBrandon: number;
    canonicalBookedSelf: number;
    bookedAuditRows: Array<{
      bookedCallId: string;
      eventTs: string;
      bucket: 'jack' | 'brandon' | 'selfBooked';
      firstConversion: string | null;
      rep: string | null;
      line: string | null;
      contactName: string | null;
      contactPhone: string | null;
      slackChannelId: string;
      slackMessageTs: string;
      text: string | null;
      strictSmsReplyLinked: boolean;
      latestReplyAt: string | null;
      strictSmsReplyReason: 'matched_reply_before_booking' | 'no_contact_phone' | 'no_reply_before_booking' | 'invalid_booking_timestamp';
      /** Sequence the contact was actively enrolled in at booking time, when different from the attributed sequence. */
      convertedViaSequence?: string | null;
    }>;
    diagnosticSmsBookingSignals: number;
    optOuts: number;
    optOutRatePct: number;
  }>;
  reps: Array<{
    repName: string;
    outboundConversations: number;
    replyRatePct: number | null;
    canonicalBookedCalls: number;
    diagnosticSmsBookingSignals: number;
    optOuts: number;
  }>;
  provenance: {
    canonicalBookedSource: 'slack';
    diagnosticBookingSignalsSource: 'sms_heuristics';
    sequenceBookedAttribution?: {
      source: 'slack_booked_calls';
      model: string;
      totalCalls: number;
      matchedCalls: number;
      unattributedCalls: number;
      manualCalls: number;
      strictSmsReplyLinkedCalls?: number;
      nonSmsOrUnknownCalls?: number;
    };
  };
};

export type SalesMetricsBatchV2 = {
  items: Array<{
    day: string;
    metrics: SalesMetricsV2;
  }>;
};

export type RunV2 = {
  processing: {
    model: 'snapshot_report';
    derivedFrom: 'continuous_sms_events_and_booked_calls';
  };
  id: string;
  createdAt: string;
  timestamp: string;
  reportDate: string | null;
  channelId: string;
  channelName: string | null;
  reportType: 'daily' | 'manual' | 'test';
  status: 'success' | 'error' | 'pending';
  errorMessage: string | null;
  summaryText: string | null;
  fullReport: string | null;
  durationMs: number | null;
  isLegacy: boolean;
};

export type RunsListV2 = {
  items: RunV2[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  filters: {
    daysBack: number;
    channelId: string | null;
    legacyMode: 'exclude' | 'only' | 'include';
  };
};

export type ChannelsV2 = {
  items: Array<{
    channelId: string;
    channelName: string | null;
    runCount: number;
  }>;
};

export type WeeklyManagerSummaryV2 = {
  window: {
    weekStart: string;
    weekEnd: string;
    timeZone: string;
  };
  sources: {
    monday: {
      boardId: string | null;
      status: 'ready' | 'stale' | 'missing' | 'disabled';
      enabled: boolean;
      lastSyncAt: string | null;
      staleThresholdHours: number;
    };
    generatedAt: string;
  };
  teamTotals: {
    messagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    optOuts: number;
  };
  setters: {
    jack: {
      outboundConversations: number;
      replyRatePct: number;
      diagnosticSmsBookingSignals: number;
      canonicalBookedCalls: number;
      optOuts: number;
    };
    brandon: {
      outboundConversations: number;
      replyRatePct: number;
      diagnosticSmsBookingSignals: number;
      canonicalBookedCalls: number;
      optOuts: number;
    };
  };
  mondayPipeline: {
    totalCalls: number;
    booked: number;
    noShow: number;
    cancelled: number;
    stageBreakdown: Array<{ stage: string; count: number }>;
  };
  topWins: Array<{
    sequence: string;
    canonicalBookedCalls: number;
    messagesSent: number;
    replyRatePct: number;
  }>;
  atRiskFlags: Array<{
    severity: 'high' | 'med' | 'low';
    title: string;
    detail: string;
  }>;
  actionsNextWeek: string[];
};

export type QualificationStateV2 = {
  fullOrPartTime: 'full_time' | 'part_time' | 'unknown';
  niche: string | null;
  revenueMix: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown';
  coachingInterest: 'high' | 'medium' | 'low' | 'unknown';
  progressStep: number;
};

export type EscalationStateV2 = {
  level: 1 | 2 | 3 | 4;
  reason: string | null;
  overridden: boolean;
  cadenceStatus: 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool';
  nextFollowupDueAt: string | null;
  lastPodcastSentAt: string | null;
};

export type InboxConversationV2 = {
  id: string;
  contactKey: string;
  contactName: string | null;
  contactPhone: string | null;
  repId: string | null;
  ownerLabel?: string | null;
  ownerSource?: 'rep' | 'latest_outbound_user' | 'latest_outbound_line' | 'unknown';
  status: 'open' | 'closed' | 'dnc';
  dnc: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastTouchAt: string | null;
  unrepliedInboundCount: number;
  openNeedsReplyCount: number;
  needsReplyDueAt: string | null;
  lastMessage: {
    direction: 'inbound' | 'outbound' | 'unknown' | null;
    body: string | null;
    createdAt: string | null;
  };
  qualification: QualificationStateV2;
  escalation: EscalationStateV2;
  objectionTags: string[];
  callOutcome: CallOutcomeV2 | null;
  guardrailOverrideCount: number;
};

export type InboxConversationListV2 = {
  items: InboxConversationV2[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  filters: {
    status: 'open' | 'closed' | 'dnc' | null;
    repId: string | null;
    needsReplyOnly: boolean;
    search: string | null;
  };
};

export type InboxConversationDetailV2 = {
  conversation: InboxConversationV2;
  contactCard: {
    contactKey: string;
    contactId: string | null;
    alowareContactId: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    timezone: string | null;
    niche: string | null;
    dnc: boolean;
  };
  messages: Array<{
    id: string;
    conversationId: string | null;
    direction: 'inbound' | 'outbound' | 'unknown';
    body: string | null;
    sequence: string | null;
    line: string | null;
    alowareUser: string | null;
    createdAt: string;
    slackChannelId: string;
    slackMessageTs: string;
  }>;
  drafts: Array<{
    id: string;
    text: string;
    lintScore: number;
    structuralScore: number;
    accepted: boolean;
    edited: boolean;
    createdAt: string;
  }>;
  mondayTrail: Array<{
    boardId: string;
    itemId: string;
    itemName: string | null;
    stage: string | null;
    callDate: string | null;
    disposition: string | null;
    isBooked: boolean;
    updatedAt: string;
  }>;
};

export type DraftSuggestionV2 = {
  id: string;
  conversationId: string;
  text: string;
  lint: {
    passed: boolean;
    score: number;
    structuralScore: number;
    issues: Array<{
      code: string;
      message: string;
      blocking: boolean;
    }>;
  };
  escalation: {
    level: 1 | 2 | 3 | 4;
    reason: string;
  };
  qualification: {
    step: number;
    missing: string[];
  };
  attempts: number;
  generationMode: 'ai' | 'contextual_fallback';
  generationWarnings: string[];
  createdAt: string;
};

export type SendMessageResultV2 = {
  status: 'sent' | 'blocked' | 'failed' | 'duplicate';
  reason: string;
  sendAttemptId: string;
  outboundEventId: string | null;
  lineSelection: {
    key: string | null;
    label: string | null;
    lineId: number | null;
    fromNumber: string | null;
  };
};

export type SendLineOptionV2 = {
  key: string;
  label: string;
  lineId: number | null;
  fromNumber: string | null;
};

export type InboxSendConfigV2 = {
  lines: SendLineOptionV2[];
  defaultSelection: SendLineOptionV2 | null;
  requiresSelection: boolean;
};

// ─── Scoreboard V2 Types ───────────────────────────────────────────────────────────

export type ScoreboardVolumeSplit = {
  total: number;
  sequence: number;
  manual: number;
  sequencePct: number;
  manualPct: number;
};

export type ScoreboardUniqueSplit = {
  total: number;
  sequence: number;
  manual: number;
};

export type ScoreboardReplySplit = {
  sequence: { count: number; ratePct: number };
  manual: { count: number; ratePct: number };
  overall: { count: number; ratePct: number };
};

export type ScoreboardBookingSplit = {
  total: number;
  jack: number;
  brandon: number;
  selfBooked: number;
  sequenceInitiated: number;
  manualInitiated: number;
};

export type ScoreboardSequenceRow = {
  label: string;
  leadMagnet: string;
  version: string;
  messagesSent: number;
  uniqueContacted: number;
  uniqueReplied: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  bookingRatePct: number;
  optOuts: number;
  optOutRatePct: number;
};

export type ScoreboardLeadMagnetRow = {
  leadMagnet: string;
  legacy: {
    messagesSent: number;
    uniqueContacted: number;
    uniqueReplied: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    bookingRatePct: number;
  } | null;
  v2: {
    messagesSent: number;
    uniqueContacted: number;
    uniqueReplied: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    bookingRatePct: number;
  } | null;
};

export type ScoreboardTimingRow = {
  dayOfWeek: string;
  outboundCount: number;
  replyCount: number;
  replyRatePct: number;
};

export type ScoreboardV2 = {
  window: {
    weekStart: string;
    weekEnd: string;
    monthStart: string;
    monthEnd: string;
    timeZone: string;
  };
  weekly: {
    volume: ScoreboardVolumeSplit;
    uniqueLeads: ScoreboardUniqueSplit;
    replies: ScoreboardReplySplit;
    bookings: ScoreboardBookingSplit;
  };
  monthly: {
    volume: ScoreboardVolumeSplit;
    uniqueLeads: ScoreboardUniqueSplit;
    replies: ScoreboardReplySplit;
    bookings: ScoreboardBookingSplit;
  };
  sequences: ScoreboardSequenceRow[];
  leadMagnetComparison: ScoreboardLeadMagnetRow[];
  timing: {
    medianTimeToFirstReplyMinutes: number | null;
    replyRateByDayOfWeek: ScoreboardTimingRow[];
  };
  compliance: {
    optOutRateWeeklyPct: number;
    optOutRateMonthlyPct: number;
    topOptOutSequences: Array<{ label: string; optOuts: number; optOutRatePct: number }>;
  };
  provenance: {
    attributionModel: 'sequence_initiated_conversation';
    weeklyBookingTotal: number;
    monthlyBookingTotal: number;
  };
};

// ─── Phase 3: Inbox Analytics Types ──────────────────────────────────────────

export type CallOutcomeV2 = 'not_a_fit' | 'too_early' | 'budget' | 'joined' | 'ghosted';

export const CALL_OUTCOME_LABELS: Record<CallOutcomeV2, string> = {
  not_a_fit: 'Not a Fit',
  too_early: 'Too Early',
  budget: 'Budget',
  joined: 'Joined ✓',
  ghosted: 'Ghosted',
};

export const CALL_OUTCOME_COLORS: Record<CallOutcomeV2, string> = {
  not_a_fit: 'var(--v2-critical)',
  too_early: 'var(--v2-warning)',
  budget: 'var(--v2-warning)',
  joined: 'var(--v2-positive)',
  ghosted: 'var(--v2-muted)',
};

export type StageConversionRowV2 = {
  escalation_level: number;
  total_conversations: number;
  call_offered_count: number;
  call_outcome_count: number;
  conversion_rate_pct: number;
};

export type ObjectionFrequencyRowV2 = {
  tag: string;
  count: number;
};
