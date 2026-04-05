#!/usr/bin/env python3
"""
Fetch missing analytics for today's backlog rows and update them.
"""
import subprocess, json, sys, os, datetime, time

def get_backlog_today():
    cmd = [sys.executable, "etsy_backlog.py", "list"]
    out = subprocess.check_output(cmd, text=True, timeout=30, cwd=os.path.dirname(__file__))
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
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    return [row for row in rows if row.get('spy_date') == today]

def get_analytics(listing_id):
    cmd = [sys.executable, "etsy_analytics.py", "listing", str(listing_id)]
    try:
        out = subprocess.check_output(cmd, text=True, timeout=30, cwd=os.path.dirname(__file__))
        data = {}
        for line in out.split('\n'):
            if ':' in line:
                k, v = line.split(':', 1)
                data[k.strip()] = v.strip()
        return data
    except Exception as e:
        print(f"  Analytics error: {e}")
        return {}

def update_row(row_id, updates):
    # Build command: etsy_backlog.py update --ids <row_id> --field1 val1 ...
    cmd = [sys.executable, "etsy_backlog.py", "update", "--ids", str(row_id)]
    for field, val in updates.items():
        if val is not None and val != "":
            cmd.extend([f"--{field.replace('_', '-')}", str(val)])
    try:
        subprocess.run(cmd, timeout=30, cwd=os.path.dirname(__file__), capture_output=True)
        return True
    except Exception as e:
        print(f"  Update error: {e}")
        return False

def main():
    rows = get_backlog_today()
    print(f"Found {len(rows)} rows from today.")
    updated = 0
    for row in rows:
        rid = row.get('id')
        lid = row.get('listing_id')
        sold = row.get('sold_24h', '0')
        views = row.get('views_24h', '0')
        tags = row.get('tags', '')
        # If missing essential data
        if sold in ('0', '0.0', '') or views in ('0', '0.0', '') or tags == '':
            print(f"\nRow {rid} (#{lid}) missing data → fetching analytics...")
            analytics = get_analytics(lid)
            if not analytics:
                print("  No analytics data.")
                continue
            # Map analytics fields to backlog fields
            updates = {}
            sold_new = analytics.get('Sold (24h)', '0')
            views_new = analytics.get('Views (24h)', '0')
            hey = analytics.get('Hey', '0')
            days = analytics.get('Age (days)', '0')
            total = analytics.get('Total Sold', '0')
            revenue = analytics.get('Estimated Revenue', '0')
            tags_new = analytics.get('Tags', '')
            # Convert
            try:
                sold_new_f = float(sold_new.replace(',', '')) if sold_new else 0.0
                views_new_f = float(views_new.replace(',', '')) if views_new else 0.0
                hey_f = float(hey) if hey else 0.0
                days_f = float(days) if days else 0.0
            except:
                sold_new_f = 0.0
                views_new_f = 0.0
                hey_f = 0.0
                days_f = 0.0
            # Only update if new data is different
            if sold_new_f > 0 or views_new_f > 0 or tags_new:
                updates['sold_24h'] = sold_new_f
                updates['views_24h'] = views_new_f
                updates['hey_score'] = hey_f
                updates['days_old'] = days_f
                updates['total_sold'] = total.replace(',', '') if total else '0'
                updates['estimated_revenue'] = revenue
                updates['tags'] = tags_new[:200]
                print(f"  New data: sold_24h={sold_new_f}, views_24h={views_new_f}, tags={tags_new[:50]}...")
                if update_row(rid, updates):
                    updated += 1
                    print(f"  Updated row {rid}.")
                else:
                    print(f"  Failed to update row {rid}.")
            else:
                print(f"  No better data.")
            time.sleep(1)  # be nice to API
    print(f"\n✅ Updated {updated} rows.")

if __name__ == "__main__":
    main()