#!/usr/bin/env python3
import subprocess
import json
import sys

# Test with just one keyword
keyword = "shirt"
cmd = ["python3", "scripts/etsy_search.py", keyword, "--stealth", "--limit", "3", "--json"]

print(f"Running: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True)

print(f"Return code: {result.returncode}")
print(f"Stdout length: {len(result.stdout)}")
print(f"Stderr: {result.stderr[:200] if result.stderr else 'None'}")

if result.stdout:
    try:
        data = json.loads(result.stdout)
        print(f"Parsed JSON successfully")
        print(f"Hot: {len(data.get('hot', []))}")
        print(f"Watch: {len(data.get('watch', []))}")
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"First 200 chars of stdout: {result.stdout[:200]}")