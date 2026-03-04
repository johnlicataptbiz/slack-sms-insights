import type { ChannelWithRunsRow, DailyRunRow } from '../services/daily-run-logger.js';
import type { WeeklyManagerSummary } from '../services/weekly-manager-summary.js';

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
      strictSmsReplyReason:
        | 'matched_reply_before_booking'
        | 'no_contact_phone'
        | 'no_reply_before_booking'
        | 'invalid_booking_timestamp';
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

export type InboxMessageV2 = {
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
};

export type InboxContactCardV2 = {
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

export type AlowareSequenceSyncV2 = {
  status: 'synced' | 'skipped';
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
  callOutcome: string | null;
  guardrailOverrideCount: number;
  mondayBooked: boolean;
};

export type InboxConversationDetailV2 = {
  conversation: InboxConversationV2;
  contactCard: InboxContactCardV2;
  messages: InboxMessageV2[];
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

export type DraftRequestV2 = {
  bookedCallLabel?: string;
};

export type SendMessageRequestV2 = {
  body: string;
  idempotencyKey?: string;
  lineId?: number;
  fromNumber?: string;
  senderIdentity?: string;
  setterAssist?: {
    chipLabel: string;
    intent: string;
  };
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

type SalesMetricsV1Compatible = {
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
    booked: number;
    optOuts: number;
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
    booked: number;
    optOuts: number;
  }>;
  topSequences: Array<{
    label: string;
    firstSeenAt?: string | null;
    messagesSent: number;
    uniqueContacted?: number;
    repliesReceived: number;
    replyRatePct: number;
    bookingRatePct?: number;
    bookingSignalsSms: number;
    optOuts: number;
    slackBookedCalls?: number;
    slackBookedAfterSmsReply?: number;
    slackBookedJack?: number;
    slackBookedBrandon?: number;
    slackBookedSelf?: number;
    slackBookedAuditRows?: Array<{
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
      strictSmsReplyReason:
        | 'matched_reply_before_booking'
        | 'no_contact_phone'
        | 'no_reply_before_booking'
        | 'invalid_booking_timestamp';
      convertedViaSequence?: string | null;
    }>;
  }>;
  repLeaderboard: Array<{
    repName: string;
    outboundConversations: number;
    bookingSignalsSms: number;
    replyRatePct: number | null;
    optOuts: number;
  }>;
  bookedCalls?: {
    booked: number;
    jack: number;
    brandon: number;
    selfBooked: number;
  };
  meta?: {
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

export const toEnvelope = <T>(params: {
  data: T;
  timeZone: string;
  requestedMode?: RequestedMode;
}): ApiEnvelope<T> => ({
  data: params.data,
  meta: {
    schemaVersion: '2026.1',
    generatedAt: new Date().toISOString(),
    timeZone: params.timeZone,
    requestedMode: params.requestedMode,
  },
});

export const toSalesMetricsV2 = (source: SalesMetricsV1Compatible): SalesMetricsV2 => ({
  processing: {
    model: 'live_rolling_metrics',
    source: 'continuous_sms_events_and_booked_calls',
  },
  timeRange: source.timeRange,
  totals: {
    messagesSent: source.totals.messagesSent,
    manualMessagesSent: source.totals.manualMessagesSent,
    sequenceMessagesSent: source.totals.sequenceMessagesSent,
    peopleContacted: source.totals.peopleContacted,
    manualPeopleContacted: source.totals.manualPeopleContacted,
    sequencePeopleContacted: source.totals.sequencePeopleContacted,
    repliesReceived: source.totals.repliesReceived,
    replyRatePct: source.totals.replyRatePct,
    manualRepliesReceived: source.totals.manualRepliesReceived,
    manualReplyRatePct: source.totals.manualReplyRatePct,
    sequenceRepliesReceived: source.totals.sequenceRepliesReceived,
    sequenceReplyRatePct: source.totals.sequenceReplyRatePct,
    canonicalBookedCalls: source.bookedCalls?.booked ?? source.totals.booked,
    optOuts: source.totals.optOuts,
  },
  bookedCredit: {
    total: source.bookedCalls?.booked ?? source.totals.booked,
    jack: source.bookedCalls?.jack ?? 0,
    brandon: source.bookedCalls?.brandon ?? 0,
    selfBooked: source.bookedCalls?.selfBooked ?? 0,
  },
  trendByDay: source.trendByDay.map((day) => ({
    day: day.day,
    messagesSent: day.messagesSent,
    manualMessagesSent: day.manualMessagesSent,
    sequenceMessagesSent: day.sequenceMessagesSent,
    peopleContacted: day.peopleContacted,
    repliesReceived: day.repliesReceived,
    replyRatePct: day.replyRatePct,
    manualRepliesReceived: day.manualRepliesReceived,
    sequenceRepliesReceived: day.sequenceRepliesReceived,
    canonicalBookedCalls: day.booked,
    optOuts: day.optOuts,
  })),
  sequences: source.topSequences.map((row) => ({
    label: row.label,
    firstSeenAt: row.firstSeenAt ?? null,
    messagesSent: row.messagesSent,
    uniqueContacted: row.uniqueContacted ?? 0,
    repliesReceived: row.repliesReceived,
    replyRatePct: row.replyRatePct,
    // Attribution priority:
    // 1. slackBookedCalls — real Slack booked-calls channel data, attributed to sequences via
    //    fuzzy match on firstConversion. This is the ground truth for actual bookings.
    canonicalBookedCalls: row.slackBookedCalls ?? 0,
    bookingRatePct:
      (row.uniqueContacted ?? 0) > 0 ? ((row.slackBookedCalls ?? 0) / (row.uniqueContacted ?? 0)) * 100 : 0,
    canonicalBookedAfterSmsReply: row.slackBookedAfterSmsReply ?? 0,
    canonicalBookedJack: row.slackBookedJack ?? 0,
    canonicalBookedBrandon: row.slackBookedBrandon ?? 0,
    canonicalBookedSelf: row.slackBookedSelf ?? 0,
    bookedAuditRows: row.slackBookedAuditRows ?? [],
    diagnosticSmsBookingSignals: row.bookingSignalsSms,
    optOuts: row.optOuts,
    optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
  })),
  reps: source.repLeaderboard.map((row) => {
    // Fix for Bug 3: Cross-reference bookedCalls.totals.jack/brandon with repName
    // to populate canonicalBookedCalls correctly.
    const repNameLower = row.repName.toLowerCase();
    let canonicalBookedCalls = 0;
    if (repNameLower.includes('jack')) {
      canonicalBookedCalls = source.bookedCalls?.jack ?? 0;
    } else if (repNameLower.includes('brandon')) {
      canonicalBookedCalls = source.bookedCalls?.brandon ?? 0;
    }
    return {
      repName: row.repName,
      outboundConversations: row.outboundConversations,
      replyRatePct: row.replyRatePct,
      canonicalBookedCalls,
      diagnosticSmsBookingSignals: row.bookingSignalsSms,
      optOuts: row.optOuts,
    };
  }),
  provenance: {
    canonicalBookedSource: 'slack',
    diagnosticBookingSignalsSource: 'sms_heuristics',
    sequenceBookedAttribution: source.meta?.sequenceBookedAttribution,
  },
});

export const toRunV2 = (run: DailyRunRow, options?: { includeFullReport?: boolean }): RunV2 => ({
  processing: {
    model: 'snapshot_report',
    derivedFrom: 'continuous_sms_events_and_booked_calls',
  },
  id: run.id,
  createdAt: run.created_at,
  timestamp: run.timestamp,
  reportDate: run.report_date,
  channelId: run.channel_id,
  channelName: run.channel_name,
  reportType: run.report_type,
  status: run.status,
  errorMessage: run.error_message,
  summaryText: run.summary_text,
  fullReport: options?.includeFullReport ? run.full_report : null,
  durationMs: run.duration_ms,
  isLegacy: run.is_legacy === true,
});

export const toRunsListV2 = (params: {
  rows: DailyRunRow[];
  limit: number;
  offset: number;
  daysBack: number;
  channelId?: string;
  legacyMode: 'exclude' | 'only' | 'include';
  includeFullReport?: boolean;
}): RunsListV2 => ({
  items: params.rows.map((row) => toRunV2(row, { includeFullReport: params.includeFullReport === true })),
  pagination: {
    limit: params.limit,
    offset: params.offset,
    count: params.rows.length,
  },
  filters: {
    daysBack: params.daysBack,
    channelId: params.channelId || null,
    legacyMode: params.legacyMode,
  },
});

export const toChannelsV2 = (rows: ChannelWithRunsRow[]): ChannelsV2 => ({
  items: rows.map((row) => ({
    channelId: row.channel_id,
    channelName: row.channel_name,
    runCount: Number.parseInt(row.run_count, 10) || 0,
  })),
});

export const toWeeklyManagerSummaryV2 = (summary: WeeklyManagerSummary): WeeklyManagerSummaryV2 => ({
  window: summary.window,
  sources: summary.sources,
  teamTotals: summary.teamTotals,
  setters: summary.setters,
  mondayPipeline: summary.mondayPipeline,
  topWins: summary.topWins,
  atRiskFlags: summary.atRiskFlags,
  actionsNextWeek: summary.actionsNextWeek,
});

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

export type ScoreboardLeadMagnetAttributionIssue = {
  label: string;
  parsedLeadMagnet: string;
  parsedVersion: string;
  reason: 'missing_lead_magnet' | 'no_pattern_match';
};

export type ScoreboardLeadMagnetAttributionDebug = {
  missingCount: number;
  missingLabels: string[];
  parserNoMatchCount: number;
  parserNoMatchLabels: string[];
  issues: ScoreboardLeadMagnetAttributionIssue[];
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
  debug: {
    leadMagnetAttribution: ScoreboardLeadMagnetAttributionDebug;
  };
  provenance: {
    attributionModel: 'sequence_initiated_conversation';
    weeklyBookingTotal: number;
    monthlyBookingTotal: number;
  };
};
