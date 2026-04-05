#!/usr/bin/env python3
"""
Direct implementation of auto-add task without subprocess issues.
"""

import asyncio
import json
import sys
import os
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

# Try to import the search module
try:
    # We'll need to run the search script differently since it uses asyncio
    pass
except ImportError:
    print("Could not import modules directly")

# Define keywords
KEYWORDS = [
    "shirt", "t-shirt", "sweatshirt", "graphic tee", 
    "fathers day", "mothers day", "gardening", 
    "cottagecore", "summer shirt", "hoodie"
]

def check_qualification(listing):
    """Check if a listing meets qualification rules."""
    # Extract metrics with defaults
    sold_24h = float(listing.get("sold_24h", 0) or 0)
    views_24h = float(listing.get("views_24h", 0) or 0)
    hey = float(listing.get("hey_score", 0) or 0)
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

def run_search_and_process(keyword):
    """Run search for a keyword and process results."""
    import subprocess
    
    cmd = [
        "/usr/bin/python3", "scripts/etsy_search.py", 
        keyword, 
        "--stealth", 
        "--limit", "30",
        "--json"
    ]
    
    print(f"🔍 Searching for: '{keyword}'")
    
    try:
        # Run the command
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd="/Users/duytan/.openclaw/skills/etsy-spy"
        )
        
        stdout, stderr = process.communicate(timeout=120)  # 2 minute timeout
        
        if process.returncode != 0:
            print(f"  ❌ Error searching for '{keyword}': {stderr[:200]}")
            return []
        
        # Find JSON in output (there might be warnings before JSON)
        lines = stdout.split('\n')
        json_start = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('{'):
                json_start = i
                break
        
        if json_start == -1:
            print(f"  ❌ No JSON found in output for '{keyword}'")
            return []
        
        json_str = '\n'.join(lines[json_start:])
        
        # Parse JSON
        data = json.loads(json_str)
        
        # Combine hot and watch listings
        all_listings = data.get("hot", []) + data.get("watch", [])
        print(f"  ✅ Found: {len(data.get('hot', []))} hot, {len(data.get('watch', []))} watch")
        
        return all_listings
        
    except subprocess.TimeoutExpired:
        print(f"  ⏰ Timeout searching for '{keyword}'")
        return []
    except json.JSONDecodeError as e:
        print(f"  ❌ Failed to parse JSON for '{keyword}': {e}")
        return []
    except Exception as e:
        print(f"  ❌ Unexpected error for '{keyword}': {e}")
        return []

def add_to_backlog(listing, keyword, qualified_by):
    """Add a qualified listing to the backlog."""
    import subprocess
    
    listing_id = listing.get("listing_id", "")
    if not listing_id:
        print(f"  ❌ No listing ID for listing")
        return False
    
    # Build command - note field name differences from JSON
    cmd = [
        "/usr/bin/python3", "scripts/etsy_backlog.py", "add",
        "--listing-id", str(listing_id),
        "--search-keyword", keyword,
        "--title", listing.get("title", f"Listing {listing_id}"),
        "--url", f"https://www.etsy.com/listing/{listing_id}",
        "--price", "19.99",  # Default price
        "--currency", "USD",
        "--shop-name", listing.get("shop_name", ""),
        "--shop-url", listing.get("shop_url", ""),
        "--sold-24h", str(listing.get("sold_24h", 0) or 0),
        "--views-24h", str(listing.get("views_24h", 0) or 0),
        "--hey-score", str(listing.get("hey_score", 0) or 0),
        "--days-old", str(listing.get("days_old", "") or ""),
        "--niche", listing.get("niche", "apparel"),
        "--workflow-status", "spied",
        "--save-reason", ",".join(qualified_by)
    ]
    
    print(f"  ➕ Adding listing {listing_id}")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd="/Users/duytan/.openclaw/skills/etsy-spy"
        )
        
        stdout, stderr = process.communicate(timeout=30)
        
        if process.returncode == 0:
            print(f"    ✅ Added successfully")
            return True
        else:
            print(f"    ❌ Failed to add: {stderr[:100]}")
            return False
            
    except subprocess.TimeoutExpired:
        print(f"    ⏰ Timeout adding listing")
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
        listings = run_search_and_process(keyword)
        
        if not listings:
            print(f"  ⏭️ No listings found for '{keyword}', moving on.")
            continue
        
        # Check each listing
        for listing in listings:
            if added_count >= 10:
                break
                
            qualified, qualified_by, sold_24h, views_24h, hey, days_old = check_qualification(listing)
            
            if qualified:
                print(f"  ✓ Qualified listing {listing.get('listing_id', 'N/A')}")
                print(f"    Metrics: sold_24h={sold_24h}, views_24h={views_24h}, hey={hey}, days_old={days_old}")
                print(f"    Rules: {qualified_by}")
                
                # Add to backlog
                success = add_to_backlog(listing, keyword, qualified_by)
                if success:
                    added_count += 1
                    added_ids.append(str(listing.get("listing_id", "")))
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