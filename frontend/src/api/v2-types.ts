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
    canonicalBookedJack: number;
    canonicalBookedBrandon: number;
    canonicalBookedSelf: number;
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
    };
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
