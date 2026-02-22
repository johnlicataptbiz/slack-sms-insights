import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferBoardMapping,
  mergeBoardMappings,
  normalizeBoardItem,
  readBoardMappingFromEnv,
} from '../../services/monday-mapping.js';

describe('monday mapping', () => {
  it('infers board mapping from common column signals', () => {
    const mapping = inferBoardMapping([
      { id: 'date4', title: 'Call Date', type: 'date' },
      { id: 'people', title: 'Setter', type: 'people' },
      { id: 'status', title: 'Stage', type: 'status' },
      { id: 'text_outcome', title: 'Outcome', type: 'text' },
      { id: 'phone', title: 'Phone', type: 'phone' },
      { id: 'contactid', title: 'Contact ID', type: 'text' },
    ]);

    assert.equal(mapping.callDateColumnId, 'date4');
    assert.equal(mapping.setterColumnId, 'people');
    assert.equal(mapping.stageColumnId, 'status');
    assert.equal(mapping.outcomeColumnId, 'text_outcome');
    assert.equal(mapping.phoneColumnId, 'phone');
    assert.equal(mapping.contactIdColumnId, 'contactid');
  });

  it('normalizes monday board item into canonical snapshot shape', () => {
    const normalized = normalizeBoardItem(
      {
        id: '123',
        name: 'Lead Follow-up',
        updatedAt: '2026-02-22T12:00:00.000Z',
        columnValues: [
          { id: 'date4', type: 'date', text: '2026-02-21', value: '{"date":"2026-02-21"}' },
          { id: 'people', type: 'people', text: 'Jack Licata', value: null },
          { id: 'status', type: 'status', text: 'Booked', value: null },
          { id: 'outcome', type: 'text', text: 'Strategy call booked', value: null },
          { id: 'phone', type: 'phone', text: '+1 (817) 580-9950', value: null },
          { id: 'contactid', type: 'text', text: 'abc123', value: null },
        ],
      },
      {
        callDateColumnId: 'date4',
        setterColumnId: 'people',
        stageColumnId: 'status',
        outcomeColumnId: 'outcome',
        phoneColumnId: 'phone',
        contactIdColumnId: 'contactid',
      },
    );

    assert(normalized);
    assert.equal(normalized.callDate, '2026-02-21');
    assert.equal(normalized.setter, 'Jack Licata');
    assert.equal(normalized.disposition, 'booked');
    assert.equal(normalized.isBooked, true);
    assert.equal(normalized.contactKey, 'contact:abc123');
  });

  it('reads board mapping from env JSON and merges with inferred defaults', () => {
    const envMapping = readBoardMappingFromEnv(
      JSON.stringify({
        callDateColumnId: 'date9',
        stageColumnId: 'status2',
      }),
    );
    const inferred = inferBoardMapping([
      { id: 'date4', title: 'Call Date', type: 'date' },
      { id: 'people', title: 'Setter', type: 'people' },
      { id: 'status', title: 'Stage', type: 'status' },
      { id: 'phone', title: 'Phone', type: 'phone' },
      { id: 'contactid', title: 'Contact ID', type: 'text' },
    ]);

    const merged = mergeBoardMappings(inferred, envMapping);
    assert(merged);
    assert.equal(merged.callDateColumnId, 'date9');
    assert.equal(merged.stageColumnId, 'status2');
    assert.equal(merged.setterColumnId, 'people');
  });
});
