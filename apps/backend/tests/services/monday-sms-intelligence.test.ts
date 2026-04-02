import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSyncDiagnostics, computeDuplicatesDetected, computeLinkCoverage } from '../../services/monday-sms-intelligence.js';

describe('monday-sms-intelligence diagnostics', () => {
  it('computes duplicate counts by normalized join key', () => {
    const duplicates = computeDuplicatesDetected([
      { id: 'a', joinKey: 'abc' },
      { id: 'b', joinKey: 'ABC' },
      { id: 'c', joinKey: 'xyz' },
      { id: 'd', joinKey: null },
    ]);
    assert.equal(duplicates, 1);
  });

  it('computes link coverage ratio', () => {
    const coverage = computeLinkCoverage([
      { linkedIds: ['1', '2'] },
      { linkedIds: [] },
      { linkedIds: ['3'] },
      { linkedIds: [] },
    ]);
    assert.equal(coverage, 0.5);
  });

  it('builds sync diagnostics payload', () => {
    const diagnostics = buildSyncDiagnostics(
      {
        schemaVersion: 'intelligent-v1',
        boardKey: 'events',
        structureValid: false,
        missingColumns: ['External Event ID'],
        driftedColumns: [{ title: 'Event Date', expectedType: 'date', actualType: 'text' }],
      },
      0.75,
      3,
      0.02,
    );
    assert.equal(diagnostics.schemaVersion, 'intelligent-v1');
    assert.equal(diagnostics.structureValid, false);
    assert.equal(diagnostics.linkCoverage, 0.75);
    assert.equal(diagnostics.duplicatesDetected, 3);
    assert.equal(diagnostics.kpiParityDelta, 0.02);
    assert.equal(diagnostics.missingColumns[0], 'External Event ID');
  });
});

