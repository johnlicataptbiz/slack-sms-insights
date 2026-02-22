import { useQuery } from '@tanstack/react-query';

import { client } from './client';
import {
  assertChannelsV2Envelope,
  assertRunsListV2Envelope,
  assertSalesMetricsV2Envelope,
  assertWeeklySummaryV2Envelope,
} from './v2Guards';
import type { ApiEnvelope, ChannelsV2, RunsListV2, SalesMetricsV2, WeeklyManagerSummaryV2 } from './v2-types';

export type SalesMetricsQueryParams =
  | { from: string; to: string; tz?: string }
  | { day: string; tz?: string }
  | { range: 'today' | '7d' | '30d'; tz?: string };

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
}): URLSearchParams => {
  const searchParams = new URLSearchParams();
  searchParams.set('daysBack', String(params.daysBack));
  searchParams.set('limit', String(params.limit ?? 50));
  searchParams.set('offset', String(params.offset ?? 0));
  if (params.channelId) searchParams.set('channelId', params.channelId);
  if (params.includeLegacy) searchParams.set('includeLegacy', 'true');
  if (params.legacyOnly) searchParams.set('legacyOnly', 'true');
  return searchParams;
};

export const fetchV2SalesMetrics = async (params: SalesMetricsQueryParams) => {
  const searchParams = buildSalesMetricsSearchParams(params);
  const response = await client.get<unknown>(`/api/v2/sales-metrics?${searchParams.toString()}`);
  assertSalesMetricsV2Envelope(response);
  return response as ApiEnvelope<SalesMetricsV2>;
};

export const useV2SalesMetrics = (params: SalesMetricsQueryParams) => {
  return useQuery({
    queryKey: ['v2', 'salesMetrics', params],
    queryFn: async () => fetchV2SalesMetrics(params),
    staleTime: 60_000,
    retry: false,
  });
};

export const useV2SetterTrend = (days: string[], tz: string) => {
  return useQuery({
    queryKey: ['v2', 'setterTrend', [...days].sort(), tz],
    enabled: days.length > 0,
    queryFn: async () => {
      const uniqueDays = [...new Set(days)].sort((a, b) => a.localeCompare(b));
      const envelopes = await Promise.all(uniqueDays.map((day) => fetchV2SalesMetrics({ day, tz })));

      return envelopes.map<SetterTrendPoint>((envelope, index) => {
        const jack = findRepRow(envelope.data.reps, 'jack');
        const brandon = findRepRow(envelope.data.reps, 'brandon');

        return {
          day: envelope.data.trendByDay[0]?.day || uniqueDays[index] || '',
          team: {
            messagesSent: envelope.data.totals.messagesSent,
            replyRatePct: envelope.data.totals.replyRatePct,
            bookedCalls: envelope.data.totals.canonicalBookedCalls,
            optOuts: envelope.data.totals.optOuts,
          },
          setters: {
            jack: {
              outboundConversations: jack?.outboundConversations ?? 0,
              replyRatePct: jack?.replyRatePct ?? 0,
              bookedCalls: envelope.data.bookedCredit.jack,
              optOuts: jack?.optOuts ?? 0,
            },
            brandon: {
              outboundConversations: brandon?.outboundConversations ?? 0,
              replyRatePct: brandon?.replyRatePct ?? 0,
              bookedCalls: envelope.data.bookedCredit.brandon,
              optOuts: brandon?.optOuts ?? 0,
            },
          },
        };
      });
    },
    staleTime: 60_000,
    retry: false,
  });
};

export const useV2Runs = (params: {
  daysBack: number;
  channelId?: string | null;
  limit?: number;
  offset?: number;
  includeLegacy?: boolean;
  legacyOnly?: boolean;
}) => {
  const searchParams = toRunsSearchParams(params);
  return useQuery({
    queryKey: ['v2', 'runs', params],
    queryFn: async () => {
      const response = await client.get<unknown>(`/api/v2/runs?${searchParams.toString()}`);
      assertRunsListV2Envelope(response);
      return response as ApiEnvelope<RunsListV2>;
    },
    staleTime: 15_000,
    retry: false,
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
    staleTime: 60_000,
    retry: false,
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
    staleTime: 60_000,
    retry: false,
  });
};
