import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetGetPoolForTests,
  __setGetPoolForTests,
  type DailyRunRow,
  getDailyRuns,
} from '../../services/daily-run-logger.js';

type FakePool = {
  query: (sql: string, params?: Array<string | number>) => Promise<{ rows: DailyRunRow[] }>;
};

const makeRow = (overrides: Partial<DailyRunRow>): DailyRunRow => {
  const base: DailyRunRow = {
    id: 'id',
    timestamp: '2026-02-20T00:00:00.000Z',
    channel_id: 'C123',
    channel_name: 'Channel',
    report_date: null,
    report_type: 'daily',
    status: 'success',
    error_message: null,
    summary_text: null,
    full_report: null,
    duration_ms: null,
    is_legacy: false,
    created_at: '2026-02-20T00:00:00.000Z',
  };
  return { ...base, ...overrides };
};

test('getDailyRuns canonical mode: prefers non-placeholder over placeholder', async () => {
  const _placeholder = makeRow({
    id: 'placeholder',
    summary_text: 'Backfilled placeholder run for 2026-02-18',
    timestamp: '2026-02-18T12:00:00.000Z',
    report_date: '2026-02-18',
  });

  const real = makeRow({
    id: 'real',
    summary_text: 'Real run',
    timestamp: '2026-02-18T13:00:00.000Z',
    report_date: '2026-02-18',
  });

  const calls: Array<{ sql: string; params?: Array<string | number> }> = [];
  const fakePool: FakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [real] };
    },
  };

  __setGetPoolForTests(() => fakePool as never);

  try {
    const rows = await getDailyRuns({ daysBack: 7 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, 'real');

    assert.equal(calls.length, 1);
    assert.ok(calls[0]);
    assert.match(calls[0].sql, /ROW_NUMBER\(\) OVER/i);
    assert.match(calls[0].sql, /ILIKE 'backfilled placeholder%'/i);
  } finally {
    __resetGetPoolForTests();
  }
});

test('getDailyRuns raw mode: uses simple SELECT * query', async () => {
  const calls: Array<{ sql: string; params?: Array<string | number> }> = [];
  const fakePool: FakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [makeRow({ id: 'raw1' })] };
    },
  };

  __setGetPoolForTests(() => fakePool as never);

  try {
    const rows = await getDailyRuns({ raw: true, daysBack: 7, limit: 10, offset: 0 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, 'raw1');

    assert.equal(calls.length, 1);
    assert.ok(calls[0]);
    assert.match(calls[0].sql, /^SELECT \* FROM daily_runs/i);
    assert.match(calls[0].sql, /ORDER BY timestamp DESC/i);
  } finally {
    __resetGetPoolForTests();
  }
});
