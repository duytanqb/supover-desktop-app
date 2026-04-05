import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, Alert, AlertFilters } from '../../shared/types/index.js';

export function registerAlertHandlers(db: Database.Database): void {
  ipcMain.handle('alert:list', (_event, filters?: AlertFilters): IPCResponse<Alert[]> => {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters?.type) {
        conditions.push('alert_type = ?');
        params.push(filters.type);
      }
      if (filters?.severity) {
        conditions.push('severity = ?');
        params.push(filters.severity);
      }
      if (filters?.shopId) {
        conditions.push('shop_id = ?');
        params.push(filters.shopId);
      }
      if (filters?.isRead !== undefined) {
        conditions.push('is_read = ?');
        params.push(filters.isRead ? 1 : 0);
      }

      let sql = 'SELECT * FROM alerts';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';

      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const alerts = db.prepare(sql).all(...params) as Alert[];
      return { success: true, data: alerts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('alert:mark-read', (_event, id: number): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Alert id is required' };
      }

      db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(id);
      return { success: true, data: { message: 'Alert marked as read' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('alert:mark-all-read', (_event): IPCResponse<{ message: string }> => {
    try {
      db.prepare('UPDATE alerts SET is_read = 1 WHERE is_read = 0').run();
      return { success: true, data: { message: 'All alerts marked as read' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('alert:count-unread', (_event): IPCResponse<{ count: number }> => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE is_read = 0').get() as { count: number };
      return { success: true, data: { count: row.count } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
