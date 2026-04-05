import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, HtmlCacheRecord, CacheStats } from '../../shared/types/index.js';

export function registerHtmlCacheHandlers(db: Database.Database): void {
  ipcMain.handle('html-cache:list', (_event, params?: { limit?: number; offset?: number }): IPCResponse<HtmlCacheRecord[]> => {
    try {
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const records = db.prepare(
        `SELECT * FROM html_cache ORDER BY crawled_at DESC LIMIT ? OFFSET ?`
      ).all(limit, offset) as HtmlCacheRecord[];

      return { success: true, data: records };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('html-cache:get', (_event, id: number): IPCResponse<HtmlCacheRecord> => {
    try {
      if (!id) {
        return { success: false, error: 'Cache id is required' };
      }

      const record = db.prepare('SELECT * FROM html_cache WHERE id = ?').get(id) as HtmlCacheRecord | undefined;
      if (!record) {
        return { success: false, error: 'Cache record not found' };
      }

      return { success: true, data: record };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('html-cache:reparse', (_event, _id: number): IPCResponse<{ message: string }> => {
    try {
      // Placeholder — will call parserService when implemented
      return { success: true, data: { message: 'Reparse not yet implemented' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('html-cache:reparse-all', (_event): IPCResponse<{ message: string }> => {
    try {
      // Placeholder — will call parserService when implemented
      return { success: true, data: { message: 'Reparse all not yet implemented' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('html-cache:cleanup', (_event): IPCResponse<{ message: string }> => {
    try {
      // Placeholder — will call htmlCacheService when implemented
      return { success: true, data: { message: 'Cleanup not yet implemented' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('html-cache:stats', (_event): IPCResponse<CacheStats> => {
    try {
      const row = db.prepare(
        `SELECT
           COUNT(*) as totalFiles,
           COALESCE(SUM(file_size_bytes), 0) as totalSizeBytes,
           MIN(crawled_at) as oldestFile,
           MAX(crawled_at) as newestFile
         FROM html_cache`
      ).get() as { totalFiles: number; totalSizeBytes: number; oldestFile: string | null; newestFile: string | null };

      return {
        success: true,
        data: {
          totalFiles: row.totalFiles,
          totalSizeBytes: row.totalSizeBytes,
          oldestFile: row.oldestFile,
          newestFile: row.newestFile,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
