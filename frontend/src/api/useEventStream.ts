import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useEventStream() {
  const qc = useQueryClient();

  useEffect(() => {
    // Keep realtime on by default and allow explicit opt-out.
    const enableRealtime = import.meta.env.VITE_ENABLE_REALTIME !== '0';
    if (!enableRealtime) return;

    let es: EventSource | null = null;
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failureCount = 0;
    let disabledUntil = 0;

    const scheduleReconnect = (baseDelayMs: number) => {
      const cappedFailures = Math.min(failureCount, 6);
      const jitter = Math.floor(Math.random() * 500);
      const backoffMs = Math.min(baseDelayMs * Math.pow(2, cappedFailures), 60_000) + jitter;
      retryTimer = setTimeout(() => {
        if (mounted) connect();
      }, backoffMs);
    };

    const connect = async () => {
      if (!mounted) return;
      const now = Date.now();
      if (disabledUntil > now) {
        retryTimer = setTimeout(() => {
          if (mounted) connect();
        }, disabledUntil - now);
        return;
      }

      try {
        const res = await fetch('/api/stream-token');
        if (!res.ok) {
          throw new Error(`Failed to fetch stream token: ${res.status}`);
        }
        const { token } = await res.json();

        if (!mounted) return;
        failureCount = 0;

        // Close existing if any (shouldn't happen due to cleanup, but safe)
        es?.close();

        es = new EventSource(`/api/stream?token=${token}`, { withCredentials: true });

        es.addEventListener('open', () => {
          // console.debug('EventSource connected');
        });

        es.addEventListener('runs-updated', () => {
          qc.invalidateQueries({ queryKey: ['runs'] });
          qc.invalidateQueries({ queryKey: ['run'] });
          qc.invalidateQueries({ queryKey: ['channels'] });
          qc.invalidateQueries({ queryKey: ['v2', 'runs'] });
          qc.invalidateQueries({ queryKey: ['v2', 'channels'] });
        });

        es.addEventListener('metrics-updated', () => {
          qc.invalidateQueries({ queryKey: ['metrics'] });
          qc.invalidateQueries({ queryKey: ['salesMetrics'] });
          qc.invalidateQueries({ queryKey: ['v2', 'salesMetrics'] });
        });

        es.addEventListener('work-item-updated', () => {
          qc.invalidateQueries({ queryKey: ['work-items'] });
          qc.invalidateQueries({ queryKey: ['metrics'] }); // Work items affect metrics
        });

        es.addEventListener('work-item-created', () => {
          qc.invalidateQueries({ queryKey: ['work-items'] });
          qc.invalidateQueries({ queryKey: ['metrics'] });
        });

        es.onerror = (err) => {
          failureCount += 1;
          console.warn('EventSource failed, reconnecting with backoff...', { failureCount, err });
          es?.close();
          es = null;
          if (failureCount >= 8) {
            disabledUntil = Date.now() + 60_000;
            console.warn('Realtime temporarily paused after repeated failures', { disabledUntil });
          }
          scheduleReconnect(3_000);
        };
      } catch (err) {
        failureCount += 1;
        console.warn('Realtime setup failed, retrying with backoff...', { failureCount, err });
        if (failureCount >= 8) {
          disabledUntil = Date.now() + 60_000;
          console.warn('Realtime temporarily paused after repeated token failures', { disabledUntil });
        }
        scheduleReconnect(10_000);
      }
    };

    connect();

    return () => {
      mounted = false;
      es?.close();
      clearTimeout(retryTimer);
    };
  }, [qc]);
}
