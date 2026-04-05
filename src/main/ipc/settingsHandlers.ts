import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, AppSettings } from '../../shared/types/index.js';

export function registerSettingsHandlers(db: Database.Database): void {
  ipcMain.handle('settings:get', (_event): IPCResponse<AppSettings> => {
    try {
      const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string; updated_at: string }[];

      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }

      return { success: true, data: settings as AppSettings };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('settings:update', (_event, updates: Record<string, string>): IPCResponse<AppSettings> => {
    try {
      if (!updates || typeof updates !== 'object') {
        return { success: false, error: 'Updates object is required' };
      }

      const entries = Object.entries(updates);
      if (entries.length === 0) {
        return { success: false, error: 'No settings to update' };
      }

      const updateStmt = db.prepare(
        `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`
      );

      const transaction = db.transaction((items: [string, string][]) => {
        for (const [key, value] of items) {
          updateStmt.run(value, key);
        }
      });

      transaction(entries);

      // Return full settings after update
      const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string; updated_at: string }[];
      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }

      return { success: true, data: settings as AppSettings };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
