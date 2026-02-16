import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import {
  __resetLeadWatcherConfigCacheForTests,
  buildLeadWatcherAlert,
  isLeadWatcherEnabledForChannel,
  shouldBroadcastLeadWatcherAlerts,
} from '../../services/lead-watcher.js';

describe('lead watcher service', () => {
  beforeEach(() => {
    __resetLeadWatcherConfigCacheForTests();
    process.env.ALOWARE_CHANNEL_ID = 'C1234';
    process.env.ALOWARE_WATCHER_CHANNEL_ID = '';
    process.env.ALOWARE_WATCHER_ENABLED = 'true';
    process.env.ALOWARE_WATCHER_BRANDON_USER_ID = 'UBRANDON';
    process.env.ALOWARE_WATCHER_JACK_USER_ID = 'UJACK';
    process.env.ALOWARE_WATCHER_DEFAULT_ASSIGNEE = 'brandon';
    process.env.ALOWARE_WATCHER_BROADCAST_ALERTS = 'false';
  });

  it('should be enabled for aloware channel by default', () => {
    assert.equal(isLeadWatcherEnabledForChannel('C1234'), true);
    assert.equal(isLeadWatcherEnabledForChannel('C9999'), false);
  });

  it('should build alert for promising inbound messages', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.100',
      text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, Friday 2:30pm works for a strategy call.',
    });

    assert(alert);
    assert.equal(alert.assigneeUserId, 'UBRANDON');
    assert.equal(alert.channelId, 'C1234');
    assert.equal(alert.threadTs, '171000.100');
    assert.equal(alert.signalType, 'booking');
    assert(alert.text.includes('<@UBRANDON>'));
    assert(alert.text.includes('Taylor'));
    assert(alert.text.includes('Why flagged:'));
    assert(alert.text.includes('Suggested next step:'));
  });

  it('should treat specific availability as booking intent even without direct booking words', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.104',
      text: 'An agent has received an SMS ContactAlex (+1 555-222-3333) Message Tuesday at 3:15 works best for me.',
    });

    assert(alert);
    assert.equal(alert.signalType, 'booking');
    assert(alert.text.includes('Scheduling detail detected'));
    assert(alert.text.includes('Confirm timezone'));
  });

  it('should suppress negative or low-signal inbound messages', () => {
    const notInterested = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.101',
      text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Not interested.',
    });
    const lowSignal = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.102',
      text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Thanks!',
    });

    assert.equal(notInterested, undefined);
    assert.equal(lowSignal, undefined);
  });

  it('should route by owner hint when present', () => {
    process.env.ALOWARE_WATCHER_DEFAULT_ASSIGNEE = 'balanced';
    __resetLeadWatcherConfigCacheForTests();
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.103',
      text: 'An agent has received an SMS User Jack Licata ContactTaylor (+1 555-222-2222) Message I can do a strategy call Tuesday.',
    });

    assert(alert);
    assert.equal(alert.assigneeUserId, 'UJACK');
  });

  it('should read broadcast flag', () => {
    assert.equal(shouldBroadcastLeadWatcherAlerts(), false);
    process.env.ALOWARE_WATCHER_BROADCAST_ALERTS = 'true';
    __resetLeadWatcherConfigCacheForTests();
    assert.equal(shouldBroadcastLeadWatcherAlerts(), true);
  });
});
