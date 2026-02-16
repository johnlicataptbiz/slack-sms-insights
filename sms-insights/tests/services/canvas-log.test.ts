import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { WebClient } from '@slack/web-api';
import { appendDailyReportToCanvas } from '../../services/canvas-log.js';
import { fakeLogger } from '../helpers.js';

const DAILY_REPORT_TEXT = [
  '*PT BIZ - DAILY SMS SNAPSHOT*',
  'Date: Feb 14, 2026',
  'Time Range: Last 24 Hours',
  '',
  '*Split By Line / Rep (24h)*',
  '',
  '*Rep: Brandon Erwin*',
  '- Line: Main',
  '*Core Metrics*',
  '- Outbound Conversations: 20',
  '- Reply Rate: 10.0%',
  '- Bookings: 1',
  '- Opt Outs: 1',
  '*Revenue Signal*',
  '- Booking Rate Per Conversation: 5.0%',
  '- Booking Rate Per Reply: 100.0%',
  '- Rolling 7 Day Booking Per 100 Conversations: 3.8',
  '*Sequence Specific KPIs (24h)*',
  '- Alpha Sequence: sent 12, replies received 2 (16.7% response rate), bookings 1 (8.3% per conversation), opt-outs 1 (8.3%)',
  '- Beta Sequence: sent 8, replies received 0 (0.0% response rate), bookings 0 (0.0% per conversation), opt-outs 0 (0.0%)',
  '*Quick Take*',
  '- Brandon section',
  '',
  '*Rep: Jack Licata*',
  '- Line: Main',
  '*Core Metrics*',
  '- Outbound Conversations: 6',
  '- Reply Rate: 0.0%',
  '- Bookings: 0',
  '- Opt Outs: 0',
  '*Revenue Signal*',
  '- Booking Rate Per Conversation: 0.0%',
  '- Booking Rate Per Reply: 0.0%',
  '- Rolling 7 Day Booking Per 100 Conversations: 0.0',
  '*Sequence Specific KPIs (24h)*',
  '- Alpha Sequence: sent 4, replies received 0 (0.0% response rate), bookings 0 (0.0% per conversation), opt-outs 0 (0.0%)',
  '- Gamma Sequence: sent 2, replies received 0 (0.0% response rate), bookings 0 (0.0% per conversation), opt-outs 0 (0.0%)',
  '*Quick Take*',
  '- Jack section',
].join('\n');

const DAILY_PROMPT = 'daily report';

describe('canvas log incremental sync', () => {
  beforeEach(() => {
    mock.restoreAll();
    fakeLogger.resetCalls();
    process.env.ALOWARE_CANVAS_DURABLE_MODE = 'false';
    process.env.ALOWARE_REPORT_CANVAS_ID = 'FCANVAS';
    process.env.ALOWARE_REPORT_ARCHIVE_CANVAS_ID = '';
    process.env.ALOWARE_REPORT_HISTORY_LOOKBACK_DAYS = '45';
    process.env.ALOWARE_REPORT_RETENTION_DAYS = '365';
    process.env.ALOWARE_CANVAS_STATE_MARKER = '[SMS_INSIGHTS_STATE_V1]';
    process.env.ALOWARE_CANVAS_STATE_LOOKBACK_MESSAGES = '100';
    process.env.ALOWARE_REPORT_THREAD_FETCH_CONCURRENCY = '2';
    process.env.ALOWARE_REPORT_MAX_THREADS_PER_RUN = '2';
    process.env.ALOWARE_REPORT_STATE_BUFFER_SECONDS = '3600';
  });

  it('should apply incremental thread hydration with concurrency cap', async () => {
    const stateMessage = {
      ts: '1730000005.000100',
      text: '[SMS_INSIGHTS_STATE_V1] {"version":1,"last_processed_report_ts":1730000000,"processed_thread_ts":["1730000001.000100"],"updated_at":1730000000}',
    };
    const channelHistory = [
      {
        ts: '1730000003.000100',
        thread_ts: '1730000003.000100',
        text: '<@UAPP123> daily report',
      },
      {
        ts: '1730000002.000100',
        thread_ts: '1730000002.000100',
        text: '<@UAPP123> daily report',
      },
      {
        ts: '1730000001.000100',
        thread_ts: '1730000001.000100',
        text: '<@UAPP123> daily report',
      },
      {
        ts: '1730000100.000100',
        thread_ts: '1730000100.000100',
        text: DAILY_REPORT_TEXT,
      },
    ];

    const historySpy = mock.fn(async (args: { oldest?: string }) => {
      if (!args.oldest) {
        return {
          ok: true,
          messages: [stateMessage],
          response_metadata: { next_cursor: '' },
        };
      }

      return {
        ok: true,
        messages: channelHistory,
        response_metadata: { next_cursor: '' },
      };
    });

    let activeReplies = 0;
    let maxActiveReplies = 0;
    const repliesSpy = mock.fn(async ({ ts }: { ts: string }) => {
      activeReplies += 1;
      maxActiveReplies = Math.max(maxActiveReplies, activeReplies);
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeReplies -= 1;

      return {
        ok: true,
        messages: [
          { ts, text: '<@UAPP123> daily report' },
          { ts: `${ts}-reply`, text: 'reply body' },
        ],
        response_metadata: { next_cursor: '' },
      };
    });

    const apiCallSpy = mock.fn(async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    const updateSpy = mock.fn(async () => ({ ok: true, ts: '1730000005.000100' }));
    const postSpy = mock.fn(async () => ({ ok: true, ts: '1730000010.000100' }));

    const client = {
      apiCall: apiCallSpy,
      chat: {
        postMessage: postSpy,
        update: updateSpy,
      },
      conversations: {
        history: historySpy,
        replies: repliesSpy,
      },
    } as unknown as WebClient;

    await appendDailyReportToCanvas({
      client,
      logger: fakeLogger as never,
      channelId: 'C1234',
      prompt: DAILY_PROMPT,
      report: DAILY_REPORT_TEXT,
    });

    assert.equal(repliesSpy.mock.callCount(), 2);
    assert(maxActiveReplies <= 2, `expected max concurrency <= 2, got ${maxActiveReplies}`);
    assert.equal(updateSpy.mock.callCount(), 1);
    assert.equal(postSpy.mock.callCount(), 0);
  });

  it('should fall back to full scan when sync state is corrupt', async () => {
    process.env.ALOWARE_REPORT_MAX_THREADS_PER_RUN = '1';

    const historySpy = mock.fn(async (args: { oldest?: string }) => {
      if (!args.oldest) {
        return {
          ok: true,
          messages: [
            {
              ts: '1730000005.000100',
              text: '[SMS_INSIGHTS_STATE_V1] {bad-json}',
            },
          ],
          response_metadata: { next_cursor: '' },
        };
      }

      return {
        ok: true,
        messages: [
          {
            ts: '1730000003.000100',
            thread_ts: '1730000003.000100',
            text: '<@UAPP123> daily report',
          },
          {
            ts: '1730000002.000100',
            thread_ts: '1730000002.000100',
            text: '<@UAPP123> daily report',
          },
          {
            ts: '1730000100.000100',
            thread_ts: '1730000100.000100',
            text: DAILY_REPORT_TEXT,
          },
        ],
        response_metadata: { next_cursor: '' },
      };
    });

    const repliesSpy = mock.fn(async ({ ts }: { ts: string }) => ({
      ok: true,
      messages: [
        { ts, text: '<@UAPP123> daily report' },
        { ts: `${ts}-reply`, text: 'reply body' },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const apiCallSpy = mock.fn(async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    const updateSpy = mock.fn(async () => ({ ok: true, ts: '1730000005.000100' }));

    const client = {
      apiCall: apiCallSpy,
      chat: {
        postMessage: mock.fn(async () => ({ ok: true, ts: '1730000010.000100' })),
        update: updateSpy,
      },
      conversations: {
        history: historySpy,
        replies: repliesSpy,
      },
    } as unknown as WebClient;

    await appendDailyReportToCanvas({
      client,
      logger: fakeLogger as never,
      channelId: 'C1234',
      prompt: DAILY_PROMPT,
      report: DAILY_REPORT_TEXT,
    });

    assert.equal(repliesSpy.mock.callCount(), 2);
    assert.equal(updateSpy.mock.callCount(), 1);
  });

  it('should keep at most two canonical runs per day in canvas logs', async () => {
    mock.method(Date, 'now', () => 1_730_037_000_000);
    const backupReportWithChange = DAILY_REPORT_TEXT.replace('- Bookings: 1', '- Bookings: 2');

    const historySpy = mock.fn(async (args: { oldest?: string }) => {
      if (!args.oldest) {
        return {
          ok: true,
          messages: [
            {
              ts: '1730000005.000100',
              text: '[SMS_INSIGHTS_STATE_V1] {bad-json}',
            },
          ],
          response_metadata: { next_cursor: '' },
        };
      }

      return {
        ok: true,
        messages: [
          {
            ts: '1730018400.000100',
            thread_ts: '1730018400.000100',
            trigger_id: 'Ft0AF5FTC3U4',
            text: '<@UAPP123> daily report',
          },
          {
            ts: '1730018460.000100',
            thread_ts: '1730018400.000100',
            text: DAILY_REPORT_TEXT,
          },
          {
            ts: '1730054400.000100',
            thread_ts: '1730054400.000100',
            trigger_id: 'Ft0AF1TPMEFL',
            text: '<@UAPP123> daily report',
          },
          {
            ts: '1730054460.000100',
            thread_ts: '1730054400.000100',
            text: DAILY_REPORT_TEXT,
          },
          {
            ts: '1730055000.000100',
            thread_ts: '1730055000.000100',
            trigger_id: 'Ft0AF1TPMEFL',
            text: '<@UAPP123> daily report',
          },
          {
            ts: '1730055060.000100',
            thread_ts: '1730055000.000100',
            text: backupReportWithChange,
          },
        ],
        response_metadata: { next_cursor: '' },
      };
    });

    const repliesSpy = mock.fn(async ({ ts }: { ts: string }) => ({
      ok: true,
      messages: [
        { ts, text: '<@UAPP123> daily report' },
        { ts: `${ts}-reply`, text: 'reply body' },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const apiCallSpy = mock.fn(async (_method: string, _payload?: unknown) => {
      if (_method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    const client = {
      apiCall: apiCallSpy,
      chat: {
        postMessage: mock.fn(async () => ({ ok: true, ts: '1730000010.000100' })),
        update: mock.fn(async () => ({ ok: true, ts: '1730000005.000100' })),
      },
      conversations: {
        history: historySpy,
        replies: repliesSpy,
      },
    } as unknown as WebClient;

    await appendDailyReportToCanvas({
      client,
      logger: fakeLogger as never,
      channelId: 'C1234',
      prompt: DAILY_PROMPT,
      report: DAILY_REPORT_TEXT,
    });

    const insertCalls = apiCallSpy.mock.calls.filter((call) => {
      const method = call.arguments[0] as string | undefined;
      const payload = call.arguments[1] as { changes?: Array<{ operation?: string }> } | undefined;
      return method === 'canvases.edit' && payload?.changes?.some((change) => change.operation === 'insert_at_start');
    });

    assert(insertCalls.length > 0, 'expected at least one canvas insert call');
    const mainInsertPayload = (insertCalls[0].arguments[1] || {}) as {
      changes?: Array<{
        document_content?: { markdown?: string };
        operation?: string;
      }>;
    };
    const markdown = mainInsertPayload.changes?.[0]?.document_content?.markdown || '';
    const runLines = markdown
      .split('\n')
      .filter((line) => line.startsWith('### ') && line.includes(' - ') && /\(.+\)$/.test(line));
    const runLabels = runLines
      .map((line) => line.match(/\(([^)]+)\)\s*$/)?.[1] || '')
      .filter((label) => label.length > 0);

    assert(runLines.length >= 3);
    assert(new Set(runLabels).size >= 2);
    assert(runLabels.some((label) => label.includes('Scheduled')));
    assert(markdown.includes('# Analysis Log Report'));
    assert(markdown.includes('### What This Channel Is'));
    assert(markdown.includes('## Latest Daily Run'));
    assert(markdown.includes('| Outbound conversations | 26 |'));
    assert(markdown.includes('| Reply rate | 7.7% |'));
    assert(markdown.includes('| Bookings | 2 |'));
    assert(markdown.includes('| Opt-outs | 1 |'));
    assert(markdown.includes('## Performance By Sequence (Latest Run)'));
    assert(markdown.includes('| Sequence | Sent | Replies | Reply % | Booked | Opt-outs |'));
    assert(markdown.includes('| Alpha Sequence | 16 | 2 | 12.5% | 1 | 1 |'));
    assert(markdown.includes('| Beta Sequence | 8 | 0 | 0.0% | 0 | 0 |'));
    assert(markdown.includes('| Gamma Sequence | 2 | 0 | 0.0% | 0 | 0 |'));
    assert(markdown.includes('## Daily Report Archive (Newest First)'));
    assert(markdown.includes('**Core Metrics**'));
    assert(!markdown.includes('### Core Metrics'));
  });
});
