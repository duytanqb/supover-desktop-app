import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, ShopSnapshot, SearchSnapshot } from '../../shared/types/index.js';
import type { ListingSnapshot } from '../../shared/types/listing.js';

export function registerSnapshotHandlers(db: Database.Database): void {
  ipcMain.handle('snapshot:shop-history', (_event, shopId: number, params?: { limit?: number; offset?: number }): IPCResponse<ShopSnapshot[]> => {
    try {
      if (!shopId) {
        return { success: false, error: 'shop_id is required' };
      }

      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const snapshots = db.prepare(
        `SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(shopId, limit, offset) as ShopSnapshot[];

      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('snapshot:listing-history', (_event, listingId: number, params?: { limit?: number; offset?: number }): IPCResponse<ListingSnapshot[]> => {
    try {
      if (!listingId) {
        return { success: false, error: 'listing_id is required' };
      }

      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const snapshots = db.prepare(
        `SELECT * FROM listing_snapshots WHERE listing_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(listingId, limit, offset) as ListingSnapshot[];

      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('snapshot:search-history', (_event, keywordId: number, params?: { limit?: number; offset?: number }): IPCResponse<SearchSnapshot[]> => {
    try {
      if (!keywordId) {
        return { success: false, error: 'keyword_id is required' };
      }

      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const snapshots = db.prepare(
        `SELECT * FROM search_snapshots WHERE keyword_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(keywordId, limit, offset) as SearchSnapshot[];

      return { success: true, data: snapshots };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
