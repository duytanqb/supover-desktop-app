import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Tag Expansion Service — extract tags from winners, queue new keywords, saturation detection
 *
 * Reference: reference/etsy-spy/scripts/auto_research.py
 */

const MAX_DEPTH = 3;
const MAX_EXPANDED_PER_SEED = 20;

const GENERIC_WORDS = new Set([
  'gift', 'custom', 'personalized', 'funny', 'cute', 'vintage',
  'handmade', 'unique', 'for', 'with', 'the', 'and',
]);

const SUFFIX_SIBLINGS: Record<string, string[]> = {
  shirt: ['tee', 'hoodie', 'sweatshirt'],
  mug: ['tumbler', 'cup'],
  tshirt: ['shirt', 'tee', 'hoodie'],
  poster: ['print', 'canvas', 'wall art'],
  sticker: ['decal', 'patch'],
  hat: ['cap', 'beanie'],
  tee: ['shirt', 'sweatshirt', 'hoodie'],
};

// ---------------------------------------------------------------------------
// Extract searchable keywords from comma-separated tags
// ---------------------------------------------------------------------------

export function extractSearchKeywords(tags: string): string[] {
  if (!tags) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  const tagList = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  for (const tag of tagList) {
    const words = tag.split(/\s+/);
    // Keep 2-4 word phrases
    if (words.length < 2 || words.length > 4) continue;
    // Skip if ALL words are generic
    if (words.every(w => GENERIC_WORDS.has(w))) continue;
    // Deduplicate
    if (seen.has(tag)) continue;
    seen.add(tag);
    results.push(tag);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Check if a keyword cluster is saturated
// ---------------------------------------------------------------------------

export function isClusterSaturated(db: Database.Database, keywordId: number): boolean {
  // Get the last 2 crawl jobs for this keyword
  const recentJobs = db.prepare(`
    SELECT id FROM crawl_jobs
    WHERE job_type = 'search_index' AND target_id = ?
      AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 2
  `).all(keywordId) as { id: number }[];

  if (recentJobs.length < 2) return false;

  const latestJobId = recentJobs[0].id;
  const previousJobId = recentJobs[1].id;

  // Count new unique listing IDs in the latest crawl that were NOT in the previous crawl
  const newIdsCount = db.prepare(`
    SELECT COUNT(DISTINCT ss1.etsy_listing_id) as cnt
    FROM search_snapshots ss1
    WHERE ss1.crawl_job_id = ?
      AND ss1.etsy_listing_id NOT IN (
        SELECT ss2.etsy_listing_id FROM search_snapshots ss2 WHERE ss2.crawl_job_id = ?
      )
  `).get(latestJobId, previousJobId) as { cnt: number };

  // Count qualified listings (HOT or WATCH) from the latest crawl
  const qualifiedCount = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM search_snapshots ss
    JOIN listing_analytics la ON la.etsy_listing_id = ss.etsy_listing_id
    WHERE ss.crawl_job_id = ?
      AND la.trend_status IN ('HOT', 'WATCH')
  `).get(latestJobId) as { cnt: number };

  // Saturated if fewer than 4 new unique IDs OR <= 1 qualified listing
  const saturated = newIdsCount.cnt < 4 || qualifiedCount.cnt <= 1;

  if (saturated) {
    logger.info('Keyword cluster saturated', {
      keywordId,
      newIds: newIdsCount.cnt,
      qualifiedCount: qualifiedCount.cnt,
    });
  }

  return saturated;
}

// ---------------------------------------------------------------------------
// Build sibling queries for product type pivots
// ---------------------------------------------------------------------------

export function buildSiblingQueries(keyword: string): string[] {
  const words = keyword.toLowerCase().split(/\s+/);
  if (words.length < 2) return [];

  const lastWord = words[words.length - 1];
  const stem = words.slice(0, -1).join(' ');
  const siblings = SUFFIX_SIBLINGS[lastWord] || [];

  return siblings
    .map(s => `${stem} ${s}`)
    .filter(q => q !== keyword.toLowerCase());
}

// ---------------------------------------------------------------------------
// Process winners after crawl + classify for a keyword
// ---------------------------------------------------------------------------

export function processWinners(
  db: Database.Database,
  keywordId: number,
  analyticsData: Array<{ etsy_listing_id: string; trend_status: string; trending_score: number; tags: string }>,
): number {
  // Get keyword info
  const keyword = db.prepare(
    'SELECT id, keyword, depth, auto_expand, parent_keyword_id FROM search_keywords WHERE id = ?',
  ).get(keywordId) as { id: number; keyword: string; depth: number; auto_expand: number; parent_keyword_id: number | null } | undefined;

  if (!keyword) {
    logger.warn('processWinners: keyword not found', { keywordId });
    return 0;
  }

  if (!keyword.auto_expand) return 0;

  // Check depth limit
  if (keyword.depth >= MAX_DEPTH) {
    logger.info('processWinners: max depth reached', { keywordId, depth: keyword.depth });
    return 0;
  }

  // Find seed keyword ID (root of the expansion tree)
  let seedId = keyword.id;
  if (keyword.parent_keyword_id) {
    let current = keyword;
    while (current.parent_keyword_id) {
      const parent = db.prepare(
        'SELECT id, parent_keyword_id FROM search_keywords WHERE id = ?',
      ).get(current.parent_keyword_id) as { id: number; parent_keyword_id: number | null } | undefined;
      if (!parent) break;
      seedId = parent.id;
      current = parent as typeof current;
    }
  }

  // Check count of existing expanded keywords for this seed
  const expandedCount = db.prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM search_keywords WHERE parent_keyword_id = ?
      UNION ALL
      SELECT sk.id FROM search_keywords sk JOIN tree t ON sk.parent_keyword_id = t.id
    )
    SELECT COUNT(*) as cnt FROM tree
  `).get(seedId) as { cnt: number };

  if (expandedCount.cnt >= MAX_EXPANDED_PER_SEED) {
    logger.info('processWinners: max expanded per seed reached', { seedId, count: expandedCount.cnt });
    return 0;
  }

  // Filter qualified (HOT or WATCH) listings, sorted by score
  const winners = analyticsData
    .filter(a => a.trend_status === 'HOT' || a.trend_status === 'WATCH')
    .sort((a, b) => b.trending_score - a.trending_score)
    .slice(0, 4);

  if (winners.length === 0) return 0;

  // Extract new keywords from winner tags
  const existingKeywords = new Set(
    (db.prepare('SELECT keyword FROM search_keywords').all() as { keyword: string }[])
      .map(r => r.keyword.toLowerCase()),
  );

  const newKeywords: string[] = [];
  const seenNew = new Set<string>();

  for (const winner of winners) {
    const tagKeywords = extractSearchKeywords(winner.tags);
    for (const kw of tagKeywords) {
      if (existingKeywords.has(kw)) continue;
      if (seenNew.has(kw)) continue;
      seenNew.add(kw);
      newKeywords.push(kw);
    }
  }

  // Insert new keywords (max 5 per call)
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO search_keywords
      (keyword, parent_keyword_id, depth, expansion_source, source_listing_id, auto_expand, status)
    VALUES (?, ?, ?, 'tag_expansion', ?, 1, 'active')
  `);

  let added = 0;
  const remaining = MAX_EXPANDED_PER_SEED - expandedCount.cnt;
  const toInsert = newKeywords.slice(0, Math.min(5, remaining));

  const runInsert = db.transaction(() => {
    for (const kw of toInsert) {
      const sourceListingId = winners[0]?.etsy_listing_id ?? null;
      const result = insertStmt.run(kw, keywordId, keyword.depth + 1, sourceListingId);
      if (result.changes > 0) added++;
    }
  });

  runInsert();

  logger.info('processWinners: added new keywords', {
    keywordId,
    winnersCount: winners.length,
    newKeywordsFound: newKeywords.length,
    added,
  });

  return added;
}
