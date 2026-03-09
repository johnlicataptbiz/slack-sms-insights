import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export type ChangelogEntryType = 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';

export type ChangelogEntry = {
  hash: string;
  date: string;
  message: string;
  author: string;
  type: ChangelogEntryType;
  category: string;
  description: string;
};

export type ChangelogStats = {
  features: number;
  fixes: number;
  refactors: number;
  docs: number;
  other: number;
};

export type ChangelogTimeline = {
  entries: ChangelogEntry[];
  totalCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  stats: ChangelogStats;
};

// Keywords that indicate commit type
const TYPE_KEYWORDS: Record<ChangelogEntryType, string[]> = {
  feature: ['feat', 'feature', 'add', 'implement', 'new', 'introduce', 'create'],
  fix: ['fix', 'bugfix', 'hotfix', 'resolve', 'patch', 'correct', 'repair'],
  refactor: ['refactor', 'rewrite', 'restructure', 'optimize', 'improve', 'enhance', 'clean', 'simplify'],
  style: ['style', 'ui', 'design', 'css', 'visual', 'layout', 'format', 'styling'],
  docs: ['docs', 'documentation', 'readme', 'comment', 'guide', 'doc'],
  chore: ['chore', 'deps', 'dependency', 'update', 'bump', 'upgrade', 'maint', 'maintenance'],
  other: []
};

// Category patterns for grouping
const CATEGORY_PATTERNS: Record<string, string[]> = {
  'Database': ['database', 'db', 'prisma', 'migration', 'schema', 'table', 'postgres', 'sql'],
  'Dashboard': ['dashboard', 'v2', 'sequences', 'inbox', 'analytics', 'metrics', 'kpi', 'chart'],
  'AI & ML': ['ai', 'ml', 'openai', 'gpt', 'draft', 'suggestion', 'inference', 'qualification', 'smart'],
  'Integrations': ['slack', 'monday', 'aloware', 'integration', 'sync', 'webhook', 'api'],
  'Authentication': ['auth', 'login', 'password', 'session', 'csrf', 'security', 'verify'],
  'Performance': ['perf', 'performance', 'cache', 'speed', 'optimize', 'fast', 'slow'],
  'Infrastructure': ['deploy', 'railway', 'vercel', 'docker', 'infra', 'build', 'ci', 'cd'],
  'Bug Fixes': ['fix', 'bug', 'error', 'crash', 'broken', 'issue', 'problem'],
  'UI/UX': ['ui', 'ux', 'design', 'layout', 'style', 'component', 'modal', 'panel', 'button'],
  'Data Pipeline': ['pipeline', 'ingest', 'backfill', 'etl', 'sync', 'import', 'export']
};

/**
 * Determine commit type based on message keywords
 */
function determineType(message: string): ChangelogEntryType {
  const lowerMessage = message.toLowerCase();
  
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === 'other') continue;
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return type as ChangelogEntryType;
      }
    }
  }
  
  return 'other';
}

/**
 * Determine category based on message content
 */
function determineCategory(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        return category;
      }
    }
  }
  
  return 'General';
}

/**
 * Clean and format commit message for display
 */
function formatDescription(message: string): string {
  // Remove conventional commit prefix (e.g., "feat:", "fix:", etc.)
  let cleaned = message.replace(/^[a-z]+(\([^)]+\))?:\s*/i, '');
  
  // Remove issue references
  cleaned = cleaned.replace(/#\d+/g, '');
  
  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Trim and limit length
  cleaned = cleaned.trim();
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 117) + '...';
  }
  
  return cleaned;
}

/**
 * Parse git log and generate changelog entries
 */
export function generateChangelog(days: number = 365): ChangelogTimeline {
  try {
    const repoRoot = resolve(process.cwd(), '..');
    const gitDir = resolve(repoRoot, '.git');
    
    if (!existsSync(gitDir)) {
      throw new Error('Git repository not found');
    }
    
    // Get git log with format: hash|date|author|message
    const format = '%H|%aI|%an|%s';
    const since = days > 0 ? `--since="${days} days ago"` : '';
    const command = `git log ${since} --pretty=format:"${format}" --no-merges`;
    
    const output = execSync(command, {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large histories
    });
    
    const lines = output.trim().split('\n').filter(Boolean);
    const entries: ChangelogEntry[] = [];
    const stats: ChangelogStats = {
      features: 0,
      fixes: 0,
      refactors: 0,
      docs: 0,
      other: 0
    };
    
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 4) continue;
      
      const [hash, dateStr, author, ...messageParts] = parts;
      const message = messageParts.join('|'); // Rejoin in case message had pipes
      
      const date = new Date(dateStr);
      
      // Track date range
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
      
      const type = determineType(message);
      const category = determineCategory(message);
      const description = formatDescription(message);
      
      // Update stats
      const statKey = type === 'feature' ? 'features' : 
                     type === 'fix' ? 'fixes' : 
                     type === 'refactor' ? 'refactors' : 
                     type === 'docs' ? 'docs' : 'other';
      stats[statKey]++;
      
      entries.push({
        hash: hash.substring(0, 7),
        date: date.toISOString(),
        author,
        message,
        type,
        category,
        description
      });
    }
    
    return {
      entries,
      totalCount: entries.length,
      dateRange: {
        from: earliestDate?.toISOString() || new Date().toISOString(),
        to: latestDate?.toISOString() || new Date().toISOString()
      },
      stats
    };
    
  } catch (error) {
    console.error('Failed to generate changelog:', error);
    
    // Return empty timeline on error
    return {
      entries: [],
      totalCount: 0,
      dateRange: {
        from: new Date().toISOString(),
        to: new Date().toISOString()
      },
      stats: {
        features: 0,
        fixes: 0,
        refactors: 0,
        docs: 0,
        other: 0
      }
    };
  }
}

/**
 * Get changelog grouped by date
 */
export function getChangelogGroupedByDate(days: number = 365): Array<{
  date: string;
  entries: ChangelogEntry[];
}> {
  const timeline = generateChangelog(days);
  
  const grouped = new Map<string, ChangelogEntry[]>();
  
  for (const entry of timeline.entries) {
    const dateKey = entry.date.split('T')[0]; // YYYY-MM-DD
    
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    
    grouped.get(dateKey)!.push(entry);
  }
  
  // Convert to array and sort by date (newest first)
  return Array.from(grouped.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get changelog filtered by type
 */
export function getChangelogByType(type: ChangelogEntryType, days: number = 365): ChangelogEntry[] {
  const timeline = generateChangelog(days);
  return timeline.entries.filter(entry => entry.type === type);
}

/**
 * Get changelog by date range (for API endpoint)
 */
export async function getChangelogByDateRange(params: {
  days: number;
  logger?: Pick<import('@slack/bolt').Logger, 'debug' | 'warn'>;
}): Promise<ChangelogTimeline> {
  const { days, logger } = params;
  
  logger?.debug?.('[changelog] Generating timeline', { days });
  
  const timeline = generateChangelog(days);
  
  logger?.debug?.('[changelog] Generated timeline', { 
    totalCount: timeline.totalCount,
    dateRange: timeline.dateRange 
  });
  
  return timeline;
}

/**
 * Get changelog timeline (alias for getChangelogByDateRange)
 */
export async function getChangelogTimeline(params: {
  days: number;
  logger?: Pick<import('@slack/bolt').Logger, 'debug' | 'warn'>;
}): Promise<ChangelogTimeline> {
  return getChangelogByDateRange(params);
}

/**
 * Get recent changes summary (last 7 days)
 */
export function getRecentChangesSummary(): {
  total: number;
  features: number;
  fixes: number;
  highlights: string[];
} {
  const timeline = generateChangelog(7);
  
  const features = timeline.entries.filter(e => e.type === 'feature');
  const fixes = timeline.entries.filter(e => e.type === 'fix');
  
  // Get top 3 most significant recent changes
  const highlights = timeline.entries
    .slice(0, 5)
    .map(e => e.description);
  
  return {
    total: timeline.entries.length,
    features: features.length,
    fixes: fixes.length,
    highlights
  };
}
