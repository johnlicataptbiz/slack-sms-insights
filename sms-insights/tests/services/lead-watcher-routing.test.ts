import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { __resetLeadWatcherConfigCacheForTests, buildLeadWatcherAlert } from '../../services/lead-watcher.js';

describe('lead watcher routing', () => {
  beforeEach(() => {
    __resetLeadWatcherConfigCacheForTests();
    process.env.ALOWARE_CHANNEL_ID = 'C1234';
    process.env.ALOWARE_WATCHER_CHANNEL_ID = '';
    process.env.ALOWARE_WATCHER_ENABLED = 'true';
    process.env.ALOWARE_WATCHER_BRANDON_USER_ID = 'UBRANDON';
    process.env.ALOWARE_WATCHER_JACK_USER_ID = 'UJACK';
    process.env.ALOWARE_WATCHER_DEFAULT_ASSIGNEE = 'balanced';
    process.env.ALOWARE_WATCHER_REQUIRE_OWNER_HINT = 'true';
  });

  it('ignores non-Aloware coaching text', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.200',
      text: [
        'Inbound Lead Response - vestibularptsteve',
        `Lead's Message: "I missed Danny's book signing at CSM and wanted to read his book"`,
      ].join('\n'),
    });

    assert.equal(alert, undefined);
  });

  it('routes inbound alerts to the sender via line owner hint', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.201',
      text: '',
      attachments: [
        {
          title: 'An agent has received an SMS',
          fields: [
            {
              title: 'Line',
              value: "Jack's Personal Line (<tel:+1817-580-9950|+1 817-580-9950>)",
            },
            {
              title: 'Contact',
              value: 'vestibularptsteve (<tel:+1623-217-6570|+1 623-217-6570>)',
            },
            {
              title: 'Message',
              value: 'I can do Tuesday at 3:00pm for a strategy call.',
            },
          ],
        },
      ],
    });

    assert(alert);
    assert.equal(alert.assigneeUserId, 'UJACK');
    assert.equal(alert.signalType, 'booking');
    assert(alert.text.includes('<@UJACK>'));
  });

  it('routes by line phone when line name is missing', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.202',
      text: '',
      attachments: [
        {
          title: 'An agent has received an SMS',
          fields: [
            {
              title: 'Line',
              value: '<tel:+1817-580-9950|+1 817-580-9950>',
            },
            {
              title: 'Contact',
              value: 'Taylor (<tel:+1555-222-3333|+1 555-222-3333>)',
            },
            {
              title: 'Message',
              value: "Yes, let's book for Friday afternoon.",
            },
          ],
        },
      ],
    });

    assert(alert);
    assert.equal(alert.assigneeUserId, 'UJACK');
  });

  it('does not round-robin when owner is unknown', () => {
    const alert = buildLeadWatcherAlert({
      channelId: 'C1234',
      ts: '171000.203',
      text: '',
      attachments: [
        {
          title: 'An agent has received an SMS',
          fields: [
            {
              title: 'Contact',
              value: 'Unknown Contact (<tel:+1555-999-0000|+1 555-999-0000>)',
            },
            {
              title: 'Message',
              value: "Yes, let's schedule a call.",
            },
          ],
        },
      ],
    });

    assert.equal(alert, undefined);
  });
});
