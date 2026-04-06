import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildUpdateMarkdown,
  classifyMondayWritebackError,
  readPersonalMappingFromEnv,
} from '../../services/monday-personal-writeback.js';

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

  it('builds compact update markdown with attribution details', () => {
    const markdown = buildUpdateMarkdown({
      bookedCallId: 'bc-1',
      eventTs: '2026-04-05T19:03:00.000Z',
      bucket: 'jack',
      firstConversion: 'Book Buyer',
      rep: 'Jack Licata',
      line: 'Aloware SMS',
      contactName: 'Katie Segner',
      contactPhone: '+18302850869',
      contactEmail: 'katie@example.com',
      slackChannelId: 'C123',
      slackMessageTs: '1743870180.1234',
      text: 'Already cash based!',
      raw: null,
      mappingMethod: 'phone+email',
      matchConfidence: 0.93,
      attributionStatus: 'confirmed',
      attributionConfidenceBand: 'high',
      needsReview: false,
      reviewReason: null,
      resolvedSequenceLabel: 'Cash Practice Field Manual',
    });

    assert.match(markdown, /Attribution: confirmed \| high confidence \| 93%/);
    assert.match(
      markdown,
      /Method: phone\+email • Sequence: Cash Practice Field Manual/,
    );
    assert.match(markdown, /Needs review: no/);
    assert.match(markdown, /Thread context: Already cash based!/);
  });

  it('classifies common monday writeback failure modes', () => {
    assert.equal(
      classifyMondayWritebackError(
        new Error('MONDAY_API_TOKEN is not configured'),
      ),
      'configuration',
    );
    assert.equal(
      classifyMondayWritebackError(new Error('429 rate limit exceeded')),
      'rate_limit',
    );
    assert.equal(
      classifyMondayWritebackError(new Error('invalid_auth for this token')),
      'auth',
    );
    assert.equal(
      classifyMondayWritebackError(
        new Error('Column mapping invalid value for status'),
      ),
      'schema_mapping',
    );
    assert.equal(
      classifyMondayWritebackError(new Error('fetch failed: ECONNRESET')),
      'network',
    );
  });
});
