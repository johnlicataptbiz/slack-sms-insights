#!/usr/bin/env python3
"""
System Monitoring Script for PTBiz SMS Insights
Detects activity anomalies and sync failures
"""

import subprocess
import json
import statistics
from datetime import datetime, timedelta
import os

def run_command(cmd, cwd='apps/backend'):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def generate_report():
    """Generate fresh database report"""
    print("📊 Generating fresh database report...")
    code, stdout, stderr = run_command("node --import tsx generate-live-database-report.ts")
    if code != 0:
        print(f"Failed to generate report: {stderr}")
        return False
    return True

def parse_report():
    """Parse the database report for monitoring data"""
    try:
        with open('apps/backend/LIVE-DATABASE-REPORT.md', 'r') as f:
            content = f.read()
    except:
        print("Failed to read report")
        return None

    data = {
        'snapshots': [],
        'total_boards': 0,
        'healthy_boards': 0,
        'stale_boards': [],
        'fresh_syncs': 0,
        'bookings': 0,
        'leads': 0
    }

    lines = content.split('\n')
    parsing_snapshots = False

    for line in lines:
        line = line.strip()

        # Parse daily snapshots
        if 'Daily Snapshot Trends' in line:
            parsing_snapshots = True
            continue
        if parsing_snapshots and '2026-' in line and ': ' in line:
            parts = line.split(': ')
            if len(parts) == 2:
                try:
                    count = int(parts[1].strip())
                    data['snapshots'].append(count)
                except:
                    pass
        if parsing_snapshots and '```' in line:
            parsing_snapshots = False

        # Parse board health - new format
        if 'Boards**: ' in line and 'total' in line and 'healthy' in line:
            # Extract numbers from the line
            import re
            total_match = re.search(r'(\d+) total', line)
            healthy_match = re.search(r'(\d+) healthy', line)
            if total_match:
                data['total_boards'] = int(total_match.group(1))
            if healthy_match:
                data['healthy_boards'] = int(healthy_match.group(1))

        # Parse KPIs
        if 'Recent Bookings' in line and '**' in line:
            parts = line.split('**')
            if len(parts) >= 2:
                try:
                    data['bookings'] = int(parts[1].strip())
                except:
                    pass

        if 'Unique Leads' in line and '**' in line:
            parts = line.split('**')
            if len(parts) >= 2:
                try:
                    data['leads'] = int(parts[1].strip())
                except:
                    pass

        if 'Fresh Syncs (1h)' in line and '**' in line:
            parts = line.split('**')
            if len(parts) >= 2:
                try:
                    data['fresh_syncs'] = int(parts[1].strip())
                except:
                    pass

    # Calculate derived metrics
    data['stale_boards_count'] = data['total_boards'] - data['healthy_boards']
    if data['leads'] > 0:
        data['conversion_rate'] = data['bookings'] / data['leads']
    else:
        data['conversion_rate'] = 0

    return data

def detect_anomalies(data):
    """Detect anomalies in the data"""
    alerts = []

    if not data['snapshots']:
        alerts.append("CRITICAL: No snapshot data available")
        return alerts

    # Snapshot anomalies
    mean_snapshots = statistics.mean(data['snapshots'])
    stdev_snapshots = statistics.stdev(data['snapshots']) if len(data['snapshots']) > 1 else 0

    latest_snapshot = data['snapshots'][-1] if data['snapshots'] else 0

    # Check for extreme low activity
    if latest_snapshot < (mean_snapshots - 2 * stdev_snapshots):
        alerts.append(f"ALERT: Snapshot activity extremely low ({latest_snapshot}) - possible system issue")

    # Check for unusual spikes
    if latest_snapshot > (mean_snapshots + 3 * stdev_snapshots):
        alerts.append(f"INFO: Snapshot activity spike detected ({latest_snapshot})")

    # Board health alerts
    if data['stale_boards_count'] > 0:
        alerts.append(f"ALERT: {data['stale_boards_count']} boards are stale - sync failures detected")

    # Fresh sync alerts
    if data['fresh_syncs'] < 1:
        alerts.append(f"WARNING: No fresh syncs in last hour ({data['fresh_syncs']})")

    # Conversion rate alerts
    if data['conversion_rate'] < 1.0:  # Below 1.0 bookings per lead
        alerts.append(f"WARNING: Conversion rate below threshold ({data['conversion_rate']:.2f})")

    return alerts

def send_alerts(alerts):
    """Send alerts (currently just print, could be extended to Slack/email)"""
    if not alerts:
        print("✅ No anomalies detected - system healthy")
        return

    print(f"🚨 {len(alerts)} alerts detected:")
    for alert in alerts:
        print(f"   {alert}")

    # TODO: Extend to send Slack messages or emails
    # Example: send_slack_alert(alerts)

def main():
    print("🔍 PTBiz SMS Insights - System Monitor")
    print("=" * 50)

    # Generate fresh report
    if not generate_report():
        print("❌ Cannot proceed without report generation")
        return

    # Parse monitoring data
    data = parse_report()
    if not data:
        print("❌ Failed to parse monitoring data")
        return

    print("📈 Current System Metrics:")
    print(f"   Latest Snapshots: {data['snapshots'][-1] if data['snapshots'] else 0}")
    print(f"   Board Health: {data['healthy_boards']}/{data['total_boards']} healthy")
    print(f"   Fresh Syncs (1h): {data['fresh_syncs']}")
    print(f"   Conversion Rate: {data['conversion_rate']:.2f}")
    print()

    # Detect anomalies
    alerts = detect_anomalies(data)

    # Send alerts
    send_alerts(alerts)

    print("\n✅ Monitoring cycle complete")

if __name__ == "__main__":
    main()