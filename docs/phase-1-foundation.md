# Phase 1: Foundation (Tuần 1-2)

## Mục tiêu

Electron app chạy được, SQLite kết nối, UI cơ bản hiển thị, và **validate Playwright hoạt động với Etsy** trước khi đầu tư vào các module phức tạp.

## Checklist

- [ ] Khởi tạo project: package.json, tsconfig, electron-builder.yml, vite.config
- [ ] Electron main process chạy được, mở BrowserWindow
- [ ] React renderer (Vite) hiển thị trong Electron
- [ ] IPC bridge hoạt động: renderer gọi main, main trả response
- [ ] SQLite kết nối (better-sqlite3), chạy migrations tạo TẤT CẢ bảng (xem `database.md`)
- [ ] UI: Settings page — form nhập VK1ng API key, proxy config, AI API key
- [ ] UI: Shop list page — form thêm shop (URL hoặc name), danh sách shops
- [ ] UI: Keyword tracking page — form thêm keyword, danh sách keywords
- [ ] **Playwright validation test**: mở 1 shop page Etsy, extract listing data
- [ ] Shared types: tạo tất cả TypeScript types trong `src/shared/types/`
- [ ] IPC channel constants trong `src/shared/constants/ipcChannels.ts`
- [ ] Logger setup (Winston hoặc custom)

## Chi tiết triển khai

### 1. Project setup

```bash
mkdir etsy-spy && cd etsy-spy
npm init -y
npm install electron electron-builder better-sqlite3 react react-dom
npm install -D typescript vite @vitejs/plugin-react
npm install -D @types/react @types/react-dom @types/better-sqlite3
```

Cấu hình Electron + Vite: dùng pattern `electron-vite` hoặc custom.
Main process: TypeScript compiled riêng. Renderer: Vite dev server khi dev, build khi production.

### 2. SQLite migrations

File `src/main/services/db.ts`:

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const DB_PATH = path.join(app.getPath('userData'), 'data', 'etsy-spy.db');

export function initDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  // Tạo tất cả bảng từ database.md
  // Dùng db.exec() cho DDL statements
  // Dùng migration version table để track
}
```

**Quan trọng**: Tạo TẤT CẢ bảng ngay từ Phase 1 (kể cả bảng chưa dùng ngay). Để tránh migration phức tạp sau.

### 3. IPC bridge pattern

```typescript
// src/main/ipc/shopHandlers.ts
import { ipcMain } from 'electron';

export function registerShopHandlers(db: Database.Database): void {
  ipcMain.handle('shop:list', async () => {
    try {
      const shops = db.prepare('SELECT * FROM shops WHERE status != ?').all('archived');
      return { success: true, data: shops };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('shop:add', async (_event, params) => {
    // Validate params
    // Insert into shops
    // Return new shop
  });
}
```

```typescript
// src/renderer/hooks/useIPC.ts
export function useIPC<T>(channel: string) {
  const invoke = async (params?: any): Promise<{ success: boolean; data?: T; error?: string }> => {
    return window.electron.ipcRenderer.invoke(channel, params);
  };
  return { invoke };
}
```

### 4. UI pages cơ bản

**Settings page** — Form fields:
- VK1ng API Key (password input + test button)
- AI Provider (dropdown: anthropic/openai) + API Key
- Default crawl interval (dropdown: 1h/3h/6h/12h/24h)
- Proxy config (protocol, host, port, username, password)
- Theme (dark/light)

**Shop list page** — Components:
- Form: input URL/name, priority dropdown, notes textarea
- Table: shop name, status, priority, last crawled, total listings, actions
- Actions: crawl now, pause, edit, archive

**Keyword tracking page** — Components:
- Form: input keyword, category, max pages, auto-expand toggle
- Table: keyword, source, depth, status, last crawled, actions

### 5. Playwright validation test (QUAN TRỌNG NHẤT)

Đây là test quyết định cả dự án. Cần verify Playwright có thể:
1. Mở Etsy shop page
2. Extract listing data từ DOM
3. Không bị block ngay lập tức

```typescript
// src/main/services/browserService.ts — test function
async function testPlaywrightWithEtsy(): Promise<TestResult> {
  const { chromium } = require('playwright');

  // 1. Launch với persistent profile
  const ctx = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  const page = ctx.pages[0] || await ctx.newPage();

  // 2. Navigate tới 1 shop known
  await page.goto('https://www.etsy.com/shop/SomeKnownShop', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await sleep(randomDelay(3000, 5000));

  // 3. Check nếu bị block
  const blocked = await isBlockedPage(page);
  if (blocked) return { success: false, error: 'Blocked by Etsy' };

  // 4. Extract listing IDs
  const html = await page.content();
  const ids = extractListingIds(html);

  // 5. Lưu HTML file (test cache flow)
  await fs.writeFile(cachePath, html);

  await ctx.close();

  return {
    success: true,
    listingsFound: ids.length,
    htmlSaved: true,
  };
}
```

**Nếu test này fail** → cần adjust: thêm proxy, thử stealth plugin, hoặc dùng HMA profile approach như reference skill.

### 6. Shared types

```typescript
// src/shared/types/shop.ts
export interface Shop {
  id: number;
  shop_name: string;
  shop_url: string;
  priority: 'low' | 'normal' | 'high';
  crawl_interval_minutes: number;
  notes: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

// src/shared/types/analytics.ts
export interface VkingListingData {
  listing_id: string;
  views: number;
  daily_views: number;
  views_24h: number;
  total_sold: number;
  sold: number;               // = sold_24h
  estimated_revenue: string;
  cr: number;
  num_favorers: number;
  hey: number;                // HEY score 0-10
  original_creation: string;
  original_creation_days: number; // = days_old
  last_modified: string;
  tags: string;
  categories: string;
  shop_country: string;
  shop_sold: number;
}

export type TrendStatus = 'HOT' | 'WATCH' | 'SKIP';

export interface QualificationResult {
  qualified: boolean;
  reasons: string[];
  rules: Record<string, boolean>;
}
```

## Deliverable cuối Phase 1

- App Electron mở được, hiển thị React UI
- User có thể thêm shop/keyword vào DB
- Settings lưu được vào DB
- **Playwright test pass**: mở Etsy, extract data, lưu HTML
- Tất cả DB tables đã tạo
- Types đã define cho toàn bộ project
