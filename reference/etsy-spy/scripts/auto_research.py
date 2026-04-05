#!/usr/bin/env python3
"""
Etsy Auto Research — Continuous Discovery Strategy

Flow:
  1. Start with broad apparel-ish seed/source family keywords → get listing IDs
  2. Pre-dedupe harvested IDs against workbook state (seen/backlog/excluded/frontier/cluster refs)
  3. Bulk call VK1ng API only for truly new IDs → filter winners using the active backlog qualification rule
  4. Follow strong phrase/tag branches immediately from fresh winners
  5. When a keyword cluster saturates, pivot sideways into sibling query families
  6. Repeat while preserving provenance for later backlog saves and avoiding stale bestseller sludge

This script stays intentionally lightweight. Persist final keeper rows with
`etsy_spy.py backlog-add` so the backlog workbook stores `source_query`,
`keyword_expansion`, `query_chain`, and `save_reason` for qualified ideas.
Use `etsy_backlog.py frontier-add`, `seen-add`, and `cluster-add` when you want
lightweight crawl state in the same workbook without changing the backlog flow.

One persistent browser, new tab per search.

Usage:
    python auto_research.py --stealth --rounds 3 --keywords "funny shirt,mom tee"
    python auto_research.py --stealth --rounds 3 --output results.json
"""

import argparse
import asyncio
import json
import requests
from datetime import datetime
from typing import List, Dict, Set

from keyword_discovery import get_seasonal_keywords
from etsy_search import get_bulk_analytics, filter_trending
from etsy_backlog import filter_new_listing_ids

VKING_API_KEY = "TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ"
MIN_SOLD_24H = 2
MAX_AGE_DAYS = 60
SATURATION_NEW_ID_THRESHOLD = 4
SATURATION_WINNER_THRESHOLD = 1


class EtsyBrowser:
    """Single browser, new tab per search."""

    def __init__(self, use_stealth: bool = True, port: int = None):
        self.use_stealth = use_stealth
        self.port = port
        self.pw = None
        self.browser = None
        self.ctx = None

    async def start(self):
        from playwright.async_api import async_playwright
        from undetected_playwright import stealth_async

        self.pw = await async_playwright().start()
        self._stealth = stealth_async

        if self.port:
            self.browser = await self.pw.chromium.connect_over_cdp(f"http://127.0.0.1:{self.port}")
            self.ctx = self.browser.contexts[0]
            self._stealth = None
        else:
            self.browser = await self.pw.chromium.launch(
                headless=False,
                args=["--disable-blink-features=AutomationControlled"],
            )
            self.ctx = await self.browser.new_context(
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
            )
        print("✅ Browser ready")

    async def new_tab(self):
        page = await self.ctx.new_page()
        if self._stealth:
            await self._stealth(page)
        return page

    async def close(self):
        if self.pw:
            await self.pw.stop()

    async def search(self, keyword: str, limit: int = 30) -> List[int]:
        """Search keyword → return listing IDs (new tab, auto-close)."""
        page = await self.new_tab()
        try:
            url = f"https://www.etsy.com/search?q={keyword.replace(' ', '+')}&ship_to=US"
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)

            for _ in range(2):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await asyncio.sleep(0.8)

            ids = await page.evaluate("""() => {
                const s = new Set();
                document.querySelectorAll('a[href*="/listing/"]').forEach(a => {
                    const m = a.href.match(/\\/listing\\/(\\d+)/);
                    if (m) s.add(parseInt(m[1]));
                });
                return Array.from(s);
            }""")
            return ids[:limit]
        except Exception as e:
            print(f"   ⚠️ search error: {e}")
            return []
        finally:
            await page.close()


def vking_bulk(listing_ids: List[int]) -> List[dict]:
    """Call VK1ng API in batches of 50."""
    results = []
    for i in range(0, len(listing_ids), 50):
        batch = listing_ids[i:i+50]
        ids_str = ",".join(str(x) for x in batch)
        try:
            resp = requests.get(
                f"https://vk1ng.com/api/bulk/listings/{ids_str}",
                headers={"Authorization": f"Bearer {VKING_API_KEY}"},
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status"):
                    results.extend(data.get("data", []))
        except Exception as e:
            print(f"   ⚠️ VK1ng error: {e}")
    return results


def qualifies_backlog_rule(sold: float, views: float, hey: float, age: float) -> bool:
    return (
        sold >= 2
        or views >= 120
        or (views >= 80 and hey >= 8)
        or (age <= 30 and hey >= 10 and views >= 40)
        or (sold >= 3 and age <= 90)
    )


def filter_winners(listings: List[dict]) -> List[dict]:
    """Keep products meeting the active backlog qualification rule."""
    winners = []
    for d in listings:
        sold = d.get("sold", 0) or 0
        age = d.get("original_creation_days", 999) or 999
        views = d.get("views_24h", 0) or 0
        hey = d.get("hey", d.get("hey_score", 0)) or 0
        cr = d.get("cr", 0) or 0
        score = (sold * 10) + (views / 10) + (cr * 2)

        if qualifies_backlog_rule(sold, views, hey, age):
            winners.append({
                "listing_id": d.get("listing_id"),
                "sold_24h": sold,
                "days_old": age,
                "views_24h": views,
                "hey_score": hey,
                "total_sold": d.get("total_sold", 0),
                "revenue": d.get("estimated_revenue", "N/A"),
                "cr": cr,
                "score": round(score, 1),
                "tags": d.get("tags", ""),
                "categories": d.get("categories", ""),
                "status": "🔥 HOT" if sold >= 3 else "⚠️ WATCH",
            })
    return sorted(winners, key=lambda x: x["score"], reverse=True)


def extract_search_keywords(tags_str: str) -> List[str]:
    """Extract 2-4 word phrases from comma-separated tags."""
    if not tags_str:
        return []
    tags = [t.strip() for t in tags_str.split(",")]
    keywords = []
    skip_generic = {"shirt", "tee", "gift", "cute", "funny", "vintage", "retro", "comfort colors"}
    for tag in tags:
        words = tag.lower().split()
        if 2 <= len(words) <= 4:
            if not all(w in skip_generic for w in words):
                keywords.append(tag.lower())
    return keywords[:5]


def keyword_family(keyword: str) -> str:
    """Return a loose family key so sibling phrases stay grouped."""
    words = [w for w in keyword.lower().split() if w]
    return " ".join(words[:2]) if words else ""


def build_family_expansions(keyword: str, winners: List[dict]) -> List[str]:
    """Create sibling query-family pivots when the current cluster dries up."""
    family = keyword_family(keyword)
    candidates = []
    seen = set()

    if family:
        for winner in winners[:5]:
            for tag_kw in extract_search_keywords(winner.get("tags", "")):
                if tag_kw == keyword:
                    continue
                tag_family = keyword_family(tag_kw)
                if tag_family and tag_family != family and tag_kw not in seen:
                    seen.add(tag_kw)
                    candidates.append(tag_kw)

    words = keyword.lower().split()
    if len(words) >= 2:
        stem = " ".join(words[:-1])
        tail = words[-1]
        sibling_suffixes = {
            "shirt": ["tee", "sweatshirt", "hoodie"],
            "tee": ["shirt", "sweatshirt"],
            "gift": ["shirt", "mug", "hoodie"],
        }
        for sibling in sibling_suffixes.get(tail, []):
            candidate = f"{stem} {sibling}".strip()
            if candidate != keyword and candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)

    return candidates[:6]


def prioritize_next_keywords(branch_keywords: List[str], family_keywords: List[str], seen_kw: Set[str]) -> List[str]:
    """Prefer hot branch-following first, then family pivots for saturated clusters.

    Use broad seeds only to surface branches; do not keep prioritizing a seed once
    stronger phrase/tag descendants are available.
    """
    ordered = []
    for group in (branch_keywords, family_keywords):
        for kw in group:
            if kw and kw not in seen_kw and kw not in ordered:
                ordered.append(kw)
    return ordered


async def auto_research(
    broad_keywords: List[str] = None,
    rounds: int = 3,
    limit: int = 30,
    use_stealth: bool = True,
    port: int = None,
) -> Dict:

    if not broad_keywords:
        broad_keywords = get_seasonal_keywords()
        if not broad_keywords:
            broad_keywords = ["funny shirt", "graphic tee", "aesthetic shirt"]

    print(f"\n🚀 ETSY TAG-SCALING RESEARCH")
    print(f"   Broad: {broad_keywords}")
    print(f"   Rounds: {rounds} | Limit: {limit}/search")
    print("   Filter: active backlog qualification rule")

    browser = EtsyBrowser(use_stealth=use_stealth, port=port)
    await browser.start()

    seen_ids: Set[int] = set()
    seen_kw: Set[str] = set()
    all_winners: List[dict] = []
    search_queue: List[str] = list(broad_keywords)
    searched_kw: List[str] = []

    try:
        for round_num in range(1, rounds + 1):
            print(f"\n{'='*60}")
            print(f"📍 ROUND {round_num}")
            print(f"{'='*60}")

            kws_this_round = [kw for kw in search_queue if kw not in seen_kw][:8]
            if not kws_this_round:
                print("   No new keywords. Done.")
                break

            search_queue = []  # Reset for next round
            round_winners: List[dict] = []

            branch_keywords: List[str] = []
            family_keywords: List[str] = []

            for keyword in kws_this_round:
                seen_kw.add(keyword)
                searched_kw.append(keyword)
                print(f"\n🔍 {keyword}")

                # Step 1: Search → listing IDs
                ids = await browser.search(keyword, limit)
                batch_new_ids = [i for i in ids if i not in seen_ids]
                seen_ids.update(batch_new_ids)
                workbook_new_ids, skipped_ids = filter_new_listing_ids(batch_new_ids)
                print(f"   {len(ids)} found | {len(batch_new_ids)} not-seen-this-run | {len(workbook_new_ids)} truly new after workbook dedupe | {len(skipped_ids)} already tracked")

                if not workbook_new_ids:
                    family_keywords.extend(build_family_expansions(keyword, []))
                    continue

                # Step 2: VK1ng API → filter only truly new IDs
                data = vking_bulk(workbook_new_ids)
                winners = filter_winners(data)
                print(f"   ✅ {len(winners)} winners (active backlog rule)")
                for w in winners[:3]:
                    print(f"      #{w['listing_id']} | {w['status']} | sold:{w['sold_24h']} | {w['revenue']}")
                    print(f"      tags: {w['tags'][:60]}...")

                round_winners.extend(winners)

                # Follow strong branches immediately when a good listing appears.
                for winner in winners[:4]:
                    branch_keywords.extend(extract_search_keywords(winner["tags"]))

                saturated = (
                    len(workbook_new_ids) <= SATURATION_NEW_ID_THRESHOLD
                    or len(winners) <= SATURATION_WINNER_THRESHOLD
                )
                if saturated:
                    family_keywords.extend(build_family_expansions(keyword, winners))
                    print("   ↪ cluster looks saturated; queueing sibling query-family pivots")

                await asyncio.sleep(1.5)

            # Step 3: Prefer branch-following, then family pivots from saturated clusters.
            all_winners.extend(round_winners)
            search_queue = prioritize_next_keywords(branch_keywords, family_keywords, seen_kw)
            print(f"\n📈 Round {round_num}: {len(round_winners)} winners → {len(search_queue)} queued keywords")
            if search_queue[:8]:
                print(f"   Next up: {search_queue[:8]}")

    finally:
        await browser.close()

    # Deduplicate + sort final winners
    seen = set()
    unique_winners = []
    for w in all_winners:
        if w["listing_id"] not in seen:
            seen.add(w["listing_id"])
            unique_winners.append(w)
    unique_winners.sort(key=lambda x: x["score"], reverse=True)

    hot = [w for w in unique_winners if w["status"] == "🔥 HOT"]
    watch = [w for w in unique_winners if w["status"] == "⚠️ WATCH"]

    print(f"\n{'='*60}")
    print(f"📊 FINAL RESULTS")
    print(f"{'='*60}")
    print(f"   🔥 HOT:   {len(hot)}")
    print(f"   ⚠️ WATCH: {len(watch)}")
    print(f"   🔍 Keywords: {len(searched_kw)}")

    if hot:
        print(f"\n🏆 TOP 10 HOT PRODUCTS:")
        for i, w in enumerate(hot[:10], 1):
            print(f"   {i}. #{w['listing_id']} | Score:{w['score']} | Sold:{w['sold_24h']} | {w['revenue']}")
            print(f"      {w['tags'][:65]}...")
            print(f"      🔗 https://www.etsy.com/listing/{w['listing_id']}")

    return {
        "hot": hot,
        "watch": watch,
        "keywords_searched": searched_kw,
        "timestamp": datetime.now().isoformat(),
    }


async def main_async():
    p = argparse.ArgumentParser(description="Etsy Tag-Scaling Research")
    p.add_argument("--keywords", "-k", help="Broad keywords (comma-separated)")
    p.add_argument("--rounds", "-r", type=int, default=3)
    p.add_argument("--limit", "-l", type=int, default=30)
    p.add_argument("--stealth", "-s", action="store_true", default=True)
    p.add_argument("--port", "-p", type=int)
    p.add_argument("--output", "-o")
    args = p.parse_args()

    broad = [k.strip() for k in args.keywords.split(",")] if args.keywords else None
    results = await auto_research(broad, args.rounds, args.limit, args.stealth, args.port)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Saved: {args.output}")


def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
