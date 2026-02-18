import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export type WorkItemSeverity = 'low' | 'med' | 'high';
export type WorkItemType = 'needs_reply' | 'sla_breach' | 'hot_lead' | 'unowned' | 'followup_due';

export type WorkItemListRow = {
  id: string;
  type: WorkItemType;
  conversation_id: string;
  rep_id: string | null;
  severity: WorkItemSeverity;
  due_at: string;
  created_at: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  current_rep_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
};

export type WorkItemsResponse = { items: WorkItemListRow[]; nextCursor?: string | null };

export type WorkItemsQuery = {
  type?: WorkItemType;
  repId?: string;
  severity?: WorkItemSeverity;
  overdueOnly?: boolean;
  dueBefore?: string;
  limit?: number;
  cursor?: string;
  offset?: number; // legacy
};

export const workItemsQueryKey = (q: WorkItemsQuery) => ['work-items', q] as const;

export const useWorkItems = (q: WorkItemsQuery) => {
  return useQuery({
    queryKey: workItemsQueryKey(q),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.type) params.set('type', q.type);
      if (q.repId) params.set('repId', q.repId);
      if (q.severity) params.set('severity', q.severity);
      if (q.overdueOnly) params.set('overdueOnly', 'true');
      if (q.dueBefore) params.set('dueBefore', q.dueBefore);
      if (q.limit) params.set('limit', String(q.limit));
      if (q.cursor) params.set('cursor', q.cursor);
      if (q.offset != null) params.set('offset', String(q.offset));
      const qs = params.toString();
      return apiFetch<WorkItemsResponse>(`/api/work-items${qs ? `?${qs}` : ''}`);
    },
    staleTime: 5_000,
    refetchInterval: 10_000, // polling fallback; SSE will invalidate
  });
};

export type ConversationRow = {
  id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  current_rep_id: string | null;
  status: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
  next_followup_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationResponse = { conversation: ConversationRow };

export const conversationQueryKey = (id: string) => ['conversation', id] as const;

export const useConversation = (id: string | null) => {
  return useQuery({
    queryKey: conversationQueryKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => apiFetch<ConversationResponse>(`/api/conversations/${id}`),
    staleTime: 10_000,
  });
};

export type ConversationEvent = {
  id: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  body: string | null;
  event_ts: string;
  slack_channel_id: string;
  slack_message_ts: string;
};

export type ConversationEventsResponse = { events: ConversationEvent[] };

export const conversationEventsQueryKey = (id: string, limit: number) => ['conversation-events', id, limit] as const;

export const useConversationEvents = (id: string | null, limit = 50) => {
  return useQuery({
    queryKey: conversationEventsQueryKey(id ?? '', limit),
    enabled: Boolean(id),
    queryFn: async () => apiFetch<ConversationEventsResponse>(`/api/conversations/${id}/events?limit=${limit}`),
    staleTime: 10_000,
  });
};

export type MetricsOverview = {
  windowDays: number;
  openWorkItems: number;
  overdueWorkItems: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
};

export type MetricsOverviewResponse = { overview: MetricsOverview };

export const metricsOverviewQueryKey = (days: number, repId?: string) => ['metrics', 'overview', days, repId] as const;

export const useMetricsOverview = (days: number, repId?: string) => {
  return useQuery({
    queryKey: metricsOverviewQueryKey(days, repId),
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days) });
      if (repId) params.set('repId', repId);
      return apiFetch<MetricsOverviewResponse>(`/api/metrics/overview?${params.toString()}`);
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
};

export type SlaMetrics = {
  windowDays: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
  breachRate: number;
  p50Minutes: number | null;
  p75Minutes: number | null;
  p90Minutes: number | null;
  p95Minutes: number | null;
};

export type SlaMetricsResponse = { sla: SlaMetrics };

export const metricsSlaQueryKey = (days: number, repId?: string) => ['metrics', 'sla', days, repId] as const;

export const useMetricsSla = (days: number, repId?: string) => {
  return useQuery({
    queryKey: metricsSlaQueryKey(days, repId),
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days) });
      if (repId) params.set('repId', repId);
      return apiFetch<SlaMetricsResponse>(`/api/metrics/sla?${params.toString()}`);
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
};

export type WorkloadByRepRow = {
  repId: string | null;
  openWorkItems: number;
  overdueWorkItems: number;
  openNeedsReply: number;
  overdueNeedsReply: number;
  highSeverityOpen: number;
};

export type WorkloadByRepMetrics = {
  windowDays: number;
  rows: WorkloadByRepRow[];
};

export type WorkloadByRepResponse = { workload: WorkloadByRepMetrics };

export const metricsWorkloadByRepQueryKey = (days: number) => ['metrics', 'workload-by-rep', days] as const;

export const useMetricsWorkloadByRep = (days: number) => {
  return useQuery({
    queryKey: metricsWorkloadByRepQueryKey(days),
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days) });
      return apiFetch<WorkloadByRepResponse>(`/api/metrics/workload-by-rep?${params.toString()}`);
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
};

export type VolumeByDayRow = {
  day: string;
  inbound: number;
  outbound: number;
};

export type VolumeByDayMetrics = {
  windowDays: number;
  rows: VolumeByDayRow[];
};

export type VolumeByDayResponse = { volume: VolumeByDayMetrics };

export const metricsVolumeByDayQueryKey = (days: number) => ['metrics', 'volume-by-day', days] as const;

export const useMetricsVolumeByDay = (days: number) => {
  return useQuery({
    queryKey: metricsVolumeByDayQueryKey(days),
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days) });
      return apiFetch<VolumeByDayResponse>(`/api/metrics/volume-by-day?${params.toString()}`);
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
};
