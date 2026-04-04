import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseBoardIdsQuery, parseScope } from '../../services/monday-governed-analytics.js';

describe('monday governed analytics helpers', () => {
  it('parses scope values with curated default', () => {
    assert.equal(parseScope('curated'), 'curated');
    assert.equal(parseScope('all'), 'all');
    assert.equal(parseScope('board_ids'), 'board_ids');
    assert.equal(parseScope('invalid'), 'curated');
    assert.equal(parseScope(null), 'curated');
  });

  it('parses board id csv safely', () => {
    assert.deepEqual(parseBoardIdsQuery('5077164868, 10029059942 , ,7308299531'), [
      '5077164868',
      '10029059942',
      '7308299531',
    ]);
    assert.deepEqual(parseBoardIdsQuery(''), []);
  });
});
