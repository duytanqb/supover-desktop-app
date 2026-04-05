import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { logger } from '../utils/logger.js';

let db: Database.Database | null = null;

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  const dataDir = join(userDataPath, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    logger.info(`Created data directory: ${dataDir}`);
  }
  return join(dataDir, 'supover.db');
}

export function initDatabase(): Database.Database {
  const dbPath = getDbPath();
  logger.info(`Opening database at: ${dbPath}`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  // Create version tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM schema_version'
  ).get() as { version: number | null };

  const appliedVersion = currentVersion?.version ?? 0;

  for (const migration of migrations) {
    if (migration.version > appliedVersion) {
      logger.info(`Applying migration ${migration.version}: ${migration.name}`);
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        );
      })();
    }
  }

  logger.info(`Database schema up to date (version ${migrations.length > 0 ? migrations[migrations.length - 1].version : 0})`);
}

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_all_tables',
    sql: `
      -- Crawl jobs (referenced by other tables)
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type        TEXT NOT NULL,
        target_id       INTEGER NOT NULL,
        profile_id      TEXT,
        proxy_used      TEXT,
        status          TEXT DEFAULT 'pending',
        pages_crawled   INTEGER DEFAULT 0,
        error_message   TEXT,
        started_at      TEXT,
        completed_at    TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);

      -- Shops
      CREATE TABLE IF NOT EXISTS shops (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_name     TEXT NOT NULL UNIQUE,
        shop_url      TEXT NOT NULL,
        priority      TEXT DEFAULT 'normal',
        crawl_interval_minutes INTEGER DEFAULT 360,
        notes         TEXT,
        status        TEXT DEFAULT 'active',
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );

      -- Shop snapshots
      CREATE TABLE IF NOT EXISTS shop_snapshots (
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
      CREATE INDEX IF NOT EXISTS idx_shop_snapshots_shop ON shop_snapshots(shop_id, crawled_at);

      -- Listings
      CREATE TABLE IF NOT EXISTS listings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id         INTEGER NOT NULL REFERENCES shops(id),
        etsy_listing_id TEXT NOT NULL,
        first_seen_at   TEXT DEFAULT (datetime('now')),
        last_seen_at    TEXT DEFAULT (datetime('now')),
        status          TEXT DEFAULT 'active',
        notes           TEXT,
        UNIQUE(shop_id, etsy_listing_id)
      );
      CREATE INDEX IF NOT EXISTS idx_listings_shop ON listings(shop_id);

      -- Listing snapshots
      CREATE TABLE IF NOT EXISTS listing_snapshots (
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
        tags_visible      TEXT,
        crawled_at        TEXT DEFAULT (datetime('now')),
        crawl_job_id      INTEGER REFERENCES crawl_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_listing_snapshots_listing ON listing_snapshots(listing_id, crawled_at);
      CREATE INDEX IF NOT EXISTS idx_listing_snapshots_shop ON listing_snapshots(shop_id, crawled_at);

      -- Listing analytics (VK1ng data)
      CREATE TABLE IF NOT EXISTS listing_analytics (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id        INTEGER NOT NULL REFERENCES listings(id),
        etsy_listing_id   TEXT NOT NULL,
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
        trending_score    REAL DEFAULT 0,
        trend_status      TEXT DEFAULT 'SKIP',
        qualified         INTEGER DEFAULT 0,
        qualified_by      TEXT,
        tags              TEXT,
        categories        TEXT,
        shop_country      TEXT,
        shop_sold         INTEGER,
        fetched_at        TEXT DEFAULT (datetime('now')),
        crawl_job_id      INTEGER REFERENCES crawl_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_listing ON listing_analytics(listing_id, fetched_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_trend ON listing_analytics(trend_status, trending_score);
      CREATE INDEX IF NOT EXISTS idx_analytics_etsy_id ON listing_analytics(etsy_listing_id);

      -- HTML cache
      CREATE TABLE IF NOT EXISTS html_cache (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        page_type       TEXT NOT NULL,
        target_id       INTEGER,
        target_name     TEXT NOT NULL,
        page_number     INTEGER DEFAULT 1,
        file_path       TEXT NOT NULL,
        file_size_bytes INTEGER,
        parse_status    TEXT DEFAULT 'pending',
        parse_error     TEXT,
        listings_found  INTEGER DEFAULT 0,
        crawl_job_id    INTEGER REFERENCES crawl_jobs(id),
        crawled_at      TEXT DEFAULT (datetime('now')),
        parsed_at       TEXT,
        expires_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_html_cache_target ON html_cache(page_type, target_name, crawled_at);
      CREATE INDEX IF NOT EXISTS idx_html_cache_parse ON html_cache(parse_status);

      -- Search keywords
      CREATE TABLE IF NOT EXISTS search_keywords (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword               TEXT NOT NULL UNIQUE,
        category              TEXT,
        crawl_interval_minutes INTEGER DEFAULT 720,
        max_pages             INTEGER DEFAULT 3,
        status                TEXT DEFAULT 'active',
        notes                 TEXT,
        parent_keyword_id     INTEGER REFERENCES search_keywords(id),
        expansion_source      TEXT DEFAULT 'user_input',
        source_listing_id     TEXT,
        depth                 INTEGER DEFAULT 0,
        is_saturated          INTEGER DEFAULT 0,
        auto_expand           INTEGER DEFAULT 1,
        created_at            TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_keywords_parent ON search_keywords(parent_keyword_id);
      CREATE INDEX IF NOT EXISTS idx_keywords_status ON search_keywords(status, is_saturated);

      -- Search snapshots
      CREATE TABLE IF NOT EXISTS search_snapshots (
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
      CREATE INDEX IF NOT EXISTS idx_search_snapshots_keyword ON search_snapshots(keyword_id, crawled_at);

      -- Browser profiles
      CREATE TABLE IF NOT EXISTS browser_profiles (
        id              TEXT PRIMARY KEY,
        profile_path    TEXT NOT NULL,
        proxy_id        TEXT,
        status          TEXT DEFAULT 'active',
        total_requests  INTEGER DEFAULT 0,
        last_used_at    TEXT,
        burned_at       TEXT,
        burn_reason     TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      );

      -- Proxies
      CREATE TABLE IF NOT EXISTS proxies (
        id              TEXT PRIMARY KEY,
        protocol        TEXT NOT NULL,
        host            TEXT NOT NULL,
        port            INTEGER NOT NULL,
        username        TEXT,
        password        TEXT,
        status          TEXT DEFAULT 'active',
        fail_count      INTEGER DEFAULT 0,
        last_used_at    TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      );

      -- Alerts
      CREATE TABLE IF NOT EXISTS alerts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type      TEXT NOT NULL,
        shop_id         INTEGER REFERENCES shops(id),
        listing_id      INTEGER REFERENCES listings(id),
        keyword_id      INTEGER REFERENCES search_keywords(id),
        old_value       TEXT,
        new_value       TEXT,
        severity        TEXT DEFAULT 'info',
        is_read         INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read, created_at);

      -- AI insights
      CREATE TABLE IF NOT EXISTS ai_insights (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type    TEXT NOT NULL,
        shop_id         INTEGER REFERENCES shops(id),
        keyword_id      INTEGER REFERENCES search_keywords(id),
        content         TEXT NOT NULL,
        data_context    TEXT,
        model_used      TEXT,
        is_pinned       INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now'))
      );

      -- Settings
      CREATE TABLE IF NOT EXISTS settings (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL,
        updated_at      TEXT DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    name: 'seed_default_settings',
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
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
    `,
  },
];
