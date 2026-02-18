import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';

// Load .env file
const result = config({ path: path.join(process.cwd(), '.env') });

if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

const env = result.parsed;
if (!env) {
  console.error('No environment variables found in .env file');
  process.exit(1);
}

const args = ['variables'];

// Add each environment variable
for (const [key, value] of Object.entries(env)) {
  // Skip comment lines or empty keys if parsing manually, but dotenv handles that.
  // Warning: dotenv values might be empty string.
  args.push('--set', `${key}=${value}`);
}

// Target the service specifically to avoid ambiguity
args.push('--service', 'sms-insights');

// Skip triggering a deployment for variables setting
// We will trigger a manual deployment afterwards
// Update: help text says --skip-deploys is an option
// but let's check if it accepts it. The help output showed it.
// If it doesn't, this script might fail on unknown argument.
// Based on previous tool output, it WAS in help.
args.push('--skip-deploys');

console.log(`Setting ${Object.keys(env).length} variables...`);

const child = spawn('railway', args, { stdio: 'inherit' });

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`railway variables command failed with code ${code}`);
    process.exit(code || 1);
  }
  console.log('Successfully set environment variables!');
});
