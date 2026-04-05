import type { ListingAnalytics } from './analytics.js';

export type ListingStatus = 'active' | 'disappeared' | 'archived';

export interface Listing {
  id: number;
  shop_id: number;
  etsy_listing_id: string;
  first_seen_at: string;
  last_seen_at: string;
  status: ListingStatus;
  notes: string | null;
}

export interface ListingSnapshot {
  id: number;
  listing_id: number;
  shop_id: number;
  title: string | null;
  price: number | null;
  sale_price: number | null;
  currency: string;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
  is_bestseller: number;
  is_ad: number;
  is_free_shipping: number;
  shipping_info: string | null;
  position_in_shop: number | null;
  tags_visible: string | null;
  crawled_at: string;
  crawl_job_id: number | null;
}

export interface ListingWithAnalytics extends Listing {
  latest_analytics: ListingAnalytics | null;
  latest_snapshot: ListingSnapshot | null;
}
