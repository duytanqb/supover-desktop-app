/**
 * HTML Cache Service — saves crawled HTML to disk with MD5-based filenames.
 *
 * Cache key = md5(pageType + targetName + pageNumber)
 * Same search query = same cache file → reuse across crawls
 * All files stored flat in html_cache/ directory
 *
 * CRITICAL RULE: Always save HTML BEFORE parsing. Parse from FILE, not live DOM.
 */

import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
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
  cache_key: string;
}

/** MD5 hash for cache key */
function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/** Get flat cache directory */
function getCacheDir(): string {
  const dir = join(app.getPath('userData'), 'html_cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generate cache key from query parameters */
function makeCacheKey(pageType: string, targetName: string, pageNumber: number): string {
  return md5(`${pageType}:${targetName.toLowerCase().trim()}:${pageNumber}`);
}

/**
 * Save HTML content to disk with MD5-based filename.
 * If same cache key exists and is still valid, overwrites the file.
 * File: html_cache/{md5hash}.html
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

  const cacheKey = makeCacheKey(pageType, targetName, pageNumber);
  const filePath = join(getCacheDir(), `${cacheKey}.html`);

  // Write HTML to disk (overwrite if exists)
  writeFileSync(filePath, htmlContent, 'utf-8');
  const fileSizeBytes = Buffer.byteLength(htmlContent, 'utf-8');

  // Expire in 3 hours (match crawl interval)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();

  // Upsert: if same cache_key exists, update it; otherwise insert
  const existing = db.prepare(
    'SELECT id FROM html_cache WHERE cache_key = ?'
  ).get(cacheKey) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE html_cache SET
        target_id = ?, target_name = ?, file_size_bytes = ?,
        parse_status = 'pending', parse_error = NULL, listings_found = 0,
        crawl_job_id = ?, crawled_at = datetime('now'), expires_at = ?
      WHERE id = ?
    `).run(targetId, targetName, fileSizeBytes, crawlJobId, expiresAt, existing.id);

    const record = db.prepare('SELECT * FROM html_cache WHERE id = ?').get(existing.id) as HtmlCacheRecord;
    logger.info('HTML cache updated (reuse key)', { cacheKey: cacheKey.substring(0, 8), pageType, targetName, pageNumber, fileSizeBytes });
    return record;
  }

  const result = db.prepare(`
    INSERT INTO html_cache (
      page_type, target_id, target_name, page_number,
      file_path, file_size_bytes, parse_status, crawl_job_id,
      crawled_at, expires_at, cache_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), ?, ?)
  `).run(pageType, targetId, targetName, pageNumber, filePath, fileSizeBytes, crawlJobId, expiresAt, cacheKey);

  const record = db.prepare('SELECT * FROM html_cache WHERE id = ?').get(result.lastInsertRowid) as HtmlCacheRecord;
  logger.info('HTML cached to disk', { cacheKey: cacheKey.substring(0, 8), pageType, targetName, pageNumber, fileSizeBytes });
  return record;
}

/**
 * Check if there's a valid (non-expired) cache for this query.
 * Uses MD5 key for exact match — same query + page = same cache.
 * Default TTL: 3 hours.
 */
export function getValidCache(
  db: Database.Database,
  pageType: string,
  targetName: string,
  maxAgeHours: number
): HtmlCacheRecord | null {
  const cacheKey = makeCacheKey(pageType, targetName, 1);

  // First try exact cache_key match (fast path)
  const byKey = db.prepare(`
    SELECT * FROM html_cache
    WHERE cache_key = ?
      AND crawled_at > datetime('now', ? || ' hours')
    ORDER BY crawled_at DESC LIMIT 1
  `).get(cacheKey, `-${maxAgeHours}`) as HtmlCacheRecord | undefined;

  if (byKey) return byKey;

  // Fallback: match by page_type + target_name (for old records without cache_key)
  const byName = db.prepare(`
    SELECT * FROM html_cache
    WHERE page_type = ?
      AND target_name = ?
      AND crawled_at > datetime('now', ? || ' hours')
    ORDER BY crawled_at DESC LIMIT 1
  `).get(pageType, targetName, `-${maxAgeHours}`) as HtmlCacheRecord | undefined;

  return byName ?? null;
}

/**
 * Read HTML content from cached file.
 */
export function readHtml(
  db: Database.Database,
  cacheId: number
): string {
  const record = db.prepare('SELECT file_path FROM html_cache WHERE id = ?').get(cacheId) as
    | { file_path: string }
    | undefined;

  if (!record) throw new Error(`HTML cache record not found: ${cacheId}`);
  if (!existsSync(record.file_path)) throw new Error(`HTML cache file missing: ${record.file_path}`);

  return readFileSync(record.file_path, 'utf-8');
}

/**
 * Clean expired cache: normal > 3h (1 cycle), error > 7 days
 */
export function cleanup(
  db: Database.Database
): { deleted: number; freedBytes: number } {
  const expiredRecords = db.prepare(`
    SELECT id, file_path, file_size_bytes FROM html_cache
    WHERE (parse_status != 'error' AND crawled_at < datetime('now', '-7 days'))
       OR (parse_status = 'error' AND crawled_at < datetime('now', '-30 days'))
  `).all() as Array<{ id: number; file_path: string; file_size_bytes: number }>;

  if (expiredRecords.length === 0) return { deleted: 0, freedBytes: 0 };

  let freedBytes = 0;
  const deleteStmt = db.prepare('DELETE FROM html_cache WHERE id = ?');

  const doCleanup = db.transaction(() => {
    for (const record of expiredRecords) {
      try {
        if (existsSync(record.file_path)) {
          rmSync(record.file_path);
          freedBytes += record.file_size_bytes || 0;
        }
      } catch (err) {
        logger.error('Failed to remove cached HTML', { id: record.id, error: (err as Error).message });
      }
      deleteStmt.run(record.id);
    }
  });

  doCleanup();
  logger.info('HTML cache cleanup', { deleted: expiredRecords.length, freedBytes });
  return { deleted: expiredRecords.length, freedBytes };
}

/**
 * Get cache statistics.
 */
export function getStats(db: Database.Database): {
  totalFiles: number;
  totalSizeBytes: number;
  oldestFile: string | null;
  newestFile: string | null;
} {
  return db.prepare(`
    SELECT COUNT(*) as totalFiles, COALESCE(SUM(file_size_bytes), 0) as totalSizeBytes,
      MIN(crawled_at) as oldestFile, MAX(crawled_at) as newestFile
    FROM html_cache
  `).get() as any;
}
