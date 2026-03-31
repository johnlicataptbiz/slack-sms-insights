import type { Logger } from '@slack/bolt';
import {
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
} from './booked-calls.js';
import { getPrismaClient } from './prisma.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';

const getPrisma = () => getPrismaClient();
