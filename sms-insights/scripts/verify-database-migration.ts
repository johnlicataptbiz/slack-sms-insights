#!/usr/bin/env node
/**
 * Database Migration Verification Script
 * 
 * This script verifies schema compatibility and data integrity
 * when migrating from the old Prisma DB to the new ptbizsms DB.
 * 
 * Usage:
 *   npx tsx scripts/verify-database-migration.ts
 *   PRISMA_ACCELERATE_URL=source_url npx tsx scripts/verify-database-migration.ts
 */

import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import 'dotenv/config';
import { writeFileSync } from 'fs';

// Target database connection string (new ptbizsms DB) - Prisma Accelerate URL
const TARGET_DB_URL = 'prisma+postgres://accelerate.prisma-data.net/?api_key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqd3RfaWQiOjEsInNlY3VyZV9rZXkiOiJza19UZU91SFc2YXhWY2prdktCSnIwM2EiLCJhcGlfa2V5IjoiMDFLSlIwNEFCUDU2QVJTUEI5NjRONDVUWUMiLCJ0ZW5hbnRfaWQiOiIwN2I0YzI2N2Y1OTUxMzI5MmVjZWE3ZjA5MjE3ZjkxMzA1M2RkZDk5NzJjM2YyMWVlYzU2YmY2NWU5YmRlMGEzIiwiaW50ZXJuYWxfc2VjcmV0IjoiNmRmZmU2OTktM2Y0ZS00NjI5LTlkNjQtZTNkMjkwMWVkZjRjIn0.EKV8VtER27iSUZtBoQhp2rxj7G5rz_5tQMOOGwn9GkM';

// Source database connection string (current/old DB) - from environment
const SOURCE_DB_URL = process.env.PRISMA_ACCELERATE_URL || process.env.DATABASE_URL;

// Critical tables that must exist in the new database
const CRITICAL_TABLES = [
  'conversations',
  'conversation_state',
  'sms_events',
  'booked_calls',
  'booked_call_attribution',
  'lead_outcomes',
  'lead_attribution',
  'monday_call_snapshots',
  'monday_board_registry',
  'daily_runs',
  'work_items',
  'inbox_contact_profiles',
  'draft_suggestions',
  'send_attempts',
  'sequence_version_decisions',
  'setter_activity',
  'conversion_examples',
  'message_templates',
  'user_send_preferences',
  'goals',
  'trend_alerts',
  'audit_logs',
];

// Tables with qualification data
const QUALIFICATION_TABLES = [
  'conversation_state',
  'inbox_contact_profiles',
];

type TableCount = {
  tableName: string;
  rowCount: number;
  hasData: boolean;
};

type SchemaCheck = {
  tableName: string;
  exists: boolean;
  columns: string[];
  missingColumns: string[];
};

type VerificationResult = {
  timestamp: string;
  sourceDb: string;
  targetDb: string;
  schemaCompatible: boolean;
  dataIntegrity: boolean;
  criticalIssues: string[];
  warnings: string[];
  tableCounts: {
    source: TableCount[];
    target: TableCount[];
  };
  schemaChecks: {
    source: SchemaCheck[];
    target: SchemaCheck[];
  };
  qualificationDataCheck: {
    hasQualificationData: boolean;
    sampleConversations: number;
    sampleStates: number;
  };
};

/**
 * Create a Prisma client for Prisma Accelerate
 */
function createPrismaClient(accelerateUrl: string): PrismaClient {
  // @ts-ignore - Prisma 7 uses accelerateUrl
  return (new PrismaClient({ accelerateUrl }) as any).$extends(withAccelerate()) as unknown as PrismaClient;
}

/**
 * Get row count for a table using raw query
 */
async function getTableCount(prisma: PrismaClient, tableName: string): Promise<number> {
  try {
    const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error(`Error counting rows in ${tableName}:`, error);
    return -1;
  }
}

/**
 * Check if a table exists in the database
 */
async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) as exists
      `,
      tableName
    );
    return result[0]?.exists || false;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Get column names for a table
 */
async function getTableColumns(prisma: PrismaClient, tableName: string): Promise<string[]> {
  try {
    const result = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1
      ORDER BY ordinal_position
      `,
      tableName
    );
    return result.map(r => r.column_name);
  } catch (error) {
    console.error(`Error getting columns for ${tableName}:`, error);
    return [];
  }
}

/**
 * Check qualification data in conversation_state table
 */
async function checkQualificationData(prisma: PrismaClient): Promise<{
  hasQualificationData: boolean;
  sampleConversations: number;
  sampleStates: number;
}> {
  try {
    // Check if there are conversations with qualification data
    const convResult = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `
      SELECT COUNT(*) as count 
      FROM conversation_state 
      WHERE qualification_full_or_part_time != 'unknown'
         OR qualification_revenue_mix != 'unknown'
         OR qualification_coaching_interest != 'unknown'
         OR qualification_niche IS NOT NULL
      `
    );
    
    const sampleConversations = Number(convResult[0]?.count || 0);
    
    // Check total conversation states
    const totalResult = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM conversation_state`
    );
    
    const sampleStates = Number(totalResult[0]?.count || 0);
    
    return {
      hasQualificationData: sampleConversations > 0,
      sampleConversations,
      sampleStates,
    };
  } catch (error) {
    console.error('Error checking qualification data:', error);
    return {
      hasQualificationData: false,
      sampleConversations: 0,
      sampleStates: 0,
    };
  }
}

/**
 * Verify schema compatibility between source and target databases
 */
async function verifySchemaCompatibility(
  sourcePrisma: PrismaClient,
  targetPrisma: PrismaClient
): Promise<{ compatible: boolean; sourceChecks: SchemaCheck[]; targetChecks: SchemaCheck[]; issues: string[] }> {
  const issues: string[] = [];
  const sourceChecks: SchemaCheck[] = [];
  const targetChecks: SchemaCheck[] = [];
  
  console.log('🔍 Checking schema compatibility...\n');
  
  for (const tableName of CRITICAL_TABLES) {
    console.log(`Checking table: ${tableName}`);
    
    // Check source
    const sourceExists = await tableExists(sourcePrisma, tableName);
    const sourceColumns = sourceExists ? await getTableColumns(sourcePrisma, tableName) : [];
    const sourceCheck: SchemaCheck = {
      tableName,
      exists: sourceExists,
      columns: sourceColumns,
      missingColumns: [],
    };
    sourceChecks.push(sourceCheck);
    
    // Check target
    const targetExists = await tableExists(targetPrisma, tableName);
    const targetColumns = targetExists ? await getTableColumns(targetPrisma, tableName) : [];
    const targetCheck: SchemaCheck = {
      tableName,
      exists: targetExists,
      columns: targetColumns,
      missingColumns: [],
    };
    targetChecks.push(targetCheck);
    
    // Compare
    if (!sourceExists && !targetExists) {
      console.log(`  ⚠️  Table ${tableName} doesn't exist in either database`);
      issues.push(`Table ${tableName} missing from both databases`);
    } else if (!sourceExists) {
      console.log(`  ⚠️  Table ${tableName} only exists in target (new data)`);
    } else if (!targetExists) {
      console.log(`  ❌ Table ${tableName} missing from TARGET database - CRITICAL`);
      issues.push(`CRITICAL: Table ${tableName} missing from target database`);
    } else {
      // Both exist, check columns
      const missingInTarget = sourceColumns.filter(col => !targetColumns.includes(col));
      const missingInSource = targetColumns.filter(col => !sourceColumns.includes(col));
      
      if (missingInTarget.length > 0) {
        console.log(`  ⚠️  Columns missing in target: ${missingInTarget.join(', ')}`);
        issues.push(`Table ${tableName}: columns missing in target - ${missingInTarget.join(', ')}`);
      }
      
      if (missingInSource.length > 0) {
        console.log(`  ℹ️  New columns in target: ${missingInSource.join(', ')}`);
      }
      
      if (missingInTarget.length === 0 && missingInSource.length === 0) {
        console.log(`  ✅ Schema matches`);
      }
    }
    
    console.log('');
  }
  
  const compatible = !issues.some(i => i.startsWith('CRITICAL'));
  
  return { compatible, sourceChecks, targetChecks, issues };
}

/**
 * Verify data integrity by comparing row counts
 */
async function verifyDataIntegrity(
  sourcePrisma: PrismaClient,
  targetPrisma: PrismaClient
): Promise<{ integrity: boolean; sourceCounts: TableCount[]; targetCounts: TableCount[]; issues: string[] }> {
  const issues: string[] = [];
  const sourceCounts: TableCount[] = [];
  const targetCounts: TableCount[] = [];
  
  console.log('📊 Checking data integrity (row counts)...\n');
  
  for (const tableName of CRITICAL_TABLES) {
    const sourceCount = await getTableCount(sourcePrisma, tableName);
    const targetCount = await getTableCount(targetPrisma, tableName);
    
    sourceCounts.push({
      tableName,
      rowCount: sourceCount,
      hasData: sourceCount > 0,
    });
    
    targetCounts.push({
      tableName,
      rowCount: targetCount,
      hasData: targetCount > 0,
    });
    
    if (sourceCount === -1 || targetCount === -1) {
      console.log(`${tableName}: Error reading one or both databases`);
      issues.push(`Error reading table ${tableName}`);
    } else if (sourceCount === 0 && targetCount === 0) {
      console.log(`${tableName}: Empty in both databases`);
    } else if (sourceCount > 0 && targetCount === 0) {
      console.log(`❌ ${tableName}: ${sourceCount.toLocaleString()} rows in source, EMPTY in target - CRITICAL`);
      issues.push(`CRITICAL: Table ${tableName} has no data in target but ${sourceCount} rows in source`);
    } else if (targetCount > sourceCount) {
      console.log(`✅ ${tableName}: ${sourceCount.toLocaleString()} → ${targetCount.toLocaleString()} rows (target has more)`);
    } else if (targetCount < sourceCount) {
      const diff = sourceCount - targetCount;
      const pct = ((diff / sourceCount) * 100).toFixed(1);
      console.log(`⚠️  ${tableName}: ${sourceCount.toLocaleString()} → ${targetCount.toLocaleString()} rows (${pct}% less)`);
      issues.push(`WARNING: Table ${tableName} has ${pct}% fewer rows in target`);
    } else {
      console.log(`✅ ${tableName}: ${sourceCount.toLocaleString()} rows match`);
    }
  }
  
  console.log('');
  
  const integrity = !issues.some(i => i.startsWith('CRITICAL'));
  
  return { integrity, sourceCounts, targetCounts, issues };
}

/**
 * Run the complete migration verification
 */
async function runMigrationVerification(): Promise<VerificationResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Database Migration Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (!SOURCE_DB_URL) {
    console.error('❌ ERROR: PRISMA_ACCELERATE_URL or DATABASE_URL environment variable not set');
    console.log('Please set PRISMA_ACCELERATE_URL to the current (source) database connection string');
    process.exit(1);
  }
  
  console.log(`Source DB: ${SOURCE_DB_URL.replace(/\/\/.*@/, '//***@')}`);
  console.log(`Target DB: ${TARGET_DB_URL.replace(/\/\/.*@/, '//***@')}\n`);
  
  const sourcePrisma = createPrismaClient(SOURCE_DB_URL);
  const targetPrisma = createPrismaClient(TARGET_DB_URL);
  
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Test connections
    console.log('Testing database connections...\n');
    
    try {
      await sourcePrisma.$connect();
      const sourceTest = await sourcePrisma.$queryRaw`SELECT 1 as test`;
      console.log('✅ Source database connection: OK');
    } catch (error) {
      console.error('❌ Source database connection failed:', error);
      process.exit(1);
    }
    
    try {
      await targetPrisma.$connect();
      const targetTest = await targetPrisma.$queryRaw`SELECT 1 as test`;
      console.log('✅ Target database connection: OK\n');
    } catch (error) {
      console.error('❌ Target database connection failed:', error);
      process.exit(1);
    }
    
    // Schema compatibility check
    const schemaResult = await verifySchemaCompatibility(sourcePrisma, targetPrisma);
    
    // Data integrity check
    const dataResult = await verifyDataIntegrity(sourcePrisma, targetPrisma);
    
    // Qualification data check (specific to this use case)
    console.log('🔍 Checking qualification data in target database...\n');
    const qualCheck = await checkQualificationData(targetPrisma);
    
    if (qualCheck.hasQualificationData) {
      console.log(`✅ Target database has ${qualCheck.sampleConversations.toLocaleString()} conversations with qualification data`);
      console.log(`✅ Total conversation states: ${qualCheck.sampleStates.toLocaleString()}\n`);
    } else {
      console.log('⚠️  No qualification data found in target database\n');
      warnings.push('No qualification data found in target database');
    }
    
    // Categorize issues
    [...schemaResult.issues, ...dataResult.issues].forEach(issue => {
      if (issue.startsWith('CRITICAL')) {
        criticalIssues.push(issue);
      } else {
        warnings.push(issue);
      }
    });
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Verification Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Schema Compatible: ${schemaResult.compatible ? '✅ YES' : '❌ NO'}`);
    console.log(`Data Integrity:    ${dataResult.integrity ? '✅ OK' : '⚠️  ISSUES FOUND'}`);
    console.log(`Qualification Data: ${qualCheck.hasQualificationData ? '✅ PRESENT' : '⚠️  NOT FOUND'}`);
    console.log(`Critical Issues:   ${criticalIssues.length}`);
    console.log(`Warnings:          ${warnings.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (criticalIssues.length > 0) {
      console.log('❌ CRITICAL ISSUES (must resolve before migration):');
      criticalIssues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
    }
    
    if (warnings.length > 0) {
      console.log('⚠️  WARNINGS (review recommended):');
      warnings.forEach(warning => console.log(`   - ${warning}`));
      console.log('');
    }
    
    if (criticalIssues.length === 0 && warnings.length === 0) {
      console.log('✅ All checks passed! Database migration is ready.\n');
    } else if (criticalIssues.length === 0) {
      console.log('✅ No critical issues. Migration can proceed with caution.\n');
    } else {
      console.log('❌ Critical issues found. Resolve before migrating.\n');
    }
    
    const result: VerificationResult = {
      timestamp: new Date().toISOString(),
      sourceDb: SOURCE_DB_URL.replace(/\/\/.*@/, '//***@'),
      targetDb: TARGET_DB_URL.replace(/\/\/.*@/, '//***@'),
      schemaCompatible: schemaResult.compatible,
      dataIntegrity: dataResult.integrity,
      criticalIssues,
      warnings,
      tableCounts: {
        source: dataResult.sourceCounts,
        target: dataResult.targetCounts,
      },
      schemaChecks: {
        source: schemaResult.sourceChecks,
        target: schemaResult.targetChecks,
      },
      qualificationDataCheck: qualCheck,
    };
    
    // Save detailed report
    const reportPath = `./migration-report-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}\n`);
    
    return result;
    
  } finally {
    await sourcePrisma.$disconnect();
    await targetPrisma.$disconnect();
  }
}

// Run the verification
runMigrationVerification()
  .then(result => {
    const exitCode = result.criticalIssues.length > 0 ? 1 : 0;
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
