/**
 * HTML Cache Service — saves crawled HTML to disk and manages cache records in SQLite.
 *
 * CRITICAL RULE: Always save HTML BEFORE parsing. Parse from FILE, not live DOM.
 * This allows re-parsing when parser logic is fixed/improved.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export interface HtmlCacheRecord {
  id: number;
  page_type: string;
  target_id: number;
  target_name: string;
  page_number: number;
  file_path: string;
  file_size_bytes: number;
  parse_status: string;
  parse_error: string | null;
  listings_found: number;
  crawl_job_id: number;
  crawled_at: string;
  parsed_at: string | null;
  expires_at: string | null;
}

/**
 * Convert a name to a URL-safe slug: lowercase, replace non-alphanum with hyphens.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Get the base cache directory path.
 */
function getCacheDir(): string {
  return join(app.getPath('userData'), 'html_cache');
}

/**
 * Save HTML content to disk and insert a record into the html_cache table.
 *
 * Directory structure: html_cache/{pageType}/{slugified-target-name}/
 * Filename format: {YYYY-MM-DD_HHmmss}_page{n}.html
 */
export function saveHtml(
  db: Database.Database,
  params: {
    pageType: string;
    targetId: number;
    targetName: string;
    pageNumber: number;
    htmlContent: string;
    crawlJobId: number;
  }
): HtmlCacheRecord {
  const { pageType, targetId, targetName, pageNumber, htmlContent, crawlJobId } = params;

  // Build directory path
  const slug = slugify(targetName);
  const dir = join(getCacheDir(), pageType, slug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Build filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').substring(0, 15);
  const filename = `${timestamp}_page${pageNumber}.html`;
  const filePath = join(dir, filename);

  // Write HTML to disk
  writeFileSync(filePath, htmlContent, 'utf-8');
  const fileSizeBytes = Buffer.byteLength(htmlContent, 'utf-8');

  // Calculate expiry (7 days for normal, set during cleanup for error)
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Insert record into DB
  const stmt = db.prepare(`
    INSERT INTO html_cache (
      page_type, target_id, target_name, page_number,
      file_path, file_size_bytes, parse_status, crawl_job_id,
      crawled_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), ?)
  `);

  const result = stmt.run(
    pageType,
    targetId,
    targetName,
    pageNumber,
    filePath,
    fileSizeBytes,
    crawlJobId,
    expiresAt
  );

  const record = db.prepare('SELECT * FROM html_cache WHERE id = ?').get(
    result.lastInsertRowid
  ) as HtmlCacheRecord;

  logger.info('HTML cached to disk', {
    cacheId: record.id,
    pageType,
    targetName,
    pageNumber,
    fileSizeBytes,
    filePath,
  });

  return record;
}

/**
 * Check if there's a valid (non-expired) cache entry for the given target.
 * Returns the most recent valid entry, or null if none exists.
 */
export function getValidCache(
  db: Database.Database,
  pageType: string,
  targetName: string,
  maxAgeHours: number
): HtmlCacheRecord | null {
  const row = db.prepare(`
    SELECT * FROM html_cache
    WHERE page_type = ?
      AND target_name = ?
      AND crawled_at > datetime('now', ? || ' hours')
    ORDER BY crawled_at DESC
    LIMIT 1
  `).get(pageType, targetName, `-${maxAgeHours}`) as HtmlCacheRecord | undefined;

  return row ?? null;
}

/**
 * Read HTML content from a cached file on disk.
 * Looks up the file_path from the DB record and reads the file.
 */
export function readHtml(
  db: Database.Database,
  cacheId: number
): string {
  const record = db.prepare('SELECT file_path FROM html_cache WHERE id = ?').get(cacheId) as
    | { file_path: string }
    | undefined;

  if (!record) {
    throw new Error(`HTML cache record not found: ${cacheId}`);
  }

  if (!existsSync(record.file_path)) {
    throw new Error(`HTML cache file not found on disk: ${record.file_path}`);
  }

  return readFileSync(record.file_path, 'utf-8');
}

/**
 * Clean up expired cache entries.
 * - Normal files: expire after 7 days
 * - Parse error files: expire after 30 days (kept longer for debugging)
 * Removes files from disk and deletes DB records.
 */
export function cleanup(
  db: Database.Database
): { deleted: number; freedBytes: number } {
  // Get expired records: normal > 7 days, error > 30 days
  const expiredRecords = db.prepare(`
    SELECT id, file_path, file_size_bytes FROM html_cache
    WHERE (parse_status != 'error' AND crawled_at < datetime('now', '-7 days'))
       OR (parse_status = 'error' AND crawled_at < datetime('now', '-30 days'))
  `).all() as Array<{ id: number; file_path: string; file_size_bytes: number }>;

  if (expiredRecords.length === 0) {
    return { deleted: 0, freedBytes: 0 };
  }

  let freedBytes = 0;
  const deleteStmt = db.prepare('DELETE FROM html_cache WHERE id = ?');

  const doCleanup = db.transaction(() => {
    for (const record of expiredRecords) {
      // Remove file from disk
      try {
        if (existsSync(record.file_path)) {
          rmSync(record.file_path);
          freedBytes += record.file_size_bytes || 0;
        }
      } catch (err) {
        logger.error('Failed to remove cached HTML file', {
          cacheId: record.id,
          path: record.file_path,
          error: (err as Error).message,
        });
      }

      // Delete DB record
      deleteStmt.run(record.id);
    }
  });

  doCleanup();

  logger.info('HTML cache cleanup completed', {
    deleted: expiredRecords.length,
    freedBytes,
  });

  return { deleted: expiredRecords.length, freedBytes };
}

/**
 * Get cache statistics: total files, total size, oldest and newest entries.
 */
export function getStats(
  db: Database.Database
): {
  totalFiles: number;
  totalSizeBytes: number;
  oldestFile: string | null;
  newestFile: string | null;
} {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalFiles,
      COALESCE(SUM(file_size_bytes), 0) as totalSizeBytes,
      MIN(crawled_at) as oldestFile,
      MAX(crawled_at) as newestFile
    FROM html_cache
  `).get() as {
    totalFiles: number;
    totalSizeBytes: number;
    oldestFile: string | null;
    newestFile: string | null;
  };

  return stats;
}
