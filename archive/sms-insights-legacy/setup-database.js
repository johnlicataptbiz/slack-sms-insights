#!/usr/bin/env node

/**
 * SMS Insights Database Setup Utility
 * Configures PostgreSQL connection for local development or Railway
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function main() {
  console.log('\n========================================');
  console.log('SMS Insights Database Setup');
  console.log('========================================\n');

  // Check PostgreSQL availability
  try {
    execSync('psql --version', { stdio: 'ignore' });
    console.log('✓ PostgreSQL client found\n');
  } catch (e) {
    console.log('❌ PostgreSQL client not found');
    console.log('Install: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)\n');
    process.exit(1);
  }

  // Menu
  console.log('Select database environment:');
  console.log('1) Local PostgreSQL (development)');
  console.log('2) Railway PostgreSQL (production/staging)');
  console.log('3) Skip setup\n');

  const choice = await question('Enter choice (1-3): ');

  let dbUrl = '';

  if (choice === '1') {
    console.log('\nSetting up local PostgreSQL...\n');

    // Test connection
    try {
      execSync('pg_isready -h localhost', { stdio: 'ignore' });
      console.log('✓ PostgreSQL server is running\n');
    } catch (e) {
      console.log('⚠ PostgreSQL server not running on localhost:5432');
      console.log('Start PostgreSQL: brew services start postgresql\n');
      const confirmed = await question('Is PostgreSQL running now? (y/n): ');
      if (confirmed !== 'y') {
        console.log('❌ Cannot proceed\n');
        process.exit(1);
      }
    }

    // Create database
    console.log('Creating database "sms_insights"...');
    try {
      execSync('createdb sms_insights', { stdio: 'ignore' });
      console.log('✓ Database created');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Database already exists');
      }
    }

    dbUrl = 'postgresql://localhost/sms_insights';

    // Test connection
    console.log('Testing connection...');
    try {
      execSync(`psql "${dbUrl}" -c "SELECT 1"`, { stdio: 'ignore' });
      console.log('✓ Connection successful\n');
    } catch (e) {
      console.log('❌ Connection failed\n');
      process.exit(1);
    }
  } else if (choice === '2') {
    console.log('\nSetting up Railway PostgreSQL...\n');
    console.log('Steps:');
    console.log('1. Go to https://railway.app');
    console.log('2. Select SMS Insights project');
    console.log('3. Click PostgreSQL service');
    console.log('4. Click "Connect" tab');
    console.log('5. Copy the connection string\n');

    dbUrl = await question('Paste your Railway DATABASE_PUBLIC_URL: ');

    if (!dbUrl.includes('postgres')) {
      console.log('❌ Invalid PostgreSQL URL\n');
      process.exit(1);
    }

    console.log('\nTesting connection...');
    try {
      execSync(`psql "${dbUrl}" -c "SELECT 1"`, { stdio: 'ignore' });
      console.log('✓ Connection successful\n');
    } catch (e) {
      console.log('⚠ Connection test failed - verify URL and network access\n');
    }
  } else if (choice === '3') {
    console.log('\nSkipping setup - using existing connection\n');
  } else {
    console.log('Invalid choice\n');
    process.exit(1);
  }

  // Update .env
  if (dbUrl) {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';

    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch (e) {
      // File doesn't exist yet
    }

    // Replace or add DATABASE_PUBLIC_URL
    if (envContent.includes('DATABASE_PUBLIC_URL=')) {
      envContent = envContent.replace(
        /DATABASE_PUBLIC_URL=.*/,
        `DATABASE_PUBLIC_URL="${dbUrl}"`
      );
    } else if (envContent.includes('DATABASE_URL=')) {
      envContent = envContent.replace(
        /DATABASE_URL=.*/,
        `DATABASE_PUBLIC_URL="${dbUrl}"\nDATABASE_URL="file:./dev.db"`
      );
    } else {
      envContent = `DATABASE_PUBLIC_URL="${dbUrl}"\n${envContent}`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✓ .env updated with DATABASE_PUBLIC_URL');
    console.log(`  ${dbUrl}\n`);
  }

  // Next steps
  console.log('========================================');
  console.log('Setup Complete');
  console.log('========================================\n');
  console.log('Next steps:');
  console.log('1. Verify .env has correct DATABASE_PUBLIC_URL');
  console.log('2. Run migrations: npx prisma migrate deploy');
  console.log('3. Run audit: python3 db-audit.py\n');

  rl.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
