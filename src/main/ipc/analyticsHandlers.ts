import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, ListingAnalytics, QualificationResult } from '../../shared/types/index.js';

interface TrendingItem {
  id: number;
  etsy_listing_id: string;
  title: string | null;
  image_url: string | null;
  shop_name: string | null;
  price: number | null;
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  trending_score: number;
  trend_status: string;
  days_old: number;
  total_sold: number;
  conversion_rate: number;
  tags: string;
  categories: string;
  qualified: number;
  qualified_by: string;
  fetched_at: string;
}

interface TrendingResponse {
  listings: TrendingItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DashboardData {
  stats: {
    totalShops: number;
    activeKeywords: number;
    hotListings: number;
    unreadAlerts: number;
  };
  topTrending: Array<{
    id: number;
    etsyListingId: string;
    title: string;
    imageUrl?: string | null;
    price?: number | null;
    trendStatus?: string;
    sold24h?: number;
    views24h?: number;
    heyScore?: number;
    shopName?: string;
  }>;
  recentAlerts: Array<{
    id: number;
    type: string;
    severity: string;
    old_value?: string;
    new_value?: string;
    is_read: boolean;
    created_at: string;
  }>;
  crawlStatus: {
    status: string;
    jobsInQueue: number;
    currentJob?: string;
  };
}

// Shared SQL for trending queries — joins analytics with listing snapshots for title/price/image
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

export function registerAnalyticsHandlers(db: Database.Database): void {
  // Fetch analytics for listing IDs via VK1ng
  ipcMain.handle('analytics:fetch', async (_event, listingIds: string[]): Promise<IPCResponse<{ message: string; fetched: number }>> => {
    try {
      if (!listingIds || listingIds.length === 0) {
        return { success: false, error: 'No listing IDs provided' };
      }

      const { getBulkListings, filterNewIds, getVkingConfig } = await import('../services/vkingService.js');
      const { processBatch } = await import('../services/trendService.js');

      const config = getVkingConfig(db);
      if (!config.apiKey) {
        return { success: false, error: 'VK1ng API key not configured. Set it in Settings.' };
      }

      // Filter IDs we already have fresh analytics for
      const newIds = filterNewIds(db, listingIds, 24);
      if (newIds.length === 0) {
        return { success: true, data: { message: 'All listings already have recent analytics', fetched: 0 } };
      }

      const analyticsData = await getBulkListings(db, newIds);
      if (analyticsData.length > 0) {
        processBatch(db, analyticsData, 0);
      }

      return { success: true, data: { message: `Fetched analytics for ${analyticsData.length} listings`, fetched: analyticsData.length } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Trending listings with full data
  ipcMain.handle('analytics:trending', (_event, params?: { status?: string; sortBy?: string; page?: number; pageSize?: number }): IPCResponse<TrendingResponse> => {
    try {
      const pageSize = params?.pageSize ?? 20;
      const page = params?.page ?? 1;
      const offset = (page - 1) * pageSize;

      let where = "WHERE la.trend_status IN ('HOT', 'WATCH')";
      const queryParams: unknown[] = [];

      if (params?.status && params.status !== 'ALL') {
        where = 'WHERE la.trend_status = ?';
        queryParams.push(params.status);
      }

      // Sort order
      const sortMap: Record<string, string> = {
        latest: 'la.fetched_at DESC',
        score: 'la.trending_score DESC',
        sold_24h: 'la.sold_24h DESC',
        views_24h: 'la.views_24h DESC',
        hey_score: 'la.hey_score DESC',
      };
      const orderBy = sortMap[params?.sortBy ?? 'latest'] ?? sortMap.latest;

      // Count total
      const countSql = `SELECT COUNT(DISTINCT la.id) as count FROM listing_analytics la ${where}`;
      const total = (db.prepare(countSql).get(...queryParams) as { count: number }).count;

      // Fetch page
      const sql = `${TRENDING_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      const listings = db.prepare(sql).all(...queryParams, pageSize, offset) as TrendingItem[];

      return {
        success: true,
        data: { listings, total, page, pageSize },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Dashboard aggregates
  ipcMain.handle('analytics:dashboard', (_event): IPCResponse<DashboardData> => {
    try {
      // Stats
      const totalShops = (db.prepare("SELECT COUNT(*) as c FROM shops WHERE status != 'archived'").get() as { c: number }).c;
      const activeKeywords = (db.prepare("SELECT COUNT(*) as c FROM search_keywords WHERE status = 'active'").get() as { c: number }).c;
      const hotListings = (db.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status = 'HOT'").get() as { c: number }).c;
      const unreadAlerts = (db.prepare("SELECT COUNT(*) as c FROM alerts WHERE is_read = 0").get() as { c: number }).c;

      // Top trending (mapped to ListingData shape)
      const trendingRows = db.prepare(
        `${TRENDING_SELECT} WHERE la.trend_status IN ('HOT', 'WATCH') ORDER BY la.trending_score DESC LIMIT 5`
      ).all() as TrendingItem[];

      const topTrending = trendingRows.map(r => ({
        id: r.id,
        etsyListingId: r.etsy_listing_id,
        title: r.title || `Listing #${r.etsy_listing_id}`,
        imageUrl: r.image_url,
        price: r.price,
        trendStatus: r.trend_status,
        sold24h: r.sold_24h,
        views24h: r.views_24h,
        heyScore: r.hey_score,
        shopName: r.shop_name || undefined,
      }));

      // Recent alerts
      const recentAlerts = db.prepare(
        "SELECT id, alert_type as type, severity, old_value, new_value, is_read, created_at FROM alerts ORDER BY created_at DESC LIMIT 10"
      ).all() as Array<{ id: number; type: string; severity: string; old_value: string; new_value: string; is_read: number; created_at: string }>;

      const mappedAlerts = recentAlerts.map(a => ({
        ...a,
        is_read: a.is_read === 1,
      }));

      // Crawl status from scheduler
      let crawlStatusData = { status: 'idle', jobsInQueue: 0, currentJob: undefined as string | undefined };
      try {
        const { getScheduler } = require('../services/schedulerService.js');
        const scheduler = getScheduler();
        if (scheduler) {
          const s = scheduler.getStatus();
          crawlStatusData = {
            status: s.currentTarget ? 'running' : s.isBlackout ? 'blackout' : s.isPaused ? 'paused' : s.isRunning ? 'running' : 'idle',
            jobsInQueue: s.queueLength,
            currentJob: s.currentTarget ?? undefined,
          };
        }
      } catch { /* ignore */ }

      return {
        success: true,
        data: {
          stats: { totalShops, activeKeywords, hotListings, unreadAlerts },
          topTrending,
          recentAlerts: mappedAlerts,
          crawlStatus: crawlStatusData,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Check VK1ng API status
  ipcMain.handle('analytics:api-status', async (_event): Promise<IPCResponse<{ valid: boolean; plan?: string; remaining?: number }>> => {
    try {
      const { checkSubscription } = await import('../services/vkingService.js');
      const status = await checkSubscription(db);
      return { success: true, data: status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Qualification check for a single listing
  ipcMain.handle('analytics:qualification', (_event, etsyListingId: string): IPCResponse<QualificationResult> => {
    try {
      if (!etsyListingId) {
        return { success: false, error: 'etsy_listing_id is required' };
      }

      const row = db.prepare(
        'SELECT sold_24h, views_24h, hey_score, days_old FROM listing_analytics WHERE etsy_listing_id = ? ORDER BY fetched_at DESC LIMIT 1'
      ).get(etsyListingId) as { sold_24h: number; views_24h: number; hey_score: number; days_old: number } | undefined;

      if (!row) {
        return { success: true, data: { qualified: false, reasons: ['No analytics data'], rules: {} } };
      }

      const { isQualified } = require('../services/trendService.js');
      const result = isQualified(row);
      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Analytics history for a listing
  ipcMain.handle('analytics:history', (_event, listingId: number, params?: { limit?: number; offset?: number }): IPCResponse<ListingAnalytics[]> => {
    try {
      if (!listingId) {
        return { success: false, error: 'listing_id is required' };
      }

      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const analytics = db.prepare(
        'SELECT * FROM listing_analytics WHERE listing_id = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?'
      ).all(listingId, limit, offset) as ListingAnalytics[];

      return { success: true, data: analytics };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
