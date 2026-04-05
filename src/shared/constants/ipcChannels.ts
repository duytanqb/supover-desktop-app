// IPC channel name constants — shared between main and renderer

export const IPC = {
  // Shop
  SHOP_LIST: 'shop:list',
  SHOP_GET: 'shop:get',
  SHOP_ADD: 'shop:add',
  SHOP_UPDATE: 'shop:update',
  SHOP_DELETE: 'shop:delete',
  SHOP_CRAWL_NOW: 'shop:crawl-now',

  // Keyword
  KEYWORD_LIST: 'keyword:list',
  KEYWORD_ADD: 'keyword:add',
  KEYWORD_UPDATE: 'keyword:update',
  KEYWORD_DELETE: 'keyword:delete',
  KEYWORD_CRAWL_NOW: 'keyword:crawl-now',

  // Snapshots
  SNAPSHOT_SHOP_HISTORY: 'snapshot:shop-history',
  SNAPSHOT_LISTING_HISTORY: 'snapshot:listing-history',
  SNAPSHOT_SEARCH_HISTORY: 'snapshot:search-history',

  // Alerts
  ALERT_LIST: 'alert:list',
  ALERT_MARK_READ: 'alert:mark-read',
  ALERT_MARK_ALL_READ: 'alert:mark-all-read',
  ALERT_COUNT_UNREAD: 'alert:count-unread',

  // Analytics / Trend Detection
  ANALYTICS_FETCH: 'analytics:fetch',
  ANALYTICS_HISTORY: 'analytics:history',
  ANALYTICS_TRENDING: 'analytics:trending',
  ANALYTICS_DASHBOARD: 'analytics:dashboard',
  ANALYTICS_API_STATUS: 'analytics:api-status',
  ANALYTICS_QUALIFICATION: 'analytics:qualification',

  // AI
  AI_ANALYZE_SHOP: 'ai:analyze-shop',
  AI_ANALYZE_KEYWORD: 'ai:analyze-keyword',
  AI_SUGGEST_KEYWORDS: 'ai:suggest-keywords',
  AI_INSIGHTS_LIST: 'ai:insights-list',

  // Crawl
  CRAWL_STATUS: 'crawl:status',
  CRAWL_PAUSE: 'crawl:pause',
  CRAWL_RESUME: 'crawl:resume',
  CRAWL_HISTORY: 'crawl:history',

  // HTML Cache
  HTML_CACHE_LIST: 'html-cache:list',
  HTML_CACHE_GET: 'html-cache:get',
  HTML_CACHE_REPARSE: 'html-cache:reparse',
  HTML_CACHE_REPARSE_ALL: 'html-cache:reparse-all',
  HTML_CACHE_CLEANUP: 'html-cache:cleanup',
  HTML_CACHE_STATS: 'html-cache:stats',

  // Tag Expansion
  EXPANSION_TREE: 'expansion:tree',
  EXPANSION_QUEUE: 'expansion:queue',
  EXPANSION_APPROVE: 'expansion:approve',
  EXPANSION_REJECT: 'expansion:reject',
  EXPANSION_SATURATE: 'expansion:saturate',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Proxy
  PROXY_LIST: 'proxy:list',
  PROXY_ADD: 'proxy:add',
  PROXY_REMOVE: 'proxy:remove',
  PROXY_TEST: 'proxy:test',

  // Profile
  PROFILE_LIST: 'profile:list',
  PROFILE_STATUS: 'profile:status',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
