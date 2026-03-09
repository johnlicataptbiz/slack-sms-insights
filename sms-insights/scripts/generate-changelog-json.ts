#!/usr/bin/env tsx
/**
 * Build-time changelog generator
 * 
 * This script runs during the build process to generate a static changelog.json
 * file from git history. This is necessary because Railway deployments don't
 * include the .git directory, so we can't read commit history at runtime.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

type ChangelogEntryType = 'feature' | 'fix' | 'refactor' | 'style' | 'docs' | 'chore' | 'other';

interface ChangelogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
  type: ChangelogEntryType;
  category: string;
  description: string;
}

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
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return type as ChangelogEntryType;
      }
    }
  }
  
  return 'other';
}

/**
 * Determine category based on message patterns
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
  // Remove common prefixes
  let cleaned = message
    .replace(/^(feat|fix|docs|style|refactor|test|chore|ci|build|perf)(\([^)]*\))?:\s*/i, '')
    .replace(/^[:\s]+/, '');
  
  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Truncate if too long
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 97) + '...';
  }
  
  return cleaned;
}

/**
 * Generate changelog from git history
 */
function generateChangelog(days: number = 365): ChangelogEntry[] {
  try {
    // Get git log with format: hash|date|author|message
    const format = '%H|%aI|%an|%s';
    const since = days > 0 ? `--since="${days} days ago"` : '';
    const command = `git log ${since} --pretty=format:"${format}" --no-merges`;
    
    const output = execSync(command, { 
      encoding: 'utf-8',
      cwd: resolve(__dirname, '../..') // Run from repo root
    });
    
    if (!output.trim()) {
      console.warn('[changelog-generator] No git history found');
      return [];
    }
    
    const entries: ChangelogEntry[] = [];
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 4) continue;
      
      const [hash, date, author, ...messageParts] = parts;
      const message = messageParts.join('|'); // Rejoin in case message had pipes
      
      const type = determineType(message);
      const category = determineCategory(message);
      const description = formatDescription(message);
      
      entries.push({
        hash: hash.substring(0, 7), // Short hash
        date,
        message,
        author,
        type,
        category,
        description
      });
    }
    
    return entries;
  } catch (error) {
    console.error('[changelog-generator] Error generating changelog:', error);
    return [];
  }
}

/**
 * Main execution
 */
function main() {
  console.log('[changelog-generator] Generating changelog.json...');
  
  // Generate 365 days of history
  const entries = generateChangelog(365);
  
  if (entries.length === 0) {
    console.warn('[changelog-generator] No entries generated, skipping file creation');
    process.exit(0);
  }
  
  // Write to file
  const outputPath = resolve(__dirname, '../changelog.json');
  const data = {
    generatedAt: new Date().toISOString(),
    daysIncluded: 365,
    totalCount: entries.length,
    entries
  };
  
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log(`[changelog-generator] Generated ${entries.length} entries`);
  console.log(`[changelog-generator] Written to: ${outputPath}`);
  
  // Print summary
  const typeCounts = entries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('[changelog-generator] Summary by type:');
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  - ${type}: ${count}`);
  }
}

main();
