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
    repliesReceived: number;
    replyRatePct: number;
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
      strictSmsReplyReason: 'matched_reply_before_booking' | 'no_contact_phone' | 'no_reply_before_booking' | 'invalid_booking_timestamp';
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
    repliesReceived: row.repliesReceived,
    replyRatePct: row.replyRatePct,
    canonicalBookedCalls: row.slackBookedCalls ?? 0,
    canonicalBookedAfterSmsReply: row.slackBookedAfterSmsReply ?? 0,
    canonicalBookedJack: row.slackBookedJack ?? 0,
    canonicalBookedBrandon: row.slackBookedBrandon ?? 0,
    canonicalBookedSelf: row.slackBookedSelf ?? 0,
    bookedAuditRows: row.slackBookedAuditRows ?? [],
    diagnosticSmsBookingSignals: row.bookingSignalsSms,
    optOuts: row.optOuts,
    optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
  })),
  reps: source.repLeaderboard.map((row) => ({
    repName: row.repName,
    outboundConversations: row.outboundConversations,
    replyRatePct: row.replyRatePct,
    canonicalBookedCalls: 0,
    diagnosticSmsBookingSignals: row.bookingSignalsSms,
    optOuts: row.optOuts,
  })),
  provenance: {
    canonicalBookedSource: 'slack',
    diagnosticBookingSignalsSource: 'sms_heuristics',
    sequenceBookedAttribution: source.meta?.sequenceBookedAttribution,
  },
});

export const toRunV2 = (run: DailyRunRow): RunV2 => ({
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
  fullReport: run.full_report,
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
}): RunsListV2 => ({
  items: params.rows.map(toRunV2),
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
