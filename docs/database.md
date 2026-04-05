# Database Schema — Etsy Spy

SQLite via better-sqlite3. Tất cả bảng tạo trong migration lần đầu chạy app.

## Bảng `shops`

```sql
CREATE TABLE shops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name     TEXT NOT NULL UNIQUE,
  shop_url      TEXT NOT NULL,
  priority      TEXT DEFAULT 'normal',     -- low | normal | high
  crawl_interval_minutes INTEGER DEFAULT 360,
  notes         TEXT,
  status        TEXT DEFAULT 'active',     -- active | paused | archived
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

## Bảng `shop_snapshots`

```sql
CREATE TABLE shop_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id         INTEGER NOT NULL REFERENCES shops(id),
  total_listings  INTEGER,
  total_sales     INTEGER,
  total_reviews   INTEGER,
  total_admirers  INTEGER,
  shop_banner_url TEXT,
  shop_avatar_url TEXT,
  shop_description TEXT,
  crawled_at      TEXT DEFAULT (datetime('now')),
  crawl_job_id    INTEGER REFERENCES crawl_jobs(id),
  raw_html_path   TEXT
);
CREATE INDEX idx_shop_snapshots_shop ON shop_snapshots(shop_id, crawled_at);
```

## Bảng `listings`

```sql
CREATE TABLE listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id         INTEGER NOT NULL REFERENCES shops(id),
  etsy_listing_id TEXT NOT NULL,
  first_seen_at   TEXT DEFAULT (datetime('now')),
  last_seen_at    TEXT DEFAULT (datetime('now')),
  status          TEXT DEFAULT 'active',  -- active | disappeared | archived
  notes           TEXT,
  UNIQUE(shop_id, etsy_listing_id)
);
CREATE INDEX idx_listings_shop ON listings(shop_id);
```

## Bảng `listing_snapshots`

```sql
CREATE TABLE listing_snapshots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id        INTEGER NOT NULL REFERENCES listings(id),
  shop_id           INTEGER NOT NULL REFERENCES shops(id),
  title             TEXT,
  price             REAL,
  sale_price        REAL,
  currency          TEXT DEFAULT 'USD',
  image_url         TEXT,
  rating            REAL,
  review_count      INTEGER,
  is_bestseller     INTEGER DEFAULT 0,
  is_ad             INTEGER DEFAULT 0,
  is_free_shipping  INTEGER DEFAULT 0,
  shipping_info     TEXT,
  position_in_shop  INTEGER,
  tags_visible      TEXT,              -- JSON array
  crawled_at        TEXT DEFAULT (datetime('now')),
  crawl_job_id      INTEGER REFERENCES crawl_jobs(id)
);
CREATE INDEX idx_listing_snapshots_listing ON listing_snapshots(listing_id, crawled_at);
CREATE INDEX idx_listing_snapshots_shop ON listing_snapshots(shop_id, crawled_at);
```

## Bảng `listing_analytics`

Data từ VK1ng API (HeyEtsy).

```sql
CREATE TABLE listing_analytics (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id        INTEGER NOT NULL REFERENCES listings(id),
  etsy_listing_id   TEXT NOT NULL,
  -- VK1ng metrics
  sold_24h          REAL DEFAULT 0,
  views_24h         REAL DEFAULT 0,
  hey_score         REAL DEFAULT 0,
  days_old          REAL DEFAULT 0,
  total_sold        INTEGER DEFAULT 0,
  estimated_revenue TEXT,
  conversion_rate   REAL DEFAULT 0,
  num_favorers      INTEGER DEFAULT 0,
  daily_views       REAL DEFAULT 0,
  total_views       INTEGER DEFAULT 0,
  -- Computed
  trending_score    REAL DEFAULT 0,
  trend_status      TEXT DEFAULT 'SKIP',  -- HOT | WATCH | SKIP
  qualified         INTEGER DEFAULT 0,
  qualified_by      TEXT,                  -- JSON array of rule names
  -- Metadata
  tags              TEXT,
  categories        TEXT,
  shop_country      TEXT,
  shop_sold         INTEGER,
  -- Timestamps
  fetched_at        TEXT DEFAULT (datetime('now')),
  crawl_job_id      INTEGER REFERENCES crawl_jobs(id)
);
CREATE INDEX idx_analytics_listing ON listing_analytics(listing_id, fetched_at);
CREATE INDEX idx_analytics_trend ON listing_analytics(trend_status, trending_score);
CREATE INDEX idx_analytics_etsy_id ON listing_analytics(etsy_listing_id);
```

## Bảng `html_cache`

```sql
CREATE TABLE html_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  page_type       TEXT NOT NULL,           -- shop_index | search_index | tag_index
  target_id       INTEGER,
  target_name     TEXT NOT NULL,
  page_number     INTEGER DEFAULT 1,
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER,
  parse_status    TEXT DEFAULT 'pending',  -- pending | parsed | error
  parse_error     TEXT,
  listings_found  INTEGER DEFAULT 0,
  crawl_job_id    INTEGER REFERENCES crawl_jobs(id),
  crawled_at      TEXT DEFAULT (datetime('now')),
  parsed_at       TEXT,
  expires_at      TEXT
);
CREATE INDEX idx_html_cache_target ON html_cache(page_type, target_name, crawled_at);
CREATE INDEX idx_html_cache_parse ON html_cache(parse_status);
```

## Bảng `search_keywords`

```sql
CREATE TABLE search_keywords (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword               TEXT NOT NULL UNIQUE,
  category              TEXT,
  crawl_interval_minutes INTEGER DEFAULT 720,
  max_pages             INTEGER DEFAULT 3,
  status                TEXT DEFAULT 'active',
  notes                 TEXT,
  -- Tag expansion tracking
  parent_keyword_id     INTEGER REFERENCES search_keywords(id),
  expansion_source      TEXT DEFAULT 'user_input', -- user_input | tag_expansion | ai_suggest | sibling_family
  source_listing_id     TEXT,
  depth                 INTEGER DEFAULT 0,
  is_saturated          INTEGER DEFAULT 0,
  auto_expand           INTEGER DEFAULT 1,
  created_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_keywords_parent ON search_keywords(parent_keyword_id);
CREATE INDEX idx_keywords_status ON search_keywords(status, is_saturated);
```

## Bảng `search_snapshots`

```sql
CREATE TABLE search_snapshots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id        INTEGER NOT NULL REFERENCES search_keywords(id),
  etsy_listing_id   TEXT NOT NULL,
  shop_name         TEXT,
  title             TEXT,
  price             REAL,
  sale_price        REAL,
  currency          TEXT DEFAULT 'USD',
  image_url         TEXT,
  rating            REAL,
  review_count      INTEGER,
  is_bestseller     INTEGER DEFAULT 0,
  is_ad             INTEGER DEFAULT 0,
  is_free_shipping  INTEGER DEFAULT 0,
  position_in_search INTEGER,
  page_number       INTEGER,
  crawled_at        TEXT DEFAULT (datetime('now')),
  crawl_job_id      INTEGER REFERENCES crawl_jobs(id)
);
CREATE INDEX idx_search_snapshots_keyword ON search_snapshots(keyword_id, crawled_at);
```

## Bảng `crawl_jobs`

```sql
CREATE TABLE crawl_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type        TEXT NOT NULL,         -- shop_index | search_index | tag_index
  target_id       INTEGER NOT NULL,
  profile_id      TEXT,
  proxy_used      TEXT,
  status          TEXT DEFAULT 'pending', -- pending | running | completed | failed | blocked
  pages_crawled   INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
```

## Bảng `browser_profiles`

```sql
CREATE TABLE browser_profiles (
  id              TEXT PRIMARY KEY,
  profile_path    TEXT NOT NULL,
  proxy_id        TEXT,
  status          TEXT DEFAULT 'active',  -- active | burned | retired
  total_requests  INTEGER DEFAULT 0,
  last_used_at    TEXT,
  burned_at       TEXT,
  burn_reason     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

## Bảng `proxies`

```sql
CREATE TABLE proxies (
  id              TEXT PRIMARY KEY,
  protocol        TEXT NOT NULL,          -- http | https | socks5
  host            TEXT NOT NULL,
  port            INTEGER NOT NULL,
  username        TEXT,
  password        TEXT,
  status          TEXT DEFAULT 'active',  -- active | failed | retired
  fail_count      INTEGER DEFAULT 0,
  last_used_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

## Bảng `alerts`

```sql
CREATE TABLE alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type      TEXT NOT NULL,          -- new_listing | price_change | title_change
                                          -- | review_spike | listing_disappeared
                                          -- | bestseller_change | new_shop_listing
                                          -- | trending_new_hot | trending_velocity_spike
                                          -- | trending_status_change
  shop_id         INTEGER REFERENCES shops(id),
  listing_id      INTEGER REFERENCES listings(id),
  keyword_id      INTEGER REFERENCES search_keywords(id),
  old_value       TEXT,
  new_value       TEXT,
  severity        TEXT DEFAULT 'info',    -- info | warning | important
  is_read         INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_alerts_unread ON alerts(is_read, created_at);
```

## Bảng `ai_insights`

```sql
CREATE TABLE ai_insights (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_type    TEXT NOT NULL,          -- shop_summary | trend_alert | keyword_suggestion
                                          -- | niche_discovery | strategy_change
  shop_id         INTEGER REFERENCES shops(id),
  keyword_id      INTEGER REFERENCES search_keywords(id),
  content         TEXT NOT NULL,
  data_context    TEXT,                   -- JSON: snapshot IDs, diff data
  model_used      TEXT,
  is_pinned       INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

## Bảng `settings`

```sql
CREATE TABLE settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value) VALUES
  ('vking_api_key', ''),
  ('vking_base_url', 'https://vk1ng.com/api'),
  ('vking_cache_hours', '24'),
  ('vking_bulk_batch_size', '50'),
  ('ai_provider', 'anthropic'),
  ('ai_api_key', ''),
  ('ai_model', 'claude-sonnet-4-20250514'),
  ('default_crawl_interval', '360'),
  ('max_concurrent_tabs', '2'),
  ('page_view_limit_per_hour', '60'),
  ('min_delay_seconds', '3'),
  ('max_delay_seconds', '8'),
  ('auto_create_profile_on_block', 'true'),
  ('pause_on_consecutive_blocks', '3'),
  ('pause_duration_minutes', '30'),
  ('snapshot_retention_days', '90'),
  ('html_cache_retention_days', '7'),
  ('theme', 'dark');
```
