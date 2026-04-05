---
name: etsy-spy
description: Research Etsy product opportunities with a listing-first workflow for POD discovery. Use when starting from live Etsy listings, expanding via related listings/tags/shop-adjacent ideas, checking VK1ng metrics, and saving qualified ideas to the shared backlog workbook for Printfamily.
---

# Etsy Spy - Listing-First Continuous Discovery

Start from real Etsy listings, but do **not** lock yourself into stale bestseller sludge. Use broad apparel-ish seeds to surface fresh phrase branches, find promising listings inside those broader searches, then follow the strongest related/tag/shop branches while they stay productive. When a cluster saturates, pivot into the next adjacent source/query family. Save only metric-qualified ideas into the shared backlog workbook.

## Shared Backlog Workbook

Use this workbook as the source of truth:

```bash
/Users/duytan/Documents/Business/Printfamily/etsy-ideas.xlsx
```

Use sheet/tab:

```bash
backlog
```

### Simplified Field Set (Focus on these)
To reduce confusion, focus on these essential fields when adding/updating rows:

| Field | Description | Required |
|-------|-------------|----------|
| `title` | Listing title (optional) | No |
| `listing_id` | Etsy listing ID | **Yes** |
| `listing_url` | Full Etsy URL (`https://www.etsy.com/listing/{id}`) | **Yes** |
| `sold_24h` | Sold in last 24 hours | **Yes** |
| `views_24h` | Views in last 24 hours | **Yes** |
| `hey_score` | HEY score (0‑10) | **Yes** |
| `days_old` | Age of listing in days | **Yes** |
| `total_sold` | Total sold count | **Yes** |
| `estimated_revenue` | Estimated revenue (e.g., "23.8K USD") | **Yes** |
| `tags` | Comma‑separated tags | **Yes** |
| `mockup_url` | Main mockup image URL (required, can be empty string if no mockup yet) | **Yes** |
| `spy_date` | Date of discovery (YYYY‑MM‑DD) | **Yes** |

All other fields (e.g., `search_keyword`, `source_query`, `trend_score`, `design_angle`, `product_types`, etc.) are automatically filled or can be left empty.

### Title and Main Image Extraction
- **Title** and **main image URL** are now extracted directly from the Etsy search page HTML (no API needed).
- The script `etsy_search.py` uses Playwright to parse listing cards and retrieves:
  - **Title:** from `<h3 class="v2-listing-card__title">` (or similar).
  - **Main image URL:** from the first `<img src="...">` inside the listing card.
- These fields are included in the JSON output and saved to the backlog via `etsy_add_simple.py`.
- If extraction fails (e.g., HTML structure changes), the fields default to empty strings.

### Rules:
- `etsy-spy` writes/updates rows here.
- `printfamily-seller` reads approved rows here.
- Keep the existing backlog/approval flow intact; do not invent a second tracker.
- `backlog-add` deduplicates by `listing_id` and preserves the current metric gate.
- Use the `backlog` sheet for saved listing ideas and the `keyword_log` sheet for lightweight expansion/query provenance.
- Use `frontier` for queued next searches/branches, `seen` for crawl dedupe, and `clusters` for loose niche-family rollups.
- Normalize headers instead of creating ad-hoc columns in random order.

## Standard Workflow (AI‑Agent → Python → Sheet)

To ensure consistent results across different AI models, follow this exact flow:

1. **AI Agent** passes a keyword to Python script `etsy_search.py`.
2. **Python script** opens Chrome (via HMA/stealth), loads Etsy search page, extracts HTML.
3. **Python parses HTML** to collect listing IDs, **title**, and **main image URL**, pre‑dedupes against workbook state (`seen`, `backlog`, `frontier`, `clusters`).
4. **Python calls VK1ng API** for each new listing ID to fetch analytics (`sold_24h`, `views_24h`, `hey_score`, `days_old`, `total_sold`, `estimated_revenue`, `tags`), then enriches the data with **title** and **main image URL** extracted from HTML.
5. **Python applies metric gate** (HOT/WATCH thresholds) and filters qualified listings.
6. **Python outputs a standardized JSON** with all required fields (see below).
7. **AI Agent** (or another Python script) adds qualified listings to the backlog sheet using `etsy_backlog.py` or `etsy_add_simple.py`.

### Standardized JSON Output
Every listing object in the output will contain these fields (missing data filled with defaults):

```json
{
  "listing_id": "123456789",
  "title": "",
  "listing_url": "https://www.etsy.com/listing/123456789",
  "mockup_url": "",
  "sold_24h": 0,
  "views_24h": 0,
  "hey_score": 0,
  "days_old": 0,
  "total_sold": 0,
  "estimated_revenue": "",
  "tags": "",
  "categories": "",
  "status": "❌ SKIP"
}
```

### Core Discovery Loop (Detailed)

1. **Start broad, still apparel-ish**: begin with broad shirt/tee/sweatshirt/gift-style seeds that are wide enough to expose fresh wording branches, but still close enough to apparel buyer intent to stay commercially useful.
2. **Listing-first search**: search Etsy from those broad seeds and grab listing IDs from the first result set. Prefer harvesting IDs from the loaded HTML/page source first; use scrolling only as a fallback if the first paint is sparse.
3. **Pre-dedupe before metrics**: compare harvested listing IDs against workbook state first — backlog rows, `seen`, excluded/rejected backlog rows, `frontier` source IDs, and cluster top-listing references. Do **not** spend VK1ng / HEY calls on IDs already represented in that state.
4. **Metric pass only on truly new IDs**: pull VK1ng analytics for the remaining net-new listing IDs.
5. **Select winners**: keep only listings that meet HOT/WATCH thresholds or clearly justify deeper review.
5. **Queue / track branch state lightly**:
   - add next searches or tag/shop-adjacent pivots to `frontier`
   - mark listing IDs / queries / shops already touched in `seen`
   - keep one loose rollup row per idea family in `clusters`
6. **Follow strong branches immediately** using one or more of:
   - **Related scan**: inspect nearby / recommended / same-intent listings from the seed listing or search page.
   - **Tag scan**: mine tags from winning listings and reuse strong 2-4 word phrases as next searches.
   - **Shop-adjacent scan**: inspect the seller shop and nearby products from the same shop.
7. **Promote branches, not sludge**: prefer the fresh phrase/tag branches that emerge from current winners; avoid camping on old bestseller results just because they are familiar or high total-sold.
8. **Watch for saturation**: when a branch returns mostly duplicate IDs, weak VK1ng results, or stops yielding qualified ideas, pivot to the next sibling source/query family instead of grinding the same cluster.
9. **Expand source/query families**: use the best tags, phrase stems, shop-adjacent audiences, and related-listing angles to open new but adjacent search families.
10. **Save qualified ideas**: only write rows that meet metric thresholds into the workbook.
11. **Capture provenance**: store the seed query, expansion phrase, and query chain when a saved idea came from tags/related/shop-adjacent discovery.
12. **Approve later**: backlog rows stay `spied` until explicitly promoted to `approved`.

In short: **harvest IDs → pre-dedupe against workbook state → spend metrics only on net-new IDs → keep the current qualification rule unchanged**.

## Metric-Based Save Rule

Keep the active gate in `scripts/etsy_spy.py backlog-add` intact. Save only if at least one is true:

1. `sold_24h >= 2`
2. `views_24h >= 120`
3. `views_24h >= 80 AND hey >= 8`
4. `days_old <= 30 AND hey >= 10 AND views_24h >= 40`
5. `sold_24h >= 3 AND days_old <= 90`

If a listing does not qualify, skip saving it instead of filling the workbook with weak ideas.

When practical, store:
- `hey_score` = normalized HEY metric used for the gate
- `qualified_by` = rule label(s) that caused the save, e.g. `rule_2_views_24h_ge_120`

## VK1ng API Commands

```bash
# Single listing analytics
python scripts/etsy_analytics.py listing 4398005066

# Bulk listing analytics
python scripts/etsy_analytics.py bulk "4398005066,4407375743"

# Trending classification for candidate listings
python scripts/etsy_analytics.py trending "4398005066,4407375743" --min-sold 2 --max-days 60

# Check API subscription / key health
python scripts/etsy_analytics.py status
```

Prefer bulk calls over many single calls when checking several listings.

## Listing Harvest Heuristic

Default to a conservative no-scroll pass first:
- harvest listing IDs from the initial loaded HTML/DOM
- only do 1-2 light fallback scrolls if the first paint returns too few IDs
- this usually beats viewport-only card capture without adding much bot risk

For product pages, also treat the loaded HTML as a quick source for the current listing ID plus any same-shop / related IDs already present on the page before doing deeper interaction.

## Listing-First Commands

```bash
# Search Etsy, harvest IDs, pre-dedupe against workbook state, then review only truly new candidates
python scripts/etsy_search.py "fathers day shirt" --stealth --limit 30

# Preset keyword batches are still useful for seed discovery
python scripts/etsy_search.py --preset seasonal --stealth

# Multi-keyword discovery
python scripts/etsy_search.py --keywords "graduation,summer,dad gift" --stealth

# Analyze one listing page in detail
python scripts/etsy_spy.py analyze 4475109999

# Inspect the seller shop for adjacent products
python scripts/etsy_spy.py shop SomeShopName
```

### Simple Add Command (Focus on essential fields)
When you have analytics data and want to add a listing to the backlog with only the essential fields, use:

```bash
python scripts/etsy_add_simple.py --listing-id 123456789 \
  --sold-24h 5 --views-24h 150 --hey-score 8.5 \
  --days-old 30 --total-sold 1000 --estimated-revenue "10K USD" \
  --tags "shirt,tee" --title "My Listing Title" \
  --mockup-url ""
```

This command automatically fills `listing_url`, `spy_date` (today), and other optional fields with sensible defaults. It’s model‑agnostic and works with any LLM.

## Related / Tag / Shop-Adjacent Expansion

Treat discovery as a rolling tree, not a one-shot search batch:
- Start with broad apparel-ish seeds to discover live wording branches.
- If a fresh winner appears, follow that branch before returning to weaker seeds.
- If a branch dries up, pivot sideways into the next phrase family instead of forcing more depth.
- Use `frontier`, `seen`, and `clusters` to keep branch-following deliberate instead of repeatedly re-mining the same stale search terrain.
- Treat workbook state as the cheap dedupe layer: backlog + `seen` + excluded rows + `frontier` refs + cluster top IDs should be checked before any VK1ng / HEY request.
- Keep metric gates exactly the same; optimize the search path, not the save threshold.

### Related scan
Use the seed listing or search results to find near-neighbor listings with similar buyer intent, style, or phrase structure. If automation is incomplete, do this manually by opening the listing and harvesting nearby IDs for another bulk analytics pass.

When a related branch produces another strong listing, keep following that branch until it weakens. When it starts repeating the same concepts or metrics fall off, pivot to a sibling branch instead.

### Tag scan
Use tags from winning listings as the main expansion engine.

```bash
# Extract keyword ideas from a niche/search page
python scripts/etsy_spy.py keywords "fathers day shirt"

# Auto-discover tags / autocomplete / seasonal ideas
python scripts/keyword_discovery.py --port 9222 --method all

# Automated search -> metric filter -> tag expansion loop
python scripts/auto_research.py --stealth --rounds 2 --output results.json
```

When tags are too generic, skip them. Reuse only phrases that are specific enough to become the next search seed.

Prefer this order:
1. tags from the strongest fresh winners
2. sibling phrases from the same intent family
3. only then broader seasonal/autocomplete exploration

### Shop-adjacent scan
When a winner comes from a strong seller, inspect that shop for:
- repeatable design angles
- adjacent audiences
- profitable phrase families
- recent similar listings worth rechecking with VK1ng metrics

Treat shop-adjacent findings as a way to open new source families, not just to copy more of the same listing type.

`python scripts/etsy_spy.py shop <shop_name>` is the current lightweight entry point.

## Saving to Backlog

Initialize workbook if needed:

```bash
python scripts/etsy_backlog.py init
```

Save/update one qualified listing idea:

```bash
python scripts/etsy_spy.py backlog-add \
  --listing-id 4475109999 \
  --search-keyword "fathers day shirt" \
  --source-query "fathers day shirt" \
  --query-chain "fathers day shirt > dad club shirt" \
  --keyword-expansion "dad club shirt" \
  --expansion-source listing-tag \
  --source-tag "dad club shirt" \
  --save-reason "tag expansion + fresh velocity" \
  --niche "fathers day" \
  --title "Dad Club Shirt" \
  --shop-name "ExampleShop" \
  --sold-24h 3 \
  --views-24h 124 \
  --hey 8 \
  --conversion-rate 4.8 \
  --days-old 41 \
  --total-sold 218 \
  --estimated-revenue "5234" \
  --tags "dad club,father shirt,new dad gift" \
  --trend-status WATCH \
  --trend-score 47.2 \
  --design-angle "Dad Club est birth year retro tee" \
  --workflow-status spied
```

Log a keyword expansion without saving a listing row yet:

```bash
python scripts/etsy_backlog.py log-keyword \
  --seed-keyword "fathers day shirt" \
  --expanded-keyword "retro dad shirt" \
  --source-type listing-tag \
  --source-listing-id 4433602290 \
  --source-tag "retro dad shirt" \
  --query-chain "fathers day shirt > retro dad shirt"

# Queue a next-step search branch
python scripts/etsy_backlog.py frontier-add \
  --seed-keyword "fathers day shirt" \
  --frontier-keyword "dad club shirt" \
  --source-type listing-tag \
  --source-listing-id 4475109999 \
  --parent-query "fathers day shirt" \
  --query-chain "fathers day shirt > dad club shirt" \
  --depth 1 \
  --priority high

# Mark seen listing/shop/query state for dedupe
python scripts/etsy_backlog.py seen-add \
  --entity-type listing \
  --entity-id 4475109999 \
  --entity-value "Dad Club Shirt" \
  --source-query "dad club shirt" \
  --cluster-key "fathers-day-dad-club"

# Track a loose cluster/family rollup
python scripts/etsy_backlog.py cluster-add \
  --cluster-key "fathers-day-dad-club" \
  --cluster-label "Dad club / fatherhood retro" \
  --seed-keyword "fathers day shirt" \
  --representative-query "dad club shirt" \
  --listing-count 7 \
  --winner-count 2 \
  --top-listing-id 4475109999
```

Review or approve rows:

```bash
python scripts/etsy_backlog.py list --workflow-status spied
python scripts/etsy_backlog.py update 1 --workflow-status approved
```

## What to Capture Per Saved Listing

Capture enough context for later design production:

- `listing_id`, `listing_url`, `title`, `shop_name`
- `search_keyword`, `source_query`, `keyword_expansion`, `query_chain`, and normalized `niche`
- `save_reason` = why this row deserved saving now
- `sold_24h`, `views_24h`, `conversion_rate`, `days_old`, `total_sold`, `estimated_revenue`
- `tags`, `trend_status`, `trend_score`
- `design_angle` = how Printfamily should reinterpret the idea, not copy it
- optional notes about related listings, shop adjacency, or why this concept matters

## Working Heuristics

- Use broad apparel-ish seeds to open the map; use branch-following to find the real opportunities.
- Prefer listings with fresh velocity over old vanity bestsellers.
- Avoid getting stuck in stale bestseller sludge; high lifetime sales alone are not a reason to stay on a branch.
- Treat tags as expansion seeds, not final truth.
- Prefer clusters: one strong listing plus related listings plus shop-adjacent evidence beats a lone outlier.
- Use `frontier` to queue next branches, `seen` to prevent duplicate crawling, and `clusters` to track which phrase families are still productive.
- When a cluster saturates, switch families fast; do not over-mine duplicate terrain.
- When a strong new idea appears, keep following that branch until quality drops.
- Save fewer, better rows instead of dumping raw research.
- Reuse the workbook as the handoff surface to Printfamily.

## Quick Reference

| Action | Command |
|--------|---------|
| Search seed listings | `python scripts/etsy_search.py "funny dad shirt" --stealth --limit 30` |
| Analyze a listing | `python scripts/etsy_analytics.py listing 4398005066` |
| Score several listings | `python scripts/etsy_analytics.py trending "id1,id2,id3"` |
| Inspect listing page | `python scripts/etsy_spy.py analyze <listing_id_or_url>` |
| Inspect seller shop | `python scripts/etsy_spy.py shop <shop_name>` |
| Expand via tags/autocomplete | `python scripts/keyword_discovery.py --port 9222 --method all` |
| Run continuous branch/family loop | `python scripts/auto_research.py --stealth --rounds 2 --keywords "seed one,seed two"` |
| Save qualified candidate | `python scripts/etsy_spy.py backlog-add ...` |
| Review backlog | `python scripts/etsy_backlog.py list --workflow-status spied` |

## For DeepSeek Chat Compatibility

DeepSeek Chat may struggle with complex async code and qualification logic. Use these simplified alternatives:

| Action | Simplified Command |
|--------|-------------------|
| Search (simple) | `python scripts/etsy_spy_simple.py search "funny dad shirt"` |
| Analyze (simple) | `python scripts/etsy_spy_simple.py analyze 123456789` |
| Add to backlog (simple) | `python scripts/etsy_spy_simple.py backlog-add --listing-id 123456789 --sold-24h 3 --views-24h 100` |
| Check qualification | `python scripts/qualification_helper.py` (run directly to test) |

### Key Differences for DeepSeek:

1. **Use `etsy_spy_simple.py` instead of `etsy_spy.py`** - Simplified logic, better error messages
2. **Check qualification first** - Run the qualification helper to verify metrics before saving
3. **Explicit metrics** - Always provide sold_24h, views_24h, hey, and days_old when saving
4. **Simple commands** - Break complex operations into simple, sequential steps
5. **Use `etsy_spy_wrapper.py` for clean JSON output** - Wrapper script that suppresses warnings and returns structured JSON, ideal for DeepSeek integration.

### Qualification Rules (Simplified):

A listing qualifies if ANY of these are true:
1. **sold_24h >= 2** - At least 2 sales in 24 hours
2. **views_24h >= 120** - At least 120 views in 24 hours
3. **views_24h >= 80 AND hey >= 8** - Good views with high engagement
4. **days_old <= 30 AND hey >= 10 AND views_24h >= 40** - New listing with strong metrics
5. **sold_24h >= 3 AND days_old <= 90** - Strong sales for relatively new listing

### Example DeepSeek Workflow:

**Using wrapper (recommended for DeepSeek):**
```bash
# 1. Search for listings (clean JSON output)
python scripts/etsy_spy_wrapper.py search "funny dad shirt" --limit 20

# 2. Check qualification for a listing
python scripts/qualification_helper.py

# 3. Save qualified listing (via wrapper)
python scripts/etsy_spy_wrapper.py add-backlog --listing-id 123456789 --keyword "funny dad shirt"
```

**Original workflow (still works):**
```bash
# 1. Search for listings
python scripts/etsy_search.py "funny dad shirt" --stealth --json > results.json

# 2. Check qualification for a listing
python scripts/qualification_helper.py

# 3. Save qualified listing
python scripts/etsy_spy_simple.py backlog-add \
  --listing-id 123456789 \
  --sold-24h 3 \
  --views-24h 150 \
  --hey 7 \
  --days-old 45 \
  --title "Funny Dad Shirt" \
  --shop-name "CoolShop" \
  --save-reason "Good sales velocity"
```

## Rate Limiting & Anti-Bot

Etsy blocks aggressively. Prefer this order:
1. VK1ng analytics first
2. One search page / one listing page / one shop page at a time
3. Bulk metric calls instead of many repeated page loads
4. eRank/manual fallback if Etsy blocks the current IP

Fallback:

```bash
python scripts/etsy_spy.py erank "fishing shirt"
```

## Files

- `scripts/etsy_search.py` - Search results -> listing IDs -> bulk analytics
- `scripts/etsy_analytics.py` - VK1ng listing analytics and trending score
- `scripts/auto_research.py` - automated search/tag-expansion loop
- `scripts/keyword_discovery.py` - autocomplete/seasonal/tag keyword discovery
- `scripts/etsy_spy.py` - page-level listing/shop inspection + backlog save, including provenance fields
- `scripts/etsy_backlog.py` - shared backlog workbook manager + `keyword_log` writer
