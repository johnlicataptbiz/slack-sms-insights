import type { Logger } from '@slack/bolt';
import {
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
} from './booked-calls.js';
import { getPrismaClient } from './prisma.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';

// Re-export from the complete implementation so importers of this module
// (e.g. services/cron-scheduler.ts) get the full refreshKpiFacts function.
export { refreshKpiFacts, type KpiFactRefreshResult } from './kpi-facts-fixed.js';

const getPrisma = () => getPrismaClient();
