import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const dbPath = join(homedir(), 'Library/Application Support/supover-app/data/supover.db');
let db;

try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (e) {
  console.error('DB OPEN ERROR:', e.message);
  process.exit(1);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function log(status, name, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
}

// --- Test 1: Tables exist ---
test('All tables exist', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const expected = ['ai_insights','alerts','browser_profiles','crawl_jobs','html_cache','listing_analytics','listing_snapshots','listings','proxies','schema_version','search_keywords','search_snapshots','settings','shop_snapshots','shops'];
  const missing = expected.filter(t => !tables.includes(t));
  if (missing.length > 0) throw new Error('Missing tables: ' + missing.join(', '));
  return `${tables.length} tables found`;
});

// --- Test 2: Settings seeded ---
test('Settings seeded correctly', () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
  if (count < 17) throw new Error(`Only ${count} settings, expected >= 17`);
  const vkKey = db.prepare("SELECT value FROM settings WHERE key='vking_api_key'").get();
  if (!vkKey) throw new Error('vking_api_key missing');
  return `${count} settings, vking_api_key=${vkKey.value ? 'SET' : 'EMPTY'}`;
});

// --- Test 3: Add keyword ---
test('Add keyword', () => {
  // Clean up test data first
  db.prepare("DELETE FROM search_keywords WHERE keyword = 'test_funny_cat_shirt'").run();
  const result = db.prepare(
    "INSERT INTO search_keywords (keyword, category, max_pages, auto_expand, expansion_source, depth) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('test_funny_cat_shirt', 'clothing', 3, 1, 'user_input', 0);
  if (!result.lastInsertRowid) throw new Error('Insert failed');
  return `keyword id=${result.lastInsertRowid}`;
});

// --- Test 4: Add duplicate keyword ---
test('Duplicate keyword rejected', () => {
  try {
    db.prepare("INSERT INTO search_keywords (keyword) VALUES ('test_funny_cat_shirt')").run();
    throw new Error('Should have thrown UNIQUE constraint');
  } catch (e) {
    if (e.message.includes('UNIQUE')) return 'Correctly rejected';
    throw e;
  }
});

// --- Test 5: List keywords ---
test('List keywords', () => {
  const rows = db.prepare("SELECT * FROM search_keywords WHERE status != 'archived'").all();
  if (rows.length === 0) throw new Error('No keywords found');
  return `${rows.length} keywords`;
});

// --- Test 6: Add shop ---
test('Add shop', () => {
  db.prepare("DELETE FROM shops WHERE shop_name = 'TestShopName'").run();
  const result = db.prepare(
    "INSERT INTO shops (shop_name, shop_url, priority) VALUES (?, ?, ?)"
  ).run('TestShopName', 'https://www.etsy.com/shop/TestShopName', 'normal');
  if (!result.lastInsertRowid) throw new Error('Insert failed');
  return `shop id=${result.lastInsertRowid}`;
});

// --- Test 7: List shops ---
test('List shops', () => {
  const rows = db.prepare("SELECT * FROM shops WHERE status != 'archived'").all();
  if (rows.length === 0) throw new Error('No shops found');
  return `${rows.length} shops`;
});

// --- Test 8: Settings update ---
test('Settings update', () => {
  db.prepare("UPDATE settings SET value = 'test_value_123', updated_at = datetime('now') WHERE key = 'theme'").run();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
  if (row.value !== 'test_value_123') throw new Error(`Expected test_value_123, got ${row.value}`);
  // Restore
  db.prepare("UPDATE settings SET value = 'dark' WHERE key = 'theme'").run();
  return 'Update + restore OK';
});

// --- Test 9: Insert listing_analytics with null listing_id (search crawl case) ---
test('listing_analytics allows null listing_id', () => {
  db.prepare("DELETE FROM listing_analytics WHERE etsy_listing_id = '9999999999'").run();
  const result = db.prepare(
    `INSERT INTO listing_analytics (listing_id, etsy_listing_id, sold_24h, views_24h, hey_score, days_old, trending_score, trend_status, qualified)
     VALUES (NULL, '9999999999', 5, 200, 9, 30, 55.0, 'HOT', 1)`
  ).run();
  if (!result.lastInsertRowid) throw new Error('Insert failed');
  return `analytics id=${result.lastInsertRowid}`;
});

// --- Test 10: Trending query ---
test('Trending query works', () => {
  const rows = db.prepare(
    "SELECT * FROM listing_analytics WHERE trend_status IN ('HOT', 'WATCH') ORDER BY trending_score DESC LIMIT 5"
  ).all();
  return `${rows.length} trending listings`;
});

// --- Test 11: Crawl job insert ---
test('Crawl job lifecycle', () => {
  const ins = db.prepare(
    "INSERT INTO crawl_jobs (job_type, target_id, status, started_at, created_at) VALUES ('search_index', 1, 'running', datetime('now'), datetime('now'))"
  ).run();
  const jobId = ins.lastInsertRowid;
  db.prepare("UPDATE crawl_jobs SET status = 'completed', completed_at = datetime('now'), pages_crawled = 3 WHERE id = ?").run(jobId);
  const job = db.prepare("SELECT * FROM crawl_jobs WHERE id = ?").get(jobId);
  if (job.status !== 'completed') throw new Error(`Expected completed, got ${job.status}`);
  return `job id=${jobId} completed`;
});

// --- Test 12: Browser profile create ---
test('Browser profile CRUD', () => {
  const id = 'test-profile-' + Date.now();
  db.prepare("INSERT INTO browser_profiles (id, profile_path, status) VALUES (?, ?, 'active')").run(id, '/tmp/' + id);
  db.prepare("UPDATE browser_profiles SET total_requests = total_requests + 1, last_used_at = datetime('now') WHERE id = ?").run(id);
  const p = db.prepare("SELECT * FROM browser_profiles WHERE id = ?").get(id);
  if (p.total_requests !== 1) throw new Error(`Expected 1 request, got ${p.total_requests}`);
  db.prepare("DELETE FROM browser_profiles WHERE id = ?").run(id);
  return 'Create, increment, delete OK';
});

// --- Test 13: Proxy CRUD ---
test('Proxy CRUD', () => {
  const id = 'test-proxy-' + Date.now();
  db.prepare("INSERT INTO proxies (id, protocol, host, port, status) VALUES (?, 'http', '127.0.0.1', 8080, 'active')").run(id);
  const p = db.prepare("SELECT * FROM proxies WHERE id = ?").get(id);
  if (!p) throw new Error('Proxy not found');
  db.prepare("DELETE FROM proxies WHERE id = ?").run(id);
  return 'Create + delete OK';
});

// --- Test 14: HTML cache record ---
test('HTML cache record', () => {
  db.prepare("DELETE FROM html_cache WHERE target_name = 'test_target'").run();
  db.prepare(
    "INSERT INTO html_cache (page_type, target_name, page_number, file_path, file_size_bytes, parse_status, crawled_at) VALUES ('search_index', 'test_target', 1, '/tmp/test.html', 1024, 'pending', datetime('now'))"
  ).run();
  const row = db.prepare("SELECT * FROM html_cache WHERE target_name = 'test_target'").get();
  if (!row) throw new Error('Cache record not found');
  return `cache id=${row.id}, status=${row.parse_status}`;
});

// --- Test 15: Expansion tree query ---
test('Keyword expansion tree query', () => {
  const rows = db.prepare(
    "SELECT sk.*, sk.expansion_source AS source FROM search_keywords sk WHERE sk.parent_keyword_id IS NOT NULL"
  ).all();
  return `${rows.length} expanded keywords`;
});

// --- Test 16: Dashboard aggregates ---
test('Dashboard aggregates', () => {
  const hot = db.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status = 'HOT'").get().c;
  const watch = db.prepare("SELECT COUNT(*) as c FROM listing_analytics WHERE trend_status = 'WATCH'").get().c;
  const shops = db.prepare("SELECT COUNT(*) as c FROM shops WHERE status != 'archived'").get().c;
  const kws = db.prepare("SELECT COUNT(*) as c FROM search_keywords WHERE status != 'archived'").get().c;
  return `shops=${shops}, keywords=${kws}, HOT=${hot}, WATCH=${watch}`;
});

// --- Test 17: AI insights table ---
test('AI insights table', () => {
  const count = db.prepare("SELECT COUNT(*) as c FROM ai_insights").get().c;
  return `${count} insights`;
});

// --- Cleanup test data ---
test('Cleanup test data', () => {
  db.prepare("DELETE FROM listing_analytics WHERE etsy_listing_id = '9999999999'").run();
  db.prepare("DELETE FROM search_keywords WHERE keyword = 'test_funny_cat_shirt'").run();
  db.prepare("DELETE FROM shops WHERE shop_name = 'TestShopName'").run();
  db.prepare("DELETE FROM html_cache WHERE target_name = 'test_target'").run();
  return 'Cleaned up';
});

// Run all tests
console.log('\n🧪 SUPOVER APP — FEATURE TESTS\n' + '='.repeat(50));
let passed = 0, failed = 0;
for (const t of tests) {
  try {
    const detail = t.fn();
    log('PASS', t.name, detail);
    passed++;
  } catch (e) {
    log('FAIL', t.name, e.message);
    failed++;
  }
}
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length}`);

db.close();
process.exit(failed > 0 ? 1 : 0);
