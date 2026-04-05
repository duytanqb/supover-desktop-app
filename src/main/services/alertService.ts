import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { DiffChange } from './diffService.js';

/**
 * Alert Service — create alerts from diffs, query/manage alerts
 */

export interface AlertFilters {
  type?: string;
  severity?: string;
  shopId?: number;
  isRead?: number;
  limit?: number;
  offset?: number;
}

export interface AlertRecord {
  id: number;
  alert_type: string;
  shop_id: number | null;
  listing_id: number | null;
  keyword_id: number | null;
  old_value: string | null;
  new_value: string | null;
  severity: string;
  is_read: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Create alerts from diff changes
// ---------------------------------------------------------------------------

export function createFromDiff(
  db: Database.Database,
  diffs: DiffChange[],
  shopId?: number,
  keywordId?: number,
): number {
  if (diffs.length === 0) return 0;

  const insertStmt = db.prepare(`
    INSERT INTO alerts (alert_type, shop_id, listing_id, keyword_id, old_value, new_value, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  const runInsert = db.transaction(() => {
    for (const diff of diffs) {
      try {
        insertStmt.run(
          diff.type,
          diff.shopId ?? shopId ?? null,
          diff.listingId ?? null,
          diff.keywordId ?? keywordId ?? null,
          diff.oldValue ?? null,
          diff.newValue ?? null,
          diff.severity,
        );
        count++;
      } catch (error) {
        logger.error('Failed to create alert', {
          type: diff.type,
          error: (error as Error).message,
        });
      }
    }
  });

  runInsert();

  logger.info('Alerts created from diff', { count, shopId, keywordId });
  return count;
}

// ---------------------------------------------------------------------------
// Get unread count
// ---------------------------------------------------------------------------

export function getUnreadCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM alerts WHERE is_read = 0').get() as { cnt: number };
  return row.cnt;
}

// ---------------------------------------------------------------------------
// Get alerts with filters + pagination
// ---------------------------------------------------------------------------

export function getAlerts(db: Database.Database, filters: AlertFilters): AlertRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    conditions.push('alert_type = ?');
    params.push(filters.type);
  }

  if (filters.severity) {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }

  if (filters.shopId != null) {
    conditions.push('shop_id = ?');
    params.push(filters.shopId);
  }

  if (filters.isRead != null) {
    conditions.push('is_read = ?');
    params.push(filters.isRead);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const sql = `
    SELECT * FROM alerts
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  return db.prepare(sql).all(...params, limit, offset) as AlertRecord[];
}

// ---------------------------------------------------------------------------
// Mark read
// ---------------------------------------------------------------------------

export function markRead(db: Database.Database, alertId: number): void {
  db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(alertId);
}

export function markAllRead(db: Database.Database): void {
  db.prepare('UPDATE alerts SET is_read = 1 WHERE is_read = 0').run();
}
