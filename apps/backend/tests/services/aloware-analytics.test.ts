import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { WebClient } from '@slack/web-api';
import {
  __resetAlowareAnalyticsCachesForTests,
  buildAlowareAnalyticsReport,
  buildAlowareAnalyticsReportBundle,
} from '../../services/aloware-analytics.js';

type MockHistoryMessage = {
  attachments?: Array<{
    fields?: Array<{ title?: string; value?: string }>;
    title?: string;
  }>;
  text?: string;
  thread_ts?: string;
  ts: string;
};

const buildClient = (messages: MockHistoryMessage[]): WebClient => {
  return {
    conversations: {
      history: mock.fn(async () => ({
        ok: true,
        messages,
        response_metadata: { next_cursor: '' },
      })),
    },
  } as unknown as WebClient;
};

const toSlackTs = (unixSeconds: number): string => `${unixSeconds}.000100`;

describe('aloware analytics', () => {
  beforeEach(() => {
    mock.restoreAll();
    __resetAlowareAnalyticsCachesForTests();
    process.env.ALOWARE_TRACKED_KEYWORDS = 'yes,maybe';
    process.env.ALOWARE_ANALYTICS_CACHE_TTL_SECONDS = '45';
    process.env.ALOWARE_ANALYTICS_CACHE_MAX_STALE_SECONDS = '300';
    process.env.ALOWARE_SEQUENCE_ATTRIBUTION_LOOKBACK_DAYS = '30';
    process.env.ALOWARE_INBOUND_PATTERN = '\\b(has\\s+received\\s+an\\s+sms|received\\s+an\\s+sms|inbound|incoming)\\b';
    process.env.ALOWARE_OUTBOUND_PATTERN = '\\b(has\\s+sent\\s+an\\s+sms|sent\\s+an\\s+sms|outbound|outgoing)\\b';
    delete process.env.ALOWARE_REPORT_TIMEZONE;
    delete process.env.ALOWARE_DAILY_WINDOW_START_HOUR;
    delete process.env.ALOWARE_DAILY_WINDOW_END_HOUR;
  });

  it('should return operator dashboard summary sections', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: "An agent has sent an SMS ContactSarrah (+1 630-347-0853) Message Let's do a strategy call this Wednesday.",
      },
      {
        ts: '1729999950.000100',
        text: 'An agent has received an SMS ContactSarrah (+1 630-347-0853) Message Wednesday works for me.',
      },
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactTyler (+1 217-257-1181) Message Open to a strategy call this Friday?',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'keywords: strategy call, friday',
    });

    assert(report.includes('*SMS Insights Core KPI Report*'));
    assert(report.includes('*1) REQUIRED: REPLY RATES BY MESSAGE (24h)*'));
    assert(report.includes('*2) REQUIRED: BOOKING CONVERSION BY MESSAGE STRUCTURE (24h)*'));
    assert(report.includes('*3) REQUIRED: OPT-OUTS TIED TO CAMPAIGNS (24h)*'));
    assert(report.includes('Outbound conversations started (24h): 2'));
    assert(report.includes('Conversations replied (24h): 1 (50.0%)'));
  });

  it('should handle empty histories', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });

    assert(report.includes('Outbound conversations started (24h): 0'));
    assert(report.includes('Conversations replied (24h): 0 (0.0%)'));
    assert(report.includes('Total opt-out conversations (24h): 0 out of 0 (0.0%)'));
  });

  it('should return checklist format for daily report prompt', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: 'An agent has received an SMS ContactSarrah (+1 630-347-0853) Message Wednesdays are best, between 11:00-4:00 pm.',
      },
      {
        ts: '1729999910.000100',
        text: 'An agent has received an SMS ContactJosh (+1 612-708-1067) Message Stop',
      },
      {
        ts: '1729999920.000100',
        text: 'An agent has sent an SMS ContactSarrah (+1 630-347-0853) Message Great, noted.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('*PT BIZ - DAILY SMS SNAPSHOT*'));
    assert(report.includes('*Core Metrics*'));
    assert(report.includes('- Outbound Conversations: 1'));
    assert(report.includes('- Reply Rate:'));
    assert(report.includes('*Revenue Signal*'));
    assert(report.includes('*Top Booking Driver*'));
    assert(report.includes('*Sequence Specific KPIs (Daily Window)*'));
    assert(report.includes('*Risk Signal*'));
    assert(report.includes('*Quick Take*'));
  });

  it('should treat summary prompts as daily checklist reports', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: 'An agent has received an SMS ContactSarrah (+1 630-347-0853) Message Wednesdays are best.',
      },
      {
        ts: '1729999920.000100',
        text: 'An agent has sent an SMS ContactSarrah (+1 630-347-0853) Message Great, noted.',
      },
    ]);

    const bundle = await buildAlowareAnalyticsReportBundle({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'summary',
    });

    assert.equal(bundle.isDaily, true);
    assert(bundle.summary);
    assert(bundle.reportText.includes('*PT BIZ - DAILY SMS SNAPSHOT*'));
  });

  it('should use configured daily window instead of a rolling 24h window', async () => {
    process.env.ALOWARE_REPORT_TIMEZONE = 'UTC';
    process.env.ALOWARE_DAILY_WINDOW_START_HOUR = '4';
    process.env.ALOWARE_DAILY_WINDOW_END_HOUR = '23';

    const nowTs = Math.floor(Date.UTC(2026, 1, 16, 20, 0, 0) / 1000);
    mock.method(Date, 'now', () => nowTs * 1000);

    const client = buildClient([
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 3, 30, 0) / 1000)),
        text: 'An agent has sent an SMS ContactOutside (+1 555-880-0001) Message Quick follow-up.',
      },
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 5, 0, 0) / 1000)),
        text: 'An agent has sent an SMS ContactInside (+1 555-880-0002) Message Quick follow-up.',
      },
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 5, 10, 0) / 1000)),
        text: 'An agent has received an SMS ContactInside (+1 555-880-0002) Message Wednesday works.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('Time Range: 4:00 AM - 11:00 PM (UTC)'));
    assert(report.includes('- Outbound Conversations: 1'));
    assert(!report.includes('- Outbound Conversations: 2'));
  });

  it('should populate a requested date for manual daily report prompts', async () => {
    process.env.ALOWARE_REPORT_TIMEZONE = 'UTC';
    process.env.ALOWARE_DAILY_WINDOW_START_HOUR = '4';
    process.env.ALOWARE_DAILY_WINDOW_END_HOUR = '23';

    const nowTs = Math.floor(Date.UTC(2026, 1, 17, 20, 0, 0) / 1000);
    mock.method(Date, 'now', () => nowTs * 1000);

    const client = buildClient([
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 5, 0, 0) / 1000)),
        text: 'An agent has sent an SMS ContactPast (+1 555-880-0101) Message Quick follow-up.',
      },
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 5, 10, 0) / 1000)),
        text: 'An agent has received an SMS ContactPast (+1 555-880-0101) Message Wednesday works.',
      },
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 17, 5, 0, 0) / 1000)),
        text: 'An agent has sent an SMS ContactToday (+1 555-880-0102) Message Quick follow-up.',
      },
    ]);

    const bundle = await buildAlowareAnalyticsReportBundle({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'populate daily report for 2/16?',
    });

    assert.equal(bundle.isDaily, true);
    assert(bundle.summary);
    assert.equal(bundle.summary?.dateLabel, 'Feb 16, 2026');
    assert(bundle.reportText.includes('Date: Feb 16, 2026'));
    assert(bundle.reportText.includes('- Outbound Conversations: 1'));
  });

  it('should keep booking counts scoped to outbound-started conversations', async () => {
    process.env.ALOWARE_REPORT_TIMEZONE = 'UTC';
    process.env.ALOWARE_DAILY_WINDOW_START_HOUR = '4';
    process.env.ALOWARE_DAILY_WINDOW_END_HOUR = '23';

    const nowTs = Math.floor(Date.UTC(2026, 1, 16, 20, 0, 0) / 1000);
    mock.method(Date, 'now', () => nowTs * 1000);

    const client = buildClient([
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 10, 0, 0) / 1000)),
        text: 'An agent has received an SMS ContactInboundOnly (+1 555-881-0001) Message Yes, please book me for Tuesday.',
      },
      {
        ts: toSlackTs(Math.floor(Date.UTC(2026, 1, 16, 11, 0, 0) / 1000)),
        text: 'An agent has sent an SMS ContactOutboundOnly (+1 555-881-0002) Message Quick follow-up.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('- Outbound Conversations: 1'));
    assert(report.includes('- Bookings: 0'));
  });

  it('should count replies once per contact in daily sequence KPIs', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactMaya (+1 555-910-0001) Message Want to lock in a strategy call?',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactMaya (+1 555-910-0001) Message Yes, Wednesday works.',
      },
      {
        ts: '1729999860.000100',
        text: 'An agent has received an SMS ContactMaya (+1 555-910-0001) Message Also, afternoon is better.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('- Replies received counts unique contacts (max 1 reply per contact).'));
    assert(report.includes('No sequence (manual/direct): sent 1, replies received 1 (100.0% response rate)'));
    assert(!report.includes('No sequence (manual/direct): sent 1, replies received 2 (200.0% response rate)'));
  });

  it('should classify opt-outs from full conversation context, not only latest inbound', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999000.000100',
        text: 'An agent has sent an SMS ContactAva (+1 555-200-0001) Message Are you open to a strategy call this week?',
      },
      {
        ts: '1729999200.000100',
        text: 'An agent has received an SMS ContactAva (+1 555-200-0001) Message Stop',
      },
      {
        ts: '1729999500.000100',
        text: 'An agent has received an SMS ContactAva (+1 555-200-0001) Message Thanks!',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('*Risk Signal*'));
    assert(report.includes('Sequence With Most Opt Outs: No sequence (manual/direct)'));
    assert(report.includes('Opt Out Rate: 100.0%'));
  });

  it('should attribute booking to pre-booking sequence when post-booking messages are no-sequence', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-400-0001) Sequence BOOK- BUYER Intro Flow Message Want to lock a strategy call?',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactJordan (+1 555-400-0001) Message Yes Wednesday at 10 works for me.',
      },
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-400-0001) Message Great, adding to calendar now.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(
      report.includes(
        'BOOK- BUYER Intro Flow: sent 2, replies received 1 (50.0% response rate), bookings 1 (100.0% close rate (1/1 replied)), opt-outs 0 (0.0%)',
      ),
    );
    assert(
      !report.includes(
        'No sequence (manual/direct): sent 1, replies received 0 (0.0% response rate), bookings 0 (n/a close rate (0 replies)), opt-outs 0 (0.0%)',
      ),
    );
  });

  it('should mark booked from call-booked confirmation link and keep sequence attribution', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-400-0001) Sequence BOOK- BUYER Intro Flow Message Quick follow-up for you.',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactJordan (+1 555-400-0001) Message Sounds good.',
      },
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-400-0001) Message https://vip.physicaltherapybiz.com/call-booked?foo=bar',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('- Bookings: 1'));
    assert(
      report.includes(
        'BOOK- BUYER Intro Flow: sent 2, replies received 1 (50.0% response rate), bookings 1 (100.0% close rate (1/1 replied)), opt-outs 0 (0.0%)',
      ),
    );
  });

  it('should attribute daily sequence KPIs to prior sequence origin when latest daily touch is no-sequence', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729910000.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-401-0001) Sequence WORKSHOP PLAYBOOK Message Quick question before we book.',
      },
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-401-0001) Message Want to lock Wednesday at 10?',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactJordan (+1 555-401-0001) Message Yes Wednesday at 10 works for me.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('WORKSHOP PLAYBOOK: sent 1, replies received 1 (100.0% response rate)'));
    assert(!report.includes('No sequence (manual/direct): sent 1, replies received 1 (100.0% response rate)'));
  });

  it('should attribute booking to original sequence even when that sequence touch is older than 7 days', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729200000.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-401-1001) Sequence WORKSHOP PLAYBOOK Message Quick question before we book.',
      },
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactJordan (+1 555-401-1001) Message Want to lock Wednesday at 10?',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactJordan (+1 555-401-1001) Message Yes Wednesday at 10 works for me.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(
      report.includes(
        'WORKSHOP PLAYBOOK: sent 1, replies received 1 (100.0% response rate), bookings 1 (100.0% close rate (1/1 replied))',
      ),
    );
    assert(
      !report.includes(
        'No sequence (manual/direct): sent 1, replies received 1 (100.0% response rate), bookings 1 (100.0% close rate (1/1 replied))',
      ),
    );
  });

  it('should parse attachment-based aloware events', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: '',
        attachments: [
          {
            title: 'Jack Licata has sent an SMS',
            fields: [
              { title: 'Contact', value: 'Alaina Vince (<tel:+16162026444|+1 616-202-6444>)' },
              { title: 'Message', value: 'Would a strategy call next week be useful?' },
            ],
          },
        ],
      },
      {
        ts: '1729999950.000100',
        text: '',
        attachments: [
          {
            title: 'An agent has received an SMS',
            fields: [
              { title: 'Contact', value: 'Alaina Vince (<tel:+16162026444|+1 616-202-6444>)' },
              { title: 'Message', value: 'Yes, that sounds good.' },
            ],
          },
        ],
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'keywords: strategy call',
    });

    assert(report.includes('Outbound conversations started (24h): 1'));
    assert(report.includes('Conversations replied (24h): 1 (100.0%)'));
    assert(report.includes('*2) REQUIRED: BOOKING CONVERSION BY MESSAGE STRUCTURE (24h)*'));
  });

  it('should reuse cached history inside TTL windows', async () => {
    let nowMs = 1_730_000_000_000;
    mock.method(Date, 'now', () => nowMs);
    const historySpy = mock.fn(async () => ({
      ok: true,
      messages: [
        {
          ts: '1729999900.000100',
          text: 'An agent has sent an SMS ContactMia (+1 217-257-1181) Message Want to book a strategy call?',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const client = {
      conversations: {
        history: historySpy,
      },
    } as unknown as WebClient;

    const first = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });
    nowMs += 20_000;
    const second = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });

    assert(first.includes('*SMS Insights Core KPI Report*'));
    assert(second.includes('*SMS Insights Core KPI Report*'));
    assert.equal(historySpy.mock.callCount(), 1);
  });

  it('should force fresh history fetch for daily report prompts', async () => {
    let nowMs = 1_730_000_000_000;
    mock.method(Date, 'now', () => nowMs);
    const historySpy = mock.fn(async () => ({
      ok: true,
      messages: [
        {
          ts: '1729999900.000100',
          text: 'An agent has sent an SMS ContactMia (+1 217-257-1181) Message Want to book a strategy call?',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const client = {
      conversations: {
        history: historySpy,
      },
    } as unknown as WebClient;

    await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'daily report',
    });

    nowMs += 20_000;
    await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'daily report',
    });

    assert.equal(historySpy.mock.callCount(), 4);
  });

  it('should serve stale cached history when refresh fails within stale window', async () => {
    let nowMs = 1_730_000_000_000;
    mock.method(Date, 'now', () => nowMs);
    process.env.ALOWARE_ANALYTICS_CACHE_TTL_SECONDS = '1';
    process.env.ALOWARE_ANALYTICS_CACHE_MAX_STALE_SECONDS = '600';

    let calls = 0;
    const historySpy = mock.fn(async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('history unavailable');
      }

      return {
        ok: true,
        messages: [
          {
            ts: '1729999900.000100',
            text: 'An agent has sent an SMS ContactMia (+1 217-257-1181) Message Want to book a strategy call?',
          },
          {
            ts: '1729999950.000100',
            text: 'An agent has received an SMS ContactMia (+1 217-257-1181) Message Yes Wednesday works.',
          },
        ],
        response_metadata: { next_cursor: '' },
      };
    });

    const client = {
      conversations: {
        history: historySpy,
      },
    } as unknown as WebClient;

    const first = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });
    nowMs += 2_000;
    const second = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });

    assert(first.includes('Conversations replied (24h): 1 (100.0%)'));
    assert(second.includes('Conversations replied (24h): 1 (100.0%)'));
    assert.equal(historySpy.mock.callCount(), 2);
  });

  it('should update direction classification when regex env settings change', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS ContactMia (+1 217-257-1181) Message Checking in.',
      },
    ]);

    process.env.ALOWARE_INBOUND_PATTERN = '\\bhas\\s+sent\\s+an\\s+sms\\b';
    process.env.ALOWARE_OUTBOUND_PATTERN = '\\bnevermatches\\b';
    const inboundReport = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });

    process.env.ALOWARE_INBOUND_PATTERN = '\\bnevermatches\\b';
    process.env.ALOWARE_OUTBOUND_PATTERN = '\\bhas\\s+sent\\s+an\\s+sms\\b';
    const outboundReport = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });

    assert(inboundReport.includes('Outbound conversations started (24h): 0'));
    assert(outboundReport.includes('Outbound conversations started (24h): 1'));
  });

  it('should keep sequence totals accurate when contact formatting differs', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS Contact: Blake Johnson (+1 847-682-8630) Sequence BOOK- BUYER Intro Flow Message Quick follow-up.',
      },
      {
        ts: '1729999950.000100',
        text: 'An agent has received an SMS Contact Blake Johnson (+18476828630) Sequence BOOK- BUYER Intro Flow Message Yes that works.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('*Core Metrics*'));
    assert(report.includes('- Outbound Conversations: 1'));
    assert(report.includes('- Reply Rate: 100.0%'));
  });

  it('should merge similarly named sequences when they are not explicit A/B variants', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactTaylor (+1 555-701-0001) Sequence Workshop Playbook - 2026 v1.0 Message Quick question for you.',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactTaylor (+1 555-701-0001) Message Yes.',
      },
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS ContactMorgan (+1 555-701-0002) Sequence WORKSHOP PLAYBOOK Message Following up.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('Workshop Playbook: sent 2, replies received 1 (50.0% response rate)'));
    assert(!report.includes('WORKSHOP PLAYBOOK: sent 1'));
    assert(!report.includes('Workshop Playbook - 2026 v1.0: sent 1'));
  });

  it('should keep explicit Version A and Version B sequences separated for A/B testing', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);
    const client = buildClient([
      {
        ts: '1729999800.000100',
        text: 'An agent has sent an SMS ContactAlex (+1 555-702-0001) Sequence Workshop Playbook Version A Message Quick question for you.',
      },
      {
        ts: '1729999850.000100',
        text: 'An agent has received an SMS ContactAlex (+1 555-702-0001) Message Yes.',
      },
      {
        ts: '1729999900.000100',
        text: 'An agent has sent an SMS ContactRiley (+1 555-702-0002) Sequence Workshop Playbook Version B Message Quick question for you.',
      },
    ]);

    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'Please send a daily report with new inbound leads and booking requests',
    });

    assert(report.includes('Workshop Playbook - Version A: sent 1, replies received 1 (100.0% response rate)'));
    assert(report.includes('Workshop Playbook - Version B: sent 1, replies received 0 (0.0% response rate)'));
    assert(!report.includes('Workshop Playbook: sent 2'));
  });

  it('should build large reports within a conservative performance threshold', async () => {
    mock.method(Date, 'now', () => 1_730_000_000_000);

    const messages: MockHistoryMessage[] = [];
    for (let index = 0; index < 5_000; index += 1) {
      const ts = (1_729_999_000 + index).toFixed(6);
      const contactId = Math.floor(index / 2);
      if (index % 2 === 0) {
        messages.push({
          ts,
          text: `An agent has sent an SMS ContactLead${contactId} (+1 555-100-${(contactId % 10_000).toString().padStart(4, '0')}) Message Want to discuss growth this week?`,
        });
      } else {
        messages.push({
          ts,
          text: `An agent has received an SMS ContactLead${contactId} (+1 555-100-${(contactId % 10_000).toString().padStart(4, '0')}) Message Yes I can discuss on Wednesday.`,
        });
      }
    }

    const client = buildClient(messages);
    const startedAt = performance.now();
    const report = await buildAlowareAnalyticsReport({
      channelId: 'C09ULGH1BEC',
      client,
      prompt: 'kpi report',
    });
    const durationMs = performance.now() - startedAt;

    assert(report.includes('*SMS Insights Core KPI Report*'));
    assert(durationMs < 5_000, `expected report generation < 5000ms, got ${durationMs.toFixed(2)}ms`);
  });
});
