import type { Logger } from '@slack/bolt';
import { VALID_CALL_OUTCOMES, type CallOutcome } from './inbox-store.js';
import { getPrismaClient } from './prisma.js';

const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'back',
  'been',
  'but',
  'can',
  'could',
  'from',
  'get',
  'had',
  'has',
  'have',
  'hey',
  'his',
  'how',
  'into',
  'just',
  'like',
  'maybe',
  'more',
  'need',
  'not',
  'now',
  'our',
  'out',
  'really',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'too',
  'want',
  'what',
  'when',
  'with',
  'would',
  'you',
  'your',
]);

export type OutcomeKeywordConversationRow = {
  conversationId: string;
  outcome: CallOutcome;
  body: string;
};

export type OutcomeKeywordInsight = {
  phrase: string;
  phraseWords: number;
  conversations: number;
  outcomeConversations: number;
  overallPct: number;
  outcomePct: number;
  lift: number;
  sampleMessage: string | null;
};

export type OutcomeKeywordAnalyticsResult = {
  generatedAt: string;
  window: {
    from: string;
    to: string;
  };
  totals: {
    conversations: number;
    byOutcome: Record<CallOutcome, number>;
  };
  outcomes: Array<{
    outcome: CallOutcome;
    conversationCount: number;
    topKeywords: OutcomeKeywordInsight[];
  }>;
};

type BuildOptions = {
  minConversations?: number;
  limitPerOutcome?: number;
  minWords?: number;
  maxWords?: number;
};

const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
};

const extractPhrases = (text: string, minWords: number, maxWords: number): Set<string> => {
  const tokens = tokenize(text);
  const phrases = new Set<string>();
  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = minWords; size <= maxWords; size += 1) {
      if (start + size > tokens.length) continue;
      phrases.add(tokens.slice(start, start + size).join(' '));
    }
  }
  return phrases;
};

export const buildOutcomeKeywordAnalytics = (
  rows: OutcomeKeywordConversationRow[],
  options: BuildOptions = {},
): OutcomeKeywordAnalyticsResult => {
  const minConversations = options.minConversations ?? 2;
  const limitPerOutcome = options.limitPerOutcome ?? 12;
  const minWords = options.minWords ?? 1;
  const maxWords = options.maxWords ?? 2;

  const outcomeConversationSets = new Map<CallOutcome, Set<string>>();
  const phraseConversationSets = new Map<string, Set<string>>();
  const phraseOutcomeConversationSets = new Map<string, Map<CallOutcome, Set<string>>>();
  const sampleByPhraseOutcome = new Map<string, string>();

  for (const row of rows) {
    const phrases = extractPhrases(row.body, minWords, maxWords);
    if (phrases.size === 0) continue;

    const outcomeConversations = outcomeConversationSets.get(row.outcome) || new Set<string>();
    outcomeConversations.add(row.conversationId);
    outcomeConversationSets.set(row.outcome, outcomeConversations);

    for (const phrase of phrases) {
      const globalSet = phraseConversationSets.get(phrase) || new Set<string>();
      globalSet.add(row.conversationId);
      phraseConversationSets.set(phrase, globalSet);

      const byOutcome = phraseOutcomeConversationSets.get(phrase) || new Map<CallOutcome, Set<string>>();
      const outcomeSet = byOutcome.get(row.outcome) || new Set<string>();
      outcomeSet.add(row.conversationId);
      byOutcome.set(row.outcome, outcomeSet);
      phraseOutcomeConversationSets.set(phrase, byOutcome);

      const sampleKey = `${row.outcome}::${phrase}`;
      if (!sampleByPhraseOutcome.has(sampleKey)) {
        sampleByPhraseOutcome.set(sampleKey, row.body.trim().slice(0, 240));
      }
    }
  }

  const totalConversations = new Set(rows.map((row) => row.conversationId)).size;
  const totalsByOutcome = Object.fromEntries(
    VALID_CALL_OUTCOMES.map((outcome) => [outcome, outcomeConversationSets.get(outcome)?.size || 0]),
  ) as Record<CallOutcome, number>;

  const outcomes = VALID_CALL_OUTCOMES.map((outcome) => {
    const conversationCount = outcomeConversationSets.get(outcome)?.size || 0;
    const topKeywords = [...phraseOutcomeConversationSets.entries()]
      .map(([phrase, byOutcome]): OutcomeKeywordInsight | null => {
        const overallConversations = phraseConversationSets.get(phrase)?.size || 0;
        const outcomeConversations = byOutcome.get(outcome)?.size || 0;
        if (overallConversations < minConversations || outcomeConversations < minConversations || conversationCount === 0) {
          return null;
        }

        const overallPct = totalConversations > 0 ? overallConversations / totalConversations : 0;
        const outcomePct = conversationCount > 0 ? outcomeConversations / conversationCount : 0;
        const lift = overallPct > 0 ? outcomePct / overallPct : 0;

        return {
          phrase,
          phraseWords: phrase.split(' ').length,
          conversations: overallConversations,
          outcomeConversations,
          overallPct,
          outcomePct,
          lift,
          sampleMessage: sampleByPhraseOutcome.get(`${outcome}::${phrase}`) || null,
        };
      })
      .filter((row): row is OutcomeKeywordInsight => Boolean(row))
      .sort((a, b) => {
        if (b.lift !== a.lift) return b.lift - a.lift;
        if (b.outcomePct !== a.outcomePct) return b.outcomePct - a.outcomePct;
        if (b.outcomeConversations !== a.outcomeConversations) return b.outcomeConversations - a.outcomeConversations;
        return a.phrase.localeCompare(b.phrase);
      })
      .slice(0, limitPerOutcome);

    return {
      outcome,
      conversationCount,
      topKeywords,
    };
  }).filter((row) => row.conversationCount > 0);

  return {
    generatedAt: new Date().toISOString(),
    window: {
      from: '',
      to: '',
    },
    totals: {
      conversations: totalConversations,
      byOutcome: totalsByOutcome,
    },
    outcomes,
  };
};

export const getOutcomeKeywordAnalytics = async (
  params: {
    from: string;
    to: string;
    direction?: 'inbound' | 'outbound' | 'all';
    minConversations?: number;
    limitPerOutcome?: number;
    minWords?: number;
    maxWords?: number;
  },
  logger?: Pick<Logger, 'debug' | 'error'>,
): Promise<OutcomeKeywordAnalyticsResult> => {
  const prisma = getPrismaClient();
  const directionFilter =
    params.direction === 'all' || !params.direction ? '' : `AND e.direction = '${params.direction}'`;

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        conversation_id: string;
        call_outcome: CallOutcome;
        body: string;
      }>
    >(
      `
      SELECT
        e.conversation_id,
        s.call_outcome,
        e.body
      FROM sms_events e
      INNER JOIN conversation_state s
        ON s.conversation_id = e.conversation_id
      WHERE s.call_outcome IS NOT NULL
        AND e.body IS NOT NULL
        AND TRIM(e.body) != ''
        AND e.event_ts >= $1::timestamptz
        AND e.event_ts < $2::timestamptz
        ${directionFilter}
      `,
      params.from,
      params.to,
    );

    const analytics = buildOutcomeKeywordAnalytics(
      rows.map((row) => ({
        conversationId: row.conversation_id,
        outcome: row.call_outcome,
        body: row.body,
      })),
      {
        minConversations: params.minConversations,
        limitPerOutcome: params.limitPerOutcome,
        minWords: params.minWords,
        maxWords: params.maxWords,
      },
    );

    return {
      ...analytics,
      window: {
        from: params.from,
        to: params.to,
      },
    };
  } catch (error) {
    logger?.error?.('getOutcomeKeywordAnalytics failed', error);
    throw error;
  }
};
