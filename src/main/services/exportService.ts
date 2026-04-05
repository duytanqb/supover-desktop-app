import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Export Service — CSV export for trending, shop history, keyword results
 */

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function escapeCSVField(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  // Escape if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function arrayToCSV(headers: string[], rows: unknown[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(h => escapeCSVField(h)).join(','));
  for (const row of rows) {
    lines.push(row.map(cell => escapeCSVField(cell)).join(','));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export trending listings
// ---------------------------------------------------------------------------

export interface TrendingExportFilters {
  trendStatus?: string;
  minScore?: number;
}

export function exportTrending(db: Database.Database, filters?: TrendingExportFilters): string {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.trendStatus) {
    conditions.push('la.trend_status = ?');
    params.push(filters.trendStatus);
  }

  if (filters?.minScore != null) {
    conditions.push('la.trending_score >= ?');
    params.push(filters.minScore);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      la.etsy_listing_id as listing_id,
      la.tags,
      COALESCE(s.shop_name, la.shop_country) as shop,
      la.sold_24h,
      la.views_24h,
      la.hey_score,
      la.conversion_rate as cr,
      la.trending_score as score,
      la.trend_status as status,
      la.total_sold,
      la.estimated_revenue as revenue,
      la.num_favorers as favorers,
      la.days_old,
      la.fetched_at
    FROM listing_analytics la
    LEFT JOIN listings l ON la.listing_id = l.id
    LEFT JOIN shops s ON l.shop_id = s.id
    ${whereClause}
    ORDER BY la.trending_score DESC
  `).all(...params) as Array<Record<string, unknown>>;

  const headers = [
    'listing_id', 'title', 'shop', 'sold_24h', 'views_24h',
    'hey_score', 'cr', 'score', 'status', 'total_sold',
    'revenue', 'favorers', 'days_old', 'fetched_at',
  ];

  const dataRows = rows.map(r => [
    r.listing_id, r.tags, r.shop, r.sold_24h, r.views_24h,
    r.hey_score, r.cr, r.score, r.status, r.total_sold,
    r.revenue, r.favorers, r.days_old, r.fetched_at,
  ]);

  logger.info('Exported trending listings', { count: rows.length, filters });
  return arrayToCSV(headers, dataRows);
}

// ---------------------------------------------------------------------------
// Export shop history
// ---------------------------------------------------------------------------

export function exportShopHistory(db: Database.Database, shopId: number): string {
  const rows = db.prepare(`
    SELECT
      ls.crawled_at as date,
      l.etsy_listing_id as listing_id,
      ls.title,
      ls.price,
      ls.review_count as reviews,
      ls.position_in_shop as position,
      ls.is_bestseller as bestseller
    FROM listing_snapshots ls
    JOIN listings l ON ls.listing_id = l.id
    WHERE ls.shop_id = ?
    ORDER BY ls.crawled_at DESC, ls.position_in_shop ASC
  `).all(shopId) as Array<Record<string, unknown>>;

  const headers = ['date', 'listing_id', 'title', 'price', 'reviews', 'position', 'bestseller'];
  const dataRows = rows.map(r => [
    r.date, r.listing_id, r.title, r.price, r.reviews, r.position, r.bestseller,
  ]);

  logger.info('Exported shop history', { shopId, count: rows.length });
  return arrayToCSV(headers, dataRows);
}

// ---------------------------------------------------------------------------
// Export keyword results
// ---------------------------------------------------------------------------

export function exportKeywordResults(db: Database.Database, keywordId: number): string {
  const rows = db.prepare(`
    SELECT
      ss.crawled_at as date,
      ss.etsy_listing_id as listing_id,
      ss.shop_name as shop,
      ss.title,
      ss.price,
      ss.position_in_search as position,
      ss.page_number as page
    FROM search_snapshots ss
    WHERE ss.keyword_id = ?
    ORDER BY ss.crawled_at DESC, ss.page_number ASC, ss.position_in_search ASC
  `).all(keywordId) as Array<Record<string, unknown>>;

  const headers = ['date', 'listing_id', 'shop', 'title', 'price', 'position', 'page'];
  const dataRows = rows.map(r => [
    r.date, r.listing_id, r.shop, r.title, r.price, r.position, r.page,
  ]);

  logger.info('Exported keyword results', { keywordId, count: rows.length });
  return arrayToCSV(headers, dataRows);
}
