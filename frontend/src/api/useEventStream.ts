import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkItem } from './types';

export function useEventStream() {
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('slackToken');
    if (!token) return;

    // Use the correct endpoint from routes.ts
    const es = new EventSource(`/api/stream?token=${token}`);

    es.addEventListener('work-item-updated', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as Partial<WorkItem> & { id: string };
        qc.setQueryData<WorkItem[]>(['workItems'], (old) =>
          (old ?? []).map((w) => (w.id === payload.id ? { ...w, ...payload } : w))
        );
        // Also invalidate metrics as they might have changed
        qc.invalidateQueries({ queryKey: ['metrics'] });
      } catch (err) {
        console.error('Failed to parse work-item-updated event', err);
      }
    });

    es.addEventListener('work-item-created', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as WorkItem;
        qc.setQueryData<WorkItem[]>(['workItems'], (old) => [payload, ...(old ?? [])]);
        qc.invalidateQueries({ queryKey: ['metrics'] });
      } catch (err) {
        console.error('Failed to parse work-item-created event', err);
      }
    });

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
