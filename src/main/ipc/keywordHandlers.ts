import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, SearchKeyword } from '../../shared/types/index.js';

export function registerKeywordHandlers(db: Database.Database): void {
  ipcMain.handle('keyword:list', (_event, filters?: { status?: string }): IPCResponse<SearchKeyword[]> => {
    try {
      let sql = 'SELECT * FROM search_keywords';
      const params: unknown[] = [];

      if (filters?.status) {
        sql += ' WHERE status = ?';
        params.push(filters.status);
      }

      sql += ' ORDER BY created_at DESC';

      const keywords = db.prepare(sql).all(...params) as SearchKeyword[];
      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('keyword:add', (_event, params: { keyword: string; category?: string; crawl_interval_minutes?: number; max_pages?: number; notes?: string; parent_keyword_id?: number; expansion_source?: string; source_listing_id?: string; depth?: number }): IPCResponse<SearchKeyword> => {
    try {
      if (!params.keyword || !params.keyword.trim()) {
        return { success: false, error: 'keyword is required' };
      }

      const keyword = params.keyword.trim();

      // Check uniqueness
      const existing = db.prepare('SELECT id FROM search_keywords WHERE keyword = ?').get(keyword);
      if (existing) {
        return { success: false, error: 'Keyword already exists' };
      }

      const result = db.prepare(
        `INSERT INTO search_keywords (keyword, category, crawl_interval_minutes, max_pages, notes, parent_keyword_id, expansion_source, source_listing_id, depth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        keyword,
        params.category ?? null,
        params.crawl_interval_minutes ?? 720,
        params.max_pages ?? 3,
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

  ipcMain.handle('keyword:crawl-now', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }
      return { success: true, data: { message: 'Crawl queued' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
