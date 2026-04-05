import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, Shop, ShopWithLatest } from '../../shared/types/index.js';

export function registerShopHandlers(db: Database.Database): void {
  ipcMain.handle('shop:list', (_event): IPCResponse<Shop[]> => {
    try {
      const shops = db.prepare(
        `SELECT * FROM shops WHERE status != 'archived' ORDER BY priority DESC, shop_name`
      ).all() as Shop[];
      return { success: true, data: shops };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('shop:get', (_event, id: number): IPCResponse<ShopWithLatest> => {
    try {
      if (!id) {
        return { success: false, error: 'Shop id is required' };
      }

      const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id) as Shop | undefined;
      if (!shop) {
        return { success: false, error: 'Shop not found' };
      }

      const latestSnapshot = db.prepare(
        `SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT 1`
      ).get(id) as any | undefined;

      const countRow = db.prepare(
        `SELECT COUNT(*) as count FROM listings WHERE shop_id = ? AND status = 'active'`
      ).get(id) as { count: number };

      const result: ShopWithLatest = {
        ...shop,
        latest_snapshot: latestSnapshot ?? null,
        listing_count: countRow.count,
      };

      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('shop:add', (_event, params: { shop_name: string; shop_url?: string; priority?: string; crawl_interval_minutes?: number; notes?: string }): IPCResponse<Shop> => {
    try {
      if (!params.shop_name || !params.shop_name.trim()) {
        return { success: false, error: 'shop_name is required' };
      }

      const shopName = params.shop_name.trim();
      const shopUrl = params.shop_url?.trim() || `https://www.etsy.com/shop/${shopName}`;
      const priority = params.priority || 'normal';
      const crawlInterval = params.crawl_interval_minutes ?? 360;
      const notes = params.notes ?? null;

      const result = db.prepare(
        `INSERT INTO shops (shop_name, shop_url, priority, crawl_interval_minutes, notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(shopName, shopUrl, priority, crawlInterval, notes);

      const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(result.lastInsertRowid) as Shop;
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('shop:update', (_event, id: number, updates: Partial<Pick<Shop, 'shop_name' | 'shop_url' | 'priority' | 'crawl_interval_minutes' | 'notes' | 'status'>>): IPCResponse<Shop> => {
    try {
      if (!id) {
        return { success: false, error: 'Shop id is required' };
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.shop_name !== undefined) { fields.push('shop_name = ?'); values.push(updates.shop_name); }
      if (updates.shop_url !== undefined) { fields.push('shop_url = ?'); values.push(updates.shop_url); }
      if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
      if (updates.crawl_interval_minutes !== undefined) { fields.push('crawl_interval_minutes = ?'); values.push(updates.crawl_interval_minutes); }
      if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

      if (fields.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      fields.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`UPDATE shops SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id) as Shop;
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('shop:delete', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Shop id is required' };
      }

      db.prepare(`UPDATE shops SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(id);
      return { success: true, data: { message: 'Shop archived' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('shop:crawl-now', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Shop id is required' };
      }
      return { success: true, data: { message: 'Crawl queued' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
