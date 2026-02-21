import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveCurrentBusinessDay, resolveRunBusinessDay } from '../../../frontend/src/utils/runDay.js';

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

describe('current business day resolution', () => {
  it('carries over to previous day before business start hour in Chicago', () => {
    const context = resolveCurrentBusinessDay({
      now: new Date('2026-02-21T09:00:00.000Z'), // 03:00 America/Chicago
      timeZone: 'America/Chicago',
      startHour: 4,
    });
    assert.deepEqual(context, {
      day: '2026-02-20',
      isCarryOver: true,
      startHour: 4,
      timeZone: 'America/Chicago',
    });
  });

  it('uses same calendar day at or after business start hour', () => {
    const context = resolveCurrentBusinessDay({
      now: new Date('2026-02-21T10:00:00.000Z'), // 04:00 America/Chicago
      timeZone: 'America/Chicago',
      startHour: 4,
    });
    assert.deepEqual(context, {
      day: '2026-02-21',
      isCarryOver: false,
      startHour: 4,
      timeZone: 'America/Chicago',
    });
  });

  it('returns null when now is invalid', () => {
    const context = resolveCurrentBusinessDay({
      now: new Date('invalid-date'),
      timeZone: 'America/Chicago',
      startHour: 4,
    });
    assert.equal(context, null);
  });
});
