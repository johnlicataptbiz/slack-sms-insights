import type { Logger } from '@slack/bolt';

export type RealtimeEvent =
  | { type: 'work_item_created'; id: string; ts: string }
  | { type: 'work_item_resolved'; id: string; ts: string }
  | { type: 'conversation_updated'; id: string; ts: string }
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
