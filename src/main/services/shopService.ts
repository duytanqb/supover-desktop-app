import type Database from 'better-sqlite3';

export interface ShopWithSnapshots {
  id: number;
  shop_name: string;
  shop_url: string;
  priority: string;
  crawl_interval_minutes: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  snapshots: any[];
}

export interface ShopStats {
  totalListings: number;
  hotCount: number;
  watchCount: number;
  lastCrawled: string | null;
}

export function getShopWithSnapshots(
  db: Database.Database,
  shopId: number,
  limit: number = 10
): ShopWithSnapshots | null {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as any;
  if (!shop) {
    return null;
  }

  const snapshots = db.prepare(
    'SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT ?'
  ).all(shopId, limit) as any[];

  return {
    ...shop,
    snapshots,
  };
}

export function getShopListings(db: Database.Database, shopId: number): any[] {
  const listings = db.prepare(`
    SELECT l.*,
           ls.title, ls.price, ls.sale_price, ls.currency, ls.image_url,
           ls.rating, ls.review_count, ls.is_bestseller, ls.is_ad,
           ls.is_free_shipping, ls.shipping_info, ls.position_in_shop,
           ls.tags_visible, ls.crawled_at as snapshot_crawled_at
    FROM listings l
    LEFT JOIN listing_snapshots ls ON ls.id = (
      SELECT id FROM listing_snapshots
      WHERE listing_id = l.id
      ORDER BY crawled_at DESC
      LIMIT 1
    )
    WHERE l.shop_id = ? AND l.status = 'active'
    ORDER BY ls.position_in_shop ASC NULLS LAST
  `).all(shopId) as any[];

  return listings;
}

export function getShopAnalytics(db: Database.Database, shopId: number): any[] {
  const analytics = db.prepare(`
    SELECT la.*, l.etsy_listing_id as listing_etsy_id
    FROM listing_analytics la
    JOIN listings l ON l.id = la.listing_id
    WHERE l.shop_id = ?
      AND la.trend_status IN ('HOT', 'WATCH')
      AND la.fetched_at = (
        SELECT MAX(fetched_at) FROM listing_analytics WHERE listing_id = la.listing_id
      )
    ORDER BY la.trending_score DESC
  `).all(shopId) as any[];

  return analytics;
}

export function getRecentDiffs(
  db: Database.Database,
  shopId: number,
  days: number = 7
): any[] {
  const alerts = db.prepare(
    `SELECT * FROM alerts
     WHERE shop_id = ?
       AND created_at > datetime('now', '-' || ? || ' days')
     ORDER BY created_at DESC`
  ).all(shopId, days) as any[];

  return alerts;
}

export function getShopStats(db: Database.Database, shopId: number): ShopStats {
  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM listings WHERE shop_id = ? AND status = 'active'`
  ).get(shopId) as { count: number };

  const hotRow = db.prepare(`
    SELECT COUNT(DISTINCT la.listing_id) as count
    FROM listing_analytics la
    JOIN listings l ON l.id = la.listing_id
    WHERE l.shop_id = ?
      AND la.trend_status = 'HOT'
      AND la.fetched_at = (
        SELECT MAX(fetched_at) FROM listing_analytics WHERE listing_id = la.listing_id
      )
  `).get(shopId) as { count: number };

  const watchRow = db.prepare(`
    SELECT COUNT(DISTINCT la.listing_id) as count
    FROM listing_analytics la
    JOIN listings l ON l.id = la.listing_id
    WHERE l.shop_id = ?
      AND la.trend_status = 'WATCH'
      AND la.fetched_at = (
        SELECT MAX(fetched_at) FROM listing_analytics WHERE listing_id = la.listing_id
      )
  `).get(shopId) as { count: number };

  const lastCrawlRow = db.prepare(
    `SELECT MAX(crawled_at) as last_crawled FROM shop_snapshots WHERE shop_id = ?`
  ).get(shopId) as { last_crawled: string | null };

  return {
    totalListings: totalRow.count,
    hotCount: hotRow.count,
    watchCount: watchRow.count,
    lastCrawled: lastCrawlRow.last_crawled,
  };
}
