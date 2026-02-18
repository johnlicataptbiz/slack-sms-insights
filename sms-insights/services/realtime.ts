import type { Logger } from '@slack/bolt';

export type RealtimeEvent =
  | { type: 'work-item-created'; payload: any }
  | { type: 'work-item-updated'; payload: any }
  | { type: 'work_item_created'; id: string; ts: string } // legacy
  | { type: 'work_item_resolved'; id: string; ts: string } // legacy
  | { type: 'conversation_updated'; id: string; ts: string }
  | { type: 'metrics-updated'; ts: string }
  | { type: 'ping'; ts: string };

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export const publishRealtimeEvent = (
  event: RealtimeEvent,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
) => {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      logger?.warn?.('realtime listener threw', err);
    }
  }
};

export const subscribeRealtimeEvents = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
