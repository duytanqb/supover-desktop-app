import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { VkingListingData } from './vkingService.js';

/**
 * Trend Service — qualification rules + trending score + classification
 *
 * Reference: reference/etsy-spy/scripts/qualification_helper.py
 * Reference: reference/etsy-spy/TRENDING_RULES.md
 */

export type TrendStatus = 'HOT' | 'WATCH' | 'SKIP';

export interface QualificationResult {
  qualified: boolean;
  reasons: string[];
  rules: Record<string, boolean>;
}

export interface QualificationMetrics {
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  days_old: number;
}

// ---------------------------------------------------------------------------
// 5 qualification rules (from qualification_helper.py)
// ---------------------------------------------------------------------------

export function isQualified(metrics: QualificationMetrics): QualificationResult {
  const rules: Record<string, boolean> = {
    rule_1_sold_ge_2: metrics.sold_24h >= 2,
    rule_2_views_ge_120: metrics.views_24h >= 120,
    rule_3_views_80_hey_8: metrics.views_24h >= 80 && metrics.hey_score >= 8,
    rule_4_new_hey_views: metrics.days_old <= 30 && metrics.hey_score >= 10 && metrics.views_24h >= 40,
    rule_5_sold_3_age_90: metrics.sold_24h >= 3 && metrics.days_old <= 90,
  };

  const qualified = Object.values(rules).some(v => v);
  const reasons = Object.entries(rules)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return { qualified, reasons, rules };
}

// ---------------------------------------------------------------------------
// Classify trend status
// ---------------------------------------------------------------------------

export function classifyTrend(data: VkingListingData): TrendStatus {
  const sold = data.sold ?? 0;
  const days = data.original_creation_days ?? 999;

  // HOT: sold >= 3 AND days <= 60
  if (sold >= 3 && days <= 60) return 'HOT';

  // WATCH: passes any qualification rule
  const qualification = isQualified({
    sold_24h: sold,
    views_24h: data.views_24h ?? 0,
    hey_score: data.hey ?? 0,
    days_old: days,
  });
  if (qualification.qualified) return 'WATCH';

  // SKIP: otherwise
  return 'SKIP';
}

// ---------------------------------------------------------------------------
// Trending score = (sold_24h * 10) + (views_24h / 10) + (cr * 2)
// ---------------------------------------------------------------------------

export function calculateScore(data: VkingListingData): number {
  const sold = data.sold ?? 0;
  const views = data.views_24h ?? 0;
  const cr = data.cr ?? 0;

  return Math.round(((sold * 10) + (views / 10) + (cr * 2)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Process batch: classify + calculate + save to listing_analytics
// ---------------------------------------------------------------------------

export function processBatch(db: Database.Database, listings: VkingListingData[], crawlJobId: number): void {
  if (listings.length === 0) return;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO listing_analytics (
      listing_id, etsy_listing_id,
      sold_24h, views_24h, hey_score, days_old,
      total_sold, estimated_revenue, conversion_rate,
      num_favorers, daily_views, total_views,
      trending_score, trend_status, qualified, qualified_by,
      tags, categories, shop_country, shop_sold,
      fetched_at, crawl_job_id
    ) VALUES (
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      datetime('now'), ?
    )
  `);

  // Try to resolve listing_id from listings table; use 0 if not found
  const findListingStmt = db.prepare(
    'SELECT id FROM listings WHERE etsy_listing_id = ? LIMIT 1',
  );

  const runBatch = db.transaction(() => {
    for (const data of listings) {
      try {
        const etsyId = String(data.listing_id);
        const trendStatus = classifyTrend(data);
        const trendingScore = calculateScore(data);
        const qualification = isQualified({
          sold_24h: data.sold ?? 0,
          views_24h: data.views_24h ?? 0,
          hey_score: data.hey ?? 0,
          days_old: data.original_creation_days ?? 999,
        });

        const listingRow = findListingStmt.get(etsyId) as { id: number } | undefined;
        const listingId = listingRow?.id ?? null;

        insertStmt.run(
          listingId,
          etsyId,
          data.sold ?? 0,
          data.views_24h ?? 0,
          data.hey ?? 0,
          data.original_creation_days ?? 0,
          data.total_sold ?? 0,
          data.estimated_revenue ?? '',
          data.cr ?? 0,
          data.num_favorers ?? 0,
          data.daily_views ?? 0,
          data.views ?? 0,
          trendingScore,
          trendStatus,
          qualification.qualified ? 1 : 0,
          JSON.stringify(qualification.reasons),
          data.tags ?? '',
          data.categories ?? '',
          data.shop_country ?? '',
          data.shop_sold ?? 0,
          crawlJobId,
        );
      } catch (error) {
        logger.error('Failed to process listing analytics', {
          listingId: data.listing_id,
          error: (error as Error).message,
        });
      }
    }
  });

  runBatch();

  logger.info('Trend processBatch completed', {
    count: listings.length,
    crawlJobId,
  });
}
