# Etsy Trending Product Selection Rules

## Core Metrics (from VK1ng API)

| Metric | Field | Threshold |
|--------|-------|-----------|
| Sold 24h | `sold` | **> 2** |
| Created | `original_creation_days` | **< 60 days** |
| Conversion Rate | `cr` | Higher = better |
| HEY Score | `hey` | Higher = better |

## Trending Score Formula

```
trending_score = (sold_24h * 10) + (views_24h / 10) + (cr * 2) + review_recency_bonus

Where:
- sold_24h: Sales in last 24 hours
- views_24h: Views in last 24 hours  
- cr: Conversion rate %
- review_recency_bonus: +20 if recent reviews (< 7 days)
```

## Product Selection Criteria

### ✅ PASS (Potential Winner)
1. `sold` (Sold 24h) >= 3
2. `original_creation_days` <= 60
3. Has recent reviews (within 7 days)
4. `trending_score` >= 50

### ⚠️ WATCH (Monitor)
1. `sold` (Sold 24h) = 2
2. `original_creation_days` <= 90
3. `trending_score` >= 30

### ❌ SKIP
1. `sold` (Sold 24h) < 2
2. `original_creation_days` > 90
3. No recent reviews
4. `trending_score` < 30

## Review Analysis

When fetching product detail page, check:

1. **Review Count** - More reviews = more trust
2. **Recent Reviews** - Reviews within 7 days = actively selling
3. **Review Sentiment** - 4-5 stars = quality product
4. **Review Photos** - Customer photos = real product validation

## Example Workflow

```bash
# 1. Search niche
python etsy_spy.py search "pickleball shirt" --top 20

# 2. Get analytics for top results
python etsy_analytics.py bulk "id1,id2,id3,..."

# 3. Filter by trending rules
python etsy_analytics.py trending "id1,id2,id3,..."

# 4. Deep analyze winners
python etsy_analytics.py analyze <listing_id>
```

## Data Sources

- **VK1ng API**: Sales, views, favorites, conversion
- **Etsy Page**: Reviews, review dates, photos
- **Combined**: Trending score calculation

---

Last updated: 2026-03-31
