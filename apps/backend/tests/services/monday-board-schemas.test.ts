import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MONDAY_SMS_SCHEMA_VERSION,
  buildBoardStructureDiagnostics,
  findDriftedBoardColumns,
  mondaySmsBoardSchemas,
} from '../../services/monday-board-schemas.js';

describe('monday-board-schemas intelligent model', () => {
  it('uses intelligent schema version', () => {
    assert.equal(MONDAY_SMS_SCHEMA_VERSION, 'intelligent-v1');
  });

  it('defines connect-board and formula columns for sequences and reports', () => {
    const sequenceTypes = mondaySmsBoardSchemas.sequences.columns.map((column) => column.type);
    const reportTypes = mondaySmsBoardSchemas.reports.columns.map((column) => column.type);
    assert.ok(sequenceTypes.includes('board_relation'));
    assert.ok(sequenceTypes.includes('formula'));
    assert.ok(reportTypes.includes('board_relation'));
    assert.ok(reportTypes.includes('formula'));
  });

  it('detects drifted column types', () => {
    const drift = findDriftedBoardColumns(
      [
        { id: 'one', title: 'Sequence Run Key', type: 'numbers' },
        { id: 'two', title: 'Events Links', type: 'board_relation' },
      ],
      mondaySmsBoardSchemas.sequences,
    );
    assert.equal(drift.length, 1);
    assert.equal(drift[0]?.expected.title, 'Sequence Run Key');
    assert.equal(drift[0]?.actualType, 'numbers');
  });

  it('builds structure diagnostics with missing columns', () => {
    const diagnostics = buildBoardStructureDiagnostics('reports', [
      { id: '1', title: 'Week Start', type: 'date' },
      { id: '2', title: 'Report Day Key', type: 'text' },
    ]);
    assert.equal(diagnostics.schemaVersion, 'intelligent-v1');
    assert.equal(diagnostics.structureValid, false);
    assert.ok(diagnostics.missingColumns.includes('Sequence Links'));
  });
});

