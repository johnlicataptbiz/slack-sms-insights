#!/usr/bin/env node
/**
 * Generate Live Database Report - POOL.QUERY FIXED VERSION
 * Creates LIVE-DATABASE-REPORT.md using the current backend schema/tables
 * Uses pool.query → result.rows[0] pattern from check-db-status.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '@slack/bolt';
import { closeDatabase, getPool, initDatabase } from './services/db.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

async function generateReport() {
  console.log('🔍 Starting live database analysis...');

  await initDatabase(logger);
  const pool = getPool();
  if (!pool) throw new Error('Failed to initialize database pool');

  const timestamp = new Date().toISOString();
  const startedAt = Date.now();

  try {
    // ===== 1. CORE TABLE STATS ===== (FIXED POOL.QUERY)
    console.log('📊 Collecting table statistics...');

    const snapshotsResult = await pool.query(`
      SELECT 
        COUNT(*)::int as count, 
        COALESCE(MAX(updated_at)::text, 'none') as latest 
      FROM monday_call_snapshots
    `);
    const snapshots = snapshotsResult.rows[0];

    const boardsResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM monday_board_registry WHERE active = true',
    );
    const boards = boardsResult.rows[0];

    const leadsResult = await pool.query('SELECT COUNT(*)::int as count FROM lead_outcomes');
    const leads = leadsResult.rows[0];

    const attribsResult = await pool.query('SELECT COUNT(*)::int as count FROM lead_attribution');
    const attribs = attribsResult.rows[0];

    const sequencesResult = await pool.query('SELECT COUNT(*)::int as count FROM sequence_registry WHERE status = $1', [
      'active',
    ]);
    const sequences = sequencesResult.rows[0];

    // ===== 2. MONDAY SYNC HEALTH =====
    console.log('🔄 Checking Monday sync status...');

    const syncHealthResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_boards,
        COUNT(CASE WHEN last_sync_completed_at > NOW() - INTERVAL '1 day' THEN 1 END)::int as healthy,
        AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(last_sync_completed_at, '1970-01-01'::timestamptz)) / 3600))::numeric as avg_hours_stale
      FROM monday_sync_state
    `);
    const syncHealth = syncHealthResult.rows[0];

    // ===== 3. BUSINESS KPIs (7-DAY) =====
    console.log('📈 Calculating KPIs...');

    const kpisResult = await pool.query(`
      WITH recent AS (SELECT * FROM monday_call_snapshots WHERE updated_at > NOW() - INTERVAL '7 days')
      SELECT 
        COUNT(*) FILTER (WHERE is_booked)::int as recent_bookings,
        COUNT(DISTINCT contact_key) FILTER (WHERE contact_key IS NOT NULL)::int as unique_leads_7d,
        COUNT(*) FILTER (WHERE synced_at > NOW() - INTERVAL '1 hour')::int as fresh_syncs,
        COUNT(*) FILTER (WHERE contact_key IS NULL OR contact_key = '')::int as missing_keys
      FROM recent
    `);
    const kpis = kpisResult.rows[0];

    // ===== 4. TREND ANALYSIS (DAILY SNAPSHOTS) =====
    const trendResult = await pool.query(`
      SELECT 
        date_trunc('day', updated_at)::date as day,
        COUNT(*)::int as daily_snapshots
      FROM monday_call_snapshots 
      WHERE updated_at > NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY 1 DESC
    `);
    const trendRows = trendResult.rows as { day: string; daily_snapshots: number }[];
    const trends = trendRows.map((t) => `${t.day}: ${t.daily_snapshots}`);

    // ===== 5. HEALTH ANOMALIES =====
    const anomalyResult = await pool.query(`
      SELECT board_id, COUNT(*)::int as snapshots,
        CASE 
          WHEN COUNT(*) FILTER (WHERE contact_key IS NULL OR contact_key = '') > COUNT(*) * 0.1 THEN '🚨 HIGH_MISSING_KEYS'
          WHEN AVG(EXTRACT(EPOCH FROM (updated_at - synced_at))/3600) > 2 THEN '⚠️ SYNC_LAG'
          ELSE '✅ HEALTHY'
        END as health_flag
      FROM monday_call_snapshots 
      GROUP BY board_id HAVING COUNT(*) > 50
      ORDER BY snapshots DESC
    `);
    const anomalyRows = anomalyResult.rows as { board_id: string; snapshots: number; health_flag: string }[];
    const anomalies = anomalyRows.map((a) => `- \`${a.board_id}\`: ${a.snapshots} snaps **${a.health_flag}**`);

    // ===== GENERATE MARKDOWN =====
    const report = `# 📊 **LIVE DATABASE REPORT**
*Generated: ${timestamp}* | *DB: sms_insights* | *Snap: ${snapshots.count.toLocaleString()}*

## 🗄️ **Table Inventory**
| Table | Count | Latest |
|-------|-------|--------|
| **monday_call_snapshots** | **${snapshots.count.toLocaleString()}** | ${snapshots.latest} |
| monday_board_registry | ${boards.count} | - |
| lead_outcomes | ${leads.count} | - |
| lead_attribution | ${attribs.count} | - |
| active sequences | ${sequences.count} | - |

## 🔄 **Monday Sync Health** 
**Boards**: ${syncHealth.total_boards} total | **${syncHealth.healthy} healthy** (24h)  
**Avg stale**: **${syncHealth.avg_hours_stale?.toFixed(1)}h**

## 📈 **7-Day KPIs**
| Metric | Value |
|--------|-------|
| Recent Bookings | **${kpis.recent_bookings}** |
| Unique Leads | **${kpis.unique_leads_7d}** |
| Fresh Syncs (1h) | **${kpis.fresh_syncs}** |
| Missing Keys | **${kpis.missing_keys}** (${((kpis.missing_keys / snapshots.count) * 100).toFixed(1)}%)

## 📉 **Daily Snapshot Trends** (Last 7d)
\`\`\`
${trends.join('\\n')}
\`\`\`

## 🚨 **Board Health Flags** (50+ snaps)
${anomalies.length ? anomalies.join('\\n') : '**All healthy!** ✅'}

---
    *Powered by ptbizsms-api* • **Report complete in ${Date.now() - startedAt}ms**
`;

    fs.writeFileSync(path.resolve('LIVE-DATABASE-REPORT.md'), report);
    console.log('✅ **LIVE-DATABASE-REPORT.md** generated!');
    console.log('📁 Check `apps/backend/LIVE-DATABASE-REPORT.md`');
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

generateReport();
