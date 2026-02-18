import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from './client';
import type { WorkItem, Conversation, MetricsSummary } from './types';

export function useWorkItems(params: {
  status?: 'open' | 'snoozed' | 'resolved';
  repId?: string;
  type?: string;
  search?: string;
}) {
  // Convert params to URLSearchParams
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.repId) searchParams.set('repId', params.repId);
  if (params.type) searchParams.set('type', params.type);
  if (params.search) searchParams.set('search', params.search);

  return useQuery({
    queryKey: ['workItems', params],
    queryFn: () => client.get<WorkItem[]>(`/api/work-items?${searchParams.toString()}`),
    staleTime: 10_000,
  });
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () =>
      client.get<Conversation>(`/api/conversations/${conversationId}`),
    enabled: !!conversationId,
  });
}

export function useMetrics(params: { from: string; to: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);

  return useQuery({
    queryKey: ['metrics', params],
    queryFn: () => client.get<MetricsSummary>(`/api/metrics?${searchParams.toString()}`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useResolveWorkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.post(`/api/work-items/${id}/resolve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workItems'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}

export function useAssignWorkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, repId }: { id: string; repId: string }) =>
      client.post(`/api/work-items/${id}/assign`, { repId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workItems'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}
