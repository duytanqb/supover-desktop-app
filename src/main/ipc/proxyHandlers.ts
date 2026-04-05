import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, Proxy } from '../../shared/types/index.js';
import { randomUUID } from 'node:crypto';

export function registerProxyHandlers(db: Database.Database): void {
  ipcMain.handle('proxy:list', (_event): IPCResponse<Proxy[]> => {
    try {
      const proxies = db.prepare('SELECT * FROM proxies').all() as Proxy[];
      return { success: true, data: proxies };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('proxy:add', (_event, params: { protocol: string; host: string; port: number; username?: string; password?: string }): IPCResponse<Proxy> => {
    try {
      if (!params.host || !params.host.trim()) {
        return { success: false, error: 'host is required' };
      }
      if (!params.port) {
        return { success: false, error: 'port is required' };
      }

      const id = randomUUID();
      const protocol = params.protocol || 'http';

      db.prepare(
        `INSERT INTO proxies (id, protocol, host, port, username, password)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, protocol, params.host.trim(), params.port, params.username ?? null, params.password ?? null);

      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(id) as Proxy;
      return { success: true, data: proxy };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('proxy:remove', (_event, id: string): IPCResponse<{ message: string }> => {
    try {
      if (!id) {
        return { success: false, error: 'Proxy id is required' };
      }

      db.prepare('DELETE FROM proxies WHERE id = ?').run(id);
      return { success: true, data: { message: 'Proxy removed' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('proxy:test', (_event, _id: string): IPCResponse<{ success: boolean; latencyMs: number }> => {
    try {
      // Placeholder — will test actual connectivity when implemented
      return { success: true, data: { success: true, latencyMs: 0 } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
