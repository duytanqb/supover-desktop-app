#!/usr/bin/env python3
"""
Etsy Product Search + Trending Filter

Workflow:
1. Search Etsy via HMA browser (bypass bot detection)
2. Extract listing IDs from search results
3. Pre-dedupe against workbook state (seen/backlog/excluded/frontier/cluster refs)
4. Get analytics via VK1ng API only for truly new listing IDs
5. Filter by trending rules
"""

import warnings
warnings.filterwarnings('ignore')

import argparse
import asyncio
import json
import re
import requests
from typing import List, Optional, Set

from etsy_backlog import filter_new_listing_ids

# VK1ng API
VKING_API_KEY = "TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ"
VKING_URL = "https://vk1ng.com/api"

# Trending keyword presets
KEYWORD_PRESETS = {
    "seasonal": [
        "mothers day shirt", "graduation 2026", "summer vacation tee",
        "4th of july shirt", "fathers day gift"
    ],
    "sports": [
        "pickleball shirt", "golf shirt funny", "tennis mom shirt",
        "gym motivation tee", "yoga lover shirt"
    ],
    "pets": [
        "dog mom shirt", "cat lover tee", "funny cat shirt",
        "rescue dog shirt", "dog dad shirt"
    ],
    "food": [
        "coffee lover shirt", "wine mom tee", "foodie shirt funny",
        "taco shirt", "avocado shirt"
    ],
    "hobby": [
        "book lover shirt", "camping shirt funny", "gardening tee",
        "fishing shirt funny", "hiking adventure"
    ],
    "retro": [
        "retro 70s shirt", "vintage 80s tee", "90s nostalgia shirt",
        "comfort colors vintage", "throwback graphic tee"
    ],
    "humor": [
        "funny sarcastic shirt", "introvert tee", "adulting is hard",
        "millennial humor shirt", "anxiety shirt funny"
    ],
    "trending": [
        "trendy shirt 2026", "aesthetic tee", "cottagecore shirt",
        "graphic tee trending", "viral shirt"
    ],
}

async def get_hma_port(profile_name: str = "Face Mask Skincare") -> int:
    """Get CDP port for HMA profile."""
    resp = requests.get("http://localhost:2268/profiles", timeout=10)
    profiles = resp.json().get("data", [])

    for p in profiles:
        if profile_name.lower() in p.get("name", "").lower():
            # Start profile
            start_resp = requests.post(
                f"http://localhost:2268/profiles/start/{p['id']}",
                headers={"Content-Type": "application/json"},
                json={},
                timeout=30
            )
            data = start_resp.json()
            if data.get("code") == 1:
                return data["data"]["port"]
            elif "Being use" in str(data.get("errors", "")):
                # Try to find running port - need manual input
                raise ValueError(f"Profile running. Provide --port manually")

    raise ValueError(f"Profile not found: {profile_name}")

async def _extract_listing_details(page) -> List[dict]:
    """Harvest listing IDs, titles, and main image URLs from loaded DOM."""
    details = await page.evaluate("""() => {
        const items = [];
        // Select listing cards (adjust selector as needed)
        const cards = document.querySelectorAll('[data-listing-id]');
        cards.forEach(card => {
            const listingId = card.getAttribute('data-listing-id');
            if (!listingId) return;
            // Try to find title within card
            let title = '';
            const titleEl = card.querySelector('h3.v2-listing-card__title') ||
                            card.querySelector('h3') ||
                            card.querySelector('.v2-listing-card__info h3');
            if (titleEl) title = titleEl.innerText.trim();
            // Try to find main image
            let imageUrl = '';
            const imgEl = card.querySelector('img') || card.querySelector('source');
            if (imgEl && imgEl.src) imageUrl = imgEl.src;
            else if (imgEl && imgEl.srcset) {
                // take first URL from srcset
                const first = imgEl.srcset.split(',')[0].trim().split(' ')[0];
                imageUrl = first;
            }
            items.push({ listingId, title, imageUrl });
        });
        return items;
    }""")
    # Also harvest IDs from HTML as fallback
    html = await page.content()
    html_ids = {int(x) for x in re.findall(r'/listing/(\d{6,})', html)}
    html_ids.update(int(x) for x in re.findall(r'data-listing-id=["\']?(\d{6,})', html))
    # Merge: ensure all IDs have at least empty title/image
    id_set = set(html_ids)
    for item in details:
        id_set.add(int(item['listingId']))
    result = []
    for lid in sorted(id_set):
        # Find matching detail
        matched = next((d for d in details if int(d['listingId']) == lid), None)
        result.append({
            'listing_id': lid,
            'title': matched['title'] if matched else '',
            'image_url': matched['imageUrl'] if matched else '',
        })
    return result

async def _harvest_search_listing_details(page, limit: int) -> List[dict]:
    """Prefer source harvest first; scroll only as a light fallback."""
    details = await _extract_listing_details(page)
    print(f"   Found {len(details)} listings from initial HTML/DOM")

    if len(details) >= limit:
        return details[:limit]

    for step in range(2):
        await page.evaluate('window.scrollBy(0, window.innerHeight)')
        await asyncio.sleep(1)
        details = await _extract_listing_details(page)
        print(f"   After fallback scroll {step + 1}: {len(details)} listings")
        if len(details) >= limit:
            break

    return details[:limit]

async def search_etsy_hma(port: int, keyword: str, limit: int = 48) -> List[dict]:
    """Search Etsy via HMA browser profile."""
    from playwright.async_api import async_playwright

    print(f"🔍 Searching Etsy (HMA): {keyword}")

    pw = await async_playwright().start()
    browser = await pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
    ctx = browser.contexts[0]
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()

    search_url = f"https://www.etsy.com/search?q={keyword.replace(' ', '+')}&ref=search_bar&explicit=1&ship_to=US"

    await page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(3)

    details = await _harvest_search_listing_details(page, limit)

    print(f"   Returning {len(details)} listings")

    await pw.stop()
    return details

async def search_etsy_stealth(keyword: str, limit: int = 48) -> List[dict]:
    """Search Etsy via Playwright stealth (no HMA needed)."""
    from playwright.async_api import async_playwright
    from undetected_playwright import stealth_async

    print(f"🔍 Searching Etsy (stealth): {keyword}")

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=False,
        args=['--disable-blink-features=AutomationControlled']
    )

    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        locale='en-US',
        timezone_id='America/New_York',
    )

    page = await context.new_page()
    await stealth_async(page)

    search_url = f"https://www.etsy.com/search?q={keyword.replace(' ', '+')}&ref=search_bar&explicit=1&ship_to=US"

    await page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(4)

    details = await _harvest_search_listing_details(page, limit)

    print(f"   Returning {len(details)} listings")

    await browser.close()
    await pw.stop()
    return details

async def search_etsy(port: int = None, keyword: str = "", limit: int = 48, use_stealth: bool = False) -> List[dict]:
    """Search Etsy - use stealth mode or HMA."""
    if use_stealth or port is None:
        return await search_etsy_stealth(keyword, limit)
    else:
        return await search_etsy_hma(port, keyword, limit)

def get_bulk_analytics(listing_ids: List[int]) -> List[dict]:
    """Get analytics for multiple listings via VK1ng API."""
    if not listing_ids:
        return []

    # API supports max ~50 IDs per request
    results = []
    batch_size = 50

    for i in range(0, len(listing_ids), batch_size):
        batch = listing_ids[i:i + batch_size]
        ids_str = ",".join(str(id) for id in batch)

        resp = requests.get(
            f"{VKING_URL}/bulk/listings/{ids_str}",
            headers={"Authorization": f"Bearer {VKING_API_KEY}"},
            timeout=30
        )

        if resp.status_code == 200:
            data = resp.json()
            if data.get("status"):
                results.extend(data.get("data", []))

    return results

def filter_trending(listings: List[dict], min_sold: int = 2, max_days: int = 60) -> dict:
    """Filter listings by trending rules with consistent qualification."""
    hot = []
    watch = []
    skip = []

    # Try to use simplified qualification helper
    try:
        from qualification_helper import get_qualification_status, safe_float
        use_simple_qualification = True
    except ImportError:
        use_simple_qualification = False

    for d in listings:
        # Extract metrics with safe defaults
        sold_24h = safe_float(d.get("sold", d.get("sold_24h", 0))) if use_simple_qualification else float(d.get("sold", 0) or 0)
        days_old = safe_float(d.get("original_creation_days", d.get("days_old", 999))) if use_simple_qualification else float(d.get("original_creation_days", 999) or 999)
        views_24h = safe_float(d.get("views_24h", 0)) if use_simple_qualification else float(d.get("views_24h", 0) or 0)
        hey_score = safe_float(d.get("hey", d.get("hey_score", 0))) if use_simple_qualification else float(d.get("hey", d.get("hey_score", 0)) or 0)
        cr = safe_float(d.get("cr", 0)) if use_simple_qualification else float(d.get("cr", 0) or 0)

        # Calculate score
        score = (sold_24h * 10) + (views_24h / 10) + (cr * 2)

        # Use consistent qualification logic
        if use_simple_qualification:
            qualification = get_qualification_status(sold_24h, views_24h, hey_score, days_old)
            qualifies = qualification["qualified"]
        else:
            # Legacy logic
            qualifies = (
                sold_24h >= 2
                or views_24h >= 120
                or (views_24h >= 80 and hey_score >= 8)
                or (days_old <= 30 and hey_score >= 10 and views_24h >= 40)
                or (sold_24h >= 3 and days_old <= 90)
            )

        item = {
            "listing_id": d.get("listing_id"),
            "title": d.get("title", ""),
            "listing_url": f"https://www.etsy.com/listing/{d.get('listing_id')}",
            "mockup_url": d.get("image_url", ""),
            "sold_24h": sold_24h,
            "days_old": days_old,
            "views_24h": views_24h,
            "hey_score": hey_score,
            "total_sold": d.get("total_sold", 0),
            "revenue": d.get("estimated_revenue", "N/A"),
            "cr": cr,
            "score": round(score, 1),
            "tags": d.get("tags", "")[:80],
            "categories": d.get("categories", ""),
        }

        if sold_24h >= 3 and days_old <= max_days:
            item["status"] = "🔥 HOT"
            hot.append(item)
        elif qualifies:
            item["status"] = "⚠️ WATCH"
            watch.append(item)
        else:
            item["status"] = "❌ SKIP"
            skip.append(item)

    # Sort by score
    hot.sort(key=lambda x: x["score"], reverse=True)
    watch.sort(key=lambda x: x["score"], reverse=True)

    return {"hot": hot, "watch": watch, "skip": skip}

def format_results(results: dict, keyword: str) -> str:
    """Format results for display."""
    lines = [
        f"📊 ETSY TRENDING SEARCH: {keyword}",
        f"{'=' * 60}",
        f"",
    ]

    if results["hot"]:
        lines.append(f"🔥 HOT PRODUCTS ({len(results['hot'])})")
        lines.append(f"{'-' * 60}")
        for i, item in enumerate(results["hot"][:10], 1):
            lines.append(f"{i}. #{item['listing_id']} | Score: {item['score']}")
            lines.append(f"   Sold 24h: {item['sold_24h']} | Age: {item['days_old']}d | Revenue: {item['revenue']}")
            lines.append(f"   Tags: {item['tags'][:60]}...")
            lines.append(f"   🔗 https://www.etsy.com/listing/{item['listing_id']}")
            lines.append("")

    if results["watch"]:
        lines.append(f"⚠️ WATCH ({len(results['watch'])})")
        lines.append(f"{'-' * 60}")
        for item in results["watch"][:5]:
            lines.append(f"   #{item['listing_id']} | Sold: {item['sold_24h']} | Age: {item['days_old']}d | Score: {item['score']}")
        lines.append("")

    lines.append(f"❌ SKIP: {len(results['skip'])} products")
    lines.append("")
    lines.append(f"📈 Summary: {len(results['hot'])} hot, {len(results['watch'])} watch, {len(results['skip'])} skip")

    return "\n".join(lines)

async def main_async():
    parser = argparse.ArgumentParser(description="Search Etsy + Filter Trending Products")
    parser.add_argument("keyword", nargs="?", default="funny t-shirt", help="Search keyword")
    parser.add_argument("--keywords", "-k", help="Multiple keywords (comma-separated)")
    parser.add_argument("--preset", choices=list(KEYWORD_PRESETS.keys()), help="Use preset keywords: seasonal, sports, pets, food, hobby, retro, humor, trending")
    parser.add_argument("--limit", "-l", type=int, default=48, help="Max listings per search")
    parser.add_argument("--min-sold", type=int, default=2, help="Min sold 24h")
    parser.add_argument("--max-days", type=int, default=60, help="Max days old")
    parser.add_argument("--port", "-p", type=int, help="HMA CDP port (optional)")
    parser.add_argument("--profile", default="Face Mask Skincare", help="HMA profile name")
    parser.add_argument("--stealth", "-s", action="store_true", help="Use stealth mode (no HMA needed)")
    parser.add_argument("--json", action="store_true", help="Output JSON")

    args = parser.parse_args()

    # Get HMA port (only if not using stealth)
    port = None
    use_stealth = args.stealth

    quiet = args.json
    if not use_stealth:
        if args.port:
            port = args.port
        else:
            try:
                port = await get_hma_port(args.profile)
                if not quiet:
                    print(f"✅ Connected to HMA port {port}")
            except:
                if not quiet:
                    print("⚠️ HMA not available, switching to stealth mode")
                use_stealth = True

    if use_stealth and not quiet:
        print("🥷 Using stealth mode (no HMA)")

    # Get keywords
    if args.preset:
        keywords = KEYWORD_PRESETS[args.preset]
        if not quiet:
            print(f"📋 Using preset: {args.preset} ({len(keywords)} keywords)")
    elif args.keywords:
        keywords = [k.strip() for k in args.keywords.split(",")]
    else:
        keywords = [args.keyword]

    all_results = {"hot": [], "watch": [], "skip": []}

    for keyword in keywords:
        print(f"\n{'=' * 60}")

        # Search
        details = await search_etsy(port, keyword, args.limit, use_stealth)

        if not details:
            print(f"   No listings found for: {keyword}")
            continue

        # Extract listing IDs from details
        listing_ids = [d['listing_id'] for d in details]
        # Pre-dedupe before any paid metrics call
        new_listing_ids, skipped_ids = filter_new_listing_ids(listing_ids)
        print(f"🧹 Pre-dedupe: {len(listing_ids)} harvested | {len(new_listing_ids)} new | {len(skipped_ids)} already tracked")
        if not new_listing_ids:
            print("   No truly new listing IDs after workbook-state dedupe")
            continue

        # Get analytics
        print(f"📊 Fetching analytics for {len(new_listing_ids)} truly new listings...")
        analytics = get_bulk_analytics(new_listing_ids)
        print(f"   Got data for {len(analytics)} listings")

        # Enrich analytics with title and image_url from details
        detail_map = {d['listing_id']: d for d in details}
        for item in analytics:
            lid = item.get('listing_id')
            if lid in detail_map:
                item['title'] = detail_map[lid].get('title', '')
                item['image_url'] = detail_map[lid].get('image_url', '')
            else:
                item['title'] = ''
                item['image_url'] = ''

        # Filter
        results = filter_trending(analytics, args.min_sold, args.max_days)

        # Merge results
        all_results["hot"].extend(results["hot"])
        all_results["watch"].extend(results["watch"])
        all_results["skip"].extend(results["skip"])

        if not args.json:
            print(format_results(results, keyword))

    # Final summary
    if len(keywords) > 1 and not args.json:
        print(f"\n{'=' * 60}")
        print(f"📊 COMBINED RESULTS ({len(keywords)} keywords)")
        print(f"   🔥 HOT: {len(all_results['hot'])}")
        print(f"   ⚠️ WATCH: {len(all_results['watch'])}")
        print(f"   ❌ SKIP: {len(all_results['skip'])}")

        if all_results["hot"]:
            # Sort all hot by score
            all_results["hot"].sort(key=lambda x: x["score"], reverse=True)
            print(f"\n🏆 TOP 5 ACROSS ALL SEARCHES:")
            for i, item in enumerate(all_results["hot"][:5], 1):
                print(f"   {i}. #{item['listing_id']} | Score: {item['score']} | Sold: {item['sold_24h']}")

    if args.json:
        print(json.dumps(all_results, indent=2, ensure_ascii=False))

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
