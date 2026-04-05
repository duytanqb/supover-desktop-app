#!/usr/bin/env python3
"""
Simplified qualification helper for DeepSeek compatibility.

This module provides clear, explicit functions for checking if listings qualify
for the backlog. It's designed to be easy for DeepSeek to understand and use correctly.
"""

from typing import Dict, List, Tuple, Optional


def check_qualification_simple(
    sold_24h: float,
    views_24h: float,
    hey_score: float,
    days_old: float
) -> Tuple[bool, List[str]]:
    """
    Simple, explicit qualification check.
    
    Returns: (qualified, reasons)
    
    Rules (explicitly written for clarity):
    1. sold_24h >= 2
    2. views_24h >= 120
    3. views_24h >= 80 AND hey_score >= 8
    4. days_old <= 30 AND hey_score >= 10 AND views_24h >= 40
    5. sold_24h >= 3 AND days_old <= 90
    """
    reasons = []
    
    # Rule 1: At least 2 sales in 24 hours
    if sold_24h >= 2:
        reasons.append("sold_24h_ge_2")
    
    # Rule 2: At least 120 views in 24 hours
    if views_24h >= 120:
        reasons.append("views_24h_ge_120")
    
    # Rule 3: At least 80 views AND hey score >= 8
    if views_24h >= 80 and hey_score >= 8:
        reasons.append("views_80_hey_8")
    
    # Rule 4: New listing (<=30 days) with hey >= 10 and views >= 40
    if days_old <= 30 and hey_score >= 10 and views_24h >= 40:
        reasons.append("new_listing_hey_10_views_40")
    
    # Rule 5: Good sales (>=3) for listings <= 90 days old
    if sold_24h >= 3 and days_old <= 90:
        reasons.append("sold_3_age_90")
    
    qualified = len(reasons) > 0
    return qualified, reasons


def get_qualification_status(
    sold_24h: float,
    views_24h: float,
    hey_score: float,
    days_old: float
) -> Dict[str, any]:
    """
    Get detailed qualification status.
    
    Returns dict with:
    - qualified: bool
    - reasons: list of rule names
    - rule_details: dict showing which rules passed/failed
    """
    qualified, reasons = check_qualification_simple(sold_24h, views_24h, hey_score, days_old)
    
    rule_details = {
        "rule_1_sold_24h_ge_2": sold_24h >= 2,
        "rule_2_views_24h_ge_120": views_24h >= 120,
        "rule_3_views_80_hey_8": views_24h >= 80 and hey_score >= 8,
        "rule_4_new_listing_hey_10_views_40": days_old <= 30 and hey_score >= 10 and views_24h >= 40,
        "rule_5_sold_3_age_90": sold_24h >= 3 and days_old <= 90,
    }
    
    return {
        "qualified": qualified,
        "reasons": reasons,
        "rule_details": rule_details,
        "metrics": {
            "sold_24h": sold_24h,
            "views_24h": views_24h,
            "hey_score": hey_score,
            "days_old": days_old,
        }
    }


def safe_float(value: any, default: float = 0.0) -> float:
    """
    Safely convert any value to float.
    
    Handles: None, empty strings, strings, numbers.
    """
    if value is None:
        return default
    
    if isinstance(value, (int, float)):
        return float(value)
    
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def validate_listing_data(listing: Dict) -> Dict:
    """
    Validate and normalize listing data.
    
    Ensures all required metrics are present as floats.
    """
    validated = listing.copy()
    
    # Extract metrics with safe defaults
    validated["sold_24h"] = safe_float(listing.get("sold", listing.get("sold_24h", 0)))
    validated["views_24h"] = safe_float(listing.get("views_24h", 0))
    validated["hey_score"] = safe_float(listing.get("hey", listing.get("hey_score", 0)))
    validated["days_old"] = safe_float(listing.get("original_creation_days", listing.get("days_old", 999)))
    
    # Ensure we have a listing_id
    if "listing_id" not in validated:
        validated["listing_id"] = listing.get("id", "")
    
    return validated


def should_save_to_backlog(listing: Dict) -> Tuple[bool, Dict]:
    """
    Main function: determine if a listing should be saved to backlog.
    
    Returns: (should_save, qualification_info)
    """
    validated = validate_listing_data(listing)
    
    qualification = get_qualification_status(
        sold_24h=validated["sold_24h"],
        views_24h=validated["views_24h"],
        hey_score=validated["hey_score"],
        days_old=validated["days_old"]
    )
    
    should_save = qualification["qualified"]
    
    return should_save, {
        "qualification": qualification,
        "validated_data": validated,
    }


# Example usage
if __name__ == "__main__":
    # Test cases
    test_listings = [
        {"sold": 3, "views_24h": 50, "hey": 5, "original_creation_days": 20},
        {"sold_24h": 1, "views_24h": 150, "hey_score": 7, "days_old": 45},
        {"sold": 2, "views_24h": 90, "hey": 9, "original_creation_days": 25},
        {"sold_24h": 0, "views_24h": 30, "hey_score": 12, "days_old": 15},
    ]
    
    print("Testing qualification logic:")
    print("=" * 60)
    
    for i, listing in enumerate(test_listings, 1):
        should_save, info = should_save_to_backlog(listing)
        status = "✅ QUALIFIED" if should_save else "❌ NOT QUALIFIED"
        
        print(f"\nTest {i}: {status}")
        print(f"  Metrics: sold={info['validated_data']['sold_24h']}, "
              f"views={info['validated_data']['views_24h']}, "
              f"hey={info['validated_data']['hey_score']}, "
              f"age={info['validated_data']['days_old']} days")
        
        if info["qualification"]["reasons"]:
            print(f"  Reasons: {', '.join(info['qualification']['reasons'])}")