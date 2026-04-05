import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, CrawlJob } from '../../shared/types/index.js';

interface CrawlStatus {
  isRunning: boolean;
  isPaused: boolean;
  queueLength: number;
  currentJob: CrawlJob | null;
}

export function registerCrawlHandlers(db: Database.Database): void {
  ipcMain.handle('crawl:status', (_event): IPCResponse<CrawlStatus> => {
    try {
      return {
        success: true,
        data: {
          isRunning: false,
          isPaused: false,
          queueLength: 0,
          currentJob: null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:pause', (_event): IPCResponse<{ message: string }> => {
    try {
      return { success: true, data: { message: 'Crawl paused' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:resume', (_event): IPCResponse<{ message: string }> => {
    try {
      return { success: true, data: { message: 'Crawl resumed' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:history', (_event, params?: { limit?: number; offset?: number }): IPCResponse<CrawlJob[]> => {
    try {
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;

      const jobs = db.prepare(
        `SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).all(limit, offset) as CrawlJob[];

      return { success: true, data: jobs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
