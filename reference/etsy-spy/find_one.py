#!/usr/bin/env python3
import subprocess, json, sys, os

def qualify(sold, views, hey, days):
    if sold >= 2: return True
    if views >= 120: return True
    if views >= 80 and hey >= 8: return True
    if days <= 30 and hey >= 10 and views >= 40: return True
    if sold >= 3 and days <= 90: return True
    return False

def search(keyword, limit=10):
    cmd = [sys.executable, "scripts/etsy_spy_wrapper.py", "search", keyword, "--limit", str(limit)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90, cwd=os.path.dirname(__file__))
    if result.returncode != 0:
        return []
    data = json.loads(result.stdout)
    return data.get("hot", []) + data.get("watch", [])

def add_listing(lst, keyword):
    lid = lst["listing_id"]
    cmd = [
        sys.executable, "scripts/etsy_backlog.py", "add",
        "--listing-id", str(lid),
        "--search-keyword", keyword,
        "--source-query", keyword,
        "--query-chain", keyword,
        "--keyword-expansion", keyword,
        "--save-reason", "qualified",
        "--niche", "apparel",
        "--sold-24h", str(lst.get("sold_24h", 0)),
        "--views-24h", str(lst.get("views_24h", 0)),
        "--hey-score", str(lst.get("hey_score", 0)),
        "--days-old", str(lst.get("days_old", 0)),
        "--total-sold", str(lst.get("total_sold", 0)),
        "--estimated-revenue", lst.get("revenue", ""),
        "--tags", lst.get("tags", ""),
        "--trend-status", lst.get("status", "WATCH").replace("🔥 ", "").replace("⚠️ ", ""),
        "--trend-score", str(lst.get("score", 0)),
        "--design-angle", "Apparel",
        "--workflow-status", "spied"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=os.path.dirname(__file__))
    return result.returncode == 0

def main():
    keywords = ["graphic tee", "fathers day shirt", "mothers day mug", "hoodie", "sweatshirt"]
    existing = set()
    try:
        cmd = [sys.executable, "scripts/etsy_backlog.py", "--json", "list", "--workflow-status", "spied"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=os.path.dirname(__file__))
        if res.returncode == 0:
            data = json.loads(res.stdout)
            existing = {str(d.get("listing_id")) for d in data}
            print(f"Existing IDs: {len(existing)}")
    except:
        pass
    
    for kw in keywords:
        print(f"Searching {kw}")
        listings = search(kw, limit=12)
        for lst in listings:
            lid = str(lst.get("listing_id"))
            if lid in existing:
                continue
            sold = lst.get("sold_24h", 0)
            views = lst.get("views_24h", 0)
            hey = lst.get("hey_score", 0)
            days = lst.get("days_old", 999)
            if qualify(sold, views, hey, days):
                print(f"✅ {lid} sold={sold} views={views}")
                if add_listing(lst, kw):
                    print(f"Added {lid}")
                    return True
    print("No qualified listing found")
    return False

if __name__ == "__main__":
    main()