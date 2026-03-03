import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client } from './client';
import {
  assertDraftSuggestionEnvelope,
  assertChannelsV2Envelope,
  assertInboxSendConfigEnvelope,
  assertInboxConversationDetailEnvelope,
  assertInboxConversationListEnvelope,
  assertRunV2Envelope,
  assertRunsListV2Envelope,
  assertMondayLeadInsightsV2Envelope,
  assertSalesMetricsBatchV2Envelope,
  assertSalesMetricsV2Envelope,
  assertSequenceVersionHistoryV2Envelope,
  assertScoreboardV2Envelope,
  assertSendMessageResultEnvelope,
  assertWeeklySummaryV2Envelope,
} from './v2Guards';
import type {
  AlowareSequenceSyncV2,
  ApiEnvelope,
  CallOutcomeV2,
  ChannelsV2,
  DraftSuggestionV2,
  InboxSendConfigV2,
  InboxConversationDetailV2,
  InboxConversationListV2,
  MondayLeadInsightsV2,
  ObjectionFrequencyRowV2,
  QualificationStateV2,
  RunV2,
  RunsListV2,
  SalesMetricsBatchV2,
  SalesMetricsV2,
  SequenceVersionHistoryV2,
  ScoreboardV2,
  SendMessageResultV2,
  StageConversionRowV2,
  WeeklyManagerSummaryV2,
} from './v2-types';

export type SalesMetricsQueryParams =
  | { from: string; to: string; tz?: string }
  | { day: string; tz?: string }
  | { range: 'today' | '7d' | '30d' | '90d' | '180d' | '365d'; tz?: string };

const buildSalesMetricsSearchParams = (params: SalesMetricsQueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if ('from' in params && 'to' in params) {
    searchParams.set('from', params.from);
    searchParams.set('to', params.to);
  } else if ('day' in params) {
    searchParams.set('day', params.day);
  } else {
    searchParams.set('range', params.range);
  }
  if (params.tz) searchParams.set('tz', params.tz);
  return searchParams;
};

const findRepRow = (rows: SalesMetricsV2['reps'], rep: 'jack' | 'brandon') => {
  return rows.find((row) => row.repName.toLowerCase().includes(rep)) || null;
};

export type SetterTrendPoint = {
  day: string;
  team: {
    messagesSent: number;
    replyRatePct: number;
    bookedCalls: number;
    optOuts: number;
  };
  setters: {
    jack: {
      outboundConversations: number;
      replyRatePct: number;
      bookedCalls: number;
      optOuts: number;
    };
    brandon: {
      outboundConversations: number;
      replyRatePct: number;
      bookedCalls: number;
      optOuts: number;
    };
  };
};

const toRunsSearchParams = (params: {
  daysBack: number;
  channelId?: string | null;
  limit?: number;
  offset?: number;
  includeLegacy?: boolean;
  legacyOnly?: boolean;
  includeFullReport?: boolean;
}): URLSearchParams => {
  const searchParams = new URLSearchParams();
  searchParams.set('daysBack', String(params.daysBack));
  searchParams.set('limit', String(params.limit ?? 50));
  searchParams.set('offset', String(params.offset ?? 0));
  if (params.channelId) searchParams.set('channelId', params.channelId);
  if (params.includeLegacy) searchParams.set('includeLegacy', 'true');
  if (params.legacyOnly) searchParams.set('legacyOnly', 'true');
  if (params.includeFullReport) searchParams.set('includeFullReport', 'true');
  return searchParams;
};

export const fetchV2SalesMetrics = async (params: SalesMetricsQueryParams) => {
  const searchParams = buildSalesMetricsSearchParams(params);
  const response = await client.get<unknown>(`/api/v2/sales-metrics?${searchParams.toString()}`);
  assertSalesMetricsV2Envelope(response);
  return response as ApiEnvelope<SalesMetricsV2>;
};

const fetchV2SalesMetricsBatch = async (params: { days: string[]; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('days', params.days.join(','));
  if (params.tz) searchParams.set('tz', params.tz);
  const response = await client.get<unknown>(`/api/v2/sales-metrics/batch?${searchParams.toString()}`);
  assertSalesMetricsBatchV2Envelope(response);
  return response as ApiEnvelope<SalesMetricsBatchV2>;
};

export const useV2SalesMetrics = (params: SalesMetricsQueryParams, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['v2', 'salesMetrics', params],
    enabled: options?.enabled ?? true,
    queryFn: async () => fetchV2SalesMetrics(params),
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes (cacheTime in v5)
    retry: 3,                  // Retry 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2SetterTrend = (days: string[], tz: string) => {
  return useQuery({
    queryKey: ['v2', 'setterTrend', [...days].sort(), tz],
    enabled: days.length > 0,
    queryFn: async () => {
      const uniqueDays = [...new Set(days)].sort((a, b) => a.localeCompare(b));
      const batchEnvelope = await fetchV2SalesMetricsBatch({ days: uniqueDays, tz });

      return batchEnvelope.data.items.map<SetterTrendPoint>((item, index) => {
        const metrics = item.metrics;
        const jack = findRepRow(metrics.reps, 'jack');
        const brandon = findRepRow(metrics.reps, 'brandon');

        return {
          day: item.day || metrics.trendByDay[0]?.day || uniqueDays[index] || '',
          team: {
            messagesSent: metrics.totals.messagesSent,
            replyRatePct: metrics.totals.replyRatePct,
            bookedCalls: metrics.totals.canonicalBookedCalls,
            optOuts: metrics.totals.optOuts,
          },
          setters: {
            jack: {
              outboundConversations: jack?.outboundConversations ?? 0,
              replyRatePct: jack?.replyRatePct ?? 0,
              bookedCalls: metrics.bookedCredit.jack,
              optOuts: jack?.optOuts ?? 0,
            },
            brandon: {
              outboundConversations: brandon?.outboundConversations ?? 0,
              replyRatePct: brandon?.replyRatePct ?? 0,
              bookedCalls: metrics.bookedCredit.brandon,
              optOuts: brandon?.optOuts ?? 0,
            },
          },
        };
      });
    },
    staleTime: 60 * 1000,        // 1 minute
    gcTime: 10 * 60 * 1000,      // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2Runs = (params: {
  daysBack: number;
  channelId?: string | null;
  limit?: number;
  offset?: number;
  includeLegacy?: boolean;
  legacyOnly?: boolean;
  includeFullReport?: boolean;
}) => {
  const searchParams = toRunsSearchParams(params);
  return useQuery({
    queryKey: ['v2', 'runs', params],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/runs?${searchParams.toString()}`);
      assertRunsListV2Envelope(response);
      return response as ApiEnvelope<RunsListV2>;
    },
    staleTime: 30 * 1000,        // 30 seconds
    gcTime: 5 * 60 * 1000,       // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2Run = (runId: string | null) => {
  return useQuery({
    queryKey: ['v2', 'run', runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/runs/${runId}`);
      assertRunV2Envelope(response);
      return response as ApiEnvelope<RunV2>;
    },
    staleTime: 60 * 1000,        // 1 minute
    gcTime: 10 * 60 * 1000,      // 10 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2Channels = () => {
  return useQuery({
    queryKey: ['v2', 'channels'],
    queryFn: async () => {
      const response = await client.get<unknown>('/api/v2/channels');
      assertChannelsV2Envelope(response);
      return response as ApiEnvelope<ChannelsV2>;
    },
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 30 * 60 * 1000,        // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2SequenceVersionHistory = (params?: { lookbackDays?: number }) => {
  const lookbackDays = Number.isFinite(params?.lookbackDays) ? Math.trunc(params?.lookbackDays ?? 365) : 365;
  return useQuery({
    queryKey: ['v2', 'sequences', 'version-history', lookbackDays],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/sequences/version-history?lookbackDays=${lookbackDays}`);
      assertSequenceVersionHistoryV2Envelope(response);
      return response as ApiEnvelope<SequenceVersionHistoryV2>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2UpdateSequenceVersionDecision = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      label: string;
      status: 'active' | 'testing' | 'rewrite' | 'archived';
      updatedBy?: string;
    }) => {
      return client.post<ApiEnvelope<{ label: string; status: string; updatedBy: string | null; updatedAt: string }>>(
        '/api/v2/sequences/version-decisions',
        params,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'sequences', 'version-history'] });
    },
  });
};

const toWeeklySummarySearchParams = (params: { weekStart?: string; tz?: string }): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if (params.weekStart) searchParams.set('weekStart', params.weekStart);
  if (params.tz) searchParams.set('tz', params.tz);
  return searchParams;
};

export const useV2WeeklySummary = (params: { weekStart?: string; tz?: string }) => {
  const searchParams = toWeeklySummarySearchParams(params);
  const queryString = searchParams.toString();
  const suffix = queryString ? `?${queryString}` : '';

  return useQuery({
    queryKey: ['v2', 'weeklySummary', params.weekStart || null, params.tz || null],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/weekly-summary${suffix}`);
      assertWeeklySummaryV2Envelope(response);
      return response as ApiEnvelope<WeeklyManagerSummaryV2>;
    },
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 30 * 60 * 1000,        // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

type MondayLeadInsightsQueryParams = {
  range?: 'today' | '7d' | '30d';
  day?: string;
  from?: string;
  to?: string;
  tz?: string;
  boardId?: string;
  sourceLimit?: number;
  setterLimit?: number;
};

const toMondayLeadInsightsSearchParams = (params: MondayLeadInsightsQueryParams): URLSearchParams => {
  const search = new URLSearchParams();
  if (params.day) {
    search.set('day', params.day);
  } else if (params.from && params.to) {
    search.set('from', params.from);
    search.set('to', params.to);
  } else {
    search.set('range', params.range || '30d');
  }
  if (params.tz) search.set('tz', params.tz);
  if (params.boardId) search.set('boardId', params.boardId);
  if (Number.isFinite(params.sourceLimit)) search.set('sourceLimit', String(params.sourceLimit));
  if (Number.isFinite(params.setterLimit)) search.set('setterLimit', String(params.setterLimit));
  return search;
};

export const useV2MondayLeadInsights = (params: MondayLeadInsightsQueryParams) => {
  const search = toMondayLeadInsightsSearchParams(params);
  return useQuery({
    queryKey: ['v2', 'admin', 'monday', 'lead-insights', params],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/admin/monday/lead-insights?${search.toString()}`);
      assertMondayLeadInsightsV2Envelope(response);
      return response as ApiEnvelope<MondayLeadInsightsV2>;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

type InboxListParams = {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed' | 'dnc';
  repId?: string;
  needsReplyOnly?: boolean;
  search?: string;
};

const toInboxListSearchParams = (params: InboxListParams): URLSearchParams => {
  const search = new URLSearchParams();
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.offset != null) search.set('offset', String(params.offset));
  if (params.status) search.set('status', params.status);
  if (params.repId) search.set('repId', params.repId);
  if (params.needsReplyOnly) search.set('needsReplyOnly', 'true');
  if (params.search && params.search.trim().length > 0) search.set('search', params.search.trim());
  return search;
};

export const useV2InboxConversations = (params: InboxListParams) => {
  const search = toInboxListSearchParams(params);
  return useQuery({
    queryKey: ['v2', 'inbox', 'conversations', params],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/inbox/conversations?${search.toString()}`);
      assertInboxConversationListEnvelope(response);
      return response as ApiEnvelope<InboxConversationListV2>;
    },
    staleTime: 10 * 1000,          // 10 seconds
    gcTime: 60 * 1000,             // 1 minute
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: true,  // Refresh when user returns to tab
  });
};

export const useV2InboxConversationDetail = (
  conversationId: string | null,
  options?: { forceSyncTick?: number },
) => {
  const forceSyncTick = options?.forceSyncTick ?? 0;
  return useQuery({
    queryKey: ['v2', 'inbox', 'conversation', conversationId, forceSyncTick],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const query = forceSyncTick > 0 ? `?sync=1&t=${forceSyncTick}` : '';
      const response = await client.get<unknown>(`/api/v2/inbox/conversations/${conversationId}${query}`);
      assertInboxConversationDetailEnvelope(response);
      return response as ApiEnvelope<InboxConversationDetailV2>;
    },
    staleTime: 5 * 1000,           // 5 seconds
    gcTime: 60 * 1000,             // 1 minute
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: true,
  });
};

export const useV2GenerateDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; bookedCallLabel?: string }) => {
      const response = await client.post<unknown>(`/api/v2/inbox/conversations/${params.conversationId}/draft`, {
        bookedCallLabel: params.bookedCallLabel,
      });
      assertDraftSuggestionEnvelope(response);
      return response as ApiEnvelope<DraftSuggestionV2>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2SendInboxMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      conversationId: string;
      body: string;
      idempotencyKey?: string;
      lineId?: number;
      fromNumber?: string;
      senderIdentity?: string;
      draftId?: string;
    }) => {
      const response = await client.post<unknown>(`/api/v2/inbox/conversations/${params.conversationId}/send`, {
        body: params.body,
        idempotencyKey: params.idempotencyKey,
        lineId: params.lineId,
        fromNumber: params.fromNumber,
        senderIdentity: params.senderIdentity,
        draftId: params.draftId,
      });
      assertSendMessageResultEnvelope(response);
      return response as ApiEnvelope<SendMessageResultV2>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2UpdateQualification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      conversationId: string;
      fullOrPartTime?: QualificationStateV2['fullOrPartTime'];
      niche?: string | null;
      revenueMix?: QualificationStateV2['revenueMix'];
      deliveryModel?: QualificationStateV2['deliveryModel'];
      coachingInterest?: QualificationStateV2['coachingInterest'];
    }) => {
      return client.post<ApiEnvelope<QualificationStateV2>>(`/api/v2/inbox/conversations/${params.conversationId}/qualification`, {
        fullOrPartTime: params.fullOrPartTime,
        niche: params.niche,
        revenueMix: params.revenueMix,
        deliveryModel: params.deliveryModel,
        coachingInterest: params.coachingInterest,
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2OverrideEscalation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      conversationId: string;
      level: 1 | 2 | 3 | 4;
      reason?: string;
      cadenceStatus?: 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool';
      nextFollowupDueAt?: string;
      lastPodcastSentAt?: string;
    }) => {
      return client.post<ApiEnvelope<unknown>>(`/api/v2/inbox/conversations/${params.conversationId}/escalation-override`, {
        level: params.level,
        reason: params.reason,
        cadenceStatus: params.cadenceStatus,
        nextFollowupDueAt: params.nextFollowupDueAt,
        lastPodcastSentAt: params.lastPodcastSentAt,
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2DraftFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      draftId: string;
      conversationId: string;
      accepted?: boolean;
      edited?: boolean;
      sendLinkedEventId?: string;
      sourceOutboundEventId?: string;
      bookedCallLabel?: string;
      closedWonLabel?: string;
      escalationLevel?: 1 | 2 | 3 | 4;
      structureSignature?: string;
      qualifierSnapshot?: unknown;
    }) => {
      return client.post<ApiEnvelope<{ success: boolean }>>(`/api/v2/inbox/drafts/${params.draftId}/feedback`, {
        accepted: params.accepted,
        edited: params.edited,
        sendLinkedEventId: params.sendLinkedEventId,
        sourceOutboundEventId: params.sourceOutboundEventId,
        bookedCallLabel: params.bookedCallLabel,
        closedWonLabel: params.closedWonLabel,
        escalationLevel: params.escalationLevel,
        structureSignature: params.structureSignature,
        qualifierSnapshot: params.qualifierSnapshot,
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2InboxSendConfig = () => {
  return useQuery({
    queryKey: ['v2', 'inbox', 'send-config'],
    queryFn: async () => {
      const response = await client.get<unknown>('/api/v2/inbox/send-config');
      assertInboxSendConfigEnvelope(response);
      return response as ApiEnvelope<InboxSendConfigV2>;
    },
    staleTime: 60 * 1000,        // 1 minute
    gcTime: 5 * 60 * 1000,         // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

export const useV2UpdateConversationStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; status: 'open' | 'closed' | 'dnc' }) => {
      return client.post<
        ApiEnvelope<{
          id: string;
          status: 'open' | 'closed' | 'dnc';
          alowareSequenceSync: AlowareSequenceSyncV2 | null;
        }>
      >(
        `/api/v2/inbox/conversations/${params.conversationId}/status`,
        { status: params.status },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2EnrollConversationToSequence = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; sequenceId: string | number; forceEnroll?: boolean }) => {
      return client.post<
        ApiEnvelope<{
          conversationId: string;
          sequenceId: string | number;
          alowareSequenceSync: AlowareSequenceSyncV2 | null;
        }>
      >(`/api/v2/inbox/conversations/${params.conversationId}/sequence-enroll`, {
        sequenceId: params.sequenceId,
        forceEnroll: params.forceEnroll,
      });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2DisenrollConversationFromSequence = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string }) => {
      return client.post<
        ApiEnvelope<{
          conversationId: string;
          alowareSequenceSync: AlowareSequenceSyncV2 | null;
        }>
      >(`/api/v2/inbox/conversations/${params.conversationId}/sequence-disenroll`, {});
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

export const useV2SetDefaultSendLine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lineId?: number | null; fromNumber?: string | null; clear?: boolean }) => {
      return client.post<ApiEnvelope<{ success: boolean; defaultSelection: InboxSendConfigV2['defaultSelection'] }>>(
        '/api/v2/inbox/send-config/default',
        {
          lineId: params.lineId,
          fromNumber: params.fromNumber,
          clear: params.clear,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'send-config'] });
    },
  });
};

// ─── Scoreboard V2 Hook ───────────────────────────────────────────────────────────

const toScoreboardSearchParams = (params: { weekStart?: string; tz?: string }): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if (params.weekStart) searchParams.set('weekStart', params.weekStart);
  if (params.tz) searchParams.set('tz', params.tz);
  return searchParams;
};

export const useV2Scoreboard = (params: { weekStart?: string; tz?: string }) => {
  const searchParams = toScoreboardSearchParams(params);
  const queryString = searchParams.toString();
  const suffix = queryString ? `?${queryString}` : '';

  return useQuery({
    queryKey: ['v2', 'scoreboard', params.weekStart || null, params.tz || null],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/scoreboard${suffix}`);
      assertScoreboardV2Envelope(response);
      return response as ApiEnvelope<ScoreboardV2>;
    },
    staleTime: 60 * 1000,        // 1 minute
    gcTime: 5 * 60 * 1000,      // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
  });
};

// ─── Phase 2: Whisper Notes ───────────────────────────────────────────────────

export type ConversationNote = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export const useV2ConversationNotes = (conversationId: string | null) => {
  return useQuery({
    queryKey: ['v2', 'inbox', 'notes', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const res = await client.get<ApiEnvelope<{ notes: ConversationNote[] }>>(
        `/api/v2/inbox/conversations/${conversationId}/notes`,
      );
      return (res as ApiEnvelope<{ notes: ConversationNote[] }>).data.notes;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useV2AddConversationNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; author: string; text: string }) => {
      return client.post<ApiEnvelope<ConversationNote>>(
        `/api/v2/inbox/conversations/${params.conversationId}/notes`,
        { author: params.author, text: params.text },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'notes', variables.conversationId] });
    },
  });
};

// ─── Phase 2: Snooze ─────────────────────────────────────────────────────────

export const useV2SnoozeConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; snoozedUntil: string | null }) => {
      return client.post<ApiEnvelope<{ id: string; nextFollowupDueAt: string | null }>>(
        `/api/v2/inbox/conversations/${params.conversationId}/snooze`,
        { snoozedUntil: params.snoozedUntil },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

// ─── Phase 2: Assignment ─────────────────────────────────────────────────────

export const useV2AssignConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; ownerLabel: string | null }) => {
      return client.post<ApiEnvelope<{ id: string; ownerLabel: string | null }>>(
        `/api/v2/inbox/conversations/${params.conversationId}/assign`,
        { ownerLabel: params.ownerLabel },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversation', variables.conversationId] });
    },
  });
};

// ─── Phase 2: Template Library ───────────────────────────────────────────────

export type MessageTemplate = {
  id: string;
  name: string;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const useV2InboxTemplates = () => {
  return useQuery({
    queryKey: ['v2', 'inbox', 'templates'],
    queryFn: async () => {
      const res = await client.get<ApiEnvelope<{ templates: MessageTemplate[] }>>(
        '/api/v2/inbox/templates',
      );
      return (res as ApiEnvelope<{ templates: MessageTemplate[] }>).data.templates;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useV2CreateTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; body: string; createdBy?: string }) => {
      return client.post<ApiEnvelope<MessageTemplate>>('/api/v2/inbox/templates', {
        name: params.name,
        body: params.body,
        createdBy: params.createdBy,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'templates'] });
    },
  });
};

export const useV2DeleteTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      return client.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
        `/api/v2/inbox/templates/${templateId}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'templates'] });
    },
  });
};

// ─── Phase 3: Analytics Queries ───────────────────────────────────────────────

export const useV2StageConversion = () =>
  useQuery({
    queryKey: ['v2', 'inbox', 'analytics', 'stage-conversion'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<StageConversionRowV2[]>>(
        '/api/v2/inbox/analytics/stage-conversion',
      );
      return (response as ApiEnvelope<StageConversionRowV2[]>).data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useV2ObjectionFrequency = () =>
  useQuery({
    queryKey: ['v2', 'inbox', 'analytics', 'objection-frequency'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<ObjectionFrequencyRowV2[]>>(
        '/api/v2/inbox/analytics/objection-frequency',
      );
      return (response as ApiEnvelope<ObjectionFrequencyRowV2[]>).data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

// ─── Phase 3: Conversation-Level Mutations ────────────────────────────────────

export const useV2UpdateObjectionTags = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; tags: string[] }) => {
      return client.post<ApiEnvelope<{ conversationId: string; objectionTags: string[] }>>(
        `/api/v2/inbox/conversations/${params.conversationId}/objection-tags`,
        { tags: params.tags },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['v2', 'inbox', 'conversation', variables.conversationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['v2', 'inbox', 'analytics', 'objection-frequency'],
      });
    },
  });
};

export const useV2UpdateCallOutcome = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { conversationId: string; outcome: CallOutcomeV2 | null }) => {
      return client.post<ApiEnvelope<{ conversationId: string; callOutcome: string | null }>>(
        `/api/v2/inbox/conversations/${params.conversationId}/call-outcome`,
        { outcome: params.outcome },
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['v2', 'inbox', 'conversation', variables.conversationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['v2', 'inbox', 'analytics', 'stage-conversion'],
      });
    },
  });
};

export const useV2IncrementGuardrailOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      return client.post<ApiEnvelope<{ conversationId: string; guardrailOverrideCount: number }>>(
        `/api/v2/inbox/conversations/${conversationId}/guardrail-override`,
        {},
      );
    },
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({
        queryKey: ['v2', 'inbox', 'conversation', conversationId],
      });
    },
  });
};

// ─── Advanced Analytics Queries ────────────────────────────────────────────────

export type LinePerformanceRow = {
  line: string;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  optOuts: number;
  optOutRatePct: number;
  bookingSignals: number;
  uniqueContacts: number;
};

export type LinePerformanceAnalytics = {
  timeRange: { from: string; to: string };
  lines: LinePerformanceRow[];
  totals: {
    totalLines: number;
    totalMessages: number;
    totalReplies: number;
    overallReplyRate: number;
    totalOptOuts: number;
  };
};

export const useV2LinePerformance = (params: { range: 'today' | '7d' | '30d'; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.tz) searchParams.set('tz', params.tz);

  return useQuery({
    queryKey: ['v2', 'analytics', 'line-performance', params],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<LinePerformanceAnalytics>>(
        `/api/v2/analytics/line-performance?${searchParams.toString()}`
      );
      return response as ApiEnvelope<LinePerformanceAnalytics>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export type QualificationFunnelAnalytics = {
  totalConversations: number;
  qualifiedConversations: number;
  funnel: {
    employmentStatus: { fullTime: number; partTime: number; unknown: number };
    revenueMix: { mostlyCash: number; mostlyInsurance: number; balanced: number; unknown: number };
    coachingInterest: { high: number; medium: number; low: number; unknown: number };
  };
  escalationDistribution: { level1: number; level2: number; level3: number; level4: number };
  cadenceDistribution: { idle: number; podcastSent: number; callOffered: number; nurturePool: number };
  conversionByQualification: {
    highInterestConversionRate: number;
    mediumInterestConversionRate: number;
    lowInterestConversionRate: number;
  };
};

export const useV2QualificationFunnel = () => {
  return useQuery({
    queryKey: ['v2', 'analytics', 'qualification-funnel'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<QualificationFunnelAnalytics>>(
        '/api/v2/analytics/qualification-funnel'
      );
      return response as ApiEnvelope<QualificationFunnelAnalytics>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export type DraftAIPerformanceAnalytics = {
  totalDrafts: number;
  acceptedDrafts: number;
  editedDrafts: number;
  rejectedDrafts: number;
  genericToneDrafts: number;
  setterAnchoredDrafts: number;
  setterAnchorCoverageRate: number;
  genericToneRate: number;
  setterLikeRate: number;
  acceptanceRate: number;
  editRate: number;
  avgLintScore: number;
  avgStructuralScore: number;
  scoreByOutcome: {
    accepted: { avgLint: number; avgStructural: number };
    edited: { avgLint: number; avgStructural: number };
    rejected: { avgLint: number; avgStructural: number };
  };
  trendByDay: Array<{
    day: string;
    total: number;
    accepted: number;
    edited: number;
    avgLintScore: number;
  }>;
};

export const useV2DraftAIPerformance = (params: { range: 'today' | '7d' | '30d'; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.tz) searchParams.set('tz', params.tz);

  return useQuery({
    queryKey: ['v2', 'analytics', 'draft-ai-performance', params],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<DraftAIPerformanceAnalytics>>(
        `/api/v2/analytics/draft-ai-performance?${searchParams.toString()}`
      );
      return response as ApiEnvelope<DraftAIPerformanceAnalytics>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export type FollowUpSLAAnalytics = {
  totalWorkItems: number;
  resolvedOnTime: number;
  resolvedLate: number;
  pending: number;
  slaComplianceRate: number;
  avgResolutionTimeMinutes: number;
  byRep: Array<{
    repId: string;
    total: number;
    onTime: number;
    late: number;
    pending: number;
    complianceRate: number;
  }>;
  byType: Array<{
    type: string;
    total: number;
    onTime: number;
    late: number;
    avgResolutionMinutes: number;
  }>;
};

export const useV2FollowUpSLA = (params: { range: 'today' | '7d' | '30d'; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.tz) searchParams.set('tz', params.tz);

  return useQuery({
    queryKey: ['v2', 'analytics', 'followup-sla', params],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<FollowUpSLAAnalytics>>(
        `/api/v2/analytics/followup-sla?${searchParams.toString()}`
      );
      return response as ApiEnvelope<FollowUpSLAAnalytics>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

// ─── Issue #27: Goals Analytics ─────────────────────────────────────────────────
export type Goal = {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  period: 'daily' | 'weekly' | 'monthly';
  progressPct: number;
  isOnTrack: boolean;
};

export const useV2Goals = () => {
  return useQuery({
    queryKey: ['v2', 'analytics', 'goals'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<Goal[]>>('/api/v2/analytics/goals');
      return response as ApiEnvelope<Goal[]>;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
};

// ─── Issue #28: Trend Alerts ────────────────────────────────────────────────────
export type TrendAlert = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  detectedAt: string;
};

export const useV2TrendAlerts = () => {
  return useQuery({
    queryKey: ['v2', 'analytics', 'trend-alerts'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<TrendAlert[]>>('/api/v2/analytics/trend-alerts');
      return response as ApiEnvelope<TrendAlert[]>;
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
};

// ─── Issue #23: Time to Booking ─────────────────────────────────────────────────
export type TimeToBookingStats = {
  avgDays: number;
  medianDays: number;
  minDays: number;
  maxDays: number;
  bySequence: Array<{
    sequence: string;
    avgDays: number;
    bookings: number;
  }>;
};

export const useV2TimeToBooking = () => {
  return useQuery({
    queryKey: ['v2', 'analytics', 'time-to-booking'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<TimeToBookingStats>>('/api/v2/analytics/time-to-booking');
      return response as ApiEnvelope<TimeToBookingStats>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

// ─── Issue #25: Response Time Stats ─────────────────────────────────────────────
export type ResponseTimeStats = {
  avgMinutes: number;
  medianMinutes: number;
  p95Minutes: number;
  byRep: Array<{
    rep: string;
    avgMinutes: number;
    responses: number;
  }>;
  byHour: Array<{
    hour: number;
    avgMinutes: number;
  }>;
};

export const useV2ResponseTime = (params: { range: 'today' | '7d' | '30d'; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.tz) searchParams.set('tz', params.tz);

  return useQuery({
    queryKey: ['v2', 'analytics', 'response-time', params],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<ResponseTimeStats>>(
        `/api/v2/analytics/response-time?${searchParams.toString()}`
      );
      return response as ApiEnvelope<ResponseTimeStats>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

// ─── Issue #5: Line Activity Balance ────────────────────────────────────────────
export type LineActivityBalance = {
  lines: Array<{
    line: string;
    messagesSent: number;
    share: number;
    isImbalanced: boolean;
  }>;
  alert: string | null;
};

export const useV2LineBalance = () => {
  return useQuery({
    queryKey: ['v2', 'analytics', 'line-balance'],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<LineActivityBalance>>('/api/v2/analytics/line-balance');
      return response as ApiEnvelope<LineActivityBalance>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

// ─── Admin Mutations ────────────────────────────────────────────────────────────
export const useV2AutoAssign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/v2/admin/auto-assign', {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['v2', 'analytics', 'followup-sla'] });
    },
  });
};

export const useV2BulkInferQualification = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, number>({
    mutationFn: async (limit: number = 100) => {
      const response = await client.post(`/api/v2/admin/bulk-infer-qualification?limit=${limit}`, {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['v2', 'analytics', 'qualification-funnel'] });
    },
  });
};

export const useV2DeduplicateLines = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/v2/admin/deduplicate-lines', {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['v2', 'analytics', 'line-performance'] });
    },
  });
};

// ─── Sequence Qualification Analytics ─────────────────────────────────────────

type QualField = { count: number; pct: number; sampleQuote: string | null };

export type SequenceQualificationItem = {
  sequenceLabel: string;
  totalConversations: number;
  mondayOutcomes?: {
    linkedContacts: number;
    totalOutcomes: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    noShow: number;
    cancelled: number;
    badTiming: number;
    badFit: number;
    other: number;
    unknown: number;
    bookedPct: number;
    closedWonPct: number;
    noShowPct: number;
    cancelledPct: number;
  };
  // Employment
  fullTime: QualField;
  partTime: QualField;
  unknownEmployment: QualField;
  // Revenue mix
  mostlyCash: QualField;
  mostlyInsurance: QualField;
  balancedMix: QualField;
  unknownRevenue: QualField;
  // Delivery model
  brickAndMortar: QualField;
  mobile: QualField;
  online: QualField;
  hybrid: QualField;
  unknownDelivery: QualField;
  // Coaching interest
  highInterest: QualField;
  mediumInterest: QualField;
  lowInterest: QualField;
  unknownInterest: QualField;
  // Niches
  topNiches: Array<{ niche: string; count: number }>;
};

export type SequenceQualificationBreakdown = {
  items: SequenceQualificationItem[];
  window: {
    from: string;
    to: string;
    timeZone: string;
  };
};

export const useV2SequenceQualification = (params: { range: '7d' | '30d' | '90d' | '180d' | '365d'; tz?: string }) => {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.tz) searchParams.set('tz', params.tz);

  return useQuery({
    queryKey: ['v2', 'sequences', 'qualification', params],
    queryFn: async () => {
      const response = await client.get<ApiEnvelope<SequenceQualificationBreakdown>>(
        `/api/v2/sequences/qualification?${searchParams.toString()}`
      );
      return response as ApiEnvelope<SequenceQualificationBreakdown>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
