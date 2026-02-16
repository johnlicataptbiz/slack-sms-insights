import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { WebClient } from '@slack/web-api';
import {
  __parseCanvasSyncStateTextForTests,
  readCanvasSyncState,
  upsertCanvasSyncState,
} from '../../services/canvas-sync-state.js';

describe('canvas sync state', () => {
  beforeEach(() => {
    mock.restoreAll();
    process.env.ALOWARE_CANVAS_STATE_MARKER = '[SMS_INSIGHTS_STATE_V1]';
    process.env.ALOWARE_CANVAS_STATE_LOOKBACK_MESSAGES = '100';
  });

  it('should parse marker payload for valid state text', () => {
    const parsed = __parseCanvasSyncStateTextForTests(
      '[SMS_INSIGHTS_STATE_V1] {"version":1,"last_processed_report_ts":100,"processed_thread_ts":["111.1"],"updated_at":101}',
    );

    assert(parsed);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.last_processed_report_ts, 100);
    assert.deepEqual(parsed.processed_thread_ts, ['111.1']);
  });

  it('should read the latest valid state message from channel history', async () => {
    const historySpy = mock.fn(async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          text: '[SMS_INSIGHTS_STATE_V1] {"version":1,"last_processed_report_ts":200,"processed_thread_ts":["1730000000.000100"],"updated_at":201}',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    const client = {
      conversations: {
        history: historySpy,
      },
    } as unknown as WebClient;

    const result = await readCanvasSyncState({
      channelId: 'C1234',
      client,
    });

    assert.equal(result.corrupted, false);
    assert.equal(result.stateMessageTs, '1730000001.000100');
    assert(result.state);
    assert.equal(result.state?.last_processed_report_ts, 200);
    assert.equal(historySpy.mock.callCount(), 1);
  });

  it('should upsert by updating existing message when ts is available', async () => {
    const updateSpy = mock.fn(async () => ({
      ok: true,
      ts: '1730000001.000100',
    }));

    const client = {
      chat: {
        update: updateSpy,
      },
    } as unknown as WebClient;

    const stateTs = await upsertCanvasSyncState({
      channelId: 'C1234',
      client,
      stateMessageTs: '1730000001.000100',
      state: {
        version: 1,
        last_processed_report_ts: 200,
        processed_thread_ts: ['1730000000.000100'],
        updated_at: 201,
      },
    });

    assert.equal(stateTs, '1730000001.000100');
    assert.equal(updateSpy.mock.callCount(), 1);
  });

  it('should fall back to updating report message metadata when no prior state message exists', async () => {
    const updateSpy = mock.fn(async () => ({
      ok: true,
      ts: '1730000009.000100',
    }));

    const client = {
      chat: {
        update: updateSpy,
      },
    } as unknown as WebClient;

    const stateTs = await upsertCanvasSyncState({
      channelId: 'C1234',
      client,
      fallbackMessageText: '*PT BIZ - DAILY SMS SNAPSHOT*',
      fallbackMessageTs: '1730000009.000100',
      state: {
        version: 1,
        last_processed_report_ts: 200,
        processed_thread_ts: ['1730000000.000100'],
        updated_at: 201,
      },
    });

    assert.equal(stateTs, '1730000009.000100');
    assert.equal(updateSpy.mock.callCount(), 1);
  });

  it('should skip write when no state message target exists', async () => {
    const updateSpy = mock.fn(async () => ({
      ok: true,
      ts: '1730000009.000100',
    }));

    const client = {
      chat: {
        update: updateSpy,
      },
    } as unknown as WebClient;

    const stateTs = await upsertCanvasSyncState({
      channelId: 'C1234',
      client,
      state: {
        version: 1,
        last_processed_report_ts: 200,
        processed_thread_ts: ['1730000000.000100'],
        updated_at: 201,
      },
    });

    assert.equal(stateTs, undefined);
    assert.equal(updateSpy.mock.callCount(), 0);
  });
});
