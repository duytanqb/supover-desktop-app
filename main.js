import { app, ipcMain, BrowserWindow, shell } from "electron";
import { join } from "path";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, statSync, unlinkSync, rmSync } from "fs";
import winston from "winston";
import { randomUUID } from "node:crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function getLogDir() {
  const logDir = join(app.getPath("userData"), "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const stackStr = stack ? `
${stack}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
  })
);
const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ]
});
function initFileLogger() {
  const logDir = getLogDir();
  logger.add(
    new winston.transports.File({
      filename: join(logDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      // 5MB
      maxFiles: 3
    })
  );
  logger.add(
    new winston.transports.File({
      filename: join(logDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      // 10MB
      maxFiles: 5
    })
  );
  logger.info(`File logger initialized, log dir: ${logDir}`);
}
let db = null;
function getDbPath() {
  const userDataPath = app.getPath("userData");
  const dataDir = join(userDataPath, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    logger.info(`Created data directory: ${dataDir}`);
  }
  return join(dataDir, "supover.db");
}
function initDatabase() {
  const dbPath = getDbPath();
  logger.info(`Opening database at: ${dbPath}`);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}
function runMigrations(db2) {
  db2.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const currentVersion = db2.prepare(
    "SELECT MAX(version) as version FROM schema_version"
  ).get();
  const appliedVersion = currentVersion?.version ?? 0;
  for (const migration of migrations) {
    if (migration.version > appliedVersion) {
      logger.info(`Applying migration ${migration.version}: ${migration.name}`);
      db2.transaction(() => {
        db2.exec(migration.sql);
        db2.prepare("INSERT INTO schema_version (version, name) VALUES (?, ?)").run(
          migration.version,
          migration.name
        );
      })();
    }
  }
  logger.info(`Database schema up to date (version ${migrations.length > 0 ? migrations[migrations.length - 1].version : 0})`);
}
const migrations = [
  {
    version: 1,
    name: "create_all_tables",
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
        listing_id        INTEGER REFERENCES listings(id),
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
        expires_at      TEXT,
        cache_key       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_html_cache_target ON html_cache(page_type, target_name, crawled_at);
      CREATE INDEX IF NOT EXISTS idx_html_cache_parse ON html_cache(parse_status);
      CREATE INDEX IF NOT EXISTS idx_html_cache_key ON html_cache(cache_key);

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
    `
  },
  {
    version: 2,
    name: "seed_default_settings",
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('vking_api_key', 'TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ'),
        ('vking_base_url', 'https://vk1ng.com/api'),
        ('vking_cache_hours', '3'),
        ('vking_bulk_batch_size', '50'),
        ('ai_provider', 'deepseek'),
        ('ai_api_key', 'sk-90ce824dfea547089563e7bf67265cd1'),
        ('ai_model', 'deepseek-reasoner'),
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
    `
  },
  {
    version: 3,
    name: "make_listing_analytics_listing_id_nullable",
    sql: `
      -- Recreate listing_analytics with nullable listing_id
      -- (SQLite doesn't support ALTER COLUMN, so recreate the table)
      CREATE TABLE IF NOT EXISTS listing_analytics_new (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id        INTEGER REFERENCES listings(id),
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
      INSERT OR IGNORE INTO listing_analytics_new SELECT * FROM listing_analytics;
      DROP TABLE IF EXISTS listing_analytics;
      ALTER TABLE listing_analytics_new RENAME TO listing_analytics;
      CREATE INDEX IF NOT EXISTS idx_analytics_listing ON listing_analytics(listing_id, fetched_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_trend ON listing_analytics(trend_status, trending_score);
      CREATE INDEX IF NOT EXISTS idx_analytics_etsy_id ON listing_analytics(etsy_listing_id);
    `
  },
  {
    version: 4,
    name: "set_default_api_keys",
    sql: `
      UPDATE settings SET value = 'TxBvgQPYOlsLyzwARLack0Ky2fLIaxHpFLZF5pnZ' WHERE key = 'vking_api_key' AND (value = '' OR value IS NULL);
      UPDATE settings SET value = 'deepseek' WHERE key = 'ai_provider' AND value IN ('anthropic', '');
      UPDATE settings SET value = 'sk-90ce824dfea547089563e7bf67265cd1' WHERE key = 'ai_api_key' AND (value = '' OR value IS NULL);
      UPDATE settings SET value = 'deepseek-reasoner' WHERE key = 'ai_model' AND value IN ('claude-sonnet-4-20250514', 'deepseek-chat', '');
    `
  },
  {
    version: 5,
    name: "add_cache_key_and_3h_vking",
    sql: `
      -- Add cache_key column for MD5-based HTML cache reuse
      ALTER TABLE html_cache ADD COLUMN cache_key TEXT;
      CREATE INDEX IF NOT EXISTS idx_html_cache_key ON html_cache(cache_key);

      -- Update VK1ng cache from 24h to 3h to match crawl interval
      UPDATE settings SET value = '3' WHERE key = 'vking_cache_hours';
    `
  }
];
function registerShopHandlers(db2) {
  ipcMain.handle("shop:list", (_event) => {
    try {
      const shops = db2.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM listings l WHERE l.shop_id = s.id AND l.status = 'active') AS total_listings,
          (SELECT MAX(cj.completed_at) FROM crawl_jobs cj
           WHERE cj.target_id = s.id AND cj.job_type = 'shop_index' AND cj.status = 'completed') AS last_crawled
        FROM shops s
        WHERE s.status != 'archived'
        ORDER BY
          CASE s.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
          s.shop_name
      `).all();
      return { success: true, data: shops };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("shop:get", (_event, id) => {
    try {
      if (!id) return { success: false, error: "Shop id is required" };
      const shop = db2.prepare("SELECT * FROM shops WHERE id = ?").get(id);
      if (!shop) return { success: false, error: "Shop not found" };
      const latestSnapshot = db2.prepare(
        "SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT 1"
      ).get(id);
      const countRow = db2.prepare(
        "SELECT COUNT(*) as count FROM listings WHERE shop_id = ? AND status = 'active'"
      ).get(id);
      return {
        success: true,
        data: { ...shop, latest_snapshot: latestSnapshot ?? null, listing_count: countRow.count }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("shop:add", (_event, params) => {
    try {
      if (!params) return { success: false, error: "params is required" };
      let shopName = "";
      let shopUrl = "";
      if (params.url && params.url.trim()) {
        const url = params.url.trim();
        const match = url.match(/etsy\.com\/shop\/([^/?#]+)/i);
        if (match) {
          shopName = match[1];
          shopUrl = `https://www.etsy.com/shop/${shopName}`;
        } else {
          shopName = url.replace(/^https?:\/\/.*\/shop\//i, "").replace(/[/?#].*/g, "");
          shopUrl = `https://www.etsy.com/shop/${shopName}`;
        }
      } else if (params.shop_name && params.shop_name.trim()) {
        shopName = params.shop_name.trim();
        shopUrl = `https://www.etsy.com/shop/${shopName}`;
      }
      if (!shopName) return { success: false, error: "Shop URL or name is required" };
      const existing = db2.prepare("SELECT id FROM shops WHERE shop_name = ?").get(shopName);
      if (existing) return { success: false, error: `Shop "${shopName}" already exists` };
      const result = db2.prepare(
        "INSERT INTO shops (shop_name, shop_url, priority, notes) VALUES (?, ?, ?, ?)"
      ).run(shopName, shopUrl, params.priority || "normal", params.notes ?? null);
      const shop = db2.prepare("SELECT * FROM shops WHERE id = ?").get(result.lastInsertRowid);
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("shop:update", (_event, params) => {
    try {
      const id = params?.id;
      if (!id) return { success: false, error: "Shop id is required" };
      const fields = [];
      const values = [];
      if (params.shop_name !== void 0) {
        fields.push("shop_name = ?");
        values.push(params.shop_name);
      }
      if (params.shop_url !== void 0) {
        fields.push("shop_url = ?");
        values.push(params.shop_url);
      }
      if (params.priority !== void 0) {
        fields.push("priority = ?");
        values.push(params.priority);
      }
      if (params.notes !== void 0) {
        fields.push("notes = ?");
        values.push(params.notes);
      }
      if (params.status !== void 0) {
        fields.push("status = ?");
        values.push(params.status);
      }
      if (fields.length === 0) return { success: false, error: "No fields to update" };
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db2.prepare(`UPDATE shops SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      const shop = db2.prepare("SELECT * FROM shops WHERE id = ?").get(id);
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("shop:delete", (_event, id) => {
    try {
      if (!id) return { success: false, error: "Shop id is required" };
      db2.prepare("UPDATE shops SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(id);
      return { success: true, data: { message: "Shop archived" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("shop:crawl-now", async (_event, params) => {
    try {
      const id = typeof params === "number" ? params : params?.shopId;
      if (!id) return { success: false, error: "Shop id is required" };
      const shop = db2.prepare("SELECT * FROM shops WHERE id = ?").get(id);
      if (!shop) return { success: false, error: "Shop not found" };
      const { crawlShop } = await import("./chunks/crawlService-CkFqvZFR.js");
      const result = await crawlShop(db2, id);
      return {
        success: true,
        data: { message: `Crawl completed: ${result.listingIds.length} listings found`, listingIds: result.listingIds }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerKeywordHandlers(db2) {
  ipcMain.handle("keyword:list", (_event, filters) => {
    try {
      let sql = `
        SELECT
          sk.*,
          sk.expansion_source AS source,
          (SELECT MAX(cj.completed_at) FROM crawl_jobs cj
           WHERE cj.target_id = sk.id AND cj.job_type = 'search_index' AND cj.status = 'completed') AS last_crawled,
          COALESCE((SELECT COUNT(*) FROM listing_analytics la
           JOIN search_snapshots ss ON ss.etsy_listing_id = la.etsy_listing_id
           WHERE ss.keyword_id = sk.id AND la.trend_status = 'HOT'), 0) AS hot_count,
          COALESCE((SELECT COUNT(*) FROM listing_analytics la
           JOIN search_snapshots ss ON ss.etsy_listing_id = la.etsy_listing_id
           WHERE ss.keyword_id = sk.id AND la.trend_status = 'WATCH'), 0) AS watch_count
        FROM search_keywords sk
      `;
      const params = [];
      if (filters?.status) {
        sql += " WHERE sk.status = ?";
        params.push(filters.status);
      } else {
        sql += " WHERE sk.status != 'archived'";
      }
      sql += " ORDER BY sk.created_at DESC";
      const keywords = db2.prepare(sql).all(...params);
      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("keyword:add", (_event, params) => {
    try {
      if (!params || !params.keyword || !params.keyword.trim()) {
        return { success: false, error: "keyword is required" };
      }
      const keyword = params.keyword.trim().toLowerCase();
      const existing = db2.prepare("SELECT id FROM search_keywords WHERE keyword = ?").get(keyword);
      if (existing) {
        return { success: false, error: "Keyword already exists" };
      }
      const result = db2.prepare(
        `INSERT INTO search_keywords (keyword, category, crawl_interval_minutes, max_pages, auto_expand, notes, parent_keyword_id, expansion_source, source_listing_id, depth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        keyword,
        params.category ?? null,
        params.crawl_interval_minutes ?? 180,
        params.max_pages ?? 3,
        params.auto_expand !== void 0 ? params.auto_expand ? 1 : 0 : 1,
        params.notes ?? null,
        params.parent_keyword_id ?? null,
        params.expansion_source ?? "user_input",
        params.source_listing_id ?? null,
        params.depth ?? 0
      );
      const created = db2.prepare("SELECT * FROM search_keywords WHERE id = ?").get(result.lastInsertRowid);
      return { success: true, data: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("keyword:update", (_event, id, updates) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      const fields = [];
      const values = [];
      if (updates.keyword !== void 0) {
        fields.push("keyword = ?");
        values.push(updates.keyword);
      }
      if (updates.category !== void 0) {
        fields.push("category = ?");
        values.push(updates.category);
      }
      if (updates.crawl_interval_minutes !== void 0) {
        fields.push("crawl_interval_minutes = ?");
        values.push(updates.crawl_interval_minutes);
      }
      if (updates.max_pages !== void 0) {
        fields.push("max_pages = ?");
        values.push(updates.max_pages);
      }
      if (updates.notes !== void 0) {
        fields.push("notes = ?");
        values.push(updates.notes);
      }
      if (updates.status !== void 0) {
        fields.push("status = ?");
        values.push(updates.status);
      }
      if (updates.auto_expand !== void 0) {
        fields.push("auto_expand = ?");
        values.push(updates.auto_expand);
      }
      if (fields.length === 0) {
        return { success: false, error: "No fields to update" };
      }
      values.push(id);
      db2.prepare(`UPDATE search_keywords SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      const keyword = db2.prepare("SELECT * FROM search_keywords WHERE id = ?").get(id);
      return { success: true, data: keyword };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("keyword:delete", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      db2.prepare(`UPDATE search_keywords SET status = 'archived' WHERE id = ?`).run(id);
      return { success: true, data: { message: "Keyword archived" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("keyword:crawl-now", async (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      const keyword = db2.prepare("SELECT * FROM search_keywords WHERE id = ?").get(id);
      if (!keyword) {
        return { success: false, error: "Keyword not found" };
      }
      const { crawlSearch } = await import("./chunks/crawlService-CkFqvZFR.js");
      const result = await crawlSearch(db2, id);
      return {
        success: true,
        data: {
          message: `Crawl completed: ${result.listingIds.length} listings found across ${result.pagesProcessed} pages`,
          listingIds: result.listingIds,
          pagesProcessed: result.pagesProcessed
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function runDailyCleanup(db2) {
  let deletedRecords = 0;
  let freedBytes = 0;
  const runCleanup = db2.transaction(() => {
    const htmlCacheRows = db2.prepare(`
      SELECT id, file_path, file_size_bytes FROM html_cache
      WHERE expires_at < datetime('now')
        OR (parse_status != 'error' AND crawled_at < datetime('now', '-7 days'))
        OR (parse_status = 'error' AND crawled_at < datetime('now', '-30 days'))
    `).all();
    for (const row of htmlCacheRows) {
      try {
        if (row.file_path && existsSync(row.file_path)) {
          const stat = statSync(row.file_path);
          freedBytes += stat.size;
          unlinkSync(row.file_path);
        }
      } catch (error) {
        logger.warn("Failed to delete HTML cache file", {
          filePath: row.file_path,
          error: error.message
        });
      }
    }
    if (htmlCacheRows.length > 0) {
      const ids = htmlCacheRows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      db2.prepare(`DELETE FROM html_cache WHERE id IN (${placeholders})`).run(...ids);
      deletedRecords += htmlCacheRows.length;
      logger.info("Cleanup: html_cache", { deleted: htmlCacheRows.length });
    }
    const lsResult = db2.prepare(
      "DELETE FROM listing_snapshots WHERE crawled_at < datetime('now', '-90 days')"
    ).run();
    deletedRecords += lsResult.changes;
    if (lsResult.changes > 0) {
      logger.info("Cleanup: listing_snapshots", { deleted: lsResult.changes });
    }
    const ssResult = db2.prepare(
      "DELETE FROM shop_snapshots WHERE crawled_at < datetime('now', '-90 days')"
    ).run();
    deletedRecords += ssResult.changes;
    if (ssResult.changes > 0) {
      logger.info("Cleanup: shop_snapshots", { deleted: ssResult.changes });
    }
    const searchResult = db2.prepare(
      "DELETE FROM search_snapshots WHERE crawled_at < datetime('now', '-60 days')"
    ).run();
    deletedRecords += searchResult.changes;
    if (searchResult.changes > 0) {
      logger.info("Cleanup: search_snapshots", { deleted: searchResult.changes });
    }
    const alertResult = db2.prepare(
      "DELETE FROM alerts WHERE is_read = 1 AND created_at < datetime('now', '-30 days')"
    ).run();
    deletedRecords += alertResult.changes;
    if (alertResult.changes > 0) {
      logger.info("Cleanup: alerts", { deleted: alertResult.changes });
    }
    const burnedProfiles = db2.prepare(`
      SELECT id, profile_path FROM browser_profiles
      WHERE status = 'burned' AND burned_at < datetime('now', '-30 days')
    `).all();
    for (const profile of burnedProfiles) {
      try {
        if (profile.profile_path && existsSync(profile.profile_path)) {
          rmSync(profile.profile_path, { recursive: true, force: true });
          logger.info("Cleanup: removed burned profile dir", { profileId: profile.id });
        }
      } catch (error) {
        logger.warn("Failed to remove burned profile dir", {
          profileId: profile.id,
          error: error.message
        });
      }
    }
    if (burnedProfiles.length > 0) {
      const ids = burnedProfiles.map((p) => p.id);
      const placeholders = ids.map(() => "?").join(",");
      db2.prepare(`DELETE FROM browser_profiles WHERE id IN (${placeholders})`).run(...ids);
      deletedRecords += burnedProfiles.length;
      logger.info("Cleanup: browser_profiles", { deleted: burnedProfiles.length });
    }
    const jobResult = db2.prepare(`
      DELETE FROM crawl_jobs
      WHERE status IN ('completed', 'failed')
        AND completed_at < datetime('now', '-30 days')
    `).run();
    deletedRecords += jobResult.changes;
    if (jobResult.changes > 0) {
      logger.info("Cleanup: crawl_jobs", { deleted: jobResult.changes });
    }
  });
  runCleanup();
  logger.info("Daily cleanup completed", { deletedRecords, freedBytes });
  return { deletedRecords, freedBytes };
}
let schedulerInstance = null;
class SchedulerService {
  timer = null;
  isRunning = false;
  isPaused = false;
  isCrawling = false;
  consecutiveBlocks = 0;
  pauseTimer = null;
  currentTarget = null;
  lastCheckTime = 0;
  checkIntervalMs = 6e4;
  // 60 seconds
  cleanupTimer = null;
  db;
  constructor(db2) {
    this.db = db2;
  }
  start() {
    if (this.timer) return;
    this.isRunning = true;
    this.lastCheckTime = Date.now();
    this.timer = setInterval(() => {
      this.tick();
    }, this.checkIntervalMs);
    this.runCleanup();
    this.cleanupTimer = setInterval(() => this.runCleanup(), 24 * 60 * 6e4);
    logger.info("Scheduler started (check every 60s, cleanup every 24h)");
    setTimeout(() => this.tick(), 5e3);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.isCrawling = false;
    this.currentTarget = null;
    logger.info("Scheduler stopped");
  }
  /**
   * Check if current time is in the blackout window.
   * HeyEtsy resets data between 12:00–21:00 Vietnam time (UTC+7),
   * so crawling during this period yields bad data for trend detection.
   */
  isBlackoutPeriod() {
    const now = /* @__PURE__ */ new Date();
    const vnHour = (now.getUTCHours() + 7) % 24;
    return vnHour >= 12 && vnHour < 21;
  }
  tick() {
    if (this.isPaused || this.isCrawling) return;
    if (this.isBlackoutPeriod()) {
      const now = /* @__PURE__ */ new Date();
      const vnHour = (now.getUTCHours() + 7) % 24;
      logger.info(`Scheduler skipping: blackout period (VN time: ${vnHour}:00, active 21:00-12:00)`);
      return;
    }
    this.lastCheckTime = Date.now();
    this.processNextDue().catch((err) => {
      logger.error("Scheduler tick error", { error: err.message });
    });
  }
  getDueTargets() {
    const targets = [];
    const dueShops = this.db.prepare(`
      SELECT s.id, s.shop_name, s.priority
      FROM shops s
      WHERE s.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'shop_index'
            AND cj.target_id = s.id
            AND cj.status IN ('completed', 'running')
            AND cj.completed_at > datetime('now', '-' || s.crawl_interval_minutes || ' minutes')
        )
      ORDER BY
        CASE s.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC
    `).all();
    for (const shop of dueShops) {
      targets.push({ type: "shop_index", targetId: shop.id, name: shop.shop_name, priority: shop.priority });
    }
    const dueKeywords = this.db.prepare(`
      SELECT sk.id, sk.keyword
      FROM search_keywords sk
      WHERE sk.status = 'active'
        AND sk.is_saturated = 0
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'search_index'
            AND cj.target_id = sk.id
            AND cj.status IN ('completed', 'running')
            AND cj.completed_at > datetime('now', '-' || sk.crawl_interval_minutes || ' minutes')
        )
      ORDER BY sk.depth ASC, sk.created_at ASC
    `).all();
    for (const kw of dueKeywords) {
      targets.push({ type: "search_index", targetId: kw.id, name: kw.keyword, priority: "normal" });
    }
    return targets;
  }
  async processNextDue() {
    const targets = this.getDueTargets();
    if (targets.length === 0) return;
    const target = targets[0];
    this.isCrawling = true;
    this.currentTarget = `${target.type === "shop_index" ? "Shop" : "Keyword"}: ${target.name}`;
    logger.info("Scheduler crawling", { type: target.type, name: target.name, queueRemaining: targets.length - 1 });
    try {
      const { crawlShop, crawlSearch } = await import("./chunks/crawlService-CkFqvZFR.js");
      if (target.type === "shop_index") {
        await crawlShop(this.db, target.targetId);
      } else {
        await crawlSearch(this.db, target.targetId);
      }
      this.consecutiveBlocks = 0;
      logger.info("Scheduler crawl completed", { type: target.type, name: target.name });
    } catch (error) {
      const errMsg = error.message;
      if (errMsg.includes("Blocked") || errMsg.includes("blocked")) {
        this.consecutiveBlocks++;
        logger.warn("Scheduler: crawl blocked", { consecutiveBlocks: this.consecutiveBlocks, target: target.name });
        const pauseThreshold = parseInt(this.getSetting("pause_on_consecutive_blocks", "3"));
        if (this.consecutiveBlocks >= pauseThreshold) {
          const pauseMinutes = parseInt(this.getSetting("pause_duration_minutes", "30"));
          this.pause(pauseMinutes);
          try {
            this.db.prepare(
              "INSERT INTO alerts (alert_type, severity, old_value, new_value) VALUES ('scheduler_auto_pause', 'important', ?, ?)"
            ).run(String(this.consecutiveBlocks), `Auto-paused for ${pauseMinutes} minutes after ${this.consecutiveBlocks} consecutive blocks`);
          } catch {
          }
        }
      } else {
        logger.error("Scheduler crawl failed", { target: target.name, error: errMsg });
      }
    } finally {
      this.isCrawling = false;
      this.currentTarget = null;
    }
  }
  getSetting(key, defaultValue) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ?? defaultValue;
  }
  pause(minutes) {
    this.isPaused = true;
    logger.warn("Scheduler paused", { minutes });
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => this.resume(), minutes * 6e4);
  }
  resume() {
    this.isPaused = false;
    this.consecutiveBlocks = 0;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    logger.info("Scheduler resumed");
  }
  runCleanup() {
    try {
      const result = runDailyCleanup(this.db);
      logger.info("Daily cleanup completed", result);
    } catch (err) {
      logger.error("Daily cleanup failed", { error: err.message });
    }
  }
  getStatus() {
    const elapsed = Date.now() - this.lastCheckTime;
    const nextCheckIn = Math.max(0, Math.floor((this.checkIntervalMs - elapsed) / 1e3));
    let queueLength = 0;
    try {
      queueLength = this.getDueTargets().length;
    } catch {
    }
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isBlackout: this.isBlackoutPeriod(),
      consecutiveBlocks: this.consecutiveBlocks,
      currentTarget: this.currentTarget,
      nextCheckIn,
      queueLength
    };
  }
}
function createScheduler(db2) {
  schedulerInstance = new SchedulerService(db2);
  return schedulerInstance;
}
function getScheduler() {
  return schedulerInstance;
}
function registerCrawlHandlers(db2) {
  ipcMain.handle("crawl:status", (_event) => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) {
        return { success: true, data: { isRunning: false, isPaused: false, queueLength: 0, currentTarget: null, consecutiveBlocks: 0, nextCheckIn: 0 } };
      }
      const status = scheduler.getStatus();
      return {
        success: true,
        data: {
          isRunning: status.isRunning,
          isPaused: status.isPaused,
          queueLength: status.queueLength,
          currentTarget: status.currentTarget,
          consecutiveBlocks: status.consecutiveBlocks,
          nextCheckIn: status.nextCheckIn
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("crawl:pause", (_event, minutes) => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: "Scheduler not initialized" };
      scheduler.pause(minutes ?? 30);
      return { success: true, data: { message: `Scheduler paused for ${minutes ?? 30} minutes` } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("crawl:resume", (_event) => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: "Scheduler not initialized" };
      scheduler.resume();
      return { success: true, data: { message: "Scheduler resumed" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("crawl:start", (_event) => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: "Scheduler not initialized" };
      scheduler.start();
      return { success: true, data: { message: "Scheduler started" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("crawl:stop", (_event) => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: "Scheduler not initialized" };
      scheduler.stop();
      return { success: true, data: { message: "Scheduler stopped" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("crawl:history", (_event, params) => {
    try {
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const jobs = db2.prepare(
        "SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).all(limit, offset);
      return { success: true, data: jobs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerSnapshotHandlers(db2) {
  ipcMain.handle("snapshot:shop-history", (_event, shopId, params) => {
    try {
      if (!shopId) {
        return { success: false, error: "shop_id is required" };
      }
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const snapshots = db2.prepare(
        `SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(shopId, limit, offset);
      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("snapshot:listing-history", (_event, listingId, params) => {
    try {
      if (!listingId) {
        return { success: false, error: "listing_id is required" };
      }
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const snapshots = db2.prepare(
        `SELECT * FROM listing_snapshots WHERE listing_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(listingId, limit, offset);
      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("snapshot:search-history", (_event, keywordId, params) => {
    try {
      if (!keywordId) {
        return { success: false, error: "keyword_id is required" };
      }
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const snapshots = db2.prepare(
        `SELECT * FROM search_snapshots WHERE keyword_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(keywordId, limit, offset);
      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerAlertHandlers(db2) {
  ipcMain.handle("alert:list", (_event, filters) => {
    try {
      const conditions = [];
      const params = [];
      if (filters?.type) {
        conditions.push("alert_type = ?");
        params.push(filters.type);
      }
      if (filters?.severity) {
        conditions.push("severity = ?");
        params.push(filters.severity);
      }
      if (filters?.shopId) {
        conditions.push("shop_id = ?");
        params.push(filters.shopId);
      }
      if (filters?.isRead !== void 0) {
        conditions.push("is_read = ?");
        params.push(filters.isRead ? 1 : 0);
      }
      let sql = "SELECT * FROM alerts";
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }
      sql += " ORDER BY created_at DESC";
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const alerts = db2.prepare(sql).all(...params);
      return { success: true, data: alerts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("alert:mark-read", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Alert id is required" };
      }
      db2.prepare("UPDATE alerts SET is_read = 1 WHERE id = ?").run(id);
      return { success: true, data: { message: "Alert marked as read" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("alert:mark-all-read", (_event) => {
    try {
      db2.prepare("UPDATE alerts SET is_read = 1 WHERE is_read = 0").run();
      return { success: true, data: { message: "All alerts marked as read" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("alert:count-unread", (_event) => {
    try {
      const row = db2.prepare("SELECT COUNT(*) as count FROM alerts WHERE is_read = 0").get();
      return { success: true, data: { count: row.count } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
const TRENDING_SELECT = `
  SELECT
    la.id,
    la.etsy_listing_id,
    la.sold_24h,
    la.views_24h,
    la.hey_score,
    la.trending_score,
    la.trend_status,
    la.days_old,
    la.total_sold,
    la.conversion_rate,
    la.tags,
    la.categories,
    la.qualified,
    la.qualified_by,
    la.fetched_at,
    COALESCE(ls.title, ss_title, 'Listing #' || la.etsy_listing_id) AS title,
    COALESCE(ls.image_url, ss_image) AS image_url,
    COALESCE(ls.price, ss_price, 0) AS price,
    COALESCE(ss_shop, s.shop_name, la.shop_country) AS shop_name
  FROM listing_analytics la
  LEFT JOIN listings l ON l.etsy_listing_id = la.etsy_listing_id
  LEFT JOIN listing_snapshots ls ON ls.listing_id = l.id
    AND ls.crawled_at = (SELECT MAX(ls2.crawled_at) FROM listing_snapshots ls2 WHERE ls2.listing_id = l.id)
  LEFT JOIN shops s ON s.id = l.shop_id
  LEFT JOIN (
    SELECT etsy_listing_id,
           title AS ss_title,
           image_url AS ss_image,
           price AS ss_price,
           shop_name AS ss_shop
    FROM search_snapshots
    WHERE id IN (SELECT MAX(id) FROM search_snapshots GROUP BY etsy_listing_id)
  ) ss_latest ON ss_latest.etsy_listing_id = la.etsy_listing_id
`;
function registerAnalyticsHandlers(db2) {
  ipcMain.handle("analytics:fetch", async (_event, listingIds) => {
    try {
      if (!listingIds || listingIds.length === 0) {
        return { success: false, error: "No listing IDs provided" };
      }
      const { getBulkListings, filterNewIds, getVkingConfig } = await import("./chunks/vkingService-BfHd_5h-.js");
      const { processBatch } = await import("./chunks/trendService-Di79ZpaX.js");
      const config = getVkingConfig(db2);
      if (!config.apiKey) {
        return { success: false, error: "VK1ng API key not configured. Set it in Settings." };
      }
      const newIds = filterNewIds(db2, listingIds, 24);
      if (newIds.length === 0) {
        return { success: true, data: { message: "All listings already have recent analytics", fetched: 0 } };
      }
      const analyticsData = await getBulkListings(db2, newIds);
      if (analyticsData.length > 0) {
        processBatch(db2, analyticsData, 0);
      }
      return { success: true, data: { message: `Fetched analytics for ${analyticsData.length} listings`, fetched: analyticsData.length } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("analytics:trending", (_event, params) => {
    try {
      const pageSize = params?.pageSize ?? 20;
      const page = params?.page ?? 1;
      const offset = (page - 1) * pageSize;
      const conditions = ["la.trend_status IN ('HOT', 'WATCH')"];
      const queryParams = [];
      if (params?.status && params.status !== "ALL") {
        conditions[0] = "la.trend_status = ?";
        queryParams.push(params.status);
      }
      const productKeywords = {
        shirt: ["shirt", "tshirt", "t-shirt", "tee"],
        hoodie: ["hoodie"],
        sweater: ["sweater"],
        sweatshirt: ["sweatshirt"],
        tumbler: ["tumbler"],
        mug: ["mug", "cup"],
        poster: ["poster", "print", "wall art", "canvas"]
      };
      if (params?.productType && params.productType !== "all" && productKeywords[params.productType]) {
        const kws = productKeywords[params.productType];
        const likeConditions = kws.map(() => "(LOWER(COALESCE(ss_title, '')) LIKE '%' || ? || '%' OR LOWER(COALESCE(la.tags, '')) LIKE '%' || ? || '%')");
        conditions.push(`(${likeConditions.join(" OR ")})`);
        for (const kw of kws) {
          queryParams.push(kw, kw);
        }
      }
      const where = "WHERE " + conditions.join(" AND ");
      const sortMap = {
        latest: "la.fetched_at DESC",
        score: "la.trending_score DESC",
        sold_24h: "la.sold_24h DESC",
        views_24h: "la.views_24h DESC",
        hey_score: "la.hey_score DESC"
      };
      const orderBy = sortMap[params?.sortBy ?? "latest"] ?? sortMap.latest;
      const countSql = `SELECT COUNT(DISTINCT la.id) as count FROM listing_analytics la ${where}`;
      const total = db2.prepare(countSql).get(...queryParams).count;
      const sql = `${TRENDING_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      const listings = db2.prepare(sql).all(...queryParams, pageSize, offset);
      return {
        success: true,
        data: { listings, total, page, pageSize }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("analytics:dashboard", (_event) => {
    try {
      const totalShops = db2.prepare("SELECT COUNT(*) as c FROM shops WHERE status != 'archived'").get().c;
      const activeKeywords = db2.prepare("SELECT COUNT(*) as c FROM search_keywords WHERE status = 'active'").get().c;
      const hotListings = db2.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status = 'HOT'").get().c;
      const unreadAlerts = db2.prepare("SELECT COUNT(*) as c FROM alerts WHERE is_read = 0").get().c;
      const trendingRows = db2.prepare(
        `${TRENDING_SELECT} WHERE la.trend_status IN ('HOT', 'WATCH') ORDER BY la.trending_score DESC LIMIT 5`
      ).all();
      const topTrending = trendingRows.map((r) => ({
        id: r.id,
        etsyListingId: r.etsy_listing_id,
        title: r.title || `Listing #${r.etsy_listing_id}`,
        imageUrl: r.image_url,
        price: r.price,
        trendStatus: r.trend_status,
        sold24h: r.sold_24h,
        views24h: r.views_24h,
        heyScore: r.hey_score,
        shopName: r.shop_name || void 0
      }));
      const recentAlerts = db2.prepare(
        "SELECT id, alert_type as type, severity, old_value, new_value, is_read, created_at FROM alerts ORDER BY created_at DESC LIMIT 10"
      ).all();
      const mappedAlerts = recentAlerts.map((a) => ({
        ...a,
        is_read: a.is_read === 1
      }));
      let crawlStatusData = { status: "idle", jobsInQueue: 0, currentJob: void 0 };
      try {
        const { getScheduler: getScheduler2 } = require2("../services/schedulerService.js");
        const scheduler = getScheduler2();
        if (scheduler) {
          const s = scheduler.getStatus();
          crawlStatusData = {
            status: s.currentTarget ? "running" : s.isBlackout ? "blackout" : s.isPaused ? "paused" : s.isRunning ? "running" : "idle",
            jobsInQueue: s.queueLength,
            currentJob: s.currentTarget ?? void 0
          };
        }
      } catch {
      }
      return {
        success: true,
        data: {
          stats: { totalShops, activeKeywords, hotListings, unreadAlerts },
          topTrending,
          recentAlerts: mappedAlerts,
          crawlStatus: crawlStatusData
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("analytics:api-status", async (_event) => {
    try {
      const { checkSubscription } = await import("./chunks/vkingService-BfHd_5h-.js");
      const status = await checkSubscription(db2);
      return { success: true, data: status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("analytics:qualification", (_event, etsyListingId) => {
    try {
      if (!etsyListingId) {
        return { success: false, error: "etsy_listing_id is required" };
      }
      const row = db2.prepare(
        "SELECT sold_24h, views_24h, hey_score, days_old FROM listing_analytics WHERE etsy_listing_id = ? ORDER BY fetched_at DESC LIMIT 1"
      ).get(etsyListingId);
      if (!row) {
        return { success: true, data: { qualified: false, reasons: ["No analytics data"], rules: {} } };
      }
      const { isQualified } = require2("../services/trendService.js");
      const result = isQualified(row);
      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("analytics:history", (_event, listingId, params) => {
    try {
      if (!listingId) {
        return { success: false, error: "listing_id is required" };
      }
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const analytics = db2.prepare(
        "SELECT * FROM listing_analytics WHERE listing_id = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?"
      ).all(listingId, limit, offset);
      return { success: true, data: analytics };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerHtmlCacheHandlers(db2) {
  ipcMain.handle("html-cache:list", (_event, params) => {
    try {
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const records = db2.prepare(
        `SELECT * FROM html_cache ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(limit, offset);
      return { success: true, data: records };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("html-cache:get", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Cache id is required" };
      }
      const record = db2.prepare("SELECT * FROM html_cache WHERE id = ?").get(id);
      if (!record) {
        return { success: false, error: "Cache record not found" };
      }
      return { success: true, data: record };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("html-cache:reparse", (_event, _id) => {
    try {
      return { success: true, data: { message: "Reparse not yet implemented" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("html-cache:reparse-all", (_event) => {
    try {
      return { success: true, data: { message: "Reparse all not yet implemented" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("html-cache:cleanup", (_event) => {
    try {
      return { success: true, data: { message: "Cleanup not yet implemented" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("html-cache:stats", (_event) => {
    try {
      const row = db2.prepare(
        `SELECT
           COUNT(*) as totalFiles,
           COALESCE(SUM(file_size_bytes), 0) as totalSizeBytes,
           MIN(crawled_at) as oldestFile,
           MAX(crawled_at) as newestFile
         FROM html_cache`
      ).get();
      return {
        success: true,
        data: {
          totalFiles: row.totalFiles,
          totalSizeBytes: row.totalSizeBytes,
          oldestFile: row.oldestFile,
          newestFile: row.newestFile
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerExpansionHandlers(db2) {
  ipcMain.handle("expansion:tree", (_event, parentKeywordId) => {
    try {
      if (!parentKeywordId) {
        return { success: false, error: "parent_keyword_id is required" };
      }
      const keywords = db2.prepare(
        `WITH RECURSIVE tree AS (
           SELECT * FROM search_keywords WHERE id = ?
           UNION ALL
           SELECT sk.* FROM search_keywords sk
           JOIN tree t ON sk.parent_keyword_id = t.id
         )
         SELECT * FROM tree ORDER BY depth ASC, created_at ASC`
      ).all(parentKeywordId);
      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("expansion:queue", (_event) => {
    try {
      const keywords = db2.prepare(
        `SELECT * FROM search_keywords
         WHERE status = 'active' AND expansion_source != 'user_input'
         ORDER BY created_at DESC`
      ).all();
      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("expansion:approve", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      db2.prepare(`UPDATE search_keywords SET status = 'active' WHERE id = ?`).run(id);
      return { success: true, data: { message: "Keyword approved" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("expansion:reject", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      db2.prepare(`UPDATE search_keywords SET status = 'archived' WHERE id = ?`).run(id);
      return { success: true, data: { message: "Keyword rejected" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("expansion:saturate", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Keyword id is required" };
      }
      db2.prepare(`UPDATE search_keywords SET is_saturated = 1 WHERE id = ?`).run(id);
      return { success: true, data: { message: "Keyword marked as saturated" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  deepseek: "deepseek-reasoner"
};
const API_URLS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions"
};
function getAIConfig(db2) {
  const rows = db2.prepare(
    `SELECT key, value FROM settings WHERE key IN ('ai_provider', 'ai_api_key', 'ai_model')`
  ).all();
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  const provider = map["ai_provider"] || "deepseek";
  const apiKey = map["ai_api_key"] || "";
  const model = map["ai_model"] || DEFAULT_MODELS[provider] || "deepseek-chat";
  if (!apiKey) {
    throw new Error("AI API key is not configured. Go to Settings to add your API key.");
  }
  return { provider, apiKey, model };
}
async function callAPI(prompt, systemPrompt, provider, apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12e4);
  try {
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: 2e3,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid API key");
        }
        if (response.status === 429) {
          clearTimeout(timeout);
          await new Promise((resolve) => setTimeout(resolve, 5e3));
          return callAPI(prompt, systemPrompt, provider, apiKey, model);
        }
        const body = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${body}`);
      }
      const data = await response.json();
      return data.content[0].text;
    } else {
      const apiUrl = API_URLS[provider] || API_URLS.openai;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: 2e3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid API key");
        }
        if (response.status === 429) {
          clearTimeout(timeout);
          await new Promise((resolve) => setTimeout(resolve, 5e3));
          return callAPI(prompt, systemPrompt, provider, apiKey, model);
        }
        const body = await response.text();
        throw new Error(`${provider} API error ${response.status}: ${body}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    }
  } finally {
    clearTimeout(timeout);
  }
}
async function analyzeShop(db2, shopId) {
  const config = getAIConfig(db2);
  const shop = db2.prepare("SELECT * FROM shops WHERE id = ?").get(shopId);
  if (!shop) {
    throw new Error(`Shop not found: ${shopId}`);
  }
  const snapshots = db2.prepare(
    "SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT 5"
  ).all(shopId);
  const listings = db2.prepare(`
    SELECT l.id, l.etsy_listing_id, ls.title, ls.price, ls.is_bestseller,
           la.sold_24h, la.views_24h, la.hey_score, la.trending_score, la.trend_status
    FROM listings l
    LEFT JOIN (
      SELECT listing_id, title, price, is_bestseller,
             ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY crawled_at DESC) as rn
      FROM listing_snapshots
    ) ls ON ls.listing_id = l.id AND ls.rn = 1
    LEFT JOIN (
      SELECT listing_id, sold_24h, views_24h, hey_score, trending_score, trend_status,
             ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY fetched_at DESC) as rn
      FROM listing_analytics
    ) la ON la.listing_id = l.id AND la.rn = 1
    WHERE l.shop_id = ? AND l.status = 'active'
    ORDER BY la.trending_score DESC NULLS LAST
    LIMIT 20
  `).all(shopId);
  const alerts = db2.prepare(
    `SELECT * FROM alerts WHERE shop_id = ? AND created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 20`
  ).all(shopId);
  const latestSnapshot = snapshots[0] || {};
  const hotListings = listings.filter((l) => l.trend_status === "HOT" || l.trend_status === "WATCH");
  const prompt = `
Shop overview:
- Name: ${shop.shop_name}
- URL: ${shop.shop_url}
- Total sales: ${latestSnapshot.total_sales ?? "N/A"}
- Total listings: ${latestSnapshot.total_listings ?? "N/A"}
- Total reviews: ${latestSnapshot.total_reviews ?? "N/A"}

Top performing listings (HOT/WATCH):
${hotListings.length > 0 ? hotListings.map(
    (l, i) => `${i + 1}. [${l.trend_status}] "${l.title}" - $${l.price} | sold_24h: ${l.sold_24h} | views_24h: ${l.views_24h} | hey_score: ${l.hey_score}`
  ).join("\n") : "No HOT/WATCH listings found yet."}

Recent alerts (last 7 days):
${alerts.length > 0 ? alerts.map((a) => `- [${a.severity}] ${a.alert_type}: old=${a.old_value}, new=${a.new_value}`).join("\n") : "No recent alerts."}

Analyze this shop and provide:
1. Market position assessment
2. Top opportunities identified
3. Specific recommendations for a POD seller competing in this niche
4. Trending patterns observed
`;
  const systemPrompt = "You are an expert Etsy POD market analyst. Analyze the shop data and provide actionable insights for a print-on-demand seller. Be specific and data-driven. Format with sections: Overview, Top Performers, Opportunities, Recommendations.";
  logger.info(`Analyzing shop ${shopId} (${shop.shop_name}) with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);
  const dataContext = JSON.stringify({
    shopId,
    snapshotIds: snapshots.map((s) => s.id),
    listingIds: listings.map((l) => l.id),
    alertIds: alerts.map((a) => a.id)
  });
  const result = db2.prepare(`
    INSERT INTO ai_insights (insight_type, shop_id, content, data_context, model_used)
    VALUES (?, ?, ?, ?, ?)
  `).run("shop_summary", shopId, content, dataContext, config.model);
  const insight = db2.prepare("SELECT * FROM ai_insights WHERE id = ?").get(result.lastInsertRowid);
  logger.info(`Saved AI insight ${insight.id} for shop ${shopId}`);
  return insight;
}
async function analyzeKeyword(db2, keywordId) {
  const config = getAIConfig(db2);
  const keyword = db2.prepare("SELECT * FROM search_keywords WHERE id = ?").get(keywordId);
  if (!keyword) {
    throw new Error(`Keyword not found: ${keywordId}`);
  }
  const searchSnapshots = db2.prepare(`
    SELECT ss.*, la.sold_24h, la.views_24h, la.hey_score, la.trend_status, la.trending_score
    FROM search_snapshots ss
    LEFT JOIN listing_analytics la ON la.etsy_listing_id = ss.etsy_listing_id
      AND la.fetched_at = (
        SELECT MAX(fetched_at) FROM listing_analytics WHERE etsy_listing_id = ss.etsy_listing_id
      )
    WHERE ss.keyword_id = ?
      AND ss.crawled_at = (SELECT MAX(crawled_at) FROM search_snapshots WHERE keyword_id = ?)
    ORDER BY ss.position_in_search ASC
    LIMIT 50
  `).all(keywordId, keywordId);
  const hotWatch = searchSnapshots.filter((s) => s.trend_status === "HOT" || s.trend_status === "WATCH");
  const prices = searchSnapshots.filter((s) => s.price != null).map((s) => s.price);
  const avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : "N/A";
  const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : "N/A";
  const maxPrice = prices.length > 0 ? Math.max(...prices).toFixed(2) : "N/A";
  const prompt = `
Keyword: "${keyword.keyword}"
Category: ${keyword.category || "N/A"}
Total results found: ${searchSnapshots.length}

Price range: $${minPrice} - $${maxPrice} (avg: $${avgPrice})

Top listings in search results:
${searchSnapshots.slice(0, 15).map(
    (s, i) => `${i + 1}. [pos:${s.position_in_search}] "${s.title}" by ${s.shop_name} - $${s.price}${s.trend_status && s.trend_status !== "SKIP" ? ` [${s.trend_status}]` : ""} | sold_24h: ${s.sold_24h ?? "N/A"} | hey_score: ${s.hey_score ?? "N/A"}`
  ).join("\n")}

HOT/WATCH listings count: ${hotWatch.length}

Analyze this keyword/niche and provide:
1. Competition level assessment
2. Top sellers dominating this keyword
3. Price strategy recommendations
4. Trend direction (growing, stable, declining)
5. Opportunities for a new POD seller
`;
  const systemPrompt = "You are an expert Etsy keyword and niche analyst for Print on Demand. Analyze the search data and provide actionable insights. Focus on competition level, pricing strategy, and entry opportunities. Format with sections: Competition Analysis, Top Sellers, Pricing, Trend Direction, Opportunities.";
  logger.info(`Analyzing keyword ${keywordId} ("${keyword.keyword}") with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);
  const dataContext = JSON.stringify({
    keywordId,
    snapshotCount: searchSnapshots.length,
    hotWatchCount: hotWatch.length
  });
  const result = db2.prepare(`
    INSERT INTO ai_insights (insight_type, keyword_id, content, data_context, model_used)
    VALUES (?, ?, ?, ?, ?)
  `).run("keyword_suggestion", keywordId, content, dataContext, config.model);
  const insight = db2.prepare("SELECT * FROM ai_insights WHERE id = ?").get(result.lastInsertRowid);
  logger.info(`Saved AI insight ${insight.id} for keyword ${keywordId}`);
  return insight;
}
async function suggestKeywords(db2, seed, existingTags) {
  const config = getAIConfig(db2);
  const prompt = `Given the seed keyword '${seed}' for Etsy POD (Print on Demand), suggest 10 related keywords that are specific enough for niche targeting. These should be search terms a buyer would use on Etsy.

Existing tags to consider (avoid duplicates): ${existingTags.join(", ")}

Return ONLY a JSON array of strings, nothing else. Example: ["keyword one", "keyword two"]`;
  const systemPrompt = "You are an Etsy keyword research expert. Return only valid JSON arrays of keyword strings. No explanations.";
  logger.info(`Suggesting keywords for seed "${seed}" with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);
  let suggestions;
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }
    suggestions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(suggestions)) {
      throw new Error("Response is not an array");
    }
    suggestions = suggestions.filter((s) => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().toLowerCase());
  } catch (parseErr) {
    logger.error(`Failed to parse AI keyword suggestions: ${parseErr}`);
    throw new Error("Failed to parse AI response as keyword list");
  }
  const existingKeywords = db2.prepare(
    `SELECT keyword FROM search_keywords WHERE keyword IN (${suggestions.map(() => "?").join(",")})`
  ).all(...suggestions);
  const existingSet = new Set(existingKeywords.map((k) => k.keyword.toLowerCase()));
  const filtered = suggestions.filter((s) => !existingSet.has(s));
  logger.info(`AI suggested ${suggestions.length} keywords, ${filtered.length} are new`);
  return filtered;
}
async function generateMarketReport(db2) {
  const config = getAIConfig(db2);
  const listings = db2.prepare(`
    SELECT
      la.etsy_listing_id,
      la.sold_24h,
      la.views_24h,
      la.hey_score,
      la.days_old,
      la.trending_score,
      la.trend_status,
      la.total_sold,
      la.conversion_rate,
      la.tags,
      la.categories,
      la.fetched_at,
      COALESCE(ss.title, '') as title,
      COALESCE(ss.shop_name, '') as shop_name
    FROM listing_analytics la
    LEFT JOIN (
      SELECT etsy_listing_id, title, shop_name
      FROM search_snapshots
      WHERE id IN (SELECT MAX(id) FROM search_snapshots GROUP BY etsy_listing_id)
    ) ss ON ss.etsy_listing_id = la.etsy_listing_id
    WHERE la.trend_status IN ('HOT', 'WATCH')
    ORDER BY la.fetched_at DESC
    LIMIT 100
  `).all();
  if (listings.length === 0) {
    throw new Error("No HOT/WATCH listings found. Crawl some keywords first.");
  }
  const keywordStats = db2.prepare(`
    SELECT sk.keyword,
      COUNT(DISTINCT ss.etsy_listing_id) as total_listings,
      SUM(CASE WHEN la.trend_status = 'HOT' THEN 1 ELSE 0 END) as hot_count,
      SUM(CASE WHEN la.trend_status = 'WATCH' THEN 1 ELSE 0 END) as watch_count
    FROM search_keywords sk
    JOIN search_snapshots ss ON ss.keyword_id = sk.id
    JOIN listing_analytics la ON la.etsy_listing_id = ss.etsy_listing_id
    WHERE sk.status = 'active' AND la.trend_status IN ('HOT', 'WATCH')
    GROUP BY sk.keyword
    ORDER BY hot_count DESC
    LIMIT 20
  `).all();
  const hotListings = listings.filter((l) => l.trend_status === "HOT");
  const watchListings = listings.filter((l) => l.trend_status === "WATCH");
  const tagCounts = {};
  for (const l of hotListings) {
    if (!l.tags) continue;
    for (const tag of l.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => `${tag} (${count})`);
  const shopCounts = {};
  for (const l of listings) {
    if (!l.shop_name) continue;
    shopCounts[l.shop_name] = (shopCounts[l.shop_name] || 0) + 1;
  }
  const topShops = Object.entries(shopCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([shop, count]) => `${shop} (${count} listings)`);
  const prompt = `
## DATA: Last ${listings.length} trending Etsy POD listings

### Summary
- HOT listings: ${hotListings.length}
- WATCH listings: ${watchListings.length}
- Avg sold_24h (HOT): ${hotListings.length > 0 ? (hotListings.reduce((s, l) => s + l.sold_24h, 0) / hotListings.length).toFixed(1) : 0}
- Avg views_24h (HOT): ${hotListings.length > 0 ? (hotListings.reduce((s, l) => s + l.views_24h, 0) / hotListings.length).toFixed(0) : 0}
- Avg HEY score (HOT): ${hotListings.length > 0 ? (hotListings.reduce((s, l) => s + l.hey_score, 0) / hotListings.length).toFixed(1) : 0}

### Keywords performance
${keywordStats.map((k) => `- "${k.keyword}": ${k.hot_count} HOT, ${k.watch_count} WATCH (${k.total_listings} total)`).join("\n")}

### Top tags from HOT listings
${topTags.join(", ")}

### Top shops with trending products
${topShops.join("\n")}

### Top 10 HOT listings
${hotListings.slice(0, 10).map(
    (l, i) => `${i + 1}. "${l.title}" | sold:${l.sold_24h} | views:${l.views_24h} | score:${l.trending_score} | shop:${l.shop_name}`
  ).join("\n")}

## ANALYZE AND PROVIDE:

1. **HOT Niches** — Group HOT listings by theme/niche (e.g. "BTS merch", "book lover", "cat themed"). Rank by number of HOT listings and avg sold_24h.

2. **Hot Keywords** — Which keywords have the most HOT listings? List top 5 with stats.

3. **Top Sellers** — Which shops dominate? What are they selling?

Keep it short and data-driven. Use bullet points. No general advice.
`;
  const systemPrompt = `You are an Etsy POD market analyst. Analyze listing data, identify hot niches and keywords. Be concise, use bullet points. No general advice, only data-driven observations.`;
  logger.info(`Generating market report from ${listings.length} listings with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);
  const dataContext = JSON.stringify({
    totalListings: listings.length,
    hotCount: hotListings.length,
    watchCount: watchListings.length,
    keywordsAnalyzed: keywordStats.length,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const result = db2.prepare(`
    INSERT INTO ai_insights (insight_type, content, data_context, model_used)
    VALUES ('niche_discovery', ?, ?, ?)
  `).run(content, dataContext, config.model);
  const insight = db2.prepare("SELECT * FROM ai_insights WHERE id = ?").get(result.lastInsertRowid);
  logger.info(`Market report saved, insight id=${insight.id}`);
  return insight;
}
async function testConnection(provider, apiKey, model) {
  try {
    const response = await callAPI(
      'Say "OK" and nothing else.',
      'You are a test assistant. Respond with exactly "OK".',
      provider,
      apiKey,
      model
    );
    if (response && response.length > 0) {
      return { success: true };
    }
    return { success: false, error: "Empty response from API" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
function registerAIHandlers(db2) {
  ipcMain.handle("ai:analyze-shop", async (_event, shopId) => {
    try {
      if (!shopId) {
        return { success: false, error: "Shop id is required" };
      }
      const insight = await analyzeShop(db2, shopId);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("ai:analyze-keyword", async (_event, keywordId) => {
    try {
      if (!keywordId) {
        return { success: false, error: "Keyword id is required" };
      }
      const insight = await analyzeKeyword(db2, keywordId);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("ai:suggest-keywords", async (_event, context) => {
    try {
      if (!context?.seed) {
        return { success: false, error: "Seed keyword is required" };
      }
      const suggestions = await suggestKeywords(db2, context.seed, context.existingTags ?? []);
      return { success: true, data: suggestions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("ai:test-connection", async (_event, params) => {
    try {
      if (!params?.provider || !params?.apiKey || !params?.model) {
        return { success: false, error: "Provider, API key, and model are required" };
      }
      const result = await testConnection(params.provider, params.apiKey, params.model);
      if (result.success) {
        return { success: true, data: { message: "Connection successful" } };
      }
      return { success: false, error: result.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("ai:market-report", async (_event) => {
    try {
      const insight = await generateMarketReport(db2);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("ai:insights-list", (_event, filters) => {
    try {
      const conditions = [];
      const params = [];
      if (filters?.insight_type) {
        conditions.push("insight_type = ?");
        params.push(filters.insight_type);
      }
      if (filters?.shop_id) {
        conditions.push("shop_id = ?");
        params.push(filters.shop_id);
      }
      if (filters?.keyword_id) {
        conditions.push("keyword_id = ?");
        params.push(filters.keyword_id);
      }
      let sql = "SELECT * FROM ai_insights";
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }
      sql += " ORDER BY created_at DESC";
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const insights = db2.prepare(sql).all(...params);
      return { success: true, data: insights };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerProxyHandlers(db2) {
  ipcMain.handle("proxy:list", (_event) => {
    try {
      const proxies = db2.prepare("SELECT * FROM proxies").all();
      return { success: true, data: proxies };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("proxy:add", (_event, params) => {
    try {
      if (!params.host || !params.host.trim()) {
        return { success: false, error: "host is required" };
      }
      if (!params.port) {
        return { success: false, error: "port is required" };
      }
      const id = randomUUID();
      const protocol = params.protocol || "http";
      db2.prepare(
        `INSERT INTO proxies (id, protocol, host, port, username, password)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, protocol, params.host.trim(), params.port, params.username ?? null, params.password ?? null);
      const proxy = db2.prepare("SELECT * FROM proxies WHERE id = ?").get(id);
      return { success: true, data: proxy };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("proxy:remove", (_event, id) => {
    try {
      if (!id) {
        return { success: false, error: "Proxy id is required" };
      }
      db2.prepare("DELETE FROM proxies WHERE id = ?").run(id);
      return { success: true, data: { message: "Proxy removed" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("proxy:test", (_event, _id) => {
    try {
      return { success: true, data: { success: true, latencyMs: 0 } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerProfileHandlers(db2) {
  ipcMain.handle("profile:list", (_event) => {
    try {
      const profiles = db2.prepare(
        "SELECT * FROM browser_profiles ORDER BY created_at DESC"
      ).all();
      return { success: true, data: profiles };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("profile:status", (_event) => {
    try {
      const rows = db2.prepare(
        `SELECT status, COUNT(*) as count FROM browser_profiles GROUP BY status`
      ).all();
      const counts = { active: 0, burned: 0, retired: 0, total: 0 };
      for (const row of rows) {
        if (row.status === "active") counts.active = row.count;
        else if (row.status === "burned") counts.burned = row.count;
        else if (row.status === "retired") counts.retired = row.count;
        counts.total += row.count;
      }
      return { success: true, data: counts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerSettingsHandlers(db2) {
  ipcMain.handle("settings:get", (_event) => {
    try {
      const rows = db2.prepare("SELECT * FROM settings").all();
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return { success: true, data: settings };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  ipcMain.handle("settings:update", (_event, updates) => {
    try {
      if (!updates || typeof updates !== "object") {
        return { success: false, error: "Updates object is required" };
      }
      const entries = Object.entries(updates);
      if (entries.length === 0) {
        return { success: false, error: "No settings to update" };
      }
      const updateStmt = db2.prepare(
        `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`
      );
      const transaction = db2.transaction((items) => {
        for (const [key, value] of items) {
          updateStmt.run(value, key);
        }
      });
      transaction(entries);
      const rows = db2.prepare("SELECT * FROM settings").all();
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return { success: true, data: settings };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
function registerAllHandlers(db2) {
  const handlerGroups = [
    { name: "shop", register: registerShopHandlers },
    { name: "keyword", register: registerKeywordHandlers },
    { name: "crawl", register: registerCrawlHandlers },
    { name: "snapshot", register: registerSnapshotHandlers },
    { name: "alert", register: registerAlertHandlers },
    { name: "analytics", register: registerAnalyticsHandlers },
    { name: "htmlCache", register: registerHtmlCacheHandlers },
    { name: "expansion", register: registerExpansionHandlers },
    { name: "ai", register: registerAIHandlers },
    { name: "proxy", register: registerProxyHandlers },
    { name: "profile", register: registerProfileHandlers },
    { name: "settings", register: registerSettingsHandlers }
  ];
  for (const group of handlerGroups) {
    group.register(db2);
  }
  console.log(`[IPC] Registered ${handlerGroups.length} handler groups`);
}
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Supover App",
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#030712",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    logger.info("Main window shown");
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  initFileLogger();
  logger.info("App ready, initializing...");
  const db2 = initDatabase();
  logger.info("Database initialized");
  registerAllHandlers(db2);
  const scheduler = createScheduler(db2);
  scheduler.start();
  logger.info("Scheduler started");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  try {
    const scheduler = getScheduler();
    if (scheduler) scheduler.stop();
  } catch {
  }
  logger.info("App quitting");
});
export {
  logger as l
};
