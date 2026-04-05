import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, SearchKeyword } from '../../shared/types/index.js';

export function registerExpansionHandlers(db: Database.Database): void {
  ipcMain.handle('expansion:tree', (_event, parentKeywordId: number): IPCResponse<SearchKeyword[]> => {
    try {
      if (!parentKeywordId) {
        return { success: false, error: 'parent_keyword_id is required' };
      }

      // Recursive CTE to get the full expansion tree
      const keywords = db.prepare(
        `WITH RECURSIVE tree AS (
           SELECT * FROM search_keywords WHERE id = ?
           UNION ALL
           SELECT sk.* FROM search_keywords sk
           JOIN tree t ON sk.parent_keyword_id = t.id
         )
         SELECT * FROM tree ORDER BY depth ASC, created_at ASC`
      ).all(parentKeywordId) as SearchKeyword[];

      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('expansion:queue', (_event): IPCResponse<SearchKeyword[]> => {
    try {
      const keywords = db.prepare(
        `SELECT * FROM search_keywords
         WHERE status = 'active' AND expansion_source != 'user_input'
         ORDER BY created_at DESC`
      ).all() as SearchKeyword[];

      return { success: true, data: keywords };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('expansion:approve', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      db.prepare(`UPDATE search_keywords SET status = 'active' WHERE id = ?`).run(id);
      return { success: true, data: { message: 'Keyword approved' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('expansion:reject', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      db.prepare(`UPDATE search_keywords SET status = 'archived' WHERE id = ?`).run(id);
      return { success: true, data: { message: 'Keyword rejected' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('expansion:saturate', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Keyword id is required' };
      }

      db.prepare(`UPDATE search_keywords SET is_saturated = 1 WHERE id = ?`).run(id);
      return { success: true, data: { message: 'Keyword marked as saturated' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
