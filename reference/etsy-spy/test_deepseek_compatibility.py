#!/usr/bin/env python3
"""
Test script for DeepSeek compatibility.

This script tests the simplified qualification logic and provides
clear examples for DeepSeek to follow.
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_qualification_helper():
    """Test the qualification helper module."""
    print("🧪 Testing Qualification Helper")
    print("=" * 60)
    
    try:
        from scripts.qualification_helper import (
            check_qualification_simple,
            get_qualification_status,
            safe_float,
            should_save_to_backlog
        )
        print("✅ qualification_helper imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import qualification_helper: {e}")
        print("Make sure the file exists at scripts/qualification_helper.py")
        return False
    
    # Test cases
    test_cases = [
        {
            "name": "Good sales (qualifies)",
            "sold_24h": 3,
            "views_24h": 50,
            "hey": 5,
            "days_old": 45,
            "should_qualify": True,
            "expected_reasons": ["sold_24h_ge_2", "sold_3_age_90"]
        },
        {
            "name": "High views (qualifies)",
            "sold_24h": 1,
            "views_24h": 150,
            "hey": 7,
            "days_old": 60,
            "should_qualify": True,
            "expected_reasons": ["views_24h_ge_120"]
        },
        {
            "name": "Good engagement (qualifies)",
            "sold_24h": 1,
            "views_24h": 90,
            "hey": 9,
            "days_old": 30,
            "should_qualify": True,
            "expected_reasons": ["views_80_hey_8"]
        },
        {
            "name": "New listing strong (qualifies)",
            "sold_24h": 0,
            "views_24h": 45,
            "hey": 12,
            "days_old": 15,
            "should_qualify": True,
            "expected_reasons": ["new_listing_hey_10_views_40"]
        },
        {
            "name": "Weak listing (does not qualify)",
            "sold_24h": 0,
            "views_24h": 20,
            "hey": 3,
            "days_old": 120,
            "should_qualify": False,
            "expected_reasons": []
        },
    ]
    
    all_passed = True
    
    for test in test_cases:
        print(f"\n📊 Test: {test['name']}")
        print(f"  Metrics: sold={test['sold_24h']}, views={test['views_24h']}, "
              f"hey={test['hey']}, age={test['days_old']} days")
        
        # Test simple check
        qualified, reasons = check_qualification_simple(
            test['sold_24h'], test['views_24h'], test['hey'], test['days_old']
        )
        
        # Test detailed status
        status = get_qualification_status(
            test['sold_24h'], test['views_24h'], test['hey'], test['days_old']
        )
        
        # Test with listing dict
        listing = {
            "sold_24h": test['sold_24h'],
            "views_24h": test['views_24h'],
            "hey_score": test['hey'],
            "days_old": test['days_old'],
            "listing_id": "TEST123"
        }
        should_save, info = should_save_to_backlog(listing)
        
        # Check results
        passed = (qualified == test['should_qualify'] and 
                  should_save == test['should_qualify'] and
                  status['qualified'] == test['should_qualify'])
        
        if passed:
            print(f"  ✅ PASSED")
            if qualified:
                print(f"    Reasons: {', '.join(reasons)}")
        else:
            print(f"  ❌ FAILED")
            print(f"    Expected qualify: {test['should_qualify']}")
            print(f"    Got qualified: {qualified}")
            print(f"    Got should_save: {should_save}")
            print(f"    Got status: {status['qualified']}")
            all_passed = False
    
    return all_passed


def test_safe_float():
    """Test safe_float function."""
    print("\n🧪 Testing safe_float")
    print("=" * 60)
    
    try:
        from scripts.qualification_helper import safe_float
    except ImportError:
        print("❌ qualification_helper not available")
        return False
    
    test_cases = [
        ("integer", 5, 5.0),
        ("float", 3.14, 3.14),
        ("string number", "7.5", 7.5),
        ("empty string", "", 0.0),
        ("None", None, 0.0),
        ("invalid string", "abc", 0.0),
    ]
    
    all_passed = True
    
    for name, input_val, expected in test_cases:
        result = safe_float(input_val)
        passed = abs(result - expected) < 0.001 if isinstance(expected, float) else result == expected
        
        if passed:
            print(f"  ✅ {name}: {input_val} -> {result}")
        else:
            print(f"  ❌ {name}: {input_val} -> {result} (expected {expected})")
            all_passed = False
    
    return all_passed


def test_etsy_spy_simple():
    """Test that etsy_spy_simple.py exists and is runnable."""
    print("\n🧪 Testing etsy_spy_simple.py")
    print("=" * 60)
    
    simple_path = os.path.join(os.path.dirname(__file__), "scripts", "etsy_spy_simple.py")
    
    if not os.path.exists(simple_path):
        print(f"❌ File not found: {simple_path}")
        return False
    
    print(f"✅ File exists: {simple_path}")
    
    # Check if it's runnable
    import subprocess
    try:
        result = subprocess.run(
            [sys.executable, simple_path, "--help"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print("✅ Script runs successfully with --help")
            # Show first few lines of help
            help_lines = result.stdout.split('\n')[:10]
            print("   Help output (first 10 lines):")
            for line in help_lines:
                if line:
                    print(f"   {line}")
            return True
        else:
            print(f"❌ Script failed with return code {result.returncode}")
            print(f"   Stderr: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error running script: {e}")
        return False


def main():
    """Run all tests."""
    print("🚀 DeepSeek Compatibility Tests")
    print("=" * 60)
    
    tests = [
        ("Qualification Helper", test_qualification_helper),
        ("Safe Float", test_safe_float),
        ("Etsy Spy Simple", test_etsy_spy_simple),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n{'='*60}")
        print(f"Running: {test_name}")
        print(f"{'='*60}")
        try:
            passed = test_func()
            results.append((test_name, passed))
        except Exception as e:
            print(f"❌ Test crashed: {e}")
            results.append((test_name, False))
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}")
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} {test_name}")
        if not passed:
            all_passed = False
    
    print(f"\n{'='*60}")
    if all_passed:
        print("🎉 ALL TESTS PASSED - DeepSeek compatibility confirmed!")
    else:
        print("⚠️ SOME TESTS FAILED - Check the issues above")
    
    # Recommendations
    print(f"\n📋 RECOMMENDATIONS FOR DEEPSEEK:")
    print("1. Use etsy_spy_simple.py for basic operations")
    print("2. Always check qualification with qualification_helper.py first")
    print("3. Provide explicit metrics (sold_24h, views_24h, hey, days_old)")
    print("4. Run this test script to verify compatibility")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())