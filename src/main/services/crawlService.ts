/**
 * Crawl Service — orchestrates the full crawl flow for shops and search keywords.
 *
 * CRITICAL RULES (from CLAUDE.md "Nguyen tac TUYET DOI"):
 * - NEVER crawl listing detail page — only shop index, search index, tag page
 * - Always save HTML BEFORE parsing
 * - Parse from FILE not live DOM
 * - Check block status before saving HTML
 * - Random delay 3-8s between navigations
 * - Max 60 page views/profile/hour
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { randomDelay, scrollPage } from '../utils/humanize.js';
import {
  launchPersistentContext,
  closeContext,
  isBlocked,
} from './browserService.js';
import {
  getAvailableProfile,
  createProfile,
  burnProfile,
  incrementRequests,
} from './profileService.js';
import {
  getNextProxy,
  formatProxyUrl,
  markFailed as markProxyFailed,
} from './proxyService.js';
import {
  saveHtml,
  getValidCache,
  readHtml,
} from './htmlCacheService.js';
import {
  parseShopIndex,
  parseSearchIndex,
  extractListingIds,
} from './parserService.js';
import type { ListingFromParse, ShopIndexData, SearchIndexData } from './parserService.js';

// ─── Error types ───────────────────────────────────────────────────────────────

export class BlockedError extends Error {
  constructor(target: string) {
    super(`Blocked while crawling: ${target}`);
    this.name = 'BlockedError';
  }
}

// ─── DB helper types ───────────────────────────────────────────────────────────

interface ShopRow {
  id: number;
  shop_name: string;
  shop_url: string;
  crawl_interval_minutes: number;
  status: string;
}

interface KeywordRow {
  id: number;
  keyword: string;
  max_pages: number;
  status: string;
}

interface CrawlJob {
  id: number;
  status: string;
}

// ─── Crawl job helpers ─────────────────────────────────────────────────────────

function createCrawlJob(
  db: Database.Database,
  jobType: string,
  targetId: number,
  profileId: string | null,
  proxyUsed: string | null
): CrawlJob {
  const result = db.prepare(`
    INSERT INTO crawl_jobs (job_type, target_id, profile_id, proxy_used, status, started_at, created_at)
    VALUES (?, ?, ?, ?, 'running', datetime('now'), datetime('now'))
  `).run(jobType, targetId, profileId, proxyUsed);

  return { id: Number(result.lastInsertRowid), status: 'running' };
}

function updateCrawlJob(
  db: Database.Database,
  jobId: number,
  status: string,
  errorMessage?: string,
  pagesCrawled?: number
): void {
  if (errorMessage) {
    db.prepare(`
      UPDATE crawl_jobs
      SET status = ?, error_message = ?, completed_at = datetime('now'),
          pages_crawled = COALESCE(?, pages_crawled)
      WHERE id = ?
    `).run(status, errorMessage, pagesCrawled ?? null, jobId);
  } else {
    db.prepare(`
      UPDATE crawl_jobs
      SET status = ?, completed_at = datetime('now'),
          pages_crawled = COALESCE(?, pages_crawled)
      WHERE id = ?
    `).run(status, pagesCrawled ?? null, jobId);
  }
}

// ─── DB persistence helpers ────────────────────────────────────────────────────

function getSetting(db: Database.Database, key: string, defaultValue: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? defaultValue;
}

function upsertListingAndSnapshot(
  db: Database.Database,
  shopId: number,
  listing: ListingFromParse,
  crawlJobId: number
): void {
  // Upsert into listings table
  db.prepare(`
    INSERT INTO listings (shop_id, etsy_listing_id, first_seen_at, last_seen_at, status)
    VALUES (?, ?, datetime('now'), datetime('now'), 'active')
    ON CONFLICT(shop_id, etsy_listing_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      status = 'active'
  `).run(shopId, listing.etsyListingId);

  // Get the listing ID
  const listingRow = db.prepare(`
    SELECT id FROM listings WHERE shop_id = ? AND etsy_listing_id = ?
  `).get(shopId, listing.etsyListingId) as { id: number };

  // Insert listing snapshot
  db.prepare(`
    INSERT INTO listing_snapshots (
      listing_id, shop_id, title, price, sale_price, currency,
      image_url, rating, review_count, is_bestseller, is_ad,
      is_free_shipping, position_in_shop, crawled_at, crawl_job_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    listingRow.id,
    shopId,
    listing.title,
    listing.price,
    listing.salePrice,
    listing.currency,
    listing.imageUrl,
    listing.rating,
    listing.reviewCount,
    listing.isBestseller ? 1 : 0,
    listing.isAd ? 1 : 0,
    listing.isFreeShipping ? 1 : 0,
    listing.position,
    crawlJobId
  );
}

function insertShopSnapshot(
  db: Database.Database,
  shopId: number,
  shopInfo: ShopIndexData['shopInfo'],
  crawlJobId: number,
  htmlPath?: string
): void {
  db.prepare(`
    INSERT INTO shop_snapshots (
      shop_id, total_listings, total_sales, total_reviews,
      crawled_at, crawl_job_id, raw_html_path
    ) VALUES (?, NULL, ?, ?, datetime('now'), ?, ?)
  `).run(
    shopId,
    shopInfo.totalSales ?? null,
    shopInfo.totalReviews ?? null,
    crawlJobId,
    htmlPath ?? null
  );
}

function insertSearchSnapshot(
  db: Database.Database,
  keywordId: number,
  listing: ListingFromParse,
  pageNumber: number,
  crawlJobId: number
): void {
  db.prepare(`
    INSERT INTO search_snapshots (
      keyword_id, etsy_listing_id, shop_name, title, price, sale_price,
      currency, image_url, rating, review_count, is_bestseller, is_ad,
      is_free_shipping, position_in_search, page_number, crawled_at, crawl_job_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    keywordId,
    listing.etsyListingId,
    listing.shopName ?? null,
    listing.title,
    listing.price,
    listing.salePrice,
    listing.currency,
    listing.imageUrl,
    listing.rating,
    listing.reviewCount,
    listing.isBestseller ? 1 : 0,
    listing.isAd ? 1 : 0,
    listing.isFreeShipping ? 1 : 0,
    listing.position,
    pageNumber,
    crawlJobId
  );
}

function updateCacheParseStatus(
  db: Database.Database,
  cacheId: number,
  status: 'parsed' | 'error',
  listingsFound: number,
  errorMsg?: string
): void {
  db.prepare(`
    UPDATE html_cache
    SET parse_status = ?, listings_found = ?, parsed_at = datetime('now'), parse_error = ?
    WHERE id = ?
  `).run(status, listingsFound, errorMsg ?? null, cacheId);
}

// ─── Main crawl functions ──────────────────────────────────────────────────────

/**
 * Crawl a shop's index page. Full flow:
 * 1. Check HTML cache for valid entry
 * 2. If no cache: launch browser, navigate, check block, scroll, save HTML
 * 3. Parse HTML from file (NOT from live DOM)
 * 4. Save parsed data to DB (listings + snapshots) in a transaction
 */
export async function crawlShop(
  db: Database.Database,
  shopId: number
): Promise<{ listingIds: string[]; pagesProcessed: number }> {
  // 1. Get shop from DB
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as ShopRow | undefined;
  if (!shop) {
    throw new Error(`Shop not found: ${shopId}`);
  }

  logger.info('Starting shop crawl', { shopId, shopName: shop.shop_name });

  // 2. Check HTML cache
  const cacheHours = parseInt(getSetting(db, 'html_cache_retention_days', '7')) * 24;
  const cachedRecord = getValidCache(db, 'shop_index', shop.shop_name, cacheHours);

  if (cachedRecord) {
    logger.info('Using cached HTML for shop', { shopId, cacheId: cachedRecord.id });
    try {
      const html = readHtml(db, cachedRecord.id);
      const data = parseShopIndex(html);

      // Save parsed data in transaction
      const saveParsed = db.transaction(() => {
        insertShopSnapshot(db, shopId, data.shopInfo, cachedRecord.crawl_job_id, cachedRecord.file_path);
        for (const listing of data.listings) {
          upsertListingAndSnapshot(db, shopId, listing, cachedRecord.crawl_job_id);
        }
        updateCacheParseStatus(db, cachedRecord.id, 'parsed', data.listings.length);
      });
      saveParsed();

      return {
        listingIds: data.listings.map((l) => l.etsyListingId),
        pagesProcessed: 0,
      };
    } catch (err) {
      logger.error('Failed to parse cached HTML, will re-crawl', {
        shopId,
        cacheId: cachedRecord.id,
        error: (err as Error).message,
      });
      updateCacheParseStatus(db, cachedRecord.id, 'error', 0, (err as Error).message);
    }
  }

  // 3. Get available profile (create one if none exist)
  let profile = getAvailableProfile(db);
  if (!profile) {
    logger.info('No profiles available, creating new one');
    const proxy = getNextProxy(db);
    profile = createProfile(db, proxy?.id);
  }

  // 4. Get proxy
  const proxy = getNextProxy(db);
  const proxyUrl = proxy ? formatProxyUrl(proxy) : undefined;

  // 5. Create crawl job
  const job = createCrawlJob(db, 'shop_index', shopId, profile.id, proxyUrl ?? null);

  let ctx: any = null;

  try {
    // 6. Launch browser context
    ctx = await launchPersistentContext(profile.profile_path, proxyUrl);
    const page = ctx.pages()[0] || (await ctx.newPage());

    // 7. Navigate to shop URL
    const shopUrl = shop.shop_url.endsWith('/')
      ? shop.shop_url
      : `${shop.shop_url}/`;
    logger.info('Navigating to shop', { shopUrl });
    await page.goto(shopUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 8. Random delay (3-8s as per rules)
    await randomDelay(3000, 8000);

    // 9. Block detection — MUST check BEFORE saving HTML
    if (await isBlocked(page)) {
      burnProfile(db, profile.id, `blocked on shop page: ${shop.shop_name}`);
      if (proxy) markProxyFailed(db, proxy.id);
      updateCrawlJob(db, job.id, 'blocked', 'Page blocked by Etsy');
      throw new BlockedError(shop.shop_name);
    }

    // 10. Scroll to trigger lazy load
    await scrollPage(page);

    // 11. Save HTML to disk BEFORE parsing (CRITICAL RULE)
    const htmlContent = await page.content();
    const cacheRecord = saveHtml(db, {
      pageType: 'shop_index',
      targetId: shopId,
      targetName: shop.shop_name,
      pageNumber: 1,
      htmlContent,
      crawlJobId: job.id,
    });

    // 12. Parse from FILE (not from live DOM — CRITICAL RULE)
    const savedHtml = readHtml(db, cacheRecord.id);
    const data = parseShopIndex(savedHtml);

    // 13. Save to DB in a transaction
    const saveData = db.transaction(() => {
      insertShopSnapshot(db, shopId, data.shopInfo, job.id, cacheRecord.file_path);
      for (const listing of data.listings) {
        upsertListingAndSnapshot(db, shopId, listing, job.id);
      }
      updateCacheParseStatus(db, cacheRecord.id, 'parsed', data.listings.length);
    });
    saveData();

    // 14. Update crawl job
    updateCrawlJob(db, job.id, 'completed', undefined, 1);

    logger.info('Shop crawl completed', {
      shopId,
      shopName: shop.shop_name,
      listingsFound: data.listings.length,
    });

    return {
      listingIds: data.listings.map((l) => l.etsyListingId),
      pagesProcessed: 1,
    };
  } catch (error) {
    if (!(error instanceof BlockedError)) {
      updateCrawlJob(db, job.id, 'failed', (error as Error).message);
    }
    logger.error('Shop crawl failed', {
      shopId,
      shopName: shop.shop_name,
      error: (error as Error).message,
    });
    throw error;
  } finally {
    // Always close browser context
    if (ctx) {
      await closeContext(ctx);
    }
    // Always increment request count
    incrementRequests(db, profile.id);
  }
}

/**
 * Crawl search results for a keyword. Supports multi-page crawling.
 * Flow is similar to crawlShop but iterates over multiple search pages.
 */
export async function crawlSearch(
  db: Database.Database,
  keywordId: number
): Promise<{ listingIds: string[]; pagesProcessed: number }> {
  // 1. Get keyword from DB
  const keyword = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(keywordId) as
    | KeywordRow
    | undefined;
  if (!keyword) {
    throw new Error(`Keyword not found: ${keywordId}`);
  }

  logger.info('Starting search crawl', { keywordId, keyword: keyword.keyword });

  const maxPages = keyword.max_pages || 3;
  const allListingIds: string[] = [];
  let totalPagesProcessed = 0;

  // 2. Get available profile (create one if none exist)
  let profile = getAvailableProfile(db);
  if (!profile) {
    logger.info('No profiles available, creating new one');
    const proxy = getNextProxy(db);
    profile = createProfile(db, proxy?.id);
  }

  // 3. Get proxy
  const proxy = getNextProxy(db);
  const proxyUrl = proxy ? formatProxyUrl(proxy) : undefined;

  // 4. Create crawl job
  const job = createCrawlJob(db, 'search_index', keywordId, profile.id, proxyUrl ?? null);

  let ctx: any = null;

  try {
    // 5. Launch browser context
    ctx = await launchPersistentContext(profile.profile_path, proxyUrl);
    const page = ctx.pages()[0] || (await ctx.newPage());

    // 6. Loop through pages
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      // Check cache for this specific page
      const cacheKey = `${keyword.keyword}_page${pageNum}`;
      const cacheHours = parseInt(getSetting(db, 'vking_cache_hours', '24'));
      const cachedRecord = getValidCache(db, 'search_index', cacheKey, cacheHours);

      if (cachedRecord) {
        logger.info('Using cached HTML for search page', {
          keywordId,
          page: pageNum,
          cacheId: cachedRecord.id,
        });
        try {
          const html = readHtml(db, cachedRecord.id);
          const data = parseSearchIndex(html, keyword.keyword, pageNum);

          // Save parsed data
          const saveParsed = db.transaction(() => {
            for (const listing of data.listings) {
              insertSearchSnapshot(db, keywordId, listing, pageNum, cachedRecord.crawl_job_id);
            }
            updateCacheParseStatus(db, cachedRecord.id, 'parsed', data.listings.length);
          });
          saveParsed();

          allListingIds.push(...data.listings.map((l) => l.etsyListingId));
          totalPagesProcessed++;
          continue;
        } catch (err) {
          logger.error('Failed to parse cached search HTML, will re-crawl', {
            keywordId,
            page: pageNum,
            error: (err as Error).message,
          });
          updateCacheParseStatus(db, cachedRecord.id, 'error', 0, (err as Error).message);
        }
      }

      // Build search URL
      const encodedKeyword = encodeURIComponent(keyword.keyword);
      const searchUrl =
        pageNum === 1
          ? `https://www.etsy.com/search?q=${encodedKeyword}&ref=search_bar&explicit=1&ship_to=US`
          : `https://www.etsy.com/search?q=${encodedKeyword}&ref=search_bar&explicit=1&ship_to=US&page=${pageNum}`;

      // Navigate
      logger.info('Navigating to search page', { keyword: keyword.keyword, page: pageNum, url: searchUrl });
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Random delay (3-8s)
      await randomDelay(3000, 8000);

      // Block detection
      if (await isBlocked(page)) {
        burnProfile(db, profile.id, `blocked on search: ${keyword.keyword} page ${pageNum}`);
        if (proxy) markProxyFailed(db, proxy.id);
        updateCrawlJob(db, job.id, 'blocked', 'Page blocked by Etsy', totalPagesProcessed);
        throw new BlockedError(`${keyword.keyword} page ${pageNum}`);
      }

      // Scroll for lazy load
      await scrollPage(page);

      // Save HTML BEFORE parsing (CRITICAL RULE)
      const htmlContent = await page.content();
      const cacheRecord = saveHtml(db, {
        pageType: 'search_index',
        targetId: keywordId,
        targetName: cacheKey,
        pageNumber: pageNum,
        htmlContent,
        crawlJobId: job.id,
      });

      // Parse from FILE (CRITICAL RULE)
      const savedHtml = readHtml(db, cacheRecord.id);
      const data = parseSearchIndex(savedHtml, keyword.keyword, pageNum);

      // Save to DB in transaction
      const saveData = db.transaction(() => {
        for (const listing of data.listings) {
          insertSearchSnapshot(db, keywordId, listing, pageNum, job.id);
        }
        updateCacheParseStatus(db, cacheRecord.id, 'parsed', data.listings.length);
      });
      saveData();

      allListingIds.push(...data.listings.map((l) => l.etsyListingId));
      totalPagesProcessed++;

      // Random delay between pages (respect rate limits)
      if (pageNum < maxPages) {
        await randomDelay(3000, 8000);
      }

      // Increment request count per page
      incrementRequests(db, profile.id);

      // If no listings found on this page, stop pagination
      if (data.listings.length === 0) {
        logger.info('No more listings found, stopping pagination', {
          keyword: keyword.keyword,
          stoppedAtPage: pageNum,
        });
        break;
      }
    }

    // Update crawl job
    updateCrawlJob(db, job.id, 'completed', undefined, totalPagesProcessed);

    // Deduplicate listing IDs
    const uniqueIds = [...new Set(allListingIds)];

    logger.info('Search crawl completed', {
      keywordId,
      keyword: keyword.keyword,
      totalListings: uniqueIds.length,
      pagesProcessed: totalPagesProcessed,
    });

    return {
      listingIds: uniqueIds,
      pagesProcessed: totalPagesProcessed,
    };
  } catch (error) {
    if (!(error instanceof BlockedError)) {
      updateCrawlJob(db, job.id, 'failed', (error as Error).message, totalPagesProcessed);
    }
    logger.error('Search crawl failed', {
      keywordId,
      keyword: keyword.keyword,
      error: (error as Error).message,
    });
    throw error;
  } finally {
    // Always close browser context
    if (ctx) {
      await closeContext(ctx);
    }
    // Always increment request count (for the session)
    incrementRequests(db, profile.id);
  }
}
