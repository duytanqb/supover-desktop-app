#!/usr/bin/env python3
"""
VK1ng API - HeyEtsy data without the extension
Reverse-engineered from HeyEtsy Chrome extension

API Endpoints:
- GET https://vk1ng.com/api/listings/{listing_id} - Single listing
- GET https://vk1ng.com/api/bulk/listings/{id1,id2,id3} - Multiple listings
- GET https://vk1ng.com/api/me - Check subscription
"""

import argparse
import json
import requests
from typing import Optional

BASE_URL = "https://vk1ng.com/api"

def get_listing(listing_id: int) -> dict:
    """Get HeyEtsy-style data for a single listing."""
    resp = requests.get(f"{BASE_URL}/listings/{listing_id}", timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    if data.get("status"):
        return data.get("data", {})
    return {}

def get_bulk_listings(listing_ids: list[int]) -> list[dict]:
    """Get HeyEtsy-style data for multiple listings."""
    ids_str = ",".join(str(id) for id in listing_ids)
    resp = requests.get(f"{BASE_URL}/bulk/listings/{ids_str}", timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    if data.get("status"):
        return data.get("data", [])
    return []

def format_listing(d: dict) -> str:
    """Format listing data for display."""
    lines = [
        f"📊 Listing #{d.get('listing_id', 'N/A')}",
        "=" * 50,
        f"👁️ Total Views: {d.get('views', 'N/A')}",
        f"📈 Daily Views: {d.get('daily_views', 'N/A')}",
        f"⏰ Views 24h: {d.get('views_24h', 'N/A')}",
        f"",
        f"💰 Total Sold: {d.get('total_sold', 'N/A')}",
        f"🛒 Sold (recent): {d.get('sold', 'N/A')}",
        f"💵 Est. Revenue: {d.get('estimated_revenue', 'N/A')}",
        f"",
        f"❤️ Favorites: {d.get('num_favorers', 'N/A')}",
        f"⭐ HEY Score: {d.get('hey', 'N/A')}",
        f"🔄 Conversion Rate: {d.get('cr', 'N/A')}%",
        f"",
        f"📅 Created: {d.get('original_creation', 'N/A')}",
        f"⏱️ Last Modified: {d.get('last_modified', 'N/A')}",
        f"🏪 Shop Sold: {d.get('shop_sold', 'N/A')}",
        f"🌍 Shop Country: {d.get('shop_country', 'N/A')}",
        f"",
        f"🏷️ Tags: {d.get('tags', 'N/A')}",
        f"📂 Categories: {d.get('categories', 'N/A')}",
    ]
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="VK1ng API - HeyEtsy data without extension")
    subparsers = parser.add_subparsers(dest="command")
    
    # Single listing
    listing_parser = subparsers.add_parser("listing", help="Get single listing data")
    listing_parser.add_argument("listing_id", type=int, help="Etsy listing ID")
    listing_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Bulk listings
    bulk_parser = subparsers.add_parser("bulk", help="Get multiple listings")
    bulk_parser.add_argument("listing_ids", type=str, help="Comma-separated listing IDs")
    bulk_parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    args = parser.parse_args()
    
    if args.command == "listing":
        data = get_listing(args.listing_id)
        if args.json:
            print(json.dumps(data, indent=2))
        else:
            print(format_listing(data))
    
    elif args.command == "bulk":
        ids = [int(x.strip()) for x in args.listing_ids.split(",")]
        data = get_bulk_listings(ids)
        if args.json:
            print(json.dumps(data, indent=2))
        else:
            for d in data:
                print(format_listing(d))
                print()
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
