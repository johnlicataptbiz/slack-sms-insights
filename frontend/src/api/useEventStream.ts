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

    const connect = async () => {
      try {
        const res = await fetch('/api/stream-token');
        if (!res.ok) {
          throw new Error(`Failed to fetch stream token: ${res.status}`);
        }
        const { token } = await res.json();

        if (!mounted) return;

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
          console.warn('EventSource failed, reconnecting...', err);
          es?.close();
          es = null;
          // Re-fetch token and reconnect after delay
          retryTimer = setTimeout(() => {
            if (mounted) connect();
          }, 3000);
        };
      } catch (err) {
        console.warn('Realtime setup failed, retrying...', err);
        retryTimer = setTimeout(() => {
          if (mounted) connect();
        }, 10000);
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
