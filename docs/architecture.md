# Architecture — Etsy Spy Desktop App

## Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────┐
│                    Electron App                       │
│                                                       │
│  ┌──────────────┐           ┌──────────────────────┐ │
│  │  Renderer     │   IPC     │  Main Process         │ │
│  │  (React UI)   │◄────────►│                       │ │
│  │               │           │  Scheduler            │ │
│  │  - Dashboard  │           │    ↓                  │ │
│  │  - Trending   │           │  Crawl Service        │ │
│  │  - Shop list  │           │    ↓         ↓        │ │
│  │  - Alerts     │           │  Playwright  VK1ng    │ │
│  │  - AI panel   │           │  Worker      API      │ │
│  │  - Settings   │           │    ↓                  │ │
│  └──────────────┘           │  HTML Cache            │ │
│                              │    ↓         ↓        │ │
│                              │  Parser + Trend Engine │ │
│                              │    ↓                  │ │
│                              │  Diff + Alert          │ │
│                              │    ↓                  │ │
│                              │  AI Service            │ │
│                              │    ↓                  │ │
│                              │  SQLite DB             │ │
│                              └──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Luồng dữ liệu chính

```
1. User thêm shop/keyword vào watchlist
2. Scheduler tạo crawl job khi đến lịch
3. Crawl Service chọn profile + proxy → Playwright mở Etsy index page
4. Playwright scroll + extract → page.content() → LƯU HTML FILE
5. Parser đọc FILE HTML → extract listings → lưu snapshot vào DB
6. Extract listing IDs → gọi VK1ng API (bulk) → nhận metrics
7. Trend Engine chạy qualification rules → classify HOT/WATCH/SKIP → lưu analytics
8. Diff Engine so snapshot mới vs cũ → tạo alerts
9. Tag Expansion extract tags từ winners → queue keyword mới
10. AI Service đọc diffs + analytics → sinh insight
11. UI hiển thị tất cả qua IPC polling
```

## Cấu trúc code chi tiết

```
src/
├── main/                    # Electron main process
│   ├── main.ts              # Entry point, tạo BrowserWindow, register IPC
│   │
│   ├── ipc/
│   │   ├── shopHandlers.ts      # shop:list, shop:add, shop:update, shop:delete, shop:crawl-now
│   │   ├── keywordHandlers.ts   # keyword:list, keyword:add, keyword:update, keyword:delete
│   │   ├── crawlHandlers.ts     # crawl:status, crawl:pause, crawl:resume, crawl:history
│   │   ├── snapshotHandlers.ts  # snapshot:shop-history, snapshot:listing-history, snapshot:search-history
│   │   ├── alertHandlers.ts     # alert:list, alert:mark-read, alert:count-unread
│   │   ├── analyticsHandlers.ts # analytics:fetch, analytics:trending, analytics:dashboard
│   │   ├── htmlCacheHandlers.ts # html-cache:list, html-cache:reparse, html-cache:stats
│   │   ├── expansionHandlers.ts # expansion:tree, expansion:approve, expansion:reject
│   │   ├── aiHandlers.ts        # ai:analyze-shop, ai:analyze-keyword, ai:insights-list
│   │   ├── proxyHandlers.ts     # proxy:list, proxy:add, proxy:remove, proxy:test
│   │   ├── profileHandlers.ts   # profile:list, profile:status
│   │   └── settingsHandlers.ts  # settings:get, settings:update
│   │
│   ├── services/
│   │   ├── db.ts                # SQLite connection + migrations runner
│   │   ├── shopService.ts       # CRUD shop, listing
│   │   ├── crawlService.ts      # Orchestrate crawl flow (cache-first)
│   │   ├── browserService.ts    # Playwright instances + persistent context
│   │   ├── proxyService.ts      # Proxy pool + rotation
│   │   ├── profileService.ts    # Browser profiles: create/burn/cleanup
│   │   ├── htmlCacheService.ts  # Save/read/manage/cleanup HTML cache files
│   │   ├── parserService.ts     # Parse listing data FROM HTML FILES
│   │   ├── vkingService.ts      # VK1ng API: single/bulk analytics, subscription check
│   │   ├── trendService.ts      # Qualification rules, trending score, classification
│   │   ├── tagExpansionService.ts # Extract tags → queue keywords → saturation detection
│   │   ├── diffService.ts       # Compare snapshots old vs new
│   │   ├── alertService.ts      # Create + manage alerts
│   │   ├── schedulerService.ts  # Cron/interval cho crawl jobs
│   │   ├── aiService.ts         # AI API calls for insights
│   │   └── exportService.ts     # Export CSV/JSON
│   │
│   └── utils/
│       ├── logger.ts            # Winston hoặc custom logger
│       ├── humanize.ts          # Random delay, mouse simulation
│       └── constants.ts
│
├── renderer/                # React UI (Vite)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx        # Overview: trending HOT, recent alerts, most changed shops
│   │   ├── TrendingBoard.tsx    # HOT/WATCH ranking table, filter by keyword/shop
│   │   ├── ShopList.tsx         # List of followed shops
│   │   ├── ShopDetail.tsx       # Shop detail: listings + analytics + history
│   │   ├── SearchTracker.tsx    # Keyword tracking + expansion tree
│   │   ├── Alerts.tsx           # Alerts list
│   │   ├── AIInsights.tsx       # AI summaries + recommendations
│   │   └── Settings.tsx         # VK1ng key, proxy, AI key, schedule, profiles
│   ├── components/
│   │   ├── ShopCard.tsx
│   │   ├── ListingCard.tsx      # Listing + trend badge
│   │   ├── TrendBadge.tsx       # 🔥 HOT / ⚠️ WATCH / ❌ SKIP
│   │   ├── AnalyticsPanel.tsx   # Metrics display: sold, views, hey, score
│   │   ├── AlertItem.tsx
│   │   ├── DiffViewer.tsx       # Show changes between 2 snapshots
│   │   ├── KeywordTree.tsx      # Visualize keyword expansion tree
│   │   ├── SnapshotTimeline.tsx
│   │   └── ProxyStatus.tsx
│   ├── hooks/
│   │   ├── useIPC.ts            # Hook to call IPC from renderer
│   │   └── usePolling.ts        # Hook to poll data updates
│   └── styles/
│       └── global.css
│
└── shared/                  # Types + constants shared between main & renderer
    ├── types/
    │   ├── shop.ts
    │   ├── listing.ts
    │   ├── snapshot.ts
    │   ├── analytics.ts         # VK1ng data types, qualification result, trend status
    │   ├── alert.ts
    │   ├── crawlJob.ts
    │   ├── proxy.ts
    │   └── aiInsight.ts
    └── constants/
        ├── crawlLimits.ts       # Rate limits, timeouts
        └── ipcChannels.ts       # IPC channel name constants
```

## IPC Channels (đầy đủ)

```typescript
// Shop
'shop:list'               // Get all shops
'shop:get'                // Get shop by id with latest snapshot
'shop:add'                // Add new shop
'shop:update'             // Update shop settings
'shop:delete'             // Archive shop
'shop:crawl-now'          // Trigger immediate crawl

// Keyword
'keyword:list'
'keyword:add'
'keyword:update'
'keyword:delete'
'keyword:crawl-now'

// Snapshots
'snapshot:shop-history'       // Get snapshot history for shop
'snapshot:listing-history'    // Get snapshot history for listing
'snapshot:search-history'     // Get search history for keyword

// Alerts
'alert:list'                  // Get alerts (with filters)
'alert:mark-read'
'alert:mark-all-read'
'alert:count-unread'

// Analytics / Trend Detection
'analytics:fetch'             // Fetch VK1ng data for listing IDs
'analytics:history'           // Get analytics history for a listing
'analytics:trending'          // Get all HOT/WATCH listings
'analytics:dashboard'         // Dashboard data: top trending, new HOT, velocity spikes
'analytics:api-status'        // Check VK1ng API key health
'analytics:qualification'     // Check qualification for specific listing

// AI
'ai:analyze-shop'             // Trigger AI analysis for shop
'ai:analyze-keyword'          // Trigger AI analysis for keyword
'ai:suggest-keywords'         // Get keyword suggestions
'ai:insights-list'            // Get saved insights

// Crawl
'crawl:status'                // Get current crawl status
'crawl:pause'
'crawl:resume'
'crawl:history'               // Get crawl job history

// HTML Cache
'html-cache:list'             // List cached HTML files
'html-cache:get'              // Get specific cache entry
'html-cache:reparse'          // Re-parse a cached HTML file
'html-cache:reparse-all'      // Re-parse all files
'html-cache:cleanup'          // Manual cleanup expired files
'html-cache:stats'            // Cache size, count, oldest/newest

// Tag Expansion
'expansion:tree'              // Get keyword expansion tree for a seed
'expansion:queue'             // Get queued keywords pending crawl
'expansion:approve'           // Approve auto-expanded keyword
'expansion:reject'            // Reject auto-expanded keyword
'expansion:saturate'          // Mark keyword as saturated

// Settings
'settings:get'
'settings:update'

// Proxy
'proxy:list'
'proxy:add'
'proxy:remove'
'proxy:test'                  // Test proxy connectivity

// Profile
'profile:list'
'profile:status'
```

## Anti-detection strategy

```
Tầng 1: Profile rotation
- launchPersistentContext với profile directory riêng
- Giữ cookie, localStorage, fingerprint nhất quán trong 1 profile

Tầng 2: Proxy support
- HTTP/HTTPS/SOCKS5 proxy
- Khi bị block → tạo profile MỚI + đổi proxy → đánh dấu cũ "burned"

Tầng 3: Hành vi tự nhiên
- Random delay 3-8 giây
- Max 2 tab cùng lúc
- Scroll trước khi extract
- Max 60 page views / profile / giờ

Tầng 4: Fallback
- Lưu raw HTML khi lỗi
- Retry max 2 lần exponential backoff
- 3 profile liên tiếp bị block → pause 30 phút → alert user
```

## Data retention policy

```
- listing_snapshots: 90 ngày → aggregate weekly
- shop_snapshots: 90 ngày
- search_snapshots: 60 ngày
- html_cache (normal): 7 ngày
- html_cache (parse error): 30 ngày
- alerts đã đọc: 30 ngày
- ai_insights: 180 ngày
- burned profiles: cleanup 30 ngày
- crawl_jobs completed: 30 ngày
- saturated keywords depth>1: archive 14 ngày
```
