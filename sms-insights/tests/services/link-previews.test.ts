import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { buildMessageLinkPreviews, extractUrlsFromText } from '../../services/link-previews.js';

const ORIGINAL_ENV = {
  INBOX_LINK_PREVIEWS_ENABLED: process.env.INBOX_LINK_PREVIEWS_ENABLED,
  INBOX_LINK_PREVIEW_MAX_PER_MESSAGE: process.env.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE,
};

afterEach(() => {
  process.env.INBOX_LINK_PREVIEWS_ENABLED = ORIGINAL_ENV.INBOX_LINK_PREVIEWS_ENABLED;
  process.env.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE = ORIGINAL_ENV.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE;
});

describe('link previews', () => {
  it('extracts only public http(s) URLs and dedupes trailing punctuation', () => {
    process.env.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE = '3';
    const urls = extractUrlsFromText(
      'See https://example.com/path, https://example.com/path and http://localhost:3000 plus https://docs.example.org/guide.',
    );
    assert.deepEqual(urls, ['https://example.com/path', 'https://docs.example.org/guide']);
  });

  it('respects max previews per message setting', () => {
    process.env.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE = '1';
    const urls = extractUrlsFromText('https://a.com https://b.com https://c.com');
    assert.equal(urls.length, 1);
    assert.equal(urls[0], 'https://a.com/');
  });

  it('returns empty previews when feature is disabled', async () => {
    process.env.INBOX_LINK_PREVIEWS_ENABLED = 'false';
    const previews = await buildMessageLinkPreviews([
      { id: 'm1', body: 'https://example.com' },
      { id: 'm2', body: null },
    ]);
    assert.deepEqual(previews.get('m1'), []);
    assert.deepEqual(previews.get('m2'), []);
  });
});

