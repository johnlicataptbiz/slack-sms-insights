#!/usr/bin/env node
/**
 * Aloware API Discovery Script
 * 
 * Tests the assumed Aloware API endpoints to verify they exist and return
 * the expected format before enabling the polling service in production.
 * 
 * Usage: npx tsx scripts/discover-aloware-api.ts
 */

import 'dotenv/config';

const getApiToken = (): string => {
  return (
    process.env.ALOWARE_API_TOKEN ||
    process.env.ALOWARE_WEBHOOK_API_TOKEN ||
    process.env.ALOWARE_FORM_API_TOKEN ||
    ''
  ).trim();
};

const getBaseUrl = (): string => {
  return (process.env.ALOWARE_BASE_URL || 'https://app.aloware.com').trim().replace(/\/$/, '');
};

type TestResult = {
  endpoint: string;
  status: 'pass' | 'fail' | 'unknown';
  statusCode?: number;
  responsePreview?: string;
  error?: string;
};

const results: TestResult[] = [];

const testEndpoint = async (path: string, description: string): Promise<TestResult> => {
  const token = getApiToken();
  const baseUrl = getBaseUrl();
  
  if (!token) {
    return {
      endpoint: path,
      status: 'unknown',
      error: 'ALOWARE_API_TOKEN not configured',
    };
  }

  const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}api_token=${token}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const text = await response.text();
    const preview = text.length > 500 ? text.slice(0, 500) + '...' : text;

    const result: TestResult = {
      endpoint: path,
      status: response.ok ? 'pass' : 'fail',
      statusCode: response.status,
      responsePreview: preview,
    };

    results.push(result);
    return result;
  } catch (error) {
    const result: TestResult = {
      endpoint: path,
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    };
    results.push(result);
    return result;
  }
};

// ─── Test Known Working Endpoints ────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Aloware API Discovery');
console.log('═══════════════════════════════════════════════════════\n');

console.log('Testing known working endpoints...\n');

await testEndpoint('/api/v1/webhook/contact/phone-number?phone_number=5551234567', 'Contact lookup by phone');
await testEndpoint('/api/v1/webhook/sms-gateway/send', 'SMS gateway (GET - should fail, tests endpoint exists)');

// ─── Test Assumed Polling Endpoint ───────────────────────────────────────────

console.log('\nTesting assumed polling endpoints...\n');

await testEndpoint('/api/v1/webhook/sms/events?limit=1', 'SMS events list (assumed)');
await testEndpoint('/api/v1/webhook/sms?limit=1', 'SMS list (alternate)');
await testEndpoint('/api/v1/sms/events?limit=1', 'SMS events v2 (alternate)');
await testEndpoint('/api/v1/messages?limit=1', 'Messages (alternate)');

// ─── Report ──────────────────────────────────────────────────────────────────

console.log('\n───────────────────────────────────────────────────────');
console.log('  Results');
console.log('───────────────────────────────────────────────────────\n');

for (const result of results) {
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${result.endpoint}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  } else if (result.statusCode) {
    console.log(`   Status: ${result.statusCode}`);
  }
  if (result.responsePreview) {
    console.log(`   Response: ${result.responsePreview.slice(0, 200)}`);
  }
  console.log();
}

const passCount = results.filter((r) => r.status === 'pass').length;
const failCount = results.filter((r) => r.status === 'fail').length;
const unknownCount = results.filter((r) => r.status === 'unknown').length;

console.log('───────────────────────────────────────────────────────');
console.log(`Summary: ${passCount} passed, ${failCount} failed, ${unknownCount} unknown`);
console.log('───────────────────────────────────────────────────────\n');

// ─── Recommendation ──────────────────────────────────────────────────────────

const smsEventsFound = results.find(
  (r) => r.endpoint.includes('sms/events') && r.status === 'pass'
);
const smsFound = results.find(
  (r) => r.endpoint.includes('/sms?') && r.status === 'pass'
);
const messagesFound = results.find(
  (r) => r.endpoint.includes('/messages') && r.status === 'pass'
);

if (smsEventsFound) {
  console.log('✅ RECOMMENDATION: The /api/v1/webhook/sms/events endpoint works.');
  console.log('   Enable ALOWARE_POLLING_ENABLED=true in production.');
} else if (smsFound) {
  console.log('⚠️  RECOMMENDATION: Found /api/v1/webhook/sms but not /sms/events.');
  console.log('   Update aloware-sms-poller.ts to use /api/v1/webhook/sms endpoint.');
} else if (messagesFound) {
  console.log('⚠️  RECOMMENDATION: Found /api/v1/messages endpoint.');
  console.log('   Update aloware-sms-poller.ts to use /api/v1/messages endpoint.');
} else {
  console.log('❌ RECOMMENDATION: No SMS polling endpoint found.');
  console.log('   The Slack-based ingestion path is the only working option.');
  console.log('   Ensure the Slack bot is in the correct Aloware channel.');
  console.log('   Verify ALOWARE_CHANNEL_ID matches the production channel.');
}

console.log('');
