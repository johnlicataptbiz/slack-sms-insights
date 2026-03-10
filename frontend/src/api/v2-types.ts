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

export type UnattributedAuditRow = {
  bookedCallId: string;
  eventTs: string;
  bucket: 'booked' | 'jack' | 'brandon' | 'selfBooked';
  firstConversion: string | null;
  contactName: string | null;
  contactPhone: string | null;
  text: string | null;
  bestFuzzyScore: number;
  bestFuzzyCandidate: string | null;
};

export type BookedCredit = {
  total: number;
  /** Bookings by rep names or categories */
  jack: number;
  brandon: number;
  selfBooked: number;
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
  bookedCredit: BookedCredit;
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
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    bookingRatePct: number;
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
      unattributedAuditRows?: UnattributedAuditRow[];
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

export type MondayLeadScopeV2 = 'curated' | 'all' | 'board_ids';

export type MondayLeadInsightsV2 = {
  window: {
    fromDay: string;
    toDay: string;
    timeZone: string;
    scope: MondayLeadScopeV2;
  };
  includedBoards: string[];
  excludedBoards: string[];
  totals: {
    leads: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    badTiming: number;
    badFit: number;
    noShow: number;
    cancelled: number;
  };
  outcomesByCategory: Array<{
    category: string;
    count: number;
  }>;
  topSources: Array<{
    source: string;
    count: number;
  }>;
  topSetters: Array<{
    setter: string;
    leads: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    badTiming: number;
    badFit: number;
    noShow: number;
    cancelled: number;
  }>;
  activityByDay: Array<{
    day: string;
    leads: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    badTiming: number;
    badFit: number;
    noShow: number;
    cancelled: number;
  }>;
  mondaySyncState: Array<{
    boardId: string;
    status: string | null;
    lastSyncAt: string | null;
    updatedAt: string | null;
    error: string | null;
  }>;
  dataQuality: {
    attributionRows: number;
    sourceCoveragePct: number;
    campaignCoveragePct: number;
    setByCoveragePct: number;
    touchpointsCoveragePct: number;
    staleBoards: number;
    erroredBoards: number;
    emptyBoards: number;
  };
};

export type BoardCatalogV2 = {
  generatedAt: string;
  staleThresholdHours: number;
  totals: {
    boards: number;
    active: number;
    funnelBoards: number;
    synced: number;
    stale: number;
    errored: number;
    empty: number;
  };
  boards: Array<{
    boardId: string;
    boardLabel: string;
    boardClass: string;
    metricGrain: string;
    includeInFunnel: boolean;
    includeInExec: boolean;
    active: boolean;
    ownerTeam: string | null;
    notes: string | null;
    syncStatus: string | null;
    lastSyncAt: string | null;
    syncUpdatedAt: string | null;
    syncError: string | null;
    isStale: boolean;
    snapshotCount: number;
    leadOutcomeCount: number;
    leadAttributionCount: number;
    setterActivityCount: number;
    metricFactCount: number;
    coverage: {
      sourcePopulated: number;
      campaignPopulated: number;
      setByPopulated: number;
      touchpointsPopulated: number;
    };
  }>;
};

export type MondayScorecardsV2 = {
  window: { fromDay: string; toDay: string; timeZone: string };
  filters: {
    boardClass: string | null;
    metricOwner: string | null;
    metricName: string | null;
  };
  totals: {
    rows: number;
    boards: number;
    metrics: number;
  };
  metrics: Array<{
    metricName: string;
    rowCount: number;
    boards: number;
    totalValue: number | null;
    avgValue: number | null;
  }>;
  trendByDay: Array<{
    day: string;
    metricName: string;
    value: number | null;
    rowCount: number;
  }>;
  byOwner: Array<{
    metricOwner: string;
    role: 'setter' | 'closer' | 'other';
    rowCount: number;
    totalValue: number | null;
  }>;
};

export type QualificationStateV2 = {
  fullOrPartTime: 'full_time' | 'part_time' | 'unknown';
  niche: string | null;
  revenueMix: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown';
  deliveryModel: 'brick_and_mortar' | 'mobile' | 'online' | 'hybrid' | 'unknown';
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
  mondayBooked: boolean;
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
    leadSource: string | null;
    sequenceId: string | null;
    dispositionStatusId: string | null;
    tags: string[];
    textAuthorized: boolean | null;
    isBlocked: boolean | null;
    cnamCity: string | null;
    cnamState: string | null;
    cnamCountry: string | null;
    lrnLineType: string | null;
    lrnCarrier: string | null;
    lrnLastCheckedAt: string | null;
    lastEngagementAt: string | null;
    unreadCount: number | null;
    inboundSmsCount: number | null;
    outboundSmsCount: number | null;
    inboundCallCount: number | null;
    outboundCallCount: number | null;
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
    linkPreviews?: Array<{
      url: string;
      hostname: string | null;
      title: string | null;
      description: string | null;
      siteName: string | null;
      image: string | null;
    }>;
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

export type AlowareSequenceSyncV2 = {
  status: "synced" | "skipped";
  reason: string;
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

export type CrmNotesSuggestionV2 = {
  conversationId: string;
  text: string;
  generationMode: 'ai' | 'contextual_fallback';
  generationWarnings: string[];
  promptSnapshotHash: string;
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

export type SequenceKpiRowV2 = {
  label: string;
  leadMagnet: string;
  version: string;
  messagesSent: number;
  uniqueContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  bookedCalls: number;
  bookingRatePct: number;
  optOuts: number;
  optOutRatePct: number;
  firstSeenAt?: string | null;
  bookedBreakdown?: {
    jack: number;
    brandon: number;
    selfBooked: number;
    bookedAfterSmsReply: number;
    diagnosticSmsBookingSignals: number;
  };
};

export type SequenceKpisV2 = {
  items: SequenceKpiRowV2[];
  window: { from: string; to: string; timeZone: string };
};

export type InsightsSummaryV2 = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
  kpis: {
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
  };
  reps: Array<{
    repId: string;
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
  }>;
  funnel: {
    contacted: number;
    replied: number;
    booked: number;
    replyDropoffPct: number;
    bookingDropoffPct: number;
  };
  risks: Array<{ key: string; severity: 'critical' | 'warning' | 'info'; message: string }>;
  mondayHealth: {
    boards: number;
    staleBoards: number;
    erroredBoards: number;
    avgSourceCoveragePct: number;
    avgCampaignCoveragePct: number;
  };
};

export type SequenceDeepV2 = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
  sequences: Array<{
    sequenceId: string;
    label: string;
    leadMagnet: string;
    versionTag: string;
    status: 'active' | 'inactive';
    ownerRep: string | null;
    isManualBucket: boolean;
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
    bookedBreakdown: {
      jack: number;
      brandon: number;
      selfBooked: number;
      bookedAfterSmsReply: number;
      diagnosticSignals: number;
    };
    leadQuality: {
      leadsCount: number;
      highInterestPct: number;
      fullTimePct: number;
      mostlyCashPct: number;
      progressedToStep3Or4Pct: number;
    };
  }>;
  monday: {
    boards: number;
    staleBoards: number;
    erroredBoards: number;
    avgSourceCoveragePct: number;
    avgCampaignCoveragePct: number;
    avgSetByCoveragePct: number;
    avgTouchpointsCoveragePct: number;
  };
};

export type SequenceVersionHistoryRowV2 = {
  label: string;
  leadMagnet: string;
  version: string;
  status: 'active' | 'testing' | 'rewrite' | 'archived';
  canonicalBody: string | null;
  sampleBodies: string[];
  sentCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type SequenceVersionHistoryV2 = {
  items: SequenceVersionHistoryRowV2[];
  lookbackDays: number;
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

export type SetterAssistPerformanceRowV2 = {
  chip_label: string;
  sent_count: number;
  replied_count: number;
  joined_count: number;
  reply_rate_pct: number;
};

// ─── Changelog Types ─────────────────────────────────────────────────────────

export type ChangelogEntryType = 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';

export type ChangelogEntry = {
  hash: string;
  date: string;
  message: string;
  author: string;
  type: ChangelogEntryType;
  category: string;
  description: string;
};

export type ChangelogStats = {
  features: number;
  fixes: number;
  refactors: number;
  docs: number;
  other: number;
};

export type ChangelogTimeline = {
  entries: ChangelogEntry[];
  totalCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  stats: ChangelogStats;
};
