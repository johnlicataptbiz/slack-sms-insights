import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { __resetChannelAccessCacheForTests, isChannelAllowed } from '../../services/channel-access.js';

describe('channel access', () => {
  beforeEach(() => {
    __resetChannelAccessCacheForTests();
    delete process.env.ALLOWED_CHANNEL_IDS;
  });

  it('should allow all channels when no restrictions are configured', () => {
    assert.equal(isChannelAllowed('C123'), true);
    assert.equal(isChannelAllowed(undefined), true);
  });

  it('should respect updated env configuration after cache hydration', () => {
    process.env.ALLOWED_CHANNEL_IDS = 'C123';
    assert.equal(isChannelAllowed('C123'), true);
    assert.equal(isChannelAllowed('C999'), false);

    process.env.ALLOWED_CHANNEL_IDS = 'C999';
    assert.equal(isChannelAllowed('C123'), false);
    assert.equal(isChannelAllowed('C999'), true);
  });
});
