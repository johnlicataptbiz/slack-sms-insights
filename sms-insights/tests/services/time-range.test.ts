import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveBusinessDayRange, resolveMetricsRange } from '../../services/time-range.js';

describe('time-range resolver', () => {
  it('resolves today/7d/30d ranges in America/Chicago consistently', () => {
    const now = new Date('2026-01-15T15:30:00.000Z');

    const today = resolveMetricsRange({ range: 'today', tz: 'America/Chicago', now });
    assert.equal(today.mode, 'range');
    assert.equal(today.timeZone, 'America/Chicago');
    assert.equal(today.from.toISOString(), '2026-01-15T06:00:00.000Z');
    assert.equal(today.to.toISOString(), now.toISOString());

    const seven = resolveMetricsRange({ range: '7d', tz: 'America/Chicago', now });
    assert.equal(seven.mode, 'range');
    assert.equal(seven.from.toISOString(), '2026-01-09T06:00:00.000Z');
    assert.equal(seven.to.toISOString(), now.toISOString());

    const thirty = resolveMetricsRange({ range: '30d', tz: 'America/Chicago', now });
    assert.equal(thirty.mode, 'range');
    assert.equal(thirty.from.toISOString(), '2025-12-17T06:00:00.000Z');
    assert.equal(thirty.to.toISOString(), now.toISOString());
  });

  it('resolves an explicit day window without shifting day boundaries', () => {
    const resolved = resolveMetricsRange({ day: '2026-02-20', tz: 'America/Chicago' });
    assert.equal(resolved.mode, 'day');
    assert.equal(resolved.day, '2026-02-20');
    assert.equal(resolved.from.toISOString(), '2026-02-20T06:00:00.000Z');
    assert.equal(resolved.to.toISOString(), '2026-02-21T05:59:59.999Z');
  });

  it('keeps legacy from/to mode for compatibility', () => {
    const resolved = resolveMetricsRange({
      from: '2026-02-10T00:00:00.000Z',
      to: '2026-02-12T23:59:59.999Z',
      tz: 'America/Chicago',
    });
    assert.equal(resolved.mode, 'from-to');
    assert.equal(resolved.from.toISOString(), '2026-02-10T00:00:00.000Z');
    assert.equal(resolved.to.toISOString(), '2026-02-12T23:59:59.999Z');
  });

  it('handles DST transition boundaries for America/Chicago business days', () => {
    const springForward = resolveBusinessDayRange('2025-03-09', 'America/Chicago');
    assert.equal(springForward.from.toISOString(), '2025-03-09T06:00:00.000Z');
    assert.equal(springForward.to.toISOString(), '2025-03-10T04:59:59.999Z');

    const fallBack = resolveBusinessDayRange('2025-11-02', 'America/Chicago');
    assert.equal(fallBack.from.toISOString(), '2025-11-02T05:00:00.000Z');
    assert.equal(fallBack.to.toISOString(), '2025-11-03T05:59:59.999Z');
  });

  it('rejects invalid range selectors', () => {
    assert.throws(() => resolveMetricsRange({ range: '14d', tz: 'America/Chicago' }), /Invalid range/);
    assert.throws(
      () => resolveMetricsRange({ from: '2026-02-12T00:00:00.000Z', to: '2026-02-10T00:00:00.000Z' }),
      /from must be <= to/,
    );
  });
});
