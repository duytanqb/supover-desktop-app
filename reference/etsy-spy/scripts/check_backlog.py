#!/usr/bin/env python3
import subprocess, json, sys, os, datetime

cmd = [sys.executable, "etsy_backlog.py", "list"]
try:
    out = subprocess.check_output(cmd, text=True, timeout=30, cwd=os.path.dirname(__file__))
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

rows = []
for line in out.split('\n'):
    line = line.strip()
    if not line.startswith('spied |'):
        continue
    json_str = line.split('|', 1)[1].strip()
    try:
        rows.append(json.loads(json_str))
    except:
        pass

print(f"Total ideas in backlog: {len(rows)}")
today = datetime.datetime.now().strftime("%Y-%m-%d")
today_rows = [row for row in rows if row.get('spy_date') == today]
print(f"Ideas added today ({today}): {len(today_rows)}\n")

expected = ["listing_id", "sold_24h", "views_24h", "hey_score", "days_old", "total_sold", "estimated_revenue", "tags", "trend_status", "trend_score", "design_angle", "workflow_status"]
missing_counts = {field: 0 for field in expected}
for idx, row in enumerate(today_rows, start=1):
    print(f"\n{idx}. #{row.get('listing_id', 'N/A')} ({row.get('search_keyword', '')})")
    missing = []
    for field in expected:
        val = row.get(field)
        if val is None or val == "" or (isinstance(val, (int, float)) and val == 0 and field not in ["sold_24h", "views_24h", "hey_score", "days_old"]):
            missing.append(field)
            missing_counts[field] += 1
    if missing:
        print(f"   ❌ Missing: {', '.join(missing)}")
    else:
        print("   ✅ OK")

print(f"\n--- Summary of missing fields (across {len(today_rows)} rows) ---")
for field, count in missing_counts.items():
    if count > 0:
        print(f"{field}: {count} rows missing")