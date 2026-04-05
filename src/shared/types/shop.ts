export type ShopPriority = 'low' | 'normal' | 'high';
export type ShopStatus = 'active' | 'paused' | 'archived';

export interface Shop {
  id: number;
  shop_name: string;
  shop_url: string;
  priority: ShopPriority;
  crawl_interval_minutes: number;
  notes: string | null;
  status: ShopStatus;
  created_at: string;
  updated_at: string;
}

export interface ShopSnapshot {
  id: number;
  shop_id: number;
  total_listings: number | null;
  total_sales: number | null;
  total_reviews: number | null;
  total_admirers: number | null;
  shop_banner_url: string | null;
  shop_avatar_url: string | null;
  shop_description: string | null;
  crawled_at: string;
  crawl_job_id: number | null;
  raw_html_path: string | null;
}

export interface ShopWithLatest extends Shop {
  latest_snapshot: ShopSnapshot | null;
  listing_count: number;
}
