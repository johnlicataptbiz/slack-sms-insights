import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { WebClient } from '@slack/web-api';
import { appendAssistantSummaryToCanvas } from '../../services/summary-canvas.js';
import { fakeLogger } from '../helpers.js';

describe('assistant summary canvas', () => {
  beforeEach(() => {
    mock.restoreAll();
    fakeLogger.resetCalls();
    process.env.ALOWARE_CANVAS_DURABLE_MODE = 'false';

    process.env.ALOWARE_SUMMARY_CANVAS_ENABLED = 'true';
    process.env.ALOWARE_SUMMARY_CANVAS_ID = 'FSUM123';
    process.env.ALOWARE_SUMMARY_MANAGED_KEY = 'sms_insights_assistant_summaries_v1';
    process.env.ALOWARE_SUMMARY_SECTION_HEADING = 'Assistant Summaries (Managed)';
    process.env.ALOWARE_SUMMARY_TIMEZONE = 'America/Chicago';
    process.env.ALOWARE_SUMMARY_CANVAS_LOOKUP_PERMALINK = 'true';
    process.env.CHATGPT_ASSISTANT_USER_ID = 'U_CHATGPT';
    process.env.CODEX_ASSISTANT_USER_ID = 'U_CODEX';
    process.env.CLAUDE_ASSISTANT_USER_ID = 'U_CLAUDE';
  });

  it('should append thread summary replies from configured assistants', async () => {
    const apiCallSpy = mock.fn(async (method: string, _payload?: unknown) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });
    const permalinkSpy = mock.fn(async () => ({
      ok: true,
      permalink: 'https://slack.com/archives/C123/p1730000100000200',
    }));

    const client = {
      apiCall: apiCallSpy,
      chat: {
        getPermalink: permalinkSpy,
      },
    } as unknown as WebClient;

    await appendAssistantSummaryToCanvas({
      client,
      logger: fakeLogger as never,
      message: {
        channelId: 'C123',
        text: 'Top wins: tighter follow-up and cleaner sequence branching.',
        threadTs: '1730000000.000100',
        ts: '1730000100.000200',
        userId: 'U_CHATGPT',
      },
    });

    const editCalls = apiCallSpy.mock.calls.filter((call) => call.arguments[0] === 'canvases.edit');
    assert.equal(editCalls.length, 2);

    const firstPayload = editCalls[0].arguments[1] as
      | { changes?: Array<{ document_content?: { markdown?: string } }> }
      | undefined;
    const secondPayload = editCalls[1].arguments[1] as
      | { changes?: Array<{ document_content?: { markdown?: string } }> }
      | undefined;
    const firstMarkdown = firstPayload?.changes?.[0]?.document_content?.markdown || '';
    const secondMarkdown = secondPayload?.changes?.[0]?.document_content?.markdown || '';

    assert(firstMarkdown.includes('Managed key: sms_insights_assistant_summaries_v1'));
    assert(secondMarkdown.includes('ChatGPT'));
    assert(secondMarkdown.includes('entry_id:1730000100.000200'));
    assert(secondMarkdown.includes('Open in Slack'));
    assert(secondMarkdown.includes('Top wins: tighter follow-up and cleaner sequence branching.'));
    assert.equal(permalinkSpy.mock.callCount(), 1);
  });

  it('should ignore non-assistant and non-thread messages', async () => {
    const apiCallSpy = mock.fn(async (_method: string, _payload?: unknown) => ({ ok: true }));
    const permalinkSpy = mock.fn(async () => ({ ok: true, permalink: 'https://slack.com/example' }));

    const client = {
      apiCall: apiCallSpy,
      chat: {
        getPermalink: permalinkSpy,
      },
    } as unknown as WebClient;

    await appendAssistantSummaryToCanvas({
      client,
      logger: fakeLogger as never,
      message: {
        channelId: 'C123',
        text: 'Not an assistant summary',
        threadTs: '1730000000.000100',
        ts: '1730000100.000200',
        userId: 'U_SOMEONE_ELSE',
      },
    });

    await appendAssistantSummaryToCanvas({
      client,
      logger: fakeLogger as never,
      message: {
        channelId: 'C123',
        text: 'Assistant message but root post',
        threadTs: '1730000200.000300',
        ts: '1730000200.000300',
        userId: 'U_CHATGPT',
      },
    });

    assert.equal(apiCallSpy.mock.callCount(), 0);
    assert.equal(permalinkSpy.mock.callCount(), 0);
  });

  it('should replace same-day daily summary entries instead of appending duplicates', async () => {
    process.env.ALOWARE_SUMMARY_CANVAS_LOOKUP_PERMALINK = 'false';

    let dailyEntryLookupCalls = 0;
    const apiCallSpy = mock.fn(async (method: string, payload?: unknown) => {
      if (method === 'canvases.sections.lookup') {
        const lookupPayload = payload as { criteria?: { contains_text?: string } } | undefined;
        const containsText = lookupPayload?.criteria?.contains_text || '';
        if (containsText.includes('Managed key:')) {
          return { ok: true, sections: [] };
        }
        if (containsText.includes('entry_id:daily_summary_latest')) {
          dailyEntryLookupCalls += 1;
          if (dailyEntryLookupCalls === 1) {
            return { ok: true, sections: [{ id: 'S_EXISTING' }] };
          }
          return { ok: true, sections: [] };
        }
        if (containsText.includes('entry_id:1730000100.000200')) {
          return { ok: true, sections: [{ id: 'S_EXISTING' }] };
        }
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });
    const permalinkSpy = mock.fn(async () => ({ ok: true, permalink: 'https://slack.com/example' }));

    const client = {
      apiCall: apiCallSpy,
      chat: {
        getPermalink: permalinkSpy,
      },
    } as unknown as WebClient;

    await appendAssistantSummaryToCanvas({
      client,
      logger: fakeLogger as never,
      message: {
        assistantLabel: 'Daily Report Summary',
        channelId: 'C123',
        text: '*Daily Summary (Canvas Only)*\n- Messages sent: 26\n- Replies received: 2 (7.7%)\n- Calls booked: 1',
        threadTs: '1730000000.000100',
        ts: '1730000100.000200',
      },
    });

    const editCalls = apiCallSpy.mock.calls.filter((call) => call.arguments[0] === 'canvases.edit');
    assert(editCalls.length >= 3);

    const deleteCall = editCalls.find((call) => {
      const payload = call.arguments[1] as { changes?: Array<{ operation?: string; section_id?: string }> };
      return payload.changes?.[0]?.operation === 'delete';
    });
    const insertPayload = editCalls
      .map((call) => call.arguments[1] as { changes?: Array<{ operation?: string; document_content?: { markdown?: string } }> })
      .find((payload) => payload.changes?.[0]?.document_content?.markdown?.includes('entry_id:daily_summary_latest')) as
      | { changes?: Array<{ operation?: string; document_content?: { markdown?: string } }> }
      | undefined;
    const insertedMarkdown = insertPayload?.changes?.[0]?.document_content?.markdown || '';

    assert(deleteCall);
    const deletePayload = deleteCall!.arguments[1] as { changes?: Array<{ operation?: string; section_id?: string }> };
    assert.equal(deletePayload.changes?.[0]?.section_id, 'S_EXISTING');
    assert(insertedMarkdown.includes('entry_id:daily_summary_latest'));
    assert(insertedMarkdown.includes('Daily Summary (Canvas Only)'));
    assert.equal(permalinkSpy.mock.callCount(), 0);
  });
});
