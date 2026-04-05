import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, BrowserProfile } from '../../shared/types/index.js';

interface ProfileStatusCounts {
  active: number;
  burned: number;
  retired: number;
  total: number;
}

export function registerProfileHandlers(db: Database.Database): void {
  ipcMain.handle('profile:list', (_event): IPCResponse<BrowserProfile[]> => {
    try {
      const profiles = db.prepare(
        'SELECT * FROM browser_profiles ORDER BY created_at DESC'
      ).all() as BrowserProfile[];

      return { success: true, data: profiles };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('profile:status', (_event): IPCResponse<ProfileStatusCounts> => {
    try {
      const rows = db.prepare(
        `SELECT status, COUNT(*) as count FROM browser_profiles GROUP BY status`
      ).all() as { status: string; count: number }[];

      const counts: ProfileStatusCounts = { active: 0, burned: 0, retired: 0, total: 0 };
      for (const row of rows) {
        if (row.status === 'active') counts.active = row.count;
        else if (row.status === 'burned') counts.burned = row.count;
        else if (row.status === 'retired') counts.retired = row.count;
        counts.total += row.count;
      }

      return { success: true, data: counts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
