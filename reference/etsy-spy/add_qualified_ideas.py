#!/usr/bin/env python3
"""
Script to add at least 10 new qualified Etsy ideas to the backlog.
"""

import subprocess
import json
import sys
import os
from pathlib import Path

# Define keywords
KEYWORDS = [
    "shirt", "t-shirt", "sweatshirt", "graphic tee", 
    "fathers day", "mothers day", "gardening", 
    "cottagecore", "summer shirt", "hoodie"
]

def run_etsy_search(keyword):
    """Run etsy_search.py for a keyword and return parsed JSON."""
    cmd = [
        "python3", "scripts/etsy_search.py", 
        keyword, 
        "--stealth", 
        "--limit", "30",
        "--json"
    ]
    
    print(f"🔍 Searching for: '{keyword}'")
    
    try:
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            cwd="/Users/duytan/.openclaw/skills/etsy-spy"
        )
        
        if result.returncode != 0:
            print(f"  ❌ Error searching for '{keyword}': {result.stderr}")
            return {"hot": [], "watch": [], "skip": []}
        
        # Extract JSON from stdout (may have preceding lines)
        lines = result.stdout.strip().split('\n')
        json_start = None
        for i, line in enumerate(lines):
            if line.startswith('{'):
                json_start = i
                break
        if json_start is None:
            print(f"  ❌ No JSON found in output for '{keyword}'")
            return {"hot": [], "watch": [], "skip": []}
        json_str = '\n'.join(lines[json_start:])
        data = json.loads(json_str)
        print(f"  ✅ Found: {len(data.get('hot', []))} hot, {len(data.get('watch', []))} watch")
        return data
        
    except json.JSONDecodeError as e:
        print(f"  ❌ Failed to parse JSON for '{keyword}': {e}")
        return {"hot": [], "watch": [], "skip": []}
    except Exception as e:
        print(f"  ❌ Unexpected error for '{keyword}': {e}")
        return {"hot": [], "watch": [], "skip": []}

def check_qualification(listing):
    """Check if a listing meets qualification rules."""
    # Extract metrics with defaults
    sold_24h = float(listing.get("sold_24h", 0) or 0)
    views_24h = float(listing.get("views_24h", 0) or 0)
    hey = float(listing.get("hey", 0) or 0)
    days_old = float(listing.get("days_old", 999) or 999)
    
    # Qualification rules from etsy_spy.py
    qualified = False
    qualified_by = []
    
    if sold_24h >= 2:
        qualified = True
        qualified_by.append("rule_1_sold_24h_ge_2")
    if views_24h >= 120:
        qualified = True
        qualified_by.append("rule_2_views_24h_ge_120")
    if views_24h >= 80 and hey >= 8:
        qualified = True
        qualified_by.append("rule_3_views_24h_ge_80_and_hey_ge_8")
    if days_old <= 30 and hey >= 10 and views_24h >= 40:
        qualified = True
        qualified_by.append("rule_4_days_old_le_30_and_hey_ge_10_and_views_24h_ge_40")
    if sold_24h >= 3 and days_old <= 90:
        qualified = True
        qualified_by.append("rule_5_sold_24h_ge_3_and_days_old_le_90")
    
    return qualified, qualified_by, sold_24h, views_24h, hey, days_old

def add_to_backlog(listing, keyword, qualified_by):
    """Add a qualified listing to the backlog."""
    listing_id = listing.get("id", "")
    if not listing_id:
        print(f"  ❌ No listing ID for listing: {listing.get('title', 'Unknown')}")
        return False
    
    # Build command
    cmd = [
        "python3", "scripts/etsy_backlog.py", "add",
        "--listing-id", str(listing_id),
        "--search-keyword", keyword,
        "--title", listing.get("title", ""),
        "--url", listing.get("url", ""),
        "--price", str(listing.get("price", "")),
        "--currency", listing.get("currency", "USD"),
        "--shop-name", listing.get("shop_name", ""),
        "--shop-url", listing.get("shop_url", ""),
        "--sold-24h", str(listing.get("sold_24h", 0) or 0),
        "--views-24h", str(listing.get("views_24h", 0) or 0),
        "--hey-score", str(listing.get("hey", 0) or 0),
        "--days-old", str(listing.get("days_old", "") or ""),
        "--niche", listing.get("niche", ""),
        "--workflow-status", "spied",
        "--save-reason", ",".join(qualified_by)
    ]
    
    print(f"  ➕ Adding listing {listing_id}: {listing.get('title', 'Unknown')[:50]}...")
    
    try:
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            cwd="/Users/duytan/.openclaw/skills/etsy-spy"
        )
        
        if result.returncode == 0:
            print(f"    ✅ Added successfully")
            return True
        else:
            print(f"    ❌ Failed to add: {result.stderr[:100]}")
            return False
            
    except Exception as e:
        print(f"    ❌ Error adding listing: {e}")
        return False

def main():
    print("🚀 Starting Etsy auto-add task")
    print(f"📋 Keywords to search: {len(KEYWORDS)}")
    print("=" * 50)
    
    added_count = 0
    added_ids = []
    
    for keyword in KEYWORDS:
        if added_count >= 10:
            print(f"\n✅ Reached target of {added_count} added listings. Stopping.")
            break
            
        # Search for listings
        results = run_etsy_search(keyword)
        
        # Combine hot and watch listings
        all_listings = results.get("hot", []) + results.get("watch", [])
        
        if not all_listings:
            print(f"  ⏭️ No listings found for '{keyword}', moving on.")
            continue
        
        # Check each listing
        for listing in all_listings:
            if added_count >= 10:
                break
                
            qualified, qualified_by, sold_24h, views_24h, hey, days_old = check_qualification(listing)
            
            if qualified:
                print(f"  ✓ Qualified: {listing.get('title', 'Unknown')[:60]}")
                print(f"    Metrics: sold_24h={sold_24h}, views_24h={views_24h}, hey={hey}, days_old={days_old}")
                print(f"    Rules: {qualified_by}")
                
                # Add to backlog
                success = add_to_backlog(listing, keyword, qualified_by)
                if success:
                    added_count += 1
                    added_ids.append(listing.get("id", ""))
                    print(f"    📊 Progress: {added_count}/10 added")
        
        print()  # Blank line between keywords
    
    # Summary
    print("=" * 50)
    print("📊 FINAL SUMMARY")
    print(f"✅ Total added: {added_count}")
    if added_ids:
        print(f"📋 Added listing IDs: {added_ids}")
    else:
        print("❌ No listings were added.")
    
    return added_count, added_ids

if __name__ == "__main__":
    added_count, added_ids = main()
    sys.exit(0 if added_count >= 10 else 1)