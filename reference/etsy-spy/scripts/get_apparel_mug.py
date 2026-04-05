#!/usr/bin/env python3
"""
Search Etsy for apparel (shirt, hoodie, sweater) and mug products only.
Filter by tags to exclude non‑apparel items.
"""
import subprocess, json, sys, os, time

KEYWORDS = [
    "t-shirt", "shirt", "hoodie", "sweatshirt", "sweater",
    "mug", "coffee mug", "travel mug"
]

# Apparel/mug related tags (lowercase)
APPAREL_TAGS = {"shirt", "tee", "t-shirt", "hoodie", "sweatshirt", "sweater", "pullover", "crewneck"}
MUG_TAGS = {"mug", "cup", "travel mug", "coffee mug"}

def qualify(sold24, views24, hey, days):
    if sold24 >= 2: return True
    if views24 >= 120: return True
    if views24 >= 80 and hey >= 8: return True
    if days <= 30 and hey >= 10 and views24 >= 40: return True
    if sold24 >= 3 and days <= 90: return True
    return False

def is_apparel_or_mug(tags_str):
    if not tags_str:
        return False
    tags = set(t.lower() for t in tags_str.split(','))
    # Check for apparel tags
    for tag in tags:
        if any(apparel in tag for apparel in APPAREL_TAGS):
            return True
        if any(mug in tag for mug in MUG_TAGS):
            return True
    return False

def run_search(keyword, limit=15):
    cmd = [sys.executable, "etsy_search.py", keyword,
           "--stealth", "--limit", str(limit), "--json"]
    try:
        out = subprocess.check_output(cmd, text=True, timeout=120, cwd=os.path.dirname(__file__))
        lines = out.split('\n')
        json_start = None
        for i, line in enumerate(lines):
            if line.startswith('{'):
                json_start = i
                break
        if json_start is None:
            return {"hot": [], "watch": [], "skip": []}
        return json.loads(''.join(lines[json_start:]))
    except Exception as e:
        print(f"Search error {keyword}: {e}")
        return {"hot": [], "watch": [], "skip": []}

def add_listing(listing, keyword):
    cmd = [sys.executable, "etsy_backlog.py", "add",
           "--listing-id", str(listing['listing_id']),
           "--search-keyword", keyword,
           "--source-query", keyword,
           "--query-chain", keyword,
           "--keyword-expansion", keyword,
           "--save-reason", "apparel-mug-filtered",
           "--niche", "apparel/mug",
           "--sold-24h", str(listing.get('sold_24h',0)),
           "--views-24h", str(listing.get('views_24h',0)),
           "--hey-score", str(listing.get('hey_score',0)),
           "--days-old", str(listing.get('days_old',0)),
           "--total-sold", str(listing.get('total_sold',0)),
           "--estimated-revenue", listing.get('revenue', ''),
           "--tags", listing.get('tags', ''),
           "--trend-status", listing.get('status', 'WATCH').replace('⚠️ ', '').replace('🔥 ', ''),
           "--trend-score", str(listing.get('score',0)),
           "--design-angle", "Apparel/Mug filtered",
           "--workflow-status", "spied"]
    try:
        subprocess.run(cmd, timeout=30, cwd=os.path.dirname(__file__), capture_output=True)
        return True
    except:
        return False

def main():
    added = 0
    for kw in KEYWORDS:
        print(f"\n🔍 {kw}")
        data = run_search(kw, limit=15)
        for cat in ['hot', 'watch']:
            for lst in data.get(cat, []):
                # Check qualification
                if not qualify(lst.get('sold_24h',0), lst.get('views_24h',0),
                               lst.get('hey_score',0), lst.get('days_old',999)):
                    continue
                # Check tags for apparel/mug
                if not is_apparel_or_mug(lst.get('tags', '')):
                    continue
                print(f"   ✅ #{lst['listing_id']} sold_24h={lst.get('sold_24h')} views_24h={lst.get('views_24h')}")
                if add_listing(lst, kw):
                    added += 1
                    time.sleep(0.5)
                else:
                    print("   ❌ add failed")
        print(f"   {len(data.get('hot',[]))} hot, {len(data.get('watch',[]))} watch, {len(data.get('skip',[]))} skip")
    print(f"\n🎯 Added {added} new apparel/mug ideas.")

if __name__ == "__main__":
    main()