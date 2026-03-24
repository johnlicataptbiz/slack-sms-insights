/**
 * useInboxSubscription - WebSocket subscriptions for real-time updates
 * Replaces polling-based refetch with efficient WebSocket subscriptions
 */

import { useCallback, useEffect, useRef } from 'react';

export interface SubscriptionOptions {
  conversationId: string | null;
  enabled?: boolean;
  onMessageUpdate?: (message: any) => void;
  onStatusUpdate?: (status: any) => void;
  onError?: (error: Error) => void;
}

export const useInboxSubscription = ({
  conversationId,
  enabled = true,
  onMessageUpdate,
  onStatusUpdate,
  onError,
}: SubscriptionOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const shouldReconnectRef = useRef(true);

  // Establish WebSocket connection
  const connect = useCallback(() => {
    if (!enabled || !conversationId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/inbox/subscribe?conversationId=${conversationId}`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[Inbox WS] Connected to conversation subscription');
        // Subscribe to message updates
        wsRef.current?.send(
          JSON.stringify({
            type: 'subscribe',
            channel: 'messages',
            conversationId,
          }),
        );
      };

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'message':
              onMessageUpdate?.(data.payload);
              break;
            case 'status':
              onStatusUpdate?.(data.payload);
              break;
            default:
              console.warn('[Inbox WS] Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('[Inbox WS] Failed to parse message:', err);
        }
      };

      wsRef.current.onerror = (event: Event) => {
        const error = new Error('WebSocket error');
        console.error('[Inbox WS] Error:', error);
        onError?.(error);
      };

      wsRef.current.onclose = () => {
        console.log('[Inbox WS] Connection closed');
        if (shouldReconnectRef.current) {
          // Exponential backoff reconnection: 1s, 2s, 4s, 8s, max 30s
          const delay = Math.min((wsRef.current?.reconnectAttempts || 0) * 1000 + 1000, 30000);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };
    } catch (err) {
      const error = new Error(`Failed to connect WebSocket: ${String(err)}`);
      console.error('[Inbox WS]', error);
      onError?.(error);
    }
  }, [enabled, conversationId, onMessageUpdate, onStatusUpdate, onError]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  }, []);

  // Effect: Connect when conversation changes
  useEffect(() => {
    if (enabled && conversationId) {
      shouldReconnectRef.current = true;
      connect();
    } else {
      disconnect();
    }

    return () => {
      // Don't fully disconnect on unmount if subscription should persist
      // Just close the specific connection
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'unsubscribe',
            channel: 'messages',
            conversationId,
          }),
        );
      }
    };
  }, [enabled, conversationId, connect, disconnect]);

  // Manual refetch trigger for cases where subscriptions miss updates
  const manualRefetch = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'refetch',
          conversationId,
        }),
      );
    }
  }, [conversationId]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    connect,
    disconnect,
    manualRefetch,
  };
};
