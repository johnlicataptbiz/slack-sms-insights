# REQUIRED SETUP FOR MONDAY PERSONAL SYNC

## 1. Environment Variables

Copy the `.env.sample` file to `.env` and update the following variables:

```env
# Database (choose one option)
# Option A: Local PostgreSQL (for development)
DATABASE_URL=postgresql://user:password@localhost:5432/sms_insights

# Option B: Prisma Accelerate (for Vercel/production)
PRISMA_ACCELERATE_URL=prisma+postgres://your-accelerate-url-here

# monday.com integration
MONDAY_API_TOKEN=your_monday_api_token_here
MONDAY_SYNC_ENABLED=true
MONDAY_WRITEBACK_ENABLED=true
MONDAY_PERSONAL_SYNC_ENABLED=true
MONDAY_OUTBOUND_ENABLED=true
MONDAY_AUTO_WRITE_ENABLED=true
MONDAY_PERSONAL_BOARD_ID=10029059942
MONDAY_WEEKLY_SUMMARY_BOARD_ID=YOUR_SMS_REPORTS_BOARD_ID
MONDAY_WEEKLY_WRITEBACK_MIN_INTERVAL_MS=86400000

# Personal sync settings
MONDAY_PERSONAL_SETTER_BUCKET=jack  # or "brandon"
MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS=14
MONDAY_PERSONAL_SELF_BOOKED_ENABLED=false  # set to true if you want self-booked calls too

# Optional but recommended
MONDAY_PERSONAL_SETTER_MONDAY_USER_ID=your_monday_user_id
```

## 2. Install Dependencies

```bash
cd sms-insights
npm install
npm run prisma:generate
```

## 3. Run the Personal Sync

```bash
# Sync your personal booked calls to Monday
npm run sync:monday -- --personal

# You can also run it with other flags:
npm run sync:monday -- --personal --force  # force re-sync all items
```

## 4. Troubleshooting

- **Database connection error**: Make sure your DATABASE_URL or PRISMA_ACCELERATE_URL is correctly configured
- **Monday API token error**: Verify your MONDAY_API_TOKEN has the correct permissions
- **No calls being synced**: Check that your booked calls exist in the database and that the date range is correct (default is last 14 days)
- **Column mapping issues**: If columns aren't populating correctly, you can override the mapping with MONDAY_PERSONAL_COLUMN_MAP_JSON

## 5. Column Mapping

The system automatically infers column mappings based on column titles. If you need to override this, use the MONDAY_PERSONAL_COLUMN_MAP_JSON environment variable:

```env
MONDAY_PERSONAL_COLUMN_MAP_JSON={"callDateColumnId":"date4","contactNameColumnId":"name","phoneColumnId":"phone","setterColumnId":"person","stageColumnId":"status","firstConversionColumnId":"text_first_conversion","lineColumnId":"text_line","sourceColumnId":"text_source","slackLinkColumnId":"link","notesColumnId":"long_text"}
```

Replace the column IDs with your actual Monday board column IDs.
