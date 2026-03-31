#!/usr/bin/env python3
"""
Root Cause Analysis for PTBiz SMS Insights
Investigates low activity periods and system issues
"""

import subprocess
import json
from datetime import datetime, timedelta
import statistics

def run_command(cmd, cwd='apps/backend'):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def check_system_logs():
    """Check for errors in recent logs"""
    print("🔍 Checking system logs for errors...")

    # Check if there are any error logs or recent failures
    # Since we can't access actual logs, check for common failure patterns

    # Check database connectivity
    code, stdout, stderr = run_command("node --import tsx -e \"import('./services/prisma.ts').then(m => m.getPrismaClient()).then(() => console.log('DB OK')).catch(e => console.error('DB FAIL:', e.message))\"")
    if code != 0 or 'DB FAIL' in stdout:
        return "Database connectivity issues detected"

    # Check if services can start
    code, stdout, stderr = run_command("timeout 10s node --import tsx app.ts 2>&1 | head -20")
    if 'error' in stdout.lower() or 'fail' in stdout.lower():
        return "Application startup issues detected"

    return None

def analyze_activity_patterns():
    """Analyze activity patterns for anomalies"""
    print("📊 Analyzing activity patterns...")

    # Read the report
    try:
        with open('apps/backend/LIVE-DATABASE-REPORT.md', 'r') as f:
            content = f.read()
    except:
        return "Cannot read report data"

    # Extract snapshot data
    snapshots = []
    lines = content.split('\n')
    in_trends = False

    for line in lines:
        line = line.strip()
        if 'Daily Snapshot Trends' in line:
            in_trends = True
            continue
        if in_trends and '2026-' in line and ': ' in line:
            parts = line.split(': ')
            if len(parts) == 2:
                try:
                    date_str, count_str = parts
                    count = int(count_str.strip())
                    snapshots.append((date_str, count))
                except:
                    pass
        if in_trends and '```' in line:
            in_trends = False

    if not snapshots:
        return "No snapshot data available for analysis"

    # Analyze patterns
    counts = [s[1] for s in snapshots]
    if len(counts) < 2:
        return "Insufficient data for pattern analysis"

    mean_count = statistics.mean(counts)
    min_count = min(counts)
    min_date = next(s[0] for s in snapshots if s[1] == min_count)

    # Check for extreme lows
    if min_count < mean_count * 0.1:  # Less than 10% of average
        return f"Extreme low activity detected on {min_date}: {min_count} snapshots (avg: {mean_count:.1f})"

    # Check for consecutive lows
    low_threshold = mean_count * 0.5
    consecutive_lows = 0
    for count in counts[-3:]:  # Last 3 days
        if count < low_threshold:
            consecutive_lows += 1

    if consecutive_lows >= 2:
        return f"Consecutive low activity in recent days: {consecutive_lows} days below {low_threshold:.1f} threshold"

    return None

def check_external_services():
    """Check external service status"""
    print("🌐 Checking external service connectivity...")

    issues = []

    # Check Monday.com API (simplified)
    # In real implementation, would make actual API calls
    print("   Monday.com: Cannot verify without API credentials")

    # Check Slack connectivity
    # Would check Slack API status
    print("   Slack: Cannot verify without bot token")

    # Check Railway database
    db_url = run_command("railway variables --service sms-insights --json | python3 -c \"import json,sys; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL',''))\"")
    if db_url[0] != 0 or not db_url[1].strip():
        issues.append("Railway database URL not accessible")

    return issues

def check_code_deployments():
    """Check for recent code changes that might affect activity"""
    print("📦 Checking for recent deployments...")

    # Check git log for recent commits
    code, stdout, stderr = run_command("git log --oneline -10 --since='3 days ago'")
    if code == 0 and stdout.strip():
        commits = stdout.strip().split('\n')
        print(f"   Found {len(commits)} recent commits")
        # In real RCA, would analyze commit messages for breaking changes
    else:
        print("   No recent commits found")

    return None

def generate_recommendations(issues):
    """Generate recommendations based on findings"""
    recommendations = []

    if not issues:
        recommendations.append("No obvious issues found - consider monitoring for intermittent problems")
        return recommendations

    for issue in issues:
        if "Database connectivity" in issue:
            recommendations.extend([
                "Check Railway database status and connection limits",
                "Verify DATABASE_URL environment variable",
                "Review Prisma connection pool settings"
            ])
        elif "Application startup" in issue:
            recommendations.extend([
                "Check application logs for startup errors",
                "Verify all required environment variables are set",
                "Test individual service dependencies"
            ])
        elif "Extreme low activity" in issue:
            recommendations.extend([
                "Review system logs for the affected date",
                "Check external service outages (Aloware, Monday.com, Slack)",
                "Verify webhook configurations and API keys"
            ])
        elif "Consecutive low activity" in issue:
            recommendations.extend([
                "Implement detailed logging for activity tracking",
                "Set up alerts for activity drops below threshold",
                "Schedule regular system health checks"
            ])
        elif "Railway database" in issue:
            recommendations.extend([
                "Verify Railway service is running",
                "Check Railway account permissions",
                "Contact Railway support if service is down"
            ])

    return recommendations

def main():
    print("🔍 PTBiz SMS Insights - Root Cause Analysis")
    print("=" * 50)

    issues = []

    # Check system components
    system_issue = check_system_logs()
    if system_issue:
        issues.append(system_issue)

    # Analyze activity patterns
    pattern_issue = analyze_activity_patterns()
    if pattern_issue:
        issues.append(pattern_issue)

    # Check external services
    external_issues = check_external_services()
    issues.extend(external_issues)

    # Check deployments
    check_code_deployments()

    print(f"\n📋 Analysis Summary:")
    if issues:
        print(f"Found {len(issues)} potential issues:")
        for i, issue in enumerate(issues, 1):
            print(f"   {i}. {issue}")
    else:
        print("No obvious issues detected")

    # Generate recommendations
    recommendations = generate_recommendations(issues)

    print(f"\n💡 Recommendations:")
    for i, rec in enumerate(recommendations, 1):
        print(f"   {i}. {rec}")

    print("\n✅ Root cause analysis complete")

if __name__ == "__main__":
    main()