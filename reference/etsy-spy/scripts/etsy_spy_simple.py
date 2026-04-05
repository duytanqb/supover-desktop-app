#!/usr/bin/env python3
"""
Etsy Spy Simple - Simplified version for DeepSeek compatibility.

This is a simplified version of etsy_spy.py with:
1. Clear, explicit error handling
2. Simple qualification logic
3. Minimal async complexity
4. Better documentation for DeepSeek

Usage:
    python etsy_spy_simple.py search "funny dad shirt"
    python etsy_spy_simple.py analyze 123456789
    python etsy_spy_simple.py backlog-add --listing-id 123456789 --sold-24h 3 --views-24h 100
"""

import argparse
import json
import sys
import subprocess
from pathlib import Path

# Import our simplified qualification helper
try:
    from qualification_helper import should_save_to_backlog, validate_listing_data
    QUALIFICATION_AVAILABLE = True
except ImportError:
    QUALIFICATION_AVAILABLE = False
    print("⚠️ qualification_helper not available, using legacy logic")


def safe_float(value, default=0.0):
    """Safely convert to float."""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def check_qualification_manual(sold_24h, views_24h, hey_score, days_old):
    """
    Manual qualification check (for when helper is not available).
    
    Rules:
    1. sold_24h >= 2
    2. views_24h >= 120
    3. views_24h >= 80 AND hey_score >= 8
    4. days_old <= 30 AND hey_score >= 10 AND views_24h >= 40
    5. sold_24h >= 3 AND days_old <= 90
    """
    reasons = []
    
    if sold_24h >= 2:
        reasons.append("sold_24h_ge_2")
    
    if views_24h >= 120:
        reasons.append("views_24h_ge_120")
    
    if views_24h >= 80 and hey_score >= 8:
        reasons.append("views_80_hey_8")
    
    if days_old <= 30 and hey_score >= 10 and views_24h >= 40:
        reasons.append("new_listing_hey_10_views_40")
    
    if sold_24h >= 3 and days_old <= 90:
        reasons.append("sold_3_age_90")
    
    return len(reasons) > 0, reasons


def cmd_search_simple(args):
    """Simple search command."""
    query = args.query
    print(f"🔍 Searching for: {query}")
    print("Note: For full search functionality, use etsy_search.py directly")
    print("Example: python scripts/etsy_search.py '{query}' --stealth --limit 30")
    
    # Provide clear next steps
    print("\n📋 Recommended next steps:")
    print("1. Run the search with: python scripts/etsy_search.py \"{query}\" --stealth")
    print("2. Check results and note listing IDs")
    print("3. Analyze promising listings with: python scripts/etsy_analytics.py listing <ID>")
    print("4. Save qualified listings with: python scripts/etsy_spy.py backlog-add ...")


def cmd_analyze_simple(args):
    """Simple analyze command."""
    listing_id = args.listing_id
    print(f"🔍 Analyzing listing: {listing_id}")
    print("Note: For full analysis, use etsy_analytics.py directly")
    print(f"Example: python scripts/etsy_analytics.py listing {listing_id}")
    
    # Provide clear command
    print(f"\n📋 Run this command:")
    print(f"python scripts/etsy_analytics.py listing {listing_id}")


def cmd_backlog_add_simple(args):
    """Simple backlog-add command with clear validation."""
    print("📝 Adding listing to backlog")
    print("=" * 60)
    
    # Validate required fields
    if not args.listing_id:
        print("❌ ERROR: --listing-id is required")
        return
    
    # Convert metrics
    sold_24h = safe_float(args.sold_24h, 0)
    views_24h = safe_float(args.views_24h, 0)
    hey_score = safe_float(args.hey, 0)
    days_old = safe_float(args.days_old, 999)
    
    print(f"📊 Listing Metrics:")
    print(f"  Listing ID: {args.listing_id}")
    print(f"  Sold (24h): {sold_24h}")
    print(f"  Views (24h): {views_24h}")
    print(f"  HEY Score: {hey_score}")
    print(f"  Days Old: {days_old}")
    
    # Check qualification
    if QUALIFICATION_AVAILABLE:
        listing_data = {
            "listing_id": args.listing_id,
            "sold_24h": sold_24h,
            "views_24h": views_24h,
            "hey_score": hey_score,
            "days_old": days_old,
        }
        should_save, info = should_save_to_backlog(listing_data)
        reasons = info["qualification"]["reasons"] if should_save else []
    else:
        should_save, reasons = check_qualification_manual(sold_24h, views_24h, hey_score, days_old)
    
    print(f"\n✅ Qualification Check:")
    if should_save:
        print(f"  Status: QUALIFIED ✓")
        print(f"  Reasons: {', '.join(reasons)}")
    else:
        print(f"  Status: NOT QUALIFIED ✗")
        print(f"  Listing does not meet any qualification rules")
        print(f"  No action taken.")
        return
    
    # Build the actual command
    script_path = Path(__file__).parent / "etsy_spy.py"
    
    # Start building command
    cmd = [
        sys.executable, str(script_path), "backlog-add",
        "--listing-id", str(args.listing_id),
    ]
    
    # Add optional fields if provided
    optional_fields = [
        ("search_keyword", args.search_keyword),
        ("title", args.title),
        ("shop_name", args.shop_name),
        ("sold_24h", args.sold_24h),
        ("views_24h", args.views_24h),
        ("hey", args.hey),
        ("days_old", args.days_old),
        ("niche", args.niche),
        ("tags", args.tags),
        ("save_reason", args.save_reason or f"Qualified by: {', '.join(reasons)}"),
    ]
    
    for field_name, field_value in optional_fields:
        if field_value is not None:
            cmd.extend([f"--{field_name.replace('_', '-')}", str(field_value)])
    
    print(f"\n🚀 Running command:")
    print(" ".join(cmd))
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"\n✅ Result:")
        print(result.stdout)
        if result.stderr:
            print(f"⚠️ Warnings:")
            print(result.stderr)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Command failed:")
        print(f"Exit code: {e.returncode}")
        print(f"Error: {e.stderr}")
    except Exception as e:
        print(f"\n❌ Unexpected error:")
        print(f"{type(e).__name__}: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Etsy Spy Simple - Simplified for DeepSeek compatibility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Search:        python etsy_spy_simple.py search "funny dad shirt"
  Analyze:       python etsy_spy_simple.py analyze 123456789
  Add to backlog: python etsy_spy_simple.py backlog-add --listing-id 123456789 --sold-24h 3 --views-24h 100
  
For full functionality, use the original scripts:
  etsy_search.py    - Search Etsy and get analytics
  etsy_analytics.py - Get detailed listing analytics
  etsy_spy.py       - Full feature set
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search Etsy (simplified)")
    search_parser.add_argument("query", help="Search query")
    
    # Analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Analyze listing (simplified)")
    analyze_parser.add_argument("listing_id", help="Listing ID to analyze")
    
    # Backlog-add command
    backlog_parser = subparsers.add_parser("backlog-add", help="Add qualified listing to backlog")
    backlog_parser.add_argument("--listing-id", required=True, help="Etsy listing ID")
    backlog_parser.add_argument("--search-keyword", help="Search keyword used")
    backlog_parser.add_argument("--title", help="Listing title")
    backlog_parser.add_argument("--shop-name", help="Shop name")
    backlog_parser.add_argument("--sold-24h", type=float, help="Sold in last 24 hours")
    backlog_parser.add_argument("--views-24h", type=float, help="Views in last 24 hours")
    backlog_parser.add_argument("--hey", type=float, help="HEY score")
    backlog_parser.add_argument("--days-old", type=float, help="Days since listing created")
    backlog_parser.add_argument("--niche", help="Niche/category")
    backlog_parser.add_argument("--tags", help="Listing tags")
    backlog_parser.add_argument("--save-reason", help="Reason for saving")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == "search":
        cmd_search_simple(args)
    elif args.command == "analyze":
        cmd_analyze_simple(args)
    elif args.command == "backlog-add":
        cmd_backlog_add_simple(args)
    else:
        print(f"Unknown command: {args.command}")
        parser.print_help()


if __name__ == "__main__":
    main()