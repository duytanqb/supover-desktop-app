import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * VK1ng API Service — HeyEtsy analytics data
 *
 * Reference: reference/etsy-spy/scripts/etsy_analytics.py
 */

export interface VkingConfig {
  baseUrl: string;
  apiKey: string;
  batchSize: number;
}

export interface VkingListingData {
  listing_id: string;
  sold: number;
  views_24h: number;
  hey: number;
  original_creation_days: number;
  total_sold: number;
  estimated_revenue: string;
  cr: number;
  num_favorers: number;
  daily_views: number;
  views: number;
  tags: string;
  categories: string;
  shop_country: string;
  shop_sold: number;
  original_creation: string;
  last_modified: string;
  [key: string]: unknown;
}

export interface VkingSubscriptionStatus {
  valid: boolean;
  plan?: string;
  remaining?: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getVkingConfig(db: Database.Database): VkingConfig {
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

  const baseUrl = (getSetting.get('vking_base_url') as { value: string } | undefined)?.value ?? 'https://vk1ng.com/api';
  const apiKey = (getSetting.get('vking_api_key') as { value: string } | undefined)?.value ?? '';
  const batchSize = parseInt(
    (getSetting.get('vking_bulk_batch_size') as { value: string } | undefined)?.value ?? '50',
    10,
  );

  return { baseUrl, apiKey, batchSize };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries: number = 2,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

      if (resp.status === 401) {
        throw new Error('Invalid API key');
      }

      if (resp.status === 429) {
        // Exponential backoff
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        logger.warn(`VK1ng rate limited (429), waiting ${delay}ms before retry`, { attempt });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!resp.ok) {
        throw new Error(`VK1ng API error: ${resp.status} ${resp.statusText}`);
      }

      return resp;
    } catch (error) {
      lastError = error as Error;
      if ((error as Error).message === 'Invalid API key') {
        throw error;
      }
      // Network error — retry once
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`VK1ng request failed, retrying in ${delay}ms`, { url, error: (error as Error).message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('VK1ng request failed after retries');
}

// ---------------------------------------------------------------------------
// Single listing
// ---------------------------------------------------------------------------

export async function getListing(db: Database.Database, listingId: string): Promise<VkingListingData | null> {
  const { baseUrl, apiKey } = getVkingConfig(db);
  if (!apiKey) throw new Error('VK1ng API key not configured');

  const url = `${baseUrl}/listings/${listingId}`;
  const resp = await fetchWithRetry(url, { Authorization: `Bearer ${apiKey}` });
  const body = await resp.json() as { status: boolean; data?: VkingListingData };

  if (body.status && body.data) {
    logger.info('VK1ng getListing success', { listingId });
    return body.data;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Bulk listings — auto batch max batchSize per request
// ---------------------------------------------------------------------------

export async function getBulkListings(db: Database.Database, listingIds: string[]): Promise<VkingListingData[]> {
  if (listingIds.length === 0) return [];

  const { baseUrl, apiKey, batchSize } = getVkingConfig(db);
  if (!apiKey) throw new Error('VK1ng API key not configured');

  const results: VkingListingData[] = [];

  for (let i = 0; i < listingIds.length; i += batchSize) {
    const batch = listingIds.slice(i, i + batchSize);
    const idsStr = batch.join(',');
    const url = `${baseUrl}/bulk/listings/${idsStr}`;

    try {
      const resp = await fetchWithRetry(url, { Authorization: `Bearer ${apiKey}` });
      const body = await resp.json() as { status: boolean; data?: VkingListingData[] };

      if (body.status && body.data) {
        results.push(...body.data);
      }

      logger.info('VK1ng bulk batch fetched', { batchIndex: i / batchSize, batchSize: batch.length, returned: body.data?.length ?? 0 });
    } catch (error) {
      logger.error('VK1ng bulk batch failed', { batchIndex: i / batchSize, error: (error as Error).message });
      throw error;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Check subscription
// ---------------------------------------------------------------------------

export async function checkSubscription(db: Database.Database): Promise<VkingSubscriptionStatus> {
  const { baseUrl, apiKey } = getVkingConfig(db);
  if (!apiKey) return { valid: false };

  try {
    const url = `${baseUrl}/me`;
    const resp = await fetchWithRetry(url, { Authorization: `Bearer ${apiKey}` });
    const body = await resp.json() as Record<string, unknown>;

    return {
      valid: true,
      plan: body.plan as string | undefined,
      remaining: body.remaining as number | undefined,
    };
  } catch (error) {
    if ((error as Error).message === 'Invalid API key') {
      return { valid: false };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Filter IDs not in listing_analytics within last cacheHours
// ---------------------------------------------------------------------------

export function filterNewIds(db: Database.Database, listingIds: string[], cacheHours: number): string[] {
  if (listingIds.length === 0) return [];

  // Build query with placeholders
  const placeholders = listingIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT etsy_listing_id
    FROM listing_analytics
    WHERE etsy_listing_id IN (${placeholders})
      AND fetched_at > datetime('now', '-' || ? || ' hours')
  `);

  const cachedRows = stmt.all(...listingIds, cacheHours) as { etsy_listing_id: string }[];
  const cachedSet = new Set(cachedRows.map(r => r.etsy_listing_id));

  return listingIds.filter(id => !cachedSet.has(id));
}
