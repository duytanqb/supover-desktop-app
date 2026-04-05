#!/usr/bin/env python3
"""
Etsy Spy - Product Research Tool

Usage:
    python etsy_spy.py search "funny dad shirt"      # Search products
    python etsy_spy.py search "fishing" --top 10     # Top 10 results
    python etsy_spy.py trending                       # Trending POD items
    python etsy_spy.py analyze <url>                  # Analyze listing
    python etsy_spy.py shop <shop_name>               # Spy on shop
    python etsy_spy.py keywords "niche"               # Extract keywords
    python etsy_spy.py report                         # Daily research report
    python etsy_spy.py backlog-add --listing-id ...   # Save candidate to Excel backlog workbook
"""

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus, urljoin

# HMA Settings
HMA_API = "http://localhost:2268"
PROFILE_ID = "69bfd70ef34a4039260e8a62"

# Etsy Settings
ETSY_BASE = "https://www.etsy.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def ensure_hma_running():
    """Ensure HideMyAcc is running and profile is started."""
    import urllib.request
    import json as json_lib
    
    try:
        with urllib.request.urlopen(f"{HMA_API}/profiles", timeout=5) as resp:
            data = json_lib.load(resp)
            print(f"✅ HMA running: {len(data.get('data', []))} profiles")
    except:
        print("🚀 Starting HMA...")
        subprocess.run(["open", "-a", "HideMyAcc-3"], check=False)
        time.sleep(8)
    
    try:
        req = urllib.request.Request(f"{HMA_API}/profiles/start/{PROFILE_ID}", method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json_lib.load(resp)
            if data.get("code") == 1:
                port = data["data"]["port"]
                print(f"✅ Profile started on port {port}")
                return port
    except:
        pass
    
    # Get running port
    try:
        with urllib.request.urlopen(f"{HMA_API}/profiles", timeout=5) as resp:
            data = json_lib.load(resp)
            for profile in data.get("data", []):
                if profile.get("id") == PROFILE_ID and profile.get("status") == "running":
                    return profile.get("debugPort") or profile.get("port")
    except:
        pass
    return None


async def get_browser_etsy():
    """Get browser for Etsy - use normal Chrome port 9222 (best success rate)."""
    from playwright.async_api import async_playwright
    import subprocess
    import time
    
    pw = await async_playwright().start()
    
    # Try connecting to Chrome on port 9222
    try:
        browser = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        print("   ✅ Connected to Chrome (port 9222)")
        return pw, browser, page
    except Exception as e:
        print(f"   ⚠️ Chrome not running on 9222, starting...")
        
        # Start Chrome with debug port
        subprocess.Popen([
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "--remote-debugging-port=9222",
            "--user-data-dir=/tmp/chrome-etsy"
        ])
        time.sleep(5)
        
        # Try again
        browser = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        print("   ✅ Chrome started and connected")
        return pw, browser, page


async def cmd_search(args):
    """Search Etsy for products."""
    query = args.query
    top_n = args.top or 10
    
    print(f"\n🔍 Searching Etsy: {query}")
    print("=" * 60)
    
    pw, browser, page = await get_browser_etsy()
    
    try:
        # Go to Etsy
        await page.goto("https://www.etsy.com", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(2)
        
        # Check if blocked
        blocked = await page.evaluate('''() => {
            return document.body.innerText.includes('unusual activity') ||
                   !document.querySelector('input[name="search_query"]');
        }''')
        
        if blocked:
            print("\n⚠️ Etsy blocking this session. Try restarting Chrome.")
            await pw.stop()
            return
        
        # Search
        search_box = await page.query_selector('input[name="search_query"]')
        if search_box:
            await search_box.fill(query)
            await asyncio.sleep(0.5)
            await search_box.press("Enter")
            await asyncio.sleep(5)
        
        # Extract listings
        listings = await page.evaluate('''(topN) => {
            const items = document.querySelectorAll('[data-search-results] .wt-grid__item-xs-6, .search-listings-group .v2-listing-card');
            const results = [];
            
            for (let i = 0; i < Math.min(items.length, topN); i++) {
                const item = items[i];
                const link = item.querySelector('a[href*="/listing/"]');
                const title = item.querySelector('h3, .v2-listing-card__title, [class*="title"]')?.textContent?.trim();
                const price = item.querySelector('[class*="price"], .currency-value')?.textContent?.trim();
                const shop = item.querySelector('[class*="shop-name"], .v2-listing-card__shop')?.textContent?.trim();
                const reviews = item.querySelector('[class*="reviews"], [aria-label*="star"]')?.textContent?.trim();
                const img = item.querySelector('img')?.src;
                
                if (link && title) {
                    results.push({
                        title: title.substring(0, 80),
                        url: link.href,
                        price: price,
                        shop: shop,
                        reviews: reviews,
                        image: img
                    });
                }
            }
            return results;
        }''', top_n)
        
        # Get total results count
        total = await page.evaluate('''() => {
            const count = document.querySelector('[class*="results-count"], .wt-text-caption');
            return count?.textContent?.trim() || "Unknown";
        }''')
        
        print(f"\n📊 Results: {total}")
        print(f"\n📋 TOP {len(listings)} LISTINGS:")
        print("-" * 60)
        
        for i, listing in enumerate(listings, 1):
            print(f"\n{i}. {listing['title']}")
            print(f"   💰 {listing['price'] or 'N/A'} | ⭐ {listing['reviews'] or 'No reviews'}")
            print(f"   🏪 {listing['shop'] or 'Unknown shop'}")
            print(f"   🔗 {listing['url'][:70]}...")
        
        if args.json:
            output = {
                "query": query,
                "total": total,
                "listings": listings
            }
            print("\n" + json.dumps(output, indent=2))
        
        # Save screenshot
        await page.screenshot(path=f"/Users/duytan/Desktop/etsy_search_{query.replace(' ', '_')[:20]}.png")
        print(f"\n📸 Screenshot saved to Desktop")
        
    finally:
        await pw.stop()


async def cmd_trending(args):
    """Get trending POD items on Etsy."""
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    # Popular POD search terms
    trending_searches = [
        "funny t-shirt 2026",
        "trending shirt design",
        "viral tshirt",
        "bestseller shirt gift",
        "custom shirt popular"
    ]
    
    category = args.category or "shirts"
    
    try:
        print(f"\n📈 TRENDING POD ITEMS ({category})")
        print("=" * 60)
        
        all_results = []
        
        for search_term in trending_searches[:3]:  # Limit to avoid rate limiting
            search_url = f"{ETSY_BASE}/search?q={quote_plus(search_term)}&ship_to=US"
            
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            listings = await page.evaluate('''() => {
                const items = document.querySelectorAll('[data-search-results] .wt-grid__item-xs-6');
                return Array.from(items).slice(0, 5).map(item => {
                    const link = item.querySelector('a[href*="/listing/"]');
                    const title = item.querySelector('h3')?.textContent?.trim();
                    const price = item.querySelector('[class*="price"]')?.textContent?.trim();
                    return { 
                        title: title?.substring(0, 60), 
                        price, 
                        url: link?.href 
                    };
                }).filter(l => l.title);
            }''')
            
            if listings:
                print(f"\n🔥 {search_term}")
                for l in listings[:3]:
                    print(f"   • {l['title'][:50]}... | {l['price']}")
                all_results.extend(listings)
            
            await asyncio.sleep(2)  # Rate limit delay
        
        print(f"\n📊 Total items found: {len(all_results)}")
        
    finally:
        await pw.stop()


async def cmd_analyze(args):
    """Analyze a specific Etsy listing."""
    url = args.url
    
    if not url.startswith("http"):
        url = f"https://www.etsy.com/listing/{url}"
    
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    try:
        print(f"\n🔍 Analyzing: {url[:60]}...")
        print("=" * 60)
        
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Extract listing details
        details = await page.evaluate('''() => {
            const getMetaContent = (name) => {
                const meta = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
                return meta?.content;
            };
            
            // Get tags from the page
            const tags = Array.from(document.querySelectorAll('[class*="tag"], .wt-tag'))
                .map(t => t.textContent?.trim())
                .filter(t => t);
            
            // Get details section
            const detailsSection = document.querySelector('#product-details-content-toggle, [class*="details"]');
            
            return {
                title: document.querySelector('h1')?.textContent?.trim(),
                price: document.querySelector('[class*="price"], [data-buy-box-region] [class*="amount"]')?.textContent?.trim(),
                shop: document.querySelector('[class*="shop-name"] a, a[href*="/shop/"]')?.textContent?.trim(),
                reviews: document.querySelector('[class*="reviews-count"], [href*="reviews"]')?.textContent?.trim(),
                rating: document.querySelector('[class*="rating"], [aria-label*="star rating"]')?.textContent?.trim(),
                description: document.querySelector('[class*="description"], #description-text')?.textContent?.trim()?.substring(0, 500),
                tags: tags.slice(0, 15),
                images: Array.from(document.querySelectorAll('[class*="image-carousel"] img, [class*="gallery"] img'))
                    .map(i => i.src).slice(0, 5),
                ogImage: getMetaContent('og:image'),
                favorites: document.querySelector('[class*="favorite"]')?.textContent?.trim()
            };
        }''')
        
        print(f"\n📦 LISTING DETAILS")
        print("-" * 60)
        print(f"📝 Title: {details.get('title', 'N/A')}")
        print(f"💰 Price: {details.get('price', 'N/A')}")
        print(f"🏪 Shop: {details.get('shop', 'N/A')}")
        print(f"⭐ Rating: {details.get('rating', 'N/A')}")
        print(f"📊 Reviews: {details.get('reviews', 'N/A')}")
        print(f"❤️ Favorites: {details.get('favorites', 'N/A')}")
        
        # Estimate sales
        reviews = details.get('reviews', '0')
        if reviews:
            review_count = int(re.search(r'\d+', reviews.replace(',', '')).group() or 0) if re.search(r'\d+', reviews.replace(',', '')) else 0
            estimated_sales = review_count * 15  # Rough estimate
            print(f"📈 Est. Sales: {estimated_sales:,} (based on reviews)")
        
        if details.get('tags'):
            print(f"\n🏷️ Tags: {', '.join(details['tags'][:10])}")
        
        if details.get('description'):
            print(f"\n📄 Description preview:")
            print(f"   {details['description'][:300]}...")
        
        if args.json:
            print("\n" + json.dumps(details, indent=2))
        
        # Save screenshot
        await page.screenshot(path="/Users/duytan/Desktop/etsy_listing_analysis.png")
        
    finally:
        await pw.stop()


async def cmd_shop(args):
    """Spy on an Etsy shop."""
    shop_name = args.shop_name
    
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    try:
        shop_url = f"{ETSY_BASE}/shop/{shop_name}?section_id=&sort_order=date_desc"
        
        print(f"\n🏪 Spying on shop: {shop_name}")
        print("=" * 60)
        
        await page.goto(shop_url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Get shop info
        shop_info = await page.evaluate('''() => {
            return {
                name: document.querySelector('[class*="shop-name"], h1')?.textContent?.trim(),
                sales: document.querySelector('[class*="sales"]')?.textContent?.trim(),
                reviews: document.querySelector('[class*="reviews"]')?.textContent?.trim(),
                location: document.querySelector('[class*="location"]')?.textContent?.trim(),
                memberSince: document.querySelector('[class*="member-since"]')?.textContent?.trim(),
                listings: Array.from(document.querySelectorAll('[class*="listing-card"], .v2-listing-card')).slice(0, 10).map(item => ({
                    title: item.querySelector('[class*="title"], h3')?.textContent?.trim()?.substring(0, 50),
                    price: item.querySelector('[class*="price"]')?.textContent?.trim(),
                    url: item.querySelector('a')?.href
                }))
            };
        }''')
        
        print(f"\n📊 SHOP INFO")
        print("-" * 60)
        print(f"🏪 Name: {shop_info.get('name', shop_name)}")
        print(f"💰 Sales: {shop_info.get('sales', 'N/A')}")
        print(f"⭐ Reviews: {shop_info.get('reviews', 'N/A')}")
        print(f"📍 Location: {shop_info.get('location', 'N/A')}")
        print(f"📅 Member since: {shop_info.get('memberSince', 'N/A')}")
        
        if shop_info.get('listings'):
            print(f"\n📋 RECENT LISTINGS ({len(shop_info['listings'])})")
            print("-" * 60)
            for i, listing in enumerate(shop_info['listings'][:10], 1):
                print(f"{i}. {listing['title']} | {listing['price']}")
        
        if args.json:
            print("\n" + json.dumps(shop_info, indent=2))
        
    finally:
        await pw.stop()


async def cmd_keywords(args):
    """Extract related keywords for a niche."""
    niche = args.niche
    
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    try:
        print(f"\n🔑 Extracting keywords for: {niche}")
        print("=" * 60)
        
        # Search and collect keywords from titles
        search_url = f"{ETSY_BASE}/search?q={quote_plus(niche)}&ship_to=US"
        await page.goto(search_url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Get autocomplete suggestions (type in search box)
        await page.fill('input[name="search_query"], #search-query', niche)
        await asyncio.sleep(2)
        
        suggestions = await page.evaluate('''() => {
            const suggestions = document.querySelectorAll('[class*="suggestion"], [class*="autocomplete"] li');
            return Array.from(suggestions).map(s => s.textContent?.trim()).filter(s => s).slice(0, 10);
        }''')
        
        # Get keywords from listing titles
        titles = await page.evaluate('''() => {
            return Array.from(document.querySelectorAll('h3, [class*="title"]'))
                .map(t => t.textContent?.trim())
                .filter(t => t && t.length > 10)
                .slice(0, 20);
        }''')
        
        # Extract common words
        all_words = []
        for title in titles:
            words = re.findall(r'\b[a-zA-Z]{4,}\b', title.lower())
            all_words.extend(words)
        
        # Count frequency
        from collections import Counter
        word_freq = Counter(all_words)
        top_keywords = word_freq.most_common(20)
        
        print(f"\n🔮 AUTOCOMPLETE SUGGESTIONS:")
        for s in suggestions:
            print(f"   • {s}")
        
        print(f"\n📊 TOP KEYWORDS FROM LISTINGS:")
        for word, count in top_keywords:
            if word not in ['shirt', 'with', 'this', 'that', 'from', 'your']:
                print(f"   • {word} ({count})")
        
        # Suggested search terms
        print(f"\n💡 SUGGESTED SEARCH TERMS:")
        suggested = [
            f"{niche} shirt",
            f"{niche} funny",
            f"{niche} gift",
            f"{niche} mom",
            f"{niche} dad",
            f"best {niche}",
            f"{niche} lover"
        ]
        for s in suggested:
            print(f"   • {s}")
        
    finally:
        await pw.stop()


async def cmd_report(args):
    """Generate daily research report."""
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    # Popular niches to check
    niches = [
        "funny shirt 2026",
        "mom gift shirt",
        "dad joke shirt",
        "fishing shirt",
        "nurse shirt funny"
    ]
    
    try:
        print("\n📊 DAILY ETSY RESEARCH REPORT")
        print("=" * 60)
        print(f"Date: {time.strftime('%Y-%m-%d %H:%M')}")
        
        for niche in niches:
            search_url = f"{ETSY_BASE}/search?q={quote_plus(niche)}&ship_to=US"
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            top_listing = await page.evaluate('''() => {
                const item = document.querySelector('[data-search-results] .wt-grid__item-xs-6');
                if (!item) return null;
                return {
                    title: item.querySelector('h3')?.textContent?.trim()?.substring(0, 50),
                    price: item.querySelector('[class*="price"]')?.textContent?.trim()
                };
            }''')
            
            if top_listing:
                print(f"\n🔍 {niche}")
                print(f"   Top: {top_listing['title']}... | {top_listing['price']}")
            
            await asyncio.sleep(2)
        
        print("\n✅ Report complete!")
        
    finally:
        await pw.stop()


async def cmd_erank(args):
    """Use eRank.com for Etsy research (alternative to direct scraping)."""
    query = args.query
    
    port = ensure_hma_running()
    if not port:
        print("❌ Could not connect to HMA profile")
        return
    
    pw, browser, page = await get_browser(port)
    
    try:
        print(f"\n🔍 eRank Research: {query}")
        print("=" * 60)
        
        # Go to eRank trend buzz
        await page.goto("https://erank.com/trend-buzz", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Check if logged in or accessible
        content = await page.evaluate('''() => {
            return {
                title: document.title,
                text: document.body.innerText.substring(0, 1000)
            };
        }''')
        
        print(f"📄 Page: {content['title']}")
        print(f"\n{content['text'][:500]}")
        
        await page.screenshot(path="/Users/duytan/Desktop/erank_trends.png")
        print("\n📸 Screenshot saved: Desktop/erank_trends.png")
        
        print("\n💡 For full eRank features, create free account at erank.com")
        print("   Then research: https://erank.com/keyword-explorer")
        
    finally:
        await pw.stop()


def evaluate_backlog_qualification(sold_24h: float, views_24h: float, hey: float, days_old: float):
    """Legacy function - use qualification_helper for new code."""
    qualified_by = []
    if sold_24h >= 2:
        qualified_by.append("rule_1_sold_24h_ge_2")
    if views_24h >= 120:
        qualified_by.append("rule_2_views_24h_ge_120")
    if views_24h >= 80 and hey >= 8:
        qualified_by.append("rule_3_views_24h_ge_80_and_hey_ge_8")
    if days_old <= 30 and hey >= 10 and views_24h >= 40:
        qualified_by.append("rule_4_days_old_le_30_and_hey_ge_10_and_views_24h_ge_40")
    if sold_24h >= 3 and days_old <= 90:
        qualified_by.append("rule_5_sold_24h_ge_3_and_days_old_le_90")
    return {"qualifies": bool(qualified_by), "qualified_by": qualified_by}


def evaluate_backlog_qualification_simple(sold_24h: float, views_24h: float, hey: float, days_old: float):
    """Simplified qualification for DeepSeek compatibility.
    
    Returns: {"qualifies": bool, "qualified_by": list, "rule_details": dict}
    """
    # Import the helper (circular import safe)
    try:
        from qualification_helper import get_qualification_status
        result = get_qualification_status(sold_24h, views_24h, hey, days_old)
        return {
            "qualifies": result["qualified"],
            "qualified_by": result["reasons"],
            "rule_details": result["rule_details"]
        }
    except ImportError:
        # Fallback to legacy function
        return evaluate_backlog_qualification(sold_24h, views_24h, hey, days_old)


def build_save_reason(args, sold_24h: float, views_24h: float, hey: float, days_old: float) -> str:
    evaluation = evaluate_backlog_qualification(sold_24h, views_24h, hey, days_old)
    reasons = list(evaluation["qualified_by"])
    if getattr(args, "save_reason", None):
        reasons.append(args.save_reason)
    return "; ".join(dict.fromkeys(reasons))


def cmd_backlog_add(args):
    """Save/update a metric-qualified spy candidate in shared Excel backlog."""
    # Use safe float conversion
    def safe_float(val, default=0.0):
        if val is None:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default
    
    sold_24h = safe_float(args.sold_24h, 0)
    views_24h = safe_float(args.views_24h, 0)
    hey = safe_float(getattr(args, 'hey', 0), 0)
    days_old = safe_float(args.days_old, 999)
    
    # Use simplified qualification for better DeepSeek compatibility
    evaluation = evaluate_backlog_qualification_simple(sold_24h, views_24h, hey, days_old)
    
    if not evaluation["qualifies"]:
        print("SKIP: listing does not meet metric thresholds for saving")
        print(f"  Metrics: sold_24h={sold_24h}, views_24h={views_24h}, hey={hey}, days_old={days_old}")
        if "rule_details" in evaluation:
            print(f"  Rule details: {evaluation['rule_details']}")
        return

    if args.query_chain:
        query_chain = args.query_chain
    else:
        chain_parts = []
        for value in [args.source_query, args.search_keyword, args.keyword_expansion]:
            if value and value not in chain_parts:
                chain_parts.append(value)
        query_chain = " > ".join(chain_parts)
    script = Path(__file__).with_name("etsy_backlog.py")
    command = [
        sys.executable, str(script), "add",
        "--source-platform", "etsy",
        "--search-keyword", args.search_keyword or "",
        "--source-query", args.source_query or args.search_keyword or "",
        "--query-chain", query_chain,
        "--keyword-expansion", args.keyword_expansion or "",
        "--save-reason", build_save_reason(args, sold_24h, views_24h, hey, days_old),
        "--niche", args.niche or args.search_keyword or "",
        "--listing-id", str(args.listing_id or ""),
        "--listing-url", args.listing_url or f"https://www.etsy.com/listing/{args.listing_id}",
        "--title", args.title or "",
        "--shop-name", args.shop_name or "",
        "--price", args.price or "",
        "--sold-24h", str(args.sold_24h or "0"),
        "--views-24h", str(args.views_24h or "0"),
        "--hey-score", str(args.hey or "0"),
        "--qualified-by", "; ".join(evaluation["qualified_by"]),
        "--conversion-rate", str(args.conversion_rate or "0"),
        "--days-old", str(args.days_old or ""),
        "--total-sold", str(args.total_sold or ""),
        "--estimated-revenue", args.estimated_revenue or "",
        "--tags", args.tags or "",
        "--trend-status", args.trend_status or "WATCH",
        "--trend-score", str(args.trend_score or "0"),
        "--design-angle", args.design_angle or "",
        "--product-types", args.product_types or "tshirt",
        "--workflow-status", args.workflow_status or "spied",
        "--design-keyword", args.design_keyword or args.design_angle or args.title or "",
        "--mockup-url", getattr(args, 'mockup_url', None) or "",
        "--mockup-path", getattr(args, 'mockup_path', None) or "",
        "--notes", args.notes or "",
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    print(result.stdout.strip())

    if args.keyword_expansion:
        log_command = [
            sys.executable, str(script), "log-keyword",
            "--seed-keyword", args.source_query or args.search_keyword or "",
            "--expanded-keyword", args.keyword_expansion,
            "--source-type", args.expansion_source or "listing-tag",
            "--source-listing-id", str(args.listing_id or ""),
            "--source-tag", args.source_tag or "",
            "--query-chain", query_chain,
            "--notes", args.notes or "",
        ]
        subprocess.run(log_command, check=True, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description="Etsy Spy - Product Research Tool")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # search
    search_parser = subparsers.add_parser("search", help="Search products")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--top", type=int, default=10, help="Number of results")
    
    # trending
    trending_parser = subparsers.add_parser("trending", help="Trending items")
    trending_parser.add_argument("--category", default="shirts", help="Category")
    
    # analyze
    analyze_parser = subparsers.add_parser("analyze", help="Analyze listing")
    analyze_parser.add_argument("url", help="Listing URL or ID")
    
    # shop
    shop_parser = subparsers.add_parser("shop", help="Spy on shop")
    shop_parser.add_argument("shop_name", help="Shop name")
    
    # keywords
    keywords_parser = subparsers.add_parser("keywords", help="Extract keywords")
    keywords_parser.add_argument("niche", help="Niche term")
    
    # report
    subparsers.add_parser("report", help="Daily research report")
    
    # erank (alternative)
    erank_parser = subparsers.add_parser("erank", help="Use eRank.com (alternative)")
    erank_parser.add_argument("query", help="Search query")

    backlog_parser = subparsers.add_parser("backlog-add", help="Save/update a metric-qualified spy candidate in shared Excel backlog")
    backlog_parser.add_argument("--listing-id", required=True, help="Etsy listing ID")
    backlog_parser.add_argument("--listing-url", help="Full Etsy listing URL")
    backlog_parser.add_argument("--search-keyword", help="Search keyword used during spy")
    backlog_parser.add_argument("--source-query", help="Original seed query before expansion")
    backlog_parser.add_argument("--query-chain", help="Full query path, e.g. seed > tag > listing")
    backlog_parser.add_argument("--keyword-expansion", help="Expanded keyword or tag phrase that led to this listing")
    backlog_parser.add_argument("--expansion-source", help="Provenance source such as autocomplete, listing-tag, related, shop-adjacent")
    backlog_parser.add_argument("--source-tag", help="Exact tag phrase that produced the expansion")
    backlog_parser.add_argument("--save-reason", help="Manual note for why this idea was worth saving")
    backlog_parser.add_argument("--niche", help="Normalized niche")
    backlog_parser.add_argument("--title", help="Listing title or concept title")
    backlog_parser.add_argument("--shop-name")
    backlog_parser.add_argument("--price")
    backlog_parser.add_argument("--sold-24h", type=int)
    backlog_parser.add_argument("--views-24h", type=int)
    backlog_parser.add_argument("--conversion-rate", type=float)
    backlog_parser.add_argument("--days-old", type=int)
    backlog_parser.add_argument("--total-sold")
    backlog_parser.add_argument("--estimated-revenue")
    backlog_parser.add_argument("--tags")
    backlog_parser.add_argument("--trend-status", default="WATCH")
    backlog_parser.add_argument("--trend-score", type=float)
    backlog_parser.add_argument("--design-angle", help="How we want to reinterpret this idea")
    backlog_parser.add_argument("--product-types", default="tshirt")
    backlog_parser.add_argument("--design-keyword")
    backlog_parser.add_argument("--workflow-status", default="spied")
    backlog_parser.add_argument("--mockup-url", help="Original/mockup image URL")
    backlog_parser.add_argument("--mockup-path", help="Local mockup file path if any")
    backlog_parser.add_argument("--hey", type=float, help="HEY score for metric-based save rule")
    backlog_parser.add_argument("--notes")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == "search":
        asyncio.run(cmd_search(args))
    elif args.command == "trending":
        asyncio.run(cmd_trending(args))
    elif args.command == "analyze":
        asyncio.run(cmd_analyze(args))
    elif args.command == "shop":
        asyncio.run(cmd_shop(args))
    elif args.command == "keywords":
        asyncio.run(cmd_keywords(args))
    elif args.command == "report":
        asyncio.run(cmd_report(args))
    elif args.command == "erank":
        asyncio.run(cmd_erank(args))
    elif args.command == "backlog-add":
        cmd_backlog_add(args)


if __name__ == "__main__":
    main()
