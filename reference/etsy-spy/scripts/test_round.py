#!/usr/bin/env python3
"""
Test one round: search, filter, add one qualified listing to backlog.
"""
import subprocess, sys, os, json, time

def run_search(keyword):
    cmd = [sys.executable, "etsy_search.py", keyword, "--stealth", "--limit", "10", "--json"]
    result = subprocess.run(cmd, cwd=os.path.dirname(__file__), capture_output=True, text=True)
    if result.returncode != 0:
        print("Search failed:", result.stderr)
        return None
    # Parse JSON from stdout
    lines = result.stdout.split('\n')
    json_start = None
    for i, line in enumerate(lines):
        if line.startswith('{'):
            json_start = i
            break
    if json_start is None:
        print("No JSON output")
        return None
    data = json.loads(''.join(lines[json_start:]))
    return data

def add_listing(listing):
    # Use etsy_add_simple.py
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
           "--search-keyword", "shirt"]
    result = subprocess.run(cmd, cwd=os.path.dirname(__file__), capture_output=True, text=True)
    return result.returncode == 0

def main():
    keyword = "shirt"
    print(f"🔍 Searching: {keyword}")
    data = run_search(keyword)
    if not data:
        return
    # Pick first WATCH or HOT listing
    candidates = data.get('hot', []) + data.get('watch', [])
    if not candidates:
        print("No qualified listings.")
        return
    listing = candidates[0]
    print(f"✅ Selected listing #{listing['listing_id']} (sold_24h={listing['sold_24h']}, views_24h={listing['views_24h']})")
    if add_listing(listing):
        print("✅ Added to backlog.")
    else:
        print("❌ Failed to add.")

if __name__ == "__main__":
    main()