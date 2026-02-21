import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveRunBusinessDay } from '../../../frontend/src/utils/runDay.js';

describe('run day resolution', () => {
  it('uses report_date directly when provided', () => {
    const day = resolveRunBusinessDay(
      { report_date: '2026-02-20', timestamp: '2026-02-21T01:30:00.000Z' },
      'America/Chicago',
    );
    assert.equal(day, '2026-02-20');
  });

  it('uses YYYY-MM-DD prefix when report_date is serialized as ISO datetime', () => {
    const day = resolveRunBusinessDay(
      { report_date: '2026-02-20T00:00:00.000Z', timestamp: '2026-02-21T01:30:00.000Z' },
      'America/Chicago',
    );
    assert.equal(day, '2026-02-20');
  });

  it('derives day from timestamp in America/Chicago when report_date is absent', () => {
    const day = resolveRunBusinessDay(
      { timestamp: '2026-02-20T05:30:00.000Z' }, // 2026-02-19 11:30 PM CST
      'America/Chicago',
    );
    assert.equal(day, '2026-02-19');
  });

  it('returns null for invalid timestamps without report_date', () => {
    const day = resolveRunBusinessDay({ timestamp: 'not-a-date' }, 'America/Chicago');
    assert.equal(day, null);
  });
});
