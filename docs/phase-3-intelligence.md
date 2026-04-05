# Phase 3: Intelligence + Tag Expansion (Tuần 5-6)

## Mục tiêu

Tag expansion loop tự động mở rộng keyword. Diff engine phát hiện thay đổi. Alert system thông báo user. HTML cache reparse khi fix parser.

## Checklist

- [ ] tagExpansionService: extract tags → queue keywords → saturation detection → sibling family
- [ ] diffService: compare snapshots (shop + search), detect changes
- [ ] alertService: tạo alerts từ diffs + trend changes
- [ ] UI: Alert panel + unread badge trên Dashboard
- [ ] UI: Dashboard — shop thay đổi mạnh nhất, top trending, recent alerts
- [ ] UI: Keyword expansion tree view (visualize seed → branches)
- [ ] UI: Snapshot history + DiffViewer (so sánh 2 thời điểm)
- [ ] HTML cache reparse command (re-run parser trên cached files)
- [ ] Data retention + HTML cache cleanup job (chạy daily)
- [ ] Export CSV

## Chi tiết triển khai

### 1. Tag Expansion Service

Tham khảo logic từ `reference/etsy-spy/scripts/auto_research.py`.

```typescript
// src/main/services/tagExpansionService.ts

class TagExpansionService {
  private GENERIC_WORDS = new Set([
    'shirt', 'tee', 'gift', 'cute', 'funny', 'vintage', 'retro',
    'comfort', 'colors', 'top', 'graphic',
  ]);

  private SUFFIX_SIBLINGS: Record<string, string[]> = {
    'shirt': ['tee', 'sweatshirt', 'hoodie'],
    'tee': ['shirt', 'sweatshirt'],
    'gift': ['shirt', 'mug', 'hoodie'],
    'mug': ['tumbler', 'cup'],
  };

  private MAX_DEPTH = 3;
  private MAX_EXPANDED_PER_SEED = 20;

  // Extract searchable keywords từ comma-separated tags
  extractSearchKeywords(tags: string): string[] {
    if (!tags) return [];
    return tags.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(tag => {
        const words = tag.split(' ');
        // Chỉ giữ 2-4 word phrases
        if (words.length < 2 || words.length > 4) return false;
        // Loại bỏ nếu TẤT CẢ words đều generic
        if (words.every(w => this.GENERIC_WORDS.has(w))) return false;
        return true;
      })
      .slice(0, 5);
  }

  // Detect khi nào cluster đã cạn
  async isClusterSaturated(keywordId: number): Promise<boolean> {
    // Lần crawl gần nhất:
    // - Có < 4 listing IDs mới (chưa có trong listing_analytics)?
    // - Hoặc <= 1 listing qualified (HOT hoặc WATCH)?
    // → Return true
  }

  // Tạo sibling queries khi cluster saturated
  buildSiblingQueries(keyword: string): string[] {
    const words = keyword.toLowerCase().split(' ');
    if (words.length < 2) return [];
    const lastWord = words[words.length - 1];
    const stem = words.slice(0, -1).join(' ');
    const siblings = this.SUFFIX_SIBLINGS[lastWord] || [];
    return siblings
      .map(s => `${stem} ${s}`)
      .filter(q => q !== keyword);
  }

  // Main: sau khi crawl + classify xong cho 1 keyword
  async processWinners(keywordId: number, analyticsData: ListingAnalytics[]): Promise<void> {
    const keyword = await getKeywordById(keywordId);
    if (!keyword.auto_expand || keyword.depth >= this.MAX_DEPTH) return;

    // Count existing expanded keywords cho seed này
    const seedId = this.findSeedId(keyword);
    const expandedCount = await countExpandedKeywords(seedId);
    if (expandedCount >= this.MAX_EXPANDED_PER_SEED) return;

    // Extract tags từ top 4 HOT/WATCH winners
    const winners = analyticsData
      .filter(a => a.trend_status === 'HOT' || a.trend_status === 'WATCH')
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, 4);

    const newKeywords: string[] = [];
    for (const winner of winners) {
      const tagKeywords = this.extractSearchKeywords(winner.tags);
      for (const kw of tagKeywords) {
        // Check chưa có trong search_keywords
        if (await keywordExists(kw)) continue;
        newKeywords.push(kw);
      }
    }

    // Insert new keywords
    for (const kw of newKeywords.slice(0, 5)) {
      await insertKeyword({
        keyword: kw,
        parent_keyword_id: keywordId,
        expansion_source: 'tag_expansion',
        source_listing_id: winners[0]?.etsy_listing_id,
        depth: keyword.depth + 1,
        auto_expand: 1,
      });
    }

    // Check saturation
    if (await this.isClusterSaturated(keywordId)) {
      await markSaturated(keywordId);
      // Tạo sibling queries
      const siblings = this.buildSiblingQueries(keyword.keyword);
      for (const sib of siblings.slice(0, 3)) {
        if (await keywordExists(sib)) continue;
        await insertKeyword({
          keyword: sib,
          parent_keyword_id: keywordId,
          expansion_source: 'sibling_family',
          depth: keyword.depth + 1,
          auto_expand: 0, // siblings không tự expand tiếp
        });
      }
    }
  }
}
```

### 2. Diff Service

```typescript
// src/main/services/diffService.ts

interface DiffResult {
  shopId?: number;
  keywordId?: number;
  changes: DiffChange[];
}

interface DiffChange {
  type: 'new_listing' | 'listing_disappeared' | 'price_change' | 'title_change'
    | 'review_spike' | 'bestseller_change' | 'position_change' | 'image_change'
    | 'trending_new_hot' | 'trending_velocity_spike' | 'trending_status_change';
  listingId?: number;
  etsyListingId: string;
  oldValue?: string;
  newValue?: string;
  severity: 'info' | 'warning' | 'important';
}

class DiffService {
  // So sánh 2 shop snapshots
  diffShopSnapshots(
    oldSnapshots: ListingSnapshot[],
    newSnapshots: ListingSnapshot[]
  ): DiffChange[] {
    const changes: DiffChange[] = [];
    const oldMap = new Map(oldSnapshots.map(s => [s.etsy_listing_id, s]));
    const newMap = new Map(newSnapshots.map(s => [s.etsy_listing_id, s]));

    // New listings
    for (const [id, snap] of newMap) {
      if (!oldMap.has(id)) {
        changes.push({ type: 'new_listing', etsyListingId: id, severity: 'important' });
      }
    }

    // Disappeared listings
    for (const [id, snap] of oldMap) {
      if (!newMap.has(id)) {
        changes.push({ type: 'listing_disappeared', etsyListingId: id, severity: 'warning' });
      }
    }

    // Changed listings
    for (const [id, newSnap] of newMap) {
      const oldSnap = oldMap.get(id);
      if (!oldSnap) continue;

      if (oldSnap.title !== newSnap.title) {
        changes.push({ type: 'title_change', etsyListingId: id,
          oldValue: oldSnap.title, newValue: newSnap.title, severity: 'info' });
      }
      if (oldSnap.price !== newSnap.price) {
        changes.push({ type: 'price_change', etsyListingId: id,
          oldValue: String(oldSnap.price), newValue: String(newSnap.price), severity: 'important' });
      }
      if ((newSnap.review_count - oldSnap.review_count) > 10) {
        changes.push({ type: 'review_spike', etsyListingId: id,
          oldValue: String(oldSnap.review_count), newValue: String(newSnap.review_count), severity: 'important' });
      }
      if (oldSnap.is_bestseller !== newSnap.is_bestseller) {
        changes.push({ type: 'bestseller_change', etsyListingId: id, severity: 'important' });
      }
      if (oldSnap.image_url !== newSnap.image_url) {
        changes.push({ type: 'image_change', etsyListingId: id, severity: 'info' });
      }
    }

    return changes;
  }

  // So sánh analytics trend changes
  diffAnalytics(
    oldAnalytics: ListingAnalytics[],
    newAnalytics: ListingAnalytics[]
  ): DiffChange[] {
    const changes: DiffChange[] = [];
    const oldMap = new Map(oldAnalytics.map(a => [a.etsy_listing_id, a]));

    for (const newA of newAnalytics) {
      const oldA = oldMap.get(newA.etsy_listing_id);
      if (!oldA && newA.trend_status === 'HOT') {
        changes.push({ type: 'trending_new_hot', etsyListingId: newA.etsy_listing_id, severity: 'important' });
      }
      if (oldA) {
        if (oldA.trend_status !== newA.trend_status && newA.trend_status !== 'SKIP') {
          changes.push({ type: 'trending_status_change', etsyListingId: newA.etsy_listing_id,
            oldValue: oldA.trend_status, newValue: newA.trend_status, severity: 'important' });
        }
        if (newA.sold_24h >= oldA.sold_24h * 2 && newA.sold_24h >= 3) {
          changes.push({ type: 'trending_velocity_spike', etsyListingId: newA.etsy_listing_id,
            oldValue: String(oldA.sold_24h), newValue: String(newA.sold_24h), severity: 'important' });
        }
      }
    }
    return changes;
  }
}
```

### 3. Alert Service

```typescript
// src/main/services/alertService.ts

class AlertService {
  // Tạo alerts từ diff changes
  async createFromDiff(diff: DiffResult): Promise<void> {
    for (const change of diff.changes) {
      await db.prepare(`
        INSERT INTO alerts (alert_type, shop_id, listing_id, keyword_id, old_value, new_value, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(change.type, diff.shopId, change.listingId, diff.keywordId,
        change.oldValue, change.newValue, change.severity);
    }
  }

  // Get unread count
  async getUnreadCount(): Promise<number>

  // Get alerts with pagination + filters
  async getAlerts(filters: AlertFilters): Promise<Alert[]>

  // Mark read
  async markRead(alertId: number): Promise<void>
  async markAllRead(): Promise<void>

  // Group alerts for display
  groupByShop(alerts: Alert[]): GroupedAlerts[]
  groupByType(alerts: Alert[]): GroupedAlerts[]
}
```

### 4. UI Components

**Alert panel** (`Alerts.tsx`):
- Unread badge count trên nav
- List alerts, grouped by shop hoặc by type
- Mark read / dismiss
- Click alert → navigate tới shop/listing detail

**Dashboard** (`Dashboard.tsx`):
- Top 5 HOT listings (by trending_score)
- Recent alerts (last 24h)
- "Shop thay đổi mạnh nhất" — shop có nhiều changes nhất
- Crawl status: running/paused, jobs in queue

**Keyword tree** (`KeywordTree.tsx`):
```
funny dad shirt (seed, depth 0, 12 listings tracked)
├── dad club shirt (tag_expansion, depth 1, 8 listings) ✅ active
│   ├── dad bod shirt (tag_expansion, depth 2, 5 listings) ✅ active
│   └── father figure tee (depth 2) [saturated] ⏸
├── new dad gift (depth 1) [saturated] ⏸
│   └── new dad shirt (sibling_family, depth 2) ✅ active
└── retro papa tee (depth 1) ✅ active
```

**DiffViewer** (`DiffViewer.tsx`):
- Side-by-side compare 2 snapshots
- Highlight: new listings (green), disappeared (red), changed fields (yellow)
- Dropdown chọn snapshot dates

**Snapshot timeline** (`SnapshotTimeline.tsx`):
- Timeline bar cho 1 shop/listing
- Click vào điểm → xem snapshot tại thời điểm đó
- Highlight điểm có alerts

### 5. HTML Cache Reparse

```typescript
// Thêm vào htmlCacheService

async reparseAll(): Promise<{ success: number; failed: number }> {
  const records = db.prepare('SELECT * FROM html_cache WHERE parse_status IN (?, ?)').all('error', 'parsed');
  let success = 0, failed = 0;
  for (const record of records) {
    try {
      const html = await fs.readFile(record.file_path, 'utf-8');
      const data = parserService.parseShopIndex(html); // or parseSearchIndex
      // Update snapshots in DB
      db.prepare('UPDATE html_cache SET parse_status=?, parsed_at=?, listings_found=? WHERE id=?')
        .run('parsed', new Date().toISOString(), data.listings.length, record.id);
      success++;
    } catch (error) {
      db.prepare('UPDATE html_cache SET parse_status=?, parse_error=? WHERE id=?')
        .run('error', error.message, record.id);
      failed++;
    }
  }
  return { success, failed };
}
```

### 6. Data Retention + Cleanup

```typescript
// src/main/services/cleanupService.ts

class CleanupService {
  // Chạy daily (schedule via schedulerService)
  async runDailyCleanup(): Promise<CleanupReport> {
    const report = {
      htmlCacheDeleted: await htmlCacheService.cleanup(),
      oldSnapshotsArchived: await archiveOldSnapshots(90),
      readAlertsDeleted: await deleteReadAlerts(30),
      burnedProfilesCleaned: await profileService.cleanupProfiles(),
      completedJobsDeleted: await deleteOldJobs(30),
    };
    logger.info('Daily cleanup completed', report);
    return report;
  }
}
```

### 7. Export CSV

```typescript
// src/main/services/exportService.ts

class ExportService {
  // Export all HOT/WATCH listings
  async exportTrending(filters?: ExportFilters): Promise<string> {
    // Query listing_analytics JOIN listings
    // Format as CSV
    // Save to user-chosen path (dialog.showSaveDialog)
  }

  // Export shop history
  async exportShopHistory(shopId: number): Promise<string>

  // Export keyword results
  async exportKeywordResults(keywordId: number): Promise<string>
}
```

## Deliverable cuối Phase 3

- Tag expansion tự động mở rộng keyword từ tags winners
- Diff engine phát hiện mọi thay đổi giữa snapshots
- Alerts thông báo khi có thay đổi quan trọng
- Dashboard tổng hợp trending + alerts + shop changes
- Keyword tree hiển thị expansion history
- Reparse HTML cache khi fix parser
- Data cleanup chạy tự động
- Export CSV hoạt động
