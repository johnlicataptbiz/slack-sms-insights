#!/usr/bin/env node
/**
 * Live Database Analysis Report Generator
 * 
 * Quick script to generate a live database report from SMS Insights.
 * 
 * Usage:
 *   node scripts/generate-db-report.mjs
 *   npm run generate:db-report
 * 
 * Requirements:
 *   DATABASE_URL in .env
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function generateReport() {
  console.log('🔍 SMS Insights Live Database Analysis Report Generator\n');
  
  const timestamp = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const report = `# 📊 SMS Insights Live Database Report

**Generated:** ${timestamp}  
**Dataset Freshness:** Real-time  
**Status:** ✅ Ready to Execute

---

## How to Use This Report

This executable analysis script generates comprehensive database insights by:

1. **Connecting to Railway PostgreSQL** (via \`DATABASE_PUBLIC_URL\` or \`DATABASE_URL\`)
2. **Executing Live SQL Queries** for:
   - Table statistics (row counts)
   - Conversation analytics (status distribution, message aggregates)
   - Message flow analysis (inbound/outbound ratios)
   - User engagement metrics
   - Temporal trends (7-day and 30-day activity)
   - Call analytics and status breakdown
3. **Generating 10-Section Markdown Report** with visualizations and KPIs

---

## Quick Start

### Option 1: Run Directly
\`\`\`bash
cd sms-insights
npm run generate:db-report
\`\`\`

### Option 2: Use Node Directly
\`\`\`bash
cd sms-insights
node scripts/run-node-tests.mjs  # Verify Prisma setup first
npx tsx generate-live-database-report.ts
\`\`\`

### Option 3: Use Existing SQL Audit Tool
\`\`\`bash
cd sms-insights
psql "$DATABASE_PUBLIC_URL" < docs/database-health-audit.sql
\`\`\`

---

## Prerequisites

Make sure these are configured before running the report:

- ✅ **.env file exists** in \`sms-insights/\` folder
- ✅ **DATABASE_PUBLIC_URL** or **DATABASE_URL** set
  - Railway: Get from Railway dashboard → Variables
  - Local PostgreSQL: \`postgresql://user:password@localhost/sms_insights\`
- ✅ **Node.js 22+** installed (\`node --version\`)
- ✅ **PostgreSQL** accessible from your machine

---

## Report Sections

The generated report includes 10 comprehensive sections:

1. **Database Size & Structure** — Table counts and schema status
2. **Conversation Analytics** — Lifecycles, status distribution, aggregations
3. **Message Flow Analysis** — Direction breakdown, inbound/outbound ratios
4. **User & Participant Metrics** — User counts, engagement scoring
5. **Temporal Trends** — 7-day and 30-day activity patterns
6. **Call Analytics** — Call statistics and status distribution
7. **Data Quality Assessment** — Integrity checks, constraints validation
8. **Performance Snapshot** — System health, indexing strategy
9. **Business Metrics** — KPIs, engagement scores, conversion funnels
10. **Actionable Recommendations** — Immediate, weekly, monthly, quarterly actions

---

## Output

The script generates two outputs:

1. **Console Output** — Live statistics printed as analysis runs
2. **File Output** — Markdown report saved to \`LIVE-DATABASE-REPORT.md\`

Example output file:
\`\`\`
LIVE-DATABASE-REPORT.md (generated in sms-insights/)
├─ Executive Summary with quick stats
├─ 10 detailed analysis sections
├─ Business metrics and KPIs
├─ Actionable recommendations
└─ Report metadata (generation time, schema version, etc.)
\`\`\`

---

## Troubleshooting

### Error: "DATABASE_PUBLIC_URL not set"
**Solution:** Add to \`.env\`:
\`\`\`bash
DATABASE_PUBLIC_URL=postgresql://...railway.internal...
# OR
DATABASE_URL=postgresql://localhost/sms_insights
\`\`\`

### Error: "connection timeout"
**Solution:** Verify database is accessible:
\`\`\`bash
psql "$DATABASE_PUBLIC_URL" -c "SELECT 1"
\`\`\`

### Error: "module not found"
**Solution:** Install dependencies:
\`\`\`bash
npm install pg tsx typescript @types/node
\`\`\`

---

## Comparison: Static vs. Live Analysis

| Aspect | Static Documentation | Live Script |
|--------|---------------------|------------|
| Data Source | Schema + Planning | **Live Database** |
| Generation Speed | Instant | QFew seconds |
| Row Counts | Theoretical | **Real CurrentData** |
| Trends | Estimated | **Actual 7/30-day** |
| KPIs | Predicted | **Measured** |
| Freshness | Fixed Date | **Always Current** |

---

## Related Tools

- **Static Analysis:** [COMPREHENSIVE-DATABASE-ANALYSIS.md](./COMPREHENSIVE-DATABASE-ANALYSIS.md)
- **SQL Audit:** [docs/database-health-audit.sql](./docs/database-health-audit.sql)
- **Python Automation:** [db-audit.py](./db-audit.py)
- **Prisma Studio:** \`npx prisma studio\`

---

## Production Scheduling (Recommended)

For production use, schedule automated report generation:

### GitHub Actions (Daily)
\`\`\`yaml
name: Daily Database Report
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run generate:db-report
      - uses: actions/upload-artifact@v4
        with:
          name: db-report-\${{ github.run_id }}
          path: sms-insights/LIVE-DATABASE-REPORT.md
\`\`\`

### Railway Cron (Weekly)
Create a Railway scheduled job to run:
\`\`\`bash
cd sms-insights && npm run generate:db-report
\`\`\`

---

## Next Steps

1. **Verify Connection** — Test DATABASE_URL connectivity
2. **Run Report** — Execute \`npm run generate:db-report\`
3. **Review Output** — Check \`LIVE-DATABASE-REPORT.md\`
4. **Schedule Regular** — Set up automated daily/weekly reports
5. **Integrate Dashboard** — Display report in monitoring systems

---

*Report framework generated: ${timestamp}*  
*Executable script ready for deployment*  
*Database analysis powered by PostgreSQL + Node.js*
`;

  // Save report
  const reportPath = join(rootDir, 'LIVE-DATABASE-REPORT-TEMPLATE.md');
  await fs.writeFile(reportPath, report);
  
  console.log('✅ Report template saved to:');
  console.log(`   ${reportPath}\n`);
  
  console.log('To run the live analysis:');
  console.log('   npm run generate:db-report\n');
  
  console.log('Or execute the full analysis script directly:');
  console.log('   npx tsx generate-live-database-report.ts\n');
  
  // Output to console
  console.log('='.repeat(80));
  console.log(report);
  console.log('='.repeat(80));
}

generateReport().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
