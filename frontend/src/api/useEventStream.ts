import { useEffect, useRef } from 'react';

export type StreamEvent = { type: string; [key: string]: unknown };

export type UseEventStreamOptions = {
  enabled?: boolean;
  onEvent: (event: StreamEvent) => void;
  onError?: (err: unknown) => void;
};

const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('slackToken');
  } catch {
    return null;
  }
};

export const useEventStream = ({ enabled = true, onEvent, onError }: UseEventStreamOptions) => {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) return;

    const token = getAuthToken();
    if (!token) return;

    // EventSource cannot set Authorization headers, so we pass token via query param.
    // Backend currently expects Authorization header; for now we rely on dummy bypass token in dev
    // or you can extend backend to accept ?token=... for SSE only.
    const url = `/api/stream?token=${encodeURIComponent(token)}`;

    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch (err) {
      onErrorRef.current?.(err);
      return;
    }

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as StreamEvent;
        onEventRef.current(data);
      } catch (err) {
        onErrorRef.current?.(err);
      }
    };

    es.onerror = (err) => {
      onErrorRef.current?.(err);
      // Let browser handle reconnect; if it hard-fails, polling still works.
    };

    return () => {
      es?.close();
    };
  }, [enabled]);
};
