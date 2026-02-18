import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkItem } from './types';

export function useEventStream() {
  const qc = useQueryClient();

  useEffect(() => {
    // Inbox is removed from the Command Center UI, so we don't need work-item realtime updates.
    // Keep realtime only for Insights + Daily Runs.
    const token = localStorage.getItem('slackToken') || 'dummy-token-bypass-auth';

    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);

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
      console.error('EventSource failed:', err);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [qc]);
}
