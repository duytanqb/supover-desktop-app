import type Database from 'better-sqlite3';
import type { AIInsight } from '../../shared/types/index.js';
import { logger } from '../utils/logger.js';

interface AIConfig {
  provider: 'anthropic' | 'openai' | 'deepseek';
  apiKey: string;
  model: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  deepseek: 'deepseek-reasoner',
};

const API_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
};

function getAIConfig(db: Database.Database): AIConfig {
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN ('ai_provider', 'ai_api_key', 'ai_model')`
  ).all() as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const provider = (map['ai_provider'] || 'deepseek') as AIConfig['provider'];
  const apiKey = map['ai_api_key'] || '';
  const model = map['ai_model'] || DEFAULT_MODELS[provider] || 'deepseek-chat';

  if (!apiKey) {
    throw new Error('AI API key is not configured. Go to Settings to add your API key.');
  }

  return { provider, apiKey, model };
}

async function callAPI(
  prompt: string,
  systemPrompt: string,
  provider: string,
  apiKey: string,
  model: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid API key');
        }
        if (response.status === 429) {
          // Retry with backoff
          clearTimeout(timeout);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return callAPI(prompt, systemPrompt, provider, apiKey, model);
        }
        const body = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } else {
      // OpenAI / DeepSeek (OpenAI-compatible API)
      const apiUrl = API_URLS[provider] || API_URLS.openai;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid API key');
        }
        if (response.status === 429) {
          clearTimeout(timeout);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return callAPI(prompt, systemPrompt, provider, apiKey, model);
        }
        const body = await response.text();
        throw new Error(`${provider} API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeShop(db: Database.Database, shopId: number): Promise<AIInsight> {
  const config = getAIConfig(db);

  // 1. Fetch shop info
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as any;
  if (!shop) {
    throw new Error(`Shop not found: ${shopId}`);
  }

  // 2. Fetch recent snapshots
  const snapshots = db.prepare(
    'SELECT * FROM shop_snapshots WHERE shop_id = ? ORDER BY crawled_at DESC LIMIT 5'
  ).all(shopId) as any[];

  // 3. Fetch recent listings with analytics (HOT/WATCH)
  const listings = db.prepare(`
    SELECT l.id, l.etsy_listing_id, ls.title, ls.price, ls.is_bestseller,
           la.sold_24h, la.views_24h, la.hey_score, la.trending_score, la.trend_status
    FROM listings l
    LEFT JOIN (
      SELECT listing_id, title, price, is_bestseller,
             ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY crawled_at DESC) as rn
      FROM listing_snapshots
    ) ls ON ls.listing_id = l.id AND ls.rn = 1
    LEFT JOIN (
      SELECT listing_id, sold_24h, views_24h, hey_score, trending_score, trend_status,
             ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY fetched_at DESC) as rn
      FROM listing_analytics
    ) la ON la.listing_id = l.id AND la.rn = 1
    WHERE l.shop_id = ? AND l.status = 'active'
    ORDER BY la.trending_score DESC NULLS LAST
    LIMIT 20
  `).all(shopId) as any[];

  // 4. Fetch recent alerts
  const alerts = db.prepare(
    `SELECT * FROM alerts WHERE shop_id = ? AND created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 20`
  ).all(shopId) as any[];

  // 5. Build prompt
  const latestSnapshot = snapshots[0] || {};
  const hotListings = listings.filter((l: any) => l.trend_status === 'HOT' || l.trend_status === 'WATCH');

  const prompt = `
Shop overview:
- Name: ${shop.shop_name}
- URL: ${shop.shop_url}
- Total sales: ${latestSnapshot.total_sales ?? 'N/A'}
- Total listings: ${latestSnapshot.total_listings ?? 'N/A'}
- Total reviews: ${latestSnapshot.total_reviews ?? 'N/A'}

Top performing listings (HOT/WATCH):
${hotListings.length > 0
    ? hotListings.map((l: any, i: number) =>
      `${i + 1}. [${l.trend_status}] "${l.title}" - $${l.price} | sold_24h: ${l.sold_24h} | views_24h: ${l.views_24h} | hey_score: ${l.hey_score}`
    ).join('\n')
    : 'No HOT/WATCH listings found yet.'
  }

Recent alerts (last 7 days):
${alerts.length > 0
    ? alerts.map((a: any) => `- [${a.severity}] ${a.alert_type}: old=${a.old_value}, new=${a.new_value}`).join('\n')
    : 'No recent alerts.'
  }

Analyze this shop and provide:
1. Market position assessment
2. Top opportunities identified
3. Specific recommendations for a POD seller competing in this niche
4. Trending patterns observed
`;

  const systemPrompt = 'You are an expert Etsy POD market analyst. Analyze the shop data and provide actionable insights for a print-on-demand seller. Be specific and data-driven. Format with sections: Overview, Top Performers, Opportunities, Recommendations.';

  // 6. Call API
  logger.info(`Analyzing shop ${shopId} (${shop.shop_name}) with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);

  // 7. Save insight
  const dataContext = JSON.stringify({
    shopId,
    snapshotIds: snapshots.map((s: any) => s.id),
    listingIds: listings.map((l: any) => l.id),
    alertIds: alerts.map((a: any) => a.id),
  });

  const result = db.prepare(`
    INSERT INTO ai_insights (insight_type, shop_id, content, data_context, model_used)
    VALUES (?, ?, ?, ?, ?)
  `).run('shop_summary', shopId, content, dataContext, config.model);

  const insight = db.prepare('SELECT * FROM ai_insights WHERE id = ?').get(result.lastInsertRowid) as AIInsight;
  logger.info(`Saved AI insight ${insight.id} for shop ${shopId}`);

  return insight;
}

export async function analyzeKeyword(db: Database.Database, keywordId: number): Promise<AIInsight> {
  const config = getAIConfig(db);

  // 1. Fetch keyword
  const keyword = db.prepare('SELECT * FROM search_keywords WHERE id = ?').get(keywordId) as any;
  if (!keyword) {
    throw new Error(`Keyword not found: ${keywordId}`);
  }

  // 2. Fetch recent search snapshots
  const searchSnapshots = db.prepare(`
    SELECT ss.*, la.sold_24h, la.views_24h, la.hey_score, la.trend_status, la.trending_score
    FROM search_snapshots ss
    LEFT JOIN listing_analytics la ON la.etsy_listing_id = ss.etsy_listing_id
      AND la.fetched_at = (
        SELECT MAX(fetched_at) FROM listing_analytics WHERE etsy_listing_id = ss.etsy_listing_id
      )
    WHERE ss.keyword_id = ?
      AND ss.crawled_at = (SELECT MAX(crawled_at) FROM search_snapshots WHERE keyword_id = ?)
    ORDER BY ss.position_in_search ASC
    LIMIT 50
  `).all(keywordId, keywordId) as any[];

  // 3. Build prompt
  const hotWatch = searchSnapshots.filter((s: any) => s.trend_status === 'HOT' || s.trend_status === 'WATCH');
  const prices = searchSnapshots.filter((s: any) => s.price != null).map((s: any) => s.price);
  const avgPrice = prices.length > 0 ? (prices.reduce((a: number, b: number) => a + b, 0) / prices.length).toFixed(2) : 'N/A';
  const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : 'N/A';
  const maxPrice = prices.length > 0 ? Math.max(...prices).toFixed(2) : 'N/A';

  const prompt = `
Keyword: "${keyword.keyword}"
Category: ${keyword.category || 'N/A'}
Total results found: ${searchSnapshots.length}

Price range: $${minPrice} - $${maxPrice} (avg: $${avgPrice})

Top listings in search results:
${searchSnapshots.slice(0, 15).map((s: any, i: number) =>
    `${i + 1}. [pos:${s.position_in_search}] "${s.title}" by ${s.shop_name} - $${s.price}${s.trend_status && s.trend_status !== 'SKIP' ? ` [${s.trend_status}]` : ''} | sold_24h: ${s.sold_24h ?? 'N/A'} | hey_score: ${s.hey_score ?? 'N/A'}`
  ).join('\n')}

HOT/WATCH listings count: ${hotWatch.length}

Analyze this keyword/niche and provide:
1. Competition level assessment
2. Top sellers dominating this keyword
3. Price strategy recommendations
4. Trend direction (growing, stable, declining)
5. Opportunities for a new POD seller
`;

  const systemPrompt = 'You are an expert Etsy keyword and niche analyst for Print on Demand. Analyze the search data and provide actionable insights. Focus on competition level, pricing strategy, and entry opportunities. Format with sections: Competition Analysis, Top Sellers, Pricing, Trend Direction, Opportunities.';

  logger.info(`Analyzing keyword ${keywordId} ("${keyword.keyword}") with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);

  // Save insight
  const dataContext = JSON.stringify({
    keywordId,
    snapshotCount: searchSnapshots.length,
    hotWatchCount: hotWatch.length,
  });

  const result = db.prepare(`
    INSERT INTO ai_insights (insight_type, keyword_id, content, data_context, model_used)
    VALUES (?, ?, ?, ?, ?)
  `).run('keyword_suggestion', keywordId, content, dataContext, config.model);

  const insight = db.prepare('SELECT * FROM ai_insights WHERE id = ?').get(result.lastInsertRowid) as AIInsight;
  logger.info(`Saved AI insight ${insight.id} for keyword ${keywordId}`);

  return insight;
}

export async function suggestKeywords(
  db: Database.Database,
  seed: string,
  existingTags: string[]
): Promise<string[]> {
  const config = getAIConfig(db);

  const prompt = `Given the seed keyword '${seed}' for Etsy POD (Print on Demand), suggest 10 related keywords that are specific enough for niche targeting. These should be search terms a buyer would use on Etsy.

Existing tags to consider (avoid duplicates): ${existingTags.join(', ')}

Return ONLY a JSON array of strings, nothing else. Example: ["keyword one", "keyword two"]`;

  const systemPrompt = 'You are an Etsy keyword research expert. Return only valid JSON arrays of keyword strings. No explanations.';

  logger.info(`Suggesting keywords for seed "${seed}" with ${config.provider}/${config.model}`);
  const content = await callAPI(prompt, systemPrompt, config.provider, config.apiKey, config.model);

  // Parse JSON array from response
  let suggestions: string[];
  try {
    // Extract JSON array from response (handle cases where model adds extra text)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    suggestions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(suggestions)) {
      throw new Error('Response is not an array');
    }
    suggestions = suggestions.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim().toLowerCase());
  } catch (parseErr) {
    logger.error(`Failed to parse AI keyword suggestions: ${parseErr}`);
    throw new Error('Failed to parse AI response as keyword list');
  }

  // Filter out keywords that already exist in search_keywords table
  const existingKeywords = db.prepare(
    `SELECT keyword FROM search_keywords WHERE keyword IN (${suggestions.map(() => '?').join(',')})`
  ).all(...suggestions) as { keyword: string }[];

  const existingSet = new Set(existingKeywords.map((k) => k.keyword.toLowerCase()));
  const filtered = suggestions.filter((s) => !existingSet.has(s));

  logger.info(`AI suggested ${suggestions.length} keywords, ${filtered.length} are new`);
  return filtered;
}

export async function testConnection(
  provider: string,
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await callAPI(
      'Say "OK" and nothing else.',
      'You are a test assistant. Respond with exactly "OK".',
      provider,
      apiKey,
      model
    );
    if (response && response.length > 0) {
      return { success: true };
    }
    return { success: false, error: 'Empty response from API' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
