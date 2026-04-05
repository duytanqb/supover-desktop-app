#!/usr/bin/env python3
"""
Batch spy with new keywords.
"""
import subprocess, sys, os, json, time

def run_search(keyword, limit=10, stealth=True):
    cmd = [sys.executable, "etsy_search.py",
           keyword,
           "--limit", str(limit),
           "--json"]
    if stealth:
        cmd.append("--stealth")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=script_dir)
    if result.returncode != 0:
        print(f"Search failed for {keyword}:", result.stderr[:500])
        return None
    lines = result.stdout.split('\n')
    json_start = None
    for i, line in enumerate(lines):
        if line.startswith('{'):
            json_start = i
            break
    if json_start is None:
        print(f"No JSON output for {keyword}")
        return None
    data = json.loads(''.join(lines[json_start:]))
    return data

def add_listing(listing, keyword):
    cmd = [sys.executable, "etsy_add_simple.py",
           "--listing-id", str(listing['listing_id']),
           "--sold-24h", str(listing['sold_24h']),
           "--views-24h", str(listing['views_24h']),
           "--hey-score", str(listing['hey_score']),
           "--days-old", str(listing['days_old']),
           "--total-sold", str(listing['total_sold']),
           "--estimated-revenue", listing['revenue'],
           "--tags", listing['tags'],
           "--title", listing.get('title', ''),
           "--mockup-url", listing.get('mockup_url', ''),
           "--search-keyword", keyword]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=script_dir)
    return result.returncode == 0

def main():
    keywords = ["graphic tee", "funny mug", "sweatshirt", "hoodie design", "personalized shirt"]
    added_total = 0
    for keyword in keywords:
        print(f"\n🔍 Searching: {keyword}")
        data = run_search(keyword, limit=10, stealth=True)
        if not data:
            continue
        hot = data.get('hot', [])
        watch = data.get('watch', [])
        candidates = hot + watch
        print(f"   Found {len(candidates)} qualified listings ({len(hot)} HOT, {len(watch)} WATCH)")
        added = 0
        for listing in candidates:
            try:
                if add_listing(listing, keyword):
                    added += 1
                    print(f"      Added #{listing['listing_id']} (sold_24h={listing['sold_24h']})")
                else:
                    print(f"      Failed to add #{listing['listing_id']}")
            except Exception as e:
                print(f"      Error adding #{listing['listing_id']}: {e}")
        added_total += added
        print(f"   Added {added} for {keyword}")
    print(f"\n📊 Total added across all keywords: {added_total}")

if __name__ == "__main__":
    main()