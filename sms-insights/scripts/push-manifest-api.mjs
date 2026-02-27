// push-manifest-api.mjs — plain ESM, no TypeScript, no dotenv dependency issues
// Uses the Slack CLI rotation token to call apps.manifest.update directly.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = join(__dirname, '../.env');
const envLines = readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
}

// Load Slack CLI rotation token
const credPath = join(process.env.HOME, '.slack/credentials.json');
const creds = JSON.parse(readFileSync(credPath, 'utf8'));
const rotationToken = creds['TJ3QQ76KV']?.token;

const APP_ID = 'A0AFCE7ENE5';

// Full manifest — live fields + our slash commands
const manifest = {
  display_information: {
    name: 'PT Biz SMS',
    description: 'A real time SMS insights dashboard integrated with Slack, Aloware, and Monday.com.',
    background_color: '#0977e6',
    long_description:
      'PT Biz SMS Insights is a real time SMS analytics dashboard built for high performance coaching and sales teams.\r\n\r\nIntegrated directly with Slack, Aloware, and Monday.com, it centralizes campaign performance, conversation tracking, and revenue attribution into a single operational view. Your team can monitor messaging activity as it happens, generate structured daily reports, and track booked calls and outcomes without digging through multiple systems.\r\n\r\nSMS Insights provides:\r\n\r\nReal time campaign monitoring with live KPIs and performance metrics\r\nDaily automated reports with sales data, response rates, and booked calls\r\nConversation level tracking across channels with SLA visibility\r\nAttribution and sequence analytics to understand what is actually driving revenue\r\nA modern interactive dashboard designed for operators, not just analysts\r\n\r\nInstead of manually pulling data from different tools, your team gets a single source of truth for SMS performance and pipeline impact.',
  },
  features: {
    app_home: {
      home_tab_enabled: true,
      messages_tab_enabled: false,
      messages_tab_read_only_enabled: true,
    },
    bot_user: {
      display_name: 'Aloware SMS Insights',
      always_online: true,
    },
    slash_commands: [
      {
        command: '/ask',
        description: 'Ask the SMS Insights bot a question or request an analytics query',
        usage_hint: '[your question or analytics query]',
        should_escape: false,
      },
      {
        command: '/sms-report',
        description: 'Generate a rich daily SMS performance report with interactive buttons',
        usage_hint: '[today | yesterday | YYYY-MM-DD | MM/DD]',
        should_escape: false,
      },
      {
        command: '/sms-scoreboard',
        description: 'Post the weekly setter scoreboard — bookings, sequences, reply rates & compliance',
        usage_hint: '',
        should_escape: false,
      },
    ],
  },
  oauth_config: {
    redirect_urls: [
      'https://localhost:3000/api/oauth/callback',
      'https://sms-insights-production.up.railway.app/api/oauth/callback',
      'https://ptbizsms.com/api/oauth/callback',
    ],
    scopes: {
      bot: [
        'app_mentions:read',
        'canvases:read',
        'channels:history',
        'canvases:write',
        'chat:write',
        'commands',
        'files:read',
        'groups:history',
        'reactions:read',
        'assistant:write',
      ],
      user: [
        'channels:history',
        'channels:read',
        'channels:write',
        'users:read',
        'users:write',
        'chat:write',
        'search:read.public',
        'search:read.private',
        'search:read.mpim',
        'search:read.im',
        'search:read.files',
        'search:read.users',
        'groups:history',
        'mpim:history',
        'im:history',
        'canvases:read',
        'canvases:write',
        'users:read.email',
      ],
    },
  },
  settings: {
    socket_mode_enabled: true,
    org_deploy_enabled: true,
    interactivity: { is_enabled: true },
    event_subscriptions: {
      bot_events: [
        'app_home_opened',
        'app_mention',
        'message.channels',
        'message.groups',
        'reaction_added',
        'reaction_removed',
      ],
    },
    token_rotation_enabled: false,
  },
};

const tryUpdate = async (token, label) => {
  console.log(`\n📤 Trying ${label}…`);
  const res = await fetch('https://slack.com/api/apps.manifest.update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ app_id: APP_ID, manifest: JSON.stringify(manifest) }),
  });
  const data = await res.json();
  if (data.ok) {
    console.log(`✅ Success with ${label}!`);
    console.log('   Slash commands now live: /ask, /sms-report, /sms-scoreboard');
    return true;
  }
  console.log(`❌ Failed with ${label}: ${data.error}`);
  if (data.detail) console.log('   Detail:', data.detail);
  return false;
};

// Try rotation token first, then bot token
const tokens = [
  [rotationToken, 'Slack CLI rotation token'],
  [env.SLACK_BOT_TOKEN, 'bot token'],
];

let success = false;
for (const [token, label] of tokens) {
  if (!token) { console.log(`⏭  Skipping ${label} (not set)`); continue; }
  success = await tryUpdate(token, label);
  if (success) break;
}

if (!success) {
  console.log('\n⚠️  Could not update via API. The manifest needs a user token with apps:write scope.');
  console.log('\nTo push manually:');
  console.log('1. Go to https://api.slack.com/apps/A0AFCE7ENE5/app-manifest');
  console.log('2. Replace the manifest with the content of sms-insights/manifest.json');
  console.log('3. Click "Save Changes"');
}
