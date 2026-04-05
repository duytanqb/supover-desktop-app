# Phase 4: AI & Polish (Tuần 7-8)

## Mục tiêu

AI insights cho shop/keyword analysis. Dashboard hoàn chỉnh. Đóng gói app cho Mac + Windows.

## Checklist

- [ ] aiService: shop analysis, keyword trends, niche discovery
- [ ] AI keyword expansion suggestions (bổ sung cho tag expansion)
- [ ] UI: AI Insights panel — saved insights, trigger analysis
- [ ] Dashboard hoàn chỉnh: "shop thay đổi mạnh nhất", "listing trending", quick stats
- [ ] electron-builder: đóng gói .dmg (Mac) + .exe (Windows)
- [ ] Performance optimization: lazy loading, pagination, virtual lists
- [ ] Error handling polish: user-friendly error messages, retry logic
- [ ] Onboarding flow: first-run wizard (setup API keys, add first shop)

## Chi tiết triển khai

### 1. AI Service

```typescript
// src/main/services/aiService.ts

class AIService {
  private provider: 'anthropic' | 'openai';
  private apiKey: string;
  private model: string;

  // Shop analysis — trigger sau crawl có changes quan trọng
  async analyzeShop(shopId: number): Promise<AIInsight> {
    const shopData = await getShopWithSnapshots(shopId);
    const diffs = await getRecentDiffs(shopId);
    const analytics = await getShopAnalytics(shopId);

    const prompt = `
Dưới đây là data snapshot của shop "${shopData.shop_name}" trên Etsy.

Snapshot trước: ${JSON.stringify(shopData.previousSnapshot)}
Snapshot mới: ${JSON.stringify(shopData.latestSnapshot)}
Thay đổi phát hiện: ${JSON.stringify(diffs)}
Top listings analytics: ${JSON.stringify(analytics.slice(0, 10))}

Hãy phân tích ngắn gọn (tiếng Việt):
1. Shop đang đẩy mạnh niche nào?
2. Listing nào đáng chú ý nhất và tại sao?
3. Có dấu hiệu thay đổi chiến lược giá không?
4. Keyword nào đang được shop ưu tiên trong title?
5. Gợi ý cho seller POD muốn cạnh tranh trong niche này.
    `;

    const response = await this.callAPI(prompt);
    return await this.saveInsight({
      insight_type: 'shop_summary',
      shop_id: shopId,
      content: response,
      data_context: JSON.stringify({ diffs, analyticsCount: analytics.length }),
      model_used: this.model,
    });
  }

  // Keyword trend analysis
  async analyzeKeyword(keywordId: number): Promise<AIInsight> {
    const keyword = await getKeywordById(keywordId);
    const searchData = await getSearchSnapshots(keywordId, { limit: 50 });
    const analytics = await getKeywordAnalytics(keywordId);

    const prompt = `
Kết quả search Etsy cho keyword "${keyword.keyword}":
Top 50 listings hiện tại: ${JSON.stringify(searchData)}
Analytics (HOT/WATCH): ${JSON.stringify(analytics.filter(a => a.trend_status !== 'SKIP'))}
So với 7 ngày trước: ${JSON.stringify(await get7DayDiff(keywordId))}

Hãy phân tích ngắn gọn (tiếng Việt):
1. Niche con nào đang nổi?
2. Mức giá phổ biến?
3. Listing nào tăng trưởng nhanh nhất?
4. Có cơ hội nào cho seller POD mới?
    `;

    const response = await this.callAPI(prompt);
    return await this.saveInsight({
      insight_type: 'keyword_suggestion',
      keyword_id: keywordId,
      content: response,
      model_used: this.model,
    });
  }

  // AI keyword suggestions (bổ sung cho tag expansion)
  async suggestKeywords(seedKeyword: string, existingTags: string[]): Promise<string[]> {
    const prompt = `
Tôi đang theo dõi keyword "${seedKeyword}" trên Etsy cho POD (Print on Demand).
Tags phổ biến hiện tại: ${existingTags.join(', ')}

Gợi ý 10 keyword mới để search trên Etsy, liên quan nhưng chưa có trong danh sách trên.
Ưu tiên: cụ thể, buyer-intent rõ, phù hợp cho POD apparel.
Trả về JSON array: ["keyword1", "keyword2", ...]
    `;

    const response = await this.callAPI(prompt);
    return JSON.parse(response);
  }

  // Call API (Anthropic hoặc OpenAI)
  private async callAPI(prompt: string): Promise<string> {
    if (this.provider === 'anthropic') {
      // POST https://api.anthropic.com/v1/messages
    } else {
      // POST https://api.openai.com/v1/chat/completions
    }
  }

  // Save insight to DB
  private async saveInsight(insight: Partial<AIInsight>): Promise<AIInsight>
}
```

**Cost control:**
- Chỉ gọi AI khi có >= 1 alert severity "important"
- Batch nhiều shop/keyword vào 1 prompt khi possible
- Cache insight: không re-generate nếu data không đổi (check data_context hash)
- Setting cho user tắt/bật AI per shop/keyword

### 2. AI Insights UI

**AIInsights page** (`AIInsights.tsx`):
- List saved insights, sorted by date
- Filter by type (shop_summary, keyword_suggestion, niche_discovery)
- Pin/unpin insights
- "Analyze now" button trên shop detail / keyword detail
- Insight card: type badge, content (markdown), source data reference, timestamp

### 3. Dashboard hoàn chỉnh

**Dashboard** (`Dashboard.tsx`):
- **Quick stats**: total shops, total keywords, total HOT listings, unread alerts
- **Top HOT listings**: top 5 by trending_score, with trend badges
- **Recent alerts**: last 10, grouped by severity
- **Shop thay đổi mạnh nhất**: top 3 shops with most diff changes in last 24h
- **Keyword performance**: top 5 keywords with most HOT/WATCH findings
- **Crawl status**: running/paused, next scheduled, jobs in queue
- **AI latest insight**: most recent AI insight snippet

### 4. Electron Builder — Đóng gói

```yaml
# electron-builder.yml
appId: com.dragonmedia.etsy-spy
productName: Etsy Spy
directories:
  output: dist
  buildResources: build

mac:
  target: dmg
  icon: build/icon.icns

win:
  target: nsis
  icon: build/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

files:
  - "dist/**/*"
  - "node_modules/**/*"
  - "package.json"

extraResources:
  - from: "node_modules/playwright-core/.local-browsers"
    to: "browsers"
    filter: ["chromium-*/**"]

asar: true
```

**Lưu ý Playwright trong Electron:**
- Chromium cần bundle kèm hoặc download lần đầu chạy
- Path tới Chromium cần resolve khác nhau khi dev vs production
- Consider dùng `electron` built-in Chromium thay vì Playwright Chromium

### 5. Performance optimization

- **Virtual lists**: dùng `react-window` cho listing tables lớn (>100 items)
- **Lazy loading**: images load on scroll
- **Pagination**: snapshot history, alerts, analytics
- **DB queries**: thêm LIMIT + OFFSET cho mọi list query
- **IPC debounce**: không gọi IPC quá nhanh khi user type/filter

### 6. Error handling polish

- **User-friendly messages**: "Etsy đang block, đã tự tạo profile mới" thay vì stack trace
- **Retry logic**: auto-retry failed crawl jobs (max 2 times)
- **Offline mode**: app vẫn dùng được khi không có internet (browse cached data)
- **API key validation**: test key khi user nhập, hiển thị status badge

### 7. Onboarding flow (first-run)

Khi app chạy lần đầu:
1. Welcome screen
2. Setup VK1ng API key (+ test button)
3. Setup AI API key (optional)
4. Add first shop hoặc keyword
5. Trigger first crawl
6. Show results

## Deliverable cuối Phase 4

- AI insights hoạt động cho shop + keyword analysis
- Dashboard tổng hợp đầy đủ
- App đóng gói được .dmg + .exe
- Performance mượt với large datasets
- Error handling user-friendly
- Onboarding cho user mới
- **App sẵn sàng cho team ~100 người sử dụng**
