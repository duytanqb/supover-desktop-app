import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, SearchKeyword } from '../../shared/types/index.js';

export function registerKeywordHandlers(db: Database.Database): void {
  ipcMain.handle('keyword:list', (_event, filters?: { status?: string }): IPCResponse<any[]> => {
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
      const params: unknown[] = [];

      if (filters?.status) {
        sql += ' WHERE sk.status = ?';
        params.push(filters.status);
      } else {
        sql += " WHERE sk.status != 'archived'";
      }

      sql += ' ORDER BY sk.created_at DESC';

      const keywords = db.prepare(sql).all(...params);
      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('keyword:add', (_event, params: { keyword: string; category?: string; crawl_interval_minutes?: number; max_pages?: number; auto_expand?: boolean; notes?: string; parent_keyword_id?: number; expansion_source?: string; source_listing_id?: string; depth?: number }): IPCResponse<SearchKeyword> => {
    try {
      if (!params || !params.keyword || !params.keyword.trim()) {
        return { success: false, error: 'keyword is required' };
      }

      const keyword = params.keyword.trim().toLowerCase();

      // Check uniqueness
      const existing = db.prepare('SELECT id FROM search_keywords WHERE keyword = ?').get(keyword);
      if (existing) {
        return { success: false, error: 'Keyword already exists' };
      }

      const result = db.prepare(
        `INSERT INTO search_keywords (keyword, category, crawl_interval_minutes, max_pages, auto_expand, notes, parent_keyword_id, expansion_source, source_listing_id, depth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        keyword,
        params.category ?? null,
        params.crawl_interval_minutes ?? 720,
        params.max_pages ?? 3,
        params.auto_expand !== undefined ? (params.auto_expand ? 1 : 0) : 1,
        params.notes ?? null,
        params.parent_keyword_id ?? null,
        params.expansion_source ?? 'user_input',
        params.source_listing_id ?? null,
        params.depth ?? 0
      );

      const created = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(result.lastInsertRowid) as SearchKeyword;
      return { success: true, data: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('keyword:update', (_event, id: number, updates: Partial<Pick<SearchKeyword, 'keyword' | 'category' | 'crawl_interval_minutes' | 'max_pages' | 'notes' | 'status' | 'auto_expand'>>): IPCResponse<SearchKeyword> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.keyword !== undefined) { fields.push('keyword = ?'); values.push(updates.keyword); }
      if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
      if (updates.crawl_interval_minutes !== undefined) { fields.push('crawl_interval_minutes = ?'); values.push(updates.crawl_interval_minutes); }
      if (updates.max_pages !== undefined) { fields.push('max_pages = ?'); values.push(updates.max_pages); }
      if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
      if (updates.auto_expand !== undefined) { fields.push('auto_expand = ?'); values.push(updates.auto_expand); }

      if (fields.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);
      db.prepare(`UPDATE search_keywords SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const keyword = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(id) as SearchKeyword;
      return { success: true, data: keyword };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('keyword:delete', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      db.prepare(`UPDATE search_keywords SET status = 'archived' WHERE id = ?`).run(id);
      return { success: true, data: { message: 'Keyword archived' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('keyword:crawl-now', async (_event, id: number): Promise<IPCResponse<{ message: string; listingIds?: string[]; pagesProcessed?: number }>> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      const keyword = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(id) as SearchKeyword | undefined;
      if (!keyword) {
        return { success: false, error: 'Keyword not found' };
      }

      // Import crawl service dynamically to avoid circular deps
      const { crawlSearch } = await import('../services/crawlService.js');
      const result = await crawlSearch(db, id);

      return {
        success: true,
        data: {
          message: `Crawl completed: ${result.listingIds.length} listings found across ${result.pagesProcessed} pages`,
          listingIds: result.listingIds,
          pagesProcessed: result.pagesProcessed,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
