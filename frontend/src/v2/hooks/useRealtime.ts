import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #16: Real-time Updates Hook
// ═══════════════════════════════════════════════════════════════════════════════

type RealtimeEvent = {
  type: 'sms_event' | 'booked_call' | 'work_item' | 'conversation_update';
  data: unknown;
  timestamp: string;
};

interface UseRealtimeOptions {
  enabled?: boolean;
  reconnectInterval?: number;
  maxRetries?: number;
  onEvent?: (event: RealtimeEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const {
    enabled = true,
    reconnectInterval = 5000,
    maxRetries = 10,
    onEvent,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  const invalidateQueries = useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case 'sms_event':
          queryClient.invalidateQueries({ queryKey: ['v2', 'sales-metrics'] });
          queryClient.invalidateQueries({ queryKey: ['v2', 'inbox', 'conversations'] });
          break;
        case 'booked_call':
          queryClient.invalidateQueries({ queryKey: ['v2', 'sales-metrics'] });
          queryClient.invalidateQueries({ queryKey: ['v2', 'weekly-summary'] });
          break;
        case 'work_item':
          queryClient.invalidateQueries({ queryKey: ['v2', 'analytics', 'followup-sla'] });
          break;
        case 'conversation_update':
          queryClient.invalidateQueries({ queryKey: ['v2', 'inbox'] });
          break;
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) return;

    try {
      const es = new EventSource('/api/v2/realtime/events', {
        withCredentials: true,
      });

      es.onopen = () => {
        setIsConnected(true);
        retriesRef.current = 0;
        onConnect?.();
      };

      es.onmessage = (e) => {
        try {
          const event: RealtimeEvent = JSON.parse(e.data);
          setLastEvent(event);
          onEvent?.(event);
          invalidateQueries(event);
        } catch (err) {
          console.warn('Failed to parse realtime event:', err);
        }
      };

      es.onerror = (e) => {
        setIsConnected(false);
        onError?.(e);
        es.close();
        eventSourceRef.current = null;

        // Attempt reconnection
        if (retriesRef.current < maxRetries) {
          retriesRef.current++;
          setTimeout(connect, reconnectInterval);
        }
      };

      eventSourceRef.current = es;
    } catch (err) {
      console.error('Failed to create EventSource:', err);
    }
  }, [enabled, onConnect, onEvent, onError, invalidateQueries, reconnectInterval, maxRetries]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      onDisconnect?.();
    }
  }, [onDisconnect]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connect,
    disconnect,
  };
}

// Polling fallback for browsers without EventSource support
export function usePolling(
  queryKey: string[],
  intervalMs = 30000,
  enabled = true
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [queryClient, queryKey, intervalMs, enabled]);
}

export default useRealtime;
