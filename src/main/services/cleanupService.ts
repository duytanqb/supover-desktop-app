import Database from 'better-sqlite3';
import { existsSync, unlinkSync, statSync, rmSync } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Cleanup Service — daily data retention + disk cleanup
 */

export interface CleanupResult {
  deletedRecords: number;
  freedBytes: number;
}

export function runDailyCleanup(db: Database.Database): CleanupResult {
  let deletedRecords = 0;
  let freedBytes = 0;

  const runCleanup = db.transaction(() => {
    // -----------------------------------------------------------------------
    // 1. html_cache: delete expired, old parsed (>7d), old errors (>30d)
    //    Also delete files from disk
    // -----------------------------------------------------------------------
    const htmlCacheRows = db.prepare(`
      SELECT id, file_path, file_size_bytes FROM html_cache
      WHERE expires_at < datetime('now')
        OR (parse_status != 'error' AND crawled_at < datetime('now', '-7 days'))
        OR (parse_status = 'error' AND crawled_at < datetime('now', '-30 days'))
    `).all() as Array<{ id: number; file_path: string; file_size_bytes: number | null }>;

    for (const row of htmlCacheRows) {
      // Delete file from disk
      try {
        if (row.file_path && existsSync(row.file_path)) {
          const stat = statSync(row.file_path);
          freedBytes += stat.size;
          unlinkSync(row.file_path);
        }
      } catch (error) {
        logger.warn('Failed to delete HTML cache file', {
          filePath: row.file_path,
          error: (error as Error).message,
        });
      }
    }

    if (htmlCacheRows.length > 0) {
      const ids = htmlCacheRows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM html_cache WHERE id IN (${placeholders})`).run(...ids);
      deletedRecords += htmlCacheRows.length;
      logger.info('Cleanup: html_cache', { deleted: htmlCacheRows.length });
    }

    // -----------------------------------------------------------------------
    // 2. listing_snapshots: older than 90 days
    // -----------------------------------------------------------------------
    const lsResult = db.prepare(
      "DELETE FROM listing_snapshots WHERE crawled_at < datetime('now', '-90 days')",
    ).run();
    deletedRecords += lsResult.changes;
    if (lsResult.changes > 0) {
      logger.info('Cleanup: listing_snapshots', { deleted: lsResult.changes });
    }

    // -----------------------------------------------------------------------
    // 3. shop_snapshots: older than 90 days
    // -----------------------------------------------------------------------
    const ssResult = db.prepare(
      "DELETE FROM shop_snapshots WHERE crawled_at < datetime('now', '-90 days')",
    ).run();
    deletedRecords += ssResult.changes;
    if (ssResult.changes > 0) {
      logger.info('Cleanup: shop_snapshots', { deleted: ssResult.changes });
    }

    // -----------------------------------------------------------------------
    // 4. search_snapshots: older than 60 days
    // -----------------------------------------------------------------------
    const searchResult = db.prepare(
      "DELETE FROM search_snapshots WHERE crawled_at < datetime('now', '-60 days')",
    ).run();
    deletedRecords += searchResult.changes;
    if (searchResult.changes > 0) {
      logger.info('Cleanup: search_snapshots', { deleted: searchResult.changes });
    }

    // -----------------------------------------------------------------------
    // 5. alerts: read alerts older than 30 days
    // -----------------------------------------------------------------------
    const alertResult = db.prepare(
      "DELETE FROM alerts WHERE is_read = 1 AND created_at < datetime('now', '-30 days')",
    ).run();
    deletedRecords += alertResult.changes;
    if (alertResult.changes > 0) {
      logger.info('Cleanup: alerts', { deleted: alertResult.changes });
    }

    // -----------------------------------------------------------------------
    // 6. browser_profiles: burned profiles older than 30 days (+ remove dirs)
    // -----------------------------------------------------------------------
    const burnedProfiles = db.prepare(`
      SELECT id, profile_path FROM browser_profiles
      WHERE status = 'burned' AND burned_at < datetime('now', '-30 days')
    `).all() as Array<{ id: string; profile_path: string }>;

    for (const profile of burnedProfiles) {
      try {
        if (profile.profile_path && existsSync(profile.profile_path)) {
          rmSync(profile.profile_path, { recursive: true, force: true });
          logger.info('Cleanup: removed burned profile dir', { profileId: profile.id });
        }
      } catch (error) {
        logger.warn('Failed to remove burned profile dir', {
          profileId: profile.id,
          error: (error as Error).message,
        });
      }
    }

    if (burnedProfiles.length > 0) {
      const ids = burnedProfiles.map(p => p.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM browser_profiles WHERE id IN (${placeholders})`).run(...ids);
      deletedRecords += burnedProfiles.length;
      logger.info('Cleanup: browser_profiles', { deleted: burnedProfiles.length });
    }

    // -----------------------------------------------------------------------
    // 7. crawl_jobs: completed/failed older than 30 days
    // -----------------------------------------------------------------------
    const jobResult = db.prepare(`
      DELETE FROM crawl_jobs
      WHERE status IN ('completed', 'failed')
        AND completed_at < datetime('now', '-30 days')
    `).run();
    deletedRecords += jobResult.changes;
    if (jobResult.changes > 0) {
      logger.info('Cleanup: crawl_jobs', { deleted: jobResult.changes });
    }
  });

  runCleanup();

  logger.info('Daily cleanup completed', { deletedRecords, freedBytes });

  return { deletedRecords, freedBytes };
}
