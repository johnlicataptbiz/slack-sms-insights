import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useEventStream(token: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    // Keep realtime on by default and allow explicit opt-out.
    const enableRealtime = import.meta.env.VITE_ENABLE_REALTIME !== '0';
    if (!enableRealtime) return;
    if (!token) return;

    let es: EventSource | null = null;

    try {
      es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener('runs-updated', () => {
        // New report run logged; refresh dashboard run lists/details.
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

      es.onerror = (err) => {
        // Don't break the app if realtime fails; just disable realtime.
        console.warn('EventSource failed (realtime disabled):', err);
        es?.close();
        es = null;
      };
    } catch (err) {
      console.warn('EventSource init failed (realtime disabled):', err);
      es = null;
    }

    return () => {
      es?.close();
    };
  }, [qc, token]);
}
