import type {
  ApiEnvelope,
  BoardCatalogV2,
  ChannelsV2,
  ChangelogTimeline,
  DraftSuggestionV2,
  InboxSendConfigV2,
  InboxConversationDetailV2,
  InboxConversationListV2,
  MondayScorecardsV2,
  RunV2,
  RunsListV2,
  SalesMetricsBatchV2,
  SalesMetricsV2,
  SequenceVersionHistoryV2,
  ScoreboardV2,
  SendMessageResultV2,
  MondayLeadInsightsV2,
  WeeklyManagerSummaryV2,
} from './v2-types';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

function assertEnvelopeMeta(value: unknown): asserts value is ApiEnvelope<unknown>['meta'] {
  if (!isObject(value)) throw new Error('Invalid v2 envelope meta: not an object');
  if (value.schemaVersion !== '2026.1') throw new Error('Invalid v2 envelope meta: unsupported schemaVersion');
  if (!isString(value.generatedAt)) throw new Error('Invalid v2 envelope meta: generatedAt must be string');
  if (!isString(value.timeZone)) throw new Error('Invalid v2 envelope meta: timeZone must be string');
}

function assertRun(value: unknown): void {
  if (!isObject(value)) throw new Error('Invalid v2 run: not an object');
  if (!isObject(value.processing)) throw new Error('Invalid v2 run.processing');
  if (value.processing.model !== 'snapshot_report') throw new Error('Invalid v2 run.processing.model');
  if (value.processing.derivedFrom !== 'continuous_sms_events_and_booked_calls') {
    throw new Error('Invalid v2 run.processing.derivedFrom');
  }
  if (!isString(value.id)) throw new Error('Invalid v2 run.id');
  if (!isString(value.timestamp)) throw new Error('Invalid v2 run.timestamp');
  if (!isString(value.channelId)) throw new Error('Invalid v2 run.channelId');
  if (!isString(value.reportType)) throw new Error('Invalid v2 run.reportType');
  if (!isString(value.status)) throw new Error('Invalid v2 run.status');
  if (!isBoolean(value.isLegacy)) throw new Error('Invalid v2 run.isLegacy');
}

const assertSalesMetricsPayload = (data: Record<string, unknown>, context: string): void => {
  if (!isObject(data.processing)) throw new Error(`Invalid ${context}: processing missing`);
  if (data.processing.model !== 'live_rolling_metrics') {
    throw new Error(`Invalid ${context}: processing.model`);
  }
  if (data.processing.source !== 'continuous_sms_events_and_booked_calls') {
    throw new Error(`Invalid ${context}: processing.source`);
  }
  if (!isObject(data.totals)) throw new Error(`Invalid ${context}: totals missing`);
  if (!isNumber(data.totals.messagesSent)) throw new Error(`Invalid ${context}: totals.messagesSent`);
  if (!isNumber(data.totals.canonicalBookedCalls)) {
    throw new Error(`Invalid ${context}: totals.canonicalBookedCalls`);
  }
  if (!isObject(data.bookedCredit)) throw new Error(`Invalid ${context}: bookedCredit missing`);
  if (!Array.isArray(data.trendByDay)) throw new Error(`Invalid ${context}: trendByDay missing`);
  if (!Array.isArray(data.sequences)) throw new Error(`Invalid ${context}: sequences missing`);
  if (!Array.isArray(data.reps)) throw new Error(`Invalid ${context}: reps missing`);
};

export function assertSalesMetricsV2Envelope(value: unknown): asserts value is ApiEnvelope<SalesMetricsV2> {
  if (!isObject(value)) throw new Error('Invalid v2 sales-metrics response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 sales-metrics response: data must be object');

  assertSalesMetricsPayload(value.data, 'v2 sales-metrics response');
}

export function assertSalesMetricsBatchV2Envelope(value: unknown): asserts value is ApiEnvelope<SalesMetricsBatchV2> {
  if (!isObject(value)) throw new Error('Invalid v2 sales-metrics batch response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 sales-metrics batch response: data must be object');
  if (!Array.isArray(value.data.items)) throw new Error('Invalid v2 sales-metrics batch response: items missing');
  for (const item of value.data.items) {
    if (!isObject(item)) throw new Error('Invalid v2 sales-metrics batch row: not an object');
    if (!isString(item.day)) throw new Error('Invalid v2 sales-metrics batch row.day');
    if (!isObject(item.metrics)) throw new Error('Invalid v2 sales-metrics batch row.metrics');
    assertSalesMetricsPayload(item.metrics, 'v2 sales-metrics batch row.metrics');
  }
}

export function assertRunsListV2Envelope(value: unknown): asserts value is ApiEnvelope<RunsListV2> {
  if (!isObject(value)) throw new Error('Invalid v2 runs response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 runs response: data must be object');

  const data = value.data;
  if (!Array.isArray(data.items)) throw new Error('Invalid v2 runs response: data.items must be array');
  for (const item of data.items) assertRun(item);
  if (!isObject(data.pagination)) throw new Error('Invalid v2 runs response: pagination missing');
  if (!isNumber(data.pagination.count)) throw new Error('Invalid v2 runs response: pagination.count invalid');
  if (!isObject(data.filters)) throw new Error('Invalid v2 runs response: filters missing');
}

export function assertRunV2Envelope(value: unknown): asserts value is ApiEnvelope<RunV2> {
  if (!isObject(value)) throw new Error('Invalid v2 run response: not an object');
  assertEnvelopeMeta(value.meta);
  assertRun(value.data);
}

export function assertChannelsV2Envelope(value: unknown): asserts value is ApiEnvelope<ChannelsV2> {
  if (!isObject(value)) throw new Error('Invalid v2 channels response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 channels response: data must be object');
  if (!Array.isArray(value.data.items)) throw new Error('Invalid v2 channels response: items must be array');

  for (const item of value.data.items) {
    if (!isObject(item)) throw new Error('Invalid v2 channel row: not an object');
    if (!isString(item.channelId)) throw new Error('Invalid v2 channel row.channelId');
    if (!(item.channelName === null || isString(item.channelName))) {
      throw new Error('Invalid v2 channel row.channelName');
    }
    if (!isNumber(item.runCount)) throw new Error('Invalid v2 channel row.runCount');
  }
}

export function assertWeeklySummaryV2Envelope(value: unknown): asserts value is ApiEnvelope<WeeklyManagerSummaryV2> {
  if (!isObject(value)) throw new Error('Invalid v2 weekly-summary response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 weekly-summary response: data must be object');

  const data = value.data;
  if (!isObject(data.window)) throw new Error('Invalid v2 weekly-summary response: window missing');
  if (!isString(data.window.weekStart)) throw new Error('Invalid v2 weekly-summary response: window.weekStart');
  if (!isString(data.window.weekEnd)) throw new Error('Invalid v2 weekly-summary response: window.weekEnd');
  if (!isString(data.window.timeZone)) throw new Error('Invalid v2 weekly-summary response: window.timeZone');

  if (!isObject(data.sources)) throw new Error('Invalid v2 weekly-summary response: sources missing');
  if (!isObject(data.sources.monday)) throw new Error('Invalid v2 weekly-summary response: sources.monday missing');
  if (!isString(data.sources.monday.status)) throw new Error('Invalid v2 weekly-summary response: sources.monday.status');
  if (!isBoolean(data.sources.monday.enabled)) throw new Error('Invalid v2 weekly-summary response: sources.monday.enabled');

  if (!isObject(data.teamTotals)) throw new Error('Invalid v2 weekly-summary response: teamTotals missing');
  if (!isNumber(data.teamTotals.messagesSent)) throw new Error('Invalid v2 weekly-summary response: teamTotals.messagesSent');
  if (!isNumber(data.teamTotals.canonicalBookedCalls)) {
    throw new Error('Invalid v2 weekly-summary response: teamTotals.canonicalBookedCalls');
  }

  if (!isObject(data.setters)) throw new Error('Invalid v2 weekly-summary response: setters missing');
  if (!isObject(data.setters.jack)) throw new Error('Invalid v2 weekly-summary response: setters.jack missing');
  if (!isObject(data.setters.brandon)) throw new Error('Invalid v2 weekly-summary response: setters.brandon missing');

  if (!isObject(data.mondayPipeline)) throw new Error('Invalid v2 weekly-summary response: mondayPipeline missing');
  if (!Array.isArray(data.mondayPipeline.stageBreakdown)) {
    throw new Error('Invalid v2 weekly-summary response: mondayPipeline.stageBreakdown');
  }
  if (!Array.isArray(data.topWins)) throw new Error('Invalid v2 weekly-summary response: topWins missing');
  if (!Array.isArray(data.atRiskFlags)) throw new Error('Invalid v2 weekly-summary response: atRiskFlags missing');
  if (!Array.isArray(data.actionsNextWeek)) throw new Error('Invalid v2 weekly-summary response: actionsNextWeek missing');
}

export function assertMondayLeadInsightsV2Envelope(value: unknown): asserts value is ApiEnvelope<MondayLeadInsightsV2> {
  if (!isObject(value)) throw new Error('Invalid v2 monday lead-insights response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 monday lead-insights response: data must be object');

  const data = value.data;
  if (!isObject(data.window)) throw new Error('Invalid v2 monday lead-insights response: window missing');
  if (!isString(data.window.fromDay)) throw new Error('Invalid v2 monday lead-insights response: window.fromDay');
  if (!isString(data.window.toDay)) throw new Error('Invalid v2 monday lead-insights response: window.toDay');
  if (!isString(data.window.timeZone)) throw new Error('Invalid v2 monday lead-insights response: window.timeZone');
  if (!isString(data.window.scope)) throw new Error('Invalid v2 monday lead-insights response: window.scope');
  if (!Array.isArray(data.includedBoards)) throw new Error('Invalid v2 monday lead-insights response: includedBoards');
  if (!Array.isArray(data.excludedBoards)) throw new Error('Invalid v2 monday lead-insights response: excludedBoards');

  if (!isObject(data.totals)) throw new Error('Invalid v2 monday lead-insights response: totals missing');
  if (!isNumber(data.totals.leads)) throw new Error('Invalid v2 monday lead-insights response: totals.leads');
  if (!isNumber(data.totals.booked)) throw new Error('Invalid v2 monday lead-insights response: totals.booked');

  if (!Array.isArray(data.outcomesByCategory)) {
    throw new Error('Invalid v2 monday lead-insights response: outcomesByCategory missing');
  }
  if (!Array.isArray(data.topSources)) throw new Error('Invalid v2 monday lead-insights response: topSources missing');
  if (!Array.isArray(data.topSetters)) throw new Error('Invalid v2 monday lead-insights response: topSetters missing');
  if (!Array.isArray(data.activityByDay)) throw new Error('Invalid v2 monday lead-insights response: activityByDay missing');
  if (!Array.isArray(data.mondaySyncState)) {
    throw new Error('Invalid v2 monday lead-insights response: mondaySyncState missing');
  }
  if (!isObject(data.dataQuality)) throw new Error('Invalid v2 monday lead-insights response: dataQuality missing');
  if (!isNumber(data.dataQuality.sourceCoveragePct)) {
    throw new Error('Invalid v2 monday lead-insights response: dataQuality.sourceCoveragePct');
  }
}

export function assertMondayBoardCatalogV2Envelope(value: unknown): asserts value is ApiEnvelope<BoardCatalogV2> {
  if (!isObject(value)) throw new Error('Invalid v2 monday board-catalog response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 monday board-catalog response: data must be object');
  if (!isString(value.data.generatedAt)) throw new Error('Invalid v2 monday board-catalog response: generatedAt');
  if (!isObject(value.data.totals)) throw new Error('Invalid v2 monday board-catalog response: totals missing');
  if (!Array.isArray(value.data.boards)) throw new Error('Invalid v2 monday board-catalog response: boards missing');
}

export function assertMondayScorecardsV2Envelope(value: unknown): asserts value is ApiEnvelope<MondayScorecardsV2> {
  if (!isObject(value)) throw new Error('Invalid v2 monday scorecards response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 monday scorecards response: data must be object');
  if (!isObject(value.data.window)) throw new Error('Invalid v2 monday scorecards response: window missing');
  if (!isObject(value.data.totals)) throw new Error('Invalid v2 monday scorecards response: totals missing');
  if (!Array.isArray(value.data.metrics)) throw new Error('Invalid v2 monday scorecards response: metrics missing');
  if (!Array.isArray(value.data.trendByDay)) throw new Error('Invalid v2 monday scorecards response: trendByDay missing');
  if (!Array.isArray(value.data.byOwner)) throw new Error('Invalid v2 monday scorecards response: byOwner missing');
}

const assertInboxConversation = (value: unknown): void => {
  if (!isObject(value)) throw new Error('Invalid inbox conversation: not an object');
  if (!isString(value.id)) throw new Error('Invalid inbox conversation.id');
  if (!isString(value.contactKey)) throw new Error('Invalid inbox conversation.contactKey');
  if (!isNullableString(value.contactName)) throw new Error('Invalid inbox conversation.contactName');
  if (!isNullableString(value.contactPhone)) throw new Error('Invalid inbox conversation.contactPhone');
  if (!isString(value.status)) throw new Error('Invalid inbox conversation.status');
  if (!isBoolean(value.dnc)) throw new Error('Invalid inbox conversation.dnc');
  if (!isObject(value.lastMessage)) throw new Error('Invalid inbox conversation.lastMessage');
  if (!isObject(value.qualification)) throw new Error('Invalid inbox conversation.qualification');
  if (!isObject(value.escalation)) throw new Error('Invalid inbox conversation.escalation');
};

export function assertInboxConversationListEnvelope(value: unknown): asserts value is ApiEnvelope<InboxConversationListV2> {
  if (!isObject(value)) throw new Error('Invalid inbox list response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid inbox list response: data must be object');
  if (!Array.isArray(value.data.items)) throw new Error('Invalid inbox list response: items missing');

  for (const item of value.data.items) {
    assertInboxConversation(item);
  }

  if (!isObject(value.data.pagination)) throw new Error('Invalid inbox list response: pagination missing');
  if (!isObject(value.data.filters)) throw new Error('Invalid inbox list response: filters missing');
}

export function assertInboxConversationDetailEnvelope(
  value: unknown,
): asserts value is ApiEnvelope<InboxConversationDetailV2> {
  if (!isObject(value)) throw new Error('Invalid inbox detail response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid inbox detail response: data must be object');
  assertInboxConversation(value.data.conversation);
  if (!isObject(value.data.contactCard)) throw new Error('Invalid inbox detail response: contactCard missing');
  if (!Array.isArray(value.data.messages)) throw new Error('Invalid inbox detail response: messages missing');
  if (!Array.isArray(value.data.drafts)) throw new Error('Invalid inbox detail response: drafts missing');
  if (!Array.isArray(value.data.mondayTrail)) throw new Error('Invalid inbox detail response: mondayTrail missing');
}

export function assertDraftSuggestionEnvelope(value: unknown): asserts value is ApiEnvelope<DraftSuggestionV2> {
  if (!isObject(value)) throw new Error('Invalid draft suggestion response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid draft suggestion response: data must be object');
  if (!isString(value.data.id)) throw new Error('Invalid draft suggestion response: id missing');
  if (!isString(value.data.text)) throw new Error('Invalid draft suggestion response: text missing');
  if (!isObject(value.data.lint)) throw new Error('Invalid draft suggestion response: lint missing');
  if (!isObject(value.data.escalation)) throw new Error('Invalid draft suggestion response: escalation missing');
  if (!isString(value.data.generationMode)) throw new Error('Invalid draft suggestion response: generationMode missing');
  if (!Array.isArray(value.data.generationWarnings)) {
    throw new Error('Invalid draft suggestion response: generationWarnings missing');
  }
}

export function assertCrmNotesSuggestionEnvelope(
  value: unknown,
): asserts value is ApiEnvelope<{ conversationId: string; text: string; generationMode: string; generationWarnings: string[]; promptSnapshotHash: string; createdAt: string }> {
  if (!isObject(value)) throw new Error('Invalid CRM notes response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid CRM notes response: data must be object');
  if (!isString(value.data.conversationId)) throw new Error('Invalid CRM notes response: conversationId missing');
  if (!isString(value.data.text)) throw new Error('Invalid CRM notes response: text missing');
  if (!isString(value.data.generationMode)) throw new Error('Invalid CRM notes response: generationMode missing');
  if (!Array.isArray(value.data.generationWarnings)) {
    throw new Error('Invalid CRM notes response: generationWarnings missing');
  }
  if (!isString(value.data.promptSnapshotHash)) {
    throw new Error('Invalid CRM notes response: promptSnapshotHash missing');
  }
  if (!isString(value.data.createdAt)) throw new Error('Invalid CRM notes response: createdAt missing');
}

export function assertSendMessageResultEnvelope(value: unknown): asserts value is ApiEnvelope<SendMessageResultV2> {
  if (!isObject(value)) throw new Error('Invalid send response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid send response: data must be object');
  if (!isString(value.data.status)) throw new Error('Invalid send response: status missing');
  if (!isString(value.data.reason)) throw new Error('Invalid send response: reason missing');
  if (!isString(value.data.sendAttemptId)) throw new Error('Invalid send response: sendAttemptId missing');
  if (!isNullableString(value.data.outboundEventId)) throw new Error('Invalid send response: outboundEventId');
  if (!isObject(value.data.lineSelection)) throw new Error('Invalid send response: lineSelection missing');
}

export function assertInboxSendConfigEnvelope(value: unknown): asserts value is ApiEnvelope<InboxSendConfigV2> {
  if (!isObject(value)) throw new Error('Invalid send-config response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid send-config response: data must be object');
  if (!Array.isArray(value.data.lines)) throw new Error('Invalid send-config response: lines must be array');
  if (!(value.data.defaultSelection === null || isObject(value.data.defaultSelection))) {
    throw new Error('Invalid send-config response: defaultSelection');
  }
  if (!isBoolean(value.data.requiresSelection)) {
    throw new Error('Invalid send-config response: requiresSelection');
  }
}

export function assertScoreboardV2Envelope(value: unknown): asserts value is ApiEnvelope<ScoreboardV2> {
  if (!isObject(value)) throw new Error('Invalid scoreboard response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid scoreboard response: data must be object');

  const data = value.data;

  // Window
  if (!isObject(data.window)) throw new Error('Invalid scoreboard response: window missing');
  if (!isString(data.window.weekStart)) throw new Error('Invalid scoreboard response: window.weekStart');
  if (!isString(data.window.weekEnd)) throw new Error('Invalid scoreboard response: window.weekEnd');
  if (!isString(data.window.monthStart)) throw new Error('Invalid scoreboard response: window.monthStart');
  if (!isString(data.window.monthEnd)) throw new Error('Invalid scoreboard response: window.monthEnd');
  if (!isString(data.window.timeZone)) throw new Error('Invalid scoreboard response: window.timeZone');

  // Weekly/Monthly splits
  const assertSplit = (obj: unknown, ctx: string): void => {
    if (!isObject(obj)) throw new Error(`Invalid scoreboard response: ${ctx} missing`);
    if (!isObject(obj.volume)) throw new Error(`Invalid scoreboard response: ${ctx}.volume missing`);
    if (!isObject(obj.uniqueLeads)) throw new Error(`Invalid scoreboard response: ${ctx}.uniqueLeads missing`);
    if (!isObject(obj.replies)) throw new Error(`Invalid scoreboard response: ${ctx}.replies missing`);
    if (!isObject(obj.bookings)) throw new Error(`Invalid scoreboard response: ${ctx}.bookings missing`);
  };

  assertSplit(data.weekly, 'weekly');
  assertSplit(data.monthly, 'monthly');

  // Sequences
  if (!Array.isArray(data.sequences)) throw new Error('Invalid scoreboard response: sequences must be array');

  // Lead magnet comparison
  if (!Array.isArray(data.leadMagnetComparison)) {
    throw new Error('Invalid scoreboard response: leadMagnetComparison must be array');
  }

  // Timing
  if (!isObject(data.timing)) throw new Error('Invalid scoreboard response: timing missing');

  // Compliance
  if (!isObject(data.compliance)) throw new Error('Invalid scoreboard response: compliance missing');

  // Provenance
  if (!isObject(data.provenance)) throw new Error('Invalid scoreboard response: provenance missing');
  if (data.provenance.attributionModel !== 'sequence_initiated_conversation') {
    throw new Error('Invalid scoreboard response: provenance.attributionModel');
  }
}

export function assertSequenceVersionHistoryV2Envelope(
  value: unknown,
): asserts value is ApiEnvelope<SequenceVersionHistoryV2> {
  if (!isObject(value)) throw new Error('Invalid sequence version history response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid sequence version history response: data must be object');
  if (!Array.isArray(value.data.items)) throw new Error('Invalid sequence version history response: items must be array');
  if (!isNumber(value.data.lookbackDays)) {
    throw new Error('Invalid sequence version history response: lookbackDays must be number');
  }
}

export function assertChangelogEnvelope(value: unknown): asserts value is ApiEnvelope<ChangelogTimeline> {
  if (!isObject(value)) throw new Error('Invalid changelog response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid changelog response: data must be object');
  if (!Array.isArray(value.data.entries)) throw new Error('Invalid changelog response: entries must be array');
  if (!isNumber(value.data.totalCount)) throw new Error('Invalid changelog response: totalCount must be number');
  if (!isObject(value.data.dateRange)) throw new Error('Invalid changelog response: dateRange must be object');
  if (!isString(value.data.dateRange.from)) throw new Error('Invalid changelog response: dateRange.from must be string');
  if (!isString(value.data.dateRange.to)) throw new Error('Invalid changelog response: dateRange.to must be string');
  if (!isObject(value.data.stats)) throw new Error('Invalid changelog response: stats must be object');
  if (!isNumber(value.data.stats.features)) throw new Error('Invalid changelog response: stats.features must be number');
  if (!isNumber(value.data.stats.fixes)) throw new Error('Invalid changelog response: stats.fixes must be number');
  if (!isNumber(value.data.stats.refactors)) throw new Error('Invalid changelog response: stats.refactors must be number');
  if (!isNumber(value.data.stats.docs)) throw new Error('Invalid changelog response: stats.docs must be number');
  if (!isNumber(value.data.stats.other)) throw new Error('Invalid changelog response: stats.other must be number');
}
