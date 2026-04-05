#!/usr/bin/env python3
"""
Etsy Analytics - HeyEtsy data via VK1ng API

Extract listing analytics:
- Total Views, Daily Views, Views 24h
- Total Sold, Estimated Revenue
- Favorites, Conversion Rate
- Tags & Categories
- Shop info

NO browser required - direct API call!
"""

import warnings
warnings.filterwarnings('ignore')

import argparse
import json
import os
import re
import requests
from typing import Optional

# API Key - set via env var or use default
VKING_API_KEY = os.environ.get("VKING_API_KEY", "TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ")
BASE_URL = "https://vk1ng.com/api"

def get_listing(listing_id: int) -> dict:
    """Get analytics for a single listing."""
    resp = requests.get(
        f"{BASE_URL}/listings/{listing_id}",
        headers={"Authorization": f"Bearer {VKING_API_KEY}"},
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    
    if data.get("status"):
        return data.get("data", {})
    return {}

def get_bulk_listings(listing_ids: list[int]) -> list[dict]:
    """Get analytics for multiple listings."""
    ids_str = ",".join(str(id) for id in listing_ids)
    resp = requests.get(
        f"{BASE_URL}/bulk/listings/{ids_str}",
        headers={"Authorization": f"Bearer {VKING_API_KEY}"},
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    
    if data.get("status"):
        return data.get("data", [])
    return []

def check_subscription() -> dict:
    """Check API subscription status."""
    resp = requests.get(
        f"{BASE_URL}/me",
        headers={"Authorization": f"Bearer {VKING_API_KEY}"},
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()

def get_reviews_from_page(listing_id: int) -> dict:
    """
    Fetch review data directly from Etsy listing page.
    Returns: recent review count, review dates, overall rating
    """
    import re
    from datetime import datetime, timedelta
    
    url = f"https://www.etsy.com/listing/{listing_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        html = resp.text
        
        # Extract review count
        review_match = re.search(r'(\d+,?\d*)\s*reviews?', html, re.I)
        total_reviews = int(review_match.group(1).replace(",", "")) if review_match else 0
        
        # Look for recent review dates (patterns like "2 days ago", "1 week ago")
        recent_patterns = [
            r'(\d+)\s*hours?\s*ago',
            r'(\d+)\s*days?\s*ago',
            r'yesterday',
            r'(\d+)\s*weeks?\s*ago'
        ]
        
        has_recent = False
        recent_count = 0
        
        for pattern in recent_patterns[:3]:  # hours, days, yesterday
            matches = re.findall(pattern, html, re.I)
            if matches:
                has_recent = True
                recent_count += len(matches)
        
        # Check for "week ago" (still relatively recent)
        week_matches = re.findall(r'(\d+)\s*weeks?\s*ago', html, re.I)
        if week_matches:
            for w in week_matches:
                if int(w) <= 2:
                    has_recent = True
                    recent_count += 1
        
        return {
            "total_reviews": total_reviews,
            "has_recent_reviews": has_recent,
            "recent_review_count": recent_count,
            "fetched": True
        }
    
    except Exception as e:
        return {
            "total_reviews": 0,
            "has_recent_reviews": False,
            "recent_review_count": 0,
            "fetched": False,
            "error": str(e)
        }

def format_listing(d: dict) -> str:
    """Format listing data for display."""
    lines = [
        f"📊 ETSY LISTING ANALYTICS",
        f"{'=' * 50}",
        f"🆔 Listing ID: {d.get('listing_id', 'N/A')}",
        f"",
        f"{'📈 VIEWS':=^50}",
        f"👁️ Total Views: {d.get('views', 'N/A')}",
        f"📊 Daily Views: {d.get('daily_views', 'N/A')}",
        f"⏰ Views 24h: {d.get('views_24h', 'N/A')}",
        f"",
        f"{'💰 SALES':=^50}",
        f"🛒 Total Sold: {d.get('total_sold', 'N/A')}",
        f"📦 Recent Sold: {d.get('sold', 'N/A')}",
        f"💵 Est. Revenue: {d.get('estimated_revenue', 'N/A')}",
        f"🔄 Conversion Rate: {d.get('cr', 'N/A')}%",
        f"",
        f"{'❤️ ENGAGEMENT':=^50}",
        f"⭐ Favorites: {d.get('num_favorers', 'N/A')}",
        f"🎯 HEY Score: {d.get('hey', 'N/A')}",
        f"",
        f"{'📅 TIMELINE':=^50}",
        f"📅 Created: {d.get('original_creation', 'N/A')}",
        f"⏱️ Last Modified: {d.get('last_modified', 'N/A')}",
        f"",
        f"{'🏪 SHOP':=^50}",
        f"📍 Country: {d.get('shop_country', 'N/A')}",
        f"🛍️ Shop Sales: {d.get('shop_sold', 'N/A')}",
        f"",
        f"{'🏷️ METADATA':=^50}",
        f"📂 Categories: {d.get('categories', 'N/A')}",
        f"🏷️ Tags: {d.get('tags', 'N/A')[:100]}...",
    ]
    return "\n".join(lines)

def calculate_trending_score(d: dict, has_recent_reviews: bool = False) -> dict:
    """
    Calculate trending score based on rules:
    - Sold 24h > 2
    - Created < 60 days
    - Recent reviews boost
    """
    sold_24h = d.get("sold", 0) or 0
    views_24h = d.get("views_24h", 0) or 0
    cr = d.get("cr", 0) or 0
    days_old = d.get("original_creation_days", 999) or 999
    
    # Base score
    score = (sold_24h * 10) + (views_24h / 10) + (cr * 2)
    
    # Review recency bonus
    if has_recent_reviews:
        score += 20
    
    # Determine status
    if sold_24h >= 3 and days_old <= 60:
        status = "🔥 HOT"
    elif sold_24h >= 2 and days_old <= 90:
        status = "⚠️ WATCH"
    else:
        status = "❌ SKIP"
    
    return {
        "score": round(score, 1),
        "status": status,
        "sold_24h": sold_24h,
        "days_old": days_old,
        "meets_criteria": sold_24h >= 2 and days_old <= 60
    }

def format_trending(d: dict, trend: dict) -> str:
    """Format trending analysis."""
    reviews = trend.get("reviews", {})
    review_str = f"Reviews: {reviews.get('total_reviews', 0)}"
    if reviews.get("has_recent_reviews"):
        review_str += " 🆕"
    
    return f"""
{trend['status']} Listing #{d.get('listing_id')} | Score: {trend['score']}
├─ Sold 24h: {trend['sold_24h']} {'✅' if trend['sold_24h'] >= 2 else '❌'}
├─ Age: {trend['days_old']} days {'✅' if trend['days_old'] <= 60 else '❌'}
├─ {review_str}
├─ Views 24h: {d.get('views_24h', 0)}
├─ Conversion: {d.get('cr', 0)}%
├─ Revenue: {d.get('estimated_revenue', 'N/A')}
└─ Tags: {d.get('tags', '')[:50]}...
"""

def main():
    parser = argparse.ArgumentParser(description="Etsy Analytics via VK1ng API (no browser needed)")
    subparsers = parser.add_subparsers(dest="command")
    
    # Single listing
    listing_parser = subparsers.add_parser("listing", help="Get single listing analytics")
    listing_parser.add_argument("listing_id", help="Listing ID or URL")
    listing_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Bulk listings
    bulk_parser = subparsers.add_parser("bulk", help="Get multiple listings")
    bulk_parser.add_argument("listing_ids", type=str, help="Comma-separated listing IDs")
    bulk_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Trending analysis
    trending_parser = subparsers.add_parser("trending", help="Find trending products")
    trending_parser.add_argument("listing_ids", type=str, help="Comma-separated listing IDs")
    trending_parser.add_argument("--min-sold", type=int, default=2, help="Min sold 24h (default: 2)")
    trending_parser.add_argument("--max-days", type=int, default=60, help="Max days old (default: 60)")
    trending_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Check subscription
    subparsers.add_parser("status", help="Check API subscription status")
    
    args = parser.parse_args()
    
    if args.command == "listing":
        # Parse listing ID from URL or number
        listing_input = args.listing_id
        if "etsy.com" in listing_input:
            match = re.search(r'/listing/(\d+)', listing_input)
            if match:
                listing_id = int(match.group(1))
            else:
                print("❌ Could not parse listing ID from URL")
                return
        else:
            listing_id = int(listing_input)
        
        data = get_listing(listing_id)
        if args.json:
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(format_listing(data))
    
    elif args.command == "bulk":
        ids = [int(x.strip()) for x in args.listing_ids.split(",")]
        data = get_bulk_listings(ids)
        if args.json:
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            for d in data:
                print(format_listing(d))
                print()
    
    elif args.command == "trending":
        ids = [int(x.strip()) for x in args.listing_ids.split(",")]
        listings = get_bulk_listings(ids)
        
        print("🔍 Fetching review data...")
        results = []
        for d in listings:
            listing_id = d.get("listing_id")
            
            # Get review data from page
            reviews = get_reviews_from_page(listing_id)
            has_recent = reviews.get("has_recent_reviews", False)
            
            # Calculate trending with review bonus
            trend = calculate_trending_score(d, has_recent_reviews=has_recent)
            trend["listing_id"] = listing_id
            trend["data"] = d
            trend["reviews"] = reviews
            results.append(trend)
            
            print(f"   #{listing_id}: {reviews.get('total_reviews', 0)} reviews, recent: {has_recent}")
        
        # Sort by score
        results.sort(key=lambda x: x["score"], reverse=True)
        
        if args.json:
            print(json.dumps(results, indent=2, ensure_ascii=False))
        else:
            print(f"📊 TRENDING ANALYSIS ({len(results)} listings)")
            print(f"{'=' * 60}")
            print(f"Filters: Sold 24h >= {args.min_sold}, Age <= {args.max_days} days")
            print()
            
            hot = [r for r in results if "HOT" in r["status"]]
            watch = [r for r in results if "WATCH" in r["status"]]
            skip = [r for r in results if "SKIP" in r["status"]]
            
            if hot:
                print(f"🔥 HOT ({len(hot)} products):")
                for r in hot:
                    print(format_trending(r["data"], r))
            
            if watch:
                print(f"⚠️ WATCH ({len(watch)} products):")
                for r in watch:
                    print(format_trending(r["data"], r))
            
            print(f"\n❌ SKIP: {len(skip)} products")
            print(f"\n📈 Top 3 by Trending Score:")
            for i, r in enumerate(results[:3], 1):
                print(f"   {i}. #{r['listing_id']} - Score: {r['score']} ({r['status']})")
    
    elif args.command == "status":
        data = check_subscription()
        print(f"📊 VK1ng API Status:")
        print(json.dumps(data, indent=2))
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
