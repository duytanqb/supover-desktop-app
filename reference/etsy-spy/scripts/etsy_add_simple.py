#!/usr/bin/env python3
"""
Simple add to backlog with essential fields only.
Usage:
  python etsy_add_simple.py --listing-id 12345 --sold-24h 5 --views-24h 150 --hey-score 8.5 --days-old 30 --total-sold 1000 --estimated-revenue "10K USD" --tags "shirt,tee" [--title "My Title"] [--mockup-url ""]
"""
import subprocess, sys, os, argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--listing-id', required=True)
    parser.add_argument('--sold-24h', required=True)
    parser.add_argument('--views-24h', required=True)
    parser.add_argument('--hey-score', required=True)
    parser.add_argument('--days-old', required=True)
    parser.add_argument('--total-sold', required=True)
    parser.add_argument('--estimated-revenue', required=True)
    parser.add_argument('--tags', required=True)
    parser.add_argument('--title', default='')
    parser.add_argument('--mockup-url', required=True, help='Required, can be empty string if no mockup yet')
    parser.add_argument('--search-keyword', default='auto')
    parser.add_argument('--spy-date', default='')  # auto today
    args = parser.parse_args()
    
    # Build command for etsy_backlog.py add
    cmd = [sys.executable, 'etsy_backlog.py', 'add',
           '--listing-id', args.listing_id,
           '--listing-url', f'https://www.etsy.com/listing/{args.listing_id}',
           '--title', args.title,
           '--sold-24h', args.sold_24h,
           '--views-24h', args.views_24h,
           '--hey-score', args.hey_score,
           '--days-old', args.days_old,
           '--total-sold', args.total_sold,
           '--estimated-revenue', args.estimated_revenue,
           '--tags', args.tags,
           '--mockup-url', args.mockup_url,
           '--search-keyword', args.search_keyword,
           '--source-query', args.search_keyword,
           '--query-chain', args.search_keyword,
           '--keyword-expansion', args.search_keyword,
           '--save-reason', 'simple-add',
           '--niche', 'general',
           '--trend-status', 'WATCH',
           '--trend-score', '0',
           '--design-angle', 'Simple add',
           '--workflow-status', 'spied']
    if args.spy_date:
        cmd.extend(['--spy-date', args.spy_date])
    
    # Run
    result = subprocess.run(cmd, cwd=os.path.dirname(__file__), capture_output=True, text=True)
    if result.returncode == 0:
        print('✅ Added successfully')
        if 'spied' in result.stdout:
            print(result.stdout)
    else:
        print('❌ Failed:', result.stderr)

if __name__ == '__main__':
    main()