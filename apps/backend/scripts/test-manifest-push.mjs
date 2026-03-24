import { readFileSync } from 'fs';

const creds = JSON.parse(readFileSync(process.env.HOME + '/.slack/credentials.json', 'utf8'));
const token = creds['TJ3QQ76KV']?.token;
console.log('Token prefix:', token?.slice(0, 20));

const manifest = {
  display_information: {
    name: 'PT Biz SMS',
    description: 'A real time SMS insights dashboard integrated with Slack, Aloware, and Monday.com.',
    background_color: '#0977e6',
  },
  features: {
    app_home: { home_tab_enabled: true, messages_tab_enabled: false, messages_tab_read_only_enabled: true },
    bot_user: { display_name: 'Aloware SMS Insights', always_online: true },
    slash_commands: [
      { command: '/ask', description: 'Ask the SMS Insights bot a question', usage_hint: '[question]', should_escape: false },
      { command: '/sms-report', description: 'Generate a daily SMS report', usage_hint: '[today|yesterday|YYYY-MM-DD]', should_escape: false },
      { command: '/sms-scoreboard', description: 'Post the weekly setter scoreboard', usage_hint: '', should_escape: false },
    ],
  },
  oauth_config: {
    redirect_urls: ['https://ptbizsms.com/api/oauth/callback'],
    scopes: {
      bot: ['app_mentions:read','channels:history','chat:write','commands','groups:history','reactions:read'],
    },
  },
  settings: {
    socket_mode_enabled: true,
    org_deploy_enabled: false,
    interactivity: { is_enabled: true },
    event_subscriptions: { bot_events: ['app_home_opened','app_mention','message.channels','message.groups','reaction_added','reaction_removed'] },
    token_rotation_enabled: false,
  },
};

// Try 1: manifest as JSON string (standard Slack API format)
const r1 = await fetch('https://slack.com/api/apps.manifest.update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ app_id: 'A0AFCE7ENE5', manifest: JSON.stringify(manifest) }),
});
const d1 = await r1.json();
console.log('String form:', d1.ok ? '✅ OK' : `❌ ${d1.error}`, d1.detail ?? '');

// Try 2: manifest as object
const r2 = await fetch('https://slack.com/api/apps.manifest.update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ app_id: 'A0AFCE7ENE5', manifest }),
});
const d2 = await r2.json();
console.log('Object form:', d2.ok ? '✅ OK' : `❌ ${d2.error}`, d2.detail ?? '');

// Try 3: form-encoded with manifest as string
const params = new URLSearchParams({ app_id: 'A0AFCE7ENE5', manifest: JSON.stringify(manifest) });
const r3 = await fetch('https://slack.com/api/apps.manifest.update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
  body: params.toString(),
});
const d3 = await r3.json();
console.log('Form-encoded:', d3.ok ? '✅ OK' : `❌ ${d3.error}`, d3.detail ?? '');
