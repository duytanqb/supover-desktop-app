import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, CrawlJob } from '../../shared/types/index.js';
import { getScheduler } from '../services/schedulerService.js';

interface CrawlStatus {
  isRunning: boolean;
  isPaused: boolean;
  queueLength: number;
  currentTarget: string | null;
  consecutiveBlocks: number;
  nextCheckIn: number;
}

export function registerCrawlHandlers(db: Database.Database): void {
  ipcMain.handle('crawl:status', (_event): IPCResponse<CrawlStatus> => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) {
        return { success: true, data: { isRunning: false, isPaused: false, queueLength: 0, currentTarget: null, consecutiveBlocks: 0, nextCheckIn: 0 } };
      }

      const status = scheduler.getStatus();
      return {
        success: true,
        data: {
          isRunning: status.isRunning,
          isPaused: status.isPaused,
          queueLength: status.queueLength,
          currentTarget: status.currentTarget,
          consecutiveBlocks: status.consecutiveBlocks,
          nextCheckIn: status.nextCheckIn,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:pause', (_event, minutes?: number): IPCResponse<{ message: string }> => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: 'Scheduler not initialized' };

      scheduler.pause(minutes ?? 30);
      return { success: true, data: { message: `Scheduler paused for ${minutes ?? 30} minutes` } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:resume', (_event): IPCResponse<{ message: string }> => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: 'Scheduler not initialized' };

      scheduler.resume();
      return { success: true, data: { message: 'Scheduler resumed' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:start', (_event): IPCResponse<{ message: string }> => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: 'Scheduler not initialized' };

      scheduler.start();
      return { success: true, data: { message: 'Scheduler started' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('crawl:stop', (_event): IPCResponse<{ message: string }> => {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return { success: false, error: 'Scheduler not initialized' };

      scheduler.stop();
      return { success: true, data: { message: 'Scheduler stopped' } };
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
        'SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(limit, offset) as CrawlJob[];

      return { success: true, data: jobs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
