import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, Shop, ShopWithLatest } from '../../shared/types/index.js';

export function registerShopHandlers(db: Database.Database): void {
  // List shops with computed fields
  ipcMain.handle('shop:list', (_event): IPCResponse<any[]> => {
    try {
      const shops = db.prepare(`
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

  // Get single shop with latest snapshot
  ipcMain.handle('shop:get', (_event, id: number): IPCResponse<ShopWithLatest> => {
    try {
      if (!id) return { success: false, error: 'Shop id is required' };

      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id) as Shop | undefined;
      if (!shop) return { success: false, error: 'Shop not found' };

      const latestSnapshot = db.prepare(
        'SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT 1'
      ).get(id) as any | undefined;

      const countRow = db.prepare(
        "SELECT COUNT(*) as count FROM listings WHERE shop_id = ? AND status = 'active'"
      ).get(id) as { count: number };

      return {
        success: true,
        data: { ...shop, latest_snapshot: latestSnapshot ?? null, listing_count: countRow.count },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Add shop — accepts URL or shop name, extracts shop_name from URL
  ipcMain.handle('shop:add', (_event, params: { url?: string; shop_name?: string; priority?: string; notes?: string }): IPCResponse<Shop> => {
    try {
      if (!params) return { success: false, error: 'params is required' };

      let shopName = '';
      let shopUrl = '';

      if (params.url && params.url.trim()) {
        const url = params.url.trim();
        // Extract shop name from URL: https://www.etsy.com/shop/ShopName → ShopName
        const match = url.match(/etsy\.com\/shop\/([^/?#]+)/i);
        if (match) {
          shopName = match[1];
          shopUrl = `https://www.etsy.com/shop/${shopName}`;
        } else {
          // Treat as shop name if not a URL
          shopName = url.replace(/^https?:\/\/.*\/shop\//i, '').replace(/[/?#].*/g, '');
          shopUrl = `https://www.etsy.com/shop/${shopName}`;
        }
      } else if (params.shop_name && params.shop_name.trim()) {
        shopName = params.shop_name.trim();
        shopUrl = `https://www.etsy.com/shop/${shopName}`;
      }

      if (!shopName) return { success: false, error: 'Shop URL or name is required' };

      // Check unique
      const existing = db.prepare('SELECT id FROM shops WHERE shop_name = ?').get(shopName);
      if (existing) return { success: false, error: `Shop "${shopName}" already exists` };

      const result = db.prepare(
        'INSERT INTO shops (shop_name, shop_url, priority, notes) VALUES (?, ?, ?, ?)'
      ).run(shopName, shopUrl, params.priority || 'normal', params.notes ?? null);

      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(result.lastInsertRowid) as Shop;
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Update shop — accepts single object { id, ...fields }
  ipcMain.handle('shop:update', (_event, params: { id: number; shop_name?: string; shop_url?: string; priority?: string; notes?: string; status?: string }): IPCResponse<Shop> => {
    try {
      const id = params?.id;
      if (!id) return { success: false, error: 'Shop id is required' };

      const fields: string[] = [];
      const values: unknown[] = [];

      if (params.shop_name !== undefined) { fields.push('shop_name = ?'); values.push(params.shop_name); }
      if (params.shop_url !== undefined) { fields.push('shop_url = ?'); values.push(params.shop_url); }
      if (params.priority !== undefined) { fields.push('priority = ?'); values.push(params.priority); }
      if (params.notes !== undefined) { fields.push('notes = ?'); values.push(params.notes); }
      if (params.status !== undefined) { fields.push('status = ?'); values.push(params.status); }

      if (fields.length === 0) return { success: false, error: 'No fields to update' };

      fields.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`UPDATE shops SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id) as Shop;
      return { success: true, data: shop };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Delete (archive) shop
  ipcMain.handle('shop:delete', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) return { success: false, error: 'Shop id is required' };
      db.prepare("UPDATE shops SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(id);
      return { success: true, data: { message: 'Shop archived' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Crawl now — accepts id directly or { shopId }
  ipcMain.handle('shop:crawl-now', async (_event, params: number | { shopId: number }): Promise<IPCResponse<{ message: string; listingIds?: string[] }>> => {
    try {
      const id = typeof params === 'number' ? params : params?.shopId;
      if (!id) return { success: false, error: 'Shop id is required' };

      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
      if (!shop) return { success: false, error: 'Shop not found' };

      const { crawlShop } = await import('../services/crawlService.js');
      const result = await crawlShop(db, id);

      return {
        success: true,
        data: { message: `Crawl completed: ${result.listingIds.length} listings found`, listingIds: result.listingIds },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
