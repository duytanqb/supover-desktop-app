/**
 * Standalone crawl script — runs outside Electron
 * Usage: npx tsx scripts/crawl-keyword.ts <keyword_id>
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { readFileSync } from 'fs';
import { chromium } from 'playwright-core';
import * as cheerio from 'cheerio';

const DB_PATH = join(homedir(), 'Library/Application Support/supover-app/data/supover.db');
const CACHE_DIR = join(homedir(), 'Library/Application Support/supover-app/html_cache');
const PROFILE_DIR = join(homedir(), 'Library/Application Support/supover-app/profiles');

// Open DB
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Get keyword
const keywordId = parseInt(process.argv[2] || '0');
if (!keywordId) {
  const keywords = db.prepare("SELECT id, keyword, status FROM search_keywords WHERE status != 'archived'").all() as any[];
  console.log('Usage: npx tsx scripts/crawl-keyword.ts <keyword_id>\n');
  console.log('Available keywords:');
  keywords.forEach((k: any) => console.log(`  ${k.id}: ${k.keyword} (${k.status})`));
  process.exit(0);
}

const keyword = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(keywordId) as any;
if (!keyword) {
  console.error(`Keyword ${keywordId} not found`);
  process.exit(1);
}

console.log(`\n🔍 Crawling keyword: "${keyword.keyword}" (id=${keywordId}, max_pages=${keyword.max_pages})\n`);

// Get or create profile
let profile = db.prepare("SELECT * FROM browser_profiles WHERE status = 'active' ORDER BY total_requests ASC LIMIT 1").get() as any;
if (!profile) {
  const id = crypto.randomUUID();
  const profilePath = join(PROFILE_DIR, id);
  mkdirSync(profilePath, { recursive: true });
  db.prepare("INSERT INTO browser_profiles (id, profile_path, status) VALUES (?, ?, 'active')").run(id, profilePath);
  profile = { id, profile_path: profilePath };
  console.log(`Created new profile: ${id}`);
}

// Create crawl job
const job = db.prepare(
  "INSERT INTO crawl_jobs (job_type, target_id, status, started_at, created_at) VALUES ('search_index', ?, 'running', datetime('now'), datetime('now'))"
).run(keywordId);
const jobId = Number(job.lastInsertRowid);
console.log(`Crawl job: ${jobId}`);

// Helpers
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parsePrice(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const maxPages = keyword.max_pages || 1;
  let allListingIds: string[] = [];
  let totalSnapshots = 0;

  // Launch browser
  console.log('Launching headless browser...');
  const ctx = await chromium.launchPersistentContext(profile.profile_path, {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    ignoreDefaultArgs: ['--enable-automation'],
    timeout: 60000,
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const encodedKw = encodeURIComponent(keyword.keyword);
      const url = pageNum === 1
        ? `https://www.etsy.com/search?q=${encodedKw}&ref=search_bar&explicit=1&ship_to=US`
        : `https://www.etsy.com/search?q=${encodedKw}&ref=search_bar&explicit=1&ship_to=US&page=${pageNum}`;

      console.log(`\n📄 Page ${pageNum}/${maxPages}: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // Wait for Cloudflare challenge to resolve
      console.log('  ⏳ Waiting for page to fully load...');
      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(3000);
        const currentTitle = await page.title();
        const bodyLen = (await page.content()).length;
        console.log(`  Attempt ${attempt + 1}: title="${currentTitle}", body=${(bodyLen / 1024).toFixed(0)}KB`);
        if (bodyLen > 10000 && !currentTitle.includes('etsy.com')) {
          console.log('  ✅ Page loaded!');
          break;
        }
        if (attempt === 9) {
          console.log('  ⚠️ Page may not have fully loaded');
        }
      }

      // Block check
      const pageUrl = page.url();
      const title = await page.title();
      if (pageUrl.includes('captcha') || title.includes('Access Denied') || title.includes('Please verify')) {
        console.error('  ❌ BLOCKED! Stopping crawl.');
        db.prepare("UPDATE browser_profiles SET status = 'burned', burned_at = datetime('now'), burn_reason = 'blocked' WHERE id = ?").run(profile.id);
        break;
      }

      // Save HTML
      const html = await page.content();
      const cacheKey = slugify(`${keyword.keyword}-page${pageNum}`);
      const cacheSubdir = join(CACHE_DIR, 'search_index', cacheKey);
      mkdirSync(cacheSubdir, { recursive: true });
      const now = new Date();
      const filename = `${now.toISOString().slice(0,10).replace(/-/g,'')}_${now.toTimeString().slice(0,8).replace(/:/g,'')}_page${pageNum}.html`;
      const filePath = join(cacheSubdir, filename);
      writeFileSync(filePath, html);
      const fileSize = Buffer.byteLength(html);
      console.log(`  💾 Saved HTML: ${(fileSize / 1024).toFixed(0)}KB`);

      // Insert html_cache record
      db.prepare(
        "INSERT INTO html_cache (page_type, target_id, target_name, page_number, file_path, file_size_bytes, parse_status, crawl_job_id, crawled_at) VALUES ('search_index', ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))"
      ).run(keywordId, cacheKey, pageNum, filePath, fileSize, jobId);

      // Parse from file
      const savedHtml = readFileSync(filePath, 'utf-8');
      const $ = cheerio.load(savedHtml);

      // Extract listing IDs and data
      const listings: any[] = [];
      $('[data-listing-id]').each((_i, el) => {
        const $el = $(el);
        const listingId = $el.attr('data-listing-id');
        if (!listingId || !/^\d{6,}$/.test(listingId)) return;

        const titleText = $el.find('h3').first().text().trim();
        const priceText = $el.find('.currency-value').first().text();
        const shopName = $el.find('.shop-name').text().trim() ||
          $el.find('[data-seller-name-link]').text().trim() || null;
        const imageUrl = $el.find('img').first().attr('src') || null;
        const isBestseller = $el.text().toLowerCase().includes('bestseller');
        const isAd = $el.find('.promoted-tag').length > 0;

        listings.push({
          etsyListingId: listingId,
          title: titleText,
          price: parsePrice(priceText),
          shopName,
          imageUrl,
          isBestseller,
          isAd,
          position: listings.length + 1,
        });
      });

      // Also try regex fallback for IDs
      const regexIds = new Set<string>();
      const patterns = [/data-listing-id=["']?(\d{6,})/g, /\/listing\/(\d{6,})/g];
      for (const pattern of patterns) {
        for (const match of savedHtml.matchAll(pattern)) regexIds.add(match[1]);
      }
      // Add IDs not already in listings
      const existingIds = new Set(listings.map(l => l.etsyListingId));
      for (const id of regexIds) {
        if (!existingIds.has(id)) {
          listings.push({ etsyListingId: id, title: '', price: null, shopName: null, imageUrl: null, isBestseller: false, isAd: false, position: listings.length + 1 });
        }
      }

      console.log(`  📋 Parsed ${listings.length} listings`);

      if (listings.length === 0) {
        console.log('  ⚠️ No listings found, stopping pagination');
        break;
      }

      // Save to search_snapshots
      const insertSnapshot = db.prepare(
        `INSERT INTO search_snapshots (keyword_id, etsy_listing_id, shop_name, title, price, image_url, is_bestseller, is_ad, position_in_search, page_number, crawled_at, crawl_job_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
      );
      const saveAll = db.transaction(() => {
        for (const l of listings) {
          insertSnapshot.run(keywordId, l.etsyListingId, l.shopName, l.title, l.price, l.imageUrl, l.isBestseller ? 1 : 0, l.isAd ? 1 : 0, l.position, pageNum, jobId);
        }
      });
      saveAll();
      totalSnapshots += listings.length;
      allListingIds.push(...listings.map(l => l.etsyListingId));

      // Delay between pages
      if (pageNum < maxPages) {
        const pageDelay = 3000 + Math.random() * 5000;
        console.log(`  ⏳ Page delay ${(pageDelay / 1000).toFixed(1)}s...`);
        await sleep(pageDelay);
      }

      db.prepare("UPDATE browser_profiles SET total_requests = total_requests + 1, last_used_at = datetime('now') WHERE id = ?").run(profile.id);
    }
  } finally {
    await ctx.close();
  }

  // Dedupe
  const uniqueIds = [...new Set(allListingIds)];
  console.log(`\n📊 Total unique listing IDs: ${uniqueIds.length}`);

  // Fetch VK1ng analytics
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const apiKey = (getSetting.get('vking_api_key') as any)?.value || '';
  const baseUrl = (getSetting.get('vking_base_url') as any)?.value || 'https://vk1ng.com/api';

  if (!apiKey) {
    console.log('\n⚠️ No VK1ng API key set — skipping analytics. Set it in Settings.');
  } else {
    // Filter IDs not recently fetched
    const placeholders = uniqueIds.map(() => '?').join(',');
    const cached = db.prepare(
      `SELECT etsy_listing_id FROM listing_analytics WHERE etsy_listing_id IN (${placeholders}) AND fetched_at > datetime('now', '-24 hours')`
    ).all(...uniqueIds) as any[];
    const cachedSet = new Set(cached.map((r: any) => r.etsy_listing_id));
    const newIds = uniqueIds.filter(id => !cachedSet.has(id));

    console.log(`\n🔗 VK1ng: ${newIds.length} new IDs to fetch (${cachedSet.size} cached)`);

    if (newIds.length > 0) {
      const batchSize = 50;
      let fetched = 0;
      for (let i = 0; i < newIds.length; i += batchSize) {
        const batch = newIds.slice(i, i + batchSize);
        const idsStr = batch.join(',');
        const url = `${baseUrl}/bulk/listings/${idsStr}`;
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} IDs...`);

        try {
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30000) });
          if (!resp.ok) {
            console.error(`  ❌ API error: ${resp.status}`);
            continue;
          }
          const body = await resp.json() as any;
          if (body.status && Array.isArray(body.data)) {
            const insertAnalytics = db.prepare(`
              INSERT OR REPLACE INTO listing_analytics (
                listing_id, etsy_listing_id, sold_24h, views_24h, hey_score, days_old,
                total_sold, estimated_revenue, conversion_rate, num_favorers, daily_views, total_views,
                trending_score, trend_status, qualified, qualified_by,
                tags, categories, shop_country, shop_sold, fetched_at, crawl_job_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
            `);

            const saveBatch = db.transaction(() => {
              for (const d of body.data) {
                const etsyId = String(d.listing_id);
                const sold = d.sold ?? 0;
                const views = d.views_24h ?? 0;
                const hey = d.hey ?? 0;
                const days = d.original_creation_days ?? 999;
                const cr = d.cr ?? 0;

                // Classify
                let trendStatus = 'SKIP';
                if (sold >= 3 && days <= 60) trendStatus = 'HOT';
                else if (sold >= 2 || views >= 120 || (views >= 80 && hey >= 8) || (days <= 30 && hey >= 10 && views >= 40) || (sold >= 3 && days <= 90)) trendStatus = 'WATCH';

                const score = Math.round(((sold * 10) + (views / 10) + (cr * 2)) * 10) / 10;
                const qualified = trendStatus !== 'SKIP' ? 1 : 0;

                // Resolve listing_id
                const listingRow = db.prepare('SELECT id FROM listings WHERE etsy_listing_id = ? LIMIT 1').get(etsyId) as any;

                insertAnalytics.run(
                  listingRow?.id ?? null, etsyId,
                  sold, views, hey, days,
                  d.total_sold ?? 0, d.estimated_revenue ?? '', cr, d.num_favorers ?? 0, d.daily_views ?? 0, d.views ?? 0,
                  score, trendStatus, qualified, JSON.stringify([]),
                  d.tags ?? '', d.categories ?? '', d.shop_country ?? '', d.shop_sold ?? 0, jobId
                );
                fetched++;
              }
            });
            saveBatch();
            console.log(`  ✅ ${body.data.length} listings processed`);
          }
        } catch (e: any) {
          console.error(`  ❌ Fetch error: ${e.message}`);
        }
      }
      console.log(`\n✅ Total fetched: ${fetched}`);
    }
  }

  // Update crawl job
  db.prepare("UPDATE crawl_jobs SET status = 'completed', completed_at = datetime('now'), pages_crawled = ? WHERE id = ?").run(allListingIds.length > 0 ? 1 : 0, jobId);

  // Final stats
  const stats = db.prepare(`
    SELECT trend_status, COUNT(*) as count FROM listing_analytics GROUP BY trend_status
    ORDER BY CASE trend_status WHEN 'HOT' THEN 1 WHEN 'WATCH' THEN 2 ELSE 3 END
  `).all() as any[];

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Snapshots saved: ${totalSnapshots}`);
  stats.forEach((s: any) => console.log(`  ${s.trend_status}: ${s.count}`));
  console.log(`Total analytics: ${db.prepare('SELECT COUNT(*) as c FROM listing_analytics').get()?.c}`);

  // Verify rules
  const badHot = (db.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status='HOT' AND NOT (sold_24h >= 3 AND days_old <= 60)").get() as any).c;
  const badWatch = (db.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status='WATCH' AND NOT (sold_24h >= 2) AND NOT (views_24h >= 120) AND NOT (views_24h >= 80 AND hey_score >= 8) AND NOT (days_old <= 30 AND hey_score >= 10 AND views_24h >= 40) AND NOT (sold_24h >= 3 AND days_old <= 90)").get() as any).c;
  console.log(`\n✅ Rule verification: ${badHot} bad HOT, ${badWatch} bad WATCH`);

  db.close();
}

main().catch(e => {
  console.error('Fatal:', e);
  db.close();
  process.exit(1);
});
