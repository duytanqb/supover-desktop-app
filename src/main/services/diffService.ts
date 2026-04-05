/**
 * Diff Service — compare snapshots and analytics to detect changes
 *
 * Reference: docs/phase-3-intelligence.md
 */

export interface DiffChange {
  type: string;
  // new_listing | disappeared | price_change | title_change
  // | review_spike | bestseller_change | image_change
  // | trending_new_hot | trending_status_change | trending_velocity_spike
  listingId?: number;
  etsyListingId?: string;
  shopId?: number;
  keywordId?: number;
  oldValue?: string;
  newValue?: string;
  severity: 'info' | 'warning' | 'important';
}

export interface SnapshotRecord {
  listing_id?: number;
  etsy_listing_id: string;
  title?: string;
  price?: number;
  image_url?: string;
  review_count?: number;
  is_bestseller?: number;
  [key: string]: unknown;
}

export interface AnalyticsRecord {
  etsy_listing_id: string;
  listing_id?: number;
  trend_status: string;
  sold_24h: number;
  trending_score?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Diff shop/search snapshots
// ---------------------------------------------------------------------------

export function diffShopSnapshots(oldSnapshots: SnapshotRecord[], newSnapshots: SnapshotRecord[]): DiffChange[] {
  const changes: DiffChange[] = [];
  const oldMap = new Map(oldSnapshots.map(s => [s.etsy_listing_id, s]));
  const newMap = new Map(newSnapshots.map(s => [s.etsy_listing_id, s]));

  // New listings: in new but not old
  for (const [id, snap] of newMap) {
    if (!oldMap.has(id)) {
      changes.push({
        type: 'new_listing',
        etsyListingId: id,
        listingId: snap.listing_id,
        severity: 'info',
      });
    }
  }

  // Disappeared: in old but not new
  for (const [id, snap] of oldMap) {
    if (!newMap.has(id)) {
      changes.push({
        type: 'disappeared',
        etsyListingId: id,
        listingId: snap.listing_id,
        severity: 'warning',
      });
    }
  }

  // Changed listings: compare fields
  for (const [id, newSnap] of newMap) {
    const oldSnap = oldMap.get(id);
    if (!oldSnap) continue;

    // Price change (> 1% difference)
    if (
      oldSnap.price != null &&
      newSnap.price != null &&
      oldSnap.price > 0 &&
      Math.abs(newSnap.price - oldSnap.price) / oldSnap.price > 0.01
    ) {
      changes.push({
        type: 'price_change',
        etsyListingId: id,
        listingId: newSnap.listing_id,
        oldValue: String(oldSnap.price),
        newValue: String(newSnap.price),
        severity: 'info',
      });
    }

    // Title change
    if (oldSnap.title && newSnap.title && oldSnap.title !== newSnap.title) {
      changes.push({
        type: 'title_change',
        etsyListingId: id,
        listingId: newSnap.listing_id,
        oldValue: oldSnap.title,
        newValue: newSnap.title,
        severity: 'info',
      });
    }

    // Review spike: review_count increased > 20%
    if (
      oldSnap.review_count != null &&
      newSnap.review_count != null &&
      oldSnap.review_count > 0 &&
      (newSnap.review_count - oldSnap.review_count) / oldSnap.review_count > 0.20
    ) {
      changes.push({
        type: 'review_spike',
        etsyListingId: id,
        listingId: newSnap.listing_id,
        oldValue: String(oldSnap.review_count),
        newValue: String(newSnap.review_count),
        severity: 'warning',
      });
    }

    // Bestseller change
    if (oldSnap.is_bestseller !== newSnap.is_bestseller) {
      changes.push({
        type: 'bestseller_change',
        etsyListingId: id,
        listingId: newSnap.listing_id,
        oldValue: String(oldSnap.is_bestseller ?? 0),
        newValue: String(newSnap.is_bestseller ?? 0),
        severity: 'important',
      });
    }

    // Image change
    if (oldSnap.image_url && newSnap.image_url && oldSnap.image_url !== newSnap.image_url) {
      changes.push({
        type: 'image_change',
        etsyListingId: id,
        listingId: newSnap.listing_id,
        oldValue: oldSnap.image_url,
        newValue: newSnap.image_url,
        severity: 'info',
      });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Diff analytics (trend changes)
// ---------------------------------------------------------------------------

export function diffAnalytics(oldAnalytics: AnalyticsRecord[], newAnalytics: AnalyticsRecord[]): DiffChange[] {
  const changes: DiffChange[] = [];
  const oldMap = new Map(oldAnalytics.map(a => [a.etsy_listing_id, a]));

  for (const newA of newAnalytics) {
    const oldA = oldMap.get(newA.etsy_listing_id);

    // New HOT: was not present or was not HOT, now HOT
    if (!oldA && newA.trend_status === 'HOT') {
      changes.push({
        type: 'trending_new_hot',
        etsyListingId: newA.etsy_listing_id,
        listingId: newA.listing_id,
        newValue: 'HOT',
        severity: 'important',
      });
      continue;
    }

    if (!oldA) continue;

    // Trend status change (only if new status is not SKIP — we don't alert on downgrades to SKIP)
    if (oldA.trend_status !== newA.trend_status && newA.trend_status !== 'SKIP') {
      changes.push({
        type: 'trending_status_change',
        etsyListingId: newA.etsy_listing_id,
        listingId: newA.listing_id,
        oldValue: oldA.trend_status,
        newValue: newA.trend_status,
        severity: 'warning',
      });
    }

    // Velocity spike: sold_24h doubled AND >= 3
    if (oldA.sold_24h > 0 && newA.sold_24h >= oldA.sold_24h * 2 && newA.sold_24h >= 3) {
      changes.push({
        type: 'trending_velocity_spike',
        etsyListingId: newA.etsy_listing_id,
        listingId: newA.listing_id,
        oldValue: String(oldA.sold_24h),
        newValue: String(newA.sold_24h),
        severity: 'important',
      });
    }
  }

  return changes;
}
