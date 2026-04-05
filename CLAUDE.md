# CLAUDE.md — Etsy Spy Desktop App

## Tổng quan

Desktop app theo dõi shop và listing trên Etsy, phục vụ đội ngũ POD (Print on Demand) ~100 người.
App chạy local, không cần server, user giữ toàn bộ data trên máy.

### Core value

- Follow shop/listing Etsy
- Lưu snapshot định kỳ từ **search index**, **shop index**, **tag page** (KHÔNG crawl listing detail page)
- **Lưu file HTML đã crawl** → parse offline, giảm tối đa crawl live
- **Bắt trend**: gọi VK1ng API (HeyEtsy data) → qualification rules → xác định HOT/WATCH/SKIP
- Tự động mở rộng keyword từ tags winners (tag expansion loop)
- Phát hiện thay đổi qua diff engine
- AI tóm tắt và gợi ý insight

## Tech stack

| Layer | Công nghệ |
|-------|-----------|
| Desktop shell | Electron |
| Runtime | Node.js (ESM) |
| Browser automation | Playwright + Chromium |
| Database | SQLite (better-sqlite3) |
| UI framework | React + Vite (renderer) |
| IPC | Electron IPC (main ↔ renderer) |
| Analytics API | VK1ng API (HeyEtsy) — HTTP trực tiếp, không cần browser |
| AI | OpenAI API hoặc Anthropic API |
| Packaging | electron-builder |
| Proxy | proxy-chain hoặc proxy-agent |

## Nguyên tắc TUYỆT ĐỐI

1. **KHÔNG BAO GIỜ crawl listing detail page** — chỉ shop index, search index, tag page
2. **Luôn lưu HTML TRƯỚC khi parse** — crawl live → save file → parse từ file
3. **Parse từ file HTML**, không từ live DOM — cho phép re-parse khi fix parser
4. **Luôn check block status** trước khi lưu HTML
5. **Luôn có delay** giữa các page navigation (random 3-8s)
6. **Profile bị burn = tạo mới**, không cố reuse
7. **SQLite write dùng transaction** cho batch insert
8. **Tag expansion có giới hạn** — max depth 3, max 20 keywords per seed
9. **Rate limit nghiêm ngặt** — 60 page views/profile/giờ

## Cấu trúc thư mục

```
etsy-spy/
├── CLAUDE.md                    # File này — overview cho Claude Code
├── docs/                        # Tài liệu chi tiết theo module/giai đoạn
│   ├── architecture.md          # Kiến trúc, cấu trúc code, IPC channels
│   ├── database.md              # Schema tất cả bảng + indexes
│   ├── phase-1-foundation.md    # GĐ1: Electron + SQLite + UI cơ bản + test Playwright
│   ├── phase-2-crawl-engine.md  # GĐ2: Crawl + HTML cache + VK1ng + Trend detection
│   ├── phase-3-intelligence.md  # GĐ3: Tag expansion + Diff + Alert + Reparse
│   └── phase-4-ai-polish.md     # GĐ4: AI insights + Export + Packaging
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── vite.config.ts
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts
│   │   ├── ipc/                 # IPC handlers
│   │   ├── services/            # Business logic
│   │   └── utils/
│   ├── renderer/                # React UI (Vite)
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   └── shared/                  # Types + constants dùng chung
│       ├── types/
│       └── constants/
├── profiles/                    # Playwright browser profiles (gitignored)
├── html_cache/                  # Cached HTML files (gitignored)
├── data/                        # SQLite DB (gitignored)
└── logs/                        # Log files (gitignored)
```

## Lộ trình triển khai

| Giai đoạn | Tuần | Nội dung | Doc |
|-----------|------|----------|-----|
| 1. Foundation | 1-2 | Electron + SQLite + UI cơ bản + test Playwright | [phase-1](docs/phase-1-foundation.md) |
| 2. Crawl Engine | 3-4 | HTML cache + Parser + VK1ng + Trend detection | [phase-2](docs/phase-2-crawl-engine.md) |
| 3. Intelligence | 5-6 | Tag expansion + Diff + Alert + Reparse | [phase-3](docs/phase-3-intelligence.md) |
| 4. AI & Polish | 7-8 | AI insights + Export + Packaging | [phase-4](docs/phase-4-ai-polish.md) |

## Coding conventions

- **Language**: TypeScript strict mode, ESM
- **Naming**: camelCase (biến/hàm), PascalCase (types/components)
- **DB**: Prepared statements, KHÔNG string concatenation
- **Error handling**: try/catch mọi service method, log error kèm context
- **IPC**: Mọi handler validate input, return `{ success: boolean, data?: T, error?: string }`
- **Logging**: Mọi crawl action log level info. Errors log kèm shopId, jobId, profileId
- **Tests**: Unit test cho parser + diff engine + trend rules. Integration test cho DB queries.

## Reference skill

Folder `reference/etsy-spy/` (cùng repo parent) chứa implementation Python đã proven:
- `scripts/etsy_search.py` — parse listing từ search page DOM
- `scripts/etsy_analytics.py` — VK1ng API integration
- `scripts/auto_research.py` — tag expansion loop, saturation detection
- `scripts/keyword_discovery.py` — autocomplete, seasonal, tag expansion
- `scripts/qualification_helper.py` — 5 qualification rules
- `SKILL.md` — workflow listing-first discovery

**Khi code các service, tham khảo logic trong reference skill.**
