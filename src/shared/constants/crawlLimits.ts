// Crawl rate limits, timeouts, and delay constants

/** Maximum page views per profile per hour */
export const PAGE_VIEW_LIMIT_PER_HOUR = 60;

/** Maximum concurrent browser tabs */
export const MAX_CONCURRENT_TABS = 2;

/** Minimum delay between page navigations (ms) */
export const MIN_DELAY_MS = 3000;

/** Maximum delay between page navigations (ms) */
export const MAX_DELAY_MS = 8000;

/** Page load timeout (ms) */
export const PAGE_LOAD_TIMEOUT_MS = 30000;

/** Maximum retry attempts for a failed crawl */
export const MAX_RETRIES = 2;

/** Exponential backoff base for retries (ms) */
export const RETRY_BACKOFF_BASE_MS = 5000;

/** Number of consecutive blocked profiles before pausing */
export const CONSECUTIVE_BLOCKS_BEFORE_PAUSE = 3;

/** Pause duration when consecutive blocks detected (ms) */
export const PAUSE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Tag expansion: max depth from seed keyword */
export const TAG_EXPANSION_MAX_DEPTH = 3;

/** Tag expansion: max keywords per seed */
export const TAG_EXPANSION_MAX_KEYWORDS_PER_SEED = 20;

/** Default crawl interval for shops (minutes) */
export const DEFAULT_SHOP_CRAWL_INTERVAL_MINUTES = 360;

/** Default crawl interval for keywords (minutes) */
export const DEFAULT_KEYWORD_CRAWL_INTERVAL_MINUTES = 720;

/** Default max pages to crawl per keyword search */
export const DEFAULT_MAX_PAGES_PER_KEYWORD = 3;

/** HTML cache retention (days) - normal files */
export const HTML_CACHE_RETENTION_DAYS = 7;

/** HTML cache retention (days) - files with parse errors */
export const HTML_CACHE_ERROR_RETENTION_DAYS = 30;

/** Snapshot retention (days) for listing_snapshots */
export const LISTING_SNAPSHOT_RETENTION_DAYS = 90;

/** Snapshot retention (days) for shop_snapshots */
export const SHOP_SNAPSHOT_RETENTION_DAYS = 90;

/** Snapshot retention (days) for search_snapshots */
export const SEARCH_SNAPSHOT_RETENTION_DAYS = 60;

/** VK1ng API: bulk batch size */
export const VKING_BULK_BATCH_SIZE = 50;

/** VK1ng API: cache duration (hours) */
export const VKING_CACHE_HOURS = 24;
