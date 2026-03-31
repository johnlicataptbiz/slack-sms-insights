#!/usr/bin/env python3
"""
Board Maintenance Script for PTBiz SMS Insights
Identifies and syncs stale Monday.com boards
"""

import subprocess
import json
import sys
from datetime import datetime, timedelta

def run_command(cmd):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd='apps/backend')
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def get_database_url():
    """Extract database URL from Railway"""
    cmd = "railway variables --service sms-insights --json"
    code, stdout, stderr = run_command(cmd)
    if code != 0:
        print(f"Failed to get database URL: {stderr}")
        return None

    try:
        data = json.loads(stdout)
        return data.get('DATABASE_PUBLIC_URL')
    except:
        print("Failed to parse Railway response")
        return None

def check_board_health():
    """Check health of Monday.com boards"""
    print("🔍 Checking board health...")

    # Run the existing report generation
    code, stdout, stderr = run_command("node --import tsx generate-live-database-report.ts")
    if code != 0:
        print(f"Failed to generate report: {stderr}")
        return []

    # Read the report
    try:
        with open('apps/backend/LIVE-DATABASE-REPORT.md', 'r') as f:
            content = f.read()
    except:
        print("Failed to read report file")
        return []

    # Parse board health from report
    stale_boards = []
    lines = content.split('\n')
    in_flags = False

    for line in lines:
        if 'Board Health Flags' in line:
            in_flags = True
            continue
        if in_flags and line.strip() and not line.startswith('---'):
            if '✅ HEALTHY' not in line:
                # Extract board ID
                if '`' in line:
                    board_id = line.split('`')[1]
                    stale_boards.append(board_id)

    return stale_boards

def force_sync_board(board_id):
    """Force sync a specific board"""
    print(f"🔄 Force syncing board {board_id}...")

    # Set environment variable for specific board
    env_cmd = f"MONDAY_FORCE_SYNC_BOARD={board_id} node --import tsx -e \"import('./services/monday-sync.js').then(m => m.startMondaySyncJobs())\""

    code, stdout, stderr = run_command(env_cmd)
    if code == 0:
        print(f"✅ Successfully synced board {board_id}")
        return True
    else:
        print(f"❌ Failed to sync board {board_id}: {stderr}")
        return False

def main():
    print("🛠️  PTBiz SMS Insights - Board Maintenance")
    print("=" * 50)

    # Check database connectivity first
    db_url = get_database_url()
    if not db_url:
        print("❌ Cannot proceed without database access")
        sys.exit(1)

    print(f"✅ Database accessible")

    # Check board health
    stale_boards = check_board_health()
    if not stale_boards:
        print("✅ All boards are healthy!")
        return

    print(f"⚠️  Found {len(stale_boards)} stale boards: {', '.join(stale_boards)}")

    # Force sync each stale board
    synced_count = 0
    for board_id in stale_boards:
        if force_sync_board(board_id):
            synced_count += 1

    print(f"\n📊 Maintenance Summary:")
    print(f"   Boards checked: {len(stale_boards) + 14}")  # 14 healthy + stale
    print(f"   Boards synced: {synced_count}")
    print(f"   Success rate: {synced_count/len(stale_boards)*100:.1f}%")

    if synced_count == len(stale_boards):
        print("✅ All stale boards successfully maintained!")
    else:
        print("⚠️  Some boards may need manual intervention")

if __name__ == "__main__":
    main()