import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, ListingAnalytics, QualificationResult, VkingSubscriptionStatus } from '../../shared/types/index.js';

interface DashboardData {
  hotCount: number;
  watchCount: number;
  topTrending: ListingAnalytics[];
  recentVelocitySpikes: ListingAnalytics[];
}

export function registerAnalyticsHandlers(db: Database.Database): void {
  ipcMain.handle('analytics:fetch', (_event, _listingIds: string[]): IPCResponse<{ message: string }> => {
    try {
      // Placeholder — will call vkingService when implemented
      return { success: true, data: { message: 'Analytics fetch not yet implemented' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('analytics:trending', (_event, params?: { limit?: number }): IPCResponse<ListingAnalytics[]> => {
    try {
      const limit = params?.limit ?? 50;

      const analytics = db.prepare(
        `SELECT * FROM listing_analytics
         WHERE trend_status IN ('HOT', 'WATCH')
         ORDER BY trending_score DESC
         LIMIT ?`
      ).all(limit) as ListingAnalytics[];

      return { success: true, data: analytics };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('analytics:dashboard', (_event): IPCResponse<DashboardData> => {
    try {
      const hotCount = (db.prepare(
        `SELECT COUNT(*) as count FROM listing_analytics WHERE trend_status = 'HOT'`
      ).get() as { count: number }).count;

      const watchCount = (db.prepare(
        `SELECT COUNT(*) as count FROM listing_analytics WHERE trend_status = 'WATCH'`
      ).get() as { count: number }).count;

      const topTrending = db.prepare(
        `SELECT * FROM listing_analytics
         WHERE trend_status IN ('HOT', 'WATCH')
         ORDER BY trending_score DESC
         LIMIT 5`
      ).all() as ListingAnalytics[];

      const recentVelocitySpikes = db.prepare(
        `SELECT * FROM listing_analytics
         WHERE sold_24h > 0 AND trend_status IN ('HOT', 'WATCH')
         ORDER BY sold_24h DESC
         LIMIT 5`
      ).all() as ListingAnalytics[];

      return {
        success: true,
        data: {
          hotCount,
          watchCount,
          topTrending,
          recentVelocitySpikes,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('analytics:api-status', (_event): IPCResponse<VkingSubscriptionStatus> => {
    try {
      // Placeholder
      return { success: true, data: { connected: false } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('analytics:qualification', (_event, _listingId: string): IPCResponse<QualificationResult> => {
    try {
      // Placeholder — will call trendService when implemented
      return {
        success: true,
        data: {
          qualified: false,
          reasons: ['Qualification not yet implemented'],
          rules: {},
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('analytics:history', (_event, listingId: number, params?: { limit?: number; offset?: number }): IPCResponse<ListingAnalytics[]> => {
    try {
      if (!listingId) {
        return { success: false, error: 'listing_id is required' };
      }

      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const analytics = db.prepare(
        `SELECT * FROM listing_analytics WHERE listing_id = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?`
      ).all(listingId, limit, offset) as ListingAnalytics[];

      return { success: true, data: analytics };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
