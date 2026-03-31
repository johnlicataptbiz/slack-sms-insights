import 'dotenv/config';
import { syncRecentSetterBookedCallsToMonday } from '../services/monday-personal-writeback.js';

const main = async () => {
  console.log('Testing personal Monday sync...');

  // Check required environment variables
  const requiredEnvVars = [
    'MONDAY_API_TOKEN',
    'MONDAY_PERSONAL_BOARD_ID',
    'MONDAY_PERSONAL_SYNC_ENABLED',
    'MONDAY_OUTBOUND_ENABLED',
    'MONDAY_AUTO_WRITE_ENABLED',
  ];

  let hasErrors = false;
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`Missing required environment variable: ${envVar}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('Please set the required environment variables in your .env file');
    process.exit(1);
  }

  // Test the sync function
  try {
    const result = await syncRecentSetterBookedCallsToMonday(console);
    console.log('Personal sync result:', result);
  } catch (error) {
    console.error('Personal sync failed:', error);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});
