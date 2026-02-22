import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPersonalMappingFromEnv } from '../../services/monday-personal-writeback.js';

describe('monday personal writeback mapping', () => {
  it('reads explicit mapping from env JSON', () => {
    const mapping = readPersonalMappingFromEnv(
      JSON.stringify({
        callDateColumnId: 'date4',
        contactNameColumnId: 'name',
        phoneColumnId: 'phone',
        setterColumnId: 'person',
        stageColumnId: 'status',
        firstConversionColumnId: 'text_first_conversion',
        lineColumnId: 'text_line',
        sourceColumnId: 'text_source',
        slackLinkColumnId: 'link',
        notesColumnId: 'long_text',
      }),
    );

    assert(mapping);
    assert.equal(mapping.callDateColumnId, 'date4');
    assert.equal(mapping.contactNameColumnId, 'name');
    assert.equal(mapping.slackLinkColumnId, 'link');
  });
});
