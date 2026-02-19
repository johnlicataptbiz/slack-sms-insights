export type SmsDirection = 'inbound' | 'outbound';

export interface SmsEvent {
  id: string;
  conversationId: string;
  contactId: string;
  contactName: string | null;
  repId: string | null;
  repName: string | null;
  direction: SmsDirection;
  body: string;
  createdAt: string; // ISO
  alowareMessageId: string;
  status: 'delivered' | 'failed' | 'queued' | 'received';
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string | null;
  repId: string | null;
  repName: string | null;
  lastMessageAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  firstResponseAt: string | null;
  source: 'inbound' | 'outbound' | 'campaign';
  stage: 'new' | 'active' | 'nurture' | 'closed-won' | 'closed-lost';
  events: SmsEvent[];
}

export type WorkItemType =
  | 'FIRST_RESPONSE_DUE'
  | 'FOLLOWUP_DUE'
  | 'NO_RESPONSE_FROM_REP'
  | 'STALLED_CONVERSATION'
  | 'HOT_LEAD';

export type WorkItemStatus = 'open' | 'snoozed' | 'resolved';

export interface WorkItem {
  id: string;
  type: WorkItemType;
  status: WorkItemStatus;
  conversationId: string;
  contactName: string | null;
  repId: string | null;
  repName: string | null;
  createdAt: string;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  slaMinutes: number | null;
  currentLagMinutes: number | null;
  tags: string[];
  slackPermalink?: string;
}

export interface ResponseTimeBucket {
  bucket: '0-5' | '5-15' | '15-60' | '60-180' | '180+';
  count: number;
}

export interface RepPerformance {
  repId: string;
  repName: string;
  conversationsHandled: number;
  avgFirstResponseMinutes: number | null;
  p90FirstResponseMinutes: number | null;
  followupLagMinutesAvg: number | null;
  openWorkItems: number;
  overdueWorkItems: number;
  conversionRate: number | null;
}

export interface PipelineVelocity {
  avgTimeToFirstResponseMinutes: number | null;
  avgTimeToQualifiedMinutes: number | null;
  avgTimeToCloseWonMinutes: number | null;
}

export interface MetricsSummary {
  timeRange: { from: string; to: string };
  totalConversations: number;
  newConversations: number;
  responseTimeBuckets: ResponseTimeBucket[];
  reps: RepPerformance[];
  pipelineVelocity: PipelineVelocity;
  openWorkItems: number;
  overdueWorkItems: number;
}

export type SalesTrendPoint = {
  day: string; // YYYY-MM-DD
  messagesSent: number;
  manualMessagesSent: number;
  sequenceMessagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  booked: number;
  optOuts: number;
};

export type TopSequenceRow = {
  label: string;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  booked: number;
  optOuts: number;
};

export type RepLeaderboardRow = {
  repName: string;
  outboundConversations: number;
  booked: number;
  optOuts: number;
  replyRatePct: number | null;
};

export type SalesMetricsSummary = {
  timeRange: { from: string; to: string };
  totals: {
    messagesSent: number;
    manualMessagesSent: number;
    sequenceMessagesSent: number;
    repliesReceived: number;
    replyRatePct: number;
    booked: number;
    optOuts: number;
  };
  trendByDay: SalesTrendPoint[];
  topSequences: TopSequenceRow[];
  repLeaderboard: RepLeaderboardRow[];
};
