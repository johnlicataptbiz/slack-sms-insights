import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkItem } from './types';

export function useEventStream() {
  const qc = useQueryClient();

  useEffect(() => {
    // Inbox is removed from the Command Center UI, so we don't need work-item realtime updates.
    // Keep realtime only for Insights + Daily Runs.
    //
    // NOTE: Vercel serverless functions are not a great fit for long-lived SSE connections and can
    // intermittently return 502s. We keep the UI functional by making realtime optional in production.
    const token = localStorage.getItem('slackToken') || 'dummy-token-bypass-auth';

    let es: EventSource | null = null;

    try {
      es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener('runs-updated', () => {
        // New report run logged; refresh dashboard run lists/details.
        qc.invalidateQueries({ queryKey: ['runs'] });
        qc.invalidateQueries({ queryKey: ['run'] });
        qc.invalidateQueries({ queryKey: ['channels'] });
      });

      es.addEventListener('metrics-updated', () => {
        qc.invalidateQueries({ queryKey: ['metrics'] });
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
  }, [qc]);
}
