/**
 * Shop Discovery Service — auto-discover winning shops from keyword crawl results.
 *
 * Rule: If a shop has >= MIN_HOT_LISTINGS HOT/WATCH listings across all crawled keywords,
 * auto-add it to the shops list for full shop page crawling.
 *
 * This creates a feedback loop:
 *   keyword crawl → find winning shops → crawl shop page → find more products → tag expansion → new keywords
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

const MIN_HOT_LISTINGS = 3;   // Shop needs >= 3 HOT/WATCH listings to be auto-added
const MAX_AUTO_SHOPS = 10;    // Max auto-discovered shops to prevent bloat

interface ShopCandidate {
  shop_name: string;
  hot_count: number;
  watch_count: number;
  total_qualified: number;
  sample_listings: string; // comma-separated etsy_listing_ids
}

/**
 * Discover shops that have multiple HOT/WATCH listings across keyword crawls.
 * Only considers shops not already in the shops table.
 * Returns list of newly added shops.
 */
export function discoverWinningShops(db: Database.Database): { added: string[]; candidates: ShopCandidate[] } {
  // Count existing auto-discovered shops
  const autoCount = (db.prepare(
    "SELECT COUNT(*) as c FROM shops WHERE notes LIKE '%auto_discovery%' AND status != 'archived'"
  ).get() as { c: number }).c;

  if (autoCount >= MAX_AUTO_SHOPS) {
    logger.info('Shop discovery: max auto shops reached', { autoCount, max: MAX_AUTO_SHOPS });
    return { added: [], candidates: [] };
  }

  const remaining = MAX_AUTO_SHOPS - autoCount;

  // Find shops with >= MIN_HOT_LISTINGS qualified listings
  // Join search_snapshots (has shop_name) with listing_analytics (has trend_status)
  const candidates = db.prepare(`
    SELECT
      ss.shop_name,
      SUM(CASE WHEN la.trend_status = 'HOT' THEN 1 ELSE 0 END) as hot_count,
      SUM(CASE WHEN la.trend_status = 'WATCH' THEN 1 ELSE 0 END) as watch_count,
      COUNT(*) as total_qualified,
      GROUP_CONCAT(DISTINCT ss.etsy_listing_id) as sample_listings
    FROM search_snapshots ss
    JOIN listing_analytics la ON la.etsy_listing_id = ss.etsy_listing_id
    WHERE ss.shop_name IS NOT NULL
      AND ss.shop_name != ''
      AND la.trend_status IN ('HOT', 'WATCH')
      AND ss.shop_name NOT IN (SELECT shop_name FROM shops WHERE status != 'archived')
    GROUP BY ss.shop_name
    HAVING total_qualified >= ?
    ORDER BY hot_count DESC, total_qualified DESC
    LIMIT ?
  `).all(MIN_HOT_LISTINGS, remaining) as ShopCandidate[];

  if (candidates.length === 0) {
    logger.info('Shop discovery: no new candidates found');
    return { added: [], candidates: [] };
  }

  // Insert discovered shops
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO shops (shop_name, shop_url, priority, notes, status) VALUES (?, ?, ?, ?, 'active')"
  );

  const added: string[] = [];

  const runInsert = db.transaction(() => {
    for (const candidate of candidates) {
      const shopUrl = `https://www.etsy.com/shop/${candidate.shop_name}`;
      const notes = `auto_discovery | ${candidate.hot_count} HOT, ${candidate.watch_count} WATCH listings`;
      const priority = candidate.hot_count >= 5 ? 'high' : candidate.hot_count >= 3 ? 'normal' : 'low';

      const result = insertStmt.run(candidate.shop_name, shopUrl, priority, notes);
      if (result.changes > 0) {
        added.push(candidate.shop_name);
      }
    }
  });

  runInsert();

  if (added.length > 0) {
    logger.info('Shop discovery: new shops added', {
      added: added.length,
      shops: added,
    });

    // Create alerts for discovered shops
    const alertStmt = db.prepare(
      "INSERT INTO alerts (alert_type, severity, old_value, new_value) VALUES ('shop_auto_discovered', 'info', ?, ?)"
    );
    for (const name of added) {
      const candidate = candidates.find(c => c.shop_name === name);
      alertStmt.run(name, `${candidate?.hot_count ?? 0} HOT, ${candidate?.watch_count ?? 0} WATCH`);
    }
  }

  return { added, candidates };
}
