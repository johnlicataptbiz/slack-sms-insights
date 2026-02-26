/**
 * Migration script implementing all 6 data enhancement recommendations:
 * 1. Fix Rep Assignment - Populate current_rep_id based on line ownership
 * 2. Expand Qualification - Auto-populate from SMS conversation analysis
 * 3. Clean Niche Data - Normalize into categories
 * 4. Activate Escalation - Implement level-based routing and cadence
 * 5. Populate Conversion Examples - Tag successful conversations for AI training
 * 6. Add Work Item Types - Introduce new action types
 *
 * Usage: node --import tsx scripts/migrate-data-enhancements.ts [--step N] [--dry-run] [--limit N]
 */

import type { Logger } from '@slack/bolt';
import { initDatabase, initializeSchema } from '../services/db.js';
import { getPool } from '../services/db.js';
import { syncQualificationFromConversationText } from '../services/qualification-sync.js';
import { listMessagesForConversation } from '../services/inbox-store.js';
import { classifyEscalationLevel } from '../services/inbox-draft-engine.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const REP_CONFIG = {
  jack: { phones: ['8175809950', '+18175809950', '18175809950'], names: ['jack', 'jack licata', 'licata'] },
  brandon: { phones: ['6788203770', '+16788203770', '16788203770'], names: ['brandon', 'brandon erwin', 'erwin'] },
};

const NICHE_CATEGORIES: Record<string, string[]> = {
  'Orthopedics/Manual Therapy': ['orthopedic', 'ortho', 'manual therapy', 'sports med', 'joint', 'msk', 'spine', 'back pain'],
  'Sports Performance': ['sports', 'athlete', 'athletic', 'performance', 'sports pt'],
  'Pediatrics': ['pediatric', 'peds', 'children', 'child', 'kids', 'infant'],
  'Geriatrics': ['geriatric', 'gerontology', 'elderly', 'senior', 'aging'],
  'Neurological Rehab': ['neuro', 'stroke', 'tbi', 'vestibular', 'balance'],
  'Cardiopulmonary': ['cardiac', 'cardio', 'pulmonary', 'heart', 'lung'],
  'Women\'s Health/Pelvic': ['pelvic', 'womens health', 'prenatal', 'postpartum'],
  'Hand Therapy': ['hand', 'upper extremity', 'wrist', 'cht'],
  'Dry Needling': ['dry needling', 'needling'],
  'Private Practice Owner': ['owner', 'clinic owner', 'practice owner', 'entrepreneur'],
  'Cash-Based Practice': ['cash based', 'cash practice', 'out of network', 'concierge'],
  'Home Health': ['home health', 'hh', 'home care'],
  'Acute Care': ['acute', 'hospital', 'inpatient', 'icu'],
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let step: number | undefined, dryRun = false, limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--step' && args[i + 1]) { step = parseInt(args[++i], 10); }
    else if (args[i] === '--dry-run') { dryRun = true; }
    else if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[++i], 10); }
  }
  return { step, dryRun, limit };
};

const identifyRepFromLine = (line: string | null, alowareUser: string | null): string | null => {
  if (!line && !alowareUser) return null;
  const combined = `${line || ''} ${alowareUser || ''}`.toLowerCase();
  for (const phone of REP_CONFIG.jack.phones) { if (combined.includes(phone.replace(/\D/g, ''))) return 'jack'; }
  for (const name of REP_CONFIG.jack.names) { if (combined.includes(name)) return 'jack'; }
  for (const phone of REP_CONFIG.brandon.phones) { if (combined.includes(phone.replace(/\D/g, ''))) return 'brandon'; }
  for (const name of REP_CONFIG.brandon.names) { if (combined.includes(name)) return 'brandon'; }
  return null;
};

const categorizeNiche = (rawNiche: string | null): string | null => {
  if (!rawNiche) return null;
  const normalized = rawNiche.toLowerCase().trim();
  for (const [category, keywords] of Object.entries(NICHE_CATEGORIES)) {
    if (keywords.some(kw => normalized.includes(kw))) return category;
  }
  return rawNiche.trim().slice(0, 90);
};

const computeCadenceStatus = (level: number, lastPodcast: Date | null, booked: boolean): string => {
  if (booked) return 'nurture_pool';
  if (lastPodcast) {
    const days = Math.floor((Date.now() - lastPodcast.getTime()) / 86400000);
    if (days <= 7) return 'podcast_sent';
    if (level >= 3) return 'call_offered';
  }
  return 'idle';
};

async function fixRepAssignment(dryRun: boolean, limit?: number) {
  logger.info("\n=== STEP 1: FIXING REP ASSIGNMENT ===\n");
  const pool = getPool(); if (!pool) throw new Error("DB not initialized");
  const client = await pool.connect();
  let updated = 0, errors = 0;
  try {
    // Only select conversations that have outbound messages with Jack/Brandon lines
    const result = await client.query(`
      SELECT c.id, e.line, e.aloware_user
      FROM conversations c
      JOIN LATERAL (
        SELECT line, aloware_user FROM sms_events 
        WHERE conversation_id = c.id AND direction = 'outbound'
        ORDER BY event_ts DESC LIMIT 1
      ) e ON true
      WHERE c.current_rep_id IS NULL
      AND (e.line ILIKE '%jack%' OR e.line ILIKE '%brandon%'
           OR e.line ~* '817.?580.?9950' OR e.line ~* '678.?820.?3770')
      ${limit ? `LIMIT ${limit}` : ""}
    `);
    logger.info(`Found ${result.rows.length} conversations needing rep assignment`);
    for (const row of result.rows) {
      try {
        const repId = identifyRepFromLine(row.line, row.aloware_user);
        if (repId) {
          if (dryRun) logger.info(`[DRY-RUN] Would assign rep "${repId}" to ${row.id} (line: ${row.line})`);
          else await client.query(`UPDATE conversations SET current_rep_id = $1, updated_at = NOW() WHERE id = $2`, [repId, row.id]);
          updated++;
        }
      } catch (e) { errors++; logger.error(`Error: ${row.id}`, e); }
    }
    logger.info(`✓ ${dryRun ? "Would update" : "Updated"} ${updated} conversations`);
    return { updated, errors };
  } finally { client.release(); }
}

async function expandQualification(dryRun: boolean, limit?: number) {
  logger.info('\n=== STEP 2: EXPANDING QUALIFICATION ===\n');
  const pool = getPool(); if (!pool) throw new Error('DB not initialized');
  const client = await pool.connect();
  let updated = 0, errors = 0;
  try {
    const result = await client.query(`SELECT DISTINCT c.id, c.contact_key, c.contact_id FROM conversations c LEFT JOIN conversation_state cs ON cs.conversation_id = c.id WHERE c.status = 'open' AND (cs.conversation_id IS NULL OR cs.qualification_full_or_part_time = 'unknown') AND EXISTS (SELECT 1 FROM sms_events se WHERE se.conversation_id = c.id AND se.direction = 'inbound' AND se.body IS NOT NULL) ${limit ? `LIMIT ${limit}` : ''}`);
    for (const conv of result.rows) {
      try {
        const messages = await listMessagesForConversation(conv.id, 250, logger);
        if (!messages?.filter(m => m.direction === 'inbound').length) continue;
        const res = await syncQualificationFromConversationText({ conversationId: conv.id, contactKey: conv.contact_key, contactId: conv.contact_id, triggerDirection: 'inbound', messages }, logger);
        if (res.changed) { updated++; }
      } catch (e) { errors++; }
    }
    logger.info(`✓ ${dryRun ? 'Would update' : 'Updated'} ${updated} conversations`);
    return { updated, errors };
  } finally { client.release(); }
}

async function cleanNicheData(dryRun: boolean, limit?: number) {
  logger.info('\n=== STEP 3: CLEANING NICHE DATA ===\n');
  const pool = getPool(); if (!pool) throw new Error('DB not initialized');
  const client = await pool.connect();
  let updated = 0, errors = 0;
  try {
    const result = await client.query(`SELECT contact_key, niche FROM inbox_contact_profiles WHERE niche IS NOT NULL AND niche != '' ${limit ? `LIMIT ${limit}` : ''}`);
    for (const row of result.rows) {
      const normalized = categorizeNiche(row.niche);
      if (normalized && normalized !== row.niche) {
        if (!dryRun) await client.query(`UPDATE inbox_contact_profiles SET niche = $1 WHERE contact_key = $2`, [normalized, row.contact_key]);
        updated++;
      }
    }
    logger.info(`✓ ${dryRun ? 'Would update' : 'Updated'} ${updated} niche entries`);
    return { updated, errors };
  } finally { client.release(); }
}

async function activateEscalation(dryRun: boolean, limit?: number) {
  logger.info('\n=== STEP 4: ACTIVATING ESCALATION ===\n');
  const pool = getPool(); if (!pool) throw new Error('DB not initialized');
  const client = await pool.connect();
  let updated = 0, errors = 0;
  try {
    const result = await client.query(`SELECT conversation_id, escalation_level, cadence_status, last_podcast_sent_at, qualification_coaching_interest FROM conversation_state ${limit ? `LIMIT ${limit}` : ''}`);
    for (const row of result.rows) {
      try {
        const messages = await listMessagesForConversation(row.conversation_id, 100, logger);
        const esc = classifyEscalationLevel(messages, { escalation_level: row.escalation_level, qualification_coaching_interest: row.qualification_coaching_interest });
        const lastPodcast = row.last_podcast_sent_at ? new Date(row.last_podcast_sent_at) : null;
        const newCadence = computeCadenceStatus(esc.level, lastPodcast, false);
        if (esc.level !== row.escalation_level || newCadence !== row.cadence_status) {
          if (!dryRun) await client.query(`UPDATE conversation_state SET escalation_level = $2, escalation_reason = $3, cadence_status = $4 WHERE conversation_id = $1`, [row.conversation_id, esc.level, esc.reason, newCadence]);
          updated++;
        }
      } catch (e) { errors++; }
    }
    logger.info(`✓ ${dryRun ? 'Would update' : 'Updated'} ${updated} escalation levels`);
    return { updated, errors };
  } finally { client.release(); }
}

async function populateConversionExamples(dryRun: boolean, limit?: number) {
  logger.info('\n=== STEP 5: POPULATING CONVERSION EXAMPLES ===\n');
  const pool = getPool(); if (!pool) throw new Error('DB not initialized');
  const client = await pool.connect();
  let added = 0, errors = 0;
  try {
    const result = await client.query(`SELECT e.id, e.conversation_id, e.body, e.sequence FROM sms_events e WHERE e.direction = 'outbound' AND e.body IS NOT NULL AND LENGTH(e.body) > 20 AND e.conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM booked_calls bc WHERE bc.event_ts >= e.event_ts AND bc.event_ts <= e.event_ts + INTERVAL '14 days') AND NOT EXISTS (SELECT 1 FROM conversion_examples ce WHERE ce.source_outbound_event_id = e.id) ORDER BY e.event_ts DESC ${limit ? `LIMIT ${limit}` : ''}`);
    for (const row of result.rows) {
      try {
        const stateRes = await client.query(`SELECT escalation_level FROM conversation_state WHERE conversation_id = $1`, [row.conversation_id]);
        const level = stateRes.rows[0]?.escalation_level || 1;
        const body = row.body || '';
        const sig = [(/\?/.test(body) ? "Q" : ""), (/\b(call|book|schedule)\b/i.test(body) ? "CTA" : ""), (/\b(you|your|we)\b/i.test(body) ? "P" : "")].filter(Boolean).join("-") || "simple";
        if (!dryRun) await client.query(`INSERT INTO conversion_examples (source_outbound_event_id, booked_call_label, escalation_level, structure_signature, channel_marker) VALUES ($1,$2,$3,$4,'sms') ON CONFLICT DO NOTHING`, [row.id, row.sequence || 'manual', level, sig]);
        added++;
      } catch (e) { errors++; }
    }
    logger.info(`✓ ${dryRun ? 'Would add' : 'Added'} ${added} examples`);
    return { added, errors };
  } finally { client.release(); }
}

async function addWorkItemTypes(dryRun: boolean, limit?: number) {
  logger.info('\n=== STEP 6: ADDING WORK ITEM TYPES ===\n');
  const pool = getPool(); if (!pool) throw new Error('DB not initialized');
  const client = await pool.connect();
  let added = 0, errors = 0;
  try {
    const followUps = await client.query(`SELECT c.id, c.current_rep_id FROM conversations c JOIN conversation_state cs ON cs.conversation_id = c.id WHERE cs.qualification_coaching_interest = 'high' AND c.status = 'open' AND c.last_touch_at < NOW() - INTERVAL '3 days' AND NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.conversation_id = c.id AND wi.type = 'follow_up' AND wi.resolved_at IS NULL) ${limit ? `LIMIT ${limit}` : ''}`);
    for (const row of followUps.rows) {
      if (!dryRun) await client.query(`INSERT INTO work_items (type, conversation_id, rep_id, severity, due_at) VALUES ('follow_up',$1,$2,'med',NOW() + INTERVAL '2 days')`, [row.id, row.current_rep_id]);
      added++;
    }
    const hotLeads = await client.query(`SELECT c.id, c.current_rep_id FROM conversations c JOIN conversation_state cs ON cs.conversation_id = c.id WHERE cs.escalation_level = 3 AND c.status = 'open' AND NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.conversation_id = c.id AND wi.type = 'hot_lead' AND wi.resolved_at IS NULL) ${limit ? `LIMIT ${limit}` : ''}`);
    for (const row of hotLeads.rows) {
      if (!dryRun) await client.query(`INSERT INTO work_items (type, conversation_id, rep_id, severity, due_at) VALUES ('hot_lead',$1,$2,'high',NOW() + INTERVAL '4 hours')`, [row.id, row.current_rep_id]);
      added++;
    }
    logger.info(`✓ ${dryRun ? 'Would add' : 'Added'} ${added} work items`);
    return { added, errors };
  } finally { client.release(); }
}

async function main() {
  const { step, dryRun, limit } = parseArgs();
  console.log('========================================');
  console.log('PTBIZ DATA ENHANCEMENT MIGRATION');
  console.log('========================================');
  console.log(`Started: ${new Date().toISOString()}`);
  if (dryRun) console.log('Mode: DRY-RUN');
  if (step) console.log(`Running step: ${step}`);
  if (limit) console.log(`Limit: ${limit}`);

  await initDatabase(logger);
  await initializeSchema();
  if (!getPool()) { logger.error('DB failed'); process.exit(1); }

  const results: any = {};
  try {
    if (!step || step === 1) results.step1 = await fixRepAssignment(dryRun, limit);
    if (!step || step === 2) results.step2 = await expandQualification(dryRun, limit);
    if (!step || step === 3) results.step3 = await cleanNicheData(dryRun, limit);
    if (!step || step === 4) results.step4 = await activateEscalation(dryRun, limit);
    if (!step || step === 5) results.step5 = await populateConversionExamples(dryRun, limit);
    if (!step || step === 6) results.step6 = await addWorkItemTypes(dryRun, limit);

    console.log('\n========================================');
    console.log('MIGRATION SUMMARY');
    console.log('========================================');
    console.log(`1. Rep Assignment:       ${results.step1?.updated || 0} updated`);
    console.log(`2. Qualification:        ${results.step2?.updated || 0} updated`);
    console.log(`3. Niche Data:           ${results.step3?.updated || 0} updated`);
    console.log(`4. Escalation:           ${results.step4?.updated || 0} updated`);
    console.log(`5. Conversion Examples:  ${results.step5?.added || 0} added`);
    console.log(`6. Work Item Types:      ${results.step6?.added || 0} added`);
    console.log(`\nFinished: ${new Date().toISOString()}`);
    if (dryRun) console.log('\n⚠️  Run without --dry-run to apply changes.');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
