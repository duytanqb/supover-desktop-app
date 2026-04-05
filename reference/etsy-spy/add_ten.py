#!/usr/bin/env python3
"""
Add at least 10 new qualified Etsy listings quickly.
"""
import subprocess
import json
import sys
import os

KEYWORDS = [
    "mug", "coffee mug", "travel mug",
    "hoodie", "sweatshirt", "sweater",
    "t-shirt", "graphic tee", "fathers day", "mothers day"
]

def qualify(sold24, views24, hey, days):
    if sold24 >= 2: return True, "rule1"
    if views24 >= 120: return True, "rule2"
    if views24 >= 80 and hey >= 8: return True, "rule3"
    if days <= 30 and hey >= 10 and views24 >= 40: return True, "rule4"
    if sold24 >= 3 and days <= 90: return True, "rule5"
    return False, None

def run_search(keyword, limit=10):
    cmd = [sys.executable, "scripts/etsy_spy_wrapper.py", "search", keyword, "--limit", str(limit)]
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            print(f"  ❌ {keyword}: {result.stderr[:200]}")
            return []
        data = json.loads(result.stdout)
        return data.get("hot", []) + data.get("watch", [])
    except Exception as e:
        print(f"  ❌ {keyword}: {e}")
        return []

def add_listing(listing, keyword, rule):
    listing_id = listing.get("listing_id", "")
    cmd = [
        sys.executable, "scripts/etsy_backlog.py", "add",
        "--listing-id", str(listing_id),
        "--search-keyword", keyword,
        "--source-query", keyword,
        "--query-chain", keyword,
        "--keyword-expansion", keyword,
        "--save-reason", rule,
        "--niche", "apparel/mug",
        "--sold-24h", str(listing.get("sold_24h", 0)),
        "--views-24h", str(listing.get("views_24h", 0)),
        "--hey-score", str(listing.get("hey_score", 0)),
        "--days-old", str(listing.get("days_old", 0)),
        "--total-sold", str(listing.get("total_sold", 0)),
        "--estimated-revenue", listing.get("revenue", ""),
        "--tags", listing.get("tags", ""),
        "--trend-status", listing.get("status", "WATCH").replace("🔥 ", "").replace("⚠️ ", ""),
        "--trend-score", str(listing.get("score", 0)),
        "--design-angle", "Auto-qualified",
        "--workflow-status", "spied"
    ]
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return True
        else:
            print(f"    ❌ add failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"    ❌ add exception: {e}")
        return False

def main():
    added = 0
    added_ids = []
    seen_ids = set()
    
    # Load existing IDs to avoid duplicates
    try:
        cmd = [sys.executable, "scripts/etsy_backlog.py", "--json", "list", "--workflow-status", "spied"]
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            seen_ids = {str(d.get("listing_id")) for d in data if d.get("listing_id")}
            print(f"📋 Already have {len(seen_ids)} existing listings")
    except:
        pass
    
    for keyword in KEYWORDS:
        if added >= 10:
            break
        print(f"\n🔍 {keyword}")
        listings = run_search(keyword, limit=12)
        print(f"   Found {len(listings)} candidates")
        for lst in listings:
            if added >= 10:
                break
            lid = str(lst.get("listing_id", ""))
            if lid in seen_ids:
                continue
            sold = lst.get("sold_24h", 0)
            views = lst.get("views_24h", 0)
            hey = lst.get("hey_score", 0)
            days = lst.get("days_old", 999)
            qual, rule = qualify(sold, views, hey, days)
            if qual:
                print(f"   ✅ {lid} sold_24h={sold} views_24h={views} rule={rule}")
                if add_listing(lst, keyword, rule):
                    added += 1
                    added_ids.append(lid)
                    seen_ids.add(lid)
                    print(f"   📊 {added}/10 added")
                else:
                    print(f"   ❌ Failed to add {lid}")
    
    print("\n" + "="*50)
    print(f"✅ Added {added} new qualified listings")
    if added_ids:
        print(f"📋 IDs: {added_ids}")
    else:
        print("❌ No new listings added.")
    return added

if __name__ == "__main__":
    added = main()
    sys.exit(0 if added >= 10 else 1)