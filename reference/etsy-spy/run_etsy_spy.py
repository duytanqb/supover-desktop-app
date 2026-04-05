#!/usr/bin/env python3
"""
Simple Etsy Spy runner to search for apparel and mug products.
"""
import subprocess
import json
import sys
import os
import time

def qualify(sold, views, hey, days):
    """Check if listing qualifies for backlog."""
    if sold >= 2: return True, "rule1"
    if views >= 120: return True, "rule2"
    if views >= 80 and hey >= 8: return True, "rule3"
    if days <= 30 and hey >= 10 and views >= 40: return True, "rule4"
    if sold >= 3 and days <= 90: return True, "rule5"
    return False, None

def run_etsy_search(keyword, limit=15):
    """Run etsy_search.py directly."""
    cmd = [sys.executable, "scripts/etsy_search.py", keyword, 
           "--stealth", "--limit", str(limit), "--json"]
    try:
        print(f"Running search for: {keyword}")
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            print(f"Error: {result.stderr[:200]}")
            return {"hot": [], "watch": [], "skip": []}
        
        # Extract JSON from output
        lines = result.stdout.split('\n')
        json_start = None
        for i, line in enumerate(lines):
            if line.strip().startswith('{'):
                json_start = i
                break
        
        if json_start is None:
            print(f"No JSON found in output")
            return {"hot": [], "watch": [], "skip": []}
        
        json_str = '\n'.join(lines[json_start:])
        return json.loads(json_str)
    except Exception as e:
        print(f"Exception: {e}")
        return {"hot": [], "watch": [], "skip": []}

def add_to_backlog(listing, keyword, rule):
    """Add qualified listing to backlog."""
    cmd = [
        sys.executable, "scripts/etsy_backlog.py", "add",
        "--listing-id", str(listing.get("listing_id", "")),
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
        "--design-angle", "Apparel/Mug filtered",
        "--workflow-status", "spied"
    ]
    
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return True
        else:
            print(f"Add failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"Add exception: {e}")
        return False

def get_existing_ids():
    """Get existing listing IDs from backlog."""
    try:
        cmd = [sys.executable, "scripts/etsy_backlog.py", "--json", "list", "--workflow-status", "spied"]
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {str(d.get("listing_id")) for d in data if d.get("listing_id")}
    except:
        pass
    return set()

def main():
    """Main function to search and add qualified listings."""
    keywords = [
        "t-shirt", "shirt", "hoodie", "sweatshirt", "sweater",
        "mug", "coffee mug", "travel mug"
    ]
    
    existing_ids = get_existing_ids()
    print(f"Found {len(existing_ids)} existing listings in backlog")
    
    added_count = 0
    added_ids = []
    
    for keyword in keywords:
        if added_count >= 10:
            break
            
        print(f"\n{'='*50}")
        print(f"Searching: {keyword}")
        
        # Run search
        data = run_etsy_search(keyword, limit=15)
        
        # Process results
        hot_listings = data.get("hot", [])
        watch_listings = data.get("watch", [])
        
        print(f"Found {len(hot_listings)} hot + {len(watch_listings)} watch listings")
        
        # Check all listings
        for listing in hot_listings + watch_listings:
            if added_count >= 10:
                break
                
            listing_id = str(listing.get("listing_id", ""))
            if not listing_id or listing_id in existing_ids:
                continue
                
            sold = listing.get("sold_24h", 0)
            views = listing.get("views_24h", 0)
            hey = listing.get("hey_score", 0)
            days = listing.get("days_old", 999)
            
            qualifies, rule = qualify(sold, views, hey, days)
            
            if qualifies:
                print(f"✅ Qualified: {listing_id} (sold_24h={sold}, views_24h={views}, rule={rule})")
                
                # Add to backlog
                if add_to_backlog(listing, keyword, rule):
                    added_count += 1
                    added_ids.append(listing_id)
                    existing_ids.add(listing_id)
                    print(f"  Added {added_count}/10")
                    
                    # Small delay to avoid rate limits
                    time.sleep(1)
                else:
                    print(f"  ❌ Failed to add {listing_id}")
    
    # Summary
    print(f"\n{'='*50}")
    print("SUMMARY")
    print(f"{'='*50}")
    print(f"Total added: {added_count}")
    
    if added_ids:
        print(f"Added listing IDs: {added_ids}")
        
        # Show metrics for added listings
        print("\nMetrics for added listings:")
        for listing_id in added_ids:
            print(f"  - {listing_id}")
    else:
        print("No new listings added.")
    
    return added_count

if __name__ == "__main__":
    main()