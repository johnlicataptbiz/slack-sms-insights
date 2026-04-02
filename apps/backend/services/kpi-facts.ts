import type { Logger } from '@slack/bolt';
import {
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
} from './booked-calls.js';
import { getPrismaClient } from './prisma.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';

const getPrisma = () => getPrismaClient();

export const refreshKpiFacts = async (
  _options?:
    | {
        lookbackDays?: number;
      }
    | {
        from?: Date;
        to?: Date;
        timeZone?: string;
      },
  _logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>,
): Promise<void> => {
  // Temporary compatibility shim while KPI facts refactor is in progress.
  // Keeps cron scheduler type-safe and non-breaking.
  void getPrisma;
  void getBookedCallAttributionSources;
  void getBookedCallSequenceFromSmsEvents;
  void getBookedCallSmsReplyLinks;
  void attributeSlackBookedCallsToSequences;
};
