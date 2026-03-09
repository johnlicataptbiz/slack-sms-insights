import { execSync } from 'node:child_process';
import type { Logger } from '@slack/bolt';

export type ChangelogEntry = {
  hash: string;
  date: string;
  message: string;
  author: string;
  type: 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';
  category: string;
  description: string;
};

export type ChangelogTimeline = {
  entries: ChangelogEntry[];
  totalCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  stats: {
    features: number;
    fixes: number;
    refactors: number;
    docs: number;
    other: number;
  };
};

const parseCommitType = (message: string): ChangelogEntry['type'] => {
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.startsWith('feat') || lowerMsg.includes('add ') || lowerMsg.includes('implement')) return 'feature';
  if (lowerMsg.startsWith('fix')) return 'fix';
  if (lowerMsg.startsWith('refactor')) return 'refactor';
  if (lowerMsg.startsWith('style')) return 'style';
  if (lowerMsg.startsWith('docs')) return 'docs';
  if (lowerMsg.startsWith('chore')) return 'chore';
  return 'other';
};

const extractCategory = (message: string): string => {
  // Extract category from scope in parentheses or common keywords
  const scopeMatch = message.match(/\(([^)]+)\)/);
  if (scopeMatch) return scopeMatch[1];
  
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('inbox')) return 'Inbox';
  if (lowerMsg.includes('sequence')) return 'Sequences';
  if (lowerMsg.includes('dashboard')) return 'Dashboard';
  if (lowerMsg.includes('analytics')) return 'Analytics';
  if (lowerMsg.includes('crm')) return 'CRM';
  if (lowerMsg.includes('monday')) return 'Monday.com';
  if (lowerMsg.includes('prisma') || lowerMsg.includes('database') || lowerMsg.includes('db')) return 'Database';
  if (lowerMsg.includes('qualification')) return 'Qualification';
  if (lowerMsg.includes('draft') || lowerMsg.includes('ai')) return 'AI/Drafts';
  if (lowerMsg.includes('auth') || lowerMsg.includes('password') || lowerMsg.includes('login')) return 'Auth';
  if (lowerMsg.includes('deploy') || lowerMsg.includes('vercel') || lowerMsg.includes('railway')) return 'Infrastructure';
  
  return 'General';
};

const cleanMessage = (message: string): string => {
  // Remove conventional commit prefix
  return message
    .replace(/^(feat|fix|refactor|style|docs|chore|test)(\([^)]+\))?:\s*/i, '')
    .replace(/^Stage all changes:\s*/i, '')
    .trim();
};

export const getChangelogTimeline = async (params?: {
  limit?: number;
  fromDate?: string;
  toDate?: string;
  logger?: Pick<Logger, 'debug' | 'warn'>;
}): Promise<ChangelogTimeline> => {
  const { limit = 100, fromDate, toDate, logger } = params || {};
  
  try {
    // Build git log command
    let cmd = `git log --all --author="jack" --author="Jack" --author="licata" --pretty=format:"%h|%ad|%s|%an" --date=short -n ${limit}`;
    
    if (fromDate) {
      cmd += ` --since="${fromDate}"`;
    }
    if (toDate) {
      cmd += ` --until="${toDate}"`;
    }
    
    logger?.debug?.('[changelog] Executing git command');
    
    const output = execSync(cmd, { 
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000 
    });
    
    const lines = output.trim().split('\n').filter(Boolean);
    
    const entries: ChangelogEntry[] = lines.map(line => {
      const [hash, date, message, author] = line.split('|');
      
      return {
        hash: hash || '',
        date: date || '',
        message: message || '',
        author: author || 'Jack Licata',
        type: parseCommitType(message || ''),
        category: extractCategory(message || ''),
        description: cleanMessage(message || ''),
      };
    });
    
    // Calculate stats
    const stats = {
      features: entries.filter(e => e.type === 'feature').length,
      fixes: entries.filter(e => e.type === 'fix').length,
      refactors: entries.filter(e => e.type === 'refactor').length,
      docs: entries.filter(e => e.type === 'docs').length,
      other: entries.filter(e => !['feature', 'fix', 'refactor', 'docs'].includes(e.type)).length,
    };
    
    const dates = entries.map(e => e.date).filter(Boolean);
    
    return {
      entries,
      totalCount: entries.length,
      dateRange: {
        from: dates[dates.length - 1] || '',
        to: dates[0] || '',
      },
      stats,
    };
    
  } catch (error) {
    logger?.warn?.('[changelog] Failed to fetch git history:', error);
    throw new Error('Failed to fetch changelog from git history');
  }
};

export const getChangelogByDateRange = async (params: {
  days: number;
  logger?: Pick<Logger, 'debug' | 'warn'>;
}): Promise<ChangelogTimeline> => {
  const { days, logger } = params;
  
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  return getChangelogTimeline({ fromDate, toDate, limit: 200, logger });
};

export const getChangelogGroupedByDate = (timeline: ChangelogTimeline): Array<{
  date: string;
  entries: ChangelogEntry[];
}> => {
  const grouped = new Map<string, ChangelogEntry[]>();
  
  for (const entry of timeline.entries) {
    const existing = grouped.get(entry.date) || [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }
  
  // Sort by date descending
  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }));
};
