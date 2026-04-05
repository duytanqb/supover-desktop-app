# Multi-Agent Build Prompt — Etsy Spy Desktop App

## Hướng dẫn sử dụng

Copy prompt bên dưới vào Claude Code terminal. Prompt này sẽ yêu cầu Claude Code tạo **6 agent chạy song song** để build toàn bộ app trong 1 session.

---

## PROMPT (copy từ đây)

```
Tôi cần bạn build app Etsy Spy Desktop — một Electron app theo dõi shop/listing trên Etsy cho đội ngũ POD ~100 người. Toàn bộ docs đã có trong folder `docs/` và `CLAUDE.md`. Reference Python code đã proven nằm trong `reference/etsy-spy/`.

QUAN TRỌNG: Đọc KỸ các file sau trước khi code:
- CLAUDE.md (tổng quan + nguyên tắc tuyệt đối)
- docs/architecture.md (kiến trúc + IPC channels + cấu trúc code)
- docs/database.md (schema tất cả bảng)
- docs/phase-1-foundation.md
- docs/phase-2-crawl-engine.md
- docs/phase-3-intelligence.md
- docs/phase-4-ai-polish.md

Tham khảo logic từ reference Python scripts:
- reference/etsy-spy/scripts/etsy_search.py — DOM selectors, parse listing
- reference/etsy-spy/scripts/etsy_analytics.py — VK1ng API integration
- reference/etsy-spy/scripts/auto_research.py — tag expansion loop
- reference/etsy-spy/scripts/keyword_discovery.py — autocomplete, tag expansion
- reference/etsy-spy/scripts/qualification_helper.py — 5 qualification rules

## YÊU CẦU: Chạy 6 Agent song song

Hãy tạo 6 agent chạy ĐỒNG THỜI trong các git worktree riêng biệt. Sau khi tất cả hoàn thành, merge code lại.

---

### AGENT 1: Foundation & Project Setup
**Worktree: yes | Branch: feat/foundation**

Nhiệm vụ:
1. Đọc CLAUDE.md + docs/architecture.md + docs/phase-1-foundation.md + docs/database.md
2. Khởi tạo project:
   - package.json với tất cả dependencies (electron, better-sqlite3, react, react-dom, playwright, vite, typescript, winston, uuid, react-router-dom, react-window, tailwindcss)
   - tsconfig.json (strict mode, ESM, paths alias)
   - electron-builder.yml (Mac + Windows config)
   - vite.config.ts (React + Electron renderer)
   - .gitignore (profiles/, html_cache/, data/, logs/, node_modules/, dist/)
3. Electron main process entry: src/main/main.ts
   - Tạo BrowserWindow, load Vite dev server khi dev / file khi production
   - Register tất cả IPC handlers
   - Init database on app ready
   - Init scheduler on app ready
4. SQLite database service: src/main/services/db.ts
   - Connection setup với WAL mode + foreign keys
   - Migration runner (version table)
   - Tạo TẤT CẢ bảng từ docs/database.md (shops, shop_snapshots, listings, listing_snapshots, listing_analytics, html_cache, search_keywords, search_snapshots, crawl_jobs, browser_profiles, proxies, alerts, ai_insights, settings)
   - Seed default settings
5. Preload script cho IPC bridge (contextBridge + ipcRenderer)
6. Logger utility: src/main/utils/logger.ts (Winston, file + console transport)
7. Shared constants: src/shared/constants/ipcChannels.ts (TẤT CẢ IPC channels từ architecture.md)
8. Shared constants: src/shared/constants/crawlLimits.ts

Deliverable: `npm run dev` phải mở được Electron window, DB tạo được tất cả bảng, IPC bridge hoạt động.

---

### AGENT 2: Shared Types & All IPC Handlers
**Worktree: yes | Branch: feat/types-ipc**

Nhiệm vụ:
1. Đọc docs/architecture.md + docs/database.md (để biết schema → types)
2. Tạo TẤT CẢ shared types trong src/shared/types/:
   - shop.ts: Shop, ShopSnapshot, ShopWithLatest
   - listing.ts: Listing, ListingSnapshot, ListingWithAnalytics
   - snapshot.ts: SearchSnapshot
   - analytics.ts: VkingListingData, VkingSubscriptionStatus, TrendStatus, QualificationResult, ListingAnalytics
   - alert.ts: Alert, AlertType, AlertSeverity, AlertFilters, GroupedAlerts
   - crawlJob.ts: CrawlJob, CrawlJobStatus, CrawlResult
   - proxy.ts: Proxy, ProxyProtocol
   - aiInsight.ts: AIInsight, AIInsightType
   - htmlCache.ts: HtmlCacheRecord, CacheStats, ParseResult
   - keyword.ts: SearchKeyword, ExpansionSource
   - browserProfile.ts: BrowserProfile, ProfileStatus
   - settings.ts: AppSettings, SettingsKey
   - ipc.ts: IPCResponse<T> = { success: boolean; data?: T; error?: string }
3. Tạo TẤT CẢ IPC handlers trong src/main/ipc/:
   - shopHandlers.ts: shop:list, shop:get, shop:add, shop:update, shop:delete, shop:crawl-now
   - keywordHandlers.ts: keyword:list, keyword:add, keyword:update, keyword:delete, keyword:crawl-now
   - crawlHandlers.ts: crawl:status, crawl:pause, crawl:resume, crawl:history
   - snapshotHandlers.ts: snapshot:shop-history, snapshot:listing-history, snapshot:search-history
   - alertHandlers.ts: alert:list, alert:mark-read, alert:mark-all-read, alert:count-unread
   - analyticsHandlers.ts: analytics:fetch, analytics:trending, analytics:dashboard, analytics:api-status, analytics:qualification, analytics:history
   - htmlCacheHandlers.ts: html-cache:list, html-cache:get, html-cache:reparse, html-cache:reparse-all, html-cache:cleanup, html-cache:stats
   - expansionHandlers.ts: expansion:tree, expansion:queue, expansion:approve, expansion:reject, expansion:saturate
   - aiHandlers.ts: ai:analyze-shop, ai:analyze-keyword, ai:suggest-keywords, ai:insights-list
   - proxyHandlers.ts: proxy:list, proxy:add, proxy:remove, proxy:test
   - profileHandlers.ts: profile:list, profile:status
   - settingsHandlers.ts: settings:get, settings:update
   - index.ts: registerAllHandlers() function
4. Mọi handler phải: validate input, try/catch, return IPCResponse<T>, log errors

Deliverable: Tất cả types compile clean. Tất cả IPC handlers registered và callable (trả mock data OK).

---

### AGENT 3: Crawl Engine (Browser + HTML Cache + Parser)
**Worktree: yes | Branch: feat/crawl-engine**

Nhiệm vụ:
1. Đọc docs/phase-2-crawl-engine.md + CLAUDE.md (nguyên tắc tuyệt đối) + reference scripts
2. Tham khảo reference/etsy-spy/scripts/etsy_search.py cho DOM selectors
3. Implement các services:

**browserService.ts:**
- launchPersistentContext(profilePath, proxyUrl?) → BrowserContext
- closeContext()
- isBlocked(page) → boolean (check captcha, access denied, unusual traffic)
- Stealth: disable-blink-features, viewport 1920x1080, locale en-US

**profileService.ts:**
- createProfile(proxyId?) → tạo UUID dir trong profiles/
- getAvailableProfile() → profile active ít request nhất
- burnProfile(profileId, reason)
- incrementRequests(profileId)
- cleanupProfiles() → xóa burned > 30 ngày

**proxyService.ts:**
- formatProxyUrl(proxy) → protocol://user:pass@host:port
- getNextProxy() → proxy active, fail_count thấp nhất
- markFailed(proxyId)
- testProxy(proxyId) → boolean

**htmlCacheService.ts:**
- saveHtml(pageType, targetId, targetName, pageNumber, html, crawlJobId) → lưu file + DB record
- getValidCache(pageType, targetName, maxAgeHours)
- readHtml(cacheId)
- cleanup() → xóa expired files
- getStats()
- File structure: html_cache/{pageType}/{targetName_slug}/{YYYY-MM-DD_HHmmss}_page{n}.html

**parserService.ts:**
- parseShopIndex(html) → { shopInfo, listings[] }
  - Strategy 1: data-listing-id attributes
  - Strategy 2: JSON-LD structured data
  - Strategy 3: DOM selectors (tham khảo etsy_search.py _extract_listing_details)
  - Strategy 4: Regex fallback
  - Merge + deduplicate
- parseSearchIndex(html, keyword) → { listings[] with shopName }
- extractListingIds(html) → string[] (regex: data-listing-id, /listing/\d+)

**humanize.ts (utils):**
- randomDelay(min, max) → Promise (random sleep)
- scrollPage(page) → scroll xuống từ từ để trigger lazy load
- randomMouseMove(page)

**crawlService.ts (orchestrator):**
- crawlShop(shopId): cache check → get profile/proxy → launch browser → navigate → check block → scroll → save HTML → parse from file → fetch VK1ng → classify trend → save DB → create diffs → create alerts
- crawlSearch(keywordId): tương tự cho search page, multi-page (max_pages)
- Pagination: respect rate limits, random delay giữa pages
- Error handling: BlockedError → burn profile, RetryableError → retry max 2

NGUYÊN TẮC BẮT BUỘC (từ CLAUDE.md):
- KHÔNG crawl listing detail page
- Luôn save HTML TRƯỚC khi parse
- Parse từ FILE, không từ live DOM
- Check block status trước khi lưu
- Random delay 3-8s giữa navigations
- Max 60 page views/profile/giờ

Deliverable: crawlService.crawlShop() và crawlSearch() hoạt động end-to-end. HTML files được lưu đúng cấu trúc.

---

### AGENT 4: VK1ng API + Trend Engine + Scheduler
**Worktree: yes | Branch: feat/analytics-engine**

Nhiệm vụ:
1. Đọc docs/phase-2-crawl-engine.md (VK1ng + Trend sections) + docs/phase-3-intelligence.md (Tag Expansion + Diff + Alert)
2. Tham khảo:
   - reference/etsy-spy/scripts/etsy_analytics.py → VK1ng API calls
   - reference/etsy-spy/scripts/qualification_helper.py → 5 rules
   - reference/etsy-spy/scripts/auto_research.py → tag expansion
   - reference/etsy-spy/TRENDING_RULES.md → qualification rules chi tiết

**vkingService.ts:**
- getListing(listingId) → VkingListingData
- getBulkListings(listingIds[]) → auto-batch 50 IDs per request
- checkSubscription() → status
- filterNewIds(listingIds, cacheHours) → IDs chưa có analytics gần đây
- Rate limit: respect API limits
- Error handling: 401 → alert invalid key, 429 → backoff

**trendService.ts:**
- isQualified(metrics) → QualificationResult (5 rules từ qualification_helper.py):
  - Rule 1: sold_24h >= 2
  - Rule 2: views_24h >= 120
  - Rule 3: views_24h >= 80 AND hey_score >= 8
  - Rule 4: days_old <= 30 AND hey_score >= 10 AND views_24h >= 40
  - Rule 5: sold_24h >= 3 AND days_old <= 90
- classifyTrend(data) → HOT | WATCH | SKIP
- calculateScore(data) → (sold*10) + (views/10) + (cr*2)
- processBatch(listings, crawlJobId) → classify + save to listing_analytics

**tagExpansionService.ts:**
- extractSearchKeywords(tags) → filter 2-4 word phrases, loại generic words
- isClusterSaturated(keywordId) → < 4 new IDs hoặc <= 1 qualified
- buildSiblingQueries(keyword) → swap suffix (shirt→tee/hoodie, mug→tumbler)
- processWinners(keywordId, analyticsData) → extract tags winners → insert new keywords
- Limits: MAX_DEPTH=3, MAX_EXPANDED_PER_SEED=20

**diffService.ts:**
- diffShopSnapshots(old[], new[]) → DiffChange[] (new, disappeared, price, title, review spike, bestseller, image)
- diffAnalytics(old[], new[]) → DiffChange[] (new_hot, status_change, velocity_spike)

**alertService.ts:**
- createFromDiff(diffResult) → insert alerts
- getUnreadCount()
- getAlerts(filters) → with pagination
- markRead(id), markAllRead()
- groupByShop(), groupByType()

**schedulerService.ts:**
- start() → check mỗi 60s
- checkDueJobs() → query shops/keywords đến lịch crawl
- processNext() → tuần tự, 1 job tại 1 thời điểm
- pause(minutes), resume()
- Auto-pause khi 3 profile liên tiếp bị block

**cleanupService.ts:**
- runDailyCleanup(): html 7d, snapshots 90d, read alerts 30d, burned profiles 30d, old jobs 30d

**exportService.ts:**
- exportTrending(filters) → CSV
- exportShopHistory(shopId) → CSV
- exportKeywordResults(keywordId) → CSV

Deliverable: VK1ng fetch + trend classify + tag expansion + diff + alerts đều hoạt động. Scheduler auto-queue jobs.

---

### AGENT 5: React UI — All Pages & Components
**Worktree: yes | Branch: feat/ui**

Nhiệm vụ:
1. Đọc docs/architecture.md (UI sections) + docs/phase-1,2,3,4 (UI requirements từ mỗi phase)
2. Setup React renderer:
   - src/renderer/index.html
   - src/renderer/main.tsx (React entry, BrowserRouter)
   - src/renderer/App.tsx (layout + routing)
   - Tailwind CSS setup (dark theme default)
   - React Router: /, /trending, /shops, /shops/:id, /keywords, /alerts, /ai-insights, /settings

3. Hooks:
   - useIPC<T>(channel) → { invoke, data, loading, error }
   - usePolling<T>(channel, interval) → auto-refresh data

4. Pages (tất cả dùng Tailwind, dark theme):

**Dashboard.tsx:**
- Quick stats cards: total shops, keywords, HOT listings, unread alerts
- Top 5 HOT listings (trending_score) với TrendBadge
- Recent 10 alerts grouped by severity
- Top 3 shops thay đổi mạnh nhất 24h
- Crawl status: running/paused, jobs in queue
- Latest AI insight snippet

**TrendingBoard.tsx:**
- Table ranking HOT/WATCH listings, sort by trending_score
- Columns: listing image+title, shop, price, sold_24h, views_24h, hey_score, score, status badge
- Filters: by shop, keyword, trend_status
- Pagination

**ShopList.tsx:**
- Form thêm shop (URL/name, priority, notes)
- Table: shop name, status badge, priority, last crawled, total listings, actions
- Actions: crawl now, pause/resume, edit, archive
- Search/filter

**ShopDetail.tsx:**
- Shop header: name, sales, reviews, admirers, last crawled
- "Crawl Now" + "AI Analyze" buttons
- Listing grid/table: image, title, price, trend badge, sold_24h, views_24h
- Analytics panel cho selected listing
- Snapshot timeline

**SearchTracker.tsx (Keyword tracking):**
- Form thêm keyword (keyword, category, max pages, auto-expand toggle)
- Table: keyword, source badge, depth, status, last crawled, HOT/WATCH count
- Click keyword → search results list + analytics
- Keyword expansion tree view (KeywordTree component)

**Alerts.tsx:**
- List alerts grouped by shop hoặc type (toggle)
- Severity badges (info/warning/important)
- Mark read / Mark all read
- Click → navigate to shop/listing
- Unread count badge trong nav

**AIInsights.tsx:**
- List insights sorted by date
- Filter by type (shop_summary, keyword_suggestion, niche_discovery)
- Pin/unpin
- "Analyze Now" trigger buttons
- Insight card: type badge, markdown content, timestamp

**Settings.tsx:**
- VK1ng API Key (password input + test button + status badge)
- AI Provider dropdown (anthropic/openai) + API Key + Model
- Default crawl interval dropdown
- Proxy config (add/remove/test proxies table)
- Profile management (list profiles, status badges)
- Theme toggle (dark/light)
- HTML cache stats + cleanup button
- Data retention settings

5. Components:
- ShopCard.tsx
- ListingCard.tsx (image, title, price, trend badge)
- TrendBadge.tsx (🔥 HOT / ⚠️ WATCH / ❌ SKIP)
- AnalyticsPanel.tsx (metrics display)
- AlertItem.tsx
- DiffViewer.tsx (side-by-side compare, color-coded changes)
- KeywordTree.tsx (tree visualization: seed → branches, expand/collapse)
- SnapshotTimeline.tsx (timeline bar, clickable points)
- ProxyStatus.tsx
- Sidebar/Nav component

6. Styles: src/renderer/styles/global.css (Tailwind + custom dark theme variables)

Deliverable: Tất cả pages render đúng, navigation hoạt động, IPC hooks call được (dù data trả về empty). Dark theme đẹp, responsive.

---

### AGENT 6: AI Service + Onboarding + Polish
**Worktree: yes | Branch: feat/ai-polish**

Nhiệm vụ:
1. Đọc docs/phase-4-ai-polish.md

**aiService.ts:**
- Support Anthropic + OpenAI APIs
- analyzeShop(shopId) → fetch shop data + diffs + analytics → prompt AI → save insight
- analyzeKeyword(keywordId) → fetch search data + analytics → prompt AI → save insight
- suggestKeywords(seed, existingTags) → AI suggest 10 new keywords → return JSON array
- callAPI(prompt, provider) → handle both Anthropic and OpenAI formats
- Cost control: chỉ gọi khi có alert important, cache insight hash, batch khi possible
- Error handling: invalid key, rate limit, timeout

**Onboarding flow:**
- src/renderer/pages/Onboarding.tsx
- Step 1: Welcome screen
- Step 2: VK1ng API key input + test
- Step 3: AI API key (optional) + test
- Step 4: Add first shop hoặc keyword
- Step 5: Trigger first crawl + show results
- Detect first-run (check settings table)
- Skip option

**Performance optimization:**
- react-window cho listing tables > 100 items
- Image lazy loading
- IPC debounce (không gọi quá nhanh khi filter/search)
- DB queries: LIMIT + OFFSET cho mọi list

**Error handling polish:**
- User-friendly error messages (không show stack trace)
- "Etsy đang block, đã tự tạo profile mới" style messages
- API key validation UI (test button + status badge)
- Offline mode: browse cached data khi không có internet
- Toast/notification system cho alerts

**shopService.ts** (CRUD helper cho các service khác dùng):
- getShopWithSnapshots(shopId)
- getShopAnalytics(shopId)
- getRecentDiffs(shopId)

Deliverable: AI analyze hoạt động, onboarding flow complete, error messages user-friendly, performance smooth.

---

## SAU KHI 6 AGENT HOÀN THÀNH

Merge tất cả branches theo thứ tự:
1. feat/foundation (base)
2. feat/types-ipc (merge vào foundation)
3. feat/crawl-engine
4. feat/analytics-engine
5. feat/ui
6. feat/ai-polish

Sau khi merge:
- Chạy `npm install`
- Chạy `npx tsc --noEmit` → fix mọi type errors
- Chạy `npm run dev` → verify app mở được
- Test IPC: thêm 1 shop, check DB
- Verify tất cả pages render đúng

Fix mọi conflicts và type errors cho đến khi app chạy được hoàn chỉnh.
```

---

## Ghi chú cho Tan

**Thứ tự merge quan trọng**: Agent 1 (foundation) phải merge trước vì các agent khác depend vào project structure + DB + types.

**Nếu muốn chạy từng phase**: Có thể chỉ chạy Agent 1+2+5 trước (foundation + types + UI), rồi chạy Agent 3+4+6 sau khi verify Phase 1 OK.

**Ước tính thời gian**: Với 6 agent song song, toàn bộ code generation mất khoảng 15-25 phút. Merge + fix conflicts thêm 10-15 phút.

**Dependencies giữa agents**:
```
Agent 1 (Foundation) ──┐
Agent 2 (Types/IPC) ───┤── Independent, merge theo thứ tự
Agent 3 (Crawl) ───────┤
Agent 4 (Analytics) ───┤
Agent 5 (UI) ──────────┤
Agent 6 (AI/Polish) ───┘
```

Tất cả agents đọc docs để tự hiểu context, không depend vào output của nhau trong lúc chạy. Conflicts resolve khi merge.
