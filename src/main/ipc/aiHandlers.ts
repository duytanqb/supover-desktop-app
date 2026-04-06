import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { IPCResponse, AIInsight, AIInsightType } from '../../shared/types/index.js';
import * as aiService from '../services/aiService.js';

export function registerAIHandlers(db: Database.Database): void {
  ipcMain.handle('ai:analyze-shop', async (_event, shopId: number): Promise<IPCResponse<AIInsight>> => {
    try {
      if (!shopId) {
        return { success: false, error: 'Shop id is required' };
      }
      const insight = await aiService.analyzeShop(db, shopId);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('ai:analyze-keyword', async (_event, keywordId: number): Promise<IPCResponse<AIInsight>> => {
    try {
      if (!keywordId) {
        return { success: false, error: 'Keyword id is required' };
      }
      const insight = await aiService.analyzeKeyword(db, keywordId);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('ai:suggest-keywords', async (_event, context?: { seed: string; existingTags?: string[] }): Promise<IPCResponse<string[]>> => {
    try {
      if (!context?.seed) {
        return { success: false, error: 'Seed keyword is required' };
      }
      const suggestions = await aiService.suggestKeywords(db, context.seed, context.existingTags ?? []);
      return { success: true, data: suggestions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('ai:test-connection', async (_event, params?: { provider: string; apiKey: string; model: string }): Promise<IPCResponse<{ message: string }>> => {
    try {
      if (!params?.provider || !params?.apiKey || !params?.model) {
        return { success: false, error: 'Provider, API key, and model are required' };
      }
      const result = await aiService.testConnection(params.provider, params.apiKey, params.model);
      if (result.success) {
        return { success: true, data: { message: 'Connection successful' } };
      }
      return { success: false, error: result.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Market report — single button, analyzes last 100 trending listings
  ipcMain.handle('ai:market-report', async (_event): Promise<IPCResponse<AIInsight>> => {
    try {
      const insight = await aiService.generateMarketReport(db);
      return { success: true, data: insight };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('ai:insights-list', (_event, filters?: { insight_type?: AIInsightType; shop_id?: number; keyword_id?: number; limit?: number; offset?: number }): IPCResponse<AIInsight[]> => {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters?.insight_type) {
        conditions.push('insight_type = ?');
        params.push(filters.insight_type);
      }
      if (filters?.shop_id) {
        conditions.push('shop_id = ?');
        params.push(filters.shop_id);
      }
      if (filters?.keyword_id) {
        conditions.push('keyword_id = ?');
        params.push(filters.keyword_id);
      }

      let sql = 'SELECT * FROM ai_insights';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';

      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const insights = db.prepare(sql).all(...params) as AIInsight[];
      return { success: true, data: insights };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
