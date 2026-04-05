# Phase 2: Crawl Engine + HTML Cache + VK1ng (Tuần 3-4)

## Mục tiêu

Crawl engine hoàn chỉnh: Playwright crawl → lưu HTML → parse từ file → gọi VK1ng API → classify trend → lưu DB. User nhìn thấy listing data + trend badges trên UI.

## Checklist

- [ ] htmlCacheService: save/read/manage/cleanup HTML files
- [ ] browserService: profile management (create/burn/cleanup) + proxy rotation
- [ ] profileService: quản lý browser profiles
- [ ] proxyService: quản lý proxy pool
- [ ] parserService: parse shop index + search index TỪ FILE HTML
- [ ] vkingService: single/bulk analytics API calls + subscription check
- [ ] trendService: qualification rules + trending score + classification
- [ ] crawlService: orchestrate full flow (cache-check → crawl → save HTML → parse → VK1ng → classify)
- [ ] schedulerService: auto queue jobs theo interval
- [ ] Block detection + auto profile rotation
- [ ] UI: Shop detail page — listing list + trend badges (HOT/WATCH/SKIP)
- [ ] UI: Keyword tracking page — search results with analytics
- [ ] UI: TrendingBoard — bảng xếp hạng HOT/WATCH listings

## Chi tiết triển khai

### 1. HTML Cache Service

```typescript
// src/main/services/htmlCacheService.ts

class HtmlCacheService {
  private cacheDir: string; // app.getPath('userData') + '/html_cache'

  // Lưu HTML file + ghi record vào DB
  async saveHtml(params: {
    pageType: 'shop_index' | 'search_index' | 'tag_index';
    targetId: number;
    targetName: string;
    pageNumber: number;
    htmlContent: string;
    crawlJobId: number;
  }): Promise<HtmlCacheRecord> {
    // 1. Tạo thư mục: html_cache/{pageType}/{targetName_slug}/
    // 2. Filename: {YYYY-MM-DD_HHmmss}_page{n}.html
    // 3. Write file
    // 4. Insert record vào bảng html_cache
    // 5. Return record
  }

  // Check có cache còn valid không (< maxAgeHours)
  async getValidCache(
    pageType: string,
    targetName: string,
    maxAgeHours: number
  ): Promise<HtmlCacheRecord | null>

  // Đọc HTML content từ file
  async readHtml(cacheId: number): Promise<string>

  // Re-parse (dùng ở Phase 3)
  async reparse(cacheId: number): Promise<ParseResult>

  // Cleanup expired files
  async cleanup(): Promise<{ deleted: number; freedBytes: number }>

  // Stats
  async getStats(): Promise<CacheStats>
}
```

### 2. Browser Service + Profile + Proxy

```typescript
// src/main/services/browserService.ts

class BrowserService {
  // Launch persistent context cho 1 crawl session
  async launchContext(profileId: string, proxyUrl?: string): Promise<BrowserContext>

  // Close context
  async closeContext(ctx: BrowserContext): Promise<void>
}

// src/main/services/profileService.ts

class ProfileService {
  // Tạo profile mới (UUID + thư mục mới trong profiles/)
  async createProfile(proxyId?: string): Promise<BrowserProfile>

  // Lấy profile active ít dùng nhất
  async getAvailableProfile(): Promise<BrowserProfile>

  // Đánh dấu burned
  async burnProfile(profileId: string, reason: string): Promise<void>

  // Tăng request count
  async incrementRequests(profileId: string): Promise<void>

  // Cleanup burned profiles > 30 ngày
  async cleanupProfiles(): Promise<void>
}

// src/main/services/proxyService.ts

class ProxyService {
  // Format proxy URL: protocol://user:pass@host:port
  formatProxyUrl(proxy: Proxy): string

  // Lấy proxy active, ưu tiên fail_count thấp
  getNextProxy(): Proxy | null

  // Đánh dấu fail
  markFailed(proxyId: string): void

  // Test connectivity
  async testProxy(proxyId: string): Promise<boolean>
}
```

### 3. Parser Service

Parse listing data TỪ FILE HTML (không từ live DOM).

```typescript
// src/main/services/parserService.ts

class ParserService {
  // Parse shop index HTML → ShopIndexData
  parseShopIndex(html: string): ShopIndexData {
    // Strategy 1: data-listing-id attributes
    // Strategy 2: JSON-LD / structured data
    // Strategy 3: DOM selectors (h3.v2-listing-card__title, img)
    // Strategy 4: Regex fallback
    // Merge + deduplicate
  }

  // Parse search index HTML → SearchIndexData
  parseSearchIndex(html: string, keyword: string): SearchIndexData {
    // Tương tự shop nhưng extract shopName cho mỗi listing
  }

  // Extract tất cả listing IDs từ HTML (regex-based, nhanh)
  extractListingIds(html: string): string[] {
    const ids = new Set<string>();
    const patterns = [
      /data-listing-id=["']?(\d{6,})/g,
      /\/listing\/(\d{6,})/g,
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        ids.add(match[1]);
      }
    }
    return Array.from(ids);
  }
}
```

**Tham khảo**: `reference/etsy-spy/scripts/etsy_search.py` function `_extract_listing_details()` cho DOM selectors.

### 4. VK1ng Service

```typescript
// src/main/services/vkingService.ts

class VkingService {
  private baseUrl: string;
  private apiKey: string;
  private batchSize: number = 50;

  // Lấy analytics 1 listing
  async getListing(listingId: string): Promise<VkingListingData | null>

  // Bulk: max 50 IDs per request, auto-batch nếu nhiều hơn
  async getBulkListings(listingIds: string[]): Promise<VkingListingData[]> {
    const results: VkingListingData[] = [];
    for (let i = 0; i < listingIds.length; i += this.batchSize) {
      const batch = listingIds.slice(i, i + this.batchSize);
      const idsStr = batch.join(',');
      const resp = await fetch(`${this.baseUrl}/bulk/listings/${idsStr}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      const data = await resp.json();
      if (data.status) results.push(...data.data);
    }
    return results;
  }

  // Check subscription health
  async checkSubscription(): Promise<VkingSubscriptionStatus>

  // Pre-dedupe: loại IDs đã có analytics < cacheHours
  async filterNewIds(listingIds: string[], cacheHours: number): Promise<string[]> {
    // Query listing_analytics WHERE etsy_listing_id IN (...)
    // AND fetched_at > datetime('now', '-{cacheHours} hours')
    // Return IDs not in cache
  }
}
```

**Tham khảo**: `reference/etsy-spy/scripts/etsy_analytics.py` và `etsy_search.py` function `get_bulk_analytics()`.

### 5. Trend Service

```typescript
// src/main/services/trendService.ts

class TrendService {
  // 5 qualification rules (tham khảo qualification_helper.py)
  isQualified(metrics: {
    sold_24h: number;
    views_24h: number;
    hey_score: number;
    days_old: number;
  }): QualificationResult {
    const rules = {
      rule_1_sold_ge_2:       metrics.sold_24h >= 2,
      rule_2_views_ge_120:    metrics.views_24h >= 120,
      rule_3_views_80_hey_8:  metrics.views_24h >= 80 && metrics.hey_score >= 8,
      rule_4_new_hey_views:   metrics.days_old <= 30 && metrics.hey_score >= 10 && metrics.views_24h >= 40,
      rule_5_sold_3_age_90:   metrics.sold_24h >= 3 && metrics.days_old <= 90,
    };
    const qualified = Object.values(rules).some(v => v);
    const reasons = Object.entries(rules).filter(([,v]) => v).map(([k]) => k);
    return { qualified, reasons, rules };
  }

  // Classify: HOT / WATCH / SKIP
  classifyTrend(data: VkingListingData): TrendStatus {
    const sold = data.sold || 0;
    const days = data.original_creation_days || 999;
    if (sold >= 3 && days <= 60) return 'HOT';
    if (this.isQualified({
      sold_24h: sold,
      views_24h: data.views_24h || 0,
      hey_score: data.hey || 0,
      days_old: days,
    }).qualified) return 'WATCH';
    return 'SKIP';
  }

  // Trending score = (sold_24h × 10) + (views_24h / 10) + (cr × 2)
  calculateScore(data: VkingListingData): number {
    return ((data.sold || 0) * 10) + ((data.views_24h || 0) / 10) + ((data.cr || 0) * 2);
  }

  // Process batch: classify + save to listing_analytics
  async processBatch(listings: VkingListingData[], crawlJobId: number): Promise<void>
}
```

### 6. Crawl Service (Orchestrator)

```typescript
// src/main/services/crawlService.ts

class CrawlService {
  // Full flow cho shop
  async crawlShop(shopId: number): Promise<CrawlResult> {
    // 1. Check HTML cache: có file valid không?
    const cache = await htmlCacheService.getValidCache('shop_index', shopName, cacheTTL);
    if (cache) {
      // Parse từ cache, skip crawl live
      return await this.parseAndProcess(cache, 'shop_index', shopId);
    }

    // 2. Get available profile + proxy
    const profile = await profileService.getAvailableProfile();
    const proxy = proxyService.getNextProxy();

    // 3. Create crawl job record
    const job = await createCrawlJob('shop_index', shopId, profile.id, proxy?.id);

    // 4. Launch browser
    const ctx = await browserService.launchContext(profile.id, proxy ? proxyService.formatProxyUrl(proxy) : undefined);
    const page = ctx.pages[0] || await ctx.newPage();

    try {
      // 5. Navigate + random delay
      await page.goto(shopUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanize.randomDelay(3000, 8000);

      // 6. Block detection
      if (await isBlocked(page)) {
        await profileService.burnProfile(profile.id, 'blocked on shop page');
        throw new BlockedError(shopName);
      }

      // 7. Scroll to trigger lazy load
      await humanize.scrollPage(page);

      // 8. Save HTML
      const html = await page.content();
      const cacheRecord = await htmlCacheService.saveHtml({
        pageType: 'shop_index',
        targetId: shopId,
        targetName: shopName,
        pageNumber: 1,
        htmlContent: html,
        crawlJobId: job.id,
      });

      // 9. Parse from HTML file
      const data = await this.parseAndProcess(cacheRecord, 'shop_index', shopId);

      // 10. Pagination (nếu cần)
      // ... respect rate limits, lưu mỗi page 1 HTML file

      // 11. Fetch VK1ng analytics cho listing IDs mới
      const listingIds = data.listings.map(l => l.etsyListingId);
      const newIds = await vkingService.filterNewIds(listingIds, 24);
      if (newIds.length > 0) {
        const analytics = await vkingService.getBulkListings(newIds);
        await trendService.processBatch(analytics, job.id);
      }

      // 12. Update job status
      await updateCrawlJob(job.id, 'completed');

      return data;
    } catch (error) {
      await updateCrawlJob(job.id, error instanceof BlockedError ? 'blocked' : 'failed', error.message);
      throw error;
    } finally {
      await browserService.closeContext(ctx);
      await profileService.incrementRequests(profile.id);
    }
  }

  // Tương tự cho search
  async crawlSearch(keywordId: number): Promise<CrawlResult>
}
```

### 7. Scheduler Service

```typescript
// src/main/services/schedulerService.ts

class SchedulerService {
  private queue: CrawlJob[] = [];
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  // Start: check mỗi 60 giây
  start(): void {
    this.timer = setInterval(() => this.checkDueJobs(), 60_000);
  }

  // Check shop/keyword nào đến lịch
  async checkDueJobs(): Promise<void> {
    // Query shops WHERE status='active'
    // AND (last_crawled IS NULL OR last_crawled < now - crawl_interval)
    // ORDER BY priority DESC, overdue DESC
    // Tương tự cho search_keywords
  }

  // Process queue tuần tự (v1: 1 job tại 1 thời điểm)
  async processNext(): Promise<void> {
    if (this.isPaused || this.queue.length === 0) return;
    const job = this.queue.shift();
    await crawlService.crawlShop(job.targetId); // or crawlSearch
  }

  // Pause: khi bị block liên tiếp
  async pause(minutes: number): Promise<void>
  async resume(): Promise<void>
}
```

### 8. Block detection

```typescript
async function isBlocked(page: Page): Promise<boolean> {
  const url = page.url();
  const title = await page.title();
  const content = await page.textContent('body').catch(() => '');

  return (
    url.includes('captcha') ||
    url.includes('blocked') ||
    title.includes('Access Denied') ||
    title.includes('Please verify') ||
    content.includes('unusual traffic') ||
    content.includes('not a robot')
  );
}
```

### 9. UI Updates

**Shop Detail page** (`ShopDetail.tsx`):
- Shop header: name, total sales, reviews, admirers
- Listing grid/table: mỗi listing hiện ảnh, title, price, trend badge (HOT/WATCH/SKIP)
- Analytics panel: sold_24h, views_24h, hey_score, trending_score
- Last crawled timestamp + "Crawl Now" button

**TrendingBoard page** (`TrendingBoard.tsx`):
- Bảng xếp hạng: tất cả HOT/WATCH listings, sort by trending_score
- Filter: by shop, by keyword, by trend_status
- Columns: listing, shop, price, sold_24h, views_24h, hey_score, score, status, first_seen

## Deliverable cuối Phase 2

- Crawl shop/search hoạt động end-to-end
- HTML files được lưu và parse được
- VK1ng API trả về metrics, listings được classify HOT/WATCH/SKIP
- Scheduler tự chạy crawl theo lịch
- UI hiển thị listings với trend badges
- Block detection + auto profile rotation hoạt động
