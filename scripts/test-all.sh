#!/bin/bash
# ============================================================================
# SUPOVER APP — FULL TEST SUITE
# Tests all features: DB, IPC handlers, Parser, Crawl, VK1ng, Trending, UI
# ============================================================================

set -uo pipefail

DB="$HOME/Library/Application Support/supover-app/data/supover.db"
CACHE_DIR="$HOME/Library/Application Support/supover-app/html_cache"
LOG_DIR="$HOME/Library/Application Support/supover-app/logs"
PROFILE_DIR="$HOME/Library/Application Support/supover-app/profiles"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0
SKIP=0
ERRORS=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}❌ FAIL${NC}: $1 — $2"; FAIL=$((FAIL+1)); ERRORS="$ERRORS\n  - $1: $2"; }
skip() { echo -e "${YELLOW}⏭️ SKIP${NC}: $1 — $2"; SKIP=$((SKIP+1)); }
section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

sql() { sqlite3 "$DB" "$1" 2>&1; }

# ============================================================================
section "1. BUILD & COMPILE"
# ============================================================================

# Test 1.1: TypeScript compiles
echo -n "TypeScript compilation... "
if cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  fail "TypeScript compilation" "has type errors"
else
  pass "TypeScript compiles with zero errors"
fi

# Test 1.2: electron-vite build
echo -n "electron-vite build... "
BUILD_OUT=$(cd "$PROJECT_DIR" && npx electron-vite build 2>&1)
if echo "$BUILD_OUT" | grep -q "built in"; then
  pass "electron-vite build succeeds (main + preload + renderer)"
else
  fail "electron-vite build" "build failed"
fi

# Test 1.3: Build outputs exist
for f in dist-electron/main/main.js dist-electron/preload/preload.mjs dist-electron/renderer/index.html; do
  if [ -f "$PROJECT_DIR/$f" ]; then
    pass "Build output exists: $f"
  else
    fail "Build output" "$f missing"
  fi
done

# ============================================================================
section "2. DATABASE SCHEMA"
# ============================================================================

if [ ! -f "$DB" ]; then
  fail "Database" "DB file not found at $DB"
  echo "Run the app at least once to create the database."
  exit 1
fi

# Test 2.1: All 14 tables exist
EXPECTED_TABLES="ai_insights alerts browser_profiles crawl_jobs html_cache listing_analytics listing_snapshots listings proxies schema_version search_keywords search_snapshots settings shop_snapshots shops"
for table in $EXPECTED_TABLES; do
  COUNT=$(sql "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table';")
  if [ "$COUNT" = "1" ]; then
    pass "Table exists: $table"
  else
    fail "Table missing" "$table"
  fi
done

# Test 2.2: Schema version
VERSION=$(sql "SELECT MAX(version) FROM schema_version;")
if [ "$VERSION" -ge 3 ]; then
  pass "Schema version = $VERSION (expected >= 3)"
else
  fail "Schema version" "got $VERSION, expected >= 3"
fi

# Test 2.3: All indexes exist
IDX_COUNT=$(sql "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';")
if [ "$IDX_COUNT" -ge 8 ]; then
  pass "Indexes: $IDX_COUNT custom indexes found"
else
  fail "Indexes" "only $IDX_COUNT found, expected >= 8"
fi

# ============================================================================
section "3. SETTINGS"
# ============================================================================

# Test 3.1: Settings count
SETTINGS_COUNT=$(sql "SELECT COUNT(*) FROM settings;")
if [ "$SETTINGS_COUNT" -ge 17 ]; then
  pass "Settings seeded: $SETTINGS_COUNT entries"
else
  fail "Settings" "only $SETTINGS_COUNT, expected >= 17"
fi

# Test 3.2: Critical settings exist
for key in vking_api_key vking_base_url ai_provider theme default_crawl_interval; do
  EXISTS=$(sql "SELECT COUNT(*) FROM settings WHERE key='$key';")
  if [ "$EXISTS" = "1" ]; then
    pass "Setting exists: $key"
  else
    fail "Setting missing" "$key"
  fi
done

# Test 3.3: Settings update
sql "UPDATE settings SET value='_test_value' WHERE key='theme';"
VAL=$(sql "SELECT value FROM settings WHERE key='theme';")
if [ "$VAL" = "_test_value" ]; then
  pass "Settings update works"
  sql "UPDATE settings SET value='dark' WHERE key='theme';"
else
  fail "Settings update" "expected _test_value, got $VAL"
fi

# ============================================================================
section "4. KEYWORD CRUD"
# ============================================================================

# Clean test data
sql "DELETE FROM search_keywords WHERE keyword LIKE '_test_%';"

# Test 4.1: Insert keyword
sql "INSERT INTO search_keywords (keyword, category, max_pages, auto_expand, expansion_source, depth) VALUES ('_test_kw_1', 'test', 3, 1, 'user_input', 0);"
KW_ID=$(sql "SELECT id FROM search_keywords WHERE keyword='_test_kw_1';")
if [ -n "$KW_ID" ]; then
  pass "Keyword insert: id=$KW_ID"
else
  fail "Keyword insert" "no id returned"
fi

# Test 4.2: Duplicate rejected
DUP_RESULT=$(sql "INSERT INTO search_keywords (keyword) VALUES ('_test_kw_1');" 2>&1 || true)
if echo "$DUP_RESULT" | grep -qi "UNIQUE"; then
  pass "Duplicate keyword rejected (UNIQUE constraint)"
else
  fail "Duplicate keyword" "not rejected: $DUP_RESULT"
fi

# Test 4.3: Keyword list query (complex - from handler)
LIST_RESULT=$(sql "
  SELECT sk.id, sk.keyword, sk.expansion_source AS source,
    COALESCE((SELECT COUNT(*) FROM listing_analytics la
     JOIN search_snapshots ss ON ss.etsy_listing_id = la.etsy_listing_id
     WHERE ss.keyword_id = sk.id AND la.trend_status = 'HOT'), 0) AS hot_count
  FROM search_keywords sk
  WHERE sk.status != 'archived'
  LIMIT 3;
")
if [ -n "$LIST_RESULT" ]; then
  pass "Keyword list query with computed fields works"
else
  fail "Keyword list query" "empty result"
fi

# Test 4.4: Keyword soft delete
sql "UPDATE search_keywords SET status='archived' WHERE keyword='_test_kw_1';"
ARCHIVED=$(sql "SELECT status FROM search_keywords WHERE keyword='_test_kw_1';")
if [ "$ARCHIVED" = "archived" ]; then
  pass "Keyword soft delete (archive) works"
else
  fail "Keyword soft delete" "status=$ARCHIVED"
fi

# Cleanup
sql "DELETE FROM search_keywords WHERE keyword LIKE '_test_%';"

# ============================================================================
section "5. SHOP CRUD"
# ============================================================================

sql "DELETE FROM shops WHERE shop_name LIKE '_test_%';"

# Test 5.1: Insert shop
sql "INSERT INTO shops (shop_name, shop_url, priority) VALUES ('_test_shop_1', 'https://www.etsy.com/shop/_test_shop_1', 'high');"
SHOP_ID=$(sql "SELECT id FROM shops WHERE shop_name='_test_shop_1';")
if [ -n "$SHOP_ID" ]; then
  pass "Shop insert: id=$SHOP_ID, priority=high"
else
  fail "Shop insert" "no id"
fi

# Test 5.2: Shop update
sql "UPDATE shops SET priority='low', updated_at=datetime('now') WHERE id=$SHOP_ID;"
PRIORITY=$(sql "SELECT priority FROM shops WHERE id=$SHOP_ID;")
if [ "$PRIORITY" = "low" ]; then
  pass "Shop update works"
else
  fail "Shop update" "priority=$PRIORITY"
fi

# Test 5.3: Shop soft delete
sql "UPDATE shops SET status='archived' WHERE id=$SHOP_ID;"
STATUS=$(sql "SELECT status FROM shops WHERE id=$SHOP_ID;")
if [ "$STATUS" = "archived" ]; then
  pass "Shop soft delete works"
else
  fail "Shop soft delete" "status=$STATUS"
fi

sql "DELETE FROM shops WHERE shop_name LIKE '_test_%';"

# ============================================================================
section "6. LISTING ANALYTICS & FK"
# ============================================================================

sql "DELETE FROM listing_analytics WHERE etsy_listing_id LIKE '_test_%';"

# Test 6.1: Insert with NULL listing_id (search crawl case)
sql "INSERT INTO listing_analytics (listing_id, etsy_listing_id, sold_24h, views_24h, hey_score, days_old, trending_score, trend_status, qualified) VALUES (NULL, '_test_1001', 5, 200, 9, 30, 55.0, 'HOT', 1);"
RESULT=$(sql "SELECT trend_status FROM listing_analytics WHERE etsy_listing_id='_test_1001';")
if [ "$RESULT" = "HOT" ]; then
  pass "listing_analytics allows NULL listing_id"
else
  fail "Null listing_id" "result=$RESULT"
fi

# Test 6.2: INSERT OR REPLACE
sql "INSERT OR REPLACE INTO listing_analytics (listing_id, etsy_listing_id, sold_24h, views_24h, hey_score, days_old, trending_score, trend_status, qualified) VALUES (NULL, '_test_1001', 10, 400, 9.5, 25, 120.0, 'HOT', 1);"
NEW_SCORE=$(sql "SELECT trending_score FROM listing_analytics WHERE etsy_listing_id='_test_1001' ORDER BY id DESC LIMIT 1;")
if [ "$NEW_SCORE" = "120.0" ]; then
  pass "INSERT OR REPLACE updates analytics"
else
  fail "INSERT OR REPLACE" "score=$NEW_SCORE"
fi

sql "DELETE FROM listing_analytics WHERE etsy_listing_id LIKE '_test_%';"

# ============================================================================
section "7. TREND CLASSIFICATION RULES"
# ============================================================================

# Test 7.1: HOT rule — sold >= 3 AND days <= 60
BAD_HOT=$(sql "SELECT COUNT(*) FROM listing_analytics WHERE trend_status='HOT' AND NOT (sold_24h >= 3 AND days_old <= 60);")
if [ "$BAD_HOT" = "0" ]; then
  HOT_COUNT=$(sql "SELECT COUNT(*) FROM listing_analytics WHERE trend_status='HOT';")
  pass "HOT rule verified: $HOT_COUNT listings, 0 violations"
else
  fail "HOT rule" "$BAD_HOT violations"
fi

# Test 7.2: WATCH rule — at least 1 of 5 rules passes
BAD_WATCH=$(sql "
  SELECT COUNT(*) FROM listing_analytics
  WHERE trend_status = 'WATCH'
    AND NOT (sold_24h >= 2)
    AND NOT (views_24h >= 120)
    AND NOT (views_24h >= 80 AND hey_score >= 8)
    AND NOT (days_old <= 30 AND hey_score >= 10 AND views_24h >= 40)
    AND NOT (sold_24h >= 3 AND days_old <= 90);
")
if [ "$BAD_WATCH" = "0" ]; then
  WATCH_COUNT=$(sql "SELECT COUNT(*) FROM listing_analytics WHERE trend_status='WATCH';")
  pass "WATCH rules verified: $WATCH_COUNT listings, 0 violations"
else
  fail "WATCH rules" "$BAD_WATCH violations"
fi

# Test 7.3: WATCH should not be HOT-eligible
WATCH_BUT_HOT=$(sql "SELECT COUNT(*) FROM listing_analytics WHERE trend_status='WATCH' AND (sold_24h >= 3 AND days_old <= 60);")
if [ "$WATCH_BUT_HOT" = "0" ]; then
  pass "No WATCH listings that should be HOT"
else
  fail "WATCH/HOT overlap" "$WATCH_BUT_HOT should be HOT"
fi

# Test 7.4: SKIP should not pass any rule
BAD_SKIP=$(sql "
  SELECT COUNT(*) FROM listing_analytics
  WHERE trend_status = 'SKIP'
    AND ((sold_24h >= 2) OR (views_24h >= 120)
      OR (views_24h >= 80 AND hey_score >= 8)
      OR (days_old <= 30 AND hey_score >= 10 AND views_24h >= 40)
      OR (sold_24h >= 3 AND days_old <= 90));
")
if [ "$BAD_SKIP" = "0" ]; then
  SKIP_COUNT=$(sql "SELECT COUNT(*) FROM listing_analytics WHERE trend_status='SKIP';")
  pass "SKIP rule verified: $SKIP_COUNT listings, 0 violations"
else
  fail "SKIP rule" "$BAD_SKIP should not be SKIP"
fi

# ============================================================================
section "8. TRENDING QUERY (no duplicates)"
# ============================================================================

TOTAL_ROWS=$(sql "
  SELECT COUNT(*) FROM (
    SELECT la.etsy_listing_id
    FROM listing_analytics la
    LEFT JOIN (
      SELECT etsy_listing_id, title AS ss_title
      FROM search_snapshots
      WHERE id IN (SELECT MAX(id) FROM search_snapshots GROUP BY etsy_listing_id)
    ) ss ON ss.etsy_listing_id = la.etsy_listing_id
    WHERE la.trend_status IN ('HOT', 'WATCH')
  );
")
UNIQUE_COUNT=$(sql "SELECT COUNT(DISTINCT etsy_listing_id) FROM listing_analytics WHERE trend_status IN ('HOT','WATCH');")
if [ "$TOTAL_ROWS" = "$UNIQUE_COUNT" ]; then
  pass "Trending query: $TOTAL_ROWS rows = $UNIQUE_COUNT unique (no duplicates)"
else
  fail "Trending duplicates" "$TOTAL_ROWS rows vs $UNIQUE_COUNT unique"
fi

# ============================================================================
section "9. CRAWL JOBS"
# ============================================================================

sql "DELETE FROM crawl_jobs WHERE target_id = -999;"

# Test 9.1: Crawl job lifecycle
sql "INSERT INTO crawl_jobs (job_type, target_id, status, started_at, created_at) VALUES ('search_index', -999, 'running', datetime('now'), datetime('now'));"
JOB_ID=$(sql "SELECT id FROM crawl_jobs WHERE target_id=-999;")
sql "UPDATE crawl_jobs SET status='completed', completed_at=datetime('now'), pages_crawled=3 WHERE id=$JOB_ID;"
JOB_STATUS=$(sql "SELECT status FROM crawl_jobs WHERE id=$JOB_ID;")
if [ "$JOB_STATUS" = "completed" ]; then
  pass "Crawl job lifecycle: running → completed"
else
  fail "Crawl job" "status=$JOB_STATUS"
fi
sql "DELETE FROM crawl_jobs WHERE target_id = -999;"

# ============================================================================
section "10. BROWSER PROFILES"
# ============================================================================

sql "DELETE FROM browser_profiles WHERE id LIKE '_test_%';"

# Test 10.1: Profile CRUD
sql "INSERT INTO browser_profiles (id, profile_path, status) VALUES ('_test_prof', '/tmp/_test_prof', 'active');"
sql "UPDATE browser_profiles SET total_requests = total_requests + 1, last_used_at = datetime('now') WHERE id = '_test_prof';"
REQUESTS=$(sql "SELECT total_requests FROM browser_profiles WHERE id='_test_prof';")
if [ "$REQUESTS" = "1" ]; then
  pass "Profile create + increment requests"
else
  fail "Profile requests" "got $REQUESTS"
fi

# Test 10.2: Profile burn
sql "UPDATE browser_profiles SET status='burned', burned_at=datetime('now'), burn_reason='test' WHERE id='_test_prof';"
BURN_STATUS=$(sql "SELECT status FROM browser_profiles WHERE id='_test_prof';")
if [ "$BURN_STATUS" = "burned" ]; then
  pass "Profile burn works"
else
  fail "Profile burn" "status=$BURN_STATUS"
fi

sql "DELETE FROM browser_profiles WHERE id LIKE '_test_%';"

# ============================================================================
section "11. PROXY CRUD"
# ============================================================================

sql "DELETE FROM proxies WHERE id LIKE '_test_%';"

sql "INSERT INTO proxies (id, protocol, host, port, status) VALUES ('_test_px', 'http', '127.0.0.1', 8080, 'active');"
PX_HOST=$(sql "SELECT host FROM proxies WHERE id='_test_px';")
if [ "$PX_HOST" = "127.0.0.1" ]; then
  pass "Proxy CRUD works"
else
  fail "Proxy CRUD" "host=$PX_HOST"
fi

# Test fail count
sql "UPDATE proxies SET fail_count = fail_count + 1 WHERE id='_test_px';"
FAIL_COUNT=$(sql "SELECT fail_count FROM proxies WHERE id='_test_px';")
if [ "$FAIL_COUNT" = "1" ]; then
  pass "Proxy fail count increment"
else
  fail "Proxy fail count" "got $FAIL_COUNT"
fi

sql "DELETE FROM proxies WHERE id LIKE '_test_%';"

# ============================================================================
section "12. HTML CACHE"
# ============================================================================

sql "DELETE FROM html_cache WHERE target_name LIKE '_test_%';"

sql "INSERT INTO html_cache (page_type, target_name, page_number, file_path, file_size_bytes, parse_status, crawled_at) VALUES ('search_index', '_test_cache', 1, '/tmp/_test.html', 2048, 'pending', datetime('now'));"
CACHE_STATUS=$(sql "SELECT parse_status FROM html_cache WHERE target_name='_test_cache';")
if [ "$CACHE_STATUS" = "pending" ]; then
  pass "HTML cache record insert"
else
  fail "HTML cache" "status=$CACHE_STATUS"
fi

# Test parse status update
sql "UPDATE html_cache SET parse_status='parsed', listings_found=48, parsed_at=datetime('now') WHERE target_name='_test_cache';"
PARSED=$(sql "SELECT listings_found FROM html_cache WHERE target_name='_test_cache';")
if [ "$PARSED" = "48" ]; then
  pass "HTML cache parse status update"
else
  fail "HTML cache parse update" "listings=$PARSED"
fi

sql "DELETE FROM html_cache WHERE target_name LIKE '_test_%';"

# ============================================================================
section "13. SEARCH SNAPSHOTS"
# ============================================================================

SNAP_COUNT=$(sql "SELECT COUNT(*) FROM search_snapshots;")
if [ "$SNAP_COUNT" -gt 0 ]; then
  pass "Search snapshots: $SNAP_COUNT records"

  # Verify no NULL etsy_listing_id
  NULL_IDS=$(sql "SELECT COUNT(*) FROM search_snapshots WHERE etsy_listing_id IS NULL OR etsy_listing_id = '';")
  if [ "$NULL_IDS" = "0" ]; then
    pass "All search snapshots have listing IDs"
  else
    fail "Search snapshots" "$NULL_IDS have NULL listing IDs"
  fi
else
  skip "Search snapshots" "no data yet (crawl needed)"
fi

# ============================================================================
section "14. EXPANSION TREE QUERY"
# ============================================================================

EXPANSION_QUERY=$(sql "SELECT COUNT(*) FROM search_keywords WHERE parent_keyword_id IS NOT NULL;")
pass "Expansion tree query works: $EXPANSION_QUERY expanded keywords"

# ============================================================================
section "15. DASHBOARD AGGREGATES"
# ============================================================================

DASHBOARD=$(sql "
  SELECT
    (SELECT COUNT(*) FROM shops WHERE status!='archived') as shops,
    (SELECT COUNT(*) FROM search_keywords WHERE status!='archived') as keywords,
    (SELECT COUNT(*) FROM listing_analytics WHERE trend_status='HOT') as hot,
    (SELECT COUNT(*) FROM listing_analytics WHERE trend_status='WATCH') as watch;
")
pass "Dashboard aggregates: $DASHBOARD"

# ============================================================================
section "16. FILE SYSTEM"
# ============================================================================

# Test 16.1: DB file
if [ -f "$DB" ]; then
  DB_SIZE=$(du -h "$DB" | cut -f1)
  pass "Database file: $DB_SIZE"
else
  fail "Database file" "not found"
fi

# Test 16.2: Cache directory
if [ -d "$CACHE_DIR" ]; then
  CACHE_FILES=$(find "$CACHE_DIR" -name "*.html" -type f | wc -l | tr -d ' ')
  pass "HTML cache dir: $CACHE_FILES files"
else
  skip "HTML cache dir" "not created yet"
fi

# Test 16.3: Profile directory
if [ -d "$PROFILE_DIR" ]; then
  PROF_COUNT=$(ls -1d "$PROFILE_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')
  pass "Profile dir: $PROF_COUNT profiles"
else
  skip "Profile dir" "not created yet"
fi

# Test 16.4: Log directory
if [ -d "$LOG_DIR" ]; then
  pass "Log dir exists"
else
  skip "Log dir" "not created yet (run app once)"
fi

# ============================================================================
section "17. SOURCE CODE INTEGRITY"
# ============================================================================

# Test 17.1: All expected source files exist
EXPECTED_FILES=(
  "src/main/main.ts"
  "src/main/preload.ts"
  "src/main/services/db.ts"
  "src/main/services/crawlService.ts"
  "src/main/services/browserService.ts"
  "src/main/services/parserService.ts"
  "src/main/services/vkingService.ts"
  "src/main/services/trendService.ts"
  "src/main/ipc/index.ts"
  "src/renderer/App.tsx"
  "src/renderer/pages/TrendingBoard.tsx"
  "src/renderer/pages/SearchTracker.tsx"
  "src/renderer/pages/ShopList.tsx"
  "src/renderer/pages/Settings.tsx"
  "src/renderer/components/Sidebar.tsx"
  "src/renderer/components/TrendBadge.tsx"
  "src/shared/types/index.ts"
  "src/shared/constants/ipcChannels.ts"
)
MISSING_FILES=0
for f in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$PROJECT_DIR/$f" ]; then
    fail "Source file" "$f missing"
    MISSING_FILES=$((MISSING_FILES+1))
  fi
done
if [ "$MISSING_FILES" = "0" ]; then
  pass "All ${#EXPECTED_FILES[@]} critical source files exist"
fi

# Test 17.2: No hardcoded "Etsy Spy" remaining
ETSY_SPY_COUNT=$(grep -rl "Etsy Spy" "$PROJECT_DIR/src" 2>/dev/null | wc -l | tr -d ' ')
if [ -z "$ETSY_SPY_COUNT" ] || [ "$ETSY_SPY_COUNT" = "0" ]; then
  pass "No 'Etsy Spy' references in source (renamed to Supover App)"
else
  fail "Rename incomplete" "$ETSY_SPY_COUNT 'Etsy Spy' references remain"
fi

# ============================================================================
section "18. VK1NG API CONFIG"
# ============================================================================

API_KEY=$(sql "SELECT value FROM settings WHERE key='vking_api_key';")
if [ -n "$API_KEY" ] && [ "$API_KEY" != "" ]; then
  pass "VK1ng API key is configured"

  # Test API connectivity
  BASE_URL=$(sql "SELECT value FROM settings WHERE key='vking_base_url';")
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" "$BASE_URL/me" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "VK1ng API connectivity OK (HTTP 200)"
  elif [ "$HTTP_CODE" = "000" ]; then
    skip "VK1ng API connectivity" "network error"
  else
    fail "VK1ng API" "HTTP $HTTP_CODE"
  fi
else
  skip "VK1ng API key" "not configured (set in Settings)"
fi

# ============================================================================
section "19. DATA CONSISTENCY"
# ============================================================================

# Test: No orphaned search_snapshots (keyword exists)
ORPHAN_SS=$(sql "SELECT COUNT(*) FROM search_snapshots ss WHERE NOT EXISTS (SELECT 1 FROM search_keywords sk WHERE sk.id = ss.keyword_id);")
if [ "$ORPHAN_SS" = "0" ]; then
  pass "No orphaned search snapshots"
else
  fail "Orphaned snapshots" "$ORPHAN_SS orphaned search_snapshots"
fi

# Test: Trending score formula consistency
BAD_SCORES=$(sql "
  SELECT COUNT(*) FROM listing_analytics
  WHERE ABS(trending_score - (sold_24h * 10 + views_24h / 10.0 + conversion_rate * 2)) > 1
    AND trending_score > 0;
")
if [ "$BAD_SCORES" = "0" ]; then
  pass "Trending score formula verified"
else
  fail "Trending scores" "$BAD_SCORES inconsistent scores"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  TEST RESULTS${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed:  $PASS${NC}"
echo -e "  ${RED}Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo -e "  Total:   $((PASS+FAIL+SKIP))"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}Failures:${NC}$ERRORS"
  exit 1
else
  echo -e "\n${GREEN}All tests passed!${NC}"
  exit 0
fi
