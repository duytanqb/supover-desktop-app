#!/usr/bin/env python3
"""
Quick script to search Etsy for apparel/mug keywords and add qualified listings.
Uses etsy_spy_wrapper.py for clean JSON output.
"""
import subprocess
import json
import sys
import os

KEYWORDS = [
    "shirt", "t-shirt", "hoodie", "sweatshirt", "sweater",
    "mug", "coffee mug", "travel mug",
    "fathers day shirt", "mothers day mug"
]

def qualify(sold24, views24, hey, days):
    """Check qualification rules."""
    if sold24 >= 2:
        return True, "rule_1_sold_24h_ge_2"
    if views24 >= 120:
        return True, "rule_2_views_24h_ge_120"
    if views24 >= 80 and hey >= 8:
        return True, "rule_3_views_24h_ge_80_and_hey_ge_8"
    if days <= 30 and hey >= 10 and views24 >= 40:
        return True, "rule_4_days_old_le_30_and_hey_ge_10_and_views_24h_ge_40"
    if sold24 >= 3 and days <= 90:
        return True, "rule_5_sold_24h_ge_3_and_days_old_le_90"
    return False, None

def run_wrapper_search(keyword, limit=15):
    """Run etsy_spy_wrapper.py search and return parsed data."""
    cmd = [sys.executable, "scripts/etsy_spy_wrapper.py", "search", keyword, "--limit", str(limit)]
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ❌ Wrapper error: {result.stderr[:200]}")
            return {"hot": [], "watch": [], "skip": []}
        data = json.loads(result.stdout)
        return data
    except Exception as e:
        print(f"  ❌ Wrapper exception: {e}")
        return {"hot": [], "watch": [], "skip": []}

def add_to_backlog(listing, keyword, qualified_by):
    """Add listing via etsy_backlog.py."""
    # Extract metrics
    listing_id = listing.get("listing_id", "")
    sold_24h = listing.get("sold_24h", 0)
    views_24h = listing.get("views_24h", 0)
    hey_score = listing.get("hey_score", 0)
    days_old = listing.get("days_old", 0)
    total_sold = listing.get("total_sold", 0)
    revenue = listing.get("revenue", "")
    tags = listing.get("tags", "")
    status = listing.get("status", "WATCH").replace("🔥 ", "").replace("⚠️ ", "")
    score = listing.get("score", 0)
    
    cmd = [
        sys.executable, "scripts/etsy_backlog.py", "add",
        "--listing-id", str(listing_id),
        "--search-keyword", keyword,
        "--source-query", keyword,
        "--query-chain", keyword,
        "--keyword-expansion", keyword,
        "--save-reason", qualified_by,
        "--niche", "apparel/mug",
        "--sold-24h", str(sold_24h),
        "--views-24h", str(views_24h),
        "--hey-score", str(hey_score),
        "--days-old", str(days_old),
        "--total-sold", str(total_sold),
        "--estimated-revenue", revenue,
        "--tags", tags,
        "--trend-status", status,
        "--trend-score", str(score),
        "--design-angle", "Auto-qualified via quick_add",
        "--workflow-status", "spied"
    ]
    
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"    ✅ Added {listing_id}")
            return True
        else:
            print(f"    ❌ Add failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"    ❌ Add exception: {e}")
        return False

def main():
    print("🚀 Quick add of qualified Etsy listings")
    print(f"📋 Keywords: {len(KEYWORDS)}")
    added_count = 0
    added_ids = []
    
    for keyword in KEYWORDS:
        if added_count >= 10:
            break
        print(f"\n🔍 Searching: '{keyword}'")
        data = run_wrapper_search(keyword, limit=15)
        all_listings = data.get("hot", []) + data.get("watch", [])
        print(f"   Found {len(all_listings)} hot+watch listings")
        
        for listing in all_listings:
            if added_count >= 10:
                break
            sold24 = listing.get("sold_24h", 0)
            views24 = listing.get("views_24h", 0)
            hey = listing.get("hey_score", 0)
            days = listing.get("days_old", 999)
            qualified, rule = qualify(sold24, views24, hey, days)
            if qualified:
                print(f"   ✅ Qualified: {listing.get('listing_id')} sold_24h={sold24}, views_24h={views24}, rule={rule}")
                success = add_to_backlog(listing, keyword, rule)
                if success:
                    added_count += 1
                    added_ids.append(listing.get("listing_id"))
                    print(f"   📊 Progress: {added_count}/10")
    
    print("\n" + "="*50)
    print(f"📊 FINAL SUMMARY: Added {added_count} listings")
    if added_ids:
        print(f"📋 Added IDs: {added_ids}")
    else:
        print("❌ No listings added.")
    
    return added_count

if __name__ == "__main__":
    added = main()
    sys.exit(0 if added >= 10 else 1)