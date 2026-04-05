#!/usr/bin/env python3
"""
Etsy Keyword Auto-Discovery

Strategies:
1. Etsy autocomplete - Type prefix, get suggestions
2. Expand from winners - Take tags from HOT products, search those
3. Google Trends - What's rising
4. Seasonal calendar - Auto-detect upcoming events
5. Related searches - Etsy "related to" suggestions

This script currently supports autocomplete/seasonal/tag expansion well enough
for a listing-first workflow. Store keeper expansions in the backlog workbook's
`keyword_log` sheet (via `etsy_backlog.py log-keyword` or `etsy_spy.py backlog-add`)
so later searches keep their provenance. Future lightweight extensions can plug into the
same result buckets for:
- related listing scan from a seed listing page
- tag re-query batches from saved backlog winners
- shop-adjacent scan from a winning shop
"""

import argparse
import asyncio
import json
import re
import requests
from datetime import datetime, timedelta
from typing import List, Dict

# VK1ng API
VKING_API_KEY = "TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ"

# Seed prefixes for autocomplete discovery
SEED_PREFIXES = [
    "funny", "vintage", "retro", "custom", "personalized",
    "mom", "dad", "gift for", "trending", "aesthetic",
    "2026", "summer", "beach", "camping", "coffee",
]

# Seasonal events (auto-detect based on date)
SEASONAL_EVENTS = {
    (1, 1, 1, 15): ["new year 2026", "resolution shirt", "winter shirt"],
    (2, 1, 2, 14): ["valentines day", "love shirt", "couples shirt"],
    (3, 1, 3, 17): ["st patricks day", "irish shirt", "lucky shirt"],
    (4, 1, 4, 20): ["easter shirt", "spring shirt", "bunny shirt"],
    (5, 1, 5, 15): ["mothers day shirt", "mom gift", "mama shirt"],
    (5, 15, 6, 15): ["graduation 2026", "senior shirt", "class of 2026"],
    (6, 1, 6, 21): ["fathers day shirt", "dad gift", "papa shirt"],
    (6, 15, 7, 15): ["4th of july", "usa shirt", "patriotic shirt", "summer vacation"],
    (8, 1, 9, 15): ["back to school", "teacher shirt", "school shirt"],
    (9, 15, 10, 31): ["halloween shirt", "spooky shirt", "fall shirt"],
    (11, 1, 11, 30): ["thanksgiving shirt", "grateful shirt", "fall shirt"],
    (12, 1, 12, 31): ["christmas shirt", "holiday shirt", "winter shirt"],
}

def get_seasonal_keywords() -> List[str]:
    """Auto-detect seasonal keywords based on current date."""
    today = datetime.now()
    month, day = today.month, today.day
    
    keywords = []
    for (start_m, start_d, end_m, end_d), kws in SEASONAL_EVENTS.items():
        # Check if current date falls in range
        start = datetime(today.year, start_m, start_d)
        end = datetime(today.year, end_m, end_d)
        
        # Also check 2-3 weeks before (lead time for trends)
        lead_start = start - timedelta(days=21)
        
        if lead_start <= today <= end:
            keywords.extend(kws)
    
    return list(set(keywords))

async def get_etsy_autocomplete(port: int, prefix: str) -> List[str]:
    """Get Etsy search suggestions for a prefix."""
    from playwright.async_api import async_playwright
    
    pw = await async_playwright().start()
    browser = await pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
    ctx = browser.contexts[0]
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    
    # Go to Etsy
    await page.goto("https://www.etsy.com", wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(2)
    
    # Type in search box
    search_box = await page.query_selector('input[name="search_query"]')
    if search_box:
        await search_box.fill(prefix)
        await asyncio.sleep(1.5)  # Wait for autocomplete
        
        # Get suggestions
        suggestions = await page.evaluate('''() => {
            const items = document.querySelectorAll('[role="option"], [class*="suggestion"], [class*="autocomplete"] li');
            return Array.from(items).map(el => el.textContent.trim()).filter(t => t.length > 3);
        }''')
        
        await pw.stop()
        return suggestions[:10]
    
    await pw.stop()
    return []

async def expand_from_tags(winning_tags: str) -> List[str]:
    """Extract searchable keywords from winning product tags."""
    if not winning_tags:
        return []
    
    # Split tags
    tags = [t.strip() for t in winning_tags.split(",")]
    
    # Filter good search terms (2-4 words, no generic terms)
    generic = {"shirt", "tee", "gift", "top", "funny", "cute", "vintage"}
    keywords = []
    
    for tag in tags:
        words = tag.lower().split()
        # Skip if too generic or too specific
        if len(words) >= 2 and len(words) <= 4:
            if not all(w in generic for w in words):
                keywords.append(tag)
    
    return keywords[:5]

def get_vking_listing(listing_id: int) -> dict:
    """Get listing data from VK1ng."""
    resp = requests.get(
        f"https://vk1ng.com/api/listings/{listing_id}",
        headers={"Authorization": f"Bearer {VKING_API_KEY}"},
        timeout=30
    )
    if resp.status_code == 200:
        data = resp.json()
        if data.get("status"):
            return data.get("data", {})
    return {}

async def discover_keywords(port: int, method: str = "all") -> Dict[str, List[str]]:
    """
    Discover new keywords using multiple methods.
    
    Methods:
    - seasonal: Based on current date
    - autocomplete: Etsy search suggestions
    - expand: From winning product tags
    - all: Combine all methods
    """
    results = {
        "seasonal": [],
        "autocomplete": [],
        "expanded": [],
        # Placeholder buckets for future listing-first expansion hooks.
        "related": [],
        "shop_adjacent": [],
    }
    
    # 1. Seasonal keywords (no browser needed)
    if method in ["seasonal", "all"]:
        results["seasonal"] = get_seasonal_keywords()
        print(f"📅 Seasonal keywords: {results['seasonal']}")
    
    # 2. Autocomplete suggestions
    if method in ["autocomplete", "all"]:
        print("🔍 Getting autocomplete suggestions...")
        for prefix in SEED_PREFIXES[:5]:  # Limit to avoid rate limiting
            try:
                suggestions = await get_etsy_autocomplete(port, prefix + " shirt")
                results["autocomplete"].extend(suggestions)
                print(f"   '{prefix}': {len(suggestions)} suggestions")
                await asyncio.sleep(1)  # Rate limit
            except Exception as e:
                print(f"   '{prefix}': error - {e}")
        
        results["autocomplete"] = list(set(results["autocomplete"]))[:20]
    
    return results

async def auto_scale_search(port: int, initial_results: List[dict]) -> List[str]:
    """
    Given initial HOT products, extract their tags and generate new search keywords.
    This creates a feedback loop: find winners → extract tags → search those → find more winners
    """
    new_keywords = []
    
    for item in initial_results:
        if item.get("status") == "🔥 HOT":
            listing_id = item.get("listing_id")
            
            # Get full data
            data = get_vking_listing(listing_id)
            tags = data.get("tags", "")
            
            # Extract searchable keywords from tags
            expanded = await expand_from_tags(tags)
            new_keywords.extend(expanded)
            
            print(f"   #{listing_id}: extracted {len(expanded)} keywords from tags")
    
    return list(set(new_keywords))

async def main_async():
    parser = argparse.ArgumentParser(description="Auto-discover Etsy trending keywords")
    parser.add_argument("--port", "-p", type=int, required=True, help="HMA CDP port")
    parser.add_argument("--method", choices=["seasonal", "autocomplete", "expand", "all"], default="all")
    parser.add_argument("--json", action="store_true")
    
    args = parser.parse_args()
    
    print("🔍 ETSY KEYWORD AUTO-DISCOVERY")
    print("=" * 50)
    
    results = await discover_keywords(args.port, args.method)
    
    # Combine all keywords
    all_keywords = []
    for source, keywords in results.items():
        all_keywords.extend(keywords)
    
    all_keywords = list(set(all_keywords))
    
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(f"\n📊 DISCOVERED KEYWORDS")
        print(f"=" * 50)
        
        for source, keywords in results.items():
            if keywords:
                print(f"\n{source.upper()} ({len(keywords)}):")
                for kw in keywords[:10]:
                    print(f"   • {kw}")
        
        print(f"\n📈 Total unique keywords: {len(all_keywords)}")
        print(f"\n💡 Next step: Run search with these keywords")
        print(f"   python etsy_search.py --keywords \"{','.join(all_keywords[:5])}\" --port {args.port}")

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
