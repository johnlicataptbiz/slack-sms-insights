/**
 * push-manifest.ts
 * Exports the live Slack app manifest, merges our slash commands into it,
 * and pushes the update back via apps.manifest.update.
 *
 * Requires: SLACK_BOT_TOKEN and SLACK_USER_TOKEN in .env
 * (apps.manifest.update needs a user token with apps:write scope)
 */
import 'dotenv/config';

const APP_ID = 'A0AFCE7ENE5';

// apps.manifest.update requires a user token — fall back to bot token for export
const userToken = process.env.SLACK_USER_TOKEN?.trim();
const botToken = process.env.SLACK_BOT_TOKEN?.trim();

if (!botToken) {
  console.error('❌ SLACK_BOT_TOKEN not set');
  process.exit(1);
}

// ── Step 1: Export the live manifest ─────────────────────────────────────────
console.log('📥 Exporting live manifest from Slack…');
const exportRes = await fetch('https://slack.com/api/apps.manifest.export', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `Bearer ${userToken ?? botToken}`,
  },
  body: JSON.stringify({ app_id: APP_ID }),
});

const exportData = (await exportRes.json()) as { ok: boolean; manifest?: Record<string, unknown>; error?: string };

if (!exportData.ok) {
  console.error('❌ Export failed:', exportData.error);
  console.log('ℹ️  Note: apps.manifest.export requires a user token with apps:write scope.');
  console.log('   Set SLACK_USER_TOKEN in .env and retry.');
  process.exit(1);
}

const manifest = exportData.manifest as Record<string, unknown>;
console.log('✅ Manifest exported');

// ── Step 2: Merge slash commands ──────────────────────────────────────────────
const slashCommands = [
  {
    command: '/ask',
    description: 'Ask the SMS Insights bot a question or request analytics',
    usage_hint: '[question or analytics query]',
    should_escape: false,
  },
  {
    command: '/sms-report',
    description: 'Generate a rich daily SMS report with interactive buttons',
    usage_hint: '[today | yesterday | YYYY-MM-DD]',
    should_escape: false,
  },
  {
    command: '/sms-scoreboard',
    description: 'Post the weekly setter scoreboard to #alowaresmsupdates',
    usage_hint: '',
    should_escape: false,
  },
];

const features = (manifest.features ?? {}) as Record<string, unknown>;
const existingCommands = (features.slash_commands ?? []) as Array<{ command: string }>;

// Merge: keep existing commands that aren't in our list, then add ours
const merged = [
  ...existingCommands.filter(
    (c) => !slashCommands.some((sc) => sc.command === c.command),
  ),
  ...slashCommands,
];

manifest.features = { ...features, slash_commands: merged };

console.log(`✅ Merged ${merged.length} slash commands:`, merged.map((c) => c.command).join(', '));

// ── Step 3: Push the updated manifest ────────────────────────────────────────
if (!userToken) {
  console.warn('⚠️  SLACK_USER_TOKEN not set — skipping push (apps.manifest.update requires user token)');
  console.log('\nUpdated manifest (copy into Slack App Config UI → App Manifest):');
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

console.log('📤 Pushing updated manifest to Slack…');
const updateRes = await fetch('https://slack.com/api/apps.manifest.update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `Bearer ${userToken}`,
  },
  body: JSON.stringify({ app_id: APP_ID, manifest: JSON.stringify(manifest) }),
});

const updateData = (await updateRes.json()) as { ok: boolean; error?: string; warnings?: string[] };

if (!updateData.ok) {
  console.error('❌ Update failed:', updateData.error);
  console.log('\nFull manifest for manual paste:');
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(1);
}

if (updateData.warnings?.length) {
  console.warn('⚠️  Warnings:', updateData.warnings.join(', '));
}

console.log('✅ Manifest updated successfully!');
console.log('   Slash commands now live: /ask, /sms-report, /sms-scoreboard');
process.exit(0);
