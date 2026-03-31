from datetime import datetime
from statistics import mean, stdev
import math

# Daily snapshot trends data
data = [
    ('2026-03-16', 24),
    ('2026-03-18', 16),
    ('2026-03-19', 1),
    ('2026-03-20', 25),
    ('2026-03-21', 2),
    ('2026-03-22', 4),
    ('2026-03-23', 2)
]

# Sort by date
data.sort(key=lambda x: datetime.fromisoformat(x[0]))

snapshots = [x[1] for x in data]

print("Dataset Overview:")
print(f"Records: {len(data)}")
print(f"Date range: {data[0][0]} to {data[-1][0]}")
print(f"Total snapshots: {sum(snapshots)}")
print()

print("Statistical Summary:")
print(f"Count: {len(snapshots)}")
print(f"Mean: {mean(snapshots):.2f}")
print(f"Std Dev: {stdev(snapshots):.2f}")
print(f"Min: {min(snapshots)}")
print(f"Max: {max(snapshots)}")
print()

print("Daily Trends:")
for date, count in data:
    print(f"{date}: {count}")
print()

# KPIs
kpis = {
    'Recent Bookings': 74,
    'Unique Leads': 60,
    'Fresh Syncs (1h)': 2,
    'Missing Keys': 0
}

print("KPIs Analysis:")
print(f"Bookings: {kpis['Recent Bookings']}")
print(f"Unique Leads: {kpis['Unique Leads']}")
print(f"Conversion Rate: {kpis['Recent Bookings']/kpis['Unique Leads']:.2f} bookings per lead")
print(f"Fresh Syncs: {kpis['Fresh Syncs (1h)']} (low activity)")
print(f"Missing Keys: {kpis['Missing Keys']} (0.0% - excellent)")
print()

# Board health
total_boards = 20
healthy_boards = 14
avg_stale_hours = 31.0

print("Board Health Analysis:")
print(f"Total Boards: {total_boards}")
print(f"Healthy Boards: {healthy_boards} ({healthy_boards/total_boards*100:.1f}%)")
print(f"Average Stale Time: {avg_stale_hours}h (threshold: 24h)")
print(f"Boards needing attention: {total_boards - healthy_boards}")
print()

# Insights
print("Key Insights:")
print("1. Snapshot activity is highly variable, with peaks on 2026-03-20 (25) and lows on 2026-03-19 (1)")
print("2. Average daily snapshots: 10.6, but recent days show declining trend")
print("3. High conversion rate (1.23 bookings per lead) indicates effective lead management")
print("4. Sync health concerning: only 70% of boards healthy, avg stale time 31h exceeds 24h threshold")
print("5. No missing keys - data integrity excellent")
print()

# Recommendations
print("Recommendations:")
print("1. Investigate cause of snapshot variability - check for system issues or seasonal patterns")
print("2. Address board sync issues - 6 boards stale, risking data freshness")
print("3. Monitor fresh syncs - only 2 in last hour suggests low activity or sync problems")
print("4. Maintain high conversion rate through continued optimization of lead-to-booking process")