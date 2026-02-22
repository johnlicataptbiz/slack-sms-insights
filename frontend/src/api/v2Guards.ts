import type {
  ApiEnvelope,
  ChannelsV2,
  DraftSuggestionV2,
  InboxSendConfigV2,
  InboxConversationDetailV2,
  InboxConversationListV2,
  RunsListV2,
  SalesMetricsV2,
  SendMessageResultV2,
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
  if (!isString(value.id)) throw new Error('Invalid v2 run.id');
  if (!isString(value.timestamp)) throw new Error('Invalid v2 run.timestamp');
  if (!isString(value.channelId)) throw new Error('Invalid v2 run.channelId');
  if (!isString(value.reportType)) throw new Error('Invalid v2 run.reportType');
  if (!isString(value.status)) throw new Error('Invalid v2 run.status');
  if (!isBoolean(value.isLegacy)) throw new Error('Invalid v2 run.isLegacy');
}

export function assertSalesMetricsV2Envelope(value: unknown): asserts value is ApiEnvelope<SalesMetricsV2> {
  if (!isObject(value)) throw new Error('Invalid v2 sales-metrics response: not an object');
  assertEnvelopeMeta(value.meta);
  if (!isObject(value.data)) throw new Error('Invalid v2 sales-metrics response: data must be object');

  const data = value.data;
  if (!isObject(data.totals)) throw new Error('Invalid v2 sales-metrics response: totals missing');
  if (!isNumber(data.totals.messagesSent)) throw new Error('Invalid v2 sales-metrics response: totals.messagesSent');
  if (!isNumber(data.totals.canonicalBookedCalls)) {
    throw new Error('Invalid v2 sales-metrics response: totals.canonicalBookedCalls');
  }
  if (!isObject(data.bookedCredit)) throw new Error('Invalid v2 sales-metrics response: bookedCredit missing');
  if (!Array.isArray(data.trendByDay)) throw new Error('Invalid v2 sales-metrics response: trendByDay missing');
  if (!Array.isArray(data.sequences)) throw new Error('Invalid v2 sales-metrics response: sequences missing');
  if (!Array.isArray(data.reps)) throw new Error('Invalid v2 sales-metrics response: reps missing');
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
