#!/usr/bin/env python3
"""
Wrapper for Etsy Spy scripts to provide clean, structured output for DeepSeek.
Usage: python etsy_spy_wrapper.py search <keyword> [--limit 20] [--json]
"""
import subprocess
import json
import sys
import os

def run_search(keyword, limit=20, stealth=True, json_output=True):
    """Run etsy_search.py and return parsed JSON."""
    cmd = [sys.executable, 'etsy_search.py', keyword,
           '--stealth' if stealth else '--hma',
           '--limit', str(limit)]
    if json_output:
        cmd.append('--json')
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return {'error': result.stderr[:200]}
        # Extract JSON from stdout
        lines = result.stdout.strip().split('\n')
        json_start = None
        for i, line in enumerate(lines):
            if line.startswith('{'):
                json_start = i
                break
        if json_start is None:
            return {'error': 'No JSON output', 'stdout': result.stdout[:200]}
        json_str = '\n'.join(lines[json_start:])
        return json.loads(json_str)
    except Exception as e:
        return {'error': str(e)}

def run_analytics(listing_id):
    """Run etsy_analytics.py for a single listing."""
    cmd = [sys.executable, 'etsy_analytics.py', 'listing', str(listing_id)]
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {'error': result.stderr[:200]}
        # Parse output lines
        data = {}
        for line in result.stdout.split('\n'):
            if ':' in line:
                key, val = line.split(':', 1)
                data[key.strip()] = val.strip()
        return data
    except Exception as e:
        return {'error': str(e)}

def add_to_backlog(listing_data, keyword):
    """Add listing to backlog via etsy_backlog.py."""
    cmd = [sys.executable, 'etsy_backlog.py', 'add',
           '--listing-id', str(listing_data.get('listing_id', '')),
           '--search-keyword', keyword,
           '--sold-24h', str(listing_data.get('sold_24h', 0)),
           '--views-24h', str(listing_data.get('views_24h', 0)),
           '--hey-score', str(listing_data.get('hey_score', 0)),
           '--days-old', str(listing_data.get('days_old', 0)),
           '--total-sold', str(listing_data.get('total_sold', 0)),
           '--estimated-revenue', listing_data.get('revenue', ''),
           '--tags', listing_data.get('tags', ''),
           '--trend-status', listing_data.get('status', 'WATCH').replace('⚠️ ', '').replace('🔥 ', ''),
           '--trend-score', str(listing_data.get('score', 0)),
           '--design-angle', 'Auto-qualified',
           '--workflow-status', 'spied']
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(__file__),
                                capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return {'success': True, 'message': f"Added {listing_data.get('listing_id')}"}
        else:
            return {'success': False, 'error': result.stderr[:200]}
    except Exception as e:
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python etsy_spy_wrapper.py search <keyword> [--limit 20]')
        print('       python etsy_spy_wrapper.py analytics <listing_id>')
        print('       python etsy_spy_wrapper.py add-backlog <listing_id> <keyword>')
        sys.exit(1)
    action = sys.argv[1]
    if action == 'search':
        keyword = sys.argv[2]
        limit = 20
        if '--limit' in sys.argv:
            idx = sys.argv.index('--limit')
            limit = int(sys.argv[idx+1])
        result = run_search(keyword, limit=limit, json_output=True)
        print(json.dumps(result, indent=2))
    elif action == 'analytics':
        listing_id = sys.argv[2]
        result = run_analytics(listing_id)
        print(json.dumps(result, indent=2))
    elif action == 'add-backlog':
        if len(sys.argv) < 4:
            print('Usage: python etsy_spy_wrapper.py add-backlog <listing_id> <keyword>')
            sys.exit(1)
        listing_id = sys.argv[2]
        keyword = sys.argv[3]
        # Need listing data; for simplicity, we assume minimal data
        listing_data = {'listing_id': listing_id}
        result = add_to_backlog(listing_data, keyword)
        print(json.dumps(result, indent=2))
    else:
        print('Unknown action')