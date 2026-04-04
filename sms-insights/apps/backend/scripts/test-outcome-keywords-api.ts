#!/usr/bin/env node

import 'dotenv/config';

type OutcomeKeywordResponse = {
  data?: {
    generatedAt: string;
    window: { from: string; to: string };
    totals: {
      conversations: number;
      byOutcome: Record<string, number>;
    };
    outcomes: Array<{
      outcome: string;
      conversationCount: number;
      topKeywords: Array<{
        phrase: string;
        conversations: number;
        outcomeConversations: number;
        overallPct: number;
        outcomePct: number;
        lift: number;
        sampleMessage: string | null;
      }>;
    }>;
  };
  error?: string;
  details?: string;
};

const baseUrl = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const range = process.env.OUTCOME_KEYWORDS_RANGE || '30d';
const tz = process.env.OUTCOME_KEYWORDS_TZ || 'America/Chicago';
const direction = process.env.OUTCOME_KEYWORDS_DIRECTION || 'inbound';
const minConversations = process.env.OUTCOME_KEYWORDS_MIN_CONVERSATIONS || '2';
const limitPerOutcome = process.env.OUTCOME_KEYWORDS_LIMIT || '8';
const minWords = process.env.OUTCOME_KEYWORDS_MIN_WORDS || '1';
const maxWords = process.env.OUTCOME_KEYWORDS_MAX_WORDS || '2';

const url = new URL(`${baseUrl}/api/v2/admin/analytics/outcome-keywords`);
url.searchParams.set('range', range);
url.searchParams.set('tz', tz);
url.searchParams.set('direction', direction);
url.searchParams.set('minConversations', minConversations);
url.searchParams.set('limitPerOutcome', limitPerOutcome);
url.searchParams.set('minWords', minWords);
url.searchParams.set('maxWords', maxWords);

const formatPct = (value: number): string => `${(value * 100).toFixed(1)}%`;

async function run(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Outcome Keyword Analytics');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`URL: ${url.toString()}\n`);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  const payload = (await response.json()) as OutcomeKeywordResponse;

  if (!response.ok || !payload.data) {
    console.error('❌ Request failed');
    console.error(payload.error || response.statusText);
    if (payload.details) console.error(payload.details);
    process.exit(1);
  }

  const { data } = payload;

  console.log(`Generated: ${data.generatedAt}`);
  console.log(`Window: ${data.window.from} → ${data.window.to}`);
  console.log(`Conversations analyzed: ${data.totals.conversations}\n`);

  for (const outcome of data.outcomes) {
    console.log(`\n${outcome.outcome.toUpperCase()} (${outcome.conversationCount} conversations)`);
    if (outcome.topKeywords.length === 0) {
      console.log('  No qualifying phrases found.');
      continue;
    }

    for (const keyword of outcome.topKeywords) {
      console.log(
        `  - ${keyword.phrase} | outcome ${keyword.outcomeConversations}/${outcome.conversationCount} (${formatPct(
          keyword.outcomePct,
        )}) | overall ${keyword.conversations}/${data.totals.conversations} (${formatPct(keyword.overallPct)}) | lift ${keyword.lift.toFixed(2)}x`,
      );
      if (keyword.sampleMessage) {
        console.log(`    sample: ${keyword.sampleMessage}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

run().catch((error) => {
  console.error(
    '❌ Failed to fetch outcome keyword analytics:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
